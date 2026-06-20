import { execFile } from 'child_process';
import fs from 'fs';
import https from 'https';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..');

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const insecureAgent = new https.Agent({ rejectUnauthorized: false });

function resolveYtDlpPath() {
  if (process.env.YT_DLP_PATH && fs.existsSync(process.env.YT_DLP_PATH)) {
    return process.env.YT_DLP_PATH;
  }

  const candidates = [
    path.join(projectRoot, '.venv', 'Scripts', 'yt-dlp.exe'),
    path.join(projectRoot, '.venv', 'bin', 'yt-dlp'),
    '/usr/local/bin/yt-dlp',
    '/usr/bin/yt-dlp',
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return 'yt-dlp';
}

const YT_DLP_PATH = resolveYtDlpPath();

function runYtDlp(args) {
  return new Promise((resolve, reject) => {
    execFile(
      YT_DLP_PATH,
      args,
      {
        maxBuffer: 64 * 1024 * 1024,
        windowsHide: true,
        timeout: 180000,
        env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
      },
      (err, stdout, stderr) => {
        if (err) {
          const detail = (stderr || err.message || '').trim();
          if (detail.includes('not found') || err.code === 'ENOENT') {
            reject(
              new Error(
                'yt-dlp не найден. Запустите install.bat или установите: uv pip install yt-dlp'
              )
            );
            return;
          }
          reject(new Error(detail.slice(0, 400) || 'Не удалось извлечь видео'));
          return;
        }
        resolve(stdout.trim());
      }
    );
  });
}

function normalizeUrl(url) {
  return url
    .trim()
    .replace(/^https?:\/\/vkvideo\.ru/i, 'https://vk.com')
    .replace(/^https?:\/\/m\.vk\.com/i, 'https://vk.com')
    .replace(/^https?:\/\/youtu\.be/i, 'https://www.youtube.com')
    .replace(/^https?:\/\/m\.youtube\.com/i, 'https://www.youtube.com');
}

function isYouTubeUrl(url) {
  return /(?:youtube\.com\/(?:watch|embed|shorts|live)|youtu\.be\/)/i.test(url);
}

function getYouTubeVideoId(url) {
  const patterns = [
    /[?&]v=([a-zA-Z0-9_-]{11})/,
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/live\/([a-zA-Z0-9_-]{11})/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match?.[1]) return match[1];
  }

  return null;
}

function getYouTubeStartTime(url) {
  const timeMatch = url.match(/[?&]t=(\d+)/);
  if (timeMatch) return Number(timeMatch[1]);

  const startMatch = url.match(/[?&]start=(\d+)/);
  if (startMatch) return Number(startMatch[1]);

  const hmsMatch = url.match(/[?&]t=(\d+h\d+m\d+s|\d+m\d+s|\d+s)/i);
  if (!hmsMatch) return 0;

  const raw = hmsMatch[1].toLowerCase();
  let seconds = 0;
  const hours = raw.match(/(\d+)h/);
  const mins = raw.match(/(\d+)m/);
  const secs = raw.match(/(\d+)s/);
  if (hours) seconds += Number(hours[1]) * 3600;
  if (mins) seconds += Number(mins[1]) * 60;
  if (secs) seconds += Number(secs[1]);
  return seconds;
}

async function fetchYouTubeMeta(videoId, webpageUrl) {
  try {
    const response = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}&format=json`
    );
    if (response.ok) {
      const data = await response.json();
      return {
        title: data.title || 'YouTube видео',
        thumbnail: data.thumbnail_url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      };
    }
  } catch {
    /* fallback below */
  }

  return {
    title: 'YouTube видео',
    thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
  };
}

async function extractYouTubeInfo(url) {
  const videoId = getYouTubeVideoId(url);
  if (!videoId) {
    throw new Error('Некорректная ссылка YouTube');
  }

  const meta = await fetchYouTubeMeta(videoId, url);

  return {
    sourceType: 'youtube',
    youtubeId: videoId,
    startTime: getYouTubeStartTime(url),
    title: meta.title,
    thumbnail: meta.thumbnail,
    duration: 0,
    streamUrl: null,
    streamType: 'mp4',
    webpageUrl: `https://www.youtube.com/watch?v=${videoId}`,
    extractor: 'youtube',
  };
}

