# PROJECT_ARCHITECTURE.md — Bản đồ kiến trúc YouTube Music Together

> File này là **bản đồ tra cứu kiến trúc** cho AI coding agent và lập trình viên.
> Cách dùng đúng: đọc `WORKING_GUIDELINES.md` trước → tra feature/file cần sửa ở đây → mở file trực tiếp, KHÔNG quét repository.
> **Code là nguồn chân lý.** Nếu mô tả ở đây lệch với code, hãy tin code, xác minh lại, rồi cập nhật file này.
> Cập nhật lần cuối: 2026-09-23.

---

## 1. Tổng quan hệ thống

Web app nghe nhạc YouTube cùng nhau: tạo phòng, đồng bộ playback real-time, chat, thưởng Notes theo thời gian nghe, Shop đổi ID, lịch sử nghe nhạc toàn cục và BXH nghệ sĩ.

**Mô hình triển khai:** MỘT process Node.js (Express + Socket.IO) serve cả REST API và static build của client. Client build xuất thẳng vào `server/public` rồi server serve kèm SPA fallback. Deploy trên alwaysdata (xem `AGENTS.md`).

| Thành phần | Công nghệ |
|---|---|
| Backend | Node.js **CommonJS** (`require`), Express 4, Socket.IO 4, `pg` (PostgreSQL), `bcryptjs` (chỉ verify mật khẩu reset database) |
| Frontend | React 18 + Vite 7 (**ESM**), react-router-dom 7, TailwindCSS 3, axios, socket.io-client, lucide-react, YouTube IFrame Player API |
| Tests | `node:test` (built-in), file `*.test.js` nằm **cạnh module** (`server/src/**/*.test.js`, `client/src/**/*.test.js`) |

**Ranh giới thư mục:**

| Thư mục | Vai trò |
|---|---|
| `server/src/` | Backend: `index.js` (entry), `routes/`, `middleware/`, `socket/`, `utils/`, `config/` |
| `client/src/` | SPA React: `pages/`, `components/`, `hooks/`, `context/`, `api/` |
| `server/public/` | **Build output** của client — KHÔNG sửa trực tiếp, regenerate bằng `npm run build` ở `client/` |
| `.deploy-local/` | Artifacts triển khai/benchmark riêng tư — không thuộc kiến trúc app |

**Environment variables (server):**

| Biến | Dùng ở | Ý nghĩa |
|---|---|---|
| `DATABASE_URL` | `config/db.js` | PostgreSQL connection string |
| `DATABASE_RESET_PASSWORD_HASH` | `utils/resetLeaderboard.js` | bcrypt hash mật khẩu xóa database |
| `APP_URL`, `RENDER_EXTERNAL_URL` | `index.js`, `middleware/auth.js` | Origin được phép |
| `PORT`, `HOST`/`IP`, `NODE_ENV` | `index.js` | Production: `NODE_ENV=production` đổi tên cookie sang `__Host-ytm_session` |
| `TEST_DATABASE_URL` | các test `*.db.test.js` | DB test riêng; thiếu thì test tự skip |

**Chạy local:** `server/`: `npm install && npm run dev` (port 3001). `client/`: `npm install && npm run dev` (Vite, port 5173). Chi tiết trong `README.md`.

**Tài liệu chuyên đề hiện có (đọc khi đụng feature tương ứng):**
`README.md` (tổng quan), `NATIVE_AUDIO.md` (audio pipeline + lịch sử tối ưu chi tiết), `MUSIC_HISTORY.md` (lịch sử nghe + BXH + reset + album tracks), `SECURITY_REVIEW.md` (đợt rà soát bảo mật 2026-09-22), `AGENTS.md` (quy tắc deploy alwaysdata), `WORKING_GUIDELINES.md` (quy trình làm việc).

---

## 2. Nhóm Auth & Tài khoản

### 2.1 Đăng nhập / đăng ký / session

