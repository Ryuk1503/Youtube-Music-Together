import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import useYouTubePlayer from '../hooks/useYouTubePlayer';
import Player from '../components/Player';
import SearchPanel from '../components/SearchPanel';
import Queue from '../components/Queue';
import Chat from '../components/Chat';
import MemberList from '../components/MemberList';
import { ArrowLeft, Crown, Users } from 'lucide-react';

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
  const [songLoading, setSongLoading] = useState(false);

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

      if (res.playbackState) {
        setQueue(res.playbackState.queue);
        setCurrentIndex(res.playbackState.currentIndex);
        setCurrentSong(res.playbackState.currentSong);
        setIsPlaying(res.playbackState.isPlaying);
        setCurrentTime(res.playbackState.currentTime);
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
    console.log('Loading video:', currentSong.videoId);
    setCurrentTime(0);
    setDuration(0);
    yt.loadVideo(currentSong.videoId);
    yt.setVolume(volume);
  }, [currentSong?.videoId, yt.ready]);

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

  // Handle song ended
  useEffect(() => {
    yt.onEndedRef.current = () => {
      if (isHost && socket) socket.emit('player:ended');
    };
  }, [isHost, socket, yt.onEndedRef]);

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
    };

    const onQueueUpdated = ({ queue: q, currentIndex: ci }) => {
      setQueue(q);
      setCurrentIndex(ci);
    };

    const onChatMessage = (message) => {
      setMessages((prev) => [...prev, message]);
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
    };
  }, [socket, user]);

  // Host controls
  const handlePlay = useCallback(() => {
    if (!isHost || !socket) return;
    const ct = yt.getCurrentTime();
    yt.play();
    setIsPlaying(true);
    socket.emit('player:play', { currentTime: ct });
  }, [isHost, socket, yt]);

  const handlePause = useCallback(() => {
    if (!isHost || !socket) return;
    const ct = yt.getCurrentTime();
    yt.pause();
    setIsPlaying(false);
    socket.emit('player:pause', { currentTime: ct });
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
        if (!res.success) console.error('Failed to add to queue');
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

  return (
    <div className="h-screen flex flex-col bg-dark-900 overflow-hidden">

      {/* Header */}
      <header className="bg-dark-800 border-b border-dark-500 px-4 py-3 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={handleLeaveRoom}
            className="p-2 text-dark-200 hover:text-white hover:bg-dark-600 rounded-lg transition"
            title="Rời phòng"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-white">{room?.name}</h1>
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

        <button
          onClick={() => setShowMembers(!showMembers)}
          className="flex items-center gap-2 px-3 py-2 text-dark-100 hover:text-white hover:bg-dark-600 rounded-lg transition"
        >
          <Users size={18} />
          <span className="text-sm font-medium">{members.length}</span>
        </button>
      </header>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left column: Player + Chat */}
        <div className="w-[420px] flex flex-col border-r border-dark-500 flex-shrink-0">
          <Player
            currentSong={currentSong}
            isPlaying={isPlaying}
            currentTime={currentTime}
            duration={duration}
            volume={volume}
            isHost={isHost}
            onPlay={handlePlay}
            onPause={handlePause}
            onSeek={handleSeek}
            onNext={handleNext}
            onVolumeChange={handleVolumeChange}
            ytContainerId={yt.CONTAINER_ID}
          />
          <Chat messages={messages} onSendMessage={handleSendMessage} username={user?.username} />
        </div>

        {/* Right column: Search + Queue */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <SearchPanel onAddToQueue={handleAddToQueue} />
          <Queue
            queue={queue}
            currentIndex={currentIndex}
            onRemove={handleRemoveFromQueue}
          />
        </div>
      </div>

      {/* Members sidebar overlay */}
      {showMembers && (
        <MemberList
          members={members}
          hostId={room?.hostId}
          onClose={() => setShowMembers(false)}
        />
      )}
    </div>
  );
}
