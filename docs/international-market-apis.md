# International Procurement Data Sources

## Executive Assessment

Anthrion can obtain useful coverage in every selected market without buying a commercial data subscription. That does not mean every country's complete procurement market is available anonymously through one API. European TED notices, US federal funding and US federal award intelligence are immediately usable. National-only European notices and live US federal solicitations require additional connections, credentials or source-specific collection work.

The strongest next step is to retain TED as a common European foundation, add Germany and Spain's open national exports, and validate Greece's national API under realistic loads. Obtain a free SAM.gov public API key for US federal solicitations, and free HILMA read access for Finland. Treat Sweden, Norway, Denmark and Iceland as distinct national access projects, not a single Nordic integration.

The implementation accompanying this report has three newly enabled, live-tested collectors: TED, USAspending and Grants.gov. They run through the existing scheduled pipeline once this local revision is deployed. No new API credentials are required for those three collectors. The public deployment has not been changed as part of this local design review.

## Coverage Matrix

| Market | Connected in the local revision | National or complementary source | Access status | Material gap |
|---|---|---|---|---|
| United Kingdom | Existing seven UK sources | Existing source registry | Already configured | Source registry is not a claim of complete buyer-portal coverage |
| United States | USAspending awards; Grants.gov funding | SAM.gov; NYC City Record | SAM key required; NYC public query tested without a key | No live federal tender collector enabled |
| Italy | TED | ANAC BDNCP / Open Data | Official national data exists; production read contract needs confirmation | National-only notices and current national change feed |
| Germany | TED | Bekanntmachungsservice | Open export specification verified without credentials | National export importer not yet implemented |
| Spain | TED | PLACSP syndication | Public Atom feeds documented | Domestic, aggregated and preliminary-consultation feeds need importing |
| Greece | TED | KIMDIS OpenData | Public API documented; endpoint reached, nonempty search not validated | National API reliability and normalization need further validation |
| Finland | TED | HILMA AVP-Read | Free; self-service subscription/API key | National-only notices |
| Norway | TED | Doffin Public API | Public-read API documented; production entitlement needs confirmation | National-only notices |
| Denmark | TED | udbud.dk data synchronization API | System-provider registration | Below-threshold notices and purchasing plans |
| Sweden | TED | Registered national notice databases | Provider-specific agreements/access | Fragmented national coverage |
| Iceland | TED | Utbodsvefur | Official notice website and alerts; supported public API not verified | National-only notices |

Sources and evidence for the access distinctions appear in the country sections below. "Connected" means real records were successfully collected and normalized locally, not that every notice has an AI assessment or that nationwide coverage is exhaustive.

## European Foundation: TED

TED offers anonymous access to published notices through `POST https://api.ted.europa.eu/v3/notices/search`. The public search service is distinct from submission APIs that require authentication. It supports query expressions over indexed procurement fields and links to published notice formats. This makes it the most practical common source for the selected European countries.[^1]

The iteration mode avoids the 15,000-result ceiling of numbered pagination. The documented limits include 250 notices per page and 10,000 returned fields per page; the implementation uses 200 records and an explicit field list. A new `iterationNextToken` drives subsequent requests. A page budget, repeated-token detection and timeout/schema checks prevent an incomplete response being recorded as a successful full collection.[^2]

### Implemented Mapping

- Buyer country determines the market. Place of performance is retained separately as geography; the two concepts are not interchangeable.
- Countries include Italy, Germany, Spain, Greece, Sweden, Finland, Denmark, Norway and Iceland. The existing UK sources remain the primary UK collection route.
- Procedure and lot descriptions are retained in their published language. An English language value is selected when supplied; native-language descriptions are not falsely presented as translated.
- Competition, planning, result and contract-modification forms are handled separately. Unknown form families are not automatically classified as live tenders.
- Original currencies are preserved. Award totals are not substituted for a live tender's estimated value.
- The single published lot date/time pair can be combined. Multiple-lot search arrays are not assumed to have reliable cross-field alignment; the earliest date is shown with a source-check warning.
- Notice/publication identifiers preserve traceability. A changed country-query version triggers a fresh lookback rather than silently skipping newly enabled countries.