function absolutize(href, base) {
  try {
    return new URL(href, base).href;
  } catch {
    return null;
  }
}

function cleanUrl(raw) {
  return raw
    .replace(/\\u0026/gi, '&')
    .replace(/\\u002F/gi, '/')
    .replace(/\\\//g, '/')
    .replace(/&amp;/g, '&')
    .trim();
}

function isMediaUrl(url) {
  return /\.(mp4|webm|mkv|mov|m4v|m3u8|mpd)(\?|$)/i.test(url);
}

function pickStreamUrl(data) {
  const formats = data.formats || data.requested_formats || [];

  const mp4 =
    formats.find((f) => f.url && f.ext === 'mp4' && f.vcodec !== 'none' && f.height <= 720) ||
    formats.find((f) => f.url && f.ext === 'mp4' && f.vcodec !== 'none') ||
    formats.find((f) => f.url && f.vcodec !== 'none' && f.protocol !== 'm3u8');

  return (
    data.url ||
    mp4?.url ||
    data.requested_formats?.find((f) => f.url && f.vcodec !== 'none')?.url ||
    formats.find((f) => f.url && f.vcodec !== 'none')?.url
  );
}

async function fetchPageWithRedirects(url, init = {}, maxHops = 12) {
  let current = url;
  const visited = new Set();

  for (let hop = 0; hop < maxHops; hop += 1) {
    if (visited.has(current)) {
      throw new Error(
        'Сайт блокирует загрузку с сервера (защита/редирект). Откройте видео в браузере, найдите прямую ссылку .mp4 или .m3u8 через F12 → Network и вставьте её'
      );
    }
    visited.add(current);

    const response = await fetch(current, { ...init, redirect: 'manual' });

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location) {
        throw new Error('Страница недоступна (битое перенаправление)');
      }
      current = absolutize(location, current);
      if (!current) {
        throw new Error('Страница недоступна (битое перенаправление)');
      }
      continue;
    }

    if (!response.ok) {
      throw new Error(`Страница недоступна (HTTP ${response.status})`);
    }

    return response;
  }

  throw new Error(
    'Сайт блокирует загрузку с сервера. Вставьте прямую ссылку на .mp4 или .m3u8'
  );
}

async function fetchPageHtml(url) {
  const init = {
    headers: {
      'User-Agent': BROWSER_UA,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
      Referer: new URL(url).origin + '/',
    },
  };

  if (url.startsWith('https://')) {
    init.agent = insecureAgent;
  }

  const response = await fetchPageWithRedirects(url, init);
  return response.text();
}

