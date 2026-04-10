import { useEffect, useRef, useState, useCallback } from 'react';

const CONTAINER_ID = 'yt-player';

export default function useYouTubePlayer() {
  const playerRef = useRef(null);
  const [ready, setReady] = useState(false);
  const onEndedRef = useRef(null);
  const onPlayingRef = useRef(null);
  const onPausedRef = useRef(null);

  useEffect(() => {
    let destroyed = false;

    // Load YouTube IFrame API script once
    if (!document.getElementById('yt-iframe-api')) {
      const tag = document.createElement('script');
      tag.id = 'yt-iframe-api';
      tag.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(tag);
    }

    const createPlayer = () => {
      if (destroyed || playerRef.current) return;
      const el = document.getElementById(CONTAINER_ID);
      if (!el) {
        // DOM not ready, retry next frame
        requestAnimationFrame(createPlayer);
        return;
      }

      playerRef.current = new window.YT.Player(CONTAINER_ID, {
        height: '100%',
        width: '100%',
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
          onReady: () => {
            console.log('✅ YouTube player ready');
            setReady(true);
          },
          onStateChange: (event) => {
            if (event.data === window.YT.PlayerState.PLAYING) {
              onPlayingRef.current?.();
            } else if (event.data === window.YT.PlayerState.PAUSED) {
              onPausedRef.current?.();
            } else if (event.data === window.YT.PlayerState.ENDED) {
              onEndedRef.current?.();
            }
          },
          onError: (event) => {
            console.error('YT Player error code:', event.data);
          },
        },
      });
    };

    if (window.YT && window.YT.Player) {
      requestAnimationFrame(createPlayer);
    } else {
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        prev?.();
        createPlayer();
      };
    }

    return () => {
      destroyed = true;
      if (playerRef.current && playerRef.current.destroy) {
        playerRef.current.destroy();
        playerRef.current = null;
      }
    };
  }, []);

  const loadVideo = useCallback((videoId, startSeconds = 0) => {
    if (playerRef.current && ready) {
      playerRef.current.loadVideoById({ videoId, startSeconds });
    }
  }, [ready]);

  const cueVideo = useCallback((videoId) => {
    if (playerRef.current && ready) {
      playerRef.current.cueVideoById(videoId);
    }
  }, [ready]);

  const play = useCallback(() => {
    playerRef.current?.playVideo?.();
  }, []);

  const pause = useCallback(() => {
    playerRef.current?.pauseVideo?.();
  }, []);

  const seekTo = useCallback((seconds) => {
    playerRef.current?.seekTo?.(seconds, true);
  }, []);

  const setVolume = useCallback((vol) => {
    playerRef.current?.setVolume?.(vol * 100);
  }, []);

  const getCurrentTime = useCallback(() => {
    return playerRef.current?.getCurrentTime?.() || 0;
  }, []);

  const getDuration = useCallback(() => {
    return playerRef.current?.getDuration?.() || 0;
  }, []);

  return {
    ready,
    loadVideo,
    cueVideo,
    play,
    pause,
    seekTo,
    setVolume,
    getCurrentTime,
    getDuration,
    onEndedRef,
    onPlayingRef,
    onPausedRef,
    CONTAINER_ID,
  };
}
