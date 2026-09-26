import { useEffect, useRef, useState, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { createListeningProgress } from '../listeningProgress';

const CONTAINER_ID = 'yt-player-persistent';

export default function useYouTubePlayer() {
  const playerRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const currentVideoIdRef = useRef(null);
  const desiredPlayingRef = useRef(false);
  const pendingLoadRef = useRef(null);

  const onEndedRef = useRef(null);
  const onPlayingRef = useRef(null);
  const onPausedRef = useRef(null);
  const onErrorRef = useRef(null);
  const onProgressRef = useRef(null);

  const history = useRef(null);
  if (!history.current) {
    history.current = createListeningProgress(payload => onProgressRef.current?.(payload));
  }

  useEffect(() => {
    let destroyed = false;

    // Ensure hidden persistent container on body
    let container = document.getElementById(CONTAINER_ID);
    if (!container) {
      container = document.createElement('div');
      container.id = CONTAINER_ID;
      Object.assign(container.style, {
        position: 'fixed',
        bottom: '0px',
        right: '0px',
        width: '200px',
        height: '200px',
        opacity: '0.001',
        pointerEvents: 'none',
        zIndex: '-9999',
      });
      const innerDiv = document.createElement('div');
      innerDiv.id = 'yt-player-iframe-slot';
      container.appendChild(innerDiv);
      document.body.appendChild(container);
    }

    // Load YouTube IFrame API script once
    if (!document.getElementById('yt-iframe-api')) {
      const tag = document.createElement('script');
      tag.id = 'yt-iframe-api';
      tag.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(tag);
    }

    const initPlayer = () => {
      if (destroyed || playerRef.current || !window.YT?.Player) return;
      const slot = document.getElementById('yt-player-iframe-slot');
      if (!slot) return;

      playerRef.current = new window.YT.Player('yt-player-iframe-slot', {
        height: '200',
        width: '200',
        playerVars: {
          autoplay: 0,
          controls: 0,
          disablekb: 1,
          fs: 0,
          iv_load_policy: 3,
          modestbranding: 1,
          rel: 0,
          playsinline: 1,
          origin: window.location.origin,
        },
        events: {
          onReady: (event) => {
            if (destroyed) return;
            setReady(true);
            if (pendingLoadRef.current) {
              const { id, seconds, playing } = pendingLoadRef.current;
              pendingLoadRef.current = null;
              loadVideo(id, seconds, playing);
            }
          },
          onStateChange: (event) => {
            if (destroyed) return;
            if (event.data === window.YT.PlayerState.PLAYING) {
              setError('');
              if ('mediaSession' in navigator) {
                navigator.mediaSession.playbackState = 'playing';
              }
              onPlayingRef.current?.();
            } else if (event.data === window.YT.PlayerState.PAUSED) {
              // Nếu đang chạy native app và phòng đang muốn phát nhạc mà YouTube lại tự pause
              // (xảy ra khi tắt màn hình hoặc chuyển app trên mobile):
              if (Capacitor.isNativePlatform() && desiredPlayingRef.current) {
                setTimeout(() => {
                  if (desiredPlayingRef.current && playerRef.current?.playVideo) {
                    playerRef.current.playVideo();
                  }
                }, 120);
                return;
              }
              if ('mediaSession' in navigator) {
                navigator.mediaSession.playbackState = 'paused';
              }
              onPausedRef.current?.();
            } else if (event.data === window.YT.PlayerState.ENDED) {
              const ct = playerRef.current?.getCurrentTime?.() || 0;
              const dur = playerRef.current?.getDuration?.() || 0;
              history.current?.finish({ currentTime: ct, duration: dur, paused: true });
              onEndedRef.current?.();
            }
          },
          onError: (event) => {
            if (destroyed) return;
            console.error('YT Player error code:', event.data);
            if (event.data === 101 || event.data === 150) {
              setError('Video này chặn phát qua trình nhúng hoặc yêu cầu bản quyền.');
            } else {
              setError('Không thể phát video này từ YouTube.');
            }
            onErrorRef.current?.(event.data);
          },
        },
      });
    };

    if (window.YT && window.YT.Player) {
      initPlayer();
    } else {
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        prev?.();
        initPlayer();
      };
    }

    // Interval to track listening progress
    const progressInterval = setInterval(() => {
      if (!playerRef.current?.getCurrentTime) return;
      const state = playerRef.current.getPlayerState?.();
      const ct = playerRef.current.getCurrentTime() || 0;
      const dur = playerRef.current.getDuration() || 0;
      const isPlaying = state === window.YT?.PlayerState?.PLAYING;
      history.current?.sample({
        currentTime: ct,
        duration: dur,
        paused: !isPlaying,
        seeking: false,
      });
    }, 1000);

    return () => {
      destroyed = true;
      clearInterval(progressInterval);
      if (playerRef.current?.destroy) {
        playerRef.current.destroy();
        playerRef.current = null;
      }
      const el = document.getElementById(CONTAINER_ID);
      if (el?.parentNode) el.parentNode.removeChild(el);
    };
  }, []);

  const loadVideo = useCallback((id, startSeconds = 0, playing = true, { preservePosition = false } = {}) => {
    desiredPlayingRef.current = playing;
    if (!playerRef.current?.loadVideoById) {
      pendingLoadRef.current = { id, seconds: startSeconds, playing };
      return;
    }

    if (currentVideoIdRef.current === id) {
      if (!preservePosition) {
        playerRef.current.seekTo?.(startSeconds, true);
      }
      if (playing) {
        playerRef.current.playVideo?.();
      } else {
        playerRef.current.pauseVideo?.();
      }
      return;
    }

    currentVideoIdRef.current = id;
    setError('');
    history.current?.begin(id);

    if (playing) {
      playerRef.current.loadVideoById({
        videoId: id,
        startSeconds: Math.max(0, Math.floor(startSeconds)),
      });
    } else {
      playerRef.current.cueVideoById({
        videoId: id,
        startSeconds: Math.max(0, Math.floor(startSeconds)),
      });
    }
  }, []);

  const play = useCallback(() => {
    desiredPlayingRef.current = true;
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = 'playing';
    }
    playerRef.current?.playVideo?.();
  }, []);

  const pause = useCallback(() => {
    desiredPlayingRef.current = false;
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = 'paused';
    }
    playerRef.current?.pauseVideo?.();
  }, []);

  const seekTo = useCallback((seconds) => {
    playerRef.current?.seekTo?.(seconds, true);
  }, []);

  const setVolume = useCallback((vol) => {
    const p = playerRef.current;
    if (!p) return;
    if (vol <= 0) {
      p.mute?.();
    } else {
      p.unMute?.();
      p.setVolume?.(Math.round(vol * 100));
    }
  }, []);

  const getCurrentTime = useCallback(() => {
    return playerRef.current?.getCurrentTime?.() || 0;
  }, []);

  const getDuration = useCallback(() => {
    return playerRef.current?.getDuration?.() || 0;
  }, []);

  return {
    ready,
    error,
    retryWait: 0,
    loadVideo,
    play,
    pause,
    seekTo,
    setVolume,
    getCurrentTime,
    getDuration,
    onEndedRef,
    onPlayingRef,
    onPausedRef,
    onErrorRef,
    onProgressRef,
  };
}
