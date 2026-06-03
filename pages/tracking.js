import { sortClips, filterClips } from '../lib/twitch-api.js';
import { loadAllClips } from '../lib/clip-loader.js';
import { VERIFIED_BADGE_URL } from '../lib/clip-player.js';
import { getCreatorStats, formatLongDate, getClipThumbUrl } from '../lib/creator-stats.js';
import { tr, translateError, DATE_LOCALE } from '../lib/i18n.js';

const PAGE_SIZE = 100;
const CHANNEL_INPUT_PATTERN = /[^a-zA-Z0-9_]/g;
const LOAD_CANCELLED = 'LOAD_CANCELLED';

const dateLocale = DATE_LOCALE;

const SORT_KEYS = {
  oldest: 'sortOldest',
  newest: 'sortNewest',
  popular: 'sortPopular',
  unpopular: 'sortUnpopular'
};

const params = new URLSearchParams(window.location.search);
let channel = (params.get('channel') || '').trim();

const pageTitle = document.getElementById('page-title');
const channelSubtitle = document.getElementById('channel-subtitle');
const channelAvatar = document.getElementById('channel-avatar');
const statusPanel = document.getElementById('status-panel');
const statusText = document.getElementById('status-text');
const statusSubtext = document.getElementById('status-subtext');
const contentPanel = document.getElementById('content-panel');
const loadingBanner = document.getElementById('loading-banner');
const loadingBannerText = document.getElementById('loading-banner-text');
const cancelLoadBtn = document.getElementById('cancel-load-btn');
const errorPanel = document.getElementById('error-panel');
const errorText = document.getElementById('error-text');
const clipsBody = document.getElementById('clips-body');
const emptyState = document.getElementById('empty-state');
const pageInfoElements = document.querySelectorAll('.page-info');
const prevButtons = document.querySelectorAll('.prev-btn');
const nextButtons = document.querySelectorAll('.next-btn');
const searchInput = document.getElementById('search-input');
const sortSelect = document.getElementById('sort-select');
const sortTrigger = sortSelect.querySelector('.custom-select-trigger');
const sortValue = sortSelect.querySelector('.custom-select-value');
const sortMenu = sortSelect.querySelector('.custom-select-menu');
const sortOptions = sortSelect.querySelectorAll('.custom-select-option');
const refreshBtn = document.getElementById('refresh-btn');
const changeChannelBtn = document.getElementById('change-channel-btn');
const openSettingsBtn = document.getElementById('open-settings-btn');
const channelModal = document.getElementById('channel-modal');
const channelModalInput = document.getElementById('channel-modal-input');
const channelModalCancel = document.getElementById('channel-modal-cancel');
const channelModalSubmit = document.getElementById('channel-modal-submit');
const clipModal = document.getElementById('clip-modal');
const clipModalTitle = document.getElementById('clip-modal-title');
const clipModalClose = document.getElementById('clip-modal-close');
const clipPlayer = document.getElementById('clip-player');
const clipPlayerLoading = document.getElementById('clip-player-loading');
const clipPlayerError = document.getElementById('clip-player-error');
const clipOpenLink = document.getElementById('clip-open-link');
const clipQualitySelect = document.getElementById('clip-quality-select');
const clipDownloadBtn = document.getElementById('clip-download-btn');
const confirmModal = document.getElementById('confirm-modal');
const confirmModalText = document.getElementById('confirm-modal-text');
const confirmModalCancel = document.getElementById('confirm-modal-cancel');
const confirmModalOk = document.getElementById('confirm-modal-ok');
const userPopover = document.getElementById('user-popover');
const userPopoverHeader = userPopover.querySelector('.user-popover-header');
const userPopoverClose = document.getElementById('user-popover-close');
const userPopoverAvatar = document.getElementById('user-popover-avatar');
const userPopoverTitle = document.getElementById('user-popover-title');
const userPopoverSubtitle = document.getElementById('user-popover-subtitle');
const userPopoverBody = document.getElementById('user-popover-body');
const state = {
  allClips: [],
  filteredClips: [],
  currentPage: 1,
  sort: 'oldest',
  search: '',
  broadcaster: null,
  loading: false,
  userProfiles: {},
  profileRefreshTimer: null,
  profileRefreshInFlight: false,
  pendingProfileIds: new Set(),
  verifiedPending: new Set(),
  verifiedQueueTimer: null,
  currentBlobUrl: null,
  clipLoadGeneration: 0,
  clipFetchController: null,
  clipSources: [],
  loadAbortController: null,
  popoverDrag: null,
  openPopoverCreatorId: null,
  confirmCallback: null,
  currentClipId: '',
  currentClipTitle: '',
  clipDownloadInFlight: false
};

