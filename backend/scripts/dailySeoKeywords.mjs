import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { GoogleAuth } from 'google-auth-library';
import { sendSeoSummary } from './sendSeoSummary.mjs';

const siteFile = new URL('../../frontend/index.html', import.meta.url);
const backendDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: resolve(backendDirectory, '.env') });
const requiredEnv = ['SEO_GA4_PROPERTY_ID', 'SEO_SEARCH_CONSOLE_SITE', 'GROQ_API_KEY'];

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function dateDaysAgo(days) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(30_000) });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = body.error?.message || body.error_description || `HTTP ${response.status}`;
    const error = new Error(`Request to ${new URL(url).hostname} failed: ${message}`);
    error.status = response.status;
    throw error;
  }
  return body;
}

async function loadGoogleCredentials() {
  if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE?.trim()) {
    const keyPath = resolve(backendDirectory, process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE.trim());
    return JSON.parse(await readFile(keyPath, 'utf8'));
  }
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim()) return JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64?.trim()) {
    return JSON.parse(Buffer.from(process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64.trim(), 'base64').toString('utf8'));
  }
  throw new Error('Set GOOGLE_SERVICE_ACCOUNT_KEY_FILE, GOOGLE_SERVICE_ACCOUNT_JSON, or GOOGLE_SERVICE_ACCOUNT_JSON_BASE64.');
}

async function googleReport(url, authClient, body) {
  const response = await authClient.request({
    url,
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    data: body,
    timeout: 30_000,
  });
  return response.data;
}

