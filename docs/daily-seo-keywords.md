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

To run it daily at 10:26 AM Sri Lanka time on a local, always-on Node process, use:

```powershell
npm run schedule:seo --prefix backend
```

Keep that process running. The scheduler uses `setTimeout`, reads `SEO_SCHEDULE_TIMEZONE`, `SEO_SCHEDULE_HOUR`, and `SEO_SCHEDULE_MINUTE` from `backend/.env`, and runs the SEO script at the next scheduled time. It is for a continuously running local/Node server, not Vercel serverless functions.

## Scheduling and deployment

The script updates the local source file. It does not create a Git commit or publish a deployment. A `setTimeout` loop only works while a long-running Node process stays alive; Vercel Functions can stop between requests, so this is not a reliable Vercel scheduler. Vercel Cron can invoke a deployed function, but publishing changes to a static `index.html` needs a persistent storage or deployment mechanism. No GitHub Actions workflow is used by this project.

For Vercel, configure Google and Groq credentials as server-side Project Environment Variables. Never put them in frontend variables such as `VITE_*`, commit `.env` files, or expose the service-account private key.

## Email report

For local email delivery, configure `EMAIL_USER`, `EMAIL_PASS`, `SEO_REPORT_TO`, and optional `SMTP_HOST` / `SMTP_PORT` in `backend/.env`. Every successful daily job sends this report, including days with no keyword changes or no usable rows. Email delivery requires all three email values; a missing or failed SMTP configuration makes the job report an error.

## Search limitation

Google Search ignores the `meta keywords` tag for indexing and ranking. Use the query report to guide useful page content, titles, and descriptions as a separate SEO improvement.