These are implementation decisions based on verified API responses. Exact submission rules, exclusions, lot-specific deadlines and eligibility remain matters for the full official notice. TED publishes searchable notices, not a universal guarantee of domestic below-threshold coverage. The developer resources provide direct XML, HTML and PDF access for deeper enrichment.[^3]

### Quality Priorities

The initial CPV query covers software, IT services, market research and relevant management consultancy. CPV recall is useful for native-language notices but can still include licence renewals, hardware-adjacent services or unrelated consultancy. Anthrion's deterministic prefilter narrows this set, and AI assessment remains evidence-based rather than assigning confidence merely because a relevant code is present.

The next enrichment priority is language-aware relevance, not indiscriminately widening every CPV family. Preserve original excerpts for grounding; add separately labelled English summaries; evaluate retrieval against a manually reviewed sample from each country. A low or pending evidence assessment is preferable to fabricated certainty.

## United States

### SAM.gov: Live Federal Opportunities

The production endpoint is `GET https://api.sam.gov/opportunities/v2/search`. A public API key is mandatory. It is requested through the account-details area of SAM.gov; daily allowances depend on account roles. Queries require a posted-date range, with a maximum one-year interval, and support procurement type, title, agency, NAICS and related fields. The maximum page size is 1,000, with a zero-based page index.[^4]

SAM.gov is a free government service. There is no need to purchase a third-party subscription simply to obtain its public API key. Commercial registration-assistance services are separate from GSA's own service. Access to the public API is also separate from the qualifications and registrations required to bid for a particular award.[^5]

Keep `SAM_API_KEY` in the server-side environment or GitHub Actions secret store, never in a browser bundle, public URL, checked-in file or chat. The current local revision does not enable SAM collection because no key has been supplied. A robust future adapter should preserve notice IDs, distinguish sources-sought and presolicitation notices from solicitations and awards, and fetch sufficient description detail before assessment.

Do not replace the official API with an automated scraper of the SAM website. SAM's terms prohibit automated scraping and direct programmatic access toward authorized data services. A keyless workaround that bypasses this restriction is not a sustainable production connection.[^6]

### USAspending: Award and Incumbent Intelligence

USAspending's documented endpoints currently require no authorization. The connected route is `POST https://api.usaspending.gov/api/v2/search/spending_by_award/`. It provides award-level results, including descriptions, agencies, recipients, amounts and performance dates. These are awarded contracts, not invitations to submit a bid.[^7]

The implementation queries a rolling 90-day transaction-activity window using tightly relevant commercial keywords. It follows pagination until exhausted, validates the page envelope and preserves successful prior data on failure. Date filtering is not represented as a last-modified cursor: the rolling replay is intentional protection against revisions.

Award amounts in this connector are reported obligations, not guaranteed remaining opportunity value or an inferred reprocurement budget. Published performance end dates can support a renewal watch, but the application explicitly labels replacement procurement as unconfirmed. Do not infer an open tender from a supplier's contract nearing its end. Larger historical backfills and award detail retrieval should be added as separate, controlled jobs.[^8]

### Grants.gov: Federal Funding

Both `search2` and `fetchOpportunity` are explicitly available without authentication or an API key. The public search endpoint is `POST https://api.grants.gov/v1/api/search2`; detail retrieval is `POST https://api.grants.gov/v1/api/fetchOpportunity`. Other Grants.gov APIs may have different authentication requirements, so the keyless claim applies to these two endpoints only.[^9]

The collector searches active and forecast funding using relevant phrases, follows `startRecordNum` pagination and retrieves full detail records. It retains applicant restrictions and award floors/ceilings. It also rechecks previously active opportunities that disappear from the active search, preventing a withdrawn or closed funding call remaining indefinitely labelled open.[^10]

Many AI research calls are limited to US universities, nonprofits, small businesses or other defined applicant categories. A keyword match does not establish that Anthrion may apply. Funding is therefore presented in its own category, and the detailed announcement remains authoritative for eligibility and local submission cutoffs.[^11]

### Keyless Local Procurement: New York City

NYC's official DCAS City Record Online dataset includes solicitations, awards and other public notices. Its canonical dataset is `dg92-zbpx`, with a public JSON route at `https://data.cityofnewyork.us/resource/dg92-zbpx.json`. The dataset describes notice identifiers, agencies, dates, notice types, procurement identifiers and document links. It is not a nationwide US feed.[^12]

