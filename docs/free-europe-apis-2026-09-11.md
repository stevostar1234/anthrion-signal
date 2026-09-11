# Free European Procurement Data

## Decision

Germany's official Bekanntmachungsservice is the strongest immediately usable addition to the existing TED collection. Its daily, anonymous Open Data endpoint was verified against real paired OCDS and eForms exports. A bounded, resumable adapter and focused tests have been implemented locally. Spain's national PLACSP syndication feed is also accessible without credentials; its bounded lifecycle/pagination adapter was added during the follow-on implementation described at the end of this report. Its stale source timestamp and timezone-free deadlines remain explicit limitations.

Finland's Hilma AVP API is explicitly free for commercial use but needs an account and subscription key. Greece's documented open-read API is free, but a bounded live search timed out. Denmark and Norway have official API access routes; their current production access conditions were not sufficiently verified to enable a connector. Sweden's national open statistical datasets and several Italian open datasets must not be mistaken for current, actionable bid feeds.

This assessment is current to 11 September 2026. It distinguishes documented access, observed endpoint behavior, and implemented integration. It does not claim that every local procurement portal in Europe has been discovered, or that every candidate notice represents work Anthrion can bid for.

## Coverage Matrix

| Market / Source | Access and Added Coverage | Verification | Decision |
|---|---|---|---|
| Germany: Bekanntmachungsservice | No key in the documented export API; CC0; includes national notices as well as EU notices | Official schema and one full day of all three export formats returned HTTP 200 | Implemented adapter; recommended for local collection |
| Spain: PLACSP, syndication 643 | Public Atom/CODICE feed; national contracting profiles, excluding minor contracts | Feed returned HTTP 200; explicit lifecycle codes, pages and stale head timestamp verified | Bounded adapter implemented; partial source freshness |
| Greece: KIMDIS Open Data | Free open-read API, CC BY 4.0; national invitations/notices with separate award and contract resources | Official help specifies 350 requests/minute; one read-only notice search timed out at 40 seconds | Keep disabled until a successful data probe and lifecycle tests |
| Finland: Hilma AVP-Read | Officially free, commercial reuse permitted; self-service subscription key | Operator's current developer portal confirms terms and access prerequisites | Strong addition after user-managed registration |
| Norway: Doffin | National notices beyond TED; DF0 confirms public eForms data API | Operator documents confirm API existence; production authentication and limits not verified | Do not enable an undocumented browser API |
| Denmark: udbud.dk | Official API access offered to system providers; expected purchasing and below-threshold notices are important | Operator's help identifies API access, but a complete read API contract was not obtained | Confirm access, charges, scope, and production schema first |
| Sweden: UHM open data | Free official data, principally procurement statistics; national tender announcements are distributed across registered databases | Official publishing guidance and statistical publication calendar reviewed | Not a substitute for a current tender feed |
| Italy: ANAC BDNCP / legal-publicity platform | Public contract lifecycle records; infrastructure APIs also exist for certified procurement platforms | Official ANAC documentation distinguishes public browsing from certified-system interoperability | Do not confuse submission/interoperability APIs with an anonymous search API |
| Italy: Consip open data | CKAN catalog of procurement initiatives and ASP tenders, with JSON/CSV exports | Official catalog found; its reference-period semantics and publication freshness require validation | Candidate supplement, not yet a verified live connector |
| Spain: Catalonia procurement plans | Annual prospective procurement dataset with machine-readable exports | Official catalog identifies annual update frequency and non-binding forecasts | Useful future-pipeline research; not automatically an open bid |
| Germany: old Vergabe.NRW API | Historical official REST documentation | The documented host failed DNS resolution in a bounded probe | Do not enable the old endpoint |
| Iceland: national-only notices | TED remains the verified existing channel | No independently verified new free national read API established in this assessment | Coverage gap remains explicit |

References and access qualifications are detailed below. API access does not establish eligibility to bid: geography, language, frameworks, consortium restrictions, and actual submission rules still come from the notice.

## Germany

### Official Contract

The documented endpoint is `GET https://oeffentlichevergabe.de/api/notice-exports`. It accepts either `pubDay=YYYY-MM-DD` or `pubMonth=YYYY-MM`, not both. `format` supports `ocds.zip`, `eforms.zip`, and `csv.zip`. The export contains versions published in the requested Europe/Berlin calendar period; only completed publication days are available. The schema does not declare an authentication requirement. The publication policy assigns CC0 to the Open Data. The operator also explicitly describes below-EU-threshold notices, whose fields can be less structured than EU eForms. [1][2][3]

