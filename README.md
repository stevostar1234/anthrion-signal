# Anthrion Signal

Evidence-grounded procurement and commercial opportunity intelligence for Anthrion. A React/TypeScript dashboard is published to GitHub Pages; Python collectors and Gemini analysis run on GitHub Actions. Only public business evidence and public notices are used. There is no database or paid tender-data dependency.

## Use the workspace

Start with **Top signals**, or choose live procurement, early engagement, pipeline, renewal, framework, funding or award views. Search across title, scope, buyer and reference. All filters, sorting, market selection and open signal links are URL-addressable.

The market selector covers the UK, US, Italy, Nordics, Germany, Spain and Greece. Nordics groups Sweden, Finland, Denmark, Norway and Iceland. Only the UK is monitored currently; other markets show their actual coverage state without substituting UK notices. Market selection also scopes overview counts, saved opportunities, deadlines and source coverage. Light/dark appearance and comfortable/compact list density are remembered in the current browser.

Open an opportunity to inspect its requirements, evidence, risks, documents and history. Fit and evidence confidence are separate. Unanalysed candidates show **Pending** and remain available for manual investigation. Unknown supplier eligibility never becomes an invented qualification or a hard blocker.

Saved opportunities and saved views are personal to the current browser. Use the view-link control or CSV export to share with colleagues. Deadline export produces an `.ics` calendar event. No private notes or team activity are published. This is a public intelligence site, not a shared private CRM.

## Runtime architecture

```text
Official APIs and public pages
  -> isolated collectors with frozen windows / overlap / retries
  -> normalisation and provenance
  -> exact identifiers, URLs, fingerprints, conservative fuzzy matching
  -> material-change detection and deterministic candidate ranking
  -> schema-constrained Gemini extraction with evidence validation
  -> mechanical fit, confidence and recommendation calculations
  -> validated public JSON -> Vite -> GitHub Pages
```

`pipeline/anthrion_signal` owns ingestion and intelligence. `config` defines sources, company evidence, markets, search concepts and score weights. `data` holds canonical records, public output, change history, source checkpoints and dedupe identifiers. `app` contains the user-facing product. Original PDFs, raw downloads, local credentials and the local AI cache are excluded from Git.

## UK source coverage

| Source | Implementation | Collection behavior |
| --- | --- | --- |
| Find a Tender | Official OCDS releases and compiled record API | Fixed six-hour windows, overlap, cursor pagination, rate pacing, bounded sparse-record enrichment |
| Contracts Finder | Official OCDS search and record retrieval | Fixed daily windows, overlap, pagination; planning through implementation and bounded record enrichment |
| Public Contracts Scotland | Official monthly OCDS API | Refetch current and previous month, including public Quick Quote awards; deduplicate |
| Sell2Wales | Official monthly OCDS API | Current and previous month; isolated errors and retained previous results |
| GOV.UK | Official Search API | Several strategic query families with publication windows and per-query catch-up |
| GCA Digital Outcomes | Public listing and public detail HTML | Source facts, framework, status and available deadlines; no login automation |
| GCA Upcoming Agreements | Public server-rendered listings and detail pages | Framework stages, approximate timing, linked official notices |
| TED | Official v3 Search API, optional | Configurable markets, CPV families, iterative pagination; disabled by default |

The current GCA public endpoints use `gca.gov.uk`. The older commercial-agency hosts redirect. FTS was verified to return empty results for a comma-separated multi-stage filter: the adapter retrieves the full feed when several stages are requested and filters the returned tags locally. A one-stage configuration uses the documented parameter. Scotland's API omits `releases` for empty partitions; these are treated as successful empty responses.

Sell2Wales returned HTTP 500 from its documented notice endpoints during initial verification. It remains configured, visibly reports its health, and will retry on future runs. Welsh notices may also be published by UK-wide sources. Coverage is never represented as healthy when a source has failed. GCA detail pages that lead to sign-in are not collected; their public listing facts remain available.

