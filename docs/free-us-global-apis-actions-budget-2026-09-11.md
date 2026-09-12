# Free Procurement Sources and Collection Budget

## Conclusions

The strongest immediate US addition is New York City's official City Record API. It is keyless, updated daily, supplies meaningful procurement descriptions, and includes active implementation opportunities rather than only awards. A dedicated local adapter is available. Its live smoke test retrieved 268 notices in two requests, including a currently advertised community database procurement; those 268 notices are raw inputs, not 268 qualified Anthrion leads.

Los Angeles RAMP is another verified keyless source, with a current Salesforce-based procurement in its open-data feed. Its task-order eligibility and timestamp conventions require a further validation pass before enabling automated publication. World Bank project procurement and CanadaBuys are credible international additions, but their buyer countries must remain distinct from the existing US and European markets.

The current GitHub repository is public. Standard GitHub-hosted runner use in public repositories is free, so the present Ubuntu workflow is not constrained by a private-plan monthly minute allowance. Procurement-provider requests, GitHub REST API limits, and Actions runner minutes are three different budgets. Adding an API does not consume a fixed number of GitHub "API calls" from a monthly allowance.[^1][^2]

This assessment covers official, free public sources and free-account alternatives. It does not claim that every municipal portal, national procurement system, or commercial feed has been exhaustively enumerated. A source is only recommended for activation after verifying both a supported read interface and useful, current notice semantics.

## Source Decisions

| Source | Access | Incremental value | Decision |
| --- | --- | --- | --- |
| NYC City Record Online | Anonymous Socrata JSON API; dataset metadata identifies public-domain data | US municipal solicitations, RFIs and procurement updates with descriptions | Local adapter implemented and smoke-tested |
| Los Angeles RAMP | Anonymous Socrata JSON API | US municipal and participating regional buyers; a Salesforce procurement was returned | High-value next integration; validate eligibility and timestamps first |
| SAM.gov Opportunities | Free account and public API key; role-dependent quota | Broad federal solicitations, sources-sought and presolicitations | Best federal expansion after free key is supplied |
| World Bank Procurement Notices | Anonymous public search API | International borrower-funded consulting-firm and implementation procurement | Strong next international connector; separate global/project-market treatment needed |
| CanadaBuys | Free official catalogue API plus current/new CSV exports | Canadian federal tender opportunities, including technology delivery | Strong geographic expansion, not US coverage |
| UNGM documented Notice API | OAuth integration access; documentation describes agency-owned notices | Potential UN procurement visibility through an authorized route | Do not enable the agency API as an assumed anonymous aggregate feed |
| USAspending | Free API | Award and incumbent history, not new competitions | Keep disabled for this sales-only product |

The underlying official references and live validation limits are detailed below. Existing Grants.gov funding and TED coverage are not counted as new integrations.

## United States

### NYC City Record Online

The canonical DCAS dataset is `dg92-zbpx`, with read endpoint `https://data.cityofnewyork.us/resource/dg92-zbpx.json`. Its official metadata identifies DCAS as the provider, `PUBLIC_DOMAIN` as the dataset licence, and automated daily updates. It contains procurement and non-procurement material, including solicitations and awards; an unrestricted feed is therefore not a sales-opportunity feed by itself.[^3]

Anonymous queries succeeded without an application token. Socrata documents that anonymous traffic shares an IP-based throttling pool; an optional application token gives separate quota attribution. Neither anonymous access nor an application token should be described as an unconditional unlimited-rate entitlement.[^4]

The verified candidate `20260825021`, published on 1 September 2026, is NYC Emergency Management's "01727P0002-Strengthening Communities Database #2". It requests a secure off-the-shelf database supporting communication between program staff and community organizations. The official notice page is reachable and identifies it as current. The API deadline is 21 September at 14:00 New York local time, converted to 18:00 UTC. This is a plausible CRM-adjacent opportunity, not proof that Salesforce is mandated or that Anthrion has met all bidder qualifications.[^5]

The adapter is deliberately conservative:

