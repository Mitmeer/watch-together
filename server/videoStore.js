import { customAlphabet } from 'nanoid';

const generateId = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 16);
const store = new Map();
const MAX_ENTRIES = 200;
const MAX_AGE_MS = 6 * 60 * 60 * 1000;

export function cacheVideo(info) {
  cleanup();
  const id = generateId();
  store.set(id, {
    id,
    title: info.title,
    thumbnail: info.thumbnail,
    duration: info.duration,
    streamUrl: info.streamUrl || null,
    streamType: info.streamType || 'mp4',
    sourceType: info.sourceType || 'file',
    youtubeId: info.youtubeId || null,
    startTime: info.startTime || 0,
    webpageUrl: info.webpageUrl,
    extractor: info.extractor,
    cachedAt: Date.now(),
  });
  return id;
}

export function getCachedVideo(id) {
  const entry = store.get(id);
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > MAX_AGE_MS) {
    store.delete(id);
    return null;
  }
  return entry;
}

export function updateStreamUrl(id, streamUrl, streamType) {
  const entry = store.get(id);
  if (!entry) return null;
  entry.streamUrl = streamUrl;
  if (streamType) entry.streamType = streamType;
  entry.cachedAt = Date.now();
  return entry;
}

function cleanup() {
  if (store.size < MAX_ENTRIES) return;
  const oldest = [...store.entries()].sort((a, b) => a[1].cachedAt - b[1].cachedAt);
  for (let i = 0; i < oldest.length - MAX_ENTRIES + 1; i++) {
    store.delete(oldest[i][0]);
  }
}

export function toClientVideo(entry) {
  if (entry.sourceType === 'youtube') {
    return {
      id: entry.id,
      title: entry.title,
      thumbnail: entry.thumbnail,
      duration: entry.duration,
      sourceType: 'youtube',
      youtubeId: entry.youtubeId,
      startTime: entry.startTime || 0,
      webpageUrl: entry.webpageUrl,
      extractor: entry.extractor,
    };
  }

  const isHls = entry.streamType === 'hls';
  const isDirect = entry.extractor === 'direct' && !isHls;

  return {
    id: entry.id,
    title: entry.title,
    thumbnail: entry.thumbnail,
    duration: entry.duration,
    sourceType: isHls ? 'hls' : 'file',
    streamUrl: isDirect
      ? entry.streamUrl
      : isHls
        ? `/api/video/hls/${entry.id}`
        : `/api/video/stream/${entry.id}`,
    isHls,
    isDirect,
    webpageUrl: entry.webpageUrl,
    extractor: entry.extractor,
  };
}