Disabled adapter definitions are included for eTendersNI, NHS Atamis, NHS Supply Chain/Jaggaer, MOD DSP and pipeline, The Chest, YORtender, ProContract, In-tend, other Jaggaer portals, Innovate UK, SBRI, EU Funding & Tenders, NATO, NCIA, NSPA, World Bank, EBRD, SAM.gov and UNGM. They are **not active coverage**. `EmailAlertCollector` defines the future integration boundary; enable one only after adding an authorised API/export/mailbox implementation and normaliser tests.

## Company grounding

`config/company_profile.yaml` is transcribed from the supplied EuroForce profile. Public branding is Anthrion; historical entities remain aliases. Every capability retains a page/section reference. The anonymous Finnish support case and the named Qt Group case remain separate.

The profile contains no assumed framework memberships, certifications, insurance, financial capacity or US delivery presence. Configure actual supplier eligibility in `eligibility` before using it to establish qualification or a hard blocker. Update `version` when editing facts. The cache also hashes the actual configuration content, so accidental omissions to bump the version do not reuse obsolete analysis.

## Relevance and scoring

The first pass combines configurable CPV prefixes, phrase families, capability concepts, BM25 similarity and obvious exclusions. It is a **candidate rank**, never a fit score. Gemini receives only candidate source facts and the curated public company evidence, then returns a constrained requirement and evidence schema.

Top signals includes plausible-or-better analysed fits (72+) and high-relevance pending candidates (40+ prefilter), excluding closed deadlines, cancellations, awards and known low-priority matches. The complete high-recall collection remains available in All signals. GOV.UK staff biographies and organisation directory entries are excluded before analysis.

All quotes are verified against the supplied source text. Profile IDs must exist; positive mappings must cite their actual capability. Named reference levels require actual case IDs. Feasibility and hard blockers require explicitly configured eligibility facts. Model responses that fail validation are discarded and retried within the call budget. Gemini cannot assign the final score.

| Dimension | Maximum weight |
| --- | ---: |
| Importance-weighted requirement coverage | 35 |
| Relevant references and case outcomes | 15 |
| Delivery model fit | 10 |
| Documented sector fit | 10 |
| Geography and governance | 5 |
| Configured commercial preferences | 10 |
| Observable timing/actionability | 10 |
| Procurement feasibility | 5 |

Match strengths are `DIRECT=1`, `STRONG_ADJACENT=.75`, `WEAK_ADJACENT=.35`, `NONE=0`, `UNKNOWN=null`. Requirement points use importance-weighted strengths. Unknown requirements proportionally reduce known capability weight. Unknown dimensions are excluded from the denominator:

```text
fit = 100 * earned points / known weight
confidence = 70% * known rubric coverage + 20% * source quality + 10% * evidence completeness
```

Timing is recalculated every run, even when content and AI analysis are unchanged. A pending analysis does not receive a fit score from timing alone. Expired, cancelled and awarded notices cannot receive `PURSUE`. A renewal is an explicitly inferred signal from a published contract or maximum extension end, not a claim that a replacement tender is confirmed.

Commercial fit remains unknown until comparable values and preferences are supplied. Edit `commercial_preferences` for minimum viable value, maximum comfortable value and preferred ranges. GBP value filters/sorting deliberately avoid comparing unconverted currencies.

## Local development

Python 3.12+ and Node 22 are recommended.

```powershell
python -m venv .venv
.\.venv\Scripts\python -m pip install -e '.[test]'
Copy-Item .env.example .env
# Configure GEMINI_API_KEY locally. Do not commit .env.
.\.venv\Scripts\python -m anthrion_signal.cli ingest --days 7 --max-ai 10
cd app
npm ci
npm run dev -- --port 4174
```

The default local route is `http://127.0.0.1:4174/anthrion-signal/`. `VITE_BASE_PATH` overrides the repository path, including `/` for a custom domain. The pipeline can run without Gemini. It publishes deterministically and marks evidence analysis pending.

## Configuration and cost

`GEMINI_API_KEY` is a GitHub Secret. `GEMINI_MODEL`, `MAX_AI_CALLS_PER_RUN`, `AI_CONCURRENCY` and `AI_MIN_PREFILTER_SCORE` are GitHub repository variables or local environment variables. The model is never hard-coded in runtime Python. The initial tested model is `gemini-3.5-flash`; 3.8 was available but returned repeated capacity errors during verification.

