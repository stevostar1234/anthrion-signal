# Console Design QA

## V1 Reading Space, 11 September 2026

### Evidence

- Scope: the user's four toolbar/dock annotations at 1484 x 920, followed by 1132 x 920 spacing annotations, softer left record corners and the wide-screen description-gap request. The existing glass, wordmark, selected-row liquid metal, record typography and data controls are preserved.
- Baseline: `artifacts/workspace-layout-before-1484.png`, `artifacts/workspace-layout-before-997.png` and `artifacts/workspace-layout-before-390.png`. These capture the real UK All Signals view, Vanguard HRIS selected, before this arrangement pass.
- Matched combined comparisons: `artifacts/workspace-layout-comparison-1484.png` and `artifacts/workspace-layout-comparison-390.png`. Before/after use the same viewport, dataset, record, fixed date and reduced-motion state, at native CSS-pixel scale. Focused same-input comparisons are `artifacts/workspace-header-comparison.png` and `artifacts/workspace-dock-comparison.png`.
- Intermediate release-data captures: `artifacts/workspace-layout-release-1484.png`, `artifacts/workspace-layout-release-1132.png`, `artifacts/workspace-layout-release-997.png`, `artifacts/workspace-layout-release-1920.png`, `artifacts/workspace-layout-release-390.png` and `artifacts/workspace-panel-release-390.png`. These predate the final 1,152-record reconciliation; the matched visual comparison intentionally retains its earlier fixed dataset.
- Published-site captures: `artifacts/workspace-layout-published-1484.png`, `artifacts/workspace-layout-published-1132.png`, `artifacts/workspace-layout-published-997.png`, `artifacts/workspace-layout-published-1920.png`, `artifacts/workspace-layout-published-390.png` and `artifacts/workspace-panel-published-390.png`. The live data selects the newly collected Brighton ticketing notice. Desktop, wide-screen and mobile captures were opened and reviewed; dimensions match the approved layout and page-error counts are zero.

### Findings and Corrections

1. [P2, resolved] A duplicate heading and separate toolbar consumed record space. Search, Filters and sorting now sit between the desktop brand and saved opportunities; smaller widths wrap inside the header. Export occupies its own right-hand slot centred beside the refiners, clear of carousel navigation. The heading remains available to screen readers without taking visible space.
2. [P2, resolved] The wide action dock was 96px high. It is now 57px, with 44px actions and the same persistent flex layout outside record scrolling. The full-detail mobile drawer uses the same container sizing, avoiding an extra wrapped action label. Both docks remain viewport-contained with long records.
3. [P2, resolved] Follow-up annotations identified excess vertical whitespace and square left corners. The market band is 16px shorter on desktop; refiner bottom spacing is 4px shorter; the facts divider moves up 12px with 4px less padding below it. Description top spacing is now 20px instead of 38px on wide panels, and its left inset is 24px instead of 32px. All four inspector corners are 6px.
4. [P2, resolved] Early layout assertions exposed an inherited 32px minimum on the screen-reader heading and an oversized full-detail mobile dock. Explicit minimum resets and drawer container sizing correct both. Final checks verify the heading occupies only 1px and mobile actions remain usable.
5. [P1, resolved] The new record-layout check and an earlier panel fixture depended on one expiring live tender. A shared typed test record now supplies deterministic source facts; no fabricated content is added to the production dataset. Scheduled deployments can continue after that individual tender closes.
6. [P2, resolved] Nested result-list scrolling triggered a CSS3D geometry render with a static lamp, interrupting the animated reflection. The regression reproduced 59 unnecessary geometry passes across 60 scrolling frames. Ancestor-aware scroll handling now produces zero geometry passes and zero stationary source-button light reads in that test while reflections continue, the same glass nodes/transforms remain, and fewer than 35 list rows are mounted. Geometry redraws and animation ticks share the same time-based lamp. The existing 25Hz cap, reduced-motion, visibility and offscreen suspension remain; no extra animation loop was added.
7. [P2, resolved] The first hosted release check passed the scroll regression but missed short Hide/Unhide animations through 500ms protocol polling. The test now samples canvas pixels and actual leftward travel on animation frames inside the browser, then verifies removal and gap closure. Twelve repeated desktop/mobile runs pass. Production animation timing is unchanged, and no test is skipped or weakened to permit deployment.
8. [P2, resolved] Frame sampling then exposed a real slow-renderer race: Unhide's 380ms removal timer could expire before the CSS animation started. A controlled 450ms start delay reproduces zero travel on both local viewports. Removal now follows the animation-end event, with a two-second fallback for unmounted/offscreen rows and immediate completion when reduced motion is enabled. The visual duration remains 380ms; no continuous rendering work is added. All 16 focused visibility/scroll checks and 28 frontend unit tests pass after this correction.
9. [P2, resolved] A hosted mobile keyboard check exposed focus requests before a container-query control was computed as visible. Sixfold CPU throttling reproduced the rejected focus call locally. Focus now follows layout, retries at most three additional frames if needed, and clears only on success; static desktop navigation explicitly requests that update. The initial carousel index is captured once, avoiding reinitialization on every selected category. Twelve slowed-browser runs (180 arrow-key moves) and all ten affected desktop/mobile checks pass. No idle loop or additional list-scroll rendering is introduced.