async function fetchPerformanceData(authClient) {
  const lookbackDays = Number.parseInt(process.env.SEO_LOOKBACK_DAYS || '90', 10);
  if (!Number.isInteger(lookbackDays) || lookbackDays < 28 || lookbackDays > 365) {
    throw new Error('SEO_LOOKBACK_DAYS must be a whole number between 28 and 365.');
  }
  const startDate = dateDaysAgo(lookbackDays + 3);
  const endDate = dateDaysAgo(3);
  const propertyId = requireEnv('SEO_GA4_PROPERTY_ID').replace(/^properties\//, '');
  const site = requireEnv('SEO_SEARCH_CONSOLE_SITE');
  const [analytics, landingAnalytics, search] = await Promise.all([
    googleReport(`https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(propertyId)}:runReport`, authClient, {
      dateRanges: [{ startDate: `${lookbackDays}daysAgo`, endDate: '3daysAgo' }],
      dimensions: [{ name: 'sessionSourceMedium' }],
      metrics: [{ name: 'sessions' }, { name: 'activeUsers' }],
      limit: '100',
    }),
    googleReport(`https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(propertyId)}:runReport`, authClient, {
      dateRanges: [{ startDate: `${lookbackDays}daysAgo`, endDate: '3daysAgo' }],
      dimensions: [{ name: 'sessionSourceMedium' }, { name: 'landingPagePlusQueryString' }],
      metrics: [{ name: 'sessions' }, { name: 'activeUsers' }],
      limit: '100',
    }),
    googleReport(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site)}/searchAnalytics/query`, authClient, {
      startDate,
      endDate,
      dimensions: ['query'],
      type: 'web',
      rowLimit: 100,
    }),
  ]);

  const organicGoogle = (analytics.rows || [])
    .map(row => ({
      sourceMedium: row.dimensionValues?.[0]?.value || '',
      sessions: Number(row.metricValues?.[0]?.value || 0),
      activeUsers: Number(row.metricValues?.[1]?.value || 0),
    }))
    .filter(row => /google\s*\/\s*organic/i.test(row.sourceMedium));
  const analyticsLandingPages = (landingAnalytics.rows || [])
    .map(row => ({
      sourceMedium: row.dimensionValues?.[0]?.value || '',
      landingPage: row.dimensionValues?.[1]?.value || '',
      sessions: Number(row.metricValues?.[0]?.value || 0),
      activeUsers: Number(row.metricValues?.[1]?.value || 0),
    }))
    .filter(row => row.landingPage)
    .sort((a, b) => b.sessions - a.sessions);
  const organicLandingPages = analyticsLandingPages.filter(row => /google\s*\/\s*organic/i.test(row.sourceMedium));
  const queries = (search.rows || [])
    .map(row => ({
      query: String(row.keys?.[0] || '').trim(),
      clicks: Number(row.clicks || 0),
      impressions: Number(row.impressions || 0),
      ctr: Number(row.ctr || 0),
      position: Number(row.position || 0),
    }))
    .filter(row => row.query.length >= 3 && row.query.length <= 100 && row.impressions > 0);

  return { period: { startDate, endDate }, organicGoogle, organicLandingPages, analyticsLandingPages, queries };
}

function extractResponseText(response) {
  const text = response.choices?.[0]?.message?.content;
  if (typeof text === 'string' && text.trim()) return text;
  throw new Error('Groq returned no keyword response.');
}

async function suggestKeywords(performance, currentKeywords) {
  const response = await requestJson('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { authorization: `Bearer ${requireEnv('GROQ_API_KEY')}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: process.env.GROQ_MODEL || 'openai/gpt-oss-20b',
      temperature: 0,
      max_tokens: 1200,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'You are an SEO analyst. When Search Console query data is present, prioritize actual queries by impressions and CTR. When absent, use GA4 landing-page visits and traffic source only as evidence about which page topics attract visitors; GA4 does not provide search query terms, so never claim a phrase was searched or invent search demand. Prefer Google organic landing pages when supplied; if none exist, use other GA4 landing pages as general page-interest context, not as search evidence. Keep suggestions grounded in the supplied page title, description, current keywords, and product. Return 8 to 15 concise useful phrases when supported. Summarize the evidence and limitation in one or two short sentences. Return valid JSON only, with exactly two keys: "keywords" (an array of strings) and "summary" (a string).' },
        { role: 'user', content: JSON.stringify({
          product: 'Frame to Code converts Figma designs into responsive HTML, React, Vue, and Tailwind code.',
          currentKeywords,
          pageTitle: performance.pageTitle,
          pageDescription: performance.pageDescription,
          period: performance.period,
          googleAnalyticsOrganicTraffic: performance.organicGoogle,
          googleAnalyticsOrganicLandingPages: performance.organicLandingPages,
          googleAnalyticsLandingPages: performance.analyticsLandingPages,
          googleSearchConsoleQueries: performance.queries,
          requestedKeywordCount: '8-15',
        }) },
      ],
    }),
  });
  return JSON.parse(extractResponseText(response));
}