A credential-free query succeeded and returned a September 2026 procurement-related notice. This establishes that keyless US procurement data is available beyond awards and grants. It is researched and tested, but not connected in this revision. Use the canonical DCAS dataset rather than community-created filtered views with similar names.

Socrata permits simple public queries without an application token, with lower shared-IP throttling limits. For scheduled higher-volume collection, a token can improve quota attribution. An adapter should explicitly filter procurement sections and distinguish solicitations from intent-to-award notices; local timestamps require New York timezone interpretation.[^13]

## National European Sources

### Germany: Bekanntmachungsservice

The official OpenData API is `GET https://oeffentlichevergabe.de/api/notice-exports`. Its specification was successfully retrieved without credentials. Choose either `pubDay` or `pubMonth`, not both. Available ZIP formats are `eforms.zip`, `ocds.zip` and `csv.zip`; the export windows use Europe/Berlin and include published notice versions processed before the previous midnight.[^14]

This is a strong next integration because OCDS can reuse parts of the current normalization pipeline. Start with daily exports and retain all notice versions before reconciling changes. Never extract untrusted ZIP member paths directly; enforce compressed/uncompressed size limits. Match national records to TED using explicit identifiers, not just similar translated titles.

The national publication policy supports open reuse, but the service's coverage should still be measured by participating publication routes rather than described as every German purchasing portal. Preserve source attribution and a direct notice link in each record.[^15]

### Spain: PLACSP

The Ministry of Finance identifies separate open-data sets for hosted buyer profiles, aggregated notices from other platforms, minor contracts, in-house arrangements and preliminary market consultations. Processing only one feed would leave meaningful national gaps.[^16]

The verified hosted-profile feed is `https://contrataciondelsectorpublico.gob.es/sindicacion/sindicacion_643/licitacionesPerfilesContratanteCompleto3.atom`. The Ministry documents daily publication of the previous day's changes, a maximum of 500 entries per file, Atom next links and monthly/yearly compressed archives. Repeated entries for a procurement can represent revisions rather than independent opportunities.[^17]

Use an XML parser with external entities disabled. Preserve Atom IDs, update timestamps, CODICE procurement identifiers, amounts/currencies, buyer information and linked documents. Follow pagination only within approved hosts. Add the aggregated feed separately, then preliminary consultations, which may be particularly valuable for early-stage business development. National identifiers should be retained for deduplication against TED.[^18]

### Greece: KIMDIS

KIMDIS documents public read APIs separately from authenticated submission APIs. The public notice search is `POST https://cerpp.eprocurement.gov.gr/khmdhs-opendata/notice?page=0`. The documentation describes daily data refresh, a 350-request-per-minute limit, CC BY 4.0 reuse and a maximum 180-day search interval. Other read resources cover requests, awards, contracts, payments and linked procurement chains.[^19]

The endpoint was reached anonymously: a narrow CPV/date query returned a structured no-results response; a broader query timed out. Therefore, authentication-free access is documented, but a reliable nonempty production collection is not yet established. Do not enable a "healthy" national feed based on this probe alone.

Implementation should use short date partitions, exact validated CPV codes, conservative retries, page-envelope checks and explicit no-results handling. Preserve ADAM references and links to source PDFs. No key is needed for the documented read interface; the Basic Authentication described elsewhere applies to submission, which this tracker does not need.

### Italy: ANAC / BDNCP

ANAC is the authoritative national starting point for procurement records. Its published transparency research describes the Open Data portal as exposing BDNCP datasets, historically with monthly extracts. This supports national enrichment and historical analysis, but is not sufficient evidence of a current daily opportunity-change API.[^20]

The national catalogue was blocked by its access layer during validation, and a candidate OCDS API root returned HTTP 404. Neither result proves that the underlying national data is unavailable; they mean an exact production endpoint and access contract remain unverified. An older B2B specification includes development-server placeholders and procurement-publication operations, so it must not be treated as a validated anonymous read API.[^21]

Continue with live TED coverage while confirming ANAC's current catalogue resources, production read documentation, update cadence and CIG/lot identifiers. ANAC's website reuse notice specifies CC BY 4.0 unless otherwise stated; check the individual dataset terms and preserve attribution.[^22]