- It reads only the procurement section, current-deadline notices and recent publication changes. General notices and public hearings do not become opportunities.
- It retains award and cancellation events as terminal records for reconciliation. Public availability rules must continue excluding them.
- Explicit sole-source, renewal and negotiated-acquisition-extension routes are unavailable. A generic negotiated acquisition is not automatically excluded, since the method name alone does not establish that new bidders are barred.
- RFI methods map to early engagement; proposals map to RFP; other solicitations map to tender. These are normalized lifecycle labels, not an inferred local legal equivalence.
- `end_date` is the publication period's end, not a bid deadline. Only `due_date` is treated as a submission deadline.
- Calendar timestamps are converted using `America/New_York`, including real daylight-saving rules. Ambiguous or nonexistent local clock times require source verification rather than a guessed deadline.
- Award amounts do not become tender estimates. An amount is retained only for award history; active notice value remains unknown when the source does not state a tender estimate.
- Public descriptions and procurement links are retained; structured contact phone, email and address fields are not requested. Contact details can still occur naturally in the publisher's notice prose.

Collection uses a stable numeric request-ID cursor, a frozen replay window, a page budget and a 24-hour cooldown after a complete snapshot. A partial snapshot resumes immediately on the next run. Schema errors, non-advancing pages and transport failures leave the last completed watermark intact. Bounded collection is not represented as complete when pages remain.

The general NYC Open Data terms warn that datasets can change and are not warranted to be complete or accurate. The dataset's public-domain label does not authorize use of the City's marks or imply City endorsement. Preserve the official notice link and DCAS provenance. Treat external attachments as separately sourced documents rather than assuming that all linked third-party material has the same reuse status.[^6]

One material residual limit remains: the dataset is a notice history, not a definitive machine-readable bidder-eligibility register. Repeated PINs help reconcile related notices, but do not prove lot-level award status for every procurement. Do not infer that all contracts sharing a title or buyer are the same procurement. Retain source checking before sales action.

### Los Angeles RAMP

The official current dataset is `hf3r-utnq`, not the older BAVN dataset `qtax-byj7`. Metadata and a five-record probe succeeded on 11 September 2026. Fields include RAMP ID, title, stage, procurement type, posting and closing timestamps, department and the public notice URL. The feed describes open procurement opportunities available through the Regional Alliance Marketplace for Procurement.[^7]

The probe returned "Los Angeles World Airports Salesforce-Based eSourcing Solution (RAMP-LAWA)" with stage `Open` and type `TOS - Task Order Solicitation`. This is unusually relevant to the team's preferred platform, but task-order access may require an existing contract or approved-supplier route. It should not be promoted as freely bid-accessible without reading that condition. The payload also supplies a timezone-naive closing timestamp; it must not simply be labelled UTC or Pacific by guesswork.[^8]

Before activation, verify timestamp semantics against the official notice, establish the route to requirements and eligibility, and confirm how removals and closed/amended records are represented. Title-only keyword matches are insufficient: the same sample contained physical construction and equipment purchases. This source is a strong next addition, not production-ready merely because its JSON endpoint responds.

### SAM.gov Federal Opportunities

GSA's public Opportunities API requires a public API key. The key is requested from SAM.gov account details, and daily limits depend on account role. The public endpoint is `https://api.sam.gov/opportunities/v2/search`; results require paging. Active notices are updated daily and archived notices weekly. The documented service is the proper federal read route, distinct from APIs intended to manage or publish notices.[^9]

SAM.gov is a free government service. A commercial data subscription is not required simply to access the official public opportunity service, although the applicable account's exact API allowance still needs verification. Store the key as a backend secret, not in the site bundle or public data. Retain notice-type, set-aside, registration, geographic and supplier restrictions; many federal solicitations will not be accessible to every overseas supplier.[^10]

NYC and LA do not replace federal coverage. Conversely, a federal feed will not provide complete state and municipal coverage. There is no evidence here of a supported, nationwide, anonymous federal opportunity endpoint that provides equivalent coverage to SAM's documented service. Do not substitute award data, an unverified mirror, or a website access workaround and label that gap solved.

