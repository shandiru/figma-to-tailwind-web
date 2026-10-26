import { runSeoJob } from '../scripts/dailySeoKeywords.mjs';

export default async function handler(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return response.status(405).json({ error: 'Method not allowed.' });
  }

  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.authorization !== `Bearer ${secret}`) {
    return response.status(401).json({ error: 'Unauthorized.' });
  }

  try {
    const report = await runSeoJob({ updateHtml: false });
    return response.status(200).json({
      ok: true,
      date: report.date,
      keywordCount: report.keywords.length,
      keywordChangesApplied: false,
      emailSent: true,
    });
  } catch (error) {
    console.error('Vercel SEO cron failed:', error);
    return response.status(500).json({ error: 'SEO cron failed. Check the function logs.' });
  }
}