| File | Symbol quan trọng |
|---|---|
| `server/src/routes/auth.js` | `POST /api/auth/register` (pg_advisory_xact_lock 73120412; tạo `accounts` + `account_profiles` + session + audit event; `public_id` từ sequence `account_public_id_seq`, dạng `ytmt-NN`), `POST /api/auth/login` (FOR UPDATE + recheck password hash), `GET /api/auth/me`, `POST /api/auth/logout` (xóa session + disconnect socket), `POST /api/auth/password` (đổi mật khẩu, thu hồi mọi session cũ, cấp cookie mới) |
| `server/src/middleware/auth.js` | `sessionToken` (parse cookie 64-hex), `resolveSession` (JOIN `account_sessions` + `accounts`), `createSession` (randomBytes(32); DB chỉ lưu sha256 `token_hash`), `csrfGuard` (header `X-YTM-Request: 1` + sec-fetch-site), `allowedSocketRequest` (check origin), `authenticateToken`, `requireAdmin`, `limitAuth` (IP 100/15 phút, per-name 20/15 phút), `disconnectAccount`, `publicUser` |
| `server/src/utils/passwords.js` | `hashPassword` / `verifyPassword` — scrypt N=32768, r=8, p=3, format `scrypt$N$r$p$salt$hash`, tối đa 2 derive đồng thời, `timingSafeEqual` |

Cookie session: `__Host-ytm_session` (production) / `ytm_session` (dev) — HttpOnly, Secure, SameSite=Lax, maxAge 7 ngày. **Không dùng JWT cho auth** (JWT chỉ còn cho audio ticket).

| File (client) | Symbol quan trọng |
|---|---|
| `client/src/pages/GuestPage.jsx` | Form login/register hợp nhất (mode state), gọi `authenticate` |
| `client/src/context/AuthContext.jsx` | bootstrap `/auth/me`, `authenticate`, `logout`, `changePassword`, `updateUser`, nghe event `session-expired` |
| `client/src/api/index.js` | axios instance, baseURL `/api`, header `X-YTM-Request: '1'`; interceptor 401 → dispatch `session-expired` (trừ auth endpoints) |
| `client/src/context/SocketContext.jsx` | `io()` withCredentials; production dùng `window.location.origin`, dev `localhost:3001`; `session-renewed` → reconnect; xử lý `account:idUpdated` |

**Flow auth (điểm cần nhớ):**
1. Login/register → server set HttpOnly cookie + trả user public.
2. Mọi REST call mang cookie + header `X-YTM-Request` (CSRF). 401 → AuthContext logout.
3. Socket.IO: `io.use` (trong `socket/handler.js`) check origin + `resolveSession` từ handshake headers; **mỗi event** được re-auth qua `socket.use` + rate limit 240 events/phút.
4. Trang `/login`, `/register` redirect về `/` (App.jsx); đăng nhập hiển thị GuestPage khi chưa auth.

### 2.2 Hồ sơ cá nhân

| File | Symbol quan trọng |
|---|---|
| `server/src/routes/guest.js` | `GET/PATCH /api/guest/profile` — whitelist field: `display_name` (≤30), `bio` (≤500), `avatar_url`/`cover_url` (webp data-URI ≤90000 bytes hoặc https URL). PATCH `display_name` đồng bộ `accounts.username` + `name_key` và emit `member:listUpdated` |
| `client/src/pages/ProfilePage.jsx` | GET/PATCH profile, hiển thị notes, icon Crown cho admin, đổi mật khẩu qua dialog |
| `client/src/components/ProfileImagePicker.jsx` | `prepareImage` — resize bằng canvas (512px avatar / 1200px cover) → webp data-URI ≤90000 bytes **trước khi gửi** |
| `client/src/components/AccountNotice.jsx` | `<AccountNotice>` + `useAccountDialog` (AccountContext) — dialog đổi mật khẩu, gọi `changePassword` |

