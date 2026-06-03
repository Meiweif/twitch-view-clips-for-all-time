import {
  getStoredCredentials,
  saveCredentials,
  formatTokenError,
  migrateFromSyncStorage
} from './lib/credentials.js';
import { translateError, tr, I18nError } from './lib/i18n.js';
import {
  getAppAccessToken,
  getBroadcasterId,
  twitchGet
} from './lib/twitch-api.js';
import {
  getClipPlaybackSources,
  fetchUsersByIds,
  fetchUserVerified
} from './lib/clip-player.js';

const clipCache = new Map();
const profileCache = new Map();
const pendingProfileIds = new Set();

const messageHandlers = {
  API_GET: handleApiGet,
  GET_BROADCASTER: handleGetBroadcaster,
  GET_CLIP_SOURCES: handleGetClipSources,
  GET_CLIP_PLAYBACK: handleGetClipSources,
  GET_USER_VERIFIED: handleGetUserVerified,
  GET_USER_PROFILES: handleGetUserProfiles,
  GET_CACHED_CLIPS: handleGetCachedClips,
  SAVE_CLIPS_CACHE: handleSaveClipsCache,
  CHECK_CREDENTIALS: handleCheckCredentials,
  SAVE_CREDENTIALS: handleSaveCredentials,
  GET_SETTINGS: handleGetSettings
};

chrome.runtime.onInstalled.addListener(() => {
  migrateFromSyncStorage().catch(() => {});
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const handler = messageHandlers[message.type];
  if (!handler) {
    return false;
  }

  let result;
  try {
    result = handler(message);
  } catch (error) {
    sendResponse({ ok: false, error: translateError(error) });
    return false;
  }

  if (result && typeof result.then === 'function') {
    result.then(sendResponse).catch((error) => {
      sendResponse({ ok: false, error: translateError(error) });
    });
    return true;
  }

  sendResponse(result);
  return false;
});

async function handleApiGet(message) {
  const data = await apiGet(message.path);
  return { ok: true, data };
}

async function handleGetBroadcaster(message) {
  const broadcaster = await getBroadcaster(message.login);
  return { ok: true, broadcaster };
}

async function handleGetClipSources(message) {
  const sources = await getClipPlaybackSources(message.clipId);
  return { ok: true, sources };
}

async function handleGetUserVerified(message) {
  try {
    const verified = await fetchUserVerified(message.login);
    return { ok: true, verified };
  } catch {
    return { ok: true, verified: false };
  }
}

async function handleGetUserProfiles(message) {
  const profiles = await loadUserProfiles(message.userIds || []);
  return { ok: true, profiles };
}

function handleGetCachedClips(message) {
  const login = message.channel?.trim().toLowerCase();
  if (message.forceRefresh && login) {
    clipCache.delete(login);
  }
  if (login && clipCache.has(login) && !message.forceRefresh) {
    return { ok: true, cached: true, ...clipCache.get(login) };
  }
  return { ok: true, cached: false };
}

function handleSaveClipsCache(message) {
  const login = message.channel?.trim().toLowerCase();
  if (login) {
    clipCache.set(login, message.payload);
  }
  return { ok: true };
}

async function handleCheckCredentials() {
  try {
    const { clientId, clientSecret } = await getStoredCredentials();
    return { ok: true, configured: Boolean(clientId && clientSecret) };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

async function handleSaveCredentials(message) {
  try {
    const result = await saveAndVerifyCredentials(message.clientId, message.clientSecret);
    return { ok: true, ...result };
  } catch (error) {
    return { ok: false, error: await formatTokenError(error) };
  }
}

async function handleGetSettings() {
  const { clientId, clientSecret } = await getStoredCredentials();
  const { lastChannel } = await chrome.storage.local.get(['lastChannel']);
  return {
    ok: true,
    clientId,
    clientSecret,
    lastChannel: lastChannel || ''
  };
}

async function apiGet(path) {
  const { clientId, clientSecret } = await getStoredCredentials();
  if (!clientId || !clientSecret) {
    throw new I18nError('errCredentialsRequired');
  }

  const token = await getAppAccessToken(clientId, clientSecret);
  return twitchGet(path, token, clientId);
}

async function getBroadcaster(login) {
  const { clientId, clientSecret } = await getStoredCredentials();
  if (!clientId || !clientSecret) {
    throw new I18nError('errCredentialsRequired');
  }

  const token = await getAppAccessToken(clientId, clientSecret);
  const user = await getBroadcasterId(login, token, clientId);

  return {
    id: user.id,
    login: user.login,
    displayName: user.display_name,
    profileImage: user.profile_image_url
  };
}

async function loadUserProfiles(userIds) {
  const uniqueIds = [...new Set(userIds.filter(Boolean))];
  const result = {};
  const missingIds = uniqueIds.filter((id) => !profileCache.has(id) && !pendingProfileIds.has(id));

  uniqueIds.forEach((id) => {
    if (profileCache.has(id)) {
      result[id] = profileCache.get(id);
    }
  });

  if (!missingIds.length) {
    return result;
  }

  missingIds.forEach((id) => pendingProfileIds.add(id));

  try {
    const profiles = await fetchUsersByIds(missingIds, apiGet);

    Object.values(profiles).forEach((profile) => {
      profile.verifiedChecked = false;
      profileCache.set(profile.id, profile);
      result[profile.id] = profile;
    });
  } finally {
    missingIds.forEach((id) => pendingProfileIds.delete(id));
  }

  return result;
}

async function saveAndVerifyCredentials(clientId, clientSecret) {
  const credentials = await saveCredentials(clientId, clientSecret);
  await getAppAccessToken(credentials.clientId, credentials.clientSecret);
  return { message: tr('credentialsSaved') };
}