No numerical public rate limit was found in these official pages. That is not a promise of unlimited capacity. The implementation uses small daily downloads and the existing shared retry/backoff behavior; it does not query an undocumented search endpoint or disable TLS verification.

### Observed Export

A live probe for 9 September 2026 returned:

| Format | Compressed Bytes | Notice Files |
|---|---:|---:|
| OCDS | 1,935,557 | 1,094 |
| Original eForms | 4,448,682 | 1,094 |

The paired archives contain two different identifier families: UUID notices and numeric national notices. A UUID-only parser would silently lose or reject the national component. The adapter accepts both, while only UUID identifiers become TED notice aliases.

The OCDS representation omitted submission deadlines that were present in original eForms. The CSV export also did not provide the required submission cutoff in the inspected example. The collector therefore requests the OCDS and original eForms pair, not OCDS alone. It checks that the same notice-version filenames exist in both formats before accepting a day.

An offline replay of the complete observed pair parsed every notice. With a broad software/IT/consultancy CPV and CRM keyword screen, 46 non-award notices were retained: 37 tender records and 9 framework records. Sixteen had national numeric identifiers. Forty-four of the 46 had recoverable response deadlines. These are adapter candidates, not deduplicated new Anthrion leads and not guaranteed Salesforce-fit opportunities. Some were already past their deadline by the time of review and must be removed by the availability gate.

Examples of genuinely useful national coverage included a specialist application for a building-management department, a municipal data/information portal, and a learning-management system. The broad screen also retained endpoint management, licensing, and other IT notices. Their appearance demonstrates why collection breadth and sales qualification must remain separate.

For safe lifecycle handling, all 401 result/retirement records in the same day are retained internally regardless of keyword matches. They are not sales-feed records. Dropping an award because it lacks the older competition's keywords can resurrect that competition during latest-first backfill. The publication gate must continue to suppress terminal records.

### Implemented Files

- `pipeline/anthrion_signal/german_notices.py`
- `pipeline/tests/test_german_notices.py`

The adapter stores a pending-day queue, schedules newest completed days first, and resumes older pending days within a fixed request budget. A day advances only after both export formats validate. A failed format pair publishes no partial records for that day. By default a run processes at most three days, using two requests per day, and also respects the shared `max_pages` budget.

Original procedure OCIDs remain intact. Release IDs are qualified by notice version. The human-readable German notice URL is added as a notice document. Where the eForms XML references a previous UUID notice, the normalizer retains that reference alongside the current UUID as a `ted-notice:` alias. These exact identifiers allow the existing reconciliation layer to connect German and TED versions without relying only on translated titles. Numeric national IDs are never claimed to be TED IDs.

Earliest known lot cutoff is used conservatively for an aggregate signal; individual lot cutoffs remain in the raw enriched record. Different lot deadlines are flagged as such in source-derived eligibility text. The adapter deliberately does not split lots into separately published signals because same-OCID reconciliation currently operates at procedure level. Some national notices have no machine-readable deadline in either format; the adapter does not invent one.

Archives remain in memory and are never extracted into the workspace. Compressed size, total expanded size, individual file size, path shape, filename uniqueness, format pairing, identifiers, and XML declarations are validated. Source data cannot cause path traversal or external XML entity retrieval.

### Registration Instructions

Add a lazy wrapper in `collectors.py`, then register it as `german_daily`. The lazy import avoids circular imports while retaining the existing `Collection`, `Http`, and `RawRecord` contracts:

```python
def collect_germany(source, state, frozen, http, settings, terms):
    from .german_notices import collect_german_notices
    return collect_german_notices(source, state, frozen, http, settings, terms)
```

The returned raw kind is `german_ocds`. Dispatch that kind to a lazy import of `normalise_german_notice(raw, prior)` in the normalizer. It delegates ordinary field handling to `normalise_ocds` and adds exact notice aliases. Do not dispatch it directly to `normalise_ocds` or the TED aliases will be lost.

Suggested source configuration:

