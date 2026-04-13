import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import useYouTubePlayer from '../hooks/useYouTubePlayer';
import Player from '../components/Player';
import SearchPanel from '../components/SearchPanel';
import Queue from '../components/Queue';
import Chat from '../components/Chat';
import MemberList from '../components/MemberList';
import { ArrowLeft, Crown, Users, Music, ListMusic } from 'lucide-react';

export default function RoomPage() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const socket = useSocket();
  const yt = useYouTubePlayer();

  const [room, setRoom] = useState(null);
  const [members, setMembers] = useState([]);
  const [messages, setMessages] = useState([]);
  const [queue, setQueue] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [currentSong, setCurrentSong] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.7);
  const [isHost, setIsHost] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showMembers, setShowMembers] = useState(false);
  const [repeat, setRepeat] = useState(false);
  const [restricted, setRestricted] = useState([]);
  const [mobileTab, setMobileTab] = useState('player'); // 'player' | 'queue' | 'members'
  const pendingSeekRef = useRef(0); // for syncing playback position on join
  const desktopVideoRef = useRef(null);
  const mobileVideoRef = useRef(null);
  const ytElRef = useRef(null);

  // Create the single yt-player div and move it into the correct container
  useEffect(() => {
    if (!ytElRef.current) {
      const el = document.createElement('div');
      el.id = yt.CONTAINER_ID;
      el.style.width = '100%';
      el.style.height = '100%';
      ytElRef.current = el;
    }
    // Determine which container is visible: mobile on small screens, desktop on md+
    const isMobile = window.innerWidth < 768;
    const target = isMobile ? mobileVideoRef.current : desktopVideoRef.current;
    if (target && ytElRef.current.parentNode !== target) {
      target.appendChild(ytElRef.current);
    }
  });

  // Also move on resize (e.g. rotating phone)
  useEffect(() => {
    const onResize = () => {
      if (!ytElRef.current) return;
      const isMobile = window.innerWidth < 768;
      const target = isMobile ? mobileVideoRef.current : desktopVideoRef.current;
      if (target && ytElRef.current.parentNode !== target) {
        target.appendChild(ytElRef.current);
      }
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Request Picture-in-Picture when user leaves the page/app on mobile
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && isPlaying) {
        const iframe = yt.getIframe();
        if (!iframe) return;
        // Try to enter PiP via the video element inside the iframe
        // For same-origin, we can access iframe.contentWindow.document
        // For cross-origin (YouTube), we use requestPictureInPicture on the iframe itself (Chrome 116+)
        if (document.pictureInPictureEnabled && iframe.requestPictureInPicture) {
          iframe.requestPictureInPicture().catch(() => {});
        } else if (document.pictureInPictureEnabled) {
          // Fallback: try to get the video element
          try {
            const video = iframe.contentDocument?.querySelector('video');
            if (video && !document.pictureInPictureElement) {
              video.requestPictureInPicture().catch(() => {});
            }
          } catch (e) {
            // Cross-origin, can't access — browser may handle PiP automatically
          }
        }
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [isPlaying, yt]);

  // Join room on mount
  useEffect(() => {
    if (!socket) return;

    const password = location.state?.password || null;
    socket.emit('room:join', { roomId, password }, (res) => {
      if (!res.success) {
        alert(res.error || 'Cannot join room');
        navigate('/');
        return;
      }

      setRoom(res.room);
      setMembers(res.members);
      setMessages(res.messages || []);
      setIsHost(res.room.hostId === user.id);
      setRestricted(res.restricted || []);

      if (res.playbackState) {
        setQueue(res.playbackState.queue);
        setCurrentIndex(res.playbackState.currentIndex);
        setCurrentSong(res.playbackState.currentSong);
        setIsPlaying(res.playbackState.isPlaying);
        setCurrentTime(res.playbackState.currentTime);
        setRepeat(res.playbackState.repeat || false);
        pendingSeekRef.current = res.playbackState.currentTime || 0;
      }

      setLoading(false);
    });

    return () => {
      // Leave room when component truly unmounts (e.g. navigating away)
      // Server also handles cleanup on socket disconnect
      socket.emit('room:leave');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  // Load video into YouTube player when song changes
  useEffect(() => {
    if (!currentSong || !yt.ready) return;
    const startAt = pendingSeekRef.current || 0;
    pendingSeekRef.current = 0;
    setDuration(0);
    yt.loadVideo(currentSong.videoId, startAt);
    yt.setVolume(volume);
  }, [currentSong?.videoId, currentIndex, yt.ready]);

  // Time tracking from YouTube player
  useEffect(() => {
    if (!yt.ready) return;
    const interval = setInterval(() => {
      const ct = yt.getCurrentTime();
      const dur = yt.getDuration();
      if (ct > 0) setCurrentTime(ct);
      if (dur > 0) setDuration(dur);
    }, 500);
    return () => clearInterval(interval);
  }, [yt.ready, yt.getCurrentTime, yt.getDuration]);

  // Sync isPlaying state from YouTube player state changes
  useEffect(() => {
    yt.onPlayingRef.current = () => {
      setIsPlaying(true);
      // Host: sync actual playback state to server (covers auto-play from loadVideoById)
      if (isHost && socket) {
        const ct = yt.getCurrentTime();
        socket.emit('player:play', { currentTime: ct });
      }
    };
    yt.onPausedRef.current = () => {
      setIsPlaying(false);
      if (isHost && socket) {
        const ct = yt.getCurrentTime();
        socket.emit('player:pause', { currentTime: ct });
      }
    };
    yt.onEndedRef.current = () => {
      setIsPlaying(false);
      if (isHost && socket) socket.emit('player:ended');
    };
    yt.onErrorRef.current = (errorCode) => {
      if (isHost && socket) socket.emit('player:errorSkip');
    };
  }, [isHost, socket, yt.onPlayingRef, yt.onPausedRef, yt.onEndedRef, yt.onErrorRef, yt]);

  // Socket event listeners
  useEffect(() => {
    if (!socket) return;

    const onMemberJoined = (member) => {
      setMembers((prev) => [...prev.filter((m) => m.userId !== member.userId), member]);
    };

    const onMemberLeft = (member) => {
      setMembers((prev) => prev.filter((m) => m.userId !== member.userId));
    };

    const onHostChanged = ({ hostId }) => {
      setIsHost(hostId === user.id);
      setRoom((prev) => (prev ? { ...prev, hostId } : prev));
    };

    const onPlayerPlay = ({ currentTime: ct }) => {
      setIsPlaying(true);
      setCurrentTime(ct);
      yt.seekTo(ct);
      yt.play();
    };

    const onPlayerPause = ({ currentTime: ct }) => {
      setIsPlaying(false);
      setCurrentTime(ct);
      yt.seekTo(ct);
      yt.pause();
    };

    const onPlayerSeek = ({ currentTime: ct }) => {
      setCurrentTime(ct);
      yt.seekTo(ct);
    };

    const onSongChanged = ({ playbackState }) => {
      setQueue(playbackState.queue);
      setCurrentIndex(playbackState.currentIndex);
      setCurrentSong(playbackState.currentSong);
      setIsPlaying(playbackState.isPlaying);
      setCurrentTime(playbackState.currentTime);
      // Directly load video for reliability (don't rely solely on effect)
      if (playbackState.currentSong) {
        yt.loadVideo(playbackState.currentSong.videoId);
        yt.setVolume(volume);
      }
    };

    const onQueueUpdated = ({ queue: q, currentIndex: ci }) => {
      setQueue(q);
      setCurrentIndex(ci);
    };

    const onChatMessage = (message) => {
      setMessages((prev) => [...prev, message]);
    };

    const onRepeatChanged = ({ repeat: r }) => {
      setRepeat(r);
    };

    const onMemberListUpdated = ({ members: m, restricted: r }) => {
      setMembers(m);
      setRestricted(r || []);
    };

    const onKicked = () => {
      alert('Bạn đã bị đuổi khỏi phòng');
      navigate('/');
    };

    socket.on('member:joined', onMemberJoined);
    socket.on('member:left', onMemberLeft);
    socket.on('room:hostChanged', onHostChanged);
    socket.on('player:play', onPlayerPlay);
    socket.on('player:pause', onPlayerPause);
    socket.on('player:seek', onPlayerSeek);
    socket.on('player:songChanged', onSongChanged);
    socket.on('queue:updated', onQueueUpdated);
    socket.on('chat:message', onChatMessage);
    socket.on('player:repeatChanged', onRepeatChanged);
    socket.on('member:listUpdated', onMemberListUpdated);
    socket.on('room:kicked', onKicked);

    return () => {
      socket.off('member:joined', onMemberJoined);
      socket.off('member:left', onMemberLeft);
      socket.off('room:hostChanged', onHostChanged);
      socket.off('player:play', onPlayerPlay);
      socket.off('player:pause', onPlayerPause);
      socket.off('player:seek', onPlayerSeek);
      socket.off('player:songChanged', onSongChanged);
      socket.off('queue:updated', onQueueUpdated);
      socket.off('chat:message', onChatMessage);
      socket.off('player:repeatChanged', onRepeatChanged);
      socket.off('member:listUpdated', onMemberListUpdated);
      socket.off('room:kicked', onKicked);
    };
  }, [socket, user]);

  // Host controls
  const handlePlay = useCallback(() => {
    if (!isHost || !socket) return;
    yt.play();
    // Server sync handled by onPlayingRef callback
  }, [isHost, socket, yt]);

  const handlePause = useCallback(() => {
    if (!isHost || !socket) return;
    yt.pause();
    // Server sync handled by onPausedRef callback
  }, [isHost, socket, yt]);

  const handleSeek = useCallback(
    (time) => {
      if (!isHost || !socket) return;
      yt.seekTo(time);
      setCurrentTime(time);
      socket.emit('player:seek', { currentTime: time });
    },
    [isHost, socket, yt]
  );

  const handleNext = useCallback(() => {
    if (!isHost || !socket) return;
    socket.emit('player:next');
  }, [isHost, socket]);

  const handleAddToQueue = useCallback(
    (song) => {
      if (!socket) return;
      socket.emit('queue:add', song, (res) => {
        if (!res.success) {
          alert(res.error || 'Không thể thêm bài hát');
        }
      });
    },
    [socket]
  );

  const handleRemoveFromQueue = useCallback(
    (index) => {
      if (!socket) return;
      socket.emit('queue:remove', { index }, (res) => {
        if (!res.success) console.error('Failed to remove from queue');
      });
    },
    [socket]
  );

  const handleMoveInQueue = useCallback(
    (fromIndex, toIndex) => {
      if (!socket) return;
      socket.emit('queue:move', { fromIndex, toIndex }, (res) => {
        if (!res.success) console.error('Failed to move in queue');
      });
    },
    [socket]
  );

  const handleToggleRepeat = useCallback(() => {
    if (!isHost || !socket) return;
    socket.emit('player:toggleRepeat', (res) => {
      if (!res.success) console.error('Failed to toggle repeat');
    });
  }, [isHost, socket]);

  const handleKick = useCallback(
    (targetUserId) => {
      if (!isHost || !socket) return;
      socket.emit('member:kick', { targetUserId }, (res) => {
        if (!res.success) console.error('Failed to kick');
      });
    },
    [isHost, socket]
  );

  const handleRestrict = useCallback(
    (targetUserId) => {
      if (!isHost || !socket) return;
      socket.emit('member:restrict', { targetUserId }, (res) => {
        if (!res.success) console.error('Failed to restrict');
      });
    },
    [isHost, socket]
  );

  const handleTransferHost = useCallback(
    (targetUserId) => {
      if (!isHost || !socket) return;
      if (!confirm('Bạn có chắc muốn trao quyền Host?')) return;
      socket.emit('member:transferHost', { targetUserId }, (res) => {
        if (!res.success) console.error('Failed to transfer host');
      });
    },
    [isHost, socket]
  );

  const handleSendMessage = useCallback(
    (text) => {
      if (!socket) return;
      socket.emit('chat:message', { text });
    },
    [socket]
  );

  const handleLeaveRoom = () => {
    if (socket) socket.emit('room:leave');
    navigate('/');
  };

  const handleVolumeChange = useCallback((v) => {
    setVolume(v);
    yt.setVolume(v);
  }, [yt]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-dark-900">
        <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const playerProps = {
    currentSong,
    isPlaying,
    currentTime,
    duration,
    volume,
    isHost,
    repeat,
    onPlay: handlePlay,
    onPause: handlePause,
    onSeek: handleSeek,
    onNext: handleNext,
    onVolumeChange: handleVolumeChange,
    onToggleRepeat: handleToggleRepeat,
  };

  const memberListProps = {
    members,
    hostId: room?.hostId,
    restricted,
    isHost,
    currentUserId: user?.id,
    onKick: handleKick,
    onRestrict: handleRestrict,
    onTransferHost: handleTransferHost,
  };

  return (
    <div className="h-screen flex flex-col bg-dark-900 overflow-hidden">

      {/* Header */}
      <header className="bg-dark-800 border-b border-dark-500 px-4 py-3 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={handleLeaveRoom}
            className="p-2 text-dark-200 hover:text-white hover:bg-dark-600 rounded-lg transition"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-white truncate max-w-[180px] md:max-w-none">{room?.name}</h1>
              {isHost && (
                <span className="flex items-center gap-1 text-xs text-yellow-400 bg-yellow-400/10 px-2 py-0.5 rounded-full">
                  <Crown size={12} />
                  Host
                </span>
              )}
            </div>
            <p className="text-xs text-dark-200">ID: {roomId}</p>
          </div>
        </div>

        {/* Desktop members button */}
        <button
          onClick={() => setShowMembers(!showMembers)}
          className="hidden md:flex items-center gap-2 px-3 py-2 text-dark-100 hover:text-white hover:bg-dark-600 rounded-lg transition"
        >
          <Users size={18} />
          <span className="text-sm font-medium">{members.length}</span>
        </button>
      </header>

      {/* ===== DESKTOP LAYOUT (md+) ===== */}
      <div className="hidden md:flex flex-1 overflow-hidden">
        <div className="w-[420px] flex flex-col border-r border-dark-500 flex-shrink-0">
          <Player {...playerProps}>
            <div ref={desktopVideoRef} className="w-full h-full" />
          </Player>
          <Chat messages={messages} onSendMessage={handleSendMessage} username={user?.username} />
        </div>
        <div className="flex-1 flex flex-col overflow-hidden">
          <SearchPanel onAddToQueue={handleAddToQueue} />
          <Queue queue={queue} currentIndex={currentIndex} onRemove={handleRemoveFromQueue} onMove={handleMoveInQueue} />
        </div>
      </div>

      {showMembers && (
        <div className="hidden md:block">
          <MemberList {...memberListProps} onClose={() => setShowMembers(false)} />
        </div>
      )}

      {/* ===== MOBILE LAYOUT (<md) ===== */}
      <div className="flex md:hidden flex-1 flex-col overflow-hidden">
        <div className={`flex-1 flex flex-col overflow-hidden ${mobileTab === 'player' ? '' : 'hidden'}`}>
          <Player {...playerProps}>
            <div ref={mobileVideoRef} className="w-full h-full" />
          </Player>
          <Chat messages={messages} onSendMessage={handleSendMessage} username={user?.username} />
        </div>

        <div className={`flex-1 flex flex-col overflow-hidden ${mobileTab === 'queue' ? '' : 'hidden'}`}>
          <SearchPanel onAddToQueue={handleAddToQueue} />
          <Queue queue={queue} currentIndex={currentIndex} onRemove={handleRemoveFromQueue} onMove={handleMoveInQueue} />
        </div>

        <div className={`flex-1 flex flex-col overflow-hidden ${mobileTab === 'members' ? '' : 'hidden'}`}>
          <MemberList {...memberListProps} inline />
        </div>

        {/* Mobile bottom tab bar */}
        <nav className="flex-shrink-0 bg-dark-800 border-t border-dark-500 flex">
          <button
            onClick={() => setMobileTab('player')}
            className={`flex-1 flex flex-col items-center gap-1 py-3 transition ${
              mobileTab === 'player' ? 'text-primary-400' : 'text-dark-300'
            }`}
          >
            <Music size={20} />
            <span className="text-[10px] font-medium">Phát nhạc</span>
          </button>
          <button
            onClick={() => setMobileTab('queue')}
            className={`flex-1 flex flex-col items-center gap-1 py-3 transition ${
              mobileTab === 'queue' ? 'text-primary-400' : 'text-dark-300'
            }`}
          >
            <ListMusic size={20} />
            <span className="text-[10px] font-medium">Hàng đợi</span>
          </button>
          <button
            onClick={() => setMobileTab('members')}
            className={`flex-1 flex flex-col items-center gap-1 py-3 transition ${
              mobileTab === 'members' ? 'text-primary-400' : 'text-dark-300'
            }`}
          >
            <Users size={20} />
            <span className="text-[10px] font-medium">{members.length} TV</span>
          </button>
        </nav>
      </div>
    </div>
  );
}