async function apiGet(path) {
  const response = await chrome.runtime.sendMessage({ type: 'API_GET', path });
  if (!response?.ok) {
    throw new Error(response?.error || tr('apiError'));
  }
  return response.data;
}

function normalizeChannel(value) {
  return value.trim().replace(/^@/, '').toLowerCase();
}

function showStatus(message, subtext = '') {
  statusPanel.classList.remove('hidden');
  contentPanel.classList.add('hidden');
  errorPanel.classList.add('hidden');
  statusText.textContent = message;

  if (subtext) {
    statusSubtext.textContent = subtext;
    statusSubtext.classList.remove('hidden');
  } else {
    statusSubtext.classList.add('hidden');
  }
}

function showError(message) {
  statusPanel.classList.add('hidden');
  contentPanel.classList.add('hidden');
  errorPanel.classList.remove('hidden');
  errorText.textContent = message;
  hideLoadingBanner();
}

function showContent() {
  statusPanel.classList.add('hidden');
  errorPanel.classList.add('hidden');
  contentPanel.classList.remove('hidden');
}

function showLoadingBanner(message) {
  loadingBannerText.textContent = message;
  loadingBanner.classList.remove('hidden');
}

function hideLoadingBanner() {
  loadingBanner.classList.add('hidden');
}

function formatDate(iso) {
  const date = new Date(iso);
  return date.toLocaleDateString(dateLocale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
}

function formatDuration(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins > 0) {
    return tr('minSec', { mins, secs });
  }
  return tr('secOnly', { secs });
}

function formatViews(count) {
  return new Intl.NumberFormat(dateLocale).format(count);
}

function applyFilters() {
  const sorted = sortClips(state.allClips, state.sort);
  state.filteredClips = filterClips(sorted, state.search);

  const totalPages = Math.max(1, Math.ceil(state.filteredClips.length / PAGE_SIZE));
  if (state.currentPage > totalPages) {
    state.currentPage = totalPages;
  }
}

function updatePaginationControls(total, totalPages) {
  const clipWord = pluralizeClips(total);
  const pageText = tr('pageInfo', {
    page: state.currentPage,
    total: totalPages,
    count: total,
    clips: clipWord
  });

  pageInfoElements.forEach((element) => {
    element.textContent = pageText;
  });

  prevButtons.forEach((button) => {
    button.disabled = state.currentPage <= 1;
  });

  nextButtons.forEach((button) => {
    button.disabled = state.currentPage >= totalPages;
  });
}

function getCreatorProfile(clip) {
  if (clip.creator_id && state.userProfiles[clip.creator_id]) {
    return state.userProfiles[clip.creator_id];
  }
  return null;
}

function renderCreatorCell(clip) {
  const profile = getCreatorProfile(clip);
  const displayName = profile?.displayName || clip.creator_name || '—';
  const isVerified = profile?.isVerified === true;
  const avatar = profile?.avatar || '';

  const avatarMarkup = avatar
    ? `<img class="creator-avatar" src="${escapeAttr(avatar)}" alt="" width="28" height="28">`
    : '<span class="creator-avatar creator-avatar-placeholder" aria-hidden="true"></span>';

  const verifyMarkup = isVerified
    ? `<img class="verify-icon" src="${VERIFIED_BADGE_URL}" alt="Verified" width="16" height="16">`
    : '';

  return `
    <button
      type="button"
      class="creator-link"
      data-creator-id="${escapeAttr(clip.creator_id || '')}"
      data-creator-name="${escapeAttr(clip.creator_name || '')}"
    >
      ${avatarMarkup}
      ${verifyMarkup}<span>${escapeHtml(displayName)}</span>
    </button>
  `;
}

async function refreshUserProfiles(clips) {
  const userIds = [...new Set(clips.map((clip) => clip.creator_id).filter(Boolean))];
  const missingIds = userIds.filter((id) => !state.userProfiles[id] && !state.pendingProfileIds.has(id));

  if (!missingIds.length) {
    return;
  }

  if (state.profileRefreshTimer) {
    clearTimeout(state.profileRefreshTimer);
  }

  state.profileRefreshTimer = setTimeout(() => {
    loadUserProfilesBatch(missingIds);
  }, 400);
}

async function loadUserProfilesBatch(userIds) {
  if (state.profileRefreshInFlight) {
    return;
  }

  state.profileRefreshInFlight = true;
  userIds.forEach((id) => state.pendingProfileIds.add(id));

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'GET_USER_PROFILES',
      userIds
    });

    if (response?.ok && response.profiles) {
      state.userProfiles = { ...state.userProfiles, ...response.profiles };
      renderTable();
      queueVerifiedChecks(userIds.slice(0, 12));
    }
  } catch {
    // ignore profile lookup errors
  } finally {
    userIds.forEach((id) => state.pendingProfileIds.delete(id));
    state.profileRefreshInFlight = false;
  }
}