```yaml
- id: germany
  name: German Procurement Notices
  enabled: true
  collector: german_daily
  source_type: official_notice
  url: https://oeffentlichevergabe.de/api/notice-exports
  website: https://oeffentlichevergabe.de
  docs: https://oeffentlichevergabe.de/documentation/swagger-ui/opendata/index.html
  record_url: https://oeffentlichevergabe.de/ui/de/notices/{ocid}
  initial_lookback_days: 7
  max_days_per_run: 3
  country: DE
  coverage: German national and EU procurement notices; some national notice fields are incomplete.
```

No separate generic backfill lane is necessary because the collector owns its completed-day queue. Do not include it in the existing generic historical-source allowlist without adapting that contract.

Fifteen focused tests pass. They cover deadline/offset recovery, framework classification, numeric national IDs, exact source/notice aliases, notice versions, conservative multi-lot deadlines, terminal XML overriding an incomplete competition tag, retirement evidence, bounded requests, resumption, failed format pairs, malicious archive paths, invalid XML, and submission-portal false matches. Ruff passes for both files.

### Budget

Once caught up, one completed day requires two source API calls. Daily collection therefore costs approximately 60 calls in a 30-day month or 62 in a 31-day month, before retries. A seven-day initial backfill requires fourteen calls. The observed pair was approximately 6.4 MB; that is a sample, not a fixed daily payload guarantee.

These outbound requests are not GitHub Actions billable API units. GitHub Actions capacity is accounted for separately in runner time and storage. Repeating monthly bulk archives every day would waste both network bandwidth and runner time; completed-day checkpoints avoid that.

## Spain

The Ministry of Finance's official dataset describes national contracting profiles on PLACSP, excluding minor contracts. The current feed is public Atom XML with CODICE fields. Monthly/yearly ZIP archives exist, with current-month data updated through the preceding day. The syndication mechanism links newer and older pages, including corrections and deletions. [4][5]

A bounded request to `https://contrataciondelsectorpublico.gob.es/sindicacion/sindicacion_643/licitacionesPerfilesContratanteCompleto3.atom` returned HTTP 200 without credentials. The response's feed-update timestamp was 8 September 2026. A successful HTTP response must therefore not be reported as proof that every notice is current through 11 September. Its links still use the older official `contrataciondelestado.es` hostname; an eventual adapter needs an explicit allowlist for both official hosts rather than following arbitrary pagination URLs.

The observed data included persistent entry identifiers, buyer details, contract-folder IDs, titles, costs, and an `ADJ` award state. A production adapter should consume the complete state history, not interpret every feed entry as a new tender. It must validate the official status vocabulary, exclude awards and closed/withdrawn procedures, apply tombstones, recover exact deadlines, retain notice links, and checkpoint pages safely. Existing TED duplicates should be joined by identifiers where available, not title alone.

PLACSP was selected for follow-on integration because national notices can extend coverage beyond TED. The implementation and live validation are documented below. No numeric source rate limit was verified; polling is bounded, sequential, and conditional where supported.

Catalonia's annual procurement-plan dataset is a separate possible early-pipeline supplement, not a substitute for PLACSP. Its official catalog explicitly says the plans are non-binding and publishes an annual update frequency. It must not be presented as evidence that bids are currently being accepted. [6]

## Greece

KIMDIS documents separate read and submission APIs. The open-data side is free under CC BY 4.0 and supports notice searches via `POST /khmdhs-opendata/notice?page=0`. Its current help lists 350 requests per minute, 180-day date windows, modification/cancellation handling, final submission dates, and related procurement IDs. Credentials described for submission operations must not be confused with open-read access. [7]

One read-only search for a two-day publication range and software CPVs timed out after 40 seconds. No data result was verified, no endpoint was enabled, and no attempt was made to bypass protection or turn off certificate validation. Before integration, verify the production response, assess the `assignedContract` and cancellation fields, link follow-on award/contract records, and retain required source attribution. A notice-only collector would be incomplete if it never checked later awards.

## Nordics

Hilma's operator states that AVP-Read is free, permits commercial use, and becomes available after self-service subscription. Requests are limited per API key, and the API is intended for server-side use rather than browser CORS access. This is a strong national Finnish addition once an account holder accepts its terms and stores the key in local/environment secrets. No registration was performed and no key was requested in chat. The exact numerical subscription quota remains unverified. [8]

DF0 confirms that Doffin eForms data is exposed to the public via API, and Doffin's public service covers national procurement. However, third-party descriptions disagree about anonymous versus keyed access. This assessment relies on the operator's sources and does not resolve that discrepancy by assuming either description is correct. Production schema, read-access terms, and quota must be confirmed before wiring a Doffin connector. [9]

