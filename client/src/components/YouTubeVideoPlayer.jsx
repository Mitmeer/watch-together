import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

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

let youtubeApiPromise = null;

function loadYouTubeApi() {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('YouTube API недоступен'));
  }

  if (window.YT?.Player) {
    return Promise.resolve(window.YT);
  }

  if (!youtubeApiPromise) {
    youtubeApiPromise = new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        reject(new Error('YouTube API не загрузился'));
      }, 15000);

      window.onYouTubeIframeAPIReady = () => {
        window.clearTimeout(timeout);
        resolve(window.YT);
      };

      if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
        const script = document.createElement('script');
        script.src = 'https://www.youtube.com/iframe_api';
        script.async = true;
        document.head.appendChild(script);
      }
    });
  }

  return youtubeApiPromise;
}

export default function YouTubeVideoPlayer({ video, syncTick, onUserAction }) {
  const wrapperRef = useRef(null);
  const mountRef = useRef(null);
  const playerRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [playError, setPlayError] = useState('');
  const [needsTap, setNeedsTap] = useState(false);
  const [isPlayingLocal, setIsPlayingLocal] = useState(false);
  const [progress, setProgress] = useState(video.startTime || 0);
  const [duration, setDuration] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const refs = useRef({
    syncing: { current: false },
    lastRemote: { current: null },
    lastEmit: { current: 0 },
    unlocked: { current: false },
    seeking: { current: false },
    ready: { current: false },
  }).current;

  const syncConfig = useMemo(
    () =>
      isMobileDevice()
        ? { hardSeek: 2.5, driftMs: 900 }
        : { hardSeek: 1.6, driftMs: 500 },
    []
  );

  const getPlayer = () => playerRef.current;

  const emitAction = useCallback(
    (force = false) => {
      if (refs.syncing.current) return;
      const player = getPlayer();
      if (!player?.getCurrentTime) return;

      const now = Date.now();
      if (!force && now - refs.lastEmit.current < 180) return;
      refs.lastEmit.current = now;

      const currentTime = player.getCurrentTime() || 0;
      const isPlaying = player.getPlayerState?.() === 1;

      refs.lastRemote.current = { currentTime, isPlaying, receivedAt: now };
      onUserAction({ currentTime, isPlaying });
    },
    [onUserAction, refs]
  );

  const applyRemoteState = useCallback(
    (payload) => {
      const player = getPlayer();
      if (!player?.seekTo || !refs.ready.current) return;

      const { currentTime, isPlaying, sentAt } = payload;
      const receivedAt = sentAt || Date.now();
      const targetTime = getExpectedTime({ currentTime, isPlaying, receivedAt });
      refs.lastRemote.current = { currentTime, isPlaying, receivedAt };

      const state = player.getPlayerState?.();
      const localTime = player.getCurrentTime?.() || 0;
      const needPause = !isPlaying && state === 1;
      const needPlay = isPlaying && state !== 1 && state !== 3;
      const needSeek = Math.abs(localTime - targetTime) > syncConfig.hardSeek;

      if (!needSeek && !needPlay && !needPause) return;

      refs.syncing.current = true;

      if (needSeek) {
        player.seekTo(Math.max(0, targetTime), true);
        setProgress(targetTime);
      }

      if (needPause) {
        player.pauseVideo();
        setIsPlayingLocal(false);
        setNeedsTap(false);
      } else if (needPlay) {
        if (!refs.unlocked.current) {
          setNeedsTap(true);
        } else {
          player.playVideo();
          setIsPlayingLocal(true);
          setNeedsTap(false);
        }
      }

      window.setTimeout(() => {
        refs.syncing.current = false;
      }, 150);
    },
    [refs, syncConfig.hardSeek]
  );

  useEffect(() => {
    let destroyed = false;
    let player = null;

    setLoading(true);
    setPlayError('');
    setNeedsTap(false);
    refs.unlocked.current = false;
    refs.ready.current = false;
    refs.lastRemote.current = null;

    loadYouTubeApi()
      .then((YT) => {
        if (destroyed || !mountRef.current) return;

        player = new YT.Player(mountRef.current, {
          videoId: video.youtubeId,
          playerVars: {
            enablejsapi: 1,
            origin: window.location.origin,
            start: video.startTime || 0,
            rel: 0,
            modestbranding: 1,
            playsinline: 1,
          },
          events: {
            onReady: (event) => {
              if (destroyed) return;
              playerRef.current = event.target;
              refs.ready.current = true;
              const videoDuration = event.target.getDuration?.() || 0;
              setDuration(videoDuration);
              setProgress(video.startTime || 0);
              setLoading(false);
            },
            onStateChange: (event) => {
              if (destroyed || refs.syncing.current) return;
              const playing = event.data === 1;
              setIsPlayingLocal(playing);
              if (event.data === 1 || event.data === 2) {
                emitAction(true);
              }
            },
            onError: () => {
              setLoading(false);
              setPlayError('YouTube не позволяет воспроизвести это видео.');
            },
          },
        });

        playerRef.current = player;
      })
      .catch((err) => {
        setLoading(false);
        setPlayError(err.message || 'Не удалось загрузить YouTube-плеер');
      });

    return () => {
      destroyed = true;
      refs.ready.current = false;
      player?.destroy?.();
      playerRef.current = null;
    };
  }, [video.youtubeId, video.startTime, emitAction, refs]);

  useEffect(() => {
    if (!syncTick) return;
    applyRemoteState(syncTick);
  }, [syncTick?.id, applyRemoteState, syncTick]);

  useEffect(() => {
    const tick = window.setInterval(() => {
      const player = getPlayer();
      if (!player?.getCurrentTime || !refs.ready.current || refs.syncing.current || refs.seeking.current) {
        return;
      }

      const remote = refs.lastRemote.current;
      if (remote?.isPlaying && player.getPlayerState?.() === 1) {
        const expected = getExpectedTime(remote);
        const diff = expected - (player.getCurrentTime() || 0);
        if (Math.abs(diff) > syncConfig.hardSeek) {
          refs.syncing.current = true;
          player.seekTo(Math.max(0, expected), true);
          window.setTimeout(() => {
            refs.syncing.current = false;
          }, 120);
        }
      }

      setProgress(player.getCurrentTime() || 0);
    }, syncConfig.driftMs);

    return () => window.clearInterval(tick);
  }, [refs, syncConfig]);

  useEffect(() => {
    const onFullscreenChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  const togglePlay = () => {
    const player = getPlayer();
    if (!player?.getPlayerState) return;

    refs.unlocked.current = true;
    setNeedsTap(false);

    if (player.getPlayerState() === 1) {
      player.pauseVideo();
      setIsPlayingLocal(false);
    } else {
      player.playVideo();
      setIsPlayingLocal(true);
    }
  };

  const handleTapToSync = () => {
    const player = getPlayer();
    const remote = refs.lastRemote.current;
    if (!player) return;

    refs.unlocked.current = true;

    if (remote) {
      player.seekTo(Math.max(0, getExpectedTime(remote)), true);
    }

    if (remote?.isPlaying) {
      player.playVideo();
      setIsPlayingLocal(true);
    } else {
      player.pauseVideo();
      setIsPlayingLocal(false);
    }

    setNeedsTap(false);
  };

  const handleSeek = (value) => {
    const player = getPlayer();
    if (!player?.seekTo) return;
    refs.seeking.current = true;
    player.seekTo(value, true);
    setProgress(value);
  };

  const handleSeekEnd = () => {
    refs.seeking.current = false;
    refs.unlocked.current = true;
    emitAction(true);
  };

  const toggleFullscreen = async () => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        return;
      }
      await wrapper.requestFullscreen?.();
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="video-wrapper video-wrapper-youtube" ref={wrapperRef}>
      {loading && <div className="video-loading">Загрузка YouTube...</div>}
      {playError && <div className="video-error">{playError}</div>}

      {needsTap && (
        <button type="button" className="video-tap-sync" onClick={handleTapToSync}>
          ▶ Нажмите для синхронизации
        </button>
      )}

      <div className="video-player video-player-youtube" ref={mountRef} />

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