## Nordic National Coverage

### Finland

HILMA distinguishes AVP-Read from ETS-Write. AVP retrieves open procurement data, is free, permits commercial use and is available immediately after creating a subscription. Keys are managed in the self-service portal; request rates are limited per key, and the API does not provide CORS headers. A backend scheduled collector is therefore appropriate. ETS publication approval is unrelated to read-only monitoring.[^23]

Recommended action: obtain an AVP subscription, then validate incremental retrieval and national-only notices. This is a high-value addition because it expands Finland beyond TED without requiring a commercial feed purchase.

### Norway

Doffin's developer material distinguishes its notice-publication API from a Public API for searching and downloading published notices. The production portal describes sign-up and subscription tokens, while the inspected API catalogue exposing the public-read description is the development portal. Production read entitlement, quota and exact endpoint must be confirmed before enabling a connector.[^24]

Use TED for the current Norwegian feed. Do not base a new integration on a legacy Doffin scraper or assume that an eSender publishing account automatically grants the correct read product. National notice access should be validated separately from submission services.[^25]

### Denmark

udbud.dk explicitly offers data retrieval for businesses and authorities through system-provider API access. Its documentation distinguishes `MU_API_DATASYNK`, for retrieving data, from publication access. Registration routes exist for domestic, EU and other providers. The service includes below-threshold purchasing and planned purchases, making it complementary to TED.[^26]

Recommended action: apply for data-synchronization access and validate the linked OpenAPI specification against the approved account. Review reproduction terms for notice content; do not assume that public website visibility automatically permits unrestricted republication.

### Sweden

Sweden's national notice market is fragmented. The procurement authority identifies registered databases operated by Mercell, Antirio/Kommers, e-Avrop, Konstpool and Clira in its 2025 statistics. Above-threshold procurement generally appears both in TED and a registered national database. The authority's statistical reporting interfaces should not be confused with an unrestricted live-notice API.[^27]

Recommended action: use TED now, and request reuse/API terms from the registered database operators for national coverage. Evaluate incremental update access, document rights, stable identifiers and supplier-alert exports. Annual statistics are useful for evaluating coverage, not as a substitute for daily opportunity monitoring.[^28]

### Iceland

The official Utbodsvefur service publishes public procurement advertisements, including notices above domestic/international thresholds and optional below-threshold announcements. It supports notice subscriptions. A maintained, documented public read API was not verified in this assessment.[^29]

The local Nordics view now includes Icelandic TED notices. For national expansion, obtain a supported feed/export or permissioned alert route from the service owner. Do not claim an undocumented internal website endpoint as a production API.

## Operating Model

### Daily Collection and Publication

Retain isolated source jobs, independent checkpoints, bounded retries and schema validation. Publish a new dataset only after validation; preserve previous records when a source fails. Display source-specific freshness rather than allowing one successful import to imply every country's source is current. The existing schedule can include the newly enabled sources when this revision is deployed; a local preview alone does not update the public scheduled job.

Prefer incremental collection where the provider actually supports it. Use daily partitions or deliberate rolling replays elsewhere. Page-count limits are safety controls, not evidence that an import is complete. Treat HTTP 200 error envelopes, timed-out searches and repeated tokens as failures or partial collections. Keep API credentials out of all public datasets, repository history and frontend environment variables.

### Data Semantics

Use separate fields for buyer jurisdiction, delivery geography, publication time, update time and submission deadline. Retain native currencies and distinguish estimated tender value, award obligations and funding ceilings. Currency-unknown values must never acquire a GBP symbol by default. Cross-currency ranking needs a chosen currency or a dated exchange-rate policy; it should not compare raw USD, EUR and NOK numbers as though they were equivalent.

The local interface now supports an explicit currency filter. Value ranges and value sorting use that currency, or the market default (GBP for UK, USD for US, EUR for European markets). Other currencies are not numerically compared with it. Nordic users can select currencies present in their market's records; no exchange-rate conversion is implied.

Preserve notices and amendments as evidence. Reconcile related records using official identifiers and lot references. A similar title does not prove two notices describe the same procurement. An award is not an open tender; a grant is not automatically accessible to a commercial supplier; a contract end date is not a confirmed reprocurement.

