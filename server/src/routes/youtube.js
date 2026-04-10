const express = require('express');
const ytsr = require('ytsr');

const router = express.Router();

// Cache audio URLs (30 min)
const audioCache = new Map();

// Piped API instances (free, proxy YouTube audio)
const PIPED_INSTANCES = [
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.adminforge.de',
  'https://pipedapi.r4fo.com',
];

// Helper: get audio info from Piped API with fallback instances
async function getAudioFromPiped(videoId) {
  const cached = audioCache.get(videoId);
  if (cached && Date.now() - cached.timestamp < 1800000) {
    return cached.data;
  }

  for (const instance of PIPED_INSTANCES) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);

      const response = await fetch(`${instance}/streams/${videoId}`, {
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!response.ok) continue;
      const data = await response.json();

      const audioStreams = (data.audioStreams || [])
        .filter((s) => s.mimeType?.startsWith('audio/'))
        .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));

      if (audioStreams.length === 0) continue;

      const result = {
        audioUrl: audioStreams[0].url,
        title: data.title || '',
        thumbnail: data.thumbnailUrl || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        duration: data.duration || 0,
        author: data.uploader || 'Unknown',
      };

      audioCache.set(videoId, { data: result, timestamp: Date.now() });
      console.log(`✅ Audio resolved via ${instance} for ${videoId}`);
      return result;
    } catch (err) {
      console.warn(`⚠️ Piped instance ${instance} failed:`, err.message);
      continue;
    }
  }

  throw new Error('All Piped instances failed');
}

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

// GET /api/youtube/audio/:videoId - Get audio URL via Piped API
router.get('/audio/:videoId', async (req, res) => {
  try {
    const { videoId } = req.params;
    const data = await getAudioFromPiped(videoId);
    res.json(data);
  } catch (err) {
    console.error('Audio extraction error:', err.message);
    res.status(500).json({ error: 'Failed to get audio URL' });
  }
});

module.exports = router;