### 2.3 Xem hồ sơ thành viên trong phòng

| File | Symbol quan trọng |
|---|---|
| `server/src/routes/rooms.js` | `GET /api/rooms/:roomId/members/:userId/profile` — chỉ khi người xem đang là thành viên cùng phòng |
| `client/src/components/MemberProfileCard.jsx` | Portal hover-card / modal (`<dialog>`), nghe `notes:updated` để update notes |

**Bảng DB (schema tạo trong `server/src/utils/accounts.js`):** `accounts`, `account_profiles`, `account_sessions`, `account_auth_limits`, `account_events` (audit), `account_note_progress`, `account_note_rewards`, `account_inventory`, `account_shop_actions`. Trigger `preserve_fixed_notes` chặn ghi đè `fixed_notes`.

---

## 3. Nhóm Phòng nghe nhạc & Realtime sync

### 3.1 Vòng đời phòng

| File | Symbol quan trọng |
|---|---|
| `server/src/utils/roomManager.js` | `rooms` Map (**in-memory**), `createRoom` (id = uuid slice 8; `sessionId` uuid), `joinRoom` (phòng trống có người vào lại → lên host, clear `emptyRoomTimer`), `leaveRoom` (EMPTY_ROOM_TTL **10 phút** rồi xóa phòng; tự chuyển host cho member đầu), `deleteRoom`, `findRoomBySocket` (linear scan), `getPlaybackState` (ngoại suy `currentTime` theo wall-clock khi đang play), `addToQueue` (MAX_QUEUE_SIZE 200, trim prefix đã phát, chặn restricted, tự phát bài đầu), `removeFromQueue` / `moveInQueue` (chỉ upcoming), `kickMember`, `restrictMember`, `unrestrictMember`, `transferHost`, `isRestricted` |
| `server/src/socket/handler.js` | `setupSocket(io, deps)` — toàn bộ socket events; guard `room.ending` chỉ cho `room:leave`; `earlyAutoplayTimer` chạy mỗi 1 giây |
| `client/src/pages/RoomListPage.jsx` | Danh sách phòng (GET `/api/rooms` + `rooms:updated`), modal tạo phòng (`room:create`, timeout 10s), modal mật khẩu → navigate kèm `state.password` |
| `client/src/roomConnection.js` | `subscribeToRoom` — join khi (re)connect, chống stale reply, timeout 15s, cleanup `room:leave` |
| `client/src/pages/RoomPage.jsx` | **Trung tâm client (≈655 dòng)**: state room/members/messages/queue/playback/autoplay/restricted; join qua `subscribeToRoom`; toàn bộ socket listeners; host emit `player:clock`/`player:ended`/`player:errorSkip`; MediaSession API; visibilitychange → rejoin; minimized bottom bar; summary qua `sessionStorage['room-summary:${roomId}']` |

⚠️ **Room state hoàn toàn in-memory:** restart process mất phòng (phòng trống được giữ 10 phút để guest quay lại); không thể scale nhiều process.

### 3.2 Đồng bộ playback (flow phức tạp nhất)

- **Server là truth:** `room.currentTime` + `room.lastSyncedAt`; `getPlaybackState()` ngoại suy theo wall-clock khi `isPlaying`.
- **Host client** emit `player:clock` (kèm `duration` → `room.audioClock`) định kỳ + khi play/resume/seek; server `updatePlaybackState`.
- **Guest** nhận `player:play` / `player:pause` / `player:seek` + snapshot state khi join. RoomPage bảo toàn position khi cùng source khỏe đang play (chi tiết: mục "Preserve playback on returning to the page" trong `NATIVE_AUDIO.md`).
- **Phân quyền:** ai cũng `player:play`/`player:pause`; **host-only:** `player:seek`, `player:next`/`player:ended`/`player:errorSkip`, `player:toggleAutoplay`, `room:end`, `member:kick`/`member:restrict`/`member:transferHost`.
- **Dual-mount navigation:** `client/src/App.jsx` — `ListeningRoutes` giữ RoomPage mounted (minimized bottom bar) khi route trang chủ hiển thị; `<audio>` element persistent gắn vào `document.body` (tạo trong `useAudioPlayer`) nên nhạc không bị cắt khi chuyển route.

