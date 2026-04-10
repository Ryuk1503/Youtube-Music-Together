const express = require('express');
const ytsr = require('ytsr');
const youtubedl = require('youtube-dl-exec');

const router = express.Router();

// Cache audio URLs (they expire after ~6 hours)
const audioCache = new Map();

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

// GET /api/youtube/audio/:videoId - Get audio stream URL via yt-dlp
router.get('/audio/:videoId', async (req, res) => {
  try {
    const { videoId } = req.params;

    // Check cache
    const cached = audioCache.get(videoId);
    if (cached && Date.now() - cached.timestamp < 3600000) {
      return res.json(cached.data);
    }

    const url = `https://www.youtube.com/watch?v=${videoId}`;

    const info = await youtubedl(url, {
      dumpSingleJson: true,
      noCheckCertificates: true,
      noWarnings: true,
      preferFreeFormats: true,
      extractAudio: true,
      audioFormat: 'best',
    });

    // Find best audio-only format
    const audioFormats = (info.formats || [])
      .filter((f) => f.acodec !== 'none' && f.vcodec === 'none')
      .sort((a, b) => (b.abr || 0) - (a.abr || 0));

    // Fallback: any format with audio
    const bestAudio = audioFormats[0] ||
      (info.formats || [])
        .filter((f) => f.acodec !== 'none' && f.url)
        .sort((a, b) => (b.abr || 0) - (a.abr || 0))[0];

    if (!bestAudio || !bestAudio.url) {
      return res.status(404).json({ error: 'No audio format found' });
    }

    const data = {
      audioUrl: bestAudio.url,
      title: info.title || '',
      thumbnail: info.thumbnail || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      duration: info.duration || 0,
      author: info.uploader || info.channel || 'Unknown',
    };

    // Cache for 1 hour
    audioCache.set(videoId, { data, timestamp: Date.now() });

    res.json(data);
  } catch (err) {
    console.error('Audio extraction error:', err);
    res.status(500).json({ error: 'Failed to get audio URL' });
  }
});

// GET /api/youtube/stream/:videoId - Proxy audio stream via yt-dlp
router.get('/stream/:videoId', async (req, res) => {
  try {
    const { videoId } = req.params;
    const url = `https://www.youtube.com/watch?v=${videoId}`;

    const info = await youtubedl(url, {
      dumpSingleJson: true,
      noCheckCertificates: true,
      noWarnings: true,
    });

    const audioFormats = (info.formats || [])
      .filter((f) => f.acodec !== 'none' && f.vcodec === 'none')
      .sort((a, b) => (b.abr || 0) - (a.abr || 0));

    const bestAudio = audioFormats[0] ||
      (info.formats || []).filter((f) => f.acodec !== 'none').sort((a, b) => (b.abr || 0) - (a.abr || 0))[0];

    if (!bestAudio || !bestAudio.url) {
      return res.status(404).json({ error: 'No audio format found' });
    }

    // Redirect to the direct URL
    res.redirect(bestAudio.url);
  } catch (err) {
    console.error('Stream error:', err);
    res.status(500).json({ error: 'Failed to stream audio' });
  }
});

module.exports = router;
