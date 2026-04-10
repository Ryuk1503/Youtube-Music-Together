const express = require('express');
const https = require('https');
const ytsr = require('ytsr');
const youtubedl = require('youtube-dl-exec');

const router = express.Router();

// Cache audio URLs (they expire after ~1 hour)
const audioCache = new Map();

// Helper: resolve audio URL (cached or fresh via yt-dlp)
async function resolveAudioUrl(videoId) {
  const cached = audioCache.get(videoId);
  if (cached && Date.now() - cached.timestamp < 3600000) {
    return cached.audioUrl;
  }

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
    (info.formats || [])
      .filter((f) => f.acodec !== 'none' && f.url)
      .sort((a, b) => (b.abr || 0) - (a.abr || 0))[0];

  if (!bestAudio || !bestAudio.url) {
    throw new Error('No audio format found');
  }

  audioCache.set(videoId, { audioUrl: bestAudio.url, timestamp: Date.now() });
  return bestAudio.url;
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

// GET /api/youtube/stream/:videoId - Proxy audio stream through server
// This avoids YouTube's IP-lock on direct audio URLs
router.get('/stream/:videoId', async (req, res) => {
  try {
    const { videoId } = req.params;
    const audioUrl = await resolveAudioUrl(videoId);

    // Build headers to forward (Range for seeking)
    const proxyHeaders = {
      'User-Agent': 'Mozilla/5.0',
    };
    if (req.headers.range) {
      proxyHeaders['Range'] = req.headers.range;
    }

    const proxyReq = https.get(audioUrl, { headers: proxyHeaders }, (proxyRes) => {
      // If YouTube returns a redirect, follow it
      if (proxyRes.statusCode >= 300 && proxyRes.statusCode < 400 && proxyRes.headers.location) {
        https.get(proxyRes.headers.location, { headers: proxyHeaders }, (redirectRes) => {
          pipeAudioResponse(redirectRes, res);
        }).on('error', handleProxyError);
        return;
      }
      pipeAudioResponse(proxyRes, res);
    });

    proxyReq.on('error', handleProxyError);

    function pipeAudioResponse(proxyRes, res) {
      res.status(proxyRes.statusCode);
      const forward = ['content-type', 'content-length', 'content-range', 'accept-ranges'];
      for (const h of forward) {
        if (proxyRes.headers[h]) res.setHeader(h, proxyRes.headers[h]);
      }
      // Allow browser to cache for 10 min
      res.setHeader('Cache-Control', 'public, max-age=600');
      proxyRes.pipe(res);
    }

    function handleProxyError(err) {
      console.error('Proxy stream error:', err.message);
      // Clear cached URL in case it expired
      audioCache.delete(videoId);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to stream audio' });
      }
    }

    // If client disconnects, abort the proxy request
    req.on('close', () => proxyReq.destroy());
  } catch (err) {
    console.error('Stream error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to stream audio' });
    }
  }
});

module.exports = router;
