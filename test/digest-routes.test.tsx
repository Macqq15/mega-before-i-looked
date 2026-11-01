import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { DigestNight } from '../src/digest/types.js';

let runsDir: string;

const line = (at: string, job: string, status: string, owner: string | null, error?: string) =>
  JSON.stringify(error === undefined ? { at, job, status, owner } : { at, job, status, owner, error });

beforeAll(() => {
  runsDir = mkdtempSync(join(tmpdir(), 'rig-digest-routes-'));
  // Clean night: two jobs, written out of order, with a retry and an error on one of them.
  writeFileSync(
    join(runsDir, '2026-10-29.jsonl'),
    [
      line('2026-10-29T01:00:00+01:00', 'zeta/last', 'ok', 'rook'),
      line('2026-10-29T01:05:00+01:00', 'alpha/first', 'retry', null, 'timeout'),
      line('2026-10-29T01:06:00+01:00', 'alpha/first', 'ok', 'rook'),
      '',
    ].join('\n'),
  );
  // Empty file: the night ran nothing.
  writeFileSync(join(runsDir, '2026-10-30.jsonl'), '');
  // One line that is not JSON, between two good lines.
  writeFileSync(
    join(runsDir, '2026-10-31.jsonl'),
    [
      line('2026-10-31T02:00:00+01:00', 'mid/job', 'ok', 'rook'),
      'not json',
      line('2026-10-31T02:10:00+01:00', 'beta/job', 'fail', null, 'quota exceeded'),
      '',
    ].join('\n'),
  );
});

afterAll(() => {
  rmSync(runsDir, { recursive: true, force: true });
});

const config = () => ({
  adapter: 'shim',
  installed: '2026-10-29T14:06:00+01:00',
  beatEverySeconds: 60,
  runsDir,
});

/** Job names in the order the HTML table lists them (first cell of each body row). */
function htmlJobs(html: string): string[] {
  const body = /<tbody>([\s\S]*?)<\/tbody>/.exec(html)?.[1] ?? '';
  return [...body.matchAll(/<tr>\s*<td>([^<]*)<\/td>/g)].map((m) => m[1]!);
}

describe('GET /digest/:night (HTML)', () => {
  it('200 for a night with data', async () => {
    const res = await createApp(config()).request('/digest/2026-10-29');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('digest 2026-10-29');
    expect(html).toContain('alpha/first');
    expect(html).toContain('zeta/last');
  });

  it('404 for a night with no file', async () => {
    const res = await createApp(config()).request('/digest/2026-12-31');
    expect(res.status).toBe(404);
    expect(await res.text()).toContain('no log for night 2026-12-31');
  });

  it('shows "nothing ran" for an empty night', async () => {
    const res = await createApp(config()).request('/digest/2026-10-30');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('nothing ran');
    expect(html).not.toContain('could not be read');
  });

  it('still 200 with a bad line, and says so', async () => {
    const res = await createApp(config()).request('/digest/2026-10-31');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('1 line could not be read');
    expect(html).toContain('mid/job');
    expect(html).toContain('beta/job');
  });
});

describe('GET /api/digest/:night (JSON)', () => {
  it('200 with rows for a night with data', async () => {
    const res = await createApp(config()).request('/api/digest/2026-10-29');
    expect(res.status).toBe(200);
    const body = (await res.json()) as DigestNight;
    expect(body.night).toBe('2026-10-29');
    expect(body.badLines).toBe(0);
    expect(body.rows.map((r) => r.job)).toEqual(['alpha/first', 'zeta/last']);
    expect(body.rows[0]).toMatchObject({ runs: 2, retries: 1, lastStatus: 'ok', lastError: 'timeout' });
  });

  it('404 for a night with no file', async () => {
    const res = await createApp(config()).request('/api/digest/2026-12-31');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'no log for night 2026-12-31' });
  });

  it('empty night: rows is []', async () => {
    const res = await createApp(config()).request('/api/digest/2026-10-30');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ night: '2026-10-30', rows: [], badLines: 0 });
  });

  it('bad line: badLines is 1 and the good rows are kept', async () => {
    const res = await createApp(config()).request('/api/digest/2026-10-31');
    expect(res.status).toBe(200);
    const body = (await res.json()) as DigestNight;
    expect(body.badLines).toBe(1);
    expect(body.rows.map((r) => r.job)).toEqual(['beta/job', 'mid/job']);
  });
});

describe('page and JSON agree', () => {
  it('list the same jobs in the same order for the same night', async () => {
    const app = createApp(config());
    const html = await (await app.request('/digest/2026-10-31')).text();
    const json = (await (await app.request('/api/digest/2026-10-31')).json()) as DigestNight;
    expect(htmlJobs(html)).toEqual(json.rows.map((r) => r.job));
    expect(htmlJobs(html)).toHaveLength(2);
  });
});
