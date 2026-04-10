import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import api from '../api';
import {
  Music,
  Plus,
  LogOut,
  Users,
  Lock,
  Unlock,
  Disc3,
  DoorOpen,
} from 'lucide-react';

export default function RoomListPage() {
  const { user, logout } = useAuth();
  const socket = useSocket();
  const navigate = useNavigate();

  const [rooms, setRooms] = useState([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [roomName, setRoomName] = useState('');
  const [roomPassword, setRoomPassword] = useState('');
  const [joinPassword, setJoinPassword] = useState('');
  const [error, setError] = useState('');

  // Fetch rooms
  const fetchRooms = async () => {
    try {
      const res = await api.get('/rooms');
      setRooms(res.data.rooms);
    } catch (err) {
      console.error('Failed to fetch rooms:', err);
    }
  };

  useEffect(() => {
    fetchRooms();
  }, []);

  // Listen for room updates
  useEffect(() => {
    if (!socket) return;
    socket.on('rooms:updated', fetchRooms);
    return () => socket.off('rooms:updated', fetchRooms);
  }, [socket]);

  // Create room
  const handleCreateRoom = () => {
    if (!socket || !roomName.trim()) return;

    socket.emit('room:create', { name: roomName.trim(), password: roomPassword || null }, (res) => {
      if (res.success) {
        setShowCreateModal(false);
        setRoomName('');
        setRoomPassword('');
        navigate(`/room/${res.room.id}`);
      }
    });
  };

  // Join room
  const handleJoinRoom = (room) => {
    if (room.hasPassword) {
      setSelectedRoom(room);
      setJoinPassword('');
      setShowPasswordModal(true);
      setError('');
    } else {
      navigate(`/room/${room.id}`);
    }
  };

  const joinWithPassword = (roomId, password) => {
    // Pass password via router state so RoomPage can use it
    setShowPasswordModal(false);
    navigate(`/room/${roomId}`, { state: { password } });
  };

  return (
    <div className="min-h-screen bg-dark-900">
      {/* Header */}
      <header className="bg-dark-800 border-b border-dark-500">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary-600/20 rounded-xl flex items-center justify-center">
              <Music className="w-5 h-5 text-primary-400" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white">YTM Together</h1>
              <p className="text-xs text-dark-200">Nghe nhạc cùng nhau</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-sm text-dark-100">
              Xin chào, <span className="text-white font-medium">{user?.username}</span>
            </span>
            <button
              onClick={logout}
              className="p-2 text-dark-200 hover:text-red-400 hover:bg-dark-600 rounded-lg transition"
              title="Đăng xuất"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-white">Danh sách phòng</h2>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white font-medium rounded-lg transition"
          >
            <Plus size={18} />
            Tạo phòng
          </button>
        </div>

        {rooms.length === 0 ? (
          <div className="text-center py-20">
            <Disc3 className="w-16 h-16 text-dark-400 mx-auto mb-4" />
            <p className="text-dark-200 text-lg">Chưa có phòng nào</p>
            <p className="text-dark-300 text-sm mt-1">Hãy tạo phòng mới để bắt đầu!</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {rooms.map((room) => (
              <div
                key={room.id}
                className="bg-dark-700 border border-dark-500 rounded-xl p-5 hover:border-primary-500/50 transition cursor-pointer group"
                onClick={() => handleJoinRoom(room)}
              >
                <div className="flex items-start justify-between mb-3">
                  <h3 className="text-white font-semibold text-lg truncate flex-1 mr-2">{room.name}</h3>
                  {room.hasPassword ? (
                    <Lock size={16} className="text-yellow-400 flex-shrink-0 mt-1" />
                  ) : (
                    <Unlock size={16} className="text-green-400 flex-shrink-0 mt-1" />
                  )}
                </div>

                {room.currentSong ? (
                  <div className="flex items-center gap-2 mb-3">
                    <img
                      src={room.currentSong.thumbnail}
                      alt=""
                      className="w-10 h-10 rounded object-cover"
                    />
                    <p className="text-sm text-dark-100 truncate">{room.currentSong.title}</p>
                  </div>
                ) : (
                  <p className="text-sm text-dark-300 mb-3 italic">Chưa phát bài nào</p>
                )}

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-dark-200 text-sm">
                    <Users size={14} />
                    <span>{room.memberCount} người</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-primary-400 text-sm font-medium opacity-0 group-hover:opacity-100 transition">
                    <DoorOpen size={14} />
                    <span>Vào phòng</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Create Room Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 px-4">
          <div className="bg-dark-700 border border-dark-500 rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h3 className="text-xl font-semibold text-white mb-4">Tạo phòng mới</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-dark-100 mb-1.5">Tên phòng *</label>
                <input
                  type="text"
                  value={roomName}
                  onChange={(e) => setRoomName(e.target.value)}
                  className="w-full px-4 py-2.5 bg-dark-600 border border-dark-400 rounded-lg text-white placeholder-dark-200 focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition"
                  placeholder="VD: Phòng nhạc của tôi"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-dark-100 mb-1.5">
                  Mật khẩu <span className="text-dark-300">(tùy chọn)</span>
                </label>
                <input
                  type="text"
                  value={roomPassword}
                  onChange={(e) => setRoomPassword(e.target.value)}
                  className="w-full px-4 py-2.5 bg-dark-600 border border-dark-400 rounded-lg text-white placeholder-dark-200 focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition"
                  placeholder="Để trống nếu không cần"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowCreateModal(false)}
                className="flex-1 py-2.5 bg-dark-500 hover:bg-dark-400 text-white rounded-lg transition"
              >
                Hủy
              </button>
              <button
                onClick={handleCreateRoom}
                disabled={!roomName.trim()}
                className="flex-1 py-2.5 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white font-medium rounded-lg transition"
              >
                Tạo phòng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Password Modal */}
      {showPasswordModal && selectedRoom && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 px-4">
          <div className="bg-dark-700 border border-dark-500 rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h3 className="text-xl font-semibold text-white mb-2">Nhập mật khẩu</h3>
            <p className="text-dark-200 text-sm mb-4">
              Phòng <span className="text-white font-medium">{selectedRoom.name}</span> yêu cầu mật khẩu
            </p>

            {error && (
              <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-lg mb-4 text-sm">
                {error}
              </div>
            )}

            <input
              type="password"
              value={joinPassword}
              onChange={(e) => setJoinPassword(e.target.value)}
              className="w-full px-4 py-2.5 bg-dark-600 border border-dark-400 rounded-lg text-white placeholder-dark-200 focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition"
              placeholder="Mật khẩu phòng"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && joinWithPassword(selectedRoom.id, joinPassword)}
            />

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowPasswordModal(false)}
                className="flex-1 py-2.5 bg-dark-500 hover:bg-dark-400 text-white rounded-lg transition"
              >
                Hủy
              </button>
              <button
                onClick={() => joinWithPassword(selectedRoom.id, joinPassword)}
                className="flex-1 py-2.5 bg-primary-600 hover:bg-primary-700 text-white font-medium rounded-lg transition"
              >
                Vào phòng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
