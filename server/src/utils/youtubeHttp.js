const https = require('node:https');

// The HTTP host's IPv6 route omits some music videos from YouTube results.
// Keep this scoped to outbound search requests; the website still listens on IPv6.
function fetchSearchPage(url, { signal } = {}, request = https.get) {
  return new Promise((resolve, reject) => {
    const req = request(url, { family: 4, signal }, response => {
      const chunks = [];
      let size = 0;
      response.on('data', chunk => {
        size += chunk.length;
        if (size > 8 * 1024 * 1024) {
          const error = new Error('YouTube response too large');
          reject(error);
          req.destroy(error);
          return;
        }
        chunks.push(chunk);
      });
      response.on('error', reject);
      response.on('aborted', () => reject(new Error('YouTube response interrupted')));
      response.on('end', () => resolve({
        ok: response.statusCode >= 200 && response.statusCode < 300,
        status: response.statusCode,
        text: async () => Buffer.concat(chunks).toString('utf8'),
      }));
    });
    req.on('error', reject);
  });
}

module.exports = { fetchSearchPage };
