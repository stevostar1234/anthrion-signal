# Source-only discovery: local trial, 11 September 2026

This report records the local discovery trial and subsequent v1 release preparation. The user approved publishing v1 on 11 September after the final layout refinements. The preview is `http://127.0.0.1:4174/anthrion-signal/`; deployment status is recorded by GitHub Actions, not inferred from local checks.

## Team Workflow

- Salesforce, CRM and clearly related platform implementation opportunities sort first, including combined CRM/AI scope. Standalone AI follows, then other technology opportunities. The chosen publication, update, deadline or value order applies within each group, with no dividing banners. Default order is recent publication.
- Explicit platform requirements and functional needs drive priority. A supplier's Salesforce-hosted submission portal is not evidence that the buyer wants a Salesforce implementation. Matching a capability does not certify bidder eligibility.
- Gemini calls, its SDK and workflow credentials, model scores, recommendations, requirements assessments and Top Signals have been removed from the active product. Public JSON and CSV do not expose historical model output. Source documents and notice timelines remain available.
- Scrolling loads additional visible records without pagination. TanStack Virtual measures variable-height rows, retains keyboard focus and renders only nearby records. A 2,000-record fixture stayed below 50 mounted rows. The initial static dataset is still fetched once: this is DOM virtualization, not server-side paginated search.
- A very subdued dark-glass shader sits behind the workspace. Existing selected-row metal edges, source-button glass, readable text and brand hover effects are retained. Reduced-motion preferences stop decorative animation.
- Hide replaces Compare on records and the inspector. Choices persist in `anthrion-hidden-v1` and synchronize between same-browser tabs. Show hidden in the sort menu displays the hidden-only subset using the current market, category and search filters. Unhide restores the record; bookmarks are preserved. Hidden records do not enter ordinary counts, selected-record links or CSV exports. This is personal browser storage, not shared team suppression.
- A short left-to-right dust dissolve accompanies Hide, and Unhide slides left. The measured virtual list animates row positions without scaling text. Reduced motion commits immediately without particles; particles exist only during dismissal and are capped at 260 per record.
- Saved views, their save button, comparison, and Latest updates navigation are removed. Saved opportunities remain.
- The selected Glass Reading Dock design is implemented in the desktop inspector and mobile drawer: headline and buyer, compact notice type/value/deadline, inline capabilities, then the complete source description. Full details and Open source notice remain outside the scrolling body. The expanded detail view retains the source link and Back to record. No generated concept prose replaces public source text; calendar access, lifecycle cautions, bookmarks and Hide/Unhide remain functional.

## Cross-market Refiners

The five refiners are **All Signals**, **Live Opportunities**, **Pre-market**, **Closing Soon**, and **Added today** in every market. Lifecycle refiners use normalized notice state rather than country-specific form names. Closing Soon requires a confirmed future deadline within seven days; undated or timezone-ambiguous deadlines are not invented. Added today uses the first collection timestamp on the current Europe/London calendar date, including daylight-saving boundaries, not publication or update time.

Frameworks and funding remain discoverable through notice-type filters, not separate refiner cards. Pre-market combines RFI, market engagement, planning and future buying intent. Old `view=updates` links migrate to Added today; framework links become All Signals with the framework type filter. No category implies that Anthrion holds a required framework membership or satisfies local supplier conditions. Awards, incumbent renewals and AI-score-based refiners are absent.

The five glass faces are level and equal-height. On desktop they fit without carousel arrows or dots; smaller screens retain manual horizontal navigation. A slow moving light updates only material reflection variables at up to 25 frames/second. Text does not rotate or scale. Decorative motion pauses for reduced-motion preferences, hidden documents and off-screen refiners.

## Trial Results

The comparison uses `artifacts/before-source-only-20260911-142938/current.json`, captured immediately before this trial, versus the final local public data at 14:19 UTC.

| Measure | Records |
| --- | ---: |
| Previous public dataset | 1,116 |
| Newly discovered records now published | 67 |
| Previous records no longer published | 51 |
| Final public dataset | 1,132 |
| Net increase | 16 |

Newly published records by primary source: Find a Tender 29; German Public Procurement 30; Spanish Public Procurement 5; Digital Outcomes 2; NYC City Record 1. These counts are after deduplication and availability/relevance filtering, not API-response totals.

The final dataset contains 92 platform-priority, 85 standalone-AI and 955 other broad technology candidates. Broad collection intentionally preserves recall; these are discovery candidates, not 1,132 independently qualified sales leads. There are 2,649 canonical records internally, of which 1,484 are unavailable or explicitly excluded and 33 further records fail the current discovery threshold. Terminal history is retained internally so an award/cancellation can retire its earlier lead.