Default budget: 30 calls per run, including retries, two concurrent requests, prefilter threshold 25. Valid results are cached by material content, company profile, scoring configuration and model. Completed analyses are persisted in canonical JSON, so unchanged records do not need a cache download to avoid re-analysis. Temporary AI cache files are additionally cached by Actions. A quota or authentication error stops further AI dispatch for that run; ingestion and publication continue. Free-tier eligibility and quotas depend on the Google project. Set a project billing budget if billing is enabled.

## Scheduling and deployment

The production workflow runs at **06:15, 10:15, 14:15, 18:15 and 22:15 Europe/London** with automatic DST handling. `workflow_dispatch` can collect immediately or redeploy existing data. Main-branch code pushes rebuild existing intelligence. Source state commits do not recursively trigger workflows.

The workflow validates data, runs Python and UI tests, checks public output, builds the site, checks desktop/mobile browser flows, persists canonical state and deploys with the supported Pages artifact mechanism. Content or source-health changes publish immediately. Unchanged verified feeds publish once daily for freshness. A failed deployment is not recorded as successful and is retried on the next eligible run. Scheduled Actions can occasionally be delayed by GitHub; the UI reports actual publication/source times.

Queued builds check out the current main branch, and successful publication records the exact signature of the artifact that was deployed. The browser suite also checks keyboard navigation, market persistence, narrow/short layouts and automated WCAG AA accessibility rules in both themes.

## Expanding markets

The configuration includes GB, US, Italy, Sweden, Finland, Denmark, Norway, Germany, Spain and Greece. Only GB is enabled initially. Enable the appropriate markets and TED in `sources.yaml` for European expansion, validate live queries and translated evidence, and add local official sources where TED does not cover lower-value procurement. US expansion requires an implemented SAM.gov adapter and its own official API key. Market coverage never implies a documented Anthrion delivery presence.

## Retention

Current records retain 180 days of recent updates plus all records with a future deadline or contract/extension end. Expired older canonical records move into deterministic monthly `data/archive/YYYY-MM.jsonl.gz` partitions. `archive_index.json` preserves their identifiers and fingerprints; a later related notice restores its canonical history before merging. Archives contain the same compact source facts and provenance, not full downloaded tender documents. The browser loads only `current.json`.

## Verification and troubleshooting

```powershell
.\.venv\Scripts\python -m pytest -q
.\.venv\Scripts\python -m ruff check pipeline
.\.venv\Scripts\python -m anthrion_signal.cli validate
.\.venv\Scripts\python scripts/check_public_output.py
cd app
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

Live integration mode: `python -m anthrion_signal.cli ingest --sources find_tender,contracts_finder --days 1 --max-pages 10 --max-ai 2`. Tests themselves require no external APIs.

Use source-health timestamps and the Action run summary to diagnose gaps. A rate limit preserves completed window checkpoints and resumes later. Never disable TLS verification to fix certificate problems; the collector uses the platform trust store. If interrupted locally, confirm the collector process is stopped before removing `data/.lock`. Malformed AI output stays pending/failed with no fabricated result. Public UI errors retain a previously loaded feed where available.

For first-time deployment instructions, see [SETUP.md](SETUP.md).

## Primary documentation

- [Find a Tender API](https://www.find-tender.service.gov.uk/apidocumentation/1.0/GET-ocdsReleasePackages)
- [Contracts Finder API](https://www.contractsfinder.service.gov.uk/apidocumentation)
- [Scotland API](https://api.publiccontractsscotland.gov.uk/v1)
- [Sell2Wales publication policy](https://www.sell2wales.gov.wales/helpandresources/ocds/publicationpolicy)
- [TED Search API](https://docs.ted.europa.eu/ODS/latest/reuse/search-api.html)
- [Gemini structured output](https://ai.google.dev/gemini-api/docs/structured-output)
- [GitHub Actions schedules](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#onschedule)

Contains public sector information licensed under the Open Government Licence v3.0. Source notice copyrights and reuse terms continue to apply. No complete tender documents are copied into the public repository.