function queueVerifiedChecks(userIds) {
  if (state.verifiedQueueTimer) {
    clearTimeout(state.verifiedQueueTimer);
  }

  state.verifiedQueueTimer = setTimeout(async () => {
    for (const userId of userIds) {
      const profile = state.userProfiles[userId];
      if (!profile || profile.verifiedChecked || state.verifiedPending.has(userId)) {
        continue;
      }

      state.verifiedPending.add(userId);

      try {
        const response = await chrome.runtime.sendMessage({
          type: 'GET_USER_VERIFIED',
          login: profile.login
        });

        if (response?.ok) {
          state.userProfiles[userId] = {
            ...profile,
            isVerified: response.verified === true,
            verifiedChecked: true
          };
          renderTable();
          refreshOpenPopoverVerified(userId);
        }
      } catch {
        // ignore
      } finally {
        state.verifiedPending.delete(userId);
      }

      await new Promise((resolve) => setTimeout(resolve, 400));
    }
  }, 500);
}

function renderPopoverClipBlock(label, clip) {
  const thumbUrl = getClipThumbUrl(clip, 120, 68);

  return `
    <div class="user-popover-section">
      <div class="user-popover-section-title">${label}</div>
      <button
        type="button"
        class="user-popover-clip-btn"
        data-clip-id="${escapeAttr(clip.id)}"
        data-clip-title="${escapeAttr(clip.title || tr('clipUntitled'))}"
        data-clip-url="${escapeAttr(clip.url)}"
      >
        <img class="user-popover-clip-thumb" src="${thumbUrl}" alt="" width="120" height="68">
        <div class="user-popover-clip-meta">
          <span class="user-popover-clip-title">${escapeHtml(clip.title || tr('clipUntitled'))}</span>
          <span class="user-popover-clip-info">${tr('viewsOnClip', {
            count: formatViews(clip.view_count),
            date: formatLongDate(clip.created_at, dateLocale)
          })}</span>
        </div>
      </button>
    </div>
  `;
}

function positionUserPopover(anchorEl) {
  const rect = anchorEl.getBoundingClientRect();
  const popoverWidth = 360;
  let left = rect.left;
  let top = rect.bottom + 8;

  if (left + popoverWidth > window.innerWidth - 12) {
    left = window.innerWidth - popoverWidth - 12;
  }

  const popoverHeight = userPopover.offsetHeight;
  if (top + popoverHeight > window.innerHeight - 12) {
    top = Math.max(12, rect.top - popoverHeight - 8);
  }

  userPopover.style.top = `${Math.max(12, top)}px`;
  userPopover.style.left = `${Math.max(12, left)}px`;
}

function openUserPopover(creatorId, creatorName, anchorEl) {
  const stats = getCreatorStats(state.allClips, creatorId, creatorName);

  if (!stats) {
    return;
  }

  const profile = creatorId ? state.userProfiles[creatorId] : null;
  const displayName = profile?.displayName || stats.creatorName;
  const isVerified = profile?.isVerified === true;

  if (profile?.avatar) {
    userPopoverAvatar.src = profile.avatar;
    userPopoverAvatar.classList.remove('hidden');
  } else {
    userPopoverAvatar.removeAttribute('src');
    userPopoverAvatar.classList.add('hidden');
  }

  const verifyMarkup = isVerified
    ? `<img class="verify-icon" src="${VERIFIED_BADGE_URL}" alt="Verified" width="16" height="16">`
    : '';

  userPopoverTitle.innerHTML = `${verifyMarkup}<span>${escapeHtml(displayName)}</span>`;
  userPopoverSubtitle.textContent = tr('trackingSince', {
    date: formatLongDate(stats.trackingSince, dateLocale)
  });
  userPopoverBody.innerHTML = `
    <p class="user-popover-count"><strong>${tr('clipCount')}</strong> ${stats.clipCount}</p>
    ${renderPopoverClipBlock(tr('topClip'), stats.topClip)}
    ${renderPopoverClipBlock(tr('lastClip'), stats.lastClip)}
  `;

  userPopoverBody.querySelectorAll('.user-popover-clip-btn').forEach((button) => {
    button.addEventListener('click', () => {
      openClipModal(button.dataset.clipId, button.dataset.clipTitle, button.dataset.clipUrl);
    });
  });

  if (creatorId && profile && !profile.verifiedChecked) {
    queueVerifiedChecks([creatorId]);
  }

  state.openPopoverCreatorId = creatorId || null;
  userPopover.classList.remove('hidden');
  requestAnimationFrame(() => positionUserPopover(anchorEl));
}

