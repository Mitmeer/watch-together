import { useEffect, useRef, useState } from 'react';

export default function VideoPlayer({
  video,
  isHost,
  isPlaying,
  currentTime,
  onSync,
  onTimeUpdate,
}) {
  const videoRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [playError, setPlayError] = useState('');
  const syncingRef = useRef(false);
  const lastSyncRef = useRef(0);
  const hostActionRef = useRef(false);

  useEffect(() => {
    if (!videoRef.current || !video) return;
    setPlayError('');
    setLoading(true);
    videoRef.current.load();
  }, [video?.streamUrl]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || syncingRef.current || isHost) return;

    const diff = Math.abs(el.currentTime - currentTime);
    if (diff > 1.2) {
      syncingRef.current = true;
      el.currentTime = currentTime;
      setTimeout(() => {
        syncingRef.current = false;
      }, 400);
    }
  }, [currentTime, isHost]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || syncingRef.current || isHost) return;

    if (isPlaying && el.paused) {
      el.play().catch(() => setPlayError('Не удалось начать воспроизведение'));
    } else if (!isPlaying && !el.paused) {
      el.pause();
    }
  }, [isPlaying, isHost]);

  const handlePlay = () => {
    if (!isHost) return;
    if (hostActionRef.current) return;
    onSync({ currentTime: videoRef.current?.currentTime ?? 0, isPlaying: true });
  };

  const handlePause = () => {
    if (!isHost) return;
    if (hostActionRef.current) return;
    onSync({ currentTime: videoRef.current?.currentTime ?? 0, isPlaying: false });
  };

  const handleSeeked = () => {
    if (!isHost) return;
    const now = Date.now();
    if (now - lastSyncRef.current < 500) return;
    lastSyncRef.current = now;
    onSync({
      currentTime: videoRef.current?.currentTime ?? 0,
      isPlaying: !videoRef.current?.paused,
    });
  };

  const handleTimeUpdate = () => {
    if (!isHost || syncingRef.current) return;
    onTimeUpdate(videoRef.current?.currentTime ?? 0);
  };

  const handleVideoError = () => {
    setLoading(false);
    setPlayError('Ошибка загрузки видео. Попросите хоста загрузить ссылку снова.');
  };

  if (!video) {
    return (
      <div className="video-placeholder">
        <div className="video-placeholder-icon">▶</div>
        <p>{isHost ? 'Вставьте ссылку на видео выше' : 'Хост ещё не выбрал видео'}</p>
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
        controls={isHost}
        controlsList={isHost ? undefined : 'nodownload noremoteplayback'}
        disablePictureInPicture={!isHost}
        onContextMenu={(e) => !isHost && e.preventDefault()}
        onLoadedData={() => setLoading(false)}
        onError={handleVideoError}
        onPlay={handlePlay}
        onPause={handlePause}
        onSeeked={handleSeeked}
        onTimeUpdate={handleTimeUpdate}
        playsInline
        preload="metadata"
      />
      <div className="video-info">
        <h3>{video.title}</h3>
        <span className="video-source">{video.extractor}</span>
      </div>
    </div>
  );
}