function normalize(value) {
  return value.toLocaleLowerCase('en').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

function onlyDataBackedKeywords(proposed, queries, pageContext = []) {
  const normalizedQueries = queries.map(row => normalize(row.query)).filter(Boolean);
  const contextWords = new Set(pageContext.map(normalize).join(' ').split(' ').filter(word => word.length > 2));
  const selected = [];
  const seen = new Set();
  for (const raw of proposed) {
    if (typeof raw !== 'string') continue;
    const keyword = raw.replace(/[<>"'`]/g, '').replace(/\s+/g, ' ').trim();
    const key = normalize(keyword);
    if (keyword.length < 3 || keyword.length > 80 || !key || seen.has(key)) continue;
    const words = key.split(' ');
    const supportedByQuery = normalizedQueries.some(query => {
      const queryWords = new Set(query.split(' '));
      const overlap = words.filter(word => queryWords.has(word)).length / words.length;
      return overlap >= 0.8;
    });
    const supportedByPage = words.filter(word => contextWords.has(word)).length / words.length >= 0.6;
    const supported = normalizedQueries.length ? supportedByQuery : supportedByPage;
    if (!supported) continue;
    seen.add(key);
    selected.push(keyword);
    if (selected.length === 15) break;
  }
  if (selected.length < 5) throw new Error('Groq did not return enough keywords supported by the available search or page data; leaving the page unchanged.');
  return selected;
}

function keywordsFromQueries(queries) {
  const seen = new Set();
  return [...queries]
    .sort((a, b) => b.impressions - a.impressions)
    .map(row => row.query.replace(/[<>"'`]/g, '').replace(/\s+/g, ' ').trim())
    .filter(keyword => {
      const key = normalize(keyword);
      if (keyword.length < 3 || keyword.length > 80 || !key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 15);
}

function replaceKeywordMeta(html, keywords) {
  const content = keywords.join(', ').replaceAll('&', '&amp;').replaceAll('"', '&quot;');
  return html.replace(/(<meta\s+name="keywords"\s+content=")[^"]*("\s*\/?>)/i, (_match, before, after) => `${before}${content}${after}`);
}

async function main() {
  for (const name of requiredEnv) requireEnv(name);
  const credentials = await loadGoogleCredentials();
  if (!credentials.client_email || !credentials.private_key) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is missing client_email or private_key.');

  const html = await readFile(siteFile, 'utf8');
  const pageTitle = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() || '';
  const pageDescription = html.match(/<meta\s+name="description"\s+content="([^"]*)"/i)?.[1]?.trim() || '';
  const current = html.match(/<meta\s+name="keywords"\s+content="([^"]*)"/i)?.[1];
  if (!current) throw new Error('Could not read the keywords meta tag in frontend/index.html.');
  const currentKeywords = current.split(',').map(value => value.trim()).filter(Boolean);

  const auth = new GoogleAuth({
    credentials,
    scopes: [
      'https://www.googleapis.com/auth/analytics.readonly',
      'https://www.googleapis.com/auth/webmasters.readonly',
    ],
  });
  const authClient = await auth.getClient();
  const performance = await fetchPerformanceData(authClient);
  performance.pageTitle = pageTitle;
  performance.pageDescription = pageDescription;
  let keywords = currentKeywords;
  let summary = 'No usable Search Console query or GA4 landing-page rows were returned. Existing keywords were kept.';
  if (performance.queries.length || performance.analyticsLandingPages.length) {
    try {
      const suggestion = await suggestKeywords(performance, currentKeywords);
      keywords = onlyDataBackedKeywords(suggestion.keywords, performance.queries, [
        ...currentKeywords, pageTitle, pageDescription,
        ...performance.analyticsLandingPages.map(row => row.landingPage),
      ]);
      summary = String(suggestion.summary || '').trim().slice(0, 500);
    } catch (error) {
      if (performance.queries.length) {
        const queryKeywords = keywordsFromQueries(performance.queries);
        if (queryKeywords.length) {
          keywords = queryKeywords;
          summary = `Groq suggestions could not be validated, so the page uses ${queryKeywords.length} exact Search Console queries. GA4 traffic is included in this email.`;
        } else {
          summary = `Keyword suggestions were not safe to apply (${error.message}); existing keywords were kept.`;
        }
      } else {
        summary = `Keyword suggestions were not safe to apply (${error.message}); existing keywords were kept. GA4 and Search Console data are included below.`;
      }
    }
  }
  const updatedHtml = replaceKeywordMeta(html, keywords);
  const normalizeKeywordSet = values => values.map(normalize).sort().join('|');
  const changed = normalizeKeywordSet(currentKeywords) !== normalizeKeywordSet(keywords);
  const topQueries = [...performance.queries].sort((a, b) => b.impressions - a.impressions).slice(0, 8);
  const report = {
    date: new Date().toISOString().slice(0, 10),
    period: performance.period,
    keywords,
    summary,
    changed,
    googleAnalyticsOrganic: performance.organicGoogle,
    googleAnalyticsOrganicLandingPages: performance.organicLandingPages.slice(0, 10),
    googleAnalyticsLandingPages: performance.analyticsLandingPages.slice(0, 10),
    topQueries,
  };

  if (changed) await writeFile(siteFile, updatedHtml, 'utf8');
  const reportPath = process.env.SEO_SUMMARY_FILE;
  if (reportPath) await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await sendSeoSummary(report);
  console.log(changed ? `Updated ${keywords.length} keywords.` : 'Keywords are unchanged; the data summary was emailed.');
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