### 3.3 Thành viên & moderation

- Server: `member:kick` / `member:restrict` / `member:transferHost` (handler.js) → `room:kicked`, `member:listUpdated`, `room:hostChanged`, `member:joined`, `member:left`.
- Client: `client/src/components/MemberList.jsx` (nút kick/restrict/transfer chỉ hiện với host, hover mở MemberProfileCard).

### 3.4 Chat trong phòng

| File | Symbol quan trọng |
|---|---|
| `server/src/socket/handler.js` | `chat:message` (gắn reply, validate), `chat:edit` / `chat:delete` / `chat:heart` (chỉ người gửi; đăng ký theo loop) → emit `chat:message` / `chat:updated` |
| `client/src/components/Chat.jsx` | Reply, edit inline, delete, heart, gộp tin nhắn liên tiếp cùng người trong 3 phút |

### 3.5 Bảng socket events (tra cứu nhanh)

**Client → Server:** `room:create`, `room:join`, `room:leave`, `room:end`, `player:clock`, `player:play`, `player:pause`, `player:seek`, `player:next`, `player:ended`, `player:errorSkip`, `player:toggleAutoplay`, `queue:add`, `queue:remove`, `queue:move`, `queue:autoAdd`, `member:kick`, `member:restrict`, `member:transferHost`, `chat:message`, `chat:edit`, `chat:delete`, `chat:heart`, `listening:progress`.

**Server → Client:** `rooms:updated`, `member:joined`, `member:left`, `member:listUpdated`, `room:kicked`, `room:hostChanged`, `room:ended`, `room:listeningTime`, `player:play`, `player:pause`, `player:seek`, `player:songChanged`, `player:autoplayChanged`, `queue:updated`, `chat:message`, `chat:updated`, `notes:updated` (từ `index.js`/`routes/shop.js`), `inventory:updated`, `account:idUpdated`, `leaderboard:updated` (coalesced 1s sau history commit; tức thì khi room:end / reset).

---

## 4. Nhóm Hàng đợi & Autoplay

### 4.1 Tìm kiếm YouTube

| File | Symbol quan trọng |
|---|---|
| `server/src/routes/youtube.js` | `GET /api/youtube/search?q=` → `searchYouTube` |
| `server/src/utils/youtubeSearch.js` | `searchYouTube` (hl=vi, gl=VN), `parseSearchResults` (top 10, lọc ad/shorts/channel), `extractInitialData` (parser brace-depth) |
| `server/src/utils/youtubeHttp.js` | `fetchSearchPage` — **IPv4 bắt buộc** (family:4), cap response 8MB |
| `client/src/components/SearchPanel.jsx` | Gọi `/youtube/search`, click kết quả → `onAddToQueue` → RoomPage emit `queue:add` |

### 4.2 Autoplay engine

| File | Symbol quan trọng |
|---|---|
| `server/src/utils/autoplay.js` | `prepareQueueEnd` (early autoplay: timer 1s của handler.js gọi; còn ≤10s cuối bài + autoplay bật + chưa có request chạy → lấy 1 recommendation, append KHÔNG đổi bài hiện tại, prefetch source), `advanceRoom` (ưu tiên queue manual; guard `autoplayRequest`; cap 3 thất bại → `autoplayError`), `cancelAutoplay`, `durationSeconds` |
| `server/src/utils/recommendations.js` | `getRecommendations` (scrape ytInitialData của watch page, cache 5 phút / 50 entries), `parseRecommendations` (compactVideoRenderer + lockupViewModel, lọc ad/LIVE) |
| `server/src/utils/artistPreference.js` | `artistKey` (NFKD, bỏ dấu, đ→d, strip suffix Official/Topic/VEVO...), `rememberArtist` (room.sessionArtists), `chooseRecommendation` (3 nhóm disjunctive: nghệ sĩ bài hiện tại / đã nghe trong phiên / còn lại → random) |
| `server/src/utils/automaticQueue.js` | `addAutomaticSong` (nút "Tự động thêm": lock `autoAdding`, race checks) → `queue:autoAdd` |