Udbud.dk's operator explicitly offers API access to system providers, and its help covers expected purchases and below-threshold notices. That makes it a material Danish lead, but it is not sufficient evidence to claim an unrestricted anonymous API. The current production contract and commercial-reuse conditions still need confirmation. [10]

Sweden's operator explains that tender publication occurs in registered announcement databases, with above-threshold notices also generally appearing in TED. UHM's open-data program and published datasets largely support statistics. A delayed annual dataset is not an appropriate source of active opportunities; an agreement with a registered publication service or another verified current export would be needed for comprehensive national-only coverage. [11][12]

No new free national Icelandic read endpoint was independently verified. Existing TED coverage should remain accurately described, not relabelled comprehensive Nordic coverage.

## Italy and Regional Gaps

ANAC provides public access to BDNCP lifecycle information, while its digital procurement infrastructure also exposes interoperability services for certified platforms. These are different access products. A successful public search page, an OCDS historical download, or an API for certified tender submission is not proof of a freely reusable, current discovery API. A reliable Italian addition needs an observed query route with open/closed status, deadline, CIG/procedure identifiers, and update behavior. [13][14]

Consip's official CKAN catalog is a useful follow-up: it lists JSON/CSV datasets for program tenders and ASP tenders. The catalog's description is tied to a reference period, so an item described as not completed during that period cannot automatically be treated as open today. Inspect actual data timestamps, participation deadlines, and whether framework admission is still possible before using it in the sales feed. [15]

The old official NRW REST documentation describes search and detail endpoints, but its documented hostname did not resolve during the probe. It has not been enabled. A new regional feed should only be added after verifying its current endpoint and measuring extra coverage over Germany's national service. [16]

## Cross-Market Refiners

The most portable views are all available opportunities, active competitions, early engagement/planning, and closing soon when a real deadline is present. Saved opportunities and newly discovered records are application-level views that also work independently of national form names.

Frameworks are useful only where the source confirms an opportunity to join or bid; an already-awarded closed supplier panel is not an opportunity. Funding is a distinct opportunity type and should remain separate from tenders. Country-specific form codes should be normalized into these categories; missing fields must remain unknown rather than being guessed from a portal label. A broad feed can be comprehensive without manufacturing a fit score or implying universal eligibility.

## Sources

