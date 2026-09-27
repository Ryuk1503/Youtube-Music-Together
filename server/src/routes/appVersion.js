const express = require('express');
const router = express.Router();

const APP_VERSION_INFO = {
  versionCode: 4,
  versionName: '0.0.3',
  minSupportedVersionCode: 1,
  apkUrl: 'https://github.com/Ryuk1503/Youtube-Music-Together/raw/main/YTM-Together.apk',
  changelog: 'Bản cập nhật v0.0.3:\n- Sửa lỗi: Nhạc không tiếp tục phát khi tắt màn hình hoặc chuyển sang ứng dụng khác.',
  releaseDate: '2026-09-27',
};

router.get('/version', (req, res) => {
  res.json(APP_VERSION_INFO);
});

module.exports = router;