**Flow autoplay:** `[timer 1s] prepareQueueEnd → recommend(videoId) → addToQueue(recommended) + prefetchAudio` — kết quả trễ được recheck trước khi insert; pause/seek/tắt autoplay/end/phòng trống hủy pending.

---

## 5. Nhóm Player & Phát nhạc (YouTube IFrame API)
 
Phát trực tiếp từ YouTube thông qua YouTube IFrame Player API ở client. Server không trích xuất hay stream audio (giải quyết triệt để lỗi 429 / bot verification / PO token).

### 5.1 Player phía client

| File | Symbol quan trọng |
|---|---|
| `client/src/hooks/useYouTubePlayer.js` | Tạo persistent iframe slot `#yt-player-container` (gắn vào `document.body` với style ẩn, kích thước $200\times 200\text{ px}$, opacity 0.001, z-index -9999 để không bị Chrome throttle); nạp script `https://www.youtube.com/iframe_api`; `loadVideo(id, startSeconds, playing, { preservePosition })`, `play`, `pause`, `seekTo`, `setVolume`, `getCurrentTime`, `getDuration`; tích hợp `history = createListeningProgress` tự động sample mỗi 1 giây để ghi nhận Notes và lịch sử nghe nhạc |
| `client/src/components/Player.jsx` | UI player thuần túy hiển thị ảnh thu nhỏ (thumbnail) chất lượng cao, sóng nhạc, seek bar, volume, nút play/pause (mọi người), next + autoplay toggle (host-only) |
| `client/src/pages/RoomPage.jsx` | Trung tâm điều khiển playback: mount `useYouTubePlayer`, đồng bộ các event socket `player:play`, `player:pause`, `player:seek`, `player:songChanged`; host emit `player:clock`, `player:ended`, `player:errorSkip` |

**Flow phát nhạc:**
1. RoomPage chuyển bài hoặc có bài mới → gọi `useYouTubePlayer.loadVideo(id, startSeconds, isPlaying)`.
2. Iframe YouTube ngầm tải và phát video trực tiếp từ CDN YouTube trên trình duyệt client.
3. UI hiển thị ảnh thu nhỏ của video, không hiển thị khung video YouTube.
4. Mỗi 1 giây khi đang phát, `useYouTubePlayer` ghi nhận tiến trình nghe vào `createListeningProgress`, định kỳ emit `listening:progress` lên server để cộng Notes và lưu lịch sử nghe nhạc.

---

## 6. Nhóm Notes economy (thưởng Notes khi nghe)

| File | Symbol quan trọng |
|---|---|
| `server/src/utils/listeningTime.js` | `getListeningTime` (đồng hồ **server** tích lũy `listenedMs` theo room), `observeListeningIntervals` (callback → `noteRewards.record`), Maps `songListening` / `artistListening` per room |
| `server/src/utils/noteRewards.js` | `NOTE_INTERVAL_MS = 600000` (**10 phút nghe = 1 Note**), `mergeIntervals` (union — dedup giữa rooms/tabs cùng tài khoản), `createNoteRewards({persist, sample, notify})` → `record` / `flush`, `persistNoteRewards` (FOR UPDATE wallet, bỏ qua `fixed_notes`, batch insert `account_note_rewards` ON CONFLICT DO NOTHING, remainder vào `account_note_progress`, BigInt math) |
| `server/src/index.js` | Wiring: `sample` chạy `getListeningTime` mọi phòng, **flush mỗi 5s**, `notify` → emit `notes:updated` (vào room chứa user + mọi socket của user) |