## International Expansion

### World Bank Procurement Notices

The World Bank's catalogue identifies a public procurement-notice dataset licensed CC BY 4.0. Its official Finances One pages link the procurement-notices API and describe daily publication. The working versioned endpoint is `https://search.worldbank.org/api/v2/procnotices`; anonymous bounded calls returned current notice records with project country, procurement method, publication date, submission deadline and full notice text.[^11][^12]

A five-result software search returned a 10 September 2026 expression of interest for a firm to develop an integrated management information system supporting e-waste monitoring in Egypt, identifier `OP00468131`, with a structured deadline date of 4 October. The same small sample included several already-awarded contracts. That contrast is important: keyword relevance alone does not establish availability.[^13]

The integration should retain only open specific procurement, firm-based expressions of interest and genuine future procurement notices. Exclude contract awards, cancelled/withdrawn notices, direct-selection awards and individual-consultant recruitment when it is not a company delivery contract. General procurement notices belong in future opportunities, not live tender counts.

Project country is the relevant procurement geography; the World Bank's US headquarters does not make these US tenders. A global/international filter or additional project-country markets should be chosen before activation. Preserve the executing agency as buyer where stated, retain international/local competition conditions, and do not infer eligibility solely from World Bank funding.

A combined notice-type/date-filter probe returned no results, while a simple software query returned current data. Consequently the exact production filter contract still needs a focused validation pass. The unversioned API's default results also differed from the versioned endpoint. Freeze explicit query parameters, verify ordering and pagination, and test amendment/withdrawal reconciliation before claiming a complete daily feed. The structured deadline may disagree with narrative text; conflicting fields need conservative handling rather than invented precision.

### CanadaBuys

Canada's official open-data catalogue API exposes dataset `6abd20d4-7a1c-4b38-baa2-9525d0bb2fd2`. The catalogue was updated on 11 September 2026 and identifies the Open Government Licence - Canada. Resources explicitly distinguish new notices, open notices, annual files, all notices since the CanadaBuys transition and older archives.[^14]

The most useful initial resource is `https://canadabuys.canada.ca/opendata/pub/openTenderNotice-ouvertAvisAppelOffres.csv`, with the new-notices CSV for incremental updates. These are free machine-readable exports, not a per-search procurement REST API. The catalogue and resource links were verified; the full live CSV ingestion and field normalization were not implemented in this revision.[^15]

A connector should use the provided data dictionary, preserve English/French content and amendments, reconcile active snapshots with changes, and respect submission timezones. Canadian opportunities require their own market label. This is a valuable expansion for a team willing to pursue Canada, but adding its records to the US market would be incorrect.

### UNGM and Other Multilateral Portals

UNGM's documented Notice API requires OAuth authorization. Its search documentation specifically describes notices created by the integrating agency. This is not sufficient evidence of a public anonymous API for downloading the entire marketplace. Keep the current registry placeholder disabled until an authorized read/redistribution route is confirmed; public notice visibility alone is not that authorization.[^16]

The same activation standard applies to EBRD, NATO/NCIA/NSPA and regional development-bank portals: official procurement pages can be useful, but an unverified website endpoint is not yet a supported open API. They remain access projects, not enabled sources or additional coverage counted in this report.

## GitHub Budget

### Three Separate Limits

| Resource | What consumes it | Applicable constraint |
| --- | --- | --- |
| Actions runner time | Time spent installing dependencies, waiting on sources, collecting, validating and building | Standard runners are free for the current public repository; private-plan allowances apply if visibility/account conditions change |
| GitHub REST API | Requests to GitHub endpoints such as repository, workflow or artifact APIs | Typically 1,000 requests/hour/repository for `GITHUB_TOKEN`; separate primary and secondary limits |
| Procurement-provider APIs | Requests to NYC, TED, FTS, Grants.gov and other provider hosts | Provider-specific rate, daily/monthly or shared-IP policies; no universal GitHub allowance |

