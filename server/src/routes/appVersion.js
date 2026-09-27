const express = require('express');
const router = express.Router();

const APP_VERSION_INFO = {
  versionCode: 5,
  versionName: '0.0.3.1',
  minSupportedVersionCode: 1,
  apkUrl: 'https://github.com/Ryuk1503/Youtube-Music-Together/raw/main/YTM-Together.apk',
  changelog: 'Bản cập nhật v0.0.3.1:\n- Điều chỉnh cơ chế phát nhạc khi chuyển ứng dụng hoặc tắt màn hình.\n- Sửa lỗi: Thanh tiến độ vẫn chạy khi nhạc bị đứng.',
  releaseDate: '2026-09-27',
};

router.get('/version', (req, res) => {
  res.json(APP_VERSION_INFO);
});

module.exports = router;
