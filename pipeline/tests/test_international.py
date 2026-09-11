import json

import httpx
import pytest

from anthrion_signal.collectors import Http, RawRecord, collect_ted, collect_usaspending, collect_grants
from anthrion_signal.normalise import normalise_ted, normalise_usaspending, normalise_grants


def source(config, ident):
    return next(s for s in config['sources']['sources'] if s['id'] == ident)


def raw(config, now, ident, data):
    return RawRecord(data, source(config, ident), now.isoformat(), ident)


def ted_notice(**changes):
    return {'publication-number': '123456-2026', 'title-proc': {'eng': 'CRM delivery'},
            'description-proc': {'eng': 'Salesforce implementation'}, 'description-lot': {'eng': ['Integration services']},
            'buyer-name': {'eng': ['City buyer']}, 'buyer-country': ['ISL'], 'place-of-performance': ['DEU'],
            'form-type': 'competition', 'notice-type': 'cn-standard', 'publication-date': '2026-09-08+02:00',
            'deadline-receipt-tender-date-lot': ['2026-10-06+02:00'],
            'deadline-receipt-tender-time-lot': ['10:00:00+02:00'],
            'estimated-value-proc': '240000', 'estimated-value-cur-proc': 'ISK', 'classification-cpv': ['72200000'], **changes}


def test_ted_keeps_buyer_jurisdiction_description_currency_and_exact_single_deadline(config, now):
    s = normalise_ted(raw(config, now, 'ted', ted_notice()))
    assert s.countries == ['IS']
    assert 'Salesforce' in s.description and 'Integration' in s.description
    assert s.value_max == 240000 and s.currency == 'ISK'
    assert s.deadline_at == '2026-10-06T08:00:00+00:00'
    assert s.signal_type == 'LIVE_TENDER'


@pytest.mark.parametrize('form,stage', [('result', 'award'), ('planning', 'planning'), ('dir-awa-pre', 'planning'), ('change', 'unknown')])
def test_ted_notice_families_are_not_all_open_tenders(config, now, form, stage):
    s = normalise_ted(raw(config, now, 'ted', ted_notice(**{'form-type': form})))
    assert s.procurement_stage == stage
    assert s.signal_type != 'LIVE_TENDER'


def test_ted_multiple_lots_do_not_guess_time_pairing_or_mixed_currency(config, now):
    s = normalise_ted(raw(config, now, 'ted', ted_notice(**{'form-type': 'result', 'total-value': 800,
        'total-value-cur': ['EUR', 'NOK'], 'deadline-receipt-tender-date-lot': ['2026-10-06+02:00', '2026-10-07+02:00'],
        'deadline-receipt-tender-time-lot': ['10:00:00+02:00', '14:00:00+02:00']})))
    assert s.currency is None and s.value_max == 800
    assert 'Multiple lot deadlines' in s.eligibility_text
    assert s.deadline_at == '2026-10-05T22:00:00+00:00'


def test_ted_iteration_exhaustion_and_country_query(config, now):
    requests = []
    def handler(req):
        requests.append(json.loads(req.content))
        return httpx.Response(200, json={'notices': [ted_notice()] if len(requests) == 1 else [],
                                        'iterationNextToken': 'next' if len(requests) == 1 else None})
    http = Http(transport=httpx.MockTransport(handler), sleeper=lambda _: None)
    result = collect_ted(source(config, 'ted'), {}, now, http, config['runtime'], config['search_terms'])
    assert result.complete and len(result.records) == 1
    assert result.state['watermark'] == now.isoformat()
    assert 'buyer-country' in requests[0]['query'] and 'ISL' in requests[0]['query']
    assert 'GBR' not in requests[0]['query']
    assert requests[1]['iterationNextToken'] == 'next'


@pytest.mark.parametrize('body', [{'error': 'bad'}, {'notices': [], 'timedOut': True}])
def test_ted_bad_responses_do_not_commit_checkpoint(config, now, body):
    http = Http(transport=httpx.MockTransport(lambda _: httpx.Response(200, json=body)), sleeper=lambda _: None)
    state = {'watermark': '2026-09-01T00:00:00+00:00'}
    result = collect_ted(source(config, 'ted'), state, now, http, config['runtime'], config['search_terms'])
    assert not result.complete and result.state == state


