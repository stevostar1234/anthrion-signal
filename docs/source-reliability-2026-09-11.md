# Source Reliability Check, 11 September 2026

These were bounded, local read-only probes. They did not publish data, modify the canonical dataset, send messages to suppliers, or use Gemini.

## Sell2Wales

The configured API is genuine. However, current and previous-month queries returned HTTP 500 with a database type-conversion error. The API host linked from the official publication policy failed identically. A single documented JSON bulk-download attempt redirected to the site's application-error page. Changing the hostname or disabling TLS would not repair that upstream fault, and neither is used as a workaround. [Publication policy](https://www.sell2wales.gov.wales/helpandresources/ocds/publicationpolicy), [API documentation](https://api-sell2wales.klickstream.com/v1?lang=en), [bulk download](https://www.sell2wales.gov.wales/Notice/Download/Download.aspx).

The public notice search and its robots policy remain available. A latest-page fallback now keeps its published notice IDs, buyer, full listing description, notice type, value and deadline. It checks robots, keeps TLS verification, and explicitly reports partial coverage without advancing the failed API checkpoint. Its HTML/robots requests use the appropriate Accept headers; the previous JSON-oriented header caused a separate HTTP 406 on the public surface. [Official public search](https://www.sell2wales.gov.wales/Search/Search_mainpage.aspx).

The verified fallback returned **10 current notices**, including **Public Health Wales SMS Reminder System**. This is a continuity measure, not a complete replacement for the monthly API. Unsupported notice types are not guessed into active opportunities. The upstream service still needs its operator to repair the database/export fault. API failures retain a one-hour cooldown; the public listing can still be read during that cooldown.

## Find a Tender

A bounded read of the official release endpoint returned **HTTP 200 and 47 releases** for the one-hour window starting 10 September 2026 at 12:00. The existing endpoint and date parameters are valid. Rate limits remain a service constraint, not an authentication problem. The service specifically says not to make further requests before Retry-After expires. [Official read API contract](https://www.find-tender.service.gov.uk/apidocumentation/1.0/GET-ocdsReleasePackages).

The collector now persists Retry-After, prevents immediate historical/enrichment requests to the same cooling-down host, and resumes the saved cursor in the same fixed window. A rejected/expired cursor replays the unfinished window rather than skipping it. These changes avoid repeating successfully consumed pages; they do not claim unlimited source capacity.

## Digital Outcomes

The official listing currently has **37 results on two pages**. The old collector stopped at the first 20. It now follows the published pagination links within its budget and keeps a checkpoint when another page is deferred. [Official listing](https://redirect.contractawardservice.gca.gov.uk/digital-outcomes/opportunities).

Some public detail pages return genuine upstream HTTP 500 while others work. Listing facts are retained, unchanged successful details are cached for 24 hours, failed detail requests cool down for an hour, and all attempted listing/detail fetches consume the logical request budget. A four-request probe recovered all **37 listings** and hydrated two details. The parser also detected the explicit **29 May 2026** submission deadline on the MoJ Test Centre of Excellence notice despite an open listing label, allowing lifecycle filtering to exclude it. [Public detail](https://redirect.contractawardservice.gca.gov.uk/digital-outcomes/opportunities/opportunity-details/project/73428).

## Other Budget Fixes

- Scotland/monthly sources retain remaining notice partitions across runs. Their previous page-budget state was not an outage, but repeatedly restarting at partition one could starve later types. Failed requests now consume the budget too. [Scotland API](https://api.publiccontractsscotland.gov.uk/v1).
- Grants.gov details now consume the same logical request budget as searches. Unchanged public records are reused for 24 hours; changed listing fingerprints refresh earlier. Missing details and pending closures resume later, and budget skips retain existing full records. The bounded live probe used **six logical requests: four searches and two details**, rather than hydrating every result outside the page cap. Only selected public facts are cached, never response tokens. [Grants.gov API guide](https://www.grants.gov/api/api-guide).
- A logical request can make up to three physical attempts for transient failures. Robots lookups are separate public-policy requests. Budget estimates must include this distinction.

## Verification

**45 focused tests passed** across collector, international and new reliability tests. They cover cooldowns, cursor replay, monthly fairness, Wales fallback lifecycle/robots checks, Digital Outcomes pagination/deadlines/cache, and Grants budget/cache behavior. Ruff passed on the edited collector and reliability tests. No canonical or public data files were changed by these checks.
