# Sales-Only Collection Trial

## Scope

Local collection and preview only. No push, deployment, new scheduler, Gemini calls or provider/billing changes were made. Source history remains available internally for reconciliation; unavailable contracts are not published as sales opportunities.

## Results

Collection: `python -m anthrion_signal.cli ingest --max-pages 24 --no-ai`, starting 10 September 2026 at 23:19 BST. Subsequent offline `rescore --no-ai` runs refined publication rules without fetching sources again. Final dataset generated at 23:53 BST.

| Measure | Count |
| --- | ---: |
| Enabled sources attempted | 9 |
| Raw source records fetched | 4,603 |
| Previously unseen canonical records | 845 |
| Duplicate records merged | 714 |
| Material updates | 46 |
| Canonical records retained after retention | 2,422 |
| Public candidates after final cleanup | 1,116 |
| Public UK candidates | 192 |
| New public candidates compared with the pre-trial snapshot | 196 |
| New UK candidates | 32 |
| Public candidates meeting the AI prefilter threshold of 25 | 268 |
| Newly added candidates meeting that threshold | 48 |
| Gemini calls | 0 |
| Public awards, inferred renewals, terminal states or confirmed exclusions | 0 |

These counts describe candidate discovery, not confirmed Anthrion fit or bidder eligibility. Records with ambiguous scope or unknown qualifications remain reviewable. The AI prefilter is a queue threshold, not a fit rating; the other 848 candidates have not been proven unsuitable. Model-based fit ratings remain pending.

The initial broader pass admitted 233 new candidates. Content review and the final rules reduced that to 196. Intermediate counts in the task were provisional. The final run metadata describes an offline rescore and therefore reports zero newly collected records; the original collection metadata is preserved separately in `artifacts/collection-trial-20260910.json`.

Examples retained for review:

- Replacement Contract Management, Billing and Invoicing System, Kent County Council trading as Procurement Services (`sig_1278247c642ce6a2d459`).
- Victim & Citizen Engagement Technology Solution, BlueLight Commercial Limited (`sig_4109de053106f368a495`).
- Learning Management System and Associated Services, Fairhive Homes Limited (`sig_28cd0a339f3d0d41da3f`).

## Publication Rules

- Awarded, closed, expired, cancelled and withdrawn records are excluded from every public view, search, saved records and exported feed. Confirmed supplier eligibility blockers and explicit scope exclusions are also excluded.
- No award-derived renewal inference is published. A new replacement competition can still appear as a live tender, early engagement or pipeline opportunity.
- Awards and their update events remain in canonical history so a later award can retire a formerly live record. The award-only USAspending collector is disabled.
- GOV.UK directories, retrospective case studies and general guidance are not buying signals. Other general publications require explicit buying, supplier-engagement or funding-application intent.
- Submission-portal hostnames and registration instructions do not create Salesforce or portal requirements. Source text and links remain unchanged for evidence.
- Explicit physical, clinical, insurance and other non-technology service scopes are excluded when there is no stated software, AI or systems scope. A genuine software procurement in those sectors, or a separately addressable software lot, remains eligible for review. These conservative checks do not replace full notice qualification.
- Early engagement, pipeline, frameworks and funding remain because they can offer a future or current route for Anthrion. No open route is invented from an incumbent's contract-end date.

## Coverage Limits

| Source | Records fetched | Result |
| --- | ---: | --- |
| Find a Tender | 295 | Partial; HTTP 429 deferred remaining requests |
| Contracts Finder | 512 | Healthy |
| Public Contracts Scotland | 858 | Partial; monthly collection budget reached |
| Sell2Wales | 0 | Failed; earlier records retained |
| GOV.UK | 1,623 | Partial; remaining query families resume next run |
| Digital Outcomes | 20 | Partial; some detail pages unavailable |
| GCA Upcoming Agreements | 51 | Healthy |
| TED | 1,081 | Healthy |
| Grants.gov | 163 | Healthy |

This was a bounded trial, not an exhaustive backfill. US results are grants, not a replacement for live SAM.gov federal procurement access. No unavailable source was represented as healthy or complete.

## Interface

Removed Awards and inferred Renewals refiners, carousel autoplay, duplicate inspector badges, inspector shortcut row, date footer and attribution page. Full assessment, source notice links, evidence, manual carousel navigation, saved opportunities and comparison remain functional. Scrollbars are hidden without disabling mouse, touch or keyboard scrolling.

The source button no longer animates cropped frame textures across its face. Its reflective border, glass lighting and intentional right-hand icon separator remain. The selected list record retains its liquid-metal border.

The next design proposal is a compact decision brief: one pending status until analysis is ready, evidence-backed fit rationale and next action when available, and a clear deadline/value/source-action group. A very restrained reflected-light background in the gutters could complement the glass. Neither the further inspector redesign nor a new background shader is implemented in this iteration.

## Reproducibility

Pre-trial state: `artifacts/before-actionable-collection-20260910-231837/`. New public counts compare stable IDs against that snapshot's `current.json`.

On Windows, Vite held `app/public/data/current.json` open and blocked atomic replacement. Stopping the local preview, exporting the saved dataset and restarting released the lock without repeating collection.

Backend verification: 134 tests passed. Frontend unit verification: 20 tests passed. All 50 desktop/mobile browser tests passed against the final dataset, including an unmodified-feed check, unavailable-record deep links, scrolling, glass/metal pixel changes, dragging typography, mobile layout and accessibility. TypeScript/Vite build, Ruff, whitespace checks and public-output credential/URL validation passed. Real-feed screenshots are `artifacts/actionable-cleanup-desktop.png` and `artifacts/actionable-cleanup-mobile.png`.
