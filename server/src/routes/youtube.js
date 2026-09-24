const express = require('express');
const { searchYouTube } = require('../utils/youtubeSearch');

const router = express.Router();

// GET /api/youtube/search?q=query
router.get('/search', async (req, res) => {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (!q || q.length > 200) return res.status(400).json({ error: 'Từ khóa phải dài từ 1 đến 200 ký tự.' });
    const videos = await searchYouTube(q);

    res.json({ videos });
  } catch (err) {
    console.error('Search error:', err.message);
    res.status(502).json({ error: 'Chưa lấy được kết quả từ YouTube. Vui lòng thử lại.' });
  }
});

module.exports = router;