function extractTitle(html, fallback) {
  const og = html.match(/property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
  if (og?.[1]) return cleanUrl(og[1]).slice(0, 200);

  const title = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (title?.[1]) return cleanUrl(title[1]).slice(0, 200);

  return fallback;
}

function extractMediaCandidates(html, baseUrl) {
  const candidates = new Set();

  const add = (raw) => {
    if (!raw || raw.length < 8) return;
    let cleaned = cleanUrl(raw);

    if (/^[A-Za-z0-9+/=]{20,}$/.test(cleaned) && !cleaned.startsWith('http')) {
      try {
        cleaned = cleanUrl(Buffer.from(cleaned, 'base64').toString('utf8'));
      } catch {
        /* not base64 */
      }
    }

    const abs = absolutize(cleaned, baseUrl);
    if (abs && /^https?:\/\//i.test(abs) && isMediaUrl(abs)) {
      candidates.add(abs);
    }
  };

  const patterns = [
    /https?:\/\/[^\s"'<>]+\.(?:mp4|webm|mkv|mov|m4v|m3u8|mpd)(?:\?[^\s"'<>]*)?/gi,
    /https?:\\\/\\\/[^\s"'\\]+\\\.(?:mp4|m3u8)[^\s"'\\]*/gi,
    /(?:file|src|source|url|hls|video_url|videoUrl|mp4|stream|playlist)\s*[:=]\s*["']([^"']+)["']/gi,
    /["']([^"']+\.(?:mp4|m3u8|webm)(?:\?[^"']*)?)["']/gi,
    /data-(?:url|src|video|file)=["']([^"']+)["']/gi,
    /(?:atob|decodeURIComponent)\(["']([A-Za-z0-9+/=]{20,})["']\)/gi,
  ];

  for (const pattern of patterns) {
    const matches = html.matchAll(pattern);
    for (const match of matches) {
      add(match[1] || match[0]);
    }
  }

  return [...candidates];
}

function pickBestMedia(candidates) {
  if (!candidates.length) return null;

  const mp4 = candidates.filter((u) => /\.mp4/i.test(u));
  const m3u8 = candidates.filter((u) => /\.m3u8/i.test(u));
  const webm = candidates.filter((u) => /\.webm/i.test(u));

  const pick = (list) => {
    const hd = list.find((u) => /720|1080|480/.test(u));
    return hd || list[0];
  };

  if (mp4.length) return { streamUrl: pick(mp4), streamType: 'mp4' };
  if (webm.length) return { streamUrl: pick(webm), streamType: 'mp4' };
  if (m3u8.length) return { streamUrl: pick(m3u8), streamType: 'hls' };

  return { streamUrl: candidates[0], streamType: 'mp4' };
}

function extractIframeUrls(html, baseUrl) {
  const urls = [];
  const matches = html.matchAll(/<iframe[^>]+(?:src|data-src)=["']([^"']+)["']/gi);
  for (const match of matches) {
    const abs = absolutize(match[1], baseUrl);
    if (abs && !abs.includes('google.com/recaptcha')) {
      urls.push(abs);
    }
  }

  const playerLinks = html.matchAll(
    /https?:\/\/[^\s"'<>]*(?:kodik|alloha|voidboost|collaps|iframe|player|cdn)[^\s"'<>]*/gi
  );
  for (const match of playerLinks) {
    const abs = absolutize(match[0], baseUrl);
    if (abs) urls.push(abs);
  }

  return [...new Set(urls)].slice(0, 8);
}

function sanitizeErrorMessage(message) {
  const cleaned = (message || '')
    .replace(/^ERROR:\s*/i, '')
    .replace(/\[youtube\][^\n.]*/gi, '')
    .replace(/Sign in to confirm you're not a bot[^\n.]*/gi, 'YouTube временно недоступен с сервера')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 220);

  if (!cleaned || cleaned === "YouTube временно недоступен с сервера") {
    return 'Не удалось получить видео с этого сайта';
  }

  return cleaned;
}

async function scrapePageForVideo(pageUrl, depth = 0) {
  if (depth > 3) {
    throw new Error('Не удалось найти видео на странице');
  }

  const html = await fetchPageHtml(pageUrl);
  const candidates = extractMediaCandidates(html, pageUrl);
  const picked = pickBestMedia(candidates);

  if (picked) {
    return {
      id: null,
      title: extractTitle(html, new URL(pageUrl).pathname.split('/').pop() || 'Видео'),
      thumbnail: null,
      duration: 0,
      streamUrl: picked.streamUrl,
      streamType: picked.streamType,
      sourceType: picked.streamType === 'hls' ? 'hls' : 'file',
      webpageUrl: pageUrl,
      extractor: 'webpage',
    };
  }

  const iframes = extractIframeUrls(html, pageUrl);
  for (const iframeUrl of iframes) {
    try {
      return await extractWithYtDlp(iframeUrl);
    } catch {
      /* try scrape or next iframe */
    }

    try {
      return await scrapePageForVideo(iframeUrl, depth + 1);
    } catch {
      /* try next iframe */
    }
  }

  throw new Error('На странице не найдено видео. Попробуйте прямую ссылку на .mp4 или .m3u8');
}

async function extractWithYtDlp(url) {
  const clientStrategies = [
    'youtube:player_client=tv,web_embedded;player_skip=webpage',
    'youtube:player_client=android_vr,web',
    'youtube:player_client=web_safari',
  ];

  let lastError = null;

  for (const extractorArgs of clientStrategies) {
    try {
      return await extractWithYtDlpOnce(url, extractorArgs);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error('Не удалось извлечь видео');
}

async function extractWithYtDlpOnce(url, extractorArgs) {
  const output = await runYtDlp([
    '--dump-json',
    '--no-playlist',
    '--no-check-certificates',
    '--no-warnings',
    '--force-ipv4',
    '--referer',
    url,
    '--extractor-args',
    extractorArgs,
    '--format',
    'best[ext=mp4][height<=720]/best[height<=720]/best[ext=mp4]/best/bestvideo+bestaudio/best',
    '--user-agent',
    BROWSER_UA,
    url,
  ]);

  const data = JSON.parse(output);
  const streamUrl = pickStreamUrl(data);

  if (!streamUrl) {
    throw new Error('Не удалось получить ссылку на видео');
  }

  const streamType = /\.m3u8/i.test(streamUrl) ? 'hls' : 'mp4';

  return {
    id: data.id,
    title: data.title || 'Без названия',
    thumbnail: data.thumbnail || null,
    duration: data.duration || 0,
    streamUrl,
    streamType,
    sourceType: streamType === 'hls' ? 'hls' : 'file',
    webpageUrl: data.webpage_url || url,
    extractor: data.extractor_key || 'ytdlp',
  };
}

function directMediaInfo(url) {
  const fileName = url.split('/').pop()?.split('?')[0] || 'video';
  const streamType = /\.m3u8/i.test(url) ? 'hls' : 'mp4';

  return {
    id: null,
    title: decodeURIComponent(fileName),
    thumbnail: null,
    duration: 0,
    streamUrl: url,
    streamType,
    sourceType: streamType === 'hls' ? 'hls' : 'file',
    webpageUrl: url,
    extractor: 'direct',
  };
}

export async function extractVideoInfo(url) {
  if (!url || typeof url !== 'string') {
    throw new Error('URL обязателен');
  }

  const trimmed = normalizeUrl(url);
  if (!/^https?:\/\//i.test(trimmed)) {
    throw new Error('Введите корректную ссылку (http/https)');
  }

  if (isYouTubeUrl(trimmed)) {
    return extractYouTubeInfo(trimmed);
  }

  if (isMediaUrl(trimmed)) {
    return directMediaInfo(trimmed);
  }

  try {
    return await extractWithYtDlp(trimmed);
  } catch (ytdlpError) {
    try {
      return await scrapePageForVideo(trimmed);
    } catch (scrapeError) {
      const scrapeHint = sanitizeErrorMessage(scrapeError.message);
      const ytdlpHint = sanitizeErrorMessage(ytdlpError.message);
      if (scrapeHint === ytdlpHint) {
        throw new Error(`${scrapeHint}. Попробуйте прямую ссылку на .mp4 или .m3u8`);
      }
      throw new Error(`${scrapeHint}. ${ytdlpHint}`);
    }
  }
}

export async function refreshStreamUrl(webpageUrl) {
  const info = await extractVideoInfo(webpageUrl);
  return info.streamUrl;
}

export function getYtDlpPath() {
  return YT_DLP_PATH;
}

export function getStreamHeaders(entry) {
  let origin = 'https://www.youtube.com';
  try {
    origin = new URL(entry.webpageUrl || entry.streamUrl).origin;
  } catch {
    /* keep default */
  }

  return {
    'User-Agent': BROWSER_UA,
    Referer: entry.webpageUrl || origin + '/',
    Origin: origin,
  };
}

export function getStreamFetchOptions(entry, extraHeaders = {}) {
  const options = {
    headers: { ...getStreamHeaders(entry), ...extraHeaders },
    redirect: 'follow',
  };

  const target = entry.streamUrl || entry.webpageUrl || '';
  if (target.startsWith('https://')) {
    options.agent = insecureAgent;
  }

  return options;
}
