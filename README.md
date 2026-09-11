# Anthrion Signal

Public procurement and commercial opportunity discovery for Anthrion's sales team. The React/TypeScript console reads a static, validated dataset. Python collectors run locally or in GitHub Actions. Collection requires neither a language model nor a paid tender-data subscription.

## Workspace

The console opens on **Live Opportunities**, ordered by recent publication. Salesforce, CRM and clearly related platform implementations appear first, including combined platform/AI projects. Standalone AI follows, then other relevant opportunities. Each group retains the selected recency, update, deadline or value order. There are no score thresholds or model assessments.

The five refiners are **All Signals**, **Live Opportunities**, **Pre-market**, **Closing Soon**, and **Added today**. Pre-market combines requests for information, market engagement, pipeline and genuine future buying intent; these are not presented as open tenders. Unknown deadlines do not enter Closing Soon. Added today means first collected on the current Europe/London calendar date, not recently updated or published. Frameworks and funding remain available through notice-type filters without separate refiner cards.

The UK, US, Italy, Nordics, Germany, Spain and Greece are selectable. Nordics groups Sweden, Finland, Denmark, Norway and Iceland. Counts, saved records, search and filters are market-scoped. A healthy source does not imply complete market coverage or confirmed bidder eligibility.

The dark glass console uses a measured virtual list: scrolling reveals records without pagination while only nearby rows remain mounted. Desktop has independently scrolling records and details; narrow screens use document scrolling and a detail drawer. The record panel places compact notice facts and capabilities above the complete source description. Full details and Open source notice stay in a bottom dock outside the scrolling content, including on mobile. The expanded detail view retains its own source action and a Back to record control. Arrow keys and Home/End navigate record selectors. Reduced-motion preferences pause decorative animation.

Search, filters and sort sit between the brand and saved opportunities in the desktop header. They wrap within the header on smaller screens. Export is centred beside the glass refiners. The repeated list heading is visually hidden but retained for screen readers. A 57px action dock, compact market spacing and tighter description margins preserve more reading room without shrinking record typography; both dock actions retain 44px interaction targets.

Refiner reflections share one continuous animation phase. Scrolling a separate record list or description does not redraw stationary glass or reset its lighting. Relevant document scrolling, carousel movement and resizing still update geometry; decorative lighting remains capped at 25 updates per second and pauses offscreen, in hidden tabs and for reduced motion.

Records show source descriptions, buyers, dates, values, capability matches, original notices, documents and timelines. Bookmarks and hidden-record choices belong to the current browser and synchronize between its tabs. Hide removes a record from ordinary results, counts and exports; Show hidden in the sort menu shows only hidden records within the current market and filters, where Unhide restores them. Saved views, comparison and the Latest updates navigation have been removed. URLs, CSV exports and calendar deadlines can be shared. This public discovery tool does not publish private notes or provide a shared private CRM.

## Collection and Availability

Official APIs and permitted public listings feed bounded collectors with overlapping windows, checkpoints and retries. Source facts are normalized, deduplicated using procedure identifiers and aliases, checked for availability, and ordered by delivery priority and publication recency. Validated public JSON is built with Vite and published through GitHub Pages.

Awards, inferred incumbent renewals, cancellations, withdrawals, expired response windows and explicitly unavailable routes are excluded from results, saved opportunities and exports. Canonical terminal records remain internally so later awards or cancellations can retire earlier leads. Ambiguous bidder eligibility is not invented; inspect the source before pursuing.

Capability classification uses explicit phrases, translated aliases, functional needs and CPV codes. Context-only words do not promote standalone AI into the platform-first group. Supplier-portal hostnames do not count as Salesforce implementation requirements. The company profile retains supplied public facts without assuming framework memberships, certifications or overseas delivery presence.

Gemini dispatch, its SDK dependency, workflow credentials and score-based product features have been retired. Historical canonical analysis and offline validation helpers remain for migration/history, but public serialization strips model analysis, recommendations and scores. Old score-filter URLs migrate to source-only views. Legacy `--no-ai` remains accepted; nonzero `--max-ai` is rejected.

## Sources