The initial repair trial returned 2,487 raw notices across six sources. Spain/NYC then returned 1,204 raw notices. A final bounded NYC recheck returned 268 notices and corrected one contradictory postponed notice. Six individual official FTS records were re-normalized to replace response-instruction paragraphs in their compact framework labels. These follow-up responses overlap earlier collection and must not be added together as unique leads. No model calls were made.

Notable quality safeguards:

- NYC's Strengthening Communities Database notice is discoverable from its relationship-management needs without falsely claiming Salesforce is mandatory.
- A Systems Integration notice that says bidding is postponed, but carries a placeholder 2039 date, is excluded until a credible replacement response window is published. Ordinary bid extensions remain eligible.
- Physical works, non-technology service delivery, explicit public-institution-only restrictions and submission-portal boilerplate no longer create spurious software priorities. Separately stated software lots remain discoverable.
- Officially identified framework competitions remain frameworks. Long framework-description paragraphs are no longer used as names; source descriptions and documents remain intact.

## Sources and Remaining Gaps

| Source | This revision | Current limitation |
| --- | --- | --- |
| Germany | New anonymous official daily OCDS/eForms adapter; national-only opportunities supplement TED | Initial completed-day backfill remains partial and resumable |
| Spain | New official PLACSP Atom/CODICE adapter with terminal-state handling and bounded pagination | Published feed dated 8 September; newer coverage not verified; offset-free deadlines are preserved as source-local facts |
| NYC | New anonymous official DCAS/Socrata adapter, daily cache, lifecycle reconciliation and New York timezone handling | Municipal coverage only; not a substitute for federal SAM.gov |
| Sell2Wales | Permitted public-listing fallback returns current notices | Official OCDS/export service still has an upstream HTTP 500 data-conversion error; fallback is partial, not a repaired API |
| Find a Tender | Retry-After persistence, incomplete-window resume and bounded enrichment | Trial page budget left catch-up windows pending |
| Public Contracts Scotland | Monthly/type partitions rotate and resume | Budget-limited catch-up remains partial |
| Digital Outcomes | Pagination now sees 37 listings rather than the former first 20; detail cache and deadlines added | Some official detail pages fail or defer; retained listings are not claimed as fully hydrated |
| Grants.gov | Detail requests count toward the budget; unchanged details cached | Partial detail hydration resumes on later runs |

Contracts Finder, GCA Upcoming Agreements and TED remain enabled. No source currently claims complete market coverage. Some sources are partial because a safe page budget was reached, not because requests failed.

Research and activation evidence:

- [European sources, national coverage and Spain integration](free-europe-apis-2026-09-11.md)
- [US/global sources and GitHub budget](free-us-global-apis-actions-budget-2026-09-11.md)
- [Source reliability repairs](source-reliability-2026-09-11.md)

Further promising candidates include LA RAMP, World Bank procurement, CanadaBuys and Finland's HILMA. They are not counted as enabled coverage: outstanding work includes task-order eligibility, new-country market choices, deadline semantics, lifecycle checks or a free user-managed key. SAM.gov is free but requires its official API key for federal opportunity access. Award-only USAspending remains disabled. Restricted or undocumented interfaces have not been bypassed.

## Monthly Pacing

The repository is public, so standard GitHub-hosted runner time is free. Procurement API calls are separate from both Actions minutes and GitHub's REST API allowance. Five configured runs per day mean 150-155 scheduled cycles per month, plus manual/push runs. No common monthly procurement-call entitlement exists. [GitHub Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions), [GitHub REST limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api).

| Integration | Ordinary logical-request envelope after catch-up |
| --- | --- |
| German daily exports | Two paired files/day: about 60-62 per month, plus missed-day catch-up |
| NYC daily snapshots | At most six requests per completed daily cycle: up to 180-186 per month; unfinished cycles and deliberate manual refreshes are additional |
| Spain | At most three pages/tick: up to 450-465 per month while catching up; conditional head checks reduce transfer when unchanged |
| Existing incremental sources | Bounded overlapping windows, provider retry delays, rotating cursors and cached details; actual volume depends on change rate |

These are configured operating envelopes, not provider promises or measured monthly totals. Retry attempts, robots checks and any auxiliary requests must be counted separately. The global maximum of 80 pages/source/run is an upper bound, not a target. No source needs its full history downloaded five times daily. Daily sources and unchanged detail pages reuse their state; incomplete work resumes without silently skipping a window.

