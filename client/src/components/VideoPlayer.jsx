import { useCallback, useEffect, useRef, useState } from 'react';

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function applyRemoteState(el, payload, syncingRef, lastRemoteRef, unlockedRef, setNeedsTap) {
  const { currentTime, isPlaying, sentAt } = payload;
  const receivedAt = sentAt || Date.now();

  let targetTime = currentTime;
  if (isPlaying) {
    targetTime += (Date.now() - receivedAt) / 1000;
  }

  const needSeek = Math.abs(el.currentTime - targetTime) > 0.35;
  const needPlay = isPlaying && el.paused;
  const needPause = !isPlaying && !el.paused;

  lastRemoteRef.current = { currentTime, isPlaying, receivedAt };

  if (!needSeek && !needPlay && !needPause) return;

  syncingRef.current = true;

  if (needSeek) {
    el.currentTime = Math.max(0, targetTime);
  }

  const finish = () => {
    window.setTimeout(() => {
      syncingRef.current = false;
    }, 100);
  };

  if (needPause) {
    el.pause();
    setNeedsTap(false);
    finish();
    return;
  }

  if (needPlay) {
    if (!unlockedRef.current) {
      setNeedsTap(true);
      finish();
      return;
    }
    el.play()
      .then(() => {
        setNeedsTap(false);
      })
      .catch(() => {
        setNeedsTap(true);
      })
      .finally(finish);
    return;
  }

  finish();
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

  const syncingRef = useRef(false);
  const lastRemoteRef = useRef(null);
  const lastEmitRef = useRef(0);
  const unlockedRef = useRef(false);
  const seekingRef = useRef(false);

  useEffect(() => {
    if (!videoRef.current || !video) return;
    setPlayError('');
    setLoading(true);
    setNeedsTap(false);
    unlockedRef.current = false;
    lastRemoteRef.current = null;
    videoRef.current.load();
  }, [video?.streamUrl]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !syncTick) return;
    applyRemoteState(el, syncTick, syncingRef, lastRemoteRef, unlockedRef, setNeedsTap);
  }, [syncTick?.id]);

  useEffect(() => {
    const tick = window.setInterval(() => {
      const el = videoRef.current;
      const remote = lastRemoteRef.current;
      if (!el || syncingRef.current || seekingRef.current || !remote?.isPlaying || el.paused) return;

      const expected = remote.currentTime + (Date.now() - remote.receivedAt) / 1000;
      const diff = Math.abs(el.currentTime - expected);
      if (diff > 0.8 && diff < 20) {
        syncingRef.current = true;
        el.currentTime = expected;
        window.setTimeout(() => {
          syncingRef.current = false;
        }, 100);
      }
    }, 500);

    return () => window.clearInterval(tick);
  }, [video?.streamUrl]);

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  const emitAction = useCallback(
    (force = false) => {
      if (syncingRef.current) return;
      const el = videoRef.current;
      if (!el) return;

      const now = Date.now();
      if (!force && now - lastEmitRef.current < 120) return;
      lastEmitRef.current = now;

      const payload = {
        currentTime: el.currentTime,
        isPlaying: !el.paused,
      };

      lastRemoteRef.current = {
        currentTime: payload.currentTime,
        isPlaying: payload.isPlaying,
        receivedAt: now,
      };

      onUserAction(payload);
    },
    [onUserAction]
  );

  const togglePlay = useCallback(async () => {
    const el = videoRef.current;
    if (!el) return;

    unlockedRef.current = true;
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
  }, []);

  const handleTapToSync = async () => {
    const el = videoRef.current;
    const remote = lastRemoteRef.current;
    if (!el) return;

    unlockedRef.current = true;

    if (remote) {
      let targetTime = remote.currentTime;
      if (remote.isPlaying) {
        targetTime += (Date.now() - remote.receivedAt) / 1000;
      }
      el.currentTime = Math.max(0, targetTime);
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
    seekingRef.current = true;
    el.currentTime = value;
    setProgress(value);
  };

  const handleSeekEnd = () => {
    seekingRef.current = false;
    unlockedRef.current = true;
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
    if (!el || seekingRef.current) return;
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

  if (!video) {
    return (
      <div className="video-placeholder">
        <div className="video-placeholder-icon">▶</div>
        <p>{hasVideo ? 'Загрузка...' : 'Вставьте ссылку на видео выше'}</p>
        <span>YouTube, VK Video, Rutube и другие</span>
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
        src={video.streamUrl}
        playsInline
        preload="auto"
        onLoadedMetadata={handleLoadedMetadata}
        onLoadedData={() => setLoading(false)}
        onError={handleVideoError}
        onTimeUpdate={handleTimeUpdate}
        onPlay={() => {
          setIsPlayingLocal(true);
          if (!syncingRef.current) emitAction(true);
        }}
        onPause={() => {
          setIsPlayingLocal(false);
          if (!syncingRef.current) emitAction(true);
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

        <button type="button" className="video-ctrl-btn video-fullscreen-btn" onClick={toggleFullscreen} aria-label="Fullscreen">
          {isFullscreen ? '↙' : '⛶'}
        </button>
      </div>
    </div>
  );
}