function closeUserPopover() {
  userPopover.classList.add('hidden');
  userPopoverBody.innerHTML = '';
  state.openPopoverCreatorId = null;
}

function refreshOpenPopoverVerified(userId) {
  if (userPopover.classList.contains('hidden') || userId !== state.openPopoverCreatorId) {
    return;
  }

  const profile = state.userProfiles[userId];
  if (!profile) {
    return;
  }

  const verifyMarkup = profile.isVerified === true
    ? `<img class="verify-icon" src="${VERIFIED_BADGE_URL}" alt="Verified" width="16" height="16">`
    : '';

  const nameSpan = userPopoverTitle.querySelector('span');
  const displayName = nameSpan?.textContent || profile.displayName || profile.login || '—';
  userPopoverTitle.innerHTML = `${verifyMarkup}<span>${escapeHtml(displayName)}</span>`;
}

function renderTable() {
  applyFilters();

  const total = state.filteredClips.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const start = (state.currentPage - 1) * PAGE_SIZE;
  const pageClips = state.filteredClips.slice(start, start + PAGE_SIZE);

  clipsBody.innerHTML = '';

  if (pageClips.length === 0) {
    emptyState.classList.remove('hidden');
  } else {
    emptyState.classList.add('hidden');
  }

  pageClips.forEach((clip, index) => {
    const row = document.createElement('tr');
    const globalIndex = start + index + 1;
    const thumbUrl = clip.thumbnail_url
      .replace('%{width}', '160')
      .replace('%{height}', '90');

    row.innerHTML = `
      <td class="col-num">${globalIndex}</td>
      <td class="col-creator">${renderCreatorCell(clip)}</td>
      <td class="col-clip">
        <div class="clip-cell">
          <button
            type="button"
            class="clip-thumb-btn"
            data-clip-id="${escapeAttr(clip.id)}"
            data-clip-title="${escapeAttr(clip.title || tr('clipUntitled'))}"
            data-clip-url="${escapeAttr(clip.url)}"
            aria-label="${escapeAttr(tr('watchClip'))}"
          >
            <img class="clip-thumb" src="${thumbUrl}" alt="" loading="lazy" width="80" height="45">
          </button>
          <a class="clip-title-link" href="${clip.url}" target="_blank" rel="noopener noreferrer">
            ${escapeHtml(clip.title || tr('clipUntitled'))}
          </a>
        </div>
      </td>
      <td class="col-date">${formatDate(clip.created_at)}</td>
      <td class="col-views">${formatViews(clip.view_count)}</td>
      <td class="col-duration">${formatDuration(clip.duration)}</td>
    `;

    clipsBody.appendChild(row);
  });

  clipsBody.querySelectorAll('.clip-thumb-btn').forEach((button) => {
    button.addEventListener('click', () => {
      openClipModal(button.dataset.clipId, button.dataset.clipTitle, button.dataset.clipUrl);
    });
  });

  clipsBody.querySelectorAll('.creator-link').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      openUserPopover(button.dataset.creatorId, button.dataset.creatorName, button);
    });
  });

  updatePaginationControls(total, totalPages);
  refreshUserProfiles(pageClips);
}

function pluralizeClips(count) {
  return count === 1 ? tr('clipWord1') : tr('clipWord5');
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function escapeAttr(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;');
}

function updateBroadcasterInfo(total) {
  if (!state.broadcaster) {
    return;
  }

  channelSubtitle.textContent = tr('channelTotal', {
    login: state.broadcaster.login,
    count: total,
    clips: pluralizeClips(total)
  });

  if (state.broadcaster.profileImage) {
    channelAvatar.src = state.broadcaster.profileImage;
    channelAvatar.alt = state.broadcaster.displayName;
    channelAvatar.classList.remove('hidden');
  }
}

function goToPage(delta) {
  const totalPages = Math.ceil(state.filteredClips.length / PAGE_SIZE) || 1;
  const nextPage = state.currentPage + delta;

  if (nextPage < 1 || nextPage > totalPages) {
    return;
  }

  state.currentPage = nextPage;
  renderTable();
}

function setSort(value) {
  state.sort = value;
  state.currentPage = 1;
  sortValue.textContent = tr(SORT_KEYS[value]);

  sortOptions.forEach((option) => {
    option.classList.toggle('selected', option.dataset.value === value);
  });

  closeSortMenu();
  renderTable();
}

function openSortMenu() {
  sortMenu.classList.remove('hidden');
  sortSelect.classList.add('open');
  sortTrigger.setAttribute('aria-expanded', 'true');
}

function closeSortMenu() {
  sortMenu.classList.add('hidden');
  sortSelect.classList.remove('open');
  sortTrigger.setAttribute('aria-expanded', 'false');
}

function openChannelModal() {
  channelModalInput.value = channel;
  channelModal.classList.remove('hidden');
  channelModalInput.focus();
  channelModalInput.select();
}

function closeChannelModal() {
  channelModal.classList.add('hidden');
}

function showConfirmDialog(message, onConfirm, okLabel = tr('confirmStop')) {
  confirmModalText.textContent = message;
  confirmModalOk.textContent = okLabel;
  state.confirmCallback = onConfirm;
  confirmModal.classList.remove('hidden');
}

function closeConfirmDialog() {
  confirmModal.classList.add('hidden');
  state.confirmCallback = null;
}

function sanitizeFilename(title, clipId) {
  const base = String(title || clipId || 'clip')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '')
    .replace(/\s+/g, '_')
    .slice(0, 120);

  return base || String(clipId || 'clip');
}

