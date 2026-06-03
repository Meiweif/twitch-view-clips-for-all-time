const HELIX_MIN_INTERVAL_MS = 250;
const GQL_MIN_INTERVAL_MS = 350;
const MAX_RETRIES = 6;

let helixChain = Promise.resolve();
let lastHelixAt = 0;

let gqlChain = Promise.resolve();
let lastGqlAt = 0;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryAfterMs(response, attempt) {
  const header = response.headers.get('Retry-After');
  if (header) {
    const seconds = Number(header);
    if (!Number.isNaN(seconds)) {
      return seconds * 1000;
    }

    const dateMs = Date.parse(header);
    if (!Number.isNaN(dateMs)) {
      return Math.max(0, dateMs - Date.now());
    }
  }

  return Math.min(30_000, 1000 * (2 ** attempt));
}

export function isRateLimitError(error) {
  const message = String(error?.message || error || '');
  return message.includes('429') || message.includes('Too Many Requests');
}

export async function retryOnRateLimit(task, label = 'request') {
  let lastError = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      return await task(attempt);
    } catch (error) {
      lastError = error;

      if (!isRateLimitError(error) || attempt === MAX_RETRIES) {
        throw error;
      }

      const delay = Math.min(30_000, 1500 * (2 ** attempt));
      await sleep(delay);
    }
  }

  throw lastError || new Error(`Failed to complete ${label}`);
}

export async function scheduleHelix(task) {
  const run = helixChain.then(async () => {
    const now = Date.now();
    const wait = Math.max(0, HELIX_MIN_INTERVAL_MS - (now - lastHelixAt));
    if (wait) {
      await sleep(wait);
    }

    lastHelixAt = Date.now();
    return task();
  });

  helixChain = run.catch(() => {});
  return run;
}

export async function scheduleGql(task) {
  const run = gqlChain.then(async () => {
    const now = Date.now();
    const wait = Math.max(0, GQL_MIN_INTERVAL_MS - (now - lastGqlAt));
    if (wait) {
      await sleep(wait);
    }

    lastGqlAt = Date.now();
    return task();
  });

  gqlChain = run.catch(() => {});
  return run;
}

export async function helixFetch(url, options = {}) {
  return scheduleHelix(async () => retryOnRateLimit(async (attempt) => {
    const response = await fetch(url, options);

    if (response.status === 429) {
      const delay = parseRetryAfterMs(response, attempt);
      await sleep(delay);
      throw new Error(`429 ${await response.text()}`);
    }

    return response;
  }, 'Helix'));
}

export async function gqlFetch(url, options = {}) {
  return scheduleGql(async () => retryOnRateLimit(async (attempt) => {
    const response = await fetch(url, options);

    if (response.status === 429) {
      const delay = parseRetryAfterMs(response, attempt);
      await sleep(delay);
      throw new Error(`429 ${await response.text()}`);
    }

    if (!response.ok) {
      throw new Error(`GQL ${response.status} ${await response.text()}`);
    }

    return response;
  }, 'GQL'));
}

export async function runSequential(items, worker) {
  const results = [];

  for (const item of items) {
    results.push(await worker(item));
  }

  return results;
}
