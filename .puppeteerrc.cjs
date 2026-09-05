const { join } = require('path');

/**
 * Puppeteer Configuration File
 * Directs Puppeteer to store Chromium binaries inside the project root (.cache/puppeteer)
 * so that cloud hostings (Render, Railway, Vercel) preserve the browser binary across builds.
 */
module.exports = {
  cacheDirectory: join(__dirname, '.cache', 'puppeteer'),
};
