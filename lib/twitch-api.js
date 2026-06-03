import { getStoredCredentials, formatTokenError } from './credentials.js';
import { I18nError } from './i18n.js';
import { helixFetch } from './rate-limiter.js';

const TWITCH_API_BASE = 'https://api.twitch.tv/helix';
const TWITCH_TOKEN_URL = 'https://id.twitch.tv/oauth2/token';

export { getStoredCredentials, formatTokenError };

async function readCachedToken() {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(['accessToken', 'tokenExpiresAt'], (data) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(data);
    });
  });
}

async function writeCachedToken(accessToken, expiresAt) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set({ accessToken, tokenExpiresAt: expiresAt }, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve();
    });
  });
}

export async function getAppAccessToken(clientId, clientSecret) {
  const cached = await readCachedToken();
  const now = Date.now();

  if (cached.accessToken && cached.tokenExpiresAt && now < cached.tokenExpiresAt - 60_000) {
    return cached.accessToken;
  }

  const response = await fetch(TWITCH_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'client_credentials'
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(formatTokenError(new Error(`${response.status} ${text}`)));
  }

  const body = await response.json();
  const expiresAt = now + body.expires_in * 1000;

  await writeCachedToken(body.access_token, expiresAt);
  return body.access_token;
}

async function twitchGet(path, token, clientId) {
  const response = await helixFetch(`${TWITCH_API_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Client-Id': clientId
    }
  });

  if (!response.ok) {
    const text = await response.text();
    if (response.status === 429) {
      throw new I18nError('errRateLimit');
    }
    throw new I18nError('errApi', { status: response.status, text });
  }

  return response.json();
}

export { twitchGet };

export async function getBroadcasterId(login, token, clientId) {
  const params = new URLSearchParams({ login: login.toLowerCase() });
  const data = await twitchGet(`/users?${params}`, token, clientId);

  if (!data.data?.length) {
    throw new I18nError('errChannelNotFound', { login });
  }

  return data.data[0];
}

export function sortClips(clips, sortMode) {
  const sorted = [...clips];

  switch (sortMode) {
    case 'oldest':
      sorted.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
      break;
    case 'newest':
      sorted.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      break;
    case 'popular':
      sorted.sort((a, b) => b.view_count - a.view_count);
      break;
    case 'unpopular':
      sorted.sort((a, b) => a.view_count - b.view_count);
      break;
    default:
      sorted.sort((a, b) => b.view_count - a.view_count);
      break;
  }

  return sorted;
}

export function filterClips(clips, query) {
  const q = query.trim().toLowerCase();
  if (!q) {
    return clips;
  }

  return clips.filter((clip) => {
    const title = (clip.title || '').toLowerCase();
    const creator = (clip.creator_name || '').toLowerCase();
    const game = (clip.game_id || '').toLowerCase();
    return title.includes(q) || creator.includes(q) || game.includes(q);
  });
}