**Flow:** server clock (room đang play) → intervals → chunk 600s → 1 Note/chunk → flush 5s → transaction DB (advisory lock wallet) → `notes:updated` → client (ProfilePage, MemberProfileCard, useShopData) update số dư.

---

## 7. Nhóm Lịch sử nghe nhạc, BXH nghệ sĩ & tổng kết phiên

Chi tiết schema + quyết định: **`MUSIC_HISTORY.md`**.

### 7.1 Thu thập lịch sử (client → server → DB)

| File | Symbol quan trọng |
|---|---|
| `client/src/listeningProgress.js` | `createListeningProgress` — đếm theo **media-time** (chỉ tính khi media chạy thật, bỏ seek distance + loading; mediaMs ≤ wallMs+1000, ≤30s), emit mỗi 10s qua socket `listening:progress` (videoId, playbackId, listenedMs, duration) |
| `server/src/socket/handler.js` | `listening:progress` → `room.recordHistory` |
| `server/src/utils/musicHistory.js` | `initMusicHistory` (chạy `config/musicHistory.sql`), `saveSongMetadata` (upsert, giữ `title_source='manual'`), `savePlayback` (transaction, statement_timeout 5s, idempotent theo playbackId), `createHistoryRecorder` (serialized drain, checkpoints, chống replay, caps pending>100 / progress>500) |
| `server/src/config/musicHistory.sql` | Bảng `music_songs` (video_id PK, `album_tracks` JSONB, `title_source`), `music_playbacks` (playback_id UUID, video_id, room_session_id, listened_ms — **ẩn danh, không FK user**); views `music_song_stats`, `music_catalog` (expand album_tracks), `music_quiz_candidates` (dữ liệu cho game đoán bài **chưa implement**) |
| `server/src/utils/albumTracks.js` | Quản lý album_tracks (album curated được expand thành track riêng trong `music_catalog`) |

### 7.2 BXH nghệ sĩ & tổng kết phiên

| File | Symbol quan trọng |
|---|---|
| `server/src/utils/artistLeaderboard.js` | `saveSession` (ghi `listening_sessions` + `session_artist_listening`, idempotent theo sessionId — **legacy, BXH không còn đọc**), `getLeaderboard` (SELECT `music_playbacks` JOIN `music_songs` GROUP BY artist, top 3, normalize alias/feat) |
| `server/src/utils/artistMetadata.js` | `getArtistMetadata` (scrape watch page, cache 30 phút), `finalizeArtistListening` (gắn metadata vào `room.artistListening`) |
| `server/src/utils/summaryArtists.js` | Heuristic trích artist từ title/author/channelNames (feat parsing, band name) |
| `server/src/utils/sessionSummary.js` | `buildSessionSummary` ({elapsedMs, topArtists, topMembers}) |
| `client/src/components/ListeningTimer.jsx` | Hiển thị đồng hồ nghe của phòng từ snapshot `room:listeningTime` (elapsedMs + running + receivedAt) |
| `client/src/components/SessionSummary.jsx` | Modal tổng kết sau `room:ended` (đọc sessionStorage) |
| `client/src/components/ArtistLeaderboard.jsx` | GET `/api/rooms/leaderboard` + `leaderboard:updated`/`connect` reload; nút "Xóa database" (admin only) |

**Flow room:end (host bấm Kết thúc):** `finalizeArtistListening` → `buildSessionSummary` → `persistSession` (= `saveSession`) → emit `room:ended` + `socketsLeave` + `deleteRoom` + `rooms:updated` + `leaderboard:updated`. `leaderboard:updated` cũng được schedule coalesced **1 giây** sau mỗi history commit (handler.js).

### 7.3 Reset dữ liệu nghe

