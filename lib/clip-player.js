import { gqlFetch, runSequential } from './rate-limiter.js';
import { I18nError } from './i18n.js';

const TWITCH_GQL_CLIENT_ID = 'kimne78kx3ncx6brgo4mv6wki5h1ko';
const CLIP_TOKEN_HASH = '36b89d2507fce29e5ca551df756d27c1cfe079e2609642b4390aa4c35796eb11';
const VERIFIED_BATCH_SIZE = 8;
export const VERIFIED_BADGE_SET_ID = 'd12a2e27-16f6-41d0-ab77-b780518f00a3';
export const VERIFIED_BADGE_URL = `https://static-cdn.jtvnw.net/badges/v1/${VERIFIED_BADGE_SET_ID}/2`;

async function gqlRequest(body) {
  const response = await gqlFetch('https://gql.twitch.tv/gql', {
    method: 'POST',
    headers: {
      'Client-ID': TWITCH_GQL_CLIENT_ID,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  return response.json();
}

function buildSignedUrl(sourceUrl, signature, token) {
  return `${sourceUrl}?sig=${encodeURIComponent(signature)}&token=${encodeURIComponent(token)}`;
}

function chunkArray(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function readVerifiedFromUser(user) {
  if (!user) {
    return false;
  }

  if (user.isVerified === true) {
    return true;
  }

  const badgeLists = [
    user.badges,
    user.broadcastBadges,
    user.channelBadges
  ].filter(Array.isArray);

  for (const badges of badgeLists) {
    if (badges.some((badge) => {
      const setId = String(badge?.setID || badge?.setId || '').toLowerCase();
      return setId === VERIFIED_BADGE_SET_ID.toLowerCase();
    })) {
      return true;
    }
  }

  return false;
}

export async function getClipPlaybackSources(clipSlug) {
  const payload = await gqlRequest({
    operationName: 'VideoAccessToken_Clip',
    variables: { slug: clipSlug },
    extensions: {
      persistedQuery: {
        version: 1,
        sha256Hash: CLIP_TOKEN_HASH
      }
    }
  });

  const result = Array.isArray(payload) ? payload[0] : payload;

  if (result?.errors?.length) {
    throw new I18nError('errClipUnavailable');
  }

  const clip = result?.data?.clip;

  if (!clip?.playbackAccessToken?.signature || !clip?.videoQualities?.length) {
    throw new I18nError('errClipUnavailable');
  }

  const { signature, value } = clip.playbackAccessToken;
  const qualities = [...clip.videoQualities].sort(
    (a, b) => Number(b.quality) - Number(a.quality)
  );

  return qualities.map((quality) => ({
    quality: quality.quality,
    label: `${quality.quality}p`,
    url: buildSignedUrl(quality.sourceURL, signature, value)
  }));
}

export async function getClipPlaybackUrl(clipSlug) {
  const sources = await getClipPlaybackSources(clipSlug);
  return sources[0]?.url;
}

export async function fetchUserVerified(login) {
  try {
    const payload = await gqlRequest({
      query: `query UserVerified($login: String!) {
        user(login: $login) {
          login
          isVerified
          badges {
            setID
            id
          }
          broadcastBadges {
            setID
            id
          }
          channelBadges {
            setID
            id
          }
        }
      }`,
      variables: { login: login.toLowerCase() }
    });

    return readVerifiedFromUser(payload?.data?.user);
  } catch {
    return false;
  }
}

export async function fetchUsersVerifiedByLogins(logins) {
  const unique = [...new Set(logins.map((login) => login.toLowerCase()).filter(Boolean))];
  const verifiedMap = {};

  for (const chunk of chunkArray(unique, VERIFIED_BATCH_SIZE)) {
    await runSequential(chunk, async (login) => {
      verifiedMap[login] = await fetchUserVerified(login);
    });
  }

  return verifiedMap;
}

export async function fetchUsersVerified(userIds, idToLogin) {
  const verifiedById = {};
  const logins = [...new Set(
    userIds
      .map((id) => idToLogin[id]?.login)
      .filter(Boolean)
      .map((login) => login.toLowerCase())
  )];

  const verifiedByLogin = await fetchUsersVerifiedByLogins(logins);

  userIds.forEach((id) => {
    const login = idToLogin[id]?.login?.toLowerCase();
    verifiedById[id] = login ? verifiedByLogin[login] === true : false;
  });

  return verifiedById;
}

export async function fetchUsersByIds(userIds, apiGet) {
  const uniqueIds = [...new Set(userIds.filter(Boolean))];
  const profiles = {};

  for (const chunk of chunkArray(uniqueIds, 100)) {
    const params = new URLSearchParams();
    chunk.forEach((id) => params.append('id', id));

    const data = await apiGet(`/users?${params}`);

    for (const user of data.data || []) {
      profiles[user.id] = {
        id: user.id,
        login: user.login,
        displayName: user.display_name,
        avatar: user.profile_image_url,
        createdAt: user.created_at,
        isVerified: false
      };
    }
  }

  return profiles;
}