GitHub's ordinary anonymous REST allowance is 60 requests/hour/IP and authenticated personal access is generally 5,000/hour; the workflow token has its own repository allowance. These are not a monthly pool, and external procurement HTTP calls do not decrement them. Some endpoint classes and secondary limits differ.[^17]

### V1 Repository and Schedule Baseline

Update, 12 September 2026: the schedule below is the historical five-run v1 baseline. The current workflow runs hourly at XX:50, including overnight (approximately 720-744 monthly ticks), with focused data-refresh browser checks and full regression on code changes and daily. See the README's Scheduling and Budget section for current operation. The calculations below are not the current hourly budget.

Read-only public GitHub metadata reports `stevostar1234/anthrion-signal` as `private: false`, `visibility: public`, default branch `main`. This confirms the relevant repository condition; it does not reveal or imply the owner's personal paid plan or remaining private-repository allowance.[^1]

The v1 `ingest-and-deploy.yml` schedule runs at 06:15, 08:55, 10:15, 14:15 and 18:15 Europe/London. The requested 08:55 slot replaces the original 22:15 run. That is still five scheduled runs/day: 150 in a 30-day month and 155 in a 31-day month. Manual dispatches and qualifying pushes are additional. The separate test workflow also runs on pull requests and qualifying pushes. Scheduled data commits are designed not to create a perpetual CI loop.

One recent successful public run had these job durations:

| Job | Actual elapsed time | Whole-minute accounting illustration |
| --- | ---: | ---: |
| Build/collection | 7 min 53 sec | 8 min |
| Deploy | 8 sec | 1 min |
| Record publication | 8 sec | 1 min |
| Total | 8 min 9 sec | 10 min |

The run was `34585492475` on 11 September 2026. This is a sample of the existing hosted version, not a guarantee about the expanded local version. The illustration conservatively counts all three jobs; it is not a bill, and any specific Pages exemption is not needed to establish that the current public run is free.[^18]

GitHub rounds billable jobs up separately, so elapsed workflow wall time is not always the billable total. If a future private setup had an average of 5, 10, 15 or 20 charged minutes per complete collection cycle, 155 cycles would amount to 775, 1,550, 2,325 or 3,100 minutes respectively, before push/PR/manual jobs. Those are scenario calculations, not observed monthly usage.[^19]

For context, the documented monthly standard-runner allowances are 2,000 minutes on GitHub Free/Free for organizations, 3,000 on Pro/Team and 50,000 on Enterprise Cloud. If usage were chargeable above an included allowance, current baseline Linux x64 2-core runner pricing is USD 0.006/minute. These plan facts do not imply that the current public repository will pay those rates.[^20][^19]

### Provider Request Budget

The previous nine-source registry and workflow setting of 80 logical pages/source/run produce a planning envelope of `9 x 80 x 155 = 111,600` logical operations/month if every source continually exhausts that cap. Twelve equivalent sources would produce 148,800. These are conservative capacity calculations, not a predicted workload or a provider entitlement. A page can return hundreds of notices, and a notice can require separate detail calls.

The previous Grants.gov collector counted search pages but not every detail fetch, so its page limit was not an effective overall request cap. The reliability revision is adding bounded detail accounting and reuse of unchanged public detail data. HTTP retries still matter: up to three physical attempts per logical operation can multiply the worst-case physical request count, while a healthy source normally needs one attempt. Keep logical requests, physical attempts, returned records and bytes as separate metrics.

The NYC smoke test's two requests are a useful scale reference, but its seven-day replay is not a guarantee for the initial 90-day import. At a proposed maximum of six requests per daily snapshot, its ordinary monthly allowance would be up to 186 logical requests over 31 days, or 558 physical attempts in a hypothetical all-retried envelope. Incomplete snapshots resume rather than incorrectly advance the watermark. A daily source does not need to be fully downloaded at all five global scheduler ticks.

### Recommended Pacing

