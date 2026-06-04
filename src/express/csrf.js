'use strict';

const { generateToken, makeSigned, verifySigned, verifyRequest } = require('../core/csrf');

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Đọc 1 cookie theo tên từ header Cookie (không cần cookie-parser). */
function readCookie(req, name) {
  const raw = req.headers && req.headers.cookie;
  if (!raw) return null;
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    if (part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

function setCookie(res, name, value, opts) {
  const bits = [`${name}=${encodeURIComponent(value)}`, `Path=${opts.path || '/'}`, `SameSite=${opts.sameSite || 'Lax'}`];
  if (opts.httpOnly !== false) bits.push('HttpOnly');
  if (opts.secure) bits.push('Secure');
  if (opts.maxAge) bits.push(`Max-Age=${Math.floor(opts.maxAge / 1000)}`);
  const prev = res.getHeader('Set-Cookie');
  const arr = Array.isArray(prev) ? prev : prev ? [prev] : [];
  arr.push(bits.join('; '));
  res.setHeader('Set-Cookie', arr);
}

/**
 * Bảo vệ CSRF cho Express (double-submit có ký HMAC). KHÔNG phụ thuộc thư viện ngoài.
 *
 * Dùng:
 *   const { csrfProtection } = require('@suga/site-guard/express');
 *   const csrf = csrfProtection({ secret: process.env.SESSION_SECRET });
 *   app.use(csrf);
 *   // Khi render form: chèn <input type="hidden" name="_csrf" value="<%= req.csrfToken() %>">
 *   // hoặc đặt vào <meta name="csrf-token" content="..."> cho JS gửi header X-CSRF-Token.
 *
 * - GET/HEAD/OPTIONS: tự phát cookie nếu chưa có; gắn req.csrfToken().
 * - POST/PUT/PATCH/DELETE: bắt buộc token khớp, sai → 403.
 *
 * @param {object} opts - { secret(BẮT BUỘC), cookieName, fieldName, headerName,
 *                          ignorePaths[], sameSite, secure, maxAge, statusCode, message }
 */
function csrfProtection(opts = {}) {
  if (!opts.secret) throw new Error('[site-guard] csrfProtection cần `secret`');
  const secret = opts.secret;
  const cookieName = opts.cookieName || 'sg_csrf';
  const fieldName = opts.fieldName || '_csrf';
  const headerName = (opts.headerName || 'x-csrf-token').toLowerCase();
  const ignorePaths = opts.ignorePaths || [];
  const statusCode = opts.statusCode || 403;
  const message = opts.message || 'Phiên không hợp lệ (CSRF). Tải lại trang rồi thử lại.';
  const cookieOpts = {
    sameSite: opts.sameSite || 'Lax',
    secure: opts.secure != null ? opts.secure : true,
    httpOnly: true,
    maxAge: opts.maxAge || 24 * 60 * 60 * 1000,
    path: '/',
  };

  return function csrfMiddleware(req, res, next) {
    // cho phép bỏ qua (vd webhook ký riêng)
    const p = req.path || req.url || '/';
    if (ignorePaths.some((x) => p.startsWith(x))) return next();

    const signed = readCookie(req, cookieName);
    const existing = signed ? verifySigned(signed, secret) : null;

    // 1 token duy nhất cho cả vòng đời request: tái dùng cookie hợp lệ, hoặc phát mới (đặt cookie 1 lần)
    let current = existing;
    function ensure() {
      if (!current) {
        current = generateToken();
        setCookie(res, cookieName, makeSigned(current, secret), cookieOpts);
      }
      return current;
    }
    req.csrfToken = ensure;

    if (SAFE_METHODS.has((req.method || 'GET').toUpperCase())) {
      ensure(); // đảm bảo có cookie + token cho lần submit sau
      return next();
    }

    // phương thức đổi trạng thái → bắt buộc kiểm
    const submitted = (req.headers[headerName])
      || (req.body && (req.body[fieldName] || req.body._csrf))
      || (req.query && req.query[fieldName]);

    if (!verifyRequest(signed, submitted, secret)) {
      // eslint-disable-next-line no-console
      console.warn('[site-guard] block csrf', JSON.stringify({ path: p, method: req.method }));
      return res.status(statusCode).send(message);
    }
    return next();
  };
}

module.exports = { csrfProtection, readCookie };