### Relevance and Assessment

Build a reviewed evaluation set for each market containing strong matches, adjacent opportunities and clear false positives. Measure retrieval recall and precision separately from assessment quality. National language handling, eligibility, framework membership, geography and delivery constraints all affect usefulness.

Seven records in the current local dataset have completed grounded AI assessments; newly imported records remain pending where they have not been assessed. This import deliberately used zero additional Gemini calls. Country coverage and record counts must not be represented as completed opportunity diligence. Budgeted multilingual assessment and source-document enrichment are the next quality work, with exact source excerpts retained for auditability.

## Delivery Evidence and Roadmap

The initial new-source import retrieved 1,440 TED notices, 98 USAspending award records and 162 Grants.gov records. All three source collections completed successfully. After filtering, reconciliation, retention and separately identified renewal watches, the local public dataset contains 2,176 signals. Counts are not the same as unique open tenders, and joint-country notices can appear in more than one geographic tally. Validation took place on 9-10 September 2026.

| Next work | Priority | Acceptance condition |
|---|---|---|
| SAM federal tender access | High | Free key supplied; pagination, description retrieval, notice types and account quota verified |
| Multilingual assessment | High | Country-level relevance evaluation and grounded summaries; no invented eligibility |
| Germany daily exports | High | Complete daily partitions, safe ZIP handling and duplicate reconciliation with TED |
| Spain hosted + aggregated feeds | High | Atom revisions, CODICE normalization and replay tested |
| HILMA AVP | High | Read subscription, national-only samples and update cursor validated |
| NYC local procurement | Medium | Canonical dataset, type classification, Eastern-time deadlines and freshness checked |
| Greece KIMDIS | Medium | Reliable nonempty bounded queries and ADAM record linkage demonstrated |
| Italy ANAC national feed | Medium | Exact current production read contract and refresh cadence verified |
| Denmark / Norway | Medium | Correct read product approved and tested |
| Sweden / Iceland | Medium | Supported provider feed or reuse arrangement confirmed |

Engineering checks completed for this revision include 48 pipeline tests, 9 frontend unit tests and 34 desktop/mobile browser tests. The production build also passed. Checks cover collection failures, pagination, timestamps, currencies, source scoping, real market records, saved views, comparison, responsive layouts, accessibility and moving shader pixels. Category labels were additionally checked for containment at 12 viewport widths. Those checks establish implementation behaviour, not exhaustive procurement coverage or an API availability SLA.

## Sources

All undated documentation below was checked on 9-10 September 2026. Publication dates are stated only where supported by the source; search-engine crawl dates are not treated as publication dates.

