import { execFile } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..');

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
    .replace(/^https?:\/\/m\.vk\.com/i, 'https://vk.com');
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

export async function extractVideoInfo(url) {
  if (!url || typeof url !== 'string') {
    throw new Error('URL обязателен');
  }

  const trimmed = normalizeUrl(url);
  if (!/^https?:\/\//i.test(trimmed)) {
    throw new Error('Введите корректную ссылку (http/https)');
  }

  if (/\.(mp4|webm|mkv|mov|m4v)(\?|$)/i.test(trimmed)) {
    const fileName = trimmed.split('/').pop()?.split('?')[0] || 'video';
    return {
      id: null,
      title: decodeURIComponent(fileName),
      thumbnail: null,
      duration: 0,
      streamUrl: trimmed,
      webpageUrl: trimmed,
      extractor: 'direct',
    };
  }

  const output = await runYtDlp([
    '--dump-json',
    '--no-playlist',
    '--no-check-certificates',
    '--no-warnings',
    '--format',
    'best[ext=mp4][height<=720]/best[height<=720]/best[ext=mp4]/best',
    '--user-agent',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    trimmed,
  ]);

  const data = JSON.parse(output);
  const streamUrl = pickStreamUrl(data);

  if (!streamUrl) {
    throw new Error('Не удалось получить ссылку на видео. Попробуйте другую ссылку.');
  }

  return {
    id: data.id,
    title: data.title || 'Без названия',
    thumbnail: data.thumbnail || null,
    duration: data.duration || 0,
    streamUrl,
    webpageUrl: data.webpage_url || trimmed,
    extractor: data.extractor_key || 'generic',
  };
}

export async function refreshStreamUrl(webpageUrl) {
  const info = await extractVideoInfo(webpageUrl);
  return info.streamUrl;
}

export function getYtDlpPath() {
  return YT_DLP_PATH;
}
