const express = require('express');
const ytsr = require('ytsr');

const router = express.Router();

// GET /api/youtube/search?q=query
router.get('/search', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.status(400).json({ error: 'Query is required' });

    const results = await ytsr(q, {
      limit: 20,
      gl: 'VN',
      hl: 'vi',
    });

    const videos = results.items
      .filter((item) => item.type === 'video')
      .map((item) => ({
        videoId: item.id,
        title: item.title,
        thumbnail: item.bestThumbnail?.url || item.thumbnails?.[0]?.url || '',
        duration: item.duration,
        author: item.author?.name || 'Unknown',
        views: item.views,
      }));

    res.json({ videos });
  } catch (err) {
    console.error('Search error:', err);
    res.status(500).json({ error: 'Failed to search' });
  }
});

module.exports = router;
