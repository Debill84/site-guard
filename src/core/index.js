'use strict';

const { resolveConfig } = require('../config');
const { buildSecurityHeaders } = require('./headers');
const { createRateLimiter } = require('./ratelimit');
const { inspectUserAgent } = require('./bot');
const perf = require('./perf');

/** path bắt đầu bằng bất kỳ tiền tố nào trong list? */
function startsWithAny(path, list) {
  if (!list || !list.length) return false;
  return list.some((p) => path.startsWith(p));
}

function defaultLog(logger, level, event) {
  if (typeof logger === 'function') {
    try { logger(level, event); } catch (_) { /* không để log làm chết request */ }
    return;
  }
  // Mặc định: chỉ in cảnh báo/chặn, không spam log lưu lượng bình thường
  if (level === 'block' || level === 'limit') {
    // eslint-disable-next-line no-console
    console.warn('[site-guard]', level, JSON.stringify(event));
  }
}

/**
 * Lõi SiteGuard — KHÔNG phụ thuộc framework.
 * Adapter (Express/Next.js) chỉ cần bóc ra reqInfo rồi áp dụng decision.
 *
 * @param {object} userConfig
 * @returns {{config:object, evaluate:Function}}
 */
function createGuard(userConfig) {
  const config = resolveConfig(userConfig);

  // Khởi tạo các limiter 1 lần (giữ state xuyên suốt vòng đời tiến trình)
  const ac = config.antiCrawl || {};
  const generalLimiter = ac.enabled && ac.rateLimit && ac.rateLimit.enabled
    ? createRateLimiter({ windowMs: ac.rateLimit.windowMs, max: ac.rateLimit.max })
    : null;
  const strictLimiter = ac.enabled && ac.strictPaths && ac.strictPaths.enabled
    ? createRateLimiter({ windowMs: ac.strictPaths.windowMs, max: ac.strictPaths.max })
    : null;

  /**
   * Đánh giá 1 request.
   * @param {{path:string, ip:string, userAgent:string, isHttps:boolean, now:number}} reqInfo
   * @returns {{action:'allow'|'block'|'limit', status?:number, message?:string,
   *            headers:Object<string,string>, retryAfterSec?:number, reason?:string}}
   */
  function evaluate(reqInfo) {
    const { path = '/', ip = 'unknown', userAgent = '', isHttps = false, now } = reqInfo;
    const headers = buildSecurityHeaders(config.security, { isHttps });

    // 0) Bypass toàn bộ
    if (startsWithAny(path, config.bypassPaths)) {
      return { action: 'allow', headers, reason: 'bypass' };
    }

    // 1) Chặn bot xấu (rẻ nhất → làm trước)
    if (ac.enabled && ac.bots && ac.bots.mode !== 'off') {
      const verdict = inspectUserAgent(userAgent, ac.bots);
      if (verdict.reason) {
        defaultLog(config.logger, verdict.block ? 'block' : 'log', {
          kind: 'bot', reason: verdict.reason, ip, path, ua: userAgent,
        });
      }
      if (verdict.block) {
        return {
          action: 'block', status: ac.bots.statusCode || 403,
          message: ac.bots.message || 'Forbidden', headers, reason: verdict.reason,
        };
      }
    }

    // 2) Rate-limit chặt cho path nhạy cảm
    if (strictLimiter && startsWithAny(path, ac.strictPaths.paths)) {
      const r = strictLimiter.hit(`${ip}`, now);
      if (r.limited) {
        const retryAfterSec = Math.ceil(r.retryAfterMs / 1000);
        defaultLog(config.logger, 'limit', { kind: 'strict', ip, path, count: r.count });
        return {
          action: 'limit', status: ac.strictPaths.statusCode || 429,
          message: ac.strictPaths.message, headers, retryAfterSec, reason: 'strict-rate-limit',
        };
      }
    }

    // 3) Rate-limit chung (bỏ qua asset tĩnh)
    if (generalLimiter && !startsWithAny(path, ac.rateLimit.skipPaths || [])) {
      const r = generalLimiter.hit(`${ip}`, now);
      if (r.limited) {
        const retryAfterSec = Math.ceil(r.retryAfterMs / 1000);
        defaultLog(config.logger, 'limit', { kind: 'general', ip, path, count: r.count });
        return {
          action: 'limit', status: ac.rateLimit.statusCode || 429,
          message: ac.rateLimit.message, headers, retryAfterSec, reason: 'rate-limit',
        };
      }
    }

    // 4) Cho qua — vẫn gắn security headers
    return { action: 'allow', headers };
  }

  return { config, evaluate };
}

module.exports = {
  createGuard,
  buildSecurityHeaders,
  createRateLimiter,
  inspectUserAgent,
  startsWithAny,
  ...perf,
};
