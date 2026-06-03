import { I18nError, tr } from './i18n.js';

export function sanitizeCredential(value) {
  return (value || '')
    .trim()
    .replace(/[\u200B-\u200D\uFEFF]/g, '');
}

async function storageGet(area, keys) {
  return new Promise((resolve, reject) => {
    chrome.storage[area].get(keys, (data) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(data);
    });
  });
}

async function storageSet(area, data) {
  return new Promise((resolve, reject) => {
    chrome.storage[area].set(data, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve();
    });
  });
}

export async function migrateFromSyncStorage() {
  const local = await storageGet('local', ['clientId', 'clientSecret', 'lastChannel']);

  if (local.clientId || local.clientSecret) {
    return;
  }

  const sync = await storageGet('sync', ['clientId', 'clientSecret', 'lastChannel']);

  if (!sync.clientId && !sync.clientSecret && !sync.lastChannel) {
    return;
  }

  await storageSet('local', {
    clientId: sync.clientId || '',
    clientSecret: sync.clientSecret || '',
    lastChannel: sync.lastChannel || ''
  });
}

export async function getStoredCredentials() {
  await migrateFromSyncStorage();

  const data = await storageGet('local', ['clientId', 'clientSecret']);
  return {
    clientId: sanitizeCredential(data.clientId),
    clientSecret: sanitizeCredential(data.clientSecret)
  };
}

export async function saveCredentials(clientId, clientSecret) {
  const credentials = {
    clientId: sanitizeCredential(clientId),
    clientSecret: sanitizeCredential(clientSecret)
  };

  if (!credentials.clientId || !credentials.clientSecret) {
    throw new I18nError('fillCredentials');
  }

  await storageSet('local', credentials);

  await new Promise((resolve, reject) => {
    chrome.storage.local.remove(['accessToken', 'tokenExpiresAt'], () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve();
    });
  });

  return credentials;
}

export async function getLastChannel() {
  await migrateFromSyncStorage();
  const data = await storageGet('local', ['lastChannel']);
  return sanitizeCredential(data.lastChannel);
}

export async function saveLastChannel(channel) {
  await storageSet('local', { lastChannel: sanitizeCredential(channel) });
}

export async function formatTokenError(error) {
  const message = error?.message || String(error);

  if (message.includes('invalid client secret')) {
    return tr('errInvalidClientSecret');
  }

  if (message.includes('invalid client id') || message.includes('invalid client')) {
    return tr('errInvalidClientId');
  }

  return message;
}