function setClipDownloadEnabled(enabled) {
  clipDownloadBtn.disabled = !enabled || state.clipDownloadInFlight;
}

async function downloadCurrentClip() {
  const source = state.clipSources[0];
  if (!source || state.clipDownloadInFlight) {
    return;
  }

  state.clipDownloadInFlight = true;
  setClipDownloadEnabled(false);
  clipDownloadBtn.textContent = tr('downloading');

  try {
    const response = await fetch(source.url, {
      headers: {
        Referer: 'https://clips.twitch.tv/',
        Origin: 'https://clips.twitch.tv'
      }
    });

    if (!response.ok) {
      throw new Error(tr('downloadError'));
    }

    const blob = await response.blob();
    if (!blob.size) {
      throw new Error(tr('emptyFile'));
    }

    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = `${sanitizeFilename(state.currentClipTitle, state.currentClipId)}.mp4`;
    link.click();

    setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
  } catch (error) {
    clipDownloadBtn.textContent = error.message || tr('genericError');
    setTimeout(() => {
      clipDownloadBtn.textContent = tr('download');
    }, 2000);
  } finally {
    state.clipDownloadInFlight = false;
    setClipDownloadEnabled(state.clipSources.length > 0);
    if (clipDownloadBtn.textContent === tr('downloading')) {
      clipDownloadBtn.textContent = tr('download');
    }
  }
}

function filterChannelInputValue(value) {
  return value.replace(CHANNEL_INPUT_PATTERN, '');
}

function sanitizeChannelInput(input) {
  const filtered = filterChannelInputValue(input.value);
  if (filtered !== input.value) {
    input.value = filtered;
  }
}

function navigateToChannel(nextChannel) {
  const normalized = normalizeChannel(nextChannel);
  if (!normalized) {
    return;
  }

  window.location.href = chrome.runtime.getURL(
    `pages/tracking.html?channel=${encodeURIComponent(normalized)}`
  );
}

