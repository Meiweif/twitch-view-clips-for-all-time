import { tr, translateError } from '../lib/i18n.js';
import {
  parseChannelInput,
  applyChannelInputPaste,
  verifyChannelLogin
} from '../lib/channel-input.js';

const channelInput = document.getElementById('channel-input');
const openClipsBtn = document.getElementById('open-clips-btn');
const channelError = document.getElementById('channel-error');
const toggleSettings = document.getElementById('toggle-settings');
const settingsPanel = document.getElementById('settings-panel');
const clientIdInput = document.getElementById('client-id');
const clientSecretInput = document.getElementById('client-secret');
const saveSettingsBtn = document.getElementById('save-settings-btn');
const settingsStatus = document.getElementById('settings-status');
const apiHint = document.getElementById('api-hint');

function showChannelError(message) {
  channelError.textContent = message;
  channelError.classList.remove('hidden');
}

function hideChannelError() {
  channelError.classList.add('hidden');
}

function showSettingsStatus(message, isError = false) {
  settingsStatus.textContent = message;
  settingsStatus.classList.remove('hidden');
  settingsStatus.classList.toggle('error', isError);
}

function applyPopupTranslations() {
  apiHint.innerHTML = tr('apiHint', {
    link: '<a href="https://dev.twitch.tv/console/apps" target="_blank" rel="noopener noreferrer">dev.twitch.tv</a>',
    confidential: `<strong>${tr('confidential')}</strong>`
  });
}

async function loadSettings() {
  const response = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
  if (!response?.ok) {
    return;
  }

  applyPopupTranslations();
  clientIdInput.value = response.clientId || '';
  clientSecretInput.value = response.clientSecret || '';
  channelInput.value = response.lastChannel || '';

  if (!response.clientId || !response.clientSecret) {
    settingsPanel.classList.remove('hidden');
  }
}

function openTrackingPage(channel) {
  const url = chrome.runtime.getURL(`pages/tracking.html?channel=${encodeURIComponent(channel)}`);
  chrome.tabs.create({ url });
}

async function saveCredentialsFromInputs() {
  const clientId = clientIdInput.value.trim();
  const clientSecret = clientSecretInput.value.trim();

  if (!clientId || !clientSecret) {
    return { ok: false, error: tr('fillCredentials') };
  }

  return chrome.runtime.sendMessage({
    type: 'SAVE_CREDENTIALS',
    clientId,
    clientSecret
  });
}

openClipsBtn.addEventListener('click', async () => {
  hideChannelError();

  const channel = parseChannelInput(channelInput.value);

  if (!channel) {
    showChannelError(tr('channelRequired'));
    channelInput.focus();
    return;
  }

  const clientId = clientIdInput.value.trim();
  const clientSecret = clientSecretInput.value.trim();

  openClipsBtn.disabled = true;

  try {
    if (clientId && clientSecret) {
      const saveResult = await saveCredentialsFromInputs();
      if (!saveResult?.ok) {
        showChannelError(saveResult?.error || tr('apiSaveFailed'));
        settingsPanel.classList.remove('hidden');
        return;
      }
    } else {
      const creds = await chrome.runtime.sendMessage({ type: 'CHECK_CREDENTIALS' });
      if (!creds?.configured) {
        showChannelError(tr('apiRequired'));
        settingsPanel.classList.remove('hidden');
        clientIdInput.focus();
        return;
      }
    }

    await verifyChannelLogin(channel);
    await chrome.storage.local.set({ lastChannel: channel });
    openTrackingPage(channel);
  } catch (error) {
    showChannelError(translateError(error));
    channelInput.focus();
  } finally {
    openClipsBtn.disabled = false;
  }
});

channelInput.addEventListener('paste', (event) => {
  applyChannelInputPaste(event, channelInput);
});

channelInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    openClipsBtn.click();
  }
});

toggleSettings.addEventListener('click', () => {
  settingsPanel.classList.toggle('hidden');
});

saveSettingsBtn.addEventListener('click', async () => {
  saveSettingsBtn.disabled = true;
  saveSettingsBtn.textContent = tr('saving');

  try {
    const response = await saveCredentialsFromInputs();

    if (!response?.ok) {
      showSettingsStatus(response?.error || tr('saveFailed'), true);
      return;
    }

    showSettingsStatus(response.message || tr('saved'));
    setTimeout(() => settingsStatus.classList.add('hidden'), 3000);
  } finally {
    saveSettingsBtn.disabled = false;
    saveSettingsBtn.textContent = tr('save');
  }
});

loadSettings();
