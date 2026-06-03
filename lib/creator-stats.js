export function getCreatorStats(clips, creatorId, creatorName) {
  const normalizedName = (creatorName || '').toLowerCase();
  const creatorClips = clips.filter((clip) => {
    if (creatorId && clip.creator_id) {
      return clip.creator_id === creatorId;
    }
    return (clip.creator_name || '').toLowerCase() === normalizedName;
  });

  if (!creatorClips.length) {
    return null;
  }

  const sortedByDate = [...creatorClips].sort(
    (a, b) => new Date(a.created_at) - new Date(b.created_at)
  );
  const topClip = [...creatorClips].sort((a, b) => b.view_count - a.view_count)[0];
  const lastClip = sortedByDate[sortedByDate.length - 1];

  return {
    creatorName: creatorClips[0].creator_name || creatorName,
    creatorId: creatorId || creatorClips[0].creator_id,
    trackingSince: sortedByDate[0].created_at,
    clipCount: creatorClips.length,
    topClip,
    lastClip
  };
}

export function formatLongDate(iso, locale = 'ru-RU') {
  const date = new Date(iso);
  return date.toLocaleDateString(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
}

export function getClipThumbUrl(clip, width = 160, height = 90) {
  if (!clip?.thumbnail_url) {
    return '';
  }

  return clip.thumbnail_url
    .replace('%{width}', String(width))
    .replace('%{height}', String(height));
}
