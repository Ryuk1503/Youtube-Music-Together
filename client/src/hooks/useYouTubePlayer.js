import { useEffect, useRef, useState, useCallback } from 'react';

export default function useYouTubePlayer() {
  const containerRef = useRef(null);
  const playerRef = useRef(null);
  const [ready, setReady] = useState(false);
  const onEndedRef = useRef(null);

  useEffect(() => {
    // Load YouTube IFrame API script once
    if (!document.getElementById('yt-iframe-api')) {
      const tag = document.createElement('script');
      tag.id = 'yt-iframe-api';
      tag.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(tag);
    }

    const createPlayer = () => {
      if (!containerRef.current || playerRef.current) return;

      playerRef.current = new window.YT.Player(containerRef.current, {
        height: '1',
        width: '1',
        playerVars: {
          autoplay: 0,
          controls: 0,
          disablekb: 1,
          fs: 0,
          modestbranding: 1,
          rel: 0,
          origin: window.location.origin,
        },
        events: {
          onReady: () => setReady(true),
          onStateChange: (event) => {
            if (event.data === window.YT.PlayerState.ENDED) {
              onEndedRef.current?.();
            }
          },
          onError: (event) => {
            console.error('YouTube Player error:', event.data);
          },
        },
      });
    };

    if (window.YT && window.YT.Player) {
      createPlayer();
    } else {
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        prev?.();
        createPlayer();
      };
    }

    return () => {
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
    // vol: 0-1 → YouTube expects 0-100
    playerRef.current?.setVolume?.(vol * 100);
  }, []);

  const getCurrentTime = useCallback(() => {
    return playerRef.current?.getCurrentTime?.() || 0;
  }, []);

  const getDuration = useCallback(() => {
    return playerRef.current?.getDuration?.() || 0;
  }, []);

  return {
    containerRef,
    ready,
    loadVideo,
    play,
    pause,
    seekTo,
    setVolume,
    getCurrentTime,
    getDuration,
    onEndedRef,
  };
}