1. Bekanntmachungsservice, [Open Data API schema](https://oeffentlichevergabe.de/documentation/api/opendata), accessed 11 September 2026. Documented format, period, and response contract; live export probes described above.
2. Bekanntmachungsservice, [Open Data publication policy](https://oeffentlichevergabe.de/ui/de/Open-Data-Richtlinie), accessed 11 September 2026. Open-data scope and CC0 licensing.
3. Bekanntmachungsservice, [Usage instructions](https://oeffentlichevergabe.de/ui/de/nutzungshinweise), accessed 11 September 2026. National/below-threshold coverage and data-quality limitations.
4. Ministerio de Hacienda, [Licitaciones publicadas en los perfiles del contratante](https://www.hacienda.gob.es/es-ES/GobiernoAbierto/Datos%20Abiertos/Paginas/LicitacionesContratante.aspx), accessed 11 September 2026. National dataset, exclusions, official download host, and update cadence.
5. Ministerio de Hacienda, [Mecanismos de Sindicacion](https://www.hacienda.gob.es/DGPatrimonio/plataforma_contratacion/especificacion_mecanismo_sindicacion.pdf), accessed 11 September 2026; and [OpenPLACSP manual v2.2](https://contrataciondelestado.es/datosabiertos/DGPE_PLACSP_OpenPLACSP_v.2.2.pdf), 12 May 2025. Atom/CODICE syndication and chronological page chaining.
6. Datos.gob.es / Generalitat de Catalunya, [Contratacion programada](https://datos.gob.es/es/catalogo/a09002970-contratacion-programada-de-la-generalitat-de-catalunya-y-su-sector-publico), accessed 11 September 2026. Annual prospective dataset and non-binding status.
7. Greek procurement authority, [KIMDIS API help](https://cerpp.eprocurement.gov.gr/khmdhs-opendata/help), accessed 11 September 2026. Free open-read scope, license, quota, search parameters, lifecycle fields, and distinction from authenticated submission operations.
8. Hilma, [Official developer portal](https://hns-hilma-prod-apim.developer.azure-api.net/), accessed 11 September 2026. Free commercial-use AVP access, subscriptions, keys, and rate-limiting qualification.
9. DF0, [Annual report 2024: public procurement](https://www.dfo.no/hovedmal-2-i-2024-offentlig-sektor-gjennomforer-effektive-og-innovative-anskaffelser-som-bidrar-til), and [Doffin](https://www.doffin.no/), accessed 11 September 2026. Operator confirmation of public eForms API and national portal.
10. Udbud.dk, [Help](https://udbud.dk/hjaelp) and [System providers](https://udbud.dk/hjaelp/hjaelpSystemudbydere), accessed 11 September 2026. Official API-access route and purchasing help.
11. Upphandlingsmyndigheten, [Announcing procurement](https://www.upphandlingsmyndigheten.se/inkopsprocessen/genomfor-upphandlingen/annonsera), accessed 11 September 2026. Registered announcement databases and TED publication.
12. Upphandlingsmyndigheten, [Open data](https://www.upphandlingsmyndigheten.se/om-oss/var-oppna-data/) and [Publication calendar](https://www.upphandlingsmyndigheten.se/statistik/publiceringskalender/), accessed 11 September 2026. Reuse conditions and retrospective statistical products.
13. ANAC, [National public contracts database](https://www.anticorruzione.it/-/banca-dati-nazionale-contratti-pubblici), accessed 11 September 2026. Public lifecycle information.
14. ANAC, [Public procurement digitalization](https://www.anticorruzione.it/-/digitalizzazione-contratti-pubblici), accessed 11 September 2026. Certified-platform/PDND interoperability and legal publicity.
15. Consip, [Bandi e Gare dataset catalog](https://dati.consip.it/dataset/?groups=cat-bandi-e-gare), accessed 11 September 2026. Program and ASP datasets, formats, licensing, and reference-period semantics.
16. Open.NRW, [Vergabe.NRW API documentation](https://open.nrw/sites/default/files/opendatafiles/daten-vergabe-nrw-de-Dokumentation-v1.pdf), document dated 7 September 2018, accessed 11 September 2026. Historical endpoint contract; the DNS failure is from the current bounded probe, not asserted as a universal outage.

## Spain Implementation Addendum

The earlier Spain decision above is superseded by this bounded implementation, completed later on 11 September. The adapter is implemented and live-tested locally; its registration and enablement remain a separate integration step. No canonical collection data was changed by the smoke test.

Files:

- `pipeline/anthrion_signal/spain_notices.py`
- `pipeline/tests/test_spain_notices.py`

### Verified Semantics

PLACSP's official states distinguish `PRE` planning, `PUB` accepting submissions, `EV` awaiting award, `ADJ` awarded, `RES` resolved, and `ANUL` cancelled. Atom withdrawals are terminal updates, not missing records to ignore. Permanent entry identifiers provide a native `placsp:` procedure alias. These facts come from the [official status vocabulary](https://contrataciondelestado.es/codice/cl/2.04/SyndicationContractFolderStatusCode-2.04.gc) and [syndication specification](https://www.hacienda.gob.es/DGPatrimonio/plataforma_contratacion/especificacion_mecanismo_sindicacion.pdf).

Framework establishment and DPS establishment differ from contracts placed through an existing panel. The adapter separates these using the [official contracting-system codes](https://contrataciondelestado.es/codice/cl/2.08/ContractingSystemTypeCode-2.08.gc) and [procedure codes](https://contrataciondelestado.es/codice/cl/2.07/SyndicationTenderingProcessCode-2.07.gc). Direct, incumbent-panel and aggregate procedures with published results are not exposed as new whole-procedure competitions. This deliberately forgoes possible remaining open lots until they can be verified separately; it does not claim that an award on one lot legally closes every other lot. The [result vocabulary](https://contrataciondelestado.es/codice/cl/2.09/TenderResultCode-2.09.gc) is distinct from the overall procedure state.

The syndication specification explicitly omits the timezone from submission times. Publication timestamps with offsets are not evidence for a submission-time offset. Consequently the adapter preserves the stated local deadline in the description and leaves `deadline_at` unknown unless that deadline actually supplies an offset. It does not manufacture a midnight UTC deadline or automatically qualify date-only deadlines for the exact-time Closing Soon view.

### Incremental Behavior

Each run conditionally checks the small head using ETag and Last-Modified, then spends its remaining request allowance on saved archive cursors. A content fingerprint also prevents replay when an unchanged server response is HTTP 200 rather than 304. Changed heads introduce a newer time window while unfinished older windows remain queued. A validated page advances its own cursor; a failed or unsafe page does not. Terminal updates are retained regardless of IT relevance so an older tender found during backfill cannot reopen a withdrawn or awarded procedure.

Ordinary open entries are screened broadly for software/IT CPVs and CRM/digital-delivery terms. This is discovery, not a fit assessment. Active dated facts are cached locally: on later runs a timezone-free date is retired only after an additional complete UTC calendar day has passed. This conservative rule prevents a stale `PUB` label persisting indefinitely, but may leave a just-closed record visible during the grace period. The source link remains authoritative. Supporting source-local dates in the shared model and UI would allow a more precise date-only Closing Soon view without pretending the clock's timezone is known.

Native procedure IDs are not represented as fabricated OCDS OCIDs. Exact TED publication aliases are added only where the metadata contains an actual TED notice URL. The sampled pages did not establish a universal TED identifier, so complete TED/PLACSP deduplication is not promised. The existing independent-identifier reconciliation remains necessary.

Pagination is restricted to two official HTTPS hosts and the specific feed path family. Redirects are not followed. XML is size-, depth- and structure-bounded; non-UTF-8 input, DTDs and entity declarations are rejected. The collector never downloads referenced documents or expands archives. Requests use the existing shared retry/backoff behavior; the page cap counts logical requests, while a transient failure can cause up to three HTTP attempts.

### Live Results and Limits

The in-memory smoke test used two feed-page requests and one subsequent conditional head request:

| Observation | Result |
|---|---:|
| Main-page entries | 26 |
| First archive entries | 500 |
| Retained lifecycle records | 480 |
| Closed/award/resolved records retained internally | 477 |
| Broad open IT candidates | 3 |
| Candidate deadlines with a genuine explicit offset | 0 |
| Records replayed by the conditional head check | 0 |

The three candidate subjects were CSIC computer maintenance/user support, a Port of Seville maritime-traffic system implementation, and an IT support service. They are not three verified Salesforce projects or three proven net-new leads after cross-source qualification. This sample supports the adapter's coverage, not a sales-fit claim.

The head's source timestamp remained **8 September 2026 at 18:12:20.736 UTC**. Its first archive was approximately 16.5 MB. Both an unfinished historical cursor and this stale source timestamp produce explicit partial coverage. HTTP 200 is not treated as proof of current coverage. This is also a high-volume national feed: an inexpensive bounded schedule needs time to catch up, and insufficient page capacity must not be advertised as comprehensive daily ingestion.

Forty focused tests passed, covering lifecycle states, direct/panel routes, partial lot results, permanent IDs, TED references, deadline precision, cache expiry, new updates during backfill, 304 and unchanged-200 behavior, cursor preservation, cycles, stale heads, and XML/redirect safety.

### Registration

Add a lazy collector wrapper for `collect_spain_notices(source, state, frozen, http, settings, terms)` and register it as `spain_atom`. The module imports the existing collector contracts, so the wrapper must import lazily. Dispatch raw kind `spain_placsp` to a lazy import of `normalise_spain_notice(raw)`, not to the OCDS normalizer. The adapter owns its incremental windows and does not need a generic backfill lane.

Suggested initial configuration for an explicitly partial local trial:

```yaml
- id: spain
  name: Spanish Procurement Notices
  enabled: true
  collector: spain_atom
  source_type: official_notice
  country: ES
  url: https://contrataciondelsectorpublico.gob.es/sindicacion/sindicacion_643/licitacionesPerfilesContratanteCompleto3.atom
  website: https://contrataciondelestado.es
  docs: https://www.hacienda.gob.es/DGPatrimonio/plataforma_contratacion/especificacion_mecanismo_sindicacion.pdf
  initial_lookback_days: 7
  max_pages_per_run: 3
  coverage: Spanish PLACSP contracting profiles excluding minor contracts; incremental partial coverage; some deadlines have no published timezone.
```

This cap is also constrained by the shared `settings.max_pages`. A one-page run only checks the head; it cannot clear an archive backlog. If publication remains at 8 September, increasing the budget cannot manufacture newer source data.
