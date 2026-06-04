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

/**
 * Helper HONEYPOT — chống bot điền form (đăng ký, liên hệ).
 * Thêm 1 ô input ẨN trên form; người thật để trống, bot tự điền → chặn.
 *
 * Dùng:
 *   const { honeypot, honeypotField } = require('@suga/site-guard/express');
 *   // render form: chèn honeypotField() vào trong <form>
 *   app.post('/api/contact', honeypot(), express.urlencoded({extended:true}), handler)
 *   // LƯU Ý: honeypot() phải chạy SAU khi body đã parse → đặt sau urlencoded.
 *
 * @param {object} [opts] - { field?:string, statusCode?:number, message?:string }
 */
const HONEYPOT_FIELD = 'sg_hp_url';
function honeypot(opts = {}) {
  const field = opts.field || HONEYPOT_FIELD;
  const statusCode = opts.statusCode || 400;
  const message = opts.message || 'Yêu cầu không hợp lệ.';
  return function honeypotMiddleware(req, res, next) {
    const val = req.body && req.body[field];
    if (val != null && String(val).trim() !== '') {
      // eslint-disable-next-line no-console
      console.warn('[site-guard] block honeypot', JSON.stringify({ path: req.path }));
      return res.status(statusCode).send(message);
    }
    return next();
  };
}

/** Trả về đoạn HTML ô ẩn để chèn vào <form>. Người thật không thấy/không điền. */
function honeypotField(field = HONEYPOT_FIELD) {
  return `<div style="position:absolute;left:-9999px" aria-hidden="true">`
    + `<label>Để trống ô này<input type="text" name="${field}" tabindex="-1" autocomplete="off"></label></div>`;
}

/**
 * Helper CACHE theo route — đặt Cache-Control chính xác cho 1 nhóm route.
 * Chuẩn hơn cache theo path-prefix; rất hợp khi site đứng sau Cloudflare.
 *
 * Dùng:
 *   const { cache, CACHE_PRESETS } = require('@suga/site-guard/express');
 *   app.get('/', cache(CACHE_PRESETS.cdnDynamic), handler)   // CF cache trang chủ 60s
 *   app.use('/admin', cache(CACHE_PRESETS.noStore))          // admin không cache
 */
function cache(value) {
  return function cacheMiddleware(_req, res, next) {
    if (value) res.setHeader('Cache-Control', value);
    next();
  };
}

module.exports = siteGuard;
module.exports.siteGuard = siteGuard;
module.exports.getClientIp = getClientIp;
module.exports.honeypot = honeypot;
module.exports.honeypotField = honeypotField;
module.exports.HONEYPOT_FIELD = HONEYPOT_FIELD;
module.exports.cache = cache;
module.exports.CACHE_PRESETS = require('../core/perf').CACHE_PRESETS;
module.exports.csrfProtection = require('./csrf').csrfProtection;
const _ts = require('./turnstile');
module.exports.createTurnstile = _ts.createTurnstile;
module.exports.turnstileWidget = _ts.turnstileWidget;
module.exports.turnstileScript = _ts.turnstileScript;
