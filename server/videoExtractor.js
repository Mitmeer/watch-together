import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..');

const YT_DLP_CANDIDATES = [
  'yt-dlp',
  path.join(projectRoot, '.venv', 'Scripts', 'yt-dlp.exe'),
  path.join(projectRoot, '.venv', 'bin', 'yt-dlp'),
  '/usr/local/bin/yt-dlp',
];

function runYtDlp(args) {
  return new Promise((resolve, reject) => {
    const tryNext = (index) => {
      if (index >= YT_DLP_CANDIDATES.length) {
        reject(new Error('yt-dlp не установлен на сервере'));
        return;
      }

      const cmd = YT_DLP_CANDIDATES[index];
      const proc = spawn(cmd, args, { shell: false });
      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (chunk) => {
        stdout += chunk.toString();
      });

      proc.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });

      proc.on('close', (code) => {
        if (code !== 0) {
          const notFound =
            stderr.includes('not recognized') ||
            stderr.includes('ENOENT') ||
            stderr.includes('No such file');
          if (notFound && index < YT_DLP_CANDIDATES.length - 1) {
            tryNext(index + 1);
            return;
          }
          const msg = stderr.trim() || `yt-dlp error code ${code}`;
          reject(new Error(msg.slice(0, 300)));
          return;
        }
        resolve(stdout.trim());
      });

      proc.on('error', () => tryNext(index + 1));
    };

    tryNext(0);
  });
}

function pickStreamUrl(data) {
  return (
    data.url ||
    data.requested_formats?.find((f) => f.url && f.vcodec !== 'none')?.url ||
    data.requested_formats?.[0]?.url ||
    data.formats?.find((f) => f.url && f.vcodec !== 'none' && f.protocol !== 'm3u8')?.url ||
    data.formats?.find((f) => f.url && f.vcodec !== 'none')?.url
  );
}

export async function extractVideoInfo(url) {
  if (!url || typeof url !== 'string') {
    throw new Error('URL обязателен');
  }

  const trimmed = url.trim();
  if (!/^https?:\/\//i.test(trimmed)) {
    throw new Error('Введите корректную ссылку (http/https)');
  }

  if (/\.(mp4|webm|mkv|mov)(\?|$)/i.test(trimmed)) {
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
    '--format',
    'best[height<=720][ext=mp4]/best[height<=720]/best',
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
