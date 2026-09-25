# Lộ trình phát triển ứng dụng Android (APK) — YTM Together

Tài liệu này theo dõi toàn bộ tiến trình đóng gói và phát triển ứng dụng di động Android (file `.apk`) cho **YouTube Music Together** bằng nền tảng Capacitor.

---

## Phân công trách nhiệm

* 🤖 **AI (Antigravity):** Cài đặt thư viện, cấu hình Capacitor, thiết lập mã nguồn Android Native (Gradle, Manifest, WebView), xử lý cơ chế Background Audio, build file `.apk`.
* 👤 **User:** Cài đặt file `.apk` lên điện thoại thật, trải nghiệm nghe nhạc khi tắt màn hình/chuyển app, phản hồi kết quả kiểm thử.

---

## Danh sách công việc chi tiết

- [x] **Bước 1: Khởi tạo và cấu hình Capacitor trong client** `[🤖 AI]`
  - Cài đặt `@capacitor/core`, `@capacitor/cli`, `@capacitor/android` vào `client/`.
  - Tạo file cấu hình `capacitor.config.json` (`appId: com.ytmtogether.app`, `appName: YTM Together`).
  - Cập nhật logic `isMobileDevice` trong `MobileBlocker.jsx`: Tự động bỏ chặn nếu đang chạy trong App Native (`Capacitor.isNativePlatform()`).
  - Kiểm tra build frontend Vite. (Hoàn thành)

- [x] **Bước 2: Khởi tạo dự án Android Native & Cấu hình Manifest** `[🤖 AI]`
  - Chạy `npx cap add android` để sinh thư mục `client/android/`.
  - Cấu hình quyền trong `AndroidManifest.xml`:
    - `android.permission.INTERNET`
    - `android.permission.ACCESS_NETWORK_STATE`
    - `android.permission.WAKE_LOCK`
    - `android.permission.FOREGROUND_SERVICE`
    - `android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK`
  - Đồng bộ tài nguyên giao diện web sang Android (`npx cap sync android`). (Hoàn thành)

- [x] **Bước 3: Xử lý cơ chế phát nhạc trong nền (Background Playback)** `[🤖 AI]`
  - Tùy biến `MainActivity.java` / Android WebView:
    - Bật `setMediaPlaybackRequiresUserGesture(false)`
    - Ngăn WebView tự ngắt âm thanh và timers khi ứng dụng rơi vào trạng thái background / tắt màn hình.
  - Cấu hình Foreground Service (`MusicService.java`) với `WAKE_LOCK` và Notification ongoing giữ app không bị Android hệ thống đóng.
  - Vô hiệu hóa sự kiện `visibilitychange` và khóa `document.hidden = false` trong môi trường App Native. (Hoàn thành)

- [x] **Bước 4: Biên dịch và đóng gói file APK (`app-debug.apk`) & In-App Update** `[🤖 AI]`
  - Thiết lập biến môi trường `JAVA_HOME` (JDK 23) và `ANDROID_HOME` (Android Sdk).
  - Tích hợp Native Plugin `AppUpdatePlugin.java` & `REQUEST_INSTALL_PACKAGES` để hỗ trợ tải và tự động mở trình cài đặt cập nhật ngay trong ứng dụng.
  - Chạy Gradle Wrapper (`gradlew.bat assembleDebug`) trong `client/android/` (versionCode 2, versionName 1.0.1).
  - Xuất file cài đặt `YTM-Together.apk` ra ngay thư mục gốc dự án. (Hoàn thành)

- [ ] **Bước 5: Cài đặt và kiểm thử thực tế trên điện thoại** `[👤 USER]`
  - Tải file `.apk` vào điện thoại Android và tiến hành cài đặt.
  - Đăng nhập tài khoản, vào phòng nghe nhạc.
  - Kiểm tra xem nhạc có tiếp tục phát khi:
    1. Tắt màn hình điện thoại.
    2. Chuyển sang ứng dụng khác (Facebook, lướt web,...).
  - Phản hồi kết quả để hoàn thiện hoặc tinh chỉnh.
