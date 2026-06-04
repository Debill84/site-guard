'use strict';

/**
 * Tích hợp Cloudflare Turnstile (CAPTCHA miễn phí, không phiền khách) — phía server.
 * Dùng `fetch` có sẵn của Node 18+ → 0 phụ thuộc. `fetch` có thể tiêm vào để test.
 *
 * Luồng: client hiện widget (site key) → lấy token → gửi kèm form (field
 * `cf-turnstile-response`). Server gọi API Cloudflare verify (secret key) → success?
 *
 * Lấy key: dashboard Cloudflare → Turnstile → Add site → có SITE KEY (gắn web) + SECRET KEY (server).
 */

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

function getIp(req) {
  const xff = req.headers && req.headers['x-forwarded-for'];
  if (xff) return String(xff).split(',')[0].trim();
  return undefined;
}

/**
 * @param {object} opts - { secret(BẮT BUỘC), fetch?, endpoint?, statusCode?, message?, field? }
 */
function createTurnstile(opts = {}) {
  if (!opts.secret) throw new Error('[site-guard] Turnstile cần `secret` (Secret Key của Cloudflare)');
  const secret = opts.secret;
  const endpoint = opts.endpoint || VERIFY_URL;
  const fetchImpl = opts.fetch || (typeof fetch !== 'undefined' ? fetch : null);
  const field = opts.field || 'cf-turnstile-response';
  const statusCode = opts.statusCode || 403;
  const message = opts.message || 'Xác minh chống bot thất bại. Vui lòng thử lại.';

  if (!fetchImpl) throw new Error('[site-guard] không có fetch — Node < 18? Truyền opts.fetch.');

  /** Gọi Cloudflare verify. @returns {Promise<{success:boolean, ...}>} */
  async function verify(token, remoteip) {
    if (!token) return { success: false, 'error-codes': ['missing-input-response'] };
    const form = new URLSearchParams();
    form.append('secret', secret);
    form.append('response', token);
    if (remoteip) form.append('remoteip', remoteip);
    try {
      const r = await fetchImpl(endpoint, { method: 'POST', body: form });
      return await r.json();
    } catch (e) {
      return { success: false, 'error-codes': ['fetch-failed'], _error: e && e.message };
    }
  }

  /** Middleware chặn nếu Turnstile không qua. Gắn lên đúng route nhạy cảm. */
  function middleware(mopts = {}) {
    return async function turnstileMiddleware(req, res, next) {
      const token = (req.body && req.body[field]) || (req.headers && req.headers['cf-turnstile-response']);
      const out = await verify(token, getIp(req));
      if (!out.success) {
        // eslint-disable-next-line no-console
        console.warn('[site-guard] block turnstile', JSON.stringify({ path: req.path, codes: out['error-codes'] }));
        if ((req.headers.accept || '').includes('application/json')) {
          return res.status(statusCode).json({ error: mopts.message || message });
        }
        return res.status(statusCode).send(mopts.message || message);
      }
      req.turnstile = out;
      return next();
    };
  }

  return { verify, middleware };
}

/** Đoạn HTML gắn widget vào form (đặt trong <form>). Nhớ thêm script Turnstile 1 lần ở <head>. */
function turnstileWidget(siteKey, opts = {}) {
  const cls = opts.className || 'cf-turnstile';
  const theme = opts.theme ? ` data-theme="${opts.theme}"` : '';
  return `<div class="${cls}" data-sitekey="${siteKey}"${theme}></div>`;
}

/** Thẻ script Turnstile (đặt 1 lần trong <head> hoặc cuối <body>). */
function turnstileScript() {
  return '<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>';
}

module.exports = { createTurnstile, turnstileWidget, turnstileScript, VERIFY_URL };