### Required Fidelity Surfaces

- Fonts and typography: original self-hosted Signal Sans/DM Sans and Instrument Serif; unchanged record heading/body sizes, zero letter spacing, crisp refiner text and unchanged glass-label metrics. No typography was scaled to recover space.
- Spacing and layout: 1484 x 920 reading height increases from 432px to 548px, a 116px/26.9% gain. At 997 x 920 it increases from 459px to 548px. The 390px drawer gains 12px. Controls do not overlap across 320-1920px widths; short-height and long-record cases retain their actions.
- Colors and tokens: approved dark graphite/green, pale text, cyan and celadon accents remain. No light mode, new palette or additional decorative surface was introduced.
- Image quality and assets: original logo, optical-glass material, Lucide icons, ambient shader and selected-row liquid metal remain intact. Combined images confirm continuous source-button corners and stable record clipping.
- Copy and content: only requested controls move. Source descriptions remain complete; source links, saved and hidden choices, filters, exports, keyboard navigation and lifecycle cautions remain functional. Visible routes, menus and missing-data states contain no internal review or deployment commentary.

### Verification

- The complete final suite passed 91 desktop/mobile checks against the 1,152-record release dataset and isolated fixtures, with one intentionally skipped duplicate mobile reference capture. Tests cover dock geometry, header collisions, export alignment/download, hidden mode, overflow, full-detail return flow, keyboard operation, accessibility, stable glass text, scroll/light isolation and changing/nonblank shader pixels. Reduced-motion and no-WebGL fallbacks remain covered.
- 28 frontend unit tests, TypeScript, production build, full frontend formatting, Ruff and `git diff --check` passed. The 272-test Python suite includes an exact match between GitHub's five daily London-time slots and published schedule metadata. Public output validation passes for 1,152 reconciled records with no credential-shaped values or unsafe links. Both scroll-isolation regressions pass alongside the expanded keyboard and delayed-animation coverage.
- [GitHub release run 34631888257](https://github.com/stevostar1234/anthrion-signal/actions/runs/34631888257) passed all 91 browser, 272 Python and 28 frontend unit checks, deployed Pages and recorded successful publication. The public HTML serves the verified `index-CIZXvnRG.js` and `index-BvJbBuTT.css` build. All eight additional layout/control/scroll checks passed against the published URL.
- All five fidelity surfaces, full-view comparisons, focal header/dock comparisons and desktop/mobile/wide-screen follow-ups were visually reviewed. No actionable P0/P1/P2 issues remain.
- Remaining P3: shader phase and raster antialiasing vary naturally. At very short heights, the reading viewport is necessarily small; both actions remain accessible.

final result: passed

The following sections are historical design passes. The latest approved v1 spacing supersedes their earlier dock dimensions and padding.

## Glass Reading Dock, 11 September 2026

### Evidence

- Scope: implement the user's selected record-panel image with persistent bottom actions. No collection, scoring, deployment or authentication changes.
- Source visual truth: `C:/Users/skyba/.codex/generated_images/01a08592-384c-7a82-a9b5-af1714083ee9/exec-8935fc0c-79f3-49db-876e-db6a43281edd.png`.
- Rendered implementation: `G:/Anthrion/signal/artifacts/record-panel-design.png`. The desktop viewport is 1600 x 1352 CSS pixels at deviceScaleFactor 1; the inspector is 768 x 960 CSS/image pixels.
- Normalization: the 1122 x 1402 source is displayed at 768 x 959.66 pixels, preserving aspect ratio. The rendered 768 x 960 component remains at native resolution. Browser chrome and the surrounding workspace are excluded from this component comparison.
- Matched state: dark theme, UK, Live Opportunities, Vanguard HRIS record selected, top of the reading pane, reduced decorative motion. Only the isolated Playwright fixture uses the mock's two paragraphs for comparison. Public data and production descriptions are unchanged.
- Full-view combined inputs: `artifacts/record-panel-comparison-initial.png`, `artifacts/record-panel-comparison-refined.png`, `artifacts/record-panel-comparison-final.png`. Each puts reference and implementation in the same image at equal display width.
- Focused combined dock evidence: `artifacts/record-panel-dock-comparison-final.png`. Both bottom 120px regions are shown at the same normalized scale, with readable icons, typography and glass outlines.
- Real-data screenshots: `artifacts/record-panel-live-desktop.png` (1440 x 1050), `artifacts/record-panel-live-compact.png` (997 x 920), `artifacts/record-panel-live-mobile.png` (390 x 844), `artifacts/record-panel-live-short.png` (980 x 480).

### Comparison History And Findings

1. [P2, resolved] The initial implementation compressed the reference's hierarchy: 28px title, 16px prose and a 69px dock at the 768px component width. The initial combined image shows earlier wrapping, less reading presence and a shallower action band. Wide panels now use a 32px title, 18px prose, larger fact labels and a 96px dock with a 56px source button. The refined and final combined images confirm the reference's major proportions, title wrapping and reading hierarchy.
2. [P1, resolved] Actions previously belonged to scrolling record content. The new flex shell reserves an action dock outside the independently scrolling body. Long descriptions and titles cannot push it down. Both the preview and expanded detail view keep their source action visible. Desktop and mobile stress tests verify exact unchanged dock bounds before and after scrolling.
3. [P2, resolved] Very short desktop viewports exposed a minimum-padding overflow, and a transient drawer entrance offset appeared even with reduced motion. Content padding now belongs to an inner element; short desktop views tighten chrome spacing without scaling refiner text; reduced-motion drawers have no entrance animation. The final 980 x 480 real-data capture and `artifacts/record-panel-long-1440x400.png` show visible, usable dock actions. Full-detail heading height is bounded so its reading area remains usable with unusually long titles.
4. [P2, resolved] The initial mobile regression assumed opening a row immediately showed full-detail tabs. The mobile row now opens the selected panel design, with Full details explicitly opening the existing tabs. Updated checks cover both paths, Back to record, unavailable deep links, and source navigation.

### Required Fidelity Surfaces

- Fonts and typography: existing self-hosted DM Sans (Signal Sans) remains the product font, with zero letter spacing. Wide-panel heading weight is 550, body weight 400; the final comparison shows the intended three-line heading and an untruncated reading block. Narrow panels use 24px headings and 16px prose. Minor raster antialiasing differences from the generated reference are expected, not a substitute font or image-baked text.
- Spacing and layout: title/buyer first, three compact fact columns, inline capabilities, a restrained left rule beside the description, then the anchored dock. At narrow widths facts wrap into two columns without horizontal overflow. The dock adapts to compact screens and safe-area insets. Actual long source prose scrolls; it is not shortened to reproduce a mock's empty space.
- Colors and tokens: the approved graphite/green surfaces, pale text, cyan labels and chrome/glass action remain. The implementation retains the existing quieter ambient shader rather than baking the reference's mottled image behind the record. Reflection phase and the slightly flatter reading surface are accepted product-token differences.
- Image quality and assets: existing generated optical-glass material, selected-row liquid metal, original Anthrion artwork and shader implementations are retained. The new panel uses the existing Lucide family, with a functional calendar-add affordance in addition to the reference's deadline icon. No synthetic logo, rasterized interface or replacement illustration was introduced.
- Copy and content: labels follow the selected design. Production renders complete collected source wording, not the illustrative mock's rewritten description. Empty descriptions and absent capabilities/deadlines have honest end-user fallbacks. Relevant lifecycle cautions, source provenance, documents and timelines remain. No internal review or implementation notes appear in the UI.

### Verification

- Focused long-record checks pass at desktop 997 x 600, 980 x 480, 1440 x 400, 1139 x 920 and 1440 x 720; mobile 320 x 568, 390 x 844 and landscape 844 x 390.
- Actions cover source popup navigation, calendar downloads, saving, hiding, switching records, scroll reset, full-detail tabs and return flow. Automated WCAG checks cover the normal panel and missing-data state. Captures with real records reported zero page errors.
- TypeScript, the production build, formatting and `git diff --check` pass. The 26 frontend unit tests and 81 desktop/mobile browser checks pass. One duplicate mobile reference capture is intentionally skipped because the selected image is a desktop component. Broader regression context is recorded in `docs/source-only-discovery-2026-09-11.md`.
- Visual implementation checklist complete: matched source comparison, focused dock comparison, desktop/mobile/short-height evidence, all five fidelity surfaces and functional action checks.
- Remaining P3: generated-reference and live-font antialiasing and lighting-phase differences. At extreme short heights the reading preview is intentionally small; Full details remains available in the viewport.

final result: passed

Historical design passes follow; their themes and controls describe earlier revisions, not the current dark-only source-based product.

## Clear Glass And Directional Light

- Scope: the four 1139 x 920 browser annotations, followed by the user's choice of clearer refiner glass, position-dependent reflections from a light near the signature, and the signature light sweep. Local iteration only.
- Preserved: actual Anthrion artwork and metal hover, selected-record LiquidMetal, console layout, market behavior, real data, source links and the approved dark source-button finish. No collection, deployment or authentication changes.
- References: the annotated screenshots in the conversation; `artifacts/annotation-fixes-before-light.png` and `artifacts/annotation-fixes-before-dark.png` capture the local pre-edit state. The first annotation pass is retained under `artifacts/annotation-fixes-final-*.png` and is the baseline for the subsequent clearer-glass request.
- Matched comparison inputs: `artifacts/glass-lighting-comparison-light.png` and `artifacts/glass-lighting-comparison-dark.png`. Each places the baseline and current 1139 x 920 view together at native resolution, with a 30px label band. Both use UK, Top Signals, first record selected, at the top of the page. Shader phase varies naturally; no sample records replace live data.

### Findings And Fixes

1. [P2, resolved] Removed the redundant country summary and centred the real market rail. The main feed and source-coverage titles now provide the page's h1. Country navigation, keyboard selection, deep links and coverage remain functional.
2. [P1, resolved] Perspective projection and a changing face width were resampling refiner text during drag. The glass remains a Three.js CSS3D face, while the live buttons and text are projected onto a separate, untransformed, pixel-aligned plane. Face dimensions no longer change near the centre. Font metrics and text bounds stay constant at four points throughout real drags in both themes.
3. [P2, resolved] The source button's nine-sliced corners had visible joins. Native continuous rounded borders now provide the outline and inner bevel; material reflections stay inside it. The same source link is verified in the desktop inspector and mobile detail dialog.
4. [P2, resolved] Light mode had a dark selected card, followed by an overly opaque celadon face. The current face is translucent, with a restrained celadon selection and a clear reflective surface. Dark refiner faces also use a translucent tint rather than opaque graphite fills.
5. [P2, resolved] Intermediate clear-glass renders exposed the dark background of the photographic material in light mode. Evidence: `artifacts/glass-lighting-v1-light.png`. Luminance masking now renders only its highlights and bevel details; the light-mode frame no longer becomes a heavy grey rectangle. The corrected material was recaptured and compared, not accepted from computed CSS alone.
6. [P2, resolved] Reflections were fixed within each moving tile. `glassLighting.ts` now derives the specular position, angle and intensity from the real brand location, viewport and each Three.js face normal. The source button shares that light and updates when its inspector scrolls. Lighting is event-driven and stable at rest, without an idle animation loop. This is a responsive optical approximation, not ray-traced refraction.
7. [P2, resolved] The old signature texture hover was too subtle. The approved white/celadon light sweep now traverses the actual italic glyphs on hover or keyboard focus, with a stronger central highlight. Reduced motion keeps a static glass finish. The neighboring Anthrion logo does not change when only the signature is hovered.

### Fidelity Review

- Typography: original self-hosted DM Sans and Instrument Serif retained, with zero letter spacing. No filter, backdrop blur or transform is applied to the refiner text plane. All complete category labels fit across 13 tested widths. Counts and labels do not resize during drag. Source text and signature bounds stay stable through their effects.
- Layout: market rail centred; console, utility controls and inspector density preserved. Decorative 3D faces retain their angles, but text is readable front-on. Source button radius is 6px and its minimum height remains 44px. Mobile continues to use the working detail dialog.
- Palette: graphite, celadon and ice remain the only material accents. Light mode uses subtle silver/green bevels and a translucent celadon selection. Dark mode retains the approved chrome source button and reflective refiner rims.
- Material quality: reuses the generated optical-glass asset, with its interior separated from reflection and rim treatment. Luminance masks avoid opaque image backgrounds. Dynamic highlight positions are driven by the brand-side light, not a pre-recorded video or arbitrary animation clock. No image-baked text or replacement brand geometry.
- Content: no new visible review, implementation, prototype or configuration copy. Existing real opportunity descriptions, evidence, source notices, saved items and coverage remain truthful. Console, all filters and markets, empty/deep-link states, sorting, source coverage, and all detail tabs are exercised by the browser suite.

### Evidence And Verification

- Current desktop: `artifacts/glass-lighting-final-dark.png` and `artifacts/glass-lighting-final-light.png`, 1139 x 920.
- Three real drag phases: `artifacts/glass-lighting-drag-comparison.png`, plus separate light/dark captures under `artifacts/glass-lighting-drag-*`. The same card's highlight moves while its label dimensions remain unchanged.
- Signature phase comparison: `artifacts/glass-lighting-signal-comparison.png`. Actual browser animation frames at 0, 1000 and 1380ms, both themes, with the original wordmark unchanged.
- Mobile: `artifacts/glass-lighting-mobile-light.png`, `artifacts/glass-lighting-mobile-dark.png`, and `artifacts/glass-lighting-mobile-detail.png`, 390 x 844. Final light capture waits for fonts and the settled layout.
- Source corners: `artifacts/glass-lighting-button-dark.png` and `artifacts/glass-lighting-button-light.png`. Native rounded outline and split external-link icon remain continuous and readable.
- 44 desktop/mobile browser tests passed. All 10 affected glass, drag, brand and automated WCAG checks passed again after the luminance-mask correction. Both brand tests passed again after widening the signature sweep.
- 14 frontend unit tests passed, including fixed-light geometry, deterministic rest, tilt response, coordinate translation and bounded off-screen behavior. Final TypeScript/production build and affected-file formatting passed. `git diff --check -- app/src app/tests` passed.
- Actual selected-record shader pixels still change; reduced-motion shader frames remain stable; no-WebGL fallback, keyboard interactions, exports, market scoping, saving and source-link activation remain covered. No page errors in the final capture run.
- No push or public deployment. The existing local server remains at `http://127.0.0.1:4174/anthrion-signal/`.

Current annotation and directional-light pass: **passed**. Historical design passes follow.

## Optical Glass And Brand Hover

- Scope: discovery/refiner cards, source-notice button, and the requested individual logo hover treatments. Selected-record LiquidMetal, country rail, data and collection workflows are unchanged. Narrow-header spacing is adjusted at 380px and below.
- Current source: `C:/Users/skyba/AppData/Local/Temp/codex-clipboard-bdc7d2f6-bb25-4505-ba49-25d9c0a08c2b.png` (892 x 108) and `C:/Users/skyba/AppData/Local/Temp/codex-clipboard-e1428ef2-2624-45d1-b842-236593d01989.png` (247 x 48).
- Full selected context: `C:/Users/skyba/.codex/generated_images/01a08592-384c-7a82-a9b5-af1714083ee9/exec-2519ca0b-9723-4669-9b2f-25f50c826fbf.png` (1469 x 1071).
- Local state: dark, UK, Live Opportunities, first record selected. Full reference comparison uses 1469 x 1071 CSS pixels and deviceScaleFactor 1; source and implementation are placed together at native resolution in `artifacts/glass-final-full-comparison.png` (2938 x 1101 including labels). The pre-existing console density is preserved, not changed to match the illustrative mock outside this request's scope.
- Focused comparison: `artifacts/glass-final-components-comparison.png` (1134 x 470). The provided crop and the local 1134 x 150 refiner capture are normalized to equal width with aspect ratio preserved. Source-button crops are normalized to equal width. Different live counts are expected: current deadlines produce 98 live opportunities rather than the reference's 100. No fake data is substituted for screenshot matching.

### Findings And Fixes

1. [P1, resolved] Centred-card typography was resampled at 1.065x inside a composited, blurred material plane. Evidence: `artifacts/glass-refinement-before.png`; measured centre transform scale 1.065 and backdrop blur 12px. Removed parent backdrop filtering and typography scaling. Three.js now sizes the face itself and aligns the resting control to whole CSS pixels. Current active scale is 1, with no filter on the text plane.
2. [P1, resolved] The first optical treatment resembled a heavy border around a flat panel. Evidence: `artifacts/optical-glass-comparison-components-verified.png`. Replaced the frame-only asset with a generated smoked optical-glass material, including a quiet diagonal reflection, bevel and lower rim. All labels and icons remain live, sharp DOM.
3. [P2, resolved] The first refined material had clipped, weak highlights and undersized labels. Evidence: `artifacts/glass-refinement-v2-comparison.png` and `artifacts/glass-refinement-v3-comparison.png`. Adjusted material slices, edge placement and optical depth, increased label sizing, and restored gentle side-card angles. Reviewed post-fix evidence: `artifacts/glass-refinement-v4-comparison.png`, then `artifacts/glass-final-components-comparison.png`.
4. [P2, resolved] At 320px the header navigation wrapped unnecessarily. Tightened its gap and small-screen label sizing without changing the controls. Final narrow viewport capture is `artifacts/glass-final-narrow.png`.
5. [P3] The generated optical texture has a different fine caustic pattern from the mock. The material, framing, palette and editable typography are faithful to the selected direction; exact pixel-level reflection matching is not claimed.

### Required Fidelity Review

- Fonts/typography: retained self-hosted DM Sans and Instrument Serif italic, with zero letter spacing. Refiner counts are 32px; labels are 15px, or 13px in the narrowest cards. Selected typography is native scale and pixel-aligned. Full labels fit at all 12 tested widths. The console and settled detail dialog remain unfiltered and legible.
- Spacing/layout: retained the working console, market rail, looping carousel, fixed card heights and independent selected filter. Side cards have restrained 3D angles; the centred face is flat for crisp text. Source links retain a 44px minimum height and integrated external-link icon. Mobile keeps the existing usable detail dialog.
- Colors/tokens: retained graphite, celadon and ice. The selected lower rim is celadon; secondary glass reflections are cool neutral. Both themes retain readable contrast and discernible active states.
- Image/material quality: `app/public/assets/optical-glass-material.png` is a generated 1774 x 887 RGB material, nine-sliced with its interior fill. No screenshot text is baked into controls. Real Anthrion SVG geometry is used as the liquid-metal mask. Signature glass uses the actual live italic font, optical texture and restrained highlights. Masked logo rendering is isolated from surrounding text.
- Copy/content: no new visible instructional, prototype, implementation or review copy. Existing end-user labels, real source links, pending analyses and market coverage remain truthful. Reviewed console, discovery, menus, details, empty state and sources; test outputs and this report stay outside the product.

### Interaction And Visual Evidence

- Main preview: `http://127.0.0.1:4174/anthrion-signal/`.
- Desktop: `artifacts/glass-final-desktop.png` and `artifacts/glass-final-live-desktop.png`, 1262 x 920.
- Light theme: `artifacts/glass-final-light.png`, 1262 x 920.
- Mobile: `artifacts/glass-final-mobile.png` and `artifacts/glass-final-mobile-detail.png`, 390 x 844. The rejected early mobile capture was taken mid-transition; settled dialog rendering has opacity 1 and no transform/filter.
- Small screen: `artifacts/glass-final-narrow.png`, 320 x 844, longest category selected.
- Brand: rest, metal hover, glass hover and keyboard-focus captures under `artifacts/glass-final-brand-*.png`. These use deviceScaleFactor 2 to inspect SVG masking and live-font edges. Full header hover was separately inspected in `artifacts/brand-hover-header-inspect.png`.
- 38 desktop/mobile browser tests passed, including original feed, all markets, sorting, filtering, comparison, storage failure, evidence, source-link keyboard activation, 3D looping, actual changing shader pixels, stable reduced-motion frames, no-WebGL fallback, and both-theme automated WCAG checks. Added active-card pixel-alignment assertions across 12 viewport widths and logo hover/lifecycle tests.
- 9 frontend unit tests passed; TypeScript and the final production build passed. All 10 affected browser checks passed again after the narrow-header and logo-isolation polish. The final 320px recapture was inspected: both header navigation labels remain on one line. The brand test also proves that hovering Anthrion does not change or obscure the neighbouring signature pixels.
- No page errors during the final capture run. No public deploy, push or collection run was performed.

The sections below retain the preceding console redesign history.

## Visual Targets

- Selected composite: `C:/Users/skyba/.codex/generated_images/01a08592-384c-7a82-a9b5-af1714083ee9/exec-46d33673-a02c-422d-87af-b93bcd7c0014.png`
- Primary user reference: `C:/Users/skyba/AppData/Local/Temp/codex-clipboard-aa0c033e-f062-4572-85ed-1bddcbbbf5a2.png`
- Flagless market reference: `C:/Users/skyba/AppData/Local/Temp/codex-clipboard-fd3b3b2e-a814-43d5-872e-425f427085e9.png`
- Local route: `http://127.0.0.1:4174/anthrion-signal/`
- Source composite: 1487 x 1058 pixels. Final comparison captures: 1487 x 1058 CSS pixels, deviceScaleFactor 1. No density conversion.
- State: dark, United Kingdom, Top Signals, first opportunity selected. Counts and record ordering differ because the implementation uses refreshed real data, not the static mock.

## Comparison History

1. Initial 1440 x 1024 and 390 x 844 captures: end cards crowded their neighbours; compare checkboxes overlapped evidence labels; the feed count drifted away from its heading. Corrected Three.js rotation direction, card depth, compare-control minimum width, heading alignment and detail spacing. Evidence: `artifacts/console-desktop-first.png`, `artifacts/console-mobile-first.png`, `artifacts/console-desktop-second.png`.
2. Matched full-view comparison: `artifacts/design-comparison-full.png`. Focused row comparison: `artifacts/design-comparison-detail.png`. P2: opportunity, buyer and detail text remained too small relative to the approved design. Increased reading sizes and reduced title weight. Strengthened the selected category's chrome edge.
3. Revised combined inputs reviewed: `artifacts/design-comparison-final-full.png` and `artifacts/design-comparison-final-detail.png`. Key reading sizes, title hierarchy and console alignment corrected. The implementation retains a flatter graphite surface and tighter corner radii than the illustrative target; shader reflections vary with animation phase. No unresolved P0/P1/P2 issues in these comparisons.
4. User reported the Live Opportunities label overflowing at 1262px. Replaced viewport-only card sizing with container-query layouts, preserving complete labels inside fixed-height cards. Reviewed `artifacts/console-compact-fixed-desktop.png`. Added text-range containment checks for visible category labels at 12 widths, including the longest labels. Both desktop and mobile test contexts pass.

## Fidelity Review

- Typography: self-hosted DM Sans and Instrument Serif italic. Final reading-size comparison reviewed; compact category labels adjust to their own card width without cutting off words.
- Layout: full-width header, flagless market rail, real Three.js coverflow and equal-width list/detail console. Mobile uses a single list with a detail dialog. No sidebar or fake account controls.
- Tokens: graphite, celadon, ice-blue and restrained warm deadline accents. Reduced-motion and non-WebGL fallbacks preserved.
- Assets: actual Anthrion SVG from the existing company website; unchanged vector geometry, white on dark. LiquidMetal renders a real animated shader, not a static screenshot.
- Content: real notices and source links; unassessed records remain unscored. Actual source summaries are longer than the illustrative mock and are readable in the full assessment.

## Verification

- 34 Playwright desktop/mobile tests passed after the final responsive and currency-filter fixes.
- Production build and 9 frontend unit tests passed. Pipeline verification: 48 tests passed.
- Automated WCAG 2 A/AA and WCAG 2.1 AA checks passed for both themes, console, sort, filters, all assessment tabs and sources.
- Nonblank shader pixels and changing frame hashes verified; reduced-motion frames are stable.
- Discovery wrapping, explicit rotation, keyboard use and unchanged active filter verified.
- Document overflow checks: 320, 430, 768, 1024, 1262 and 1920 CSS pixels. Category text containment checks additionally cover 390, 900, 901, 1220, 1280 and 1440 pixels.

final result: passed

Local review only. The public GitHub Pages deployment has not been changed. Coverage limitations and remaining integration work are documented in `docs/international-market-apis.md`.