[^1]: Publications Office of the European Union. [TED Search API](https://docs.ted.europa.eu/api/latest/search.html). Public access and search purpose.
[^2]: Publications Office of the European Union. [TED Search API reuse guide](https://docs.ted.europa.eu/ODS/latest/reuse/search-api.html). Pagination modes, tokens and limits.
[^3]: Publications Office of the European Union. [Developers' corner for reusers](https://ted.europa.eu/en/simap/developers-corner-for-reusers). Search fields and published notice formats.
[^4]: US General Services Administration. [SAM.gov Get Opportunities Public API](https://open.gsa.gov/api/get-opportunities-public-api/). Production endpoint, account key, query fields and paging.
[^5]: US General Services Administration. [System for Award Management](https://sam.gov/SAM/). Free government service; public API key procedure is specified in source 4.
[^6]: US General Services Administration. [SAM.gov Terms of Use](https://sam.gov/about/terms-of-use). Authorized data access and scraping restrictions.
[^7]: US Department of the Treasury. [USAspending API endpoints](https://api.usaspending.gov/docs/endpoints). Authorization and award endpoint inventory.
[^8]: US Department of the Treasury. [USAspending API](https://api.usaspending.gov/). Award/spending data scope; field behaviour was also validated against live public responses.
[^9]: Grants.gov. [API Guide](https://www.grants.gov/api/api-guide). Explicit anonymous access for search2 and fetchOpportunity.
[^10]: Grants.gov. [Search2](https://www.grants.gov/api/common/search2). Search parameters and response structure.
[^11]: Grants.gov. [FetchOpportunity](https://www.grants.gov/api/common/fetchopportunity). Eligibility, funding values and opportunity detail schema.
[^12]: NYC Department of Citywide Administrative Services. [City Record Online](https://data.cityofnewyork.us/City-Government/City-Record-Online/dg92-zbpx). Canonical dataset, notice scope and fields.
[^13]: Tyler Technologies / Socrata. [Application Tokens](https://dev.socrata.com/docs/app-tokens.html). Anonymous access and throttling distinctions.
[^14]: Bekanntmachungsservice. [OpenData OpenAPI specification](https://oeffentlichevergabe.de/documentation/api/opendata), version 1.0.0. Live specification retrieved successfully; formats, date windows and endpoint.
[^15]: Bekanntmachungsservice. [Open Data policy](https://oeffentlichevergabe.de/ui/de/Open-Data-Richtlinie). National reuse/publication context.
[^16]: Spanish Ministry of Finance. [Licitaciones publicadas en la Plataforma de Contratacion del Sector Publico](https://www.hacienda.gob.es/es-ES/GobiernoAbierto/Datos%20Abiertos/Paginas/licitaciones_plataforma_contratacion.aspx). Dataset families and technical resources.
[^17]: Spanish Ministry of Finance. [Hosted buyer-profile notices](https://www.hacienda.gob.es/es-es/gobiernoabierto/datos%20abiertos/paginas/licitacionescontratante.aspx). Daily updates, feed URL, 500-entry files and archives.
[^18]: Spanish Ministry of Finance. [Preliminary market consultations](https://www.hacienda.gob.es/es-ES/GobiernoAbierto/Datos%20Abiertos/Paginas/ConsultasPreliminaresMercado.aspx). Complementary early-engagement dataset.
[^19]: Greek public procurement service. [KIMDIS API Help](https://cerpp.eprocurement.gov.gr/khmdhs-opendata/help). Read/submission separation, licence, refresh, limits and resources.
[^20]: ANAC. [Comparative analysis of proactive transparency policies, May 2023](https://www.anticorruzione.it/documents/91439/171926/Anac%2B-%2BAnalisi%2Bcomparata%2Bdelle%2Bpolitiche%2Bdi%2Btrasparenza%2B-%2Bfocus%2Bappalti%2Bpubblici%2B-%2Bmaggio%2B2023.pdf/3cc7476f-0b07-0ec7-e066-6b1a91d0f2e9?t=1685440728143). Historical national open-data publication context; not evidence of current daily API freshness.
[^21]: ANAC. [Integrazione B2B Appalti specification](https://anticorruzione.github.io/). Development-oriented publication operations; not accepted here as a production anonymous-read contract.
[^22]: ANAC. [Copyright and reuse](https://www.anticorruzione.it/copyright). CC BY 4.0 unless otherwise specified.
[^23]: Hansel / HILMA. [HILMA API portal](https://hns-hilma-prod-apim.developer.azure-api.net/). AVP/ETS distinction, free commercial read access, subscription and CORS constraints.
[^24]: Norwegian Agency for Public and Financial Management. [Doffin production API portal](https://dof-notices-prod-api.developer.azure-api.net/). Registration/subscription context.
[^25]: Norwegian Agency for Public and Financial Management. [Doffin development API catalogue](https://dof-notices-dev-api.developer.azure-api.net/apis). Public API search/download description, distinguished from publication API.
[^26]: Danish udbud.dk service. [Help for system providers](https://udbud.dk/hjaelp/hjaelpSystemudbydere). Registration routes, data-sync product and reuse terms.
[^27]: Swedish National Agency for Public Procurement. [Procurement notices in 2025](https://www.upphandlingsmyndigheten.se/statistik/upphandlingsstatistik/statistik-om-annonserade-upphandlingar-2025/drygt-18-000-upphandlingar-annonserades-2025/). National registered database operators and TED context.
[^28]: Swedish National Agency for Public Procurement. [Methods and quality](https://www.upphandlingsmyndigheten.se/statistik/metod-och-kvalitet/). Statistical data collection scope.
[^29]: Icelandic government. [Tender website](https://island.is/en/tender-website). Official national notice service and subscriptions.
