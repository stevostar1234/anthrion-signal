# Public data sent for matching

The requested runtime uses Gemini to compare public notices against the public capability extract in `config/company_profile.yaml`. This implements sections 1, 3, 9 and 11 of the user's supplied Anthrion Signal build brief. The user supplied a Gemini key in `.env` specifically for this runtime and asked for the model and deployment to be configured.

No original PDF, private sales notes, contact details, employee data, personal correspondence, credentials, turnover, financial capacity or private commercial thresholds are included in analysis payloads. The eligibility and commercial fields remain null. Only the curated public capability, sector, geography and public case-reference evidence is sent.

The supplied PDF states on page 33 that its business facts derive from public company materials. A read-only check on 9 September 2026 also corroborated the public nature of the capabilities and references on:

- https://anthrion.com/ (Salesforce, Tableau, MuleSoft, AI, modernization, public customer logos)
- https://anthrion.com/company (business process modernization and agentic systems)
- https://anthrion.com/case-study/case-resolution-agent-technology-nordics (the public service-case agent)
- https://de.linkedin.com/company/anthrion-gmbh (official company posts describing TROESTER and Qt)

This external check does not add capabilities to the profile. The user-supplied PDF remains the source of the configured company claims. The full original profile is never uploaded by the application.