| Source class | Normal cadence | Collection rule |
| --- | --- | --- |
| UK/EU incremental live notices | Up to the existing five ticks/day where the provider supports it | Small overlapping update windows; obey provider retry delays; resume incomplete partitions |
| Daily national exports and NYC | Daily after provider publication | Fetch changed partitions or an active snapshot; persist a source-specific refresh time |
| Grants/funding details | Daily, with earlier refresh when the listing changes | Reuse unchanged detail content and apply a real hydration budget |
| Framework pipelines and general procurement plans | Daily or less often if provider updates are slower | Stable hashes; avoid re-fetching unchanged detail pages |
| Historical catch-up | Separate bounded allocation | Do not starve today's opportunities; preserve a resumable cursor |

These are proposed operating targets, not claims about provider SLAs. Public GitHub minutes make a restrictive monthly runner guard unnecessary for this repository, but reliability still benefits from smaller incremental runs. Keep full regression/browser tests for code changes and a scheduled daily verification pass; use lightweight schema/public-output checks on unchanged-data refreshes. This is an optimization proposal, not a hosted workflow change made by this research.

Retain artifacts briefly, monitor cache/storage separately and keep paid overage budgets explicitly disabled unless authorized. If the repository later becomes private, begin with a conservative once-daily collection and reserve at least 20% of the applicable included minutes for development/retries. Choose the final schedule from observed per-job durations and provider freshness, not the number of registered API names.

GitHub's schedule is not a guaranteed real-time delivery service. Runs can be delayed or dropped during high load, and public scheduled workflows can be disabled after 60 days without repository activity. A 15-minute offset already avoids the start-of-hour peak; source checkpoints and overlap windows are what prevent a delayed tick from losing notices.[^21]

## Integration and Validation

Local adapter: `pipeline/anthrion_signal/nyc_city_record.py`. Collector entry: `collect_nyc_city_record(source, state, frozen, http, settings, terms)`. Native normalizer: `normalise_nyc_city_record(raw)`. Raw kind and registry name are `nyc_city_record`. Register through lazy imports because the dedicated module reuses the existing collection dataclasses and normalizer helpers.

Recommended source configuration is `limit: 200`, `max_pages_per_run: 6`, `refresh_hours: 24`, `country: US`, `source_type: official_notice`. The endpoint is the DCAS Socrata JSON route above, with the City Record notice site and official dataset page as website/documentation links. The daily cooldown is implemented inside the adapter; no separate account automation is required.

Windows requires the PSF's `tzdata` package for IANA timezone data when no system timezone database exists. Version `2026.3`, released 10 July 2026, was verified and installed in the project virtual environment. Production dependency pinning belongs in the shared project configuration.[^22]

The initial isolated adapter validation passed twenty-five tests. Final integration expanded this to thirty-five NYC tests, including valid bid extensions, explicit indefinite postponement, placeholder deadlines and deliberate daily refresh. The original two-request smoke test did not change runtime data; subsequent root integration ran bounded snapshots and published one new NYC candidate locally. A contradictory postponed notice was excluded and its placeholder date cleared. See the [final integrated trial](source-only-discovery-2026-09-11.md) for reconciled counts and full-suite results. No paid API, AI service, deployment or new hosted schedule was invoked.

## Sources

Documentation and live metadata were checked on 11 September 2026. An API metadata modification timestamp is not treated as a legal-policy publication date. Undated documentation is cited by retrieval date rather than an invented publication date.

