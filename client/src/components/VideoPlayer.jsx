import { useEffect, useRef, useState } from 'react';

function applyRemoteState(el, { currentTime, isPlaying, sentAt }, syncingRef, lastRemoteRef) {
  const receivedAt = sentAt || Date.now();

  let targetTime = currentTime;
  if (isPlaying) {
    targetTime += (Date.now() - receivedAt) / 1000;
  }

  const needSeek = Math.abs(el.currentTime - targetTime) > 0.15;
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
    }, 80);
  };

  if (needPlay) {
    el.play().catch(() => {}).finally(finish);
  } else if (needPause) {
    el.pause();
    finish();
  } else {
    finish();
  }
}

export default function VideoPlayer({ video, syncTick, onUserAction, hasVideo }) {
  const videoRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [playError, setPlayError] = useState('');
  const syncingRef = useRef(false);
  const lastRemoteRef = useRef(null);
  const lastEmitRef = useRef(0);
  const heartbeatRef = useRef(null);

  useEffect(() => {
    if (!videoRef.current || !video) return;
    setPlayError('');
    setLoading(true);
    lastRemoteRef.current = null;
    videoRef.current.load();
  }, [video?.streamUrl]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !syncTick) return;
    applyRemoteState(el, syncTick, syncingRef, lastRemoteRef);
  }, [syncTick?.id]);

  useEffect(() => {
    const tick = window.setInterval(() => {
      const el = videoRef.current;
      const remote = lastRemoteRef.current;
      if (!el || syncingRef.current || !remote?.isPlaying || el.paused) return;

      const expected = remote.currentTime + (Date.now() - remote.receivedAt) / 1000;
      const diff = Math.abs(el.currentTime - expected);
      if (diff > 0.3 && diff < 12) {
        syncingRef.current = true;
        el.currentTime = expected;
        window.setTimeout(() => {
          syncingRef.current = false;
        }, 80);
      }
    }, 350);

    return () => window.clearInterval(tick);
  }, [video?.streamUrl]);

  useEffect(() => {
    return () => {
      if (heartbeatRef.current) window.clearInterval(heartbeatRef.current);
    };
  }, []);

  const emitAction = (force = false) => {
    if (syncingRef.current) return;
    const el = videoRef.current;
    if (!el) return;

    const now = Date.now();
    if (!force && now - lastEmitRef.current < 100) return;
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

    if (heartbeatRef.current) window.clearInterval(heartbeatRef.current);
    if (payload.isPlaying) {
      heartbeatRef.current = window.setInterval(() => {
        if (syncingRef.current || !videoRef.current || videoRef.current.paused) return;
        onUserAction({
          currentTime: videoRef.current.currentTime,
          isPlaying: true,
        });
      }, 4000);
    }
  };

  const handlePlay = () => emitAction(true);
  const handlePause = () => emitAction(true);

  const handleSeeked = () => emitAction(true);

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
    <div className="video-wrapper">
      {loading && <div className="video-loading">Загрузка видео...</div>}
      {playError && <div className="video-error">{playError}</div>}
      <video
        ref={videoRef}
        className="video-player"
        src={video.streamUrl}
        controls
        controlsList="nodownload"
        onLoadedData={() => setLoading(false)}
        onError={handleVideoError}
        onPlay={handlePlay}
        onPause={handlePause}
        onSeeked={handleSeeked}
        playsInline
        preload="auto"
      />
    </div>
  );
}