async function loadClipVideo(sourceUrl, loadGeneration) {
  if (loadGeneration !== state.clipLoadGeneration) {
    throw new Error(LOAD_CANCELLED);
  }

  state.clipFetchController?.abort();
  state.clipFetchController = new AbortController();

  try {
    const response = await fetch(sourceUrl, {
      signal: state.clipFetchController.signal,
      headers: {
        Referer: 'https://clips.twitch.tv/',
        Origin: 'https://clips.twitch.tv'
      }
    });

    if (loadGeneration !== state.clipLoadGeneration) {
      throw new Error(LOAD_CANCELLED);
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const blob = await response.blob();

    if (loadGeneration !== state.clipLoadGeneration) {
      throw new Error(LOAD_CANCELLED);
    }

    if (!blob.size) {
      throw new Error(tr('emptyResponse'));
    }

    if (state.currentBlobUrl) {
      URL.revokeObjectURL(state.currentBlobUrl);
    }

    state.currentBlobUrl = URL.createObjectURL(blob);
    clipPlayer.src = state.currentBlobUrl;

    if (loadGeneration !== state.clipLoadGeneration) {
      URL.revokeObjectURL(state.currentBlobUrl);
      state.currentBlobUrl = null;
      throw new Error(LOAD_CANCELLED);
    }

    await clipPlayer.play();

    if (loadGeneration !== state.clipLoadGeneration) {
      clipPlayer.pause();
      clipPlayer.currentTime = 0;
      throw new Error(LOAD_CANCELLED);
    }
  } catch (error) {
    if (error.name === 'AbortError' || loadGeneration !== state.clipLoadGeneration) {
      throw new Error(LOAD_CANCELLED);
    }
    throw error;
  } finally {
    state.clipFetchController = null;
  }
}

function populateQualitySelect(sources) {
  clipQualitySelect.innerHTML = '';

  sources.forEach((source, index) => {
    const option = document.createElement('option');
    option.value = String(index);
    option.textContent = source.label || `${source.quality}p`;
    clipQualitySelect.appendChild(option);
  });

  clipQualitySelect.classList.toggle('hidden', sources.length <= 1);
  if (sources.length) {
    clipQualitySelect.value = '0';
  }
}

async function playClipSource(sourceIndex) {
  const source = state.clipSources[sourceIndex];
  if (!source) {
    return;
  }

  const loadGeneration = state.clipLoadGeneration;

  clipPlayer.classList.add('hidden');
  clipPlayerError.classList.add('hidden');
  clipPlayerLoading.classList.remove('hidden');
  clipPlayerLoading.textContent = tr('loadingClip');
  clipPlayer.pause();
  clipPlayer.currentTime = 0;
  clipPlayer.removeAttribute('src');
  clipPlayer.load();

  if (state.clipSources.length > 1) {
    clipQualitySelect.value = String(sourceIndex);
  }

  try {
    await loadClipVideo(source.url, loadGeneration);

    if (loadGeneration !== state.clipLoadGeneration) {
      return;
    }

    clipPlayer.classList.remove('hidden');
    clipPlayerLoading.classList.add('hidden');
  } catch (error) {
    if (loadGeneration !== state.clipLoadGeneration || error.message === LOAD_CANCELLED) {
      return;
    }

    clipPlayerLoading.classList.add('hidden');
    clipPlayerError.textContent = error.message || tr('playError');
    clipPlayerError.classList.remove('hidden');
  }
}

async function openClipModal(clipId, title, clipUrl) {
  state.clipLoadGeneration += 1;
  const loadGeneration = state.clipLoadGeneration;

  clipModalTitle.textContent = title || tr('clipDefault');
  clipModal.classList.remove('hidden');
  clipPlayer.classList.add('hidden');
  clipPlayerError.classList.add('hidden');
  clipOpenLink.classList.add('hidden');
  clipPlayerLoading.classList.remove('hidden');
  clipPlayerLoading.textContent = tr('loadingClip');
  clipPlayer.pause();
  clipPlayer.currentTime = 0;
  clipPlayer.removeAttribute('src');
  clipPlayer.load();
  clipQualitySelect.innerHTML = '';
  clipQualitySelect.classList.add('hidden');
  state.clipSources = [];
  state.currentClipId = clipId || '';
  state.currentClipTitle = title || tr('clipDefault');
  setClipDownloadEnabled(false);

  if (clipUrl) {
    clipOpenLink.href = clipUrl;
    clipOpenLink.classList.remove('hidden');
  }

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'GET_CLIP_SOURCES',
      clipId
    });

    if (loadGeneration !== state.clipLoadGeneration) {
      return;
    }

    if (!response?.ok || !response.sources?.length) {
      throw new Error(response?.error || tr('loadClipError'));
    }

    state.clipSources = response.sources;
    populateQualitySelect(state.clipSources);
    setClipDownloadEnabled(true);
    await playClipSource(0);
  } catch (error) {
    if (loadGeneration !== state.clipLoadGeneration || error.message === LOAD_CANCELLED) {
      return;
    }

    clipPlayerLoading.classList.add('hidden');
    clipPlayerError.textContent = error.message || tr('playError');
    clipPlayerError.classList.remove('hidden');
  }
}

function closeClipModal() {
  state.clipLoadGeneration += 1;
  state.clipFetchController?.abort();
  state.clipFetchController = null;

  clipModal.classList.add('hidden');
  clipPlayer.pause();
  clipPlayer.currentTime = 0;
  clipPlayer.removeAttribute('src');
  clipPlayer.load();
  clipPlayer.classList.add('hidden');
  clipPlayerLoading.classList.add('hidden');
  clipPlayerError.classList.add('hidden');
  clipOpenLink.classList.add('hidden');
  clipQualitySelect.innerHTML = '';
  clipQualitySelect.classList.add('hidden');
  state.clipSources = [];
  state.currentClipId = '';
  state.currentClipTitle = '';
  setClipDownloadEnabled(false);
  clipDownloadBtn.textContent = tr('download');

  if (state.currentBlobUrl) {
    URL.revokeObjectURL(state.currentBlobUrl);
    state.currentBlobUrl = null;
  }
}

