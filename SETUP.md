# First-time deployment

1. Create a GitHub repository named `anthrion-signal`. A public repository supports free GitHub Pages on GitHub Free.
2. Push this project's source and generated `data` state to its `main` branch. Do not push `.env`, `.venv`, `tmp`, raw source files or the supplied PDF. `.gitignore` excludes them.
3. No Gemini secret or model configuration is required. Retired Gemini environment variables are ignored; the workflow does not pass a model key to collection.
4. In **Settings -> Pages -> Build and deployment -> Source**, choose **GitHub Actions**.
5. In **Settings -> Actions -> General**, allow the repository's Actions workflows and the workflow's declared write permissions. The production build job commits only public data and checkpoints; the deploy job uses Pages and OIDC permissions.
6. Open **Actions -> Collect intelligence and deploy -> Run workflow**. Choose `collect=true` for a fresh collection or `false` to publish the already-verified dataset.
7. Wait for the `build`, `deploy`, and `record-publication` jobs to finish. Open the Pages URL and review per-source health in the run metadata. Individual unavailable sources must not stop healthy sources or be counted as complete coverage.

The schedule is set to **06:15, 08:55, 10:15, 14:15 and 18:15 Europe/London** in `.github/workflows/ingest-and-deploy.yml`, with daylight-saving handling. The morning 08:55 slot replaces 22:15, keeping five daily runs. GitHub schedules use the default branch and may start late; these are not guaranteed publication times. Avoid changing the workflow to use pull-request code with production secrets.

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
