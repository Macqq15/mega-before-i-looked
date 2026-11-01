// Plan morning-digest § 1. The contract every part of § 2 builds against.

/** Status of one line in runs/<night>.jsonl. */
export type JobStatus = 'ok' | 'retry' | 'fail';

/** One parsed line of runs/<night>.jsonl. */
export type RunLine = {
  at: string;
  job: string;
  status: JobStatus;
  owner: string | null;
  error?: string;
};

/** One row per job in a night. Times keep the log's offset (styleguide). */
export type DigestRow = {
  job: string;
  /** null when the log says null; views render it as `—`. */
  owner: string | null;
  /** Lines for this job. */
  runs: number;
  /** Lines with status `retry`. */
  retries: number;
  /** Status of the job's latest line. */
  lastStatus: JobStatus;
  /** Most recent error the job reported, even if a later run was ok; null if none. */
  lastError: string | null;
  firstAt: string;
  lastAt: string;
};

/** A night as the page and the JSON both show it. */
export type DigestNight = {
  night: string;
  /** Sorted by job. The page and the JSON use this order as is, so they never disagree. */
  rows: DigestRow[];
  /** Lines that did not parse. Counted, never thrown. */
  badLines: number;
};

/**
 * Reads runs/<night>.jsonl from runsDir.
 * Returns null when the night has no file (the routes answer 404).
 * An empty file gives rows: [] ("nothing ran").
 */
export type ReadNight = (runsDir: string, night: string) => DigestNight | null;