async function loadClips(forceRefresh = false) {
  if (!channel) {
    showError(tr('noChannelInUrl'));
    return;
  }

  if (state.loading) {
    return;
  }

  state.loadAbortController?.abort();
  state.loadAbortController = new AbortController();
  const loadSignal = state.loadAbortController.signal;

  state.loading = true;
  showStatus(
    tr('loadingClipsChannel', { channel }),
    tr('loadingClipsHint')
  );
  pageTitle.textContent = tr('pageClipsNamed', { channel });
  document.title = tr('pageTitleNamed', { channel });
  hideLoadingBanner();

  try {
    const cacheResponse = await chrome.runtime.sendMessage({
      type: 'GET_CACHED_CLIPS',
      channel,
      forceRefresh
    });

    if (cacheResponse?.cached) {
      state.allClips = cacheResponse.clips;
      state.broadcaster = cacheResponse.broadcaster;
      state.currentPage = 1;
      updateBroadcasterInfo(cacheResponse.total);
      showContent();
      renderTable();
      return;
    }

    const broadcasterResponse = await chrome.runtime.sendMessage({
      type: 'GET_BROADCASTER',
      login: channel
    });

    if (!broadcasterResponse?.ok) {
      throw new Error(broadcasterResponse?.error || tr('errChannelNotFound', { login: channel }));
    }

    state.broadcaster = broadcasterResponse.broadcaster;
    state.allClips = [];
    state.currentPage = 1;

    let shownPartial = false;

    const clips = await loadAllClips(state.broadcaster.id, apiGet, (progress) => {
      if (progress.clips) {
        state.allClips = progress.clips;
        updateBroadcasterInfo(state.allClips.length);
      }

      if (progress.phase === 'partial' && !shownPartial) {
        shownPartial = true;
        showContent();
        showLoadingBanner(progress.message);
        renderTable();
        return;
      }

      if (progress.phase === 'full') {
        showLoadingBanner(progress.message);
        renderTable();
        return;
      }

      if (progress.phase === 'cancelled') {
        hideLoadingBanner();
        showContent();
        renderTable();
        return;
      }

      if (progress.phase === 'quick') {
        showStatus(tr('loadingClipsChannel', { channel }), progress.message);
      }
    }, loadSignal);

    state.allClips = clips;
    updateBroadcasterInfo(clips.length);

    if (!loadSignal.aborted) {
      await chrome.runtime.sendMessage({
        type: 'SAVE_CLIPS_CACHE',
        channel,
        payload: {
          channel: normalizeChannel(channel),
          broadcaster: state.broadcaster,
          clips,
          total: clips.length
        }
      });
    }

    hideLoadingBanner();
    showContent();
    renderTable();
  } catch (error) {
    if (loadSignal.aborted) {
      hideLoadingBanner();
      showContent();
      renderTable();
      return;
    }
    showError(translateError(error) || tr('loadError'));
  } finally {
    state.loading = false;
    state.loadAbortController = null;
  }
}

function cancelClipLoading() {
  if (!state.loadAbortController || loadSignalAborted()) {
    return;
  }

  showConfirmDialog(
    tr('cancelLoadConfirm'),
    () => state.loadAbortController?.abort()
  );
}

function loadSignalAborted() {
  return state.loadAbortController?.signal.aborted === true;
}

function initPopoverDrag() {
  userPopoverHeader.addEventListener('mousedown', (event) => {
    if (event.button !== 0 || event.target.closest('#user-popover-close')) {
      return;
    }

    event.preventDefault();

    const rect = userPopover.getBoundingClientRect();
    state.popoverDrag = {
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top
    };
    userPopover.classList.add('dragging');
  });
}

function handlePopoverDragMove(event) {
  if (!state.popoverDrag) {
    return;
  }

  const maxLeft = window.innerWidth - userPopover.offsetWidth - 12;
  const maxTop = window.innerHeight - userPopover.offsetHeight - 12;
  const left = Math.max(12, Math.min(event.clientX - state.popoverDrag.offsetX, maxLeft));
  const top = Math.max(12, Math.min(event.clientY - state.popoverDrag.offsetY, maxTop));

  userPopover.style.left = `${left}px`;
  userPopover.style.top = `${top}px`;
}

function handlePopoverDragEnd() {
  if (!state.popoverDrag) {
    return;
  }

  state.popoverDrag = null;
  userPopover.classList.remove('dragging');
}

prevButtons.forEach((button) => {
  button.addEventListener('click', () => goToPage(-1));
});

nextButtons.forEach((button) => {
  button.addEventListener('click', () => goToPage(1));
});

searchInput.addEventListener('input', () => {
  state.search = searchInput.value;
  state.currentPage = 1;
  renderTable();
});

sortTrigger.addEventListener('click', (event) => {
  event.stopPropagation();
  if (sortSelect.classList.contains('open')) {
    closeSortMenu();
  } else {
    openSortMenu();
  }
});

