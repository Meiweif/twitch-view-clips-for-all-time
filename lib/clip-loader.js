import { tr } from './i18n.js';

const CLIPS_LAUNCH = new Date('2016-05-01T00:00:00Z');
const PERIOD_MS = 60 * 24 * 60 * 60 * 1000;
const SPLIT_THRESHOLD = 500;
const MIN_PERIOD_MS = 60 * 60 * 1000;
const PAGE_DELAY_MS = 120;

export class LoadCancelledError extends Error {
  constructor() {
    super('LOAD_CANCELLED');
    this.name = 'LoadCancelledError';
  }
}

function checkAbort(signal) {
  if (signal?.aborted) {
    throw new LoadCancelledError();
  }
}

function buildResumeState(completedWindows, totalWindows, quickPhaseDone) {
  return {
    completedWindows,
    totalWindows,
    quickPhaseDone
  };
}

export async function loadAllClips(broadcasterId, apiGet, onProgress, signal, resumeState = null) {
  const clipMap = new Map();

  if (resumeState?.clips) {
    for (const clip of resumeState.clips) {
      clipMap.set(clip.id, clip);
    }
  }

  const now = new Date();
  const windows = buildWindows(CLIPS_LAUNCH, now, PERIOD_MS);
  let completedWindows = resumeState?.completedWindows ?? 0;
  let quickPhaseDone = resumeState?.quickPhaseDone ?? false;

  completedWindows = Math.min(completedWindows, windows.length);

  if (!quickPhaseDone) {
    onProgress({
      phase: 'quick',
      loaded: clipMap.size,
      message: tr('loadQuick'),
      resumeState: buildResumeState(completedWindows, windows.length, quickPhaseDone)
    });

    checkAbort(signal);
    await fetchWithPagination(broadcasterId, apiGet, clipMap, {}, signal);
    quickPhaseDone = true;

    onProgress({
      phase: 'partial',
      loaded: clipMap.size,
      clips: Array.from(clipMap.values()),
      message: tr('loadPartial', { count: clipMap.size }),
      resumeState: buildResumeState(completedWindows, windows.length, quickPhaseDone)
    });
  } else if (resumeState) {
    onProgress({
      phase: 'partial',
      loaded: clipMap.size,
      clips: Array.from(clipMap.values()),
      message: tr('loadPartial', { count: clipMap.size }),
      resumeState: buildResumeState(completedWindows, windows.length, quickPhaseDone)
    });
  }

  try {
    for (let index = completedWindows; index < windows.length; index += 1) {
      checkAbort(signal);
      const window = windows[index];
      await fetchClipsInPeriod(broadcasterId, apiGet, clipMap, window.start, window.end, signal);
      completedWindows = index + 1;

      onProgress({
        phase: 'full',
        loaded: clipMap.size,
        clips: Array.from(clipMap.values()),
        message: tr('loadFull', {
          count: clipMap.size,
          done: completedWindows,
          total: windows.length
        }),
        resumeState: buildResumeState(completedWindows, windows.length, quickPhaseDone)
      });
    }
  } catch (error) {
    if (error instanceof LoadCancelledError) {
      const clips = Array.from(clipMap.values());
      onProgress({
        phase: 'cancelled',
        loaded: clips.length,
        clips,
        message: tr('loadCancelledMsg', { count: clips.length }),
        resumeState: buildResumeState(completedWindows, windows.length, quickPhaseDone)
      });
      return clips;
    }
    throw error;
  }

  const clips = Array.from(clipMap.values());

  onProgress({
    phase: 'done',
    loaded: clips.length,
    clips,
    message: tr('loadDone', { count: clips.length })
  });

  return clips;
}

function buildWindows(start, end, periodMs) {
  const windows = [];
  let windowStart = new Date(start);

  while (windowStart < end) {
    const windowEnd = new Date(Math.min(windowStart.getTime() + periodMs, end.getTime()));
    windows.push({ start: new Date(windowStart), end: windowEnd });
    windowStart = windowEnd;
  }

  return windows;
}

async function fetchWithPagination(broadcasterId, apiGet, clipMap, range, signal) {
  let cursor = null;

  do {
    checkAbort(signal);

    const params = new URLSearchParams({
      broadcaster_id: broadcasterId,
      first: '100'
    });

    if (range.startedAt) {
      params.set('started_at', range.startedAt.toISOString());
    }

    if (range.endedAt) {
      params.set('ended_at', range.endedAt.toISOString());
    }

    if (cursor) {
      params.set('after', cursor);
    }

    const data = await apiGet(`/clips?${params}`);
    for (const clip of data.data) {
      clipMap.set(clip.id, clip);
    }

    cursor = data.pagination?.cursor || null;

    if (cursor) {
      await sleep(PAGE_DELAY_MS);
    }
  } while (cursor);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchClipsInPeriod(broadcasterId, apiGet, clipMap, start, end, signal) {
  const sizeBefore = clipMap.size;

  await fetchWithPagination(broadcasterId, apiGet, clipMap, {
    startedAt: start,
    endedAt: end
  }, signal);

  const added = clipMap.size - sizeBefore;

  if (added >= SPLIT_THRESHOLD && end.getTime() - start.getTime() > MIN_PERIOD_MS) {
    for (const [id, clip] of clipMap.entries()) {
      const created = new Date(clip.created_at).getTime();
      if (created >= start.getTime() && created < end.getTime()) {
        clipMap.delete(id);
      }
    }

    const midMs = Math.floor((start.getTime() + end.getTime()) / 2);
    const mid = new Date(midMs);
    await fetchClipsInPeriod(broadcasterId, apiGet, clipMap, start, mid, signal);
    await fetchClipsInPeriod(broadcasterId, apiGet, clipMap, mid, end, signal);
  }
}
