'use strict';

/**
 * Đầu cắm Next.js cho SiteGuard.
 *
 * THIẾT KẾ: không phụ thuộc cứng vào `next/server` (để package nhẹ & không kẹt version).
 * Hàm trả về 1 "evaluator" nhận chuẩn Web `Request` và trả quyết định, để file
 * `src/middleware.ts` của site tự ráp với NextResponse.
 *
 * Cách dùng (src/middleware.ts):
 *   import { NextResponse } from 'next/server';
 *   import { createNextGuard } from '@suga/site-guard/nextjs';
 *   const guard = createNextGuard({ ... });
 *   export function middleware(req) {
 *     const d = guard.evaluate(req);
 *     if (d.action !== 'allow') {
 *       return new NextResponse(d.message || 'Forbidden', { status: d.status, headers: d.headers });
 *     }
 *     const res = NextResponse.next();
 *     for (const [k, v] of Object.entries(d.headers)) res.headers.set(k, v);
 *     return res;
 *   }
 *   export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
 *
 * LƯU Ý: chạy ở Node runtime (rate-limit trong-bộ-nhớ). Với Edge runtime nhiều
 * instance, state không chia sẻ — khi đó cần store ngoài (Bước sau).
 */

const { createGuard } = require('../core');

function getClientIp(req, trustProxy) {
  const headers = req.headers;
  const get = (k) => (typeof headers.get === 'function' ? headers.get(k) : headers[k]);
  if (trustProxy) {
    const xff = get('x-forwarded-for');
    if (xff) return String(xff).split(',')[0].trim();
    const real = get('x-real-ip');
    if (real) return String(real).trim();
  }
  return 'unknown';
}

function createNextGuard(userConfig) {
  const guard = createGuard(userConfig);
  const cfg = guard.config;
  const trustProxy = cfg.trustProxy !== false;

  /**
   * @param {Request} req - chuẩn Web Request (NextRequest tương thích)
   * @returns decision từ core (kèm headers đã sẵn để gắn)
   */
  function evaluate(req) {
    const headers = req.headers;
    const get = (k) => (typeof headers.get === 'function' ? headers.get(k) : headers[k]);
    let path = '/';
    try { path = new URL(req.url).pathname; } catch (_) { /* giữ '/' */ }

    const proto = get('x-forwarded-proto');
    const decision = guard.evaluate({
      path,
      ip: getClientIp(req, trustProxy),
      userAgent: get('user-agent') || '',
      isHttps: proto ? String(proto).split(',')[0].trim() === 'https' : true,
      now: Date.now(),
    });
    if (decision.retryAfterSec != null) decision.headers['Retry-After'] = String(decision.retryAfterSec);
    return decision;
  }

  return { config: cfg, evaluate };
}

module.exports = { createNextGuard };
module.exports.createNextGuard = createNextGuard;
