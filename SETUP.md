# First-time deployment

1. Create a GitHub repository named `anthrion-signal`. A public repository supports free GitHub Pages on GitHub Free.
2. Push this project's source and generated `data` state to its `main` branch. Do not push `.env`, `.venv`, `tmp`, raw source files or the supplied PDF. `.gitignore` excludes them.
3. In **Settings -> Secrets and variables -> Actions -> Secrets**, create `GEMINI_API_KEY` using your Google AI Studio key.
4. In **Actions -> Variables**, set `GEMINI_MODEL` to the desired available model. The initial verified configuration is `gemini-3.5-flash`. Optional variables are `MAX_AI_CALLS_PER_RUN=30`, `AI_CONCURRENCY=2`, and `AI_MIN_PREFILTER_SCORE=25`.
5. In **Settings -> Pages -> Build and deployment -> Source**, choose **GitHub Actions**.
6. In **Settings -> Actions -> General**, allow the repository's Actions workflows and the workflow's declared write permissions. The production build job commits only public data and checkpoints; the deploy job uses Pages and OIDC permissions.
7. Open **Actions -> Collect intelligence and deploy -> Run workflow**. Choose `collect=true` for a fresh collection or `false` to publish the already-verified dataset.
8. Wait for the `build`, `deploy`, and `record-publication` jobs to finish. Open the Pages URL and check **Source coverage**. An individual unavailable source should be visible and should not stop other sources.

The schedule is already set to five London-time runs per day in `.github/workflows/ingest-and-deploy.yml`. GitHub schedules use the default branch. Avoid changing the workflow to use pull-request code with production secrets.

## Local credentials

`.env` is read only by the Python pipeline. No `VITE_` variable may contain credentials. The frontend fetches a validated static public dataset and never contacts Gemini. Rotate keys through GitHub Secrets and the local `.env`; no application rebuild is needed for the next ingestion to use the new secret.

## Custom domain

Add the domain under **Settings -> Pages -> Custom domain**, configure the DNS records documented by GitHub, and enable **Enforce HTTPS** after certificate issuance. Change the build's `VITE_BASE_PATH` from `/${repository}/` to `/`. Use a `CNAME` file in `app/public` only when your Pages setup requires it. Verify the dashboard, data URL, fonts and deep query links after changing the base path.

## Operating checks

- Check source freshness after initial deployment and when the UI reports delayed coverage.
- Review commercial ranges and supplier eligibility when real facts become available. The initial null values are intentional.
- Use the run's console/Actions summary to see collection, dedupe and AI statistics. Use the Pages deployment job for the actual deployment result.
- Before enabling an international source, run its bounded live integration and verify representative source notices and scores.
- Browser saves are personal. Share URLs and CSV exports for team use; do not put private deal notes in this public repository.
