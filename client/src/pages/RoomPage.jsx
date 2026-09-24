import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { subscribeToRoom } from '../roomConnection';
import useYouTubePlayer from '../hooks/useYouTubePlayer';
import Player from '../components/Player';
import SearchPanel from '../components/SearchPanel';
import Queue from '../components/Queue';
import Chat from '../components/Chat';
import MemberList from '../components/MemberList';
import ListeningTimer from '../components/ListeningTimer';
import SessionSummary from '../components/SessionSummary';
import { ArrowLeft, Crown, Users, Music, ListMusic, LogOut, Play, Pause } from 'lucide-react';

export default function RoomPage({ minimized = false, onExit } = {}) {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [summary, setSummary] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem(`room-summary:${roomId}`)); } catch { return null; }
  });
  const endedRef = useRef(!!summary);
  const [ending, setEnding] = useState(false);
  const [endError, setEndError] = useState('');
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
  const [listeningTime, setListeningTime] = useState(null);
  const [timerConnected, setTimerConnected] = useState(false);
  const receiveListeningTime = (snapshot) => {
    setListeningTime({ ...snapshot, receivedAt: performance.now() });
    setTimerConnected(true);
  };
  const [autoplay, setAutoplay] = useState(true);
  const [autoplayLoading, setAutoplayLoading] = useState(false);
  const [autoplayError, setAutoplayError] = useState('');
  const [restricted, setRestricted] = useState([]);
  const [autoAdding, setAutoAdding] = useState(false);
  const [autoAddError, setAutoAddError] = useState('');
  const [mobileTab, setMobileTab] = useState('player'); // 'player' | 'queue' | 'members'
  const pendingSeekRef = useRef(0); // for syncing playback position on join
  const desiredPlayingRef = useRef(false);

  // Media Session API — lock screen controls & metadata
  useEffect(() => {
    if (!('mediaSession' in navigator) || !currentSong) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: currentSong.title,
      artist: currentSong.author || '',
      artwork: currentSong.thumbnail ? [{ src: currentSong.thumbnail, sizes: '480x360', type: 'image/jpeg' }] : [],
    });
  }, [currentSong?.videoId]);

  // Join room on mount
  useEffect(() => {
    if (!socket || endedRef.current) return;

    const password = location.state?.password || null;
    return subscribeToRoom(socket, { roomId, password }, (res) => {
      setRoom(res.room);
      setMembers(res.members);
      setMessages(res.messages || []);
      setIsHost(res.room.hostId === user.id);
      setRestricted(res.restricted || []);

      if (res.playbackState) {
        receiveListeningTime(res.playbackState.listeningTime);
        setQueue(res.playbackState.queue);
        setCurrentIndex(res.playbackState.currentIndex);
        setCurrentSong(res.playbackState.currentSong);
        setIsPlaying(res.playbackState.isPlaying);
        setCurrentTime(res.playbackState.currentTime);
        setAutoplay(res.playbackState.autoplay ?? true);
        setAutoplayLoading(res.playbackState.autoplayLoading || false);
        setAutoplayError(res.playbackState.autoplayError || '');
        pendingSeekRef.current = res.playbackState.currentTime || 0;
        desiredPlayingRef.current = res.playbackState.isPlaying;
        if (res.playbackState.currentSong) yt.loadVideo(res.playbackState.currentSong.videoId, pendingSeekRef.current, desiredPlayingRef.current, { preservePosition: true });
      }

      setLoading(false);
    }, (error) => {
      if (onExit) onExit(error);
      else navigate('/', { replace: true, state: { error } });
    });
  }, [socket, roomId, user.id, location.state?.password, navigate, onExit]);

  // Load the YouTube video when the song changes
  useEffect(() => {
    if (!currentSong || !yt.ready) return;
    const startAt = pendingSeekRef.current || 0;
    pendingSeekRef.current = 0;
    setDuration(0);
    yt.loadVideo(currentSong.videoId, startAt, desiredPlayingRef.current);
    yt.setVolume(volume);
  }, [currentSong?.videoId, yt.ready]);

  // Track the native player position for the page and system media controls
  useEffect(() => {
    if (!yt.ready) return;
    const interval = setInterval(() => {
      const ct = yt.getCurrentTime();
      const dur = yt.getDuration();
      if (ct > 0) setCurrentTime(ct);
      if (dur > 0) {
        setDuration(dur);
        try { navigator.mediaSession?.setPositionState({ duration: dur, playbackRate: 1, position: Math.min(ct, dur) }); } catch { /* Unsupported API. */ }
      }
    }, 500);
    return () => clearInterval(interval);
  }, [yt.ready, yt.getCurrentTime, yt.getDuration]);

  // Local playback events update this device; room commands are explicit actions.
  useEffect(() => {
    yt.onProgressRef.current = payload => {
      if (socket?.connected && !endedRef.current) socket.emit('listening:progress', payload);
    };
    yt.onPlayingRef.current = () => {
      if (endedRef.current) { yt.pause(); return; }
      setIsPlaying(true);
      if (isHost && socket) socket.emit('player:clock', {
        videoId: currentSong?.videoId, currentTime: yt.getCurrentTime(), duration: yt.getDuration(),
      });
    };
    yt.onPausedRef.current = () => {
      setIsPlaying(false);
      // A local interruption (screen lock, buffering, call) must not pause the room.
    };
    yt.onEndedRef.current = () => {
      setIsPlaying(false);
      if (isHost && socket) socket.emit('player:ended', { videoId: currentSong?.videoId });
    };
    yt.onErrorRef.current = (errorCode) => {
      if (isHost && socket) socket.emit('player:errorSkip', { videoId: currentSong?.videoId });
    };
  }, [currentSong?.videoId, isHost, socket, yt.onPlayingRef, yt.onPausedRef, yt.onEndedRef, yt.onErrorRef, yt]);

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
      desiredPlayingRef.current = true;
      setIsPlaying(true);
      setCurrentTime(ct);
      yt.seekTo(ct);
      yt.play();
    };

    const onPlayerPause = ({ currentTime: ct }) => {
      desiredPlayingRef.current = false;
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
      receiveListeningTime(playbackState.listeningTime);
      setQueue(playbackState.queue);
      setCurrentIndex(playbackState.currentIndex);
      setCurrentSong(playbackState.currentSong);
      setIsPlaying(playbackState.isPlaying);
      setCurrentTime(playbackState.currentTime);
      setAutoplay(playbackState.autoplay ?? true);
      setAutoplayLoading(playbackState.autoplayLoading || false);
      setAutoplayError(playbackState.autoplayError || '');
      desiredPlayingRef.current = playbackState.isPlaying;
      pendingSeekRef.current = playbackState.currentTime || 0;
      if (playbackState.currentSong) {
        yt.loadVideo(playbackState.currentSong.videoId, playbackState.currentTime || 0, playbackState.isPlaying, { preservePosition: true });
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
    const onChatUpdated = ({ messages: updated }) => setMessages(updated);

    const onAutoplayChanged = ({ autoplay: r, autoplayLoading: busy, autoplayError: error }) => {
      setAutoplay(r);
      setAutoplayLoading(!!busy);
      setAutoplayError(error || '');
    };

    const onMemberListUpdated = ({ members: m, restricted: r }) => {
      setMembers(m);
      setRestricted(r || []);
    };

    const onKicked = () => {
      alert('Bạn đã bị đuổi khỏi phòng');
      if (onExit) onExit(); else navigate('/');
    };

    const onRoomEnded = (result) => {
      endedRef.current = true;
      yt.pause();
      setCurrentSong(null);
      setIsPlaying(false);
      setTimerConnected(false);
      setLoading(false);
      setSummary(result);
      try { sessionStorage.setItem(`room-summary:${roomId}`, JSON.stringify(result)); } catch { /* Storage may be unavailable. */ }
    };
    socket.on('room:ended', onRoomEnded);
    const onTimerDisconnect = () => setTimerConnected(false);
    socket.on('room:listeningTime', receiveListeningTime);
    socket.on('disconnect', onTimerDisconnect);
    let active = true;
    const onVisible = () => {
      if (document.visibilityState !== 'visible' || !socket.connected || endedRef.current) return;
      socket.timeout(10000).emit('room:join', { roomId, password: location.state?.password || null }, (error, res) => {
        if (!active || error || endedRef.current || document.visibilityState !== 'visible') return;
        if (!res?.success) {
          const error = res?.error || 'Phòng không còn tồn tại.';
          if (onExit) onExit(error); else navigate('/', { replace: true, state: { error } });
          return;
        }
        setIsHost(res.room.hostId === user.id);
        setMembers(res.members);
        setMessages(res.messages || []);
        setRestricted(res.restricted || []);
        pendingSeekRef.current = res.playbackState.currentTime || 0;
        onSongChanged(res);
        if (!res.playbackState.isPlaying) { yt.seekTo(res.playbackState.currentTime || 0); yt.pause(); }
      });
    };
    document.addEventListener('visibilitychange', onVisible);
    socket.on('member:joined', onMemberJoined);
    socket.on('member:left', onMemberLeft);
    socket.on('room:hostChanged', onHostChanged);
    socket.on('player:play', onPlayerPlay);
    socket.on('player:pause', onPlayerPause);
    socket.on('player:seek', onPlayerSeek);
    socket.on('player:songChanged', onSongChanged);
    socket.on('queue:updated', onQueueUpdated);
    socket.on('chat:message', onChatMessage);
    socket.on('chat:updated', onChatUpdated);
    socket.on('player:autoplayChanged', onAutoplayChanged);
    socket.on('member:listUpdated', onMemberListUpdated);
    socket.on('room:kicked', onKicked);

    return () => {
      active = false;
      document.removeEventListener('visibilitychange', onVisible);
      socket.off('room:ended', onRoomEnded);
      socket.off('room:listeningTime', receiveListeningTime);
      socket.off('disconnect', onTimerDisconnect);
      socket.off('member:joined', onMemberJoined);
      socket.off('member:left', onMemberLeft);
      socket.off('room:hostChanged', onHostChanged);
      socket.off('player:play', onPlayerPlay);
      socket.off('player:pause', onPlayerPause);
      socket.off('player:seek', onPlayerSeek);
      socket.off('player:songChanged', onSongChanged);
      socket.off('queue:updated', onQueueUpdated);
      socket.off('chat:message', onChatMessage);
      socket.off('chat:updated', onChatUpdated);
      socket.off('player:autoplayChanged', onAutoplayChanged);
      socket.off('member:listUpdated', onMemberListUpdated);
      socket.off('room:kicked', onKicked);
    };
  }, [socket, user, roomId, location.state?.password, navigate, onExit]);

  // Playback controls — anyone can play/pause
  const handlePlay = useCallback(() => {
    if (!socket) return;
    socket.emit('player:play', { currentTime: yt.getCurrentTime() });
    desiredPlayingRef.current = true;
    if (currentSong) yt.loadVideo(currentSong.videoId, yt.getCurrentTime(), true);
  }, [socket, yt, currentSong]);

  const handlePause = useCallback(() => {
    if (!socket) return;
    socket.emit('player:pause', { currentTime: yt.getCurrentTime() });
    desiredPlayingRef.current = false;
    yt.pause();
  }, [socket, yt]);

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
    socket.emit('player:next', { videoId: currentSong?.videoId });
  }, [isHost, socket, currentSong?.videoId]);

  // System media controls call the same explicit actions as the page buttons.
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    const actions = {
      play: currentSong && !summary ? handlePlay : null,
      pause: currentSong && !summary ? handlePause : null,
      nexttrack: currentSong && isHost && !summary ? handleNext : null,
      seekto: currentSong && isHost && !summary ? ({ seekTime }) => {
        if (Number.isFinite(seekTime)) handleSeek(seekTime);
      } : null,
    };
    for (const [action, handler] of Object.entries(actions)) {
      try { navigator.mediaSession.setActionHandler(action, handler); } catch { /* Not supported by every browser. */ }
    }
    navigator.mediaSession.playbackState = !currentSong || summary ? 'none' : isPlaying ? 'playing' : 'paused';
    return () => {
      for (const action of Object.keys(actions)) {
        try { navigator.mediaSession.setActionHandler(action, null); } catch { /* Unsupported action. */ }
      }
    };
  }, [currentSong, summary, isPlaying, isHost, handlePlay, handlePause, handleNext, handleSeek]);

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

  const handleAutoAdd = useCallback(() => {
    if (!socket?.connected || autoAdding) return;
    setAutoAdding(true);
    setAutoAddError('');
    socket.timeout(25000).emit('queue:autoAdd', (error, res) => {
      setAutoAdding(false);
      if (error || !res?.success) {
        setAutoAddError(res?.error || 'Không thể thêm bài lúc này. Vui lòng thử lại.');
      }
    });
  }, [socket, autoAdding]);

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

  const handleToggleAutoplay = useCallback(() => {
    if (!isHost || !socket) return;
    socket.emit('player:toggleAutoplay', (res) => {
      if (!res.success) console.error('Failed to toggle autoplay');
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
    (text, replyToId) => {
      if (!socket) return;
      socket.emit('chat:message', { text, replyToId });
    },
    [socket]
  );

  const handleLeaveRoom = () => {
    if (socket) socket.emit('room:leave', { roomId });
    if (onExit) onExit(); else navigate('/');
  };

  const handleChatAction = (action, payload) => new Promise((resolve, reject) => {
    if (!socket?.connected) { reject(new Error('Chưa kết nối với phòng.')); return; }
    socket.timeout(10000).emit(`chat:${action}`, payload, (error, result) => {
      if (error || !result?.success) reject(new Error(result?.error || 'Chưa thực hiện được. Hãy thử lại.'));
      else resolve();
    });
  });

  const handleVolumeChange = useCallback((v) => {
    setVolume(v);
    yt.setVolume(v);
  }, [yt]);

  const handleEndRoom = () => {
    if (!socket?.connected || ending || !isHost) return;
    if (!window.confirm('Kết thúc phòng? Nhạc sẽ dừng và tất cả thành viên sẽ thấy tổng kết phiên nghe.')) return;
    setEnding(true);
    setEndError('');
    socket.timeout(30000).emit('room:end', (error, result) => {
      setEnding(false);
      if (error || !result?.success) setEndError(result?.error || 'Chưa thể kết thúc phòng. Vui lòng thử lại.');
    });
  };

  if (minimized) return (
    <aside aria-label="Phòng đang nghe" className="fixed bottom-0 inset-x-0 z-40 bg-dark-800 border-t border-primary-500/40 px-4 py-3 flex items-center gap-3 shadow-xl">
      <Music size={22} className="text-primary-400 shrink-0" />
      <button onClick={() => navigate(`/room/${roomId}`, { state: location.state })} className="flex-1 min-w-0 text-left" title="Quay lại phòng">
        <p className="text-white text-sm font-medium truncate">{summary ? 'Buổi nghe đã kết thúc — xem tổng kết' : currentSong?.title || room?.name || 'Đang kết nối phòng…'}</p>
        <p className="text-dark-200 text-xs truncate">{room?.name} · {summary ? 'Xem tổng kết' : 'Quay lại phòng'}</p>
      </button>
      {!summary && currentSong && <button onClick={isPlaying ? handlePause : handlePlay} className="p-2 text-white rounded-lg hover:bg-dark-600" aria-label={isPlaying ? 'Tạm dừng' : 'Phát'}>
        {isPlaying ? <Pause size={20} /> : <Play size={20} />}
      </button>}
      <button onClick={handleLeaveRoom} className="p-2 text-dark-200 hover:text-red-400 rounded-lg" title="Rời phòng" aria-label="Rời phòng"><LogOut size={20} /></button>
    </aside>
  );
  if (summary) return <SessionSummary summary={summary} onClose={handleLeaveRoom} />;

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
    autoplay,
    autoplayLoading,
    autoplayError,
    playbackError: yt.error,
    retryWait: yt.retryWait,
    onPlay: handlePlay,
    onPause: handlePause,
    onSeek: handleSeek,
    onNext: handleNext,
    onVolumeChange: handleVolumeChange,
    onToggleAutoplay: handleToggleAutoplay,
  };

  const memberListProps = {
    roomId,
    members,
    hostId: room?.hostId,
    restricted,
    isHost,
    currentUserId: user?.id,
    onKick: handleKick,
    onRestrict: handleRestrict,
    onTransferHost: handleTransferHost,
  };

  const queueProps = {
    queue, currentIndex, onRemove: handleRemoveFromQueue, onMove: handleMoveInQueue,
    onAutoAdd: handleAutoAdd, autoAdding, autoAddError,
    canAutoAdd: !!socket?.connected && !restricted.map(String).includes(String(user.id)),
  };

  return (
    <div className="h-screen flex flex-col bg-dark-900 overflow-hidden">

      {/* Header */}
      <header className="bg-dark-800 border-b border-dark-500 px-4 py-3 flex flex-wrap gap-y-2 items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => navigate('/')}
            title="Về trang chủ, tiếp tục nghe"
            aria-label="Về trang chủ, tiếp tục nghe"
            className="p-2 text-dark-200 hover:text-white hover:bg-dark-600 rounded-lg transition"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-white truncate max-w-[100px] sm:max-w-[180px] md:max-w-none">{room?.name}</h1>
              {isHost && (
                <span className="flex items-center gap-1 text-xs text-yellow-400 bg-yellow-400/10 px-2 py-0.5 rounded-full">
                  <Crown size={12} />
                  Host
                </span>
              )}
            </div>
            <p className="text-xs text-dark-200">ID: {roomId}</p>
          </div>
          {isHost && <button onClick={handleEndRoom} disabled={ending}
            className="shrink-0 text-xs sm:text-sm px-2 py-1.5 border border-red-400/40 text-red-400 hover:bg-red-400/10 rounded-lg disabled:opacity-50">
            {ending ? 'Đang kết thúc…' : 'Kết thúc'}
          </button>}
        </div>

        {/* Desktop members button */}
        <div className="flex items-center gap-2 ml-2 shrink-0">
        <button onClick={handleLeaveRoom} title="Rời phòng" aria-label="Rời phòng" className="p-2 text-dark-200 hover:text-red-400 rounded-lg"><LogOut size={18} /></button>
        <ListeningTimer snapshot={listeningTime} connected={timerConnected} />
        <span className="h-4 border-l border-dark-500" aria-hidden="true" />
        <button
          onClick={() => window.innerWidth < 768 ? setMobileTab('members') : setShowMembers(!showMembers)}
          className="flex items-center gap-2 px-1 sm:px-3 py-2 text-dark-100 hover:text-white hover:bg-dark-600 rounded-lg transition"
        >
          <Users size={18} />
          <span className="text-sm font-medium">{members.length}</span>
        </button>
        </div>
      </header>
      {endError && <p role="alert" className="text-red-400 px-4 py-2 text-sm">{endError}</p>}

      {/* ===== DESKTOP LAYOUT (md+) ===== */}
      <div className="hidden md:flex flex-1 overflow-hidden">
        <div className="w-[420px] flex flex-col border-r border-dark-500 flex-shrink-0">
          <Player {...playerProps}>
            {currentSong?.thumbnail && <img src={currentSong.thumbnail} alt="" className="w-full h-full object-cover" />}
          </Player>
          <Chat messages={messages} onSendMessage={handleSendMessage} username={user?.username} userId={user?.id} onAction={handleChatAction} />
        </div>
        <div className="flex-1 flex flex-col overflow-hidden">
          <SearchPanel onAddToQueue={handleAddToQueue} />
          <Queue {...queueProps} />
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
            {currentSong?.thumbnail && <img src={currentSong.thumbnail} alt="" className="w-full h-full object-cover" />}
          </Player>
          <Chat messages={messages} onSendMessage={handleSendMessage} username={user?.username} userId={user?.id} onAction={handleChatAction} />
        </div>

        <div className={`flex-1 flex flex-col overflow-hidden ${mobileTab === 'queue' ? '' : 'hidden'}`}>
          <SearchPanel onAddToQueue={handleAddToQueue} />
          <Queue {...queueProps} />
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