sortOptions.forEach((option) => {
  option.addEventListener('click', (event) => {
    event.stopPropagation();
    setSort(option.dataset.value);
  });
});

document.addEventListener('click', (event) => {
  if (!sortSelect.contains(event.target)) {
    closeSortMenu();
  }

  if (!userPopover.contains(event.target) && !event.target.closest('.creator-link')) {
    closeUserPopover();
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    closeConfirmDialog();
    closeSortMenu();
    closeChannelModal();
    closeClipModal();
    closeUserPopover();
  }
});

refreshBtn.addEventListener('click', () => {
  loadClips(true);
});

changeChannelBtn.addEventListener('click', openChannelModal);
channelModalCancel.addEventListener('click', closeChannelModal);
channelModal.querySelector('[data-close-modal]').addEventListener('click', closeChannelModal);

channelModalSubmit.addEventListener('click', () => {
  navigateToChannel(channelModalInput.value);
});

channelModalInput.addEventListener('input', () => {
  sanitizeChannelInput(channelModalInput);
});

channelModalInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    navigateToChannel(channelModalInput.value);
  }
});

clipQualitySelect.addEventListener('change', () => {
  const sourceIndex = Number(clipQualitySelect.value);
  if (Number.isNaN(sourceIndex)) {
    return;
  }

  state.clipLoadGeneration += 1;
  playClipSource(sourceIndex);
});

cancelLoadBtn.addEventListener('click', cancelClipLoading);

confirmModalCancel.addEventListener('click', closeConfirmDialog);
confirmModal.querySelector('[data-close-confirm]').addEventListener('click', closeConfirmDialog);
confirmModalOk.addEventListener('click', () => {
  const callback = state.confirmCallback;
  closeConfirmDialog();
  callback?.();
});

clipDownloadBtn.addEventListener('click', downloadCurrentClip);

clipModalClose.addEventListener('click', closeClipModal);
clipModal.querySelector('[data-close-clip]').addEventListener('click', closeClipModal);

userPopoverClose.addEventListener('click', closeUserPopover);

openSettingsBtn.addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

initPopoverDrag();
document.addEventListener('mousemove', handlePopoverDragMove);
document.addEventListener('mouseup', handlePopoverDragEnd);

function applyPageTranslations() {
  document.documentElement.lang = 'en';

  if (!channel || !state.loading) {
    pageTitle.textContent = channel ? tr('pageClipsNamed', { channel }) : tr('pageClips');
  }

  changeChannelBtn.textContent = tr('changeChannel');
  refreshBtn.textContent = tr('refresh');
  statusText.textContent = tr('loadingClips');
  searchInput.placeholder = tr('searchPlaceholder');
  emptyState.textContent = tr('emptyClips');
  openSettingsBtn.textContent = tr('openSettings');
  document.getElementById('channel-modal-title').textContent = tr('changeChannelTitle');
  document.getElementById('channel-modal-label').textContent = tr('channelLabel');
  channelModalInput.placeholder = tr('channelModalPlaceholder');
  channelModalCancel.textContent = tr('cancel');
  channelModalSubmit.textContent = tr('open');
  document.getElementById('confirm-modal-title').textContent = tr('confirmTitle');
  confirmModalCancel.textContent = tr('cancel');
  document.querySelector('label[for="clip-quality-select"]').textContent = tr('quality');
  clipDownloadBtn.textContent = tr('download');
  clipOpenLink.textContent = tr('openOnTwitch');
  clipModalClose.setAttribute('aria-label', tr('close'));
  userPopoverClose.setAttribute('aria-label', tr('close'));
  userPopoverHeader.title = tr('dragPopover');
  cancelLoadBtn.textContent = tr('cancel');
  loadingBannerText.textContent = tr('loadingRest');

  prevButtons.forEach((button) => {
    button.textContent = tr('back');
  });
  nextButtons.forEach((button) => {
    button.textContent = tr('forward');
  });

  const headers = document.querySelectorAll('.clips-table thead th');
  const headerKeys = ['colNum', 'colCreator', 'colClip', 'colDate', 'colViews', 'colDuration'];
  headers.forEach((header, index) => {
    if (headerKeys[index]) {
      header.textContent = tr(headerKeys[index]);
    }
  });

  sortOptions.forEach((option) => {
    option.textContent = tr(SORT_KEYS[option.dataset.value]);
  });
  sortValue.textContent = tr(SORT_KEYS[state.sort]);

  if (state.broadcaster) {
    updateBroadcasterInfo(state.allClips.length);
  }
}

async function initPage() {
  applyPageTranslations();
  await loadClips();
}

initPage();
