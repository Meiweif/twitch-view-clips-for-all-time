const CHANNEL_LOGIN_PATTERN = /^[a-z0-9_]{1,25}$/i;
const CHANNEL_INPUT_PATTERN = /[^a-zA-Z0-9_]/g;

function sanitizeLogin(value) {
  return String(value || '').replace(CHANNEL_INPUT_PATTERN, '').toLowerCase();
}

function extractLoginFromUrl(value) {
  try {
    const url = new URL(value.includes('://') ? value : `https://${value}`);
    const host = url.hostname.replace(/^www\./i, '').toLowerCase();
    const parts = url.pathname.split('/').filter(Boolean);

    if (host === 'kick.com' && parts[0]) {
      return sanitizeLogin(parts[0]);
    }

    if (host === 'twitch.tv') {
      if (parts[0] === 'channel' && parts[1]) {
        return sanitizeLogin(parts[1]);
      }

      if (parts[0] && parts[0] !== 'directory' && parts[0] !== 'videos') {
        return sanitizeLogin(parts[0]);
      }
    }
  } catch {
    return '';
  }

  return '';
}

export function parseChannelInput(raw) {
  const value = String(raw || '').trim();
  if (!value) {
    return '';
  }

  const looksLikeUrl = value.includes('://')
    || /^www\./i.test(value)
    || /^(kick\.com|twitch\.tv)/i.test(value);

  if (looksLikeUrl) {
    const login = extractLoginFromUrl(value);
    if (login) {
      return login;
    }
  }

  return sanitizeLogin(value.replace(/^@/, ''));
}

export function filterChannelInputValue(value) {
  return String(value || '').replace(CHANNEL_INPUT_PATTERN, '');
}

export function isValidChannelLogin(login) {
  return CHANNEL_LOGIN_PATTERN.test(login);
}

export async function verifyChannelLogin(login) {
  const response = await chrome.runtime.sendMessage({
    type: 'GET_BROADCASTER',
    login
  });

  if (!response?.ok) {
    throw new Error(response?.error || `Channel «${login}» not found`);
  }

  return response.broadcaster;
}

export function applyChannelInputPaste(event, input) {
  const pasted = event.clipboardData?.getData('text') || '';
  if (!pasted) {
    return;
  }

  const parsed = parseChannelInput(pasted);
  if (!parsed) {
    return;
  }

  event.preventDefault();
  input.value = parsed;
}
