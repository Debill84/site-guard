'use strict';

const { createGuard } = require('../core');
const { cacheControlFor } = require('../core/perf');
const { wrapResponseForCompression } = require('./compress');

/** Lấy IP thật của client (đứng sau proxy Railway/Cloudflare nếu trustProxy). */
function getClientIp(req, trustProxy) {
  if (trustProxy) {
    const xff = req.headers['x-forwarded-for'];
    if (xff) return String(xff).split(',')[0].trim();
    const real = req.headers['x-real-ip'];
    if (real) return String(real).trim();
  }
  return (req.ip || (req.socket && req.socket.remoteAddress) || 'unknown');
}

function isHttps(req, trustProxy) {
  if (req.secure) return true;
  if (trustProxy && req.headers['x-forwarded-proto']) {
    return String(req.headers['x-forwarded-proto']).split(',')[0].trim() === 'https';
  }
  return false;
}

/**
 * Tạo middleware Express cho SiteGuard.
 *
 * Cách dùng (server.js):
 *   const siteGuard = require('@suga/site-guard/express');
 *   app.use(siteGuard());                 // mặc định an toàn
 *   app.use(siteGuard({ ... }));          // tùy biến
 *
 * Nên đặt NGAY SAU `const app = express()` và TRƯỚC các route.
 *
 * @param {object} [userConfig]
 * @returns {Function} (req, res, next)
 */
function siteGuard(userConfig) {
  const guard = createGuard(userConfig);
  const cfg = guard.config;
  const trustProxy = cfg.trustProxy !== false;
  const hidePoweredBy = cfg.security && cfg.security.enabled !== false && cfg.security.hidePoweredBy;
  const perf = cfg.performance || {};
  const compressOn = perf.enabled !== false && perf.compression && perf.compression.enabled;
  const cacheCfg = perf.enabled !== false ? perf.cacheHeaders : null;

  return function siteGuardMiddleware(req, res, next) {
    try {
      // Ẩn header lộ công nghệ
      if (hidePoweredBy) res.removeHeader('X-Powered-By');

      const reqPath = req.path || req.url || '/';

      // ⚡ Bọc nén response (làm sớm để bắt được mọi thứ route ghi ra sau next())
      if (compressOn) wrapResponseForCompression(req, res, perf.compression);

      // ⚡ Cache-Control theo path (mặc định tắt → no-op an toàn)
      if (cacheCfg && cacheCfg.enabled) {
        const cc = cacheControlFor(reqPath, cacheCfg);
        if (cc) res.setHeader('Cache-Control', cc);
      }

      const decision = guard.evaluate({
        path: reqPath,
        ip: getClientIp(req, trustProxy),
        userAgent: req.headers['user-agent'] || '',
        isHttps: isHttps(req, trustProxy),
        now: Date.now(),
      });

      // Gắn security headers cho MỌI response
      const h = decision.headers || {};
      for (const name of Object.keys(h)) res.setHeader(name, h[name]);

      if (decision.action === 'allow') return next();

      // Chặn hoặc giới hạn → trả lỗi gọn
      if (decision.retryAfterSec != null) res.setHeader('Retry-After', String(decision.retryAfterSec));
      res.status(decision.status || 403);
      // Trả JSON nếu client xin JSON, ngược lại text thân thiện
      if ((req.headers.accept || '').includes('application/json')) {
        return res.json({ error: decision.message || 'Forbidden', code: decision.reason });
      }
      return res.type('text/plain; charset=utf-8').send(decision.message || 'Forbidden');
    } catch (err) {
      // KHÔNG bao giờ để SiteGuard làm chết request → fail-open + log
      // eslint-disable-next-line no-console
      console.error('[site-guard] middleware error (fail-open):', err && err.message);
      return next();
    }
  };
}

module.exports = siteGuard;
module.exports.siteGuard = siteGuard;
module.exports.getClientIp = getClientIp;
