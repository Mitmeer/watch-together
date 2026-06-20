import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Hls from 'hls.js';
import YouTubeVideoPlayer from './YouTubeVideoPlayer';

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function isMobileDevice() {
  if (typeof navigator === 'undefined') return false;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

function getExpectedTime({ currentTime, isPlaying, receivedAt }) {
  if (!isPlaying) return currentTime;
  return currentTime + (Date.now() - receivedAt) / 1000;
}

function applyRemoteState(el, payload, refs, setNeedsTap, config) {
  const { currentTime, isPlaying, sentAt } = payload;
  const receivedAt = sentAt || Date.now();
  const targetTime = getExpectedTime({ currentTime, isPlaying, receivedAt });

  refs.lastRemote.current = { currentTime, isPlaying, receivedAt };

  const needPause = !isPlaying && !el.paused;
  const needPlay = isPlaying && el.paused;
  const diff = Math.abs(el.currentTime - targetTime);
  const needSeek = diff > config.hardSeek;

  if (!needSeek && !needPlay && !needPause) return;

  refs.syncing.current = true;

  if (needSeek) {
    el.currentTime = Math.max(0, targetTime);
  }

  el.playbackRate = 1;

  const finish = () => {
    window.setTimeout(() => {
      refs.syncing.current = false;
    }, 120);
  };

  if (needPause) {
    el.pause();
    setNeedsTap(false);
    finish();
    return;
  }

  if (needPlay) {
    if (!refs.unlocked.current) {
      setNeedsTap(true);
      finish();
      return;
    }
    el.play()
      .then(() => setNeedsTap(false))
      .catch(() => setNeedsTap(true))
      .finally(finish);
    return;
  }

  finish();
}

function correctDrift(el, refs, config) {
  const remote = refs.lastRemote.current;
  if (!remote?.isPlaying || el.paused || refs.syncing.current || refs.seeking.current) {
    if (el.playbackRate !== 1) el.playbackRate = 1;
    return;
  }

  const expected = getExpectedTime(remote);
  const diff = expected - el.currentTime;

  if (Math.abs(diff) > config.hardSeek) {
    refs.syncing.current = true;
    el.currentTime = expected;
    el.playbackRate = 1;
    window.setTimeout(() => {
      refs.syncing.current = false;
    }, 120);
    return;
  }

  if (Math.abs(diff) > config.softZone) {
    el.playbackRate = diff > 0 ? config.catchUpRate : config.slowRate;
  } else if (el.playbackRate !== 1) {
    el.playbackRate = 1;
  }
}

export default function VideoPlayer({ video, syncTick, onUserAction, hasVideo }) {
  const wrapperRef = useRef(null);
  const videoRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [playError, setPlayError] = useState('');
  const [needsTap, setNeedsTap] = useState(false);
  const [isPlayingLocal, setIsPlayingLocal] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const refs = useRef({
    syncing: { current: false },
    lastRemote: { current: null },
    lastEmit: { current: 0 },
    unlocked: { current: false },
    seeking: { current: false },
    lastUi: { current: 0 },
  }).current;

  const syncConfig = useMemo(
    () =>
      isMobileDevice()
        ? { hardSeek: 2.2, softZone: 0.35, catchUpRate: 1.015, slowRate: 0.985, driftMs: 900 }
        : { hardSeek: 1.4, softZone: 0.2, catchUpRate: 1.03, slowRate: 0.97, driftMs: 500 },
    []
  );

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !video) return;

    setPlayError('');
    setLoading(true);
    setNeedsTap(false);
    refs.unlocked.current = false;
    refs.lastRemote.current = null;
    el.playbackRate = 1;
    el.removeAttribute('src');
    el.load();

    if (video.isHls) {
      if (Hls.isSupported()) {
        const hls = new Hls({ enableWorker: true, lowLatencyMode: false });
        hls.loadSource(video.streamUrl);
        hls.attachMedia(el);
        hls.on(Hls.Events.MANIFEST_PARSED, () => setLoading(false));
        hls.on(Hls.Events.LEVEL_LOADED, (_, data) => {
          if (data.details?.totalduration) {
            setDuration(data.details.totalduration);
          }
        });
        hls.on(Hls.Events.ERROR, (_, data) => {
          if (data.fatal) {
            setLoading(false);
            setPlayError('Ошибка HLS-потока. Попробуйте другую ссылку.');
          }
        });
        return () => hls.destroy();
      }

      if (el.canPlayType('application/vnd.apple.mpegurl')) {
        el.src = video.streamUrl;
        return;
      }

      setLoading(false);
      setPlayError('HLS не поддерживается в этом браузере');
      return;
    }

    el.src = video.streamUrl;
  }, [video?.streamUrl, video?.isHls, refs]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !syncTick) return;
    applyRemoteState(el, syncTick, refs, setNeedsTap, syncConfig);
  }, [syncTick?.id, syncConfig, refs]);

  useEffect(() => {
    const tick = window.setInterval(() => {
      const el = videoRef.current;
      if (!el) return;
      correctDrift(el, refs, syncConfig);
    }, syncConfig.driftMs);

    return () => window.clearInterval(tick);
  }, [video?.streamUrl, syncConfig, refs]);

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  const emitAction = useCallback(
    (force = false) => {
      if (refs.syncing.current) return;
      const el = videoRef.current;
      if (!el) return;

      const now = Date.now();
      if (!force && now - refs.lastEmit.current < 180) return;
      refs.lastEmit.current = now;

      const payload = {
        currentTime: el.currentTime,
        isPlaying: !el.paused,
      };

      refs.lastRemote.current = {
        currentTime: payload.currentTime,
        isPlaying: payload.isPlaying,
        receivedAt: now,
      };

      onUserAction(payload);
    },
    [onUserAction, refs]
  );

  const togglePlay = useCallback(async () => {
    const el = videoRef.current;
    if (!el) return;

    refs.unlocked.current = true;
    setNeedsTap(false);

    if (el.paused) {
      try {
        await el.play();
      } catch {
        setNeedsTap(true);
      }
    } else {
      el.pause();
    }
  }, [refs]);

  const handleTapToSync = async () => {
    const el = videoRef.current;
    const remote = refs.lastRemote.current;
    if (!el) return;

    refs.unlocked.current = true;

    if (remote) {
      el.currentTime = Math.max(0, getExpectedTime(remote));
    }

    try {
      if (remote?.isPlaying ?? !el.paused) {
        await el.play();
        setIsPlayingLocal(true);
      } else {
        el.pause();
        setIsPlayingLocal(false);
      }
      setNeedsTap(false);
    } catch {
      setNeedsTap(true);
    }
  };

  const handleSeek = (value) => {
    const el = videoRef.current;
    if (!el) return;
    refs.seeking.current = true;
    el.currentTime = value;
    el.playbackRate = 1;
    setProgress(value);
  };

  const handleSeekEnd = () => {
    refs.seeking.current = false;
    refs.unlocked.current = true;
    emitAction(true);
  };

  const toggleFullscreen = async () => {
    const wrapper = wrapperRef.current;
    const el = videoRef.current;
    if (!wrapper || !el) return;

    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        return;
      }

      if (wrapper.requestFullscreen) {
        await wrapper.requestFullscreen();
        return;
      }

      if (el.webkitEnterFullscreen) {
        el.webkitEnterFullscreen();
      }
    } catch {
      /* ignore */
    }
  };

  const handleTimeUpdate = () => {
    const el = videoRef.current;
    if (!el || refs.seeking.current) return;

    const now = Date.now();
    if (now - refs.lastUi.current < 300) return;
    refs.lastUi.current = now;

    setProgress(el.currentTime);
    setIsPlayingLocal(!el.paused);
  };

  const handleLoadedMetadata = () => {
    const el = videoRef.current;
    if (!el) return;
    setDuration(el.duration || 0);
    setLoading(false);
  };

  const handleVideoError = () => {
    setLoading(false);
    setPlayError('Ошибка загрузки видео. Загрузите ссылку снова.');
  };

  if (video?.sourceType === 'youtube') {
    return <YouTubeVideoPlayer video={video} syncTick={syncTick} onUserAction={onUserAction} />;
  }

  if (!video) {
    return (
      <div className="video-placeholder">
        <div className="video-placeholder-icon">▶</div>
        <p>{hasVideo ? 'Загрузка...' : 'Вставьте ссылку на видео выше'}</p>
        <span>YouTube, VK, Rutube, прямые .mp4/.m3u8 и другие сайты</span>
      </div>
    );
  }

  return (
    <div className="video-wrapper" ref={wrapperRef}>
      {loading && <div className="video-loading">Загрузка видео...</div>}
      {playError && <div className="video-error">{playError}</div>}

      {needsTap && (
        <button type="button" className="video-tap-sync" onClick={handleTapToSync}>
          ▶ Нажмите для синхронизации
        </button>
      )}

      <video
        ref={videoRef}
        className="video-player"
        playsInline
        preload="auto"
        onLoadedMetadata={handleLoadedMetadata}
        onLoadedData={() => setLoading(false)}
        onError={handleVideoError}
        onTimeUpdate={handleTimeUpdate}
        onPlay={() => {
          setIsPlayingLocal(true);
          if (!refs.syncing.current) emitAction(true);
        }}
        onPause={() => {
          setIsPlayingLocal(false);
          if (videoRef.current) videoRef.current.playbackRate = 1;
          if (!refs.syncing.current) emitAction(true);
        }}
      />

      <div className="video-controls">
        <button type="button" className="video-ctrl-btn" onClick={togglePlay} aria-label="Play/Pause">
          {isPlayingLocal ? '⏸' : '▶'}
        </button>

        <span className="video-time">{formatTime(progress)}</span>

        <input
          type="range"
          className="video-seek"
          min={0}
          max={duration || 0}
          step={0.1}
          value={Math.min(progress, duration || 0)}
          onChange={(e) => handleSeek(Number(e.target.value))}
          onMouseUp={handleSeekEnd}
          onTouchEnd={handleSeekEnd}
        />

        <span className="video-time">{formatTime(duration)}</span>

        <button
          type="button"
          className="video-ctrl-btn video-fullscreen-btn"
          onClick={toggleFullscreen}
          aria-label="Fullscreen"
        >
          {isFullscreen ? '↙' : '⛶'}
        </button>
      </div>
    </div>
  );
}