| File | Symbol quan trọng |
|---|---|
| `server/src/routes/rooms.js` | `POST /api/rooms/leaderboard/reset` — `authenticateToken` + `requireAdmin` + `createResetHandler()` |
| `server/src/utils/resetLeaderboard.js` | `createResetHandler` (verify bcrypt `DATABASE_RESET_PASSWORD_HASH`, 5 lần/15 phút/IP, busy lock), `resetListeningData` (backup rồi TRUNCATE 4 bảng) |
| `server/src/utils/resetBackup.js` | Gzip snapshot → `~/.ytm-together-backups/database-reset.json.gz` (atomic rename) |

---

## 8. Nhóm Shop & Inventory

| File | Symbol quan trọng |
|---|---|
| `server/src/routes/shop.js` | `GET /api/shop`, `GET /api/shop/inventory`, `POST /api/shop/buy`, `POST /api/shop/use` → `shopAction`; emit `inventory:updated`, `notes:updated`, `account:idUpdated` |
| `server/src/utils/shop.js` | `ID_CARD` (Thẻ đổi ID, 30 Notes), `normalizePublicId` (3–24 ký tự [a-z0-9-_], prefix `ytmt-` reserved), `shopAction` (idempotency qua `requestId` + bảng `account_shop_actions`; replay trả kết quả cũ; buy: trừ Notes + upsert `account_inventory`; use: đổi `accounts.public_id`) |
| `client/src/hooks/useShop.js` | `useShopData(path)` (GET + reload khi `inventory:updated`/`notes:updated`/`connect`), `useShopAction` (`perform` — **reuse requestId khi network fail** để retry không bị charge 2 lần; bỏ requestId khi lỗi 4xx) |
| `client/src/pages/ShopPage.jsx` | Mua vật phẩm (dialog số lượng, BigInt total) |
| `client/src/pages/InventoryPage.jsx` | Dùng Thẻ đổi ID (dialog nhập ID mới, update publicId) |
| `client/src/components/ItemBrowser.jsx`, `IdCardArtwork.jsx` | UI chung shop/inventory + ảnh vật phẩm |

**Bảng DB:** `account_inventory`, `account_shop_actions`, `accounts.notes`/`notes_awarded`.

### 8.2 Nhóm Hòm thư & Thông báo hệ thống

| File | Symbol quan trọng |
|---|---|
| `server/src/routes/announcements.js` | `GET /api/announcements` (lấy danh sách thông báo hệ thống, yêu cầu auth), `POST /api/announcements` (admin gửi thông báo mới, lưu vào `system_announcements`, emit realtime `announcement:new`) |
| `client/src/components/MailboxModal.jsx` | Cửa sổ Hòm thư lớn (modal 2 cột): cột trái hiển thị danh sách thư, cột phải hiển thị tựa đề, nội dung và phần Ký tên ở góc dưới bên phải |
| `client/src/components/SiteHeader.jsx` | Icon Hòm thư cạnh lời chào người dùng, hiển thị chấm đỏ khi có thư chưa đọc |
| `client/src/pages/AdminPage.jsx` | Khung soạn thảo và gửi thư thông báo toàn hệ thống dành cho Admin |

**Bảng DB:** `system_announcements` (id, title, content, sender, created_at).

### 8.3 Lớp chặn truy cập trên điện thoại (Mobile Guard)

| File | Symbol quan trọng |
|---|---|
| `client/src/components/MobileBlocker.jsx` | `isMobileDevice` (kiểm tra `navigator.userAgent`), màn hình thông báo chặn truy cập trên điện thoại và gợi ý dùng máy tính hoặc chờ bản app mobile |
| `client/src/App.jsx` | Tích hợp lớp kiểm tra ở root component, bảo lưu 100% mã nguồn các trang và route hiện có |

---

## 9. Hạ tầng chung, DB & vận hành

### 9.1 Entry & wiring

