# YouTube Music Together 🎵

Ứng dụng nghe nhạc YouTube cùng bạn bè theo phòng, đồng bộ theo thời gian thực.

## Tính năng

- Đăng ký bằng tên và mật khẩu, tạo/tham gia phòng có hoặc không có mật khẩu.
- Bấm tên → Hồ sơ để sửa tên dùng đăng nhập, ảnh, tiểu sử và mật khẩu; ID riêng không đổi khi đổi tên. Tài khoản và hồ sơ lưu trong PostgreSQL.
- Tìm nhạc, quản lý hàng đợi, tự đề xuất bài tiếp theo; host điều khiển phát/dừng/tua/chuyển bài.
- Chat trong phòng, trả lời tin nhắn kèm trích dẫn.
- Shop và Túi đồ: mua Thẻ đổi ID (30 Notes), dùng một thẻ để đổi ID; không đổi tên đăng nhập.
- Nghe nền trên Android và tiếp tục nghe khi quay về trang chủ.
- Thống kê thời gian nghe, xếp hạng nghệ sĩ, tổng kết phiên và lưu lịch sử nhạc chung.

Nghe đủ 600 giây nhận 1 Note, không giới hạn mỗi ngày. Thời gian tính riêng từng tài khoản khi bộ đếm phòng chạy, giữ phần dư khi đổi phòng và không cộng trùng nhiều tab/phòng.

## Công nghệ

- `client/`: React, Vite, TailwindCSS, Socket.IO Client.
- `server/`: Node.js, Express, Socket.IO, PostgreSQL.
- Phát nhạc thông qua YouTube IFrame Player (chạy ẩn trong DOM, hiển thị ảnh thu nhỏ và giao diện tùy chỉnh).

## Chạy local

Cần Node.js ≥ 22.12 và PostgreSQL có chứng chỉ TLS hợp lệ.

Tạo database và cấu hình `server/.env`:

```dotenv
DATABASE_URL=postgresql://user:password@host:5432/ytm_together
JWT_SECRET=thay-bang-chuoi-bi-mat
PORT=3001
APP_URL=http://localhost:5173
```

Chạy backend và frontend trong hai terminal riêng:

```bash
cd server
npm install
npm run dev
```

```bash
cd client
npm install
npm run dev
```

Mở `http://localhost:5173`; backend chạy tại `http://localhost:3001`. Các bảng dữ liệu được khởi tạo khi backend khởi động.

Chi tiết: [phát nhạc nền và triển khai](NATIVE_AUDIO.md), [lịch sử nhạc](MUSIC_HISTORY.md). Dữ liệu cho trò đoán bài hát đã được chuẩn bị; trò chơi chưa triển khai.

Phiên đăng nhập dùng cookie HttpOnly (Secure khi `NODE_ENV=production`). Đánh giá bảo mật và các giới hạn còn lại: [SECURITY_REVIEW.md](SECURITY_REVIEW.md).