The workflow's Pages artifact retention is one day. Storage and larger runners remain separate billing considerations. If the repository becomes private, re-budget against the applicable plan's runner-minute allowance before retaining this frequency. The detailed report contains private-plan scenarios and a measured existing-hosted-run example; that example is not a cost prediction for this new local revision.

## Verification

- Collection trial: 271 Python regression tests passed; Ruff passed. Backend code and data were not changed by the subsequent record-panel implementation.
- 28 frontend unit tests passed after the final lighting correction; TypeScript and Vite production build passed.
- After the final header and record-spacing refinements, 87 desktop/mobile browser tests passed against the 1,132-record trial dataset and isolated fixtures. One duplicate mobile reference-image capture was intentionally skipped; the reference is a desktop component. The suite covers corrected framework labels, postponed-notice handling, personal hiding, the five fixed refiners, the header controls and persistent action dock. Record-layout fixtures are independent of any expiring live tender.
- Browser checks include 320-1920px geometry, stable refiner typography, glass/reflection motion, reduced-motion behavior, source-only views/CSV, market navigation, legacy URL migration, large-list virtualization and accessibility scans.
- Final schema/public-output validation passed for 1,132 records; no credential-shaped values or unsafe links found. No public framework label exceeds 160 characters.
- Reviewed visible routes, Filters, the sort/hidden menu, empty hidden results, record overview and source timeline contain no implementation/review-only copy. Saved-view UI is absent.
- Hide/Unhide checks cover persistence, cross-tab synchronization, export and deep-link exclusion, bookmark preservation, keyboard focus, storage failures and reduced motion. Canvas pixels verify nonblank dust; card positions verify restoration and gap closure. The sort menu stays within 320-1440px viewports in ordinary and hidden modes.

Final-data screenshots: `artifacts/record-panel-live-desktop.png`, `artifacts/record-panel-live-compact.png` and `artifacts/record-panel-live-mobile.png`. Sticky actions are verified with very long records, 400px-high desktop windows and 320px-wide phones. The selected-image comparison and earlier visual history are recorded in `design-qa.md`.

## V1 Layout and Schedule

Search, Filters and sort now sit in the header; export sits beside the refiners. The repeated result heading is screen-reader-only. Market/refiner spacing, the divider above notice facts and wide-panel description spacing are tighter. The inspector's left corners now match its 6px right corners. At 1484 x 920, the reading viewport increased from 432px to 548px, a 116px gain, without changing the record's type sizes. The dock is 57px high with 44px controls. Matched evidence is in `artifacts/workspace-layout-comparison-1484.png`, `artifacts/workspace-layout-comparison-390.png` and `artifacts/workspace-dock-comparison.png`.

GitHub's production workflow was verified active, with recent successful scheduled runs, before release. Its schedule is now 06:15, 08:55, 10:15, 14:15 and 18:15 Europe/London; 08:55 replaces 22:15, preserving five runs per day. A regression test checks the workflow entries against published schedule metadata. The updated 272-test Python suite passes. GitHub schedule times are target starts and can be delayed; source collection and deployment complete afterwards.

Release reconciliation preserved the hosted collector's intervening history through `143a23b`: 71 additional canonical notices and one newer source revision were merged using the existing deduplication logic, then reclassified offline. Existing local checkpoints and incomplete-source queues were retained. This adds three public UK signals, bringing the release dataset to 1,135: Space Technology Solutions; Procurement of Construction Consultant Management Software; and Ayrshire Meet the Buyer 2026. Awards, unrelated material and unavailable notices remain suppressed. No provider or model API was called during reconciliation. These counts are separate from the earlier collection trial and its recorded 1,132-record snapshot.

A final hosted update through `67c6f70`, arriving during the lighting fix, was reconciled in the same way: 47 further canonical records and six material updates, producing a final 1,152-record public release dataset after availability and scope checks. The earlier counts above remain the audit trail, not the latest total.

The last scrolling correction prevents unrelated result-list and description scrolls from resetting refiner reflections or recalculating a stationary source button. Its 60-frame regression reduced full refiner geometry passes from 59 to zero while keeping reflection motion and bounded list virtualization. The shared light phase also survives actual carousel/layout redraws. Both new browser checks and 28 frontend unit tests pass; the existing animation cap and motion/visibility safeguards are unchanged.

The final complete browser suite passed 89 desktop/mobile checks against the reconciled 1,152-record release dataset and deterministic fixtures, with one intentional mobile reference-image skip. Staged release files were checked for excluded paths and credential-shaped values before publication.
