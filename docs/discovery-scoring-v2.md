# Discovery and Scoring V2

## Intent

Implement the supplied brief's high-recall, needs-led discovery without treating a historical company profile as a capability whitelist. Supplier credentials and references remain evidence-bound. The public interface is dark-only; the existing glass, chrome, markets, console, saved opportunities and source links are retained.

## Implemented

- 24 configurable capability/query families covering Salesforce, vendor-neutral CRM, relationship and case management, portals, contact centres, revenue, marketing, data, integration, analytics, field service, workflow, standalone AI, agents, documents, managed services and technical contracting.
- Original source text is preserved. Discovery aliases cover English plus German, Italian, Spanish, French, Dutch, Swedish, Finnish, Norwegian, Danish, Greek and Portuguese. AI summaries and proposed approaches are requested in English; quoted evidence stays in its original language.
- Independent GOV.UK queries, per-query offsets, frozen search cycles and fair rotation when the request budget is smaller than the query catalogue. These are source-specific queries, not one Boolean expression that requires every capability.
- Existing OCDS feeds retain broad date/status retrieval. TED retains its proven buyer-country/CPV query. This is not a claim of comprehensive national or worldwide coverage.
- Bounded, resumable 365-day discovery backfill for OCDS cursor/monthly, TED and GOV.UK adapters. At most 25% of each eligible source's page budget is reserved for history, with separate checkpoints. Budgets under four pages prioritise fresh retrieval. Catalogue version changes restart the historical lane, not the fresh checkpoint.
- Older open, engagement and future notices remain in the active dataset. Terminal notices retain existing archive/provenance protections. Existing active records are reassessed even when they were not published today.
- Explicit lifecycle states: open, early engagement, future, awarded, closed, expired, cancelled, withdrawn and unknown. Structured status takes precedence over contradictory deadlines. Browser checks also expire deadlines between collector runs.
- Awards and unconfirmed award-derived renewals are now retained only in underlying source history, not the public website. Closed, expired, cancelled, withdrawn and confirmed-ineligible records are also excluded from every public view. Unknown supplier eligibility does not exclude an opportunity. A named incumbent Microsoft/SAP estate is not a competing-platform lock-in.
- Conservative hard exclusions for explicit non-supplier permanent roles, unrelated physical scope, or explicit competing-platform restrictions with no separately stated AI/integration route. Ambiguity is retained for review.
- Exact-quote validation, known capability identifiers, duplicate-requirement rejection, schema validation and versioned analysis caching. The model classifies; Python computes scores.
- Pending assessment is never replaced with a keyword-derived fit score. A model/rubric/charter/content change invalidates the previous fit rather than mixing different scoring systems.

## Fit, Confidence and Ranking

Technical fit has a fixed denominator:

| Component | Maximum | Calculation |
| --- | ---: | --- |
| Requirement coverage | 60 | Importance-weighted matches: direct 1, strong .8, plausible .55, weak .25, none 0. Mismatches remain in the denominator. |
| Solution route | 25 | Explicit ecosystem 25; vendor-neutral direct 23; functional architecture 20; adjacent 15; indirect 8; none 0. |
| Delivery | 15 | Build 15; implementation with advisory 13; managed support 11; discovery 9; technical contract staffing 7; licences 4; no relevant service 0. |

References, geography, contract value, timing and supplier qualifications do not add or subtract technical fit points. A requirement may map to a credible standalone AI solution without Salesforce.

Confidence = 40% source authority + 35% requirements completeness + 25% lifecycle certainty. Sparse listings and one-requirement assessments are not treated as complete specifications. Positive implementation scores require an explicit delivery verb in the cited source-language scope; a software catalogue alone is insufficient.

The model must identify the assessed scope: whole requirement, separately addressable lot/category with evidence, or partial/uncertain scope. Partial scope is review-only, its route contribution is capped at the adjacent level, and it does not enter Top Signals. Proposed products are labelled as a possible solution, not as buyer facts or an agreed approach.

Recommended ordering is an explicit tuple: non-excluded first, open before engagement before future before unknown/terminal, then fit, confidence, nearest future deadline, and material-update recency. No additive recommendation bonus or keyword substitute is used. Top Signals requires current verified analysis, fit >=80, confidence >=65, non-sparse scope and an actionable lifecycle, with no confirmed eligibility blocker.

Search covers buyer/title/scope/identifiers, English assessments and possible components. Exact capability aliases can retrieve mapped functional matches across languages. Short search terms are token-matched so `AI` does not match `maintain`. Publication recency and material-update recency have separate sorts; currency filtering remains explicit.

