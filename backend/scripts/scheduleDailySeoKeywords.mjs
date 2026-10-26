import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const backendDirectory = resolve(scriptDirectory, '..');
const repositoryDirectory = resolve(backendDirectory, '..');
const jobScript = resolve(scriptDirectory, 'dailySeoKeywords.mjs');
dotenv.config({ path: resolve(backendDirectory, '.env') });

const intervalHours = Number(process.env.SEO_INTERVAL_HOURS || 4);
if (!Number.isFinite(intervalHours) || intervalHours <= 0 || intervalHours > 24) {
  throw new Error('SEO_INTERVAL_HOURS must be greater than 0 and at most 24.');
}
const intervalMs = intervalHours * 60 * 60 * 1000;

function runJob() {
  const startedAt = new Date();
  console.log(`Starting SEO job at ${startedAt.toLocaleString()}.`);
  const child = spawn(process.execPath, [jobScript], {
    cwd: repositoryDirectory,
    env: process.env,
    stdio: 'inherit',
  });
  child.on('error', error => {
    console.error(`Could not start SEO job: ${error.message}`);
  });
  child.on('close', code => {
    console.log(`SEO job finished with exit code ${code}.`);
    scheduleNextRun();
  });
}

function scheduleNextRun() {
  console.log(`Next SEO job starts in ${intervalHours} hours.`);
  setTimeout(runJob, intervalMs);
}

// Start once now; subsequent runs are spaced from the completion of the prior run.
runJob();