`server/src/index.js`: tạo Express + Socket.IO (`allowedSocketRequest`); CSP + security headers (HSTS production); mount routers theo thứ tự `/api/auth`, `/api/rooms`, `/api/youtube`, `/api/guest`, `/api/shop`, `/api/audio`; serve `../public` static + SPA fallback; `start()` → `initDB()` (fail → exit 1) → wiring noteRewards (mục 6) → `server.listen`.

`server/src/config/db.js`: pg Pool (connectionTimeoutMillis 10000, ssl rejectUnauthorized), `initDB` → `initAccounts` (accounts.js) + listening tables + `initMusicHistory`.

### 9.2 Tests

- Runner: `node:test` built-in — chạy từ `server/` bằng `node --test src` (tương tự client). **Không có script `npm test`.**
- File test nằm cạnh module được test. Test cần DB (`accounts.test.js`, `shop.test.js`, `noteRewards.db.test.js`) tự skip khi thiếu `TEST_DATABASE_URL`.
- `socket/autoplay.test.js`, `socket/chatNavigation.test.js` test setupSocket thật bằng socket.io-client.

### 9.3 Build & deploy

- `client/` `npm run build` → xuất vào `server/public` (Vite `--outDir ../server/public`).
- Deploy alwaysdata: theo `AGENTS.md` — sau khi verify thì deploy (upload backend + publish frontend build), backup production files, restart **Web > Sites > Restart**, verify site công khai. Rollback native audio: `.deploy-local/NATIVE-AUDIO-ROLLBACK.md`.

---

## 10. Cảnh báo kiến trúc (legacy / dead code / điểm chưa chắc chắn)

CHỈ cảnh báo những chỗ thật sự cần biết TRƯỚC khi sửa — không phải danh sách bug.

1. **Dead code client — ĐÃ DỌN ngày 2026-09-23** (đã xác minh grep không import ở đâu trước khi xóa):
   - Đã xóa: `client/src/pages/LoginPage.jsx`, `client/src/pages/RegisterPage.jsx` (thay bằng `GuestPage.jsx`), `client/src/hooks/useYouTubePlayer.js` (hook YouTube iframe player cũ), block `ProtectedRoute` trong `App.jsx`, `server/scripts/__pycache__/`.
2. **`server/src/routes/guest.js` (~dòng 56):** nhánh `finally` chạy `ROLLBACK` sau khi nhánh display_name đã `COMMIT` — vô hại (no-op trên transaction đã kết thúc) nhưng dễ gây hiểu nhầm khi đọc.
3. **Game đoán bài chưa implement:** views `music_quiz_candidates` + `music_catalog` đã chuẩn bị dữ liệu (kể cả album tracks curated) nhưng không có game/UI nào dùng (README, MUSIC_HISTORY.md).
4. **`listening_sessions` + `session_artist_listening` là legacy:** hàm `saveSession` (`utils/artistLeaderboard.js`) KHÔNG còn được gọi trong production (chỉ test gọi) — bảng chỉ còn được CREATE ở `config/db.js` và đọc khi backup/reset BXH. Cẩn trọng: dọn hẳn đòi hỏi sửa schema + `resetLeaderboard.js` + `resetBackup.test.js`.
5. **Single-process giả định:** rooms in-memory + `audioCache` sở hữu thư mục cache — không chạy nhiều instance cùng DB/cache; restart mất phòng + discard cache.
6. **Scraping YouTube không chính thức (không API key):** mọi đường search/recommendation/metadata phụ thuộc cấu trúc trang YouTube — dễ break khi YouTube thay đổi (NATIVE_AUDIO.md mục rollback).
7. **Một số test socket cũ dùng JWT handshake** (`socket/autoplay.test.js` truyền `auth.token`) — viết trước thời cookie session; giữ nguyên khi chạy, đừng lấy đó làm mẫu cho code mới.
8. **Bảng account cũ từ thời JWT được giữ làm archive** (SECURITY_REVIEW.md) — không reuse cho registration mới.