A fresh visit opens Live Opportunities when no verified Top Signals are available. Explicit views and deep links are respected. Top Signals remains selectable with a clear pending/empty state and a working route to all records.

## Operations

- Capability charter and aliases: `config/capabilities.yaml` and `config/discovery_languages.yaml`.
- Fixed scoring tables: `config/scoring.yaml`.
- Reassess local canonical records without fetching sources: `python -m anthrion_signal.cli rescore --max-ai 30`.
- Offline migration/verification: `python -m anthrion_signal.cli rescore --no-ai`.
- Normal scheduled collection: existing `python -m anthrion_signal.cli ingest` workflow. No extra scheduler or duplicate automation was created.
- AI-call budgets remain enforced. Work is shared across markets. Explicit short provider retry delays are honoured; daily quota failures stop the batch. Authentication failures also stop it. Prior records and successful assessments survive provider failures.
- No repository push or deployment was performed for this iteration.

## Deliberate Limits

- The broad worldwide source list in the brief is an extension roadmap, not automatically connected coverage. Existing source adapters and their disclosed coverage remain unchanged. US live federal procurement still requires its own source access; award/grant sources are not represented as live SAM notices.
- Backfill is bounded, not an exhaustive crawl. Sources can omit older records or supporting attachments. Unsupported adapters do not acquire a fictional historical cursor.
- Linked documents are not assumed read. Only collected source facts can be quoted. Matching still requires human review before a procurement decision; exact quotations alone do not establish that every model interpretation is correct.
- Supplier certifications, framework membership and local eligibility are not invented. Product suggestions do not establish reseller authorisation.
- Local browser contract tests use in-memory assessment fixtures to remain independent of Gemini quota. Separate browser tests inspect the unmodified feed. Fixtures are never written into public assets or canonical data.

## Local Verification

The initial re-scoring attempt received two responses and a 429 limit error. Inspection identified an inferred delivery scope in a software catalogue, so stronger scope/delivery validation was added and those earlier assessments invalidated. A subsequent attempt was also rate/quota-limited. Four API calls were attempted in total, below the authorised maximum of 30; remaining ratings are pending rather than fabricated. Re-run the same bounded command after quota becomes available.

Pre-migration local state is preserved in `artifacts/before-discovery-v2/`. Source collection checkpoints were not advanced by re-scoring. No source requests or global-market backfill were run during this local migration.

Verification completed: 98 backend tests, 18 frontend unit tests and 46 desktop/mobile browser tests passed, including separate unmodified-feed checks. TypeScript/Vite build, Ruff, whitespace checks and public-output credential/URL validation passed. All 2,176 public record IDs match the pre-migration snapshot; source checkpoints are byte-for-byte unchanged. Real-feed screenshots are in `artifacts/discovery-v2-real-desktop.png` and `artifacts/discovery-v2-real-mobile.png`.

Official naming references checked while building the capability catalogue: [Salesforce Headless360](https://www.salesforce.com/headless/), [Salesforce Data 360](https://www.salesforce.com/data/headless/?bc=OTH), and [Informatica / Salesforce](https://www.informatica.com/salesforce.html). These establish product vocabulary, not Anthrion supplier qualifications.

## Sales-Only Collection Trial

The subsequent 10 September collection used `ingest --max-pages 24 --no-ai` against nine enabled sources. It fetched 4,603 raw records, merged 714 duplicates and found 845 previously unseen canonical records, including historical/terminal notices. The first availability pass admitted 233 new candidates. Further review removed general publications and incidental technology mentions; final figures are recorded in `docs/collection-trial-2026-09-10.md`.

GOV.UK directory entries, retrospective case studies and general guidance are not buying signals. Other general publications need explicit buying, supplier-engagement or funding-application intent. Procurement portal URLs and bidder-registration instructions do not count as buyer requirements. Physical, clinical and insurance service delivery is distinguished from software procurement for that service; independently addressable software lots remain reviewable. The final trial retained 196 new public candidates, including 32 in the UK; ratings remain pending.

The award-only USAspending collector is disabled. Award/update events from procurement feeds are still collected internally to retire previously open opportunities. No new automation or deployment was created. On Windows, the local Vite preview held the public JSON file open; stopping that preview, exporting the saved dataset, and restarting resolved the local file lock without repeating collection.

The inspector's duplicate labels and shortcut row, footer, attribution page, rotation button, Awards and inferred Renewals refiners were removed. Source notice links and detailed evidence remain available. Scrollbars are hidden while scroll containers remain keyboard-focusable. The source button uses continuous reflected light instead of moving cropped frame textures through its face.
