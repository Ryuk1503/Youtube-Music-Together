const express = require('express');
const router = express.Router();

const APP_VERSION_INFO = {
  versionCode: 3,
  versionName: '1.0.2',
  minSupportedVersionCode: 1,
  apkUrl: 'https://github.com/Ryuk1503/Youtube-Music-Together/raw/main/YTM-Together.apk',
  changelog: 'Bản cập nhật Android v1.0.2:\n- Yêu cầu cấp quyền Thông báo và Bỏ qua tối ưu pin (hỗ trợ đặc biệt máy Xiaomi / MIUI).\n- Tối ưu phát nhạc nền khi tắt màn hình và chuyển ứng dụng.\n- Giữ kết nối WiFi và âm thanh liên tục.',
  releaseDate: '2026-09-26',
};

router.get('/version', (req, res) => {
  res.json(APP_VERSION_INFO);
});

module.exports = router;
