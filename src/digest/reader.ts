import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestNight, DigestRow, JobStatus, ReadNight, RunLine } from './types.js';

const NIGHT = /^\d{4}-\d{2}-\d{2}$/;
const STATUSES: readonly JobStatus[] = ['ok', 'retry', 'fail'];

/** Parses one JSONL line at the edge. null = a bad line. */
export function parseLine(text: string): RunLine | null {
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  if (typeof o.at !== 'string' || typeof o.job !== 'string' || o.job === '') return null;
  if (!STATUSES.includes(o.status as JobStatus)) return null;
  const owner = o.owner ?? null;
  if (owner !== null && typeof owner !== 'string') return null;
  if (o.error !== undefined && typeof o.error !== 'string') return null;
  const line: RunLine = { at: o.at, job: o.job, status: o.status as JobStatus, owner };
  if (typeof o.error === 'string') line.error = o.error;
  return line;
}

/** Folds a night's lines into one row per job, sorted by job. Lines are in log order. */
export function toRows(lines: RunLine[]): DigestRow[] {
  const byJob = new Map<string, DigestRow>();
  for (const l of lines) {
    const row = byJob.get(l.job);
    if (!row) {
      byJob.set(l.job, {
        job: l.job,
        owner: l.owner,
        runs: 1,
        retries: l.status === 'retry' ? 1 : 0,
        lastStatus: l.status,
        lastError: l.error ?? null,
        firstAt: l.at,
        lastAt: l.at,
      });
      continue;
    }
    row.runs += 1;
    if (l.status === 'retry') row.retries += 1;
    row.lastStatus = l.status;
    if (l.error !== undefined) row.lastError = l.error;
    if (l.owner !== null) row.owner = l.owner;
    row.lastAt = l.at;
  }
  return [...byJob.values()].sort((a, b) => (a.job < b.job ? -1 : a.job > b.job ? 1 : 0));
}

export const readNight: ReadNight = (runsDir, night) => {
  // The night comes from a URL: only a plain date may reach the filesystem.
  if (!NIGHT.test(night)) return null;
  let text: string;
  try {
    text = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch {
    return null;
  }
  const lines: RunLine[] = [];
  let badLines = 0;
  for (const raw of text.split(/\r?\n/)) {
    if (raw.trim() === '') continue;
    const line = parseLine(raw);
    if (line) lines.push(line);
    else badLines += 1;
  }
  const result: DigestNight = { night, rows: toRows(lines), badLines };
  return result;
};

/** Lines per status in a night's log. Bad lines count as none. null when the night has no file. */
export function countStatuses(runsDir: string, night: string): Record<JobStatus, number> | null {
  if (!NIGHT.test(night)) return null;
  let text: string;
  try {
    text = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch {
    return null;
  }
  const counts: Record<JobStatus, number> = { ok: 0, retry: 0, fail: 0 };
  for (const raw of text.split(/\r?\n/)) {
    if (raw.trim() === '') continue;
    const line = parseLine(raw);
    if (line) counts[line.status] += 1;
  }
  return counts;
}
