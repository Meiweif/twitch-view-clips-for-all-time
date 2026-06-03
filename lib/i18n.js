export const DATE_LOCALE = 'en-US';

const STRINGS = {
  popupTitle: 'Twitch Clips',
  popupSubtitle: 'Browse all clips from a channel',
  channelLabel: 'Channel name',
  channelPlaceholder: 'e.g. shroud',
  openClips: 'Open clips',
  channelRequired: 'Enter a channel name',
  toggleApiSettings: 'Twitch API settings',
  apiHint: 'Create an app at {link} ({confidential} type), enter Client ID and Client Secret, then click Save.',
  confidential: 'Confidential',
  save: 'Save',
  saving: 'Checking...',
  saved: 'Saved',
  saveFailed: 'Could not save',
  apiSaveFailed: 'Could not save API keys',
  apiRequired: 'Set up Client ID and Client Secret first',
  fillCredentials: 'Enter Client ID and Client Secret',
  optionsTitle: 'Twitch API settings',
  optionsSubtitle: 'Enter your dev.twitch.tv app credentials',
  optionsHint: 'Create an app at {link}. App type: {confidential}. Keys are verified automatically after saving.',
  pageClips: 'Channel clips',
  pageClipsNamed: 'Clips: {channel}',
  pageTitleNamed: 'Clips {channel} — Twitch Clips Viewer',
  changeChannel: 'Change channel',
  refresh: 'Refresh',
  loadingClips: 'Loading clips...',
  loadingClipsChannel: 'Loading clips for {channel}...',
  loadingClipsHint: 'First clips will appear in a few seconds',
  loadingRest: 'Loading remaining clips...',
  cancel: 'Cancel',
  back: 'Back',
  forward: 'Next',
  pageInfo: 'Page {page} of {total} ({count} {clips})',
  searchPlaceholder: 'Search clips...',
  sortOldest: 'Oldest first',
  sortNewest: 'Newest first',
  sortPopular: 'Most popular',
  sortUnpopular: 'Least views',
  colNum: '#',
  colCreator: 'Username',
  colClip: 'Clip',
  colDate: 'Created',
  colViews: 'Views',
  colDuration: 'Duration',
  emptyClips: 'No clips found',
  openSettings: 'Open settings',
  changeChannelTitle: 'Change channel',
  channelModalPlaceholder: 'e.g. shroud',
  open: 'Open',
  confirmTitle: 'Confirm',
  confirmStop: 'Stop',
  clipUntitled: 'Untitled',
  clipDefault: 'Clip',
  quality: 'Quality',
  download: 'Download',
  downloading: 'Downloading...',
  loadingClip: 'Loading clip...',
  openOnTwitch: 'Open on Twitch',
  watchClip: 'Watch clip',
  close: 'Close',
  trackingSince: 'Tracking since {date}',
  clipCount: 'Clips created:',
  topClip: 'Most popular clip',
  lastClip: 'Latest clip',
  viewsOnClip: '{count} views · {date}',
  channelTotal: '@{login} · {count} {clips} total',
  cancelLoadConfirm: 'Stop loading the remaining clips?',
  noChannelInUrl: 'Add channel to the URL: ?channel=channel_name',
  loadError: 'Something went wrong while loading',
  loadCancelled: 'Loading cancelled',
  playError: 'Could not play clip',
  loadClipError: 'Could not load clip',
  downloadError: 'Could not download clip',
  emptyFile: 'Empty clip file',
  emptyResponse: 'Empty response',
  genericError: 'Error',
  apiError: 'API error',
  clipWord1: 'clip',
  clipWord2: 'clips',
  clipWord5: 'clips',
  minSec: '{mins} min {secs} sec',
  secOnly: '{secs} sec',
  dragPopover: 'Drag to move',
  loadQuick: 'Quick load of first clips...',
  loadPartial: 'Loaded {count} clips, fetching the rest...',
  loadFull: 'Loaded {count} clips ({done}/{total} periods)...',
  loadCancelledMsg: 'Loading stopped: {count} clips',
  loadDone: 'Done: {count} clips',
  errRateLimit: 'Too many requests to Twitch. Wait a minute and click Refresh.',
  errApi: 'Twitch API error ({status}): {text}',
  errChannelNotFound: 'Channel «{login}» not found',
  errCredentialsRequired: 'Set up Client ID and Client Secret in the extension popup (dev.twitch.tv/console/apps)',
  errClipUnavailable: 'Clip is not available for playback',
  errInvalidClientSecret: 'Invalid Client Secret. 1) On dev.twitch.tv open your app → Manage → New Secret. 2) Copy the full secret (not Client ID). 3) App type must be Confidential, not Public.',
  errInvalidClientId: 'Invalid Client ID. Make sure you copied the Client ID from the Twitch console.',
  credentialsSaved: 'Keys saved and verified',
  unknownError: 'Unknown error'
};

function format(key, vars = {}) {
  const template = STRINGS[key] ?? key;
  return template.replace(/\{(\w+)\}/g, (_, name) => (vars[name] != null ? String(vars[name]) : ''));
}

export function t(_lang, key, vars = {}) {
  return format(key, vars);
}

export function tr(key, vars = {}) {
  return format(key, vars);
}

export function setActiveLanguage() {}

export async function getStoredLanguage() {
  return 'en';
}

export async function setStoredLanguage() {
  await chrome.storage.local.set({ language: 'en' });
}

export class I18nError extends Error {
  constructor(key, vars = {}) {
    super(key);
    this.name = 'I18nError';
    this.i18nKey = key;
    this.i18nVars = vars;
  }
}

export function translateError(error) {
  if (error?.i18nKey) {
    return format(error.i18nKey, error.i18nVars);
  }
  return error?.message || STRINGS.unknownError;
}