[^1]: GitHub. [Public repository metadata for Anthrion Signal](https://api.github.com/repos/stevostar1234/anthrion-signal). Anonymous live response: public visibility and default branch.
[^2]: GitHub. [GitHub Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions). Public standard-runner treatment and distinction from chargeable usage.
[^3]: NYC Department of Citywide Administrative Services. [City Record Online dataset metadata](https://data.cityofnewyork.us/api/views/dg92-zbpx.json) and [dataset page](https://data.cityofnewyork.us/City-Government/City-Record-Online/dg92-zbpx). Public-domain licence, daily updates and field definitions.
[^4]: Tyler Technologies/Socrata. [Application Tokens](https://dev.socrata.com/docs/app-tokens.html). Anonymous/shared-IP throttling and optional token semantics.
[^5]: NYC Emergency Management. [City Record notice 20260825021](https://a856-cityrecord.nyc.gov/RequestDetail/20260825021). Official live procurement scope/status; deadline also verified in the canonical dataset.
[^6]: NYC Open Data. [Terms of Use](https://opendata.cityofnewyork.us/overview/#termsofuse); City of New York. [NYC.gov Terms of Use](https://www.nyc.gov/main/terms-of-use). Accuracy, agency authority, intellectual property and no-endorsement conditions.
[^7]: City of Los Angeles. [RAMP Open Bid Opportunities metadata](https://data.lacity.org/api/views/hf3r-utnq.json) and [dataset page](https://data.lacity.org/City-Infrastructure-Service-Requests/RAMP-Open-Bid-Opportunities/hf3r-utnq). Current dataset identity and field scope.
[^8]: City of Los Angeles. [RAMP public JSON feed](https://data.lacity.org/resource/hf3r-utnq.json) and [linked Salesforce procurement notice](https://www.rampla.org/s/opportunity-details?id=006Ql00000k98OrIAI). API record `231537`; full eligibility not validated.
[^9]: US General Services Administration. [SAM.gov Get Opportunities Public API](https://open.gsa.gov/api/get-opportunities-public-api/). Endpoint, key requirement, quota dependence and refresh cadence.
[^10]: US General Services Administration. [SAM.gov](https://sam.gov/). Official free government service; bidder/API account conditions remain distinct.
[^11]: World Bank. [World Bank Procurement Notices catalogue](https://datacatalog.worldbank.org/search/dataset/0037795/world-bank-procurement-notices). Public classification and CC BY 4.0 licence.
[^12]: World Bank. [Official procurement dataset view](https://financesone.worldbank.org/procurement-notices-kenya/DS01594). Daily update context and official API link; this view is not used as global country coverage.
[^13]: World Bank. [Versioned procurement API software query](https://search.worldbank.org/api/v2/procnotices?format=json&rows=5&os=0&qterm=software). Bounded live validation; field observations for `OP00468131` and award records.
[^14]: Government of Canada. [CanadaBuys tender-notice catalogue API](https://open.canada.ca/data/api/action/package_show?id=6abd20d4-7a1c-4b38-baa2-9525d0bb2fd2). Current resource inventory and licence identifier.
[^15]: Public Services and Procurement Canada. [CanadaBuys supporting documentation](https://donnees-data.tpsgc-pwgsc.gc.ca/ba2/ac-cb/soutien-support-eng.html) and [open tender-notice CSV](https://canadabuys.canada.ca/opendata/pub/openTenderNotice-ouvertAvisAppelOffres.csv). Official resources named in catalogue; CSV payload not imported in this revision.
[^16]: UNGM. [Get Notices](https://developer.ungm.org/Article/GetNotices) and [Search notices](https://developer.ungm.org/Article/SearchNotices). OAuth prerequisite and agency-scoped integration description.
[^17]: GitHub. [Rate limits for the REST API](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api). Authentication-specific hourly allowances and secondary limits.
[^18]: GitHub. [Collection run 34585492475](https://github.com/stevostar1234/anthrion-signal/actions/runs/34585492475) and [public job timings](https://api.github.com/repos/stevostar1234/anthrion-signal/actions/runs/34585492475/jobs). Observed durations, not a future cost guarantee.
[^19]: GitHub. [Actions runner pricing](https://docs.github.com/en/billing/reference/actions-runner-pricing). Per-job rounding and baseline Linux runner rate.
[^20]: GitHub. [Product usage included with each plan](https://docs.github.com/en/billing/reference/product-usage-included). Monthly plan allowances.
[^21]: GitHub. [Events that trigger workflows: schedule](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule). Timezones, delayed/dropped schedules and inactivity behavior.
[^22]: Python Software Foundation. [tzdata package](https://pypi.org/project/tzdata/). Maintained timezone database fallback and verified 2026.3 release.
