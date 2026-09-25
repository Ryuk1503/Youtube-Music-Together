const express = require('express');
const router = express.Router();

const APP_VERSION_INFO = {
  versionCode: 2,
  versionName: '1.0.1',
  minSupportedVersionCode: 1,
  apkUrl: 'https://github.com/Ryuk1503/Youtube-Music-Together/raw/main/YTM-Together.apk',
  changelog: 'Bản cập nhật Android mới:\n- Nghe nhạc nền ổn định khi tắt màn hình hoặc chuyển ứng dụng.\n- Hỗ trợ tải và cài đặt cập nhật tự động ngay trong ứng dụng.',
  releaseDate: '2026-09-25',
};

router.get('/version', (req, res) => {
  res.json(APP_VERSION_INFO);
});

module.exports = router;
