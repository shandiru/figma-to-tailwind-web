# SEO keyword refresh

`backend/scripts/dailySeoKeywords.mjs` reads the previous 90 days of GA4 and Search Console performance (ending three days ago so recent Search Console data can settle), asks Groq for keyword suggestions, and updates only the `keywords` meta tag in `frontend/index.html`. Search Console queries are prioritized when available. Otherwise, GA4 landing-page traffic is used, preferring Google organic pages; if those are empty, other GA4 traffic sources provide page-interest context. The current keywords and page title/description keep suggestions relevant. GA4 does not expose Google search phrases in this report, so landing-page topics are not confirmed search terms. If neither source has useful data, the page is left unchanged. Set `SEO_LOOKBACK_DAYS` to a whole number from 28 to 365 to change the reporting window.

## Local setup

1. Enable Google Analytics Data API and Google Search Console API in the Google Cloud project.
2. Create a service account JSON key and save it as `backend/secrets/google-service-account.json`.
3. Grant the service account email Viewer access to the GA4 property and Restricted user access to the Search Console property.
4. Set these values in `backend/.env`:

   ```env
   GOOGLE_SERVICE_ACCOUNT_KEY_FILE=./secrets/google-service-account.json
   GOOGLE_SERVICE_ACCOUNT_JSON=
   GOOGLE_SERVICE_ACCOUNT_JSON_BASE64=
   SEO_GA4_PROPERTY_ID=your_numeric_property_id
   SEO_SEARCH_CONSOLE_SITE=https://example.com/
   GROQ_API_KEY=your_groq_api_key
   GROQ_MODEL=openai/gpt-oss-20b
   ```

   Use only one Google credential method. For local runs, keep the JSON file setting and leave the two JSON environment alternatives blank.

5. Run `node backend/scripts/dailySeoKeywords.mjs` from the repository root. Google OAuth access tokens are generated and refreshed by `google-auth-library`; do not create or store an access token yourself.

For a local, always-on Node process, run immediately and then every four hours with:

```powershell
npm run schedule:seo --prefix backend
```

Keep that process running. The scheduler uses `setTimeout`, starts one run immediately, then waits four hours after each run finishes before starting the next one. You can change the interval with `SEO_INTERVAL_HOURS` in `backend/.env`. This local scheduler does not run on Vercel serverless functions.

## Vercel deployment

Vercel serverless functions cannot keep a `setTimeout` alive between requests. The backend project now includes a protected Cron endpoint at `/api/seo-cron` and a Vercel schedule in `backend/vercel.json`. Set the Vercel backend project's Root Directory to `backend`, then add these Project Environment Variables before redeploying:

- `GOOGLE_SERVICE_ACCOUNT_JSON`: the full contents of the service account JSON key. Do not use the local file path on Vercel.
- `SEO_GA4_PROPERTY_ID`, `SEO_SEARCH_CONSOLE_SITE`, `GROQ_API_KEY`, `GROQ_MODEL`.
- `EMAIL_USER`, `EMAIL_PASS`, `SEO_REPORT_TO`, and optionally `SMTP_HOST` / `SMTP_PORT`.
- `CRON_SECRET`: a random secret with at least 32 characters. Vercel sends it to the protected Cron endpoint automatically.
- Optionally, `SEO_PAGE_TITLE`, `SEO_PAGE_DESCRIPTION`, and `SEO_CURRENT_KEYWORDS` to supply the deployed frontend context for analysis.

The checked-in schedule `30 4 * * *` is 04:30 UTC (about 10:00 AM Sri Lanka time). Vercel Hobby permits only one Cron run per day, with up to an hour of timing variance. To run every four hours, use a Vercel Pro project and change the cron expression to `0 */4 * * *`. Cron runs only on production deployments; redeploy the backend project after adding the configuration. Vercel logs for `/api/seo-cron` show each run.

The Vercel job sends the Search Console and GA4 report with suggested keywords. It runs in report-only mode because a serverless function cannot persist edits to the separately deployed static `frontend/index.html`. The local scheduler can still edit that file. To publish Vercel keyword changes automatically, add a persistent content store or a secure deployment/update flow for the frontend.

## Scheduling and deployment

The script updates the local source file. It does not create a Git commit or publish a deployment. A `setTimeout` loop only works while a long-running Node process stays alive; Vercel Functions can stop between requests, so this is not a reliable Vercel scheduler. Vercel Cron can invoke a deployed function, but publishing changes to a static `index.html` needs a persistent storage or deployment mechanism. No GitHub Actions workflow is used by this project.

For Vercel, configure Google and Groq credentials as server-side Project Environment Variables. Never put them in frontend variables such as `VITE_*`, commit `.env` files, or expose the service-account private key.

## Email report

For local email delivery, configure `EMAIL_USER`, `EMAIL_PASS`, `SEO_REPORT_TO`, and optional `SMTP_HOST` / `SMTP_PORT` in `backend/.env`. Every successful daily job sends this report, including days with no keyword changes or no usable rows. Email delivery requires all three email values; a missing or failed SMTP configuration makes the job report an error.

## Search limitation

Google Search ignores the `meta keywords` tag for indexing and ranking. Use the query report to guide useful page content, titles, and descriptions as a separate SEO improvement.