| Source | Interface and safeguards |
| --- | --- |
| Find a Tender | Official OCDS; six-hour windows, cursor resume, overlap, persistent Retry-After deferral and bounded enrichment |
| Contracts Finder | Official OCDS; daily windows, pagination, overlap and bounded record enrichment |
| Public Contracts Scotland | Official monthly OCDS; resumable rotation across months and notice types |
| Sell2Wales | Official OCDS currently has upstream errors; a permitted public-listing fallback provides explicitly partial coverage |
| GOV.UK | Official Search API; rotating buying-intent queries, excluding general directory/profile content |
| Digital Outcomes | Public listing/detail pages; paginated collection, cached details and explicit submission deadlines |
| GCA Upcoming Agreements | Public listings/details; framework stages, approximate timing and official links |
| TED Europe | Official v3 Search API; configured European markets, CPV/keyword discovery and lifecycle mapping |
| German Public Procurement | Official paired daily OCDS/eForms exports; completed days, national-only notices and TED aliases |
| Spanish Public Procurement | Official PLACSP Atom/CODICE; bounded pending pages, terminal updates and source-local deadline safeguards |
| NYC City Record | Official DCAS/Socrata API; daily current/recent notices, stable cursor and New York timezone handling |
| Grants.gov | Official funding search/details; actual detail-call budget and reuse of unchanged facts |

Failures preserve previous records and completed checkpoints. Budget-limited results are partial, not complete coverage. Retries are bounded and TLS verification stays enabled. Source-specific reuse terms remain applicable; linked documents do not automatically share a dataset's licence.

USAspending is disabled because it supplies awards rather than new competitions. Registry placeholders for SAM.gov, regional supplier portals and multilateral procurement are not active coverage. Activate additions only after interface, reuse, lifecycle, deadline and supplier-access checks.

- [European free APIs](docs/free-europe-apis-2026-09-11.md)
- [US/global APIs and GitHub budget](docs/free-us-global-apis-actions-budget-2026-09-11.md)
- [Source repairs and remaining limits](docs/source-reliability-2026-09-11.md)
- [Source-only local trial and verification](docs/source-only-discovery-2026-09-11.md)

## Local Development

Python 3.12+ and Node 22 are recommended.

```powershell
python -m venv .venv
.\.venv\Scripts\python -m pip install -e '.[test]'
Copy-Item .env.example .env
.\.venv\Scripts\python -m anthrion_signal.cli ingest --days 7 --max-pages 12
cd app
npm ci
npm run dev -- --host 127.0.0.1 --port 4174
```

The local route is `http://127.0.0.1:4174/anthrion-signal/`. `VITE_BASE_PATH` overrides the repository path. No enabled provider requires a model key. Keep credentials out of frontend variables, public data and Git.

`python -m anthrion_signal.cli rescore` is the compatibility command for rebuilding source classification and publication without contacting providers. `export` copies validated public data into the frontend. On Windows, stop a preview process that holds the output JSON open before an atomic dataset update, then restart it.

Use `--refresh-daily` for a deliberate bounded recheck of a daily snapshot after changing discovery rules. It skips the local daily refresh interval, not provider Retry-After limits; normal scheduled runs leave it off.

## Scheduling and Budget

The workflow definition runs at **06:15, 08:55, 10:15, 14:15 and 18:15 Europe/London**, with DST handling. The 08:55 run replaces the former 22:15 slot; the total remains five per day. It supports manual collection and existing-data deployment. Main-branch code pushes rebuild; source-state commits do not recursively trigger collection.

The repository is currently public, so standard GitHub-hosted runner use is free. External procurement requests do not consume GitHub REST API quota. Five scheduled ticks mean 150-155 cycles per month, not a monthly API-call entitlement. Providers impose separate limits: daily sources skip completed snapshots, partial work resumes, caches avoid needless detail fetches, and Retry-After delays are respected. Storage, larger runners and any future private-repository allowance are separate. See the cited budget report.

The workflow validates public output, tests, builds, checks desktop/mobile flows, commits source state and deploys through GitHub Pages. Publication is recorded only after deployment succeeds. Times are scheduled starts, not guaranteed completion times: GitHub can delay or drop scheduled runs under load and disables public scheduled workflows after 60 days without repository activity. Overlapping checkpoints protect continuity. Local edits do not publish until deliberately pushed/deployed. See [GitHub's schedule documentation](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule).

## Retention and Verification

Canonical records retain 180 days of recent updates plus future deadlines or contract ends. Older records move into monthly compressed archives with a matching index; later related notices can restore history. The browser loads only public `current.json`, not canonical history or archives.

```powershell
.\.venv\Scripts\python -m pytest -q
.\.venv\Scripts\python -m ruff check pipeline scripts/check_public_output.py
.\.venv\Scripts\python -m anthrion_signal.cli validate
.\.venv\Scripts\python scripts/check_public_output.py
cd app
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

Tests use local fixtures, not paid APIs. Review source-health metadata and Actions summaries for partial coverage. Never disable TLS verification to repair a source. Verify an interrupted collector has stopped before removing its local lock.

See [SETUP.md](SETUP.md) for deployment configuration. Contains public-sector information under the Open Government Licence v3.0 where applicable; other source terms continue to apply. Complete tender documents and supplied private files are not copied into the public repository.
