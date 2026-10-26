import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

const backendDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: resolve(backendDirectory, '.env') });

const requireEnv = name => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
};

const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]));

export async function sendSeoSummary(report) {
  const user = requireEnv('EMAIL_USER');
  const password = requireEnv('EMAIL_PASS');
  const recipient = requireEnv('SEO_REPORT_TO');
  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = Number(process.env.SMTP_PORT) || 465;
  const bullets = values => values.map(value => `• ${value}`).join('\n') || '• No rows returned.';
  const keywords = bullets(report.keywords || []);
  const organic = bullets((report.googleAnalyticsOrganic || []).map(row => `${row.sourceMedium}: ${row.sessions} sessions, ${row.activeUsers} active users`));
  const organicPages = bullets((report.googleAnalyticsOrganicLandingPages || []).map(row => `${row.landingPage}: ${row.sessions} sessions, ${row.activeUsers} active users`));
  const allPages = bullets((report.googleAnalyticsLandingPages || []).map(row => `${row.sourceMedium} — ${row.landingPage}: ${row.sessions} sessions, ${row.activeUsers} active users`));
  const queries = bullets((report.topQueries || []).map(row => `${row.query}: ${row.impressions} impressions, ${row.clicks} clicks, position ${Number(row.position).toFixed(1)}`));
  const status = report.keywordWriteMode === 'report-only'
    ? 'Vercel cron sent the analysis and suggested keywords by email. It cannot write to the deployed static frontend file.'
    : report.changed ? 'Keywords were updated in frontend/index.html.' : 'Keywords did not change; the existing page keywords were kept.';
  const text = [
    'Daily SEO performance summary',
    status,
    `Reporting period: ${report.period.startDate} to ${report.period.endDate}`,
    '', 'Analysis:', report.summary || 'No analysis summary available.',
    '', 'Keywords:', keywords,
    '', 'Google Analytics organic traffic:', organic,
    '', 'Google organic landing pages:', organicPages,
    '', 'GA4 landing pages by traffic source:', allPages,
    '', 'Search Console queries by impressions:', queries,
  ].join('\n');
  const list = values => `<ul>${values.map(value => `<li>${escapeHtml(value)}</li>`).join('') || '<li>No rows returned.</li>'}</ul>`;
  const html = `<h2>Daily SEO performance summary</h2><p>${escapeHtml(status)}</p><p><strong>Period:</strong> ${escapeHtml(report.period.startDate)} to ${escapeHtml(report.period.endDate)}</p><p><strong>Analysis:</strong> ${escapeHtml(report.summary || 'No analysis summary available.')}</p><h3>Keywords</h3>${list(report.keywords || [])}<h3>Google Analytics organic traffic</h3>${list((report.googleAnalyticsOrganic || []).map(row => `${row.sourceMedium}: ${row.sessions} sessions, ${row.activeUsers} active users`))}<h3>Google organic landing pages</h3>${list((report.googleAnalyticsOrganicLandingPages || []).map(row => `${row.landingPage}: ${row.sessions} sessions, ${row.activeUsers} active users`))}<h3>GA4 landing pages by traffic source</h3>${list((report.googleAnalyticsLandingPages || []).map(row => `${row.sourceMedium} — ${row.landingPage}: ${row.sessions} sessions, ${row.activeUsers} active users`))}<h3>Search Console queries</h3>${list((report.topQueries || []).map(row => `${row.query}: ${row.impressions} impressions, ${row.clicks} clicks, position ${Number(row.position).toFixed(1)}`))}`;
  const transport = nodemailer.createTransport({
    host, port, secure: port === 465, requireTLS: port !== 465,
    auth: { user, pass: password },
    connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 15_000,
  });
  try {
    await transport.sendMail({
      from: { name: 'Frame to Code SEO', address: user },
      to: recipient,
      subject: `Daily SEO performance summary — ${report.date}`,
      text,
      html,
    });
  } finally {
    transport.close();
  }
  console.log(`SEO performance summary sent to ${recipient}.`);
}

async function main() {
  const report = JSON.parse(await readFile(requireEnv('SEO_SUMMARY_FILE'), 'utf8'));
  await sendSeoSummary(report);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
