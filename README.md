# YouTube Music Together 🎵

Nghe nhạc YouTube cùng bạn bè trong thời gian thực.

## Tính năng

- **Đăng ký / Đăng nhập** với JWT
- **Tạo & tham gia phòng** (có/không mật khẩu)
- **Tìm kiếm nhạc** từ YouTube (ưu tiên khu vực VN)
- **Player đồng bộ** - Play, Pause, Seek, Next đồng bộ giữa tất cả thành viên
- **Hàng đợi (Queue)** - Thêm/xóa bài hát
- **Chat** trong phòng
- **Phân quyền Host** - Chỉ host mới điều khiển playback

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React + Vite + TailwindCSS + Lucide Icons |
| Backend | Node.js + Express + Socket.IO |
| Database | PostgreSQL |
| YouTube | ytsr (search) + @distube/ytdl-core (audio) |

## Cài đặt

### 1. Yêu cầu
- Node.js >= 18
- PostgreSQL

### 2. Database
Tạo database PostgreSQL:
```sql
CREATE DATABASE ytm_together;
```

### 3. Backend
```bash
cd server
npm install
# Chỉnh sửa file .env nếu cần
npm run dev
```

Server chạy tại: `http://localhost:3001`

### 4. Frontend
```bash
cd client
npm install
npm run dev
```

Client chạy tại: `http://localhost:5173`

## Cấu trúc thư mục

```
├── server/
│   ├── src/
│   │   ├── index.js           # Entry point
│   │   ├── config/db.js       # PostgreSQL connection
│   │   ├── middleware/auth.js  # JWT middleware
│   │   ├── routes/
│   │   │   ├── auth.js        # Register/Login API
│   │   │   ├── rooms.js       # Room listing API
│   │   │   └── youtube.js     # Search + Audio stream
│   │   ├── socket/handler.js  # Socket.IO events
│   │   └── utils/roomManager.js
│   └── .env
├── client/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── context/           # Auth + Socket providers
│   │   ├── pages/             # Login, Register, RoomList, Room
│   │   └── components/        # Player, Search, Queue, Chat
│   └── index.html
└── README.md
```
