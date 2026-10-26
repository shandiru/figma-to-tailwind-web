import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const backendDirectory = resolve(scriptDirectory, '..');
const repositoryDirectory = resolve(backendDirectory, '..');
const jobScript = resolve(scriptDirectory, 'dailySeoKeywords.mjs');
dotenv.config({ path: resolve(backendDirectory, '.env') });
const timeZone = process.env.SEO_SCHEDULE_TIMEZONE || 'Asia/Colombo';
const runHour = Number(process.env.SEO_SCHEDULE_HOUR || 10);
const runMinute = Number(process.env.SEO_SCHEDULE_MINUTE || 26);

if (!Number.isInteger(runHour) || runHour < 0 || runHour > 23
  || !Number.isInteger(runMinute) || runMinute < 0 || runMinute > 59) {
  throw new Error('SEO_SCHEDULE_HOUR must be 0-23 and SEO_SCHEDULE_MINUTE must be 0-59.');
}

const dateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const dateTimeFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

function partsAsObject(formatter, date) {
  return Object.fromEntries(formatter.formatToParts(date)
    .filter(part => part.type !== 'literal')
    .map(part => [part.type, Number(part.value)]));
}

function localDateTimeToUtc(year, month, day) {
  const localAsUtc = Date.UTC(year, month - 1, day, runHour, runMinute);
  const zoned = partsAsObject(dateTimeFormatter, new Date(localAsUtc));
  const zonedAsUtc = Date.UTC(zoned.year, zoned.month - 1, zoned.day, zoned.hour, zoned.minute, zoned.second);
  return new Date(localAsUtc - (zonedAsUtc - localAsUtc));
}

function getNextRun() {
  const now = new Date();
  const { year, month, day } = partsAsObject(dateFormatter, now);
  let target = localDateTimeToUtc(year, month, day);
  if (target <= now) {
    const nextDay = new Date(Date.UTC(year, month - 1, day + 1));
    target = localDateTimeToUtc(nextDay.getUTCFullYear(), nextDay.getUTCMonth() + 1, nextDay.getUTCDate());
  }
  return target;
}

function scheduleNextRun() {
  const target = getNextRun();
  const delay = Math.max(0, target.getTime() - Date.now());
  console.log(`SEO job scheduled for ${new Intl.DateTimeFormat('en-LK', {
    timeZone,
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(target)} (${timeZone}).`);

  setTimeout(() => {
    console.log('Starting scheduled SEO keyword refresh.');
    const child = spawn(process.execPath, [jobScript], {
      cwd: repositoryDirectory,
      env: process.env,
      stdio: 'inherit',
    });
    child.on('error', error => {
      console.error(`Could not start SEO job: ${error.message}`);
      scheduleNextRun();
    });
    child.on('close', code => {
      console.log(`SEO job finished with exit code ${code}.`);
      scheduleNextRun();
    });
  }, delay);
}

scheduleNextRun();