def award():
    return {'generated_internal_id': 'CONT_AWD_TEST_001', 'Award ID': '001', 'Description': 'Salesforce delivery',
            'Awarding Agency': 'Federal buyer', 'Recipient Name': 'Supplier', 'Award Amount': 250000,
            'Start Date': '2026-09-01', 'End Date': '2027-03-31', 'Last Modified Date': '2026-09-08 10:00:00'}


def test_us_awards_never_masquerade_as_open_tenders(config, now):
    s = normalise_usaspending(raw(config, now, 'usaspending', award()))
    assert s.signal_type == 'AWARD' and s.status == 'awarded'
    assert s.deadline_at is None and s.published_at is None
    assert s.currency == 'USD' and s.countries == ['US'] and s.incumbent_supplier == 'Supplier'
    assert s.primary_source_url.endswith('CONT_AWD_TEST_001')


@pytest.mark.parametrize('body', [{'results': []}, {'results': [], 'page_metadata': {'hasNext': True}}])
def test_us_award_invalid_pages_do_not_advance(config, now, body):
    http = Http(transport=httpx.MockTransport(lambda _: httpx.Response(200, json=body)), sleeper=lambda _: None)
    result = collect_usaspending(source(config, 'usaspending'), {}, now, http, config['runtime'], {})
    assert not result.complete and 'watermark' not in result.state


def test_us_award_page_budget_retains_successful_records(config, now):
    http = Http(transport=httpx.MockTransport(lambda _: httpx.Response(200,
        json={'results': [award()], 'page_metadata': {'hasNext': True}})), sleeper=lambda _: None)
    result = collect_usaspending(source(config, 'usaspending'), {}, now, http, {**config['runtime'], 'max_pages': 1}, {})
    assert not result.complete and len(result.records) == 1 and 'watermark' not in result.state


def test_grants_closed_records_and_eligibility(config, now):
    s = normalise_grants(raw(config, now, 'grants', {'id': '123', 'title': 'AI research', 'status': 'closed',
        'closeDate': '10/09/2026', 'facts': {'synopsisDesc': '<p>Artificial intelligence research</p>',
            'awardFloor': '1000', 'awardCeiling': '5000', 'applicantEligibilityDesc': 'US universities only'}}))
    assert s.signal_type == 'FUNDING' and s.status == 'complete' and s.procurement_stage != 'tender'
    assert s.deadline_at.startswith('2026-10-09') and s.value_max == 5000 and s.currency == 'USD'
    assert s.eligibility_text == 'US universities only'


def test_grants_rechecks_previous_active_and_does_not_publish_tokens(config, now):
    def handler(req):
        if req.url.path.endswith('search2'):
            return httpx.Response(200, json={'errorcode': 0, 'data': {'hitCount': 0, 'oppHits': []}})
        return httpx.Response(200, json={'errorcode': 0, 'token': 'never-store-this',
            'data': {'id': 123, 'opportunityTitle': 'AI research', 'synopsis': {'synopsisDesc': 'Research'}}})
    http = Http(transport=httpx.MockTransport(handler), sleeper=lambda _: None)
    result = collect_grants(source(config, 'grants'), {'active_ids': ['123']}, now, http, config['runtime'], {})
    assert result.complete and result.state['active_ids'] == []
    assert result.records[0].data['status'] == 'closed'
    assert 'never-store-this' not in str(result.records)


def test_grants_partial_detail_retains_checkpoint(config, now):
    def handler(req):
        data = {'hitCount': 1, 'oppHits': [{'id': '123', 'oppStatus': 'posted'}]} if req.url.path.endswith('search2') else {}
        return httpx.Response(200, json={'errorcode': 0, 'data': data})
    http = Http(transport=httpx.MockTransport(handler), sleeper=lambda _: None)
    result = collect_grants(source(config, 'grants'), {}, now, http, config['runtime'], {})
    assert not result.complete and 'watermark' not in result.state
