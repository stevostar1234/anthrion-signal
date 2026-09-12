# First-time deployment

1. Create a GitHub repository named `anthrion-signal`. A public repository supports free GitHub Pages on GitHub Free.
2. Push this project's source and generated `data` state to its `main` branch. Do not push `.env`, `.venv`, `tmp`, raw source files or the supplied PDF. `.gitignore` excludes them.
3. No Gemini secret or model configuration is required. Retired Gemini environment variables are ignored; the workflow does not pass a model key to collection.
4. In **Settings -> Pages -> Build and deployment -> Source**, choose **GitHub Actions**.
5. In **Settings -> Actions -> General**, allow the repository's Actions workflows and the workflow's declared write permissions. The production build job commits only public data and checkpoints; the deploy job uses Pages and OIDC permissions.
6. Open **Actions -> Collect intelligence and deploy -> Run workflow**. Choose `collect=true` for a fresh collection or `false` to publish existing data. Set `full_tests=true` to force full browser regression; otherwise it runs automatically when the code changes or a new day's full checks have not yet passed.
7. Wait for the `build`, `deploy`, and `record-publication` jobs to finish. Open the Pages URL and review per-source health in the run metadata. Individual unavailable sources must not stop healthy sources or be counted as complete coverage.

The schedule is set to **XX:50 every hour, including overnight**, in `.github/workflows/ingest-and-deploy.yml`, with `Europe/London` timezone handling. All former slots are replaced. GitHub schedules use the default branch and may start late or be dropped; these are not guaranteed publication times. No visitor needs to be on the website. Avoid changing the workflow to use pull-request code with production secrets.

Data-only publications run real-data desktop/mobile smoke tests against the production build. Full regression runs on code pushes and the first successful run of each day. `data/verification_state.json` records only successful full checks against a code fingerprint; do not edit it to bypass verification. Missing or invalid state requests full tests. Unchanged scheduled runs retain source checkpoints but skip unnecessary frontend work and repeat deployment. A 30-minute recent-collection guard prevents closely queued scheduled runs from repeatedly calling providers; explicit manual collections remain available.

## Local credentials

`.env` is read only by the Python pipeline. No `VITE_` variable may contain credentials. The frontend fetches a validated static public dataset. Current enabled providers need no API key. Future key-based adapters must read backend secrets only. Removing Gemini from this code does not delete old account credentials; those can be revoked separately when no other project uses them.

## Custom domain

Add the domain under **Settings -> Pages -> Custom domain**, configure the DNS records documented by GitHub, and enable **Enforce HTTPS** after certificate issuance. Change the build's `VITE_BASE_PATH` from `/${repository}/` to `/`. Use a `CNAME` file in `app/public` only when your Pages setup requires it. Verify the dashboard, data URL, fonts and deep query links after changing the base path.

## Operating checks

- Check source freshness after initial deployment and when the UI reports delayed coverage.
- Review commercial ranges and supplier eligibility when real facts become available. The initial null values are intentional.
- Use the run's console/Actions summary to see collection, dedupe and availability statistics. Use the Pages deployment job for the actual deployment result.
- Before enabling an international source, run its bounded live integration and verify representative source notices, deadline semantics and supplier-access conditions.
- Browser saves are personal. Share URLs and CSV exports for team use; do not put private deal notes in this public repository.
