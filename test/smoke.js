'use strict';

/**
 * Smoke test thuần Node (không cần framework, không cần network).
 * Chạy: `node test/smoke.js` → in PASS/FAIL từng case, exit 1 nếu có lỗi.
 */

const assert = require('assert');
const { createGuard } = require('../src/core');
const { buildSecurityHeaders } = require('../src/core/headers');

let pass = 0;
let fail = 0;
function test(name, fn) {
  try { fn(); pass += 1; console.log('  ✅', name); }
  catch (e) { fail += 1; console.error('  ❌', name, '\n     ', e.message); }
}

const T0 = 1000000; // mốc thời gian giả lập (ms)

// 1) Security headers
test('HSTS chỉ gửi khi HTTPS', () => {
  const cfg = require('../src/config').resolveConfig();
  const http = buildSecurityHeaders(cfg.security, { isHttps: false });
  const https = buildSecurityHeaders(cfg.security, { isHttps: true });
  assert.ok(!http['Strict-Transport-Security'], 'HTTP không nên có HSTS');
  assert.ok(https['Strict-Transport-Security'], 'HTTPS phải có HSTS');
  assert.strictEqual(http['X-Content-Type-Options'], 'nosniff');
  assert.strictEqual(http['X-Frame-Options'], 'SAMEORIGIN');
});

test('CSP tắt mặc định, bật được qua config', () => {
  const { resolveConfig } = require('../src/config');
  const off = buildSecurityHeaders(resolveConfig().security, {});
  assert.ok(!off['Content-Security-Policy']);
  const on = buildSecurityHeaders(
    resolveConfig({ security: { headers: { contentSecurityPolicy: "default-src 'self'" } } }).security, {}
  );
  assert.strictEqual(on['Content-Security-Policy'], "default-src 'self'");
});

// 2) Chặn bot
test('Chặn bot xấu (curl), cho qua Googlebot, cho qua trình duyệt thật', () => {
  const g = createGuard();
  const base = { path: '/', ip: '1.1.1.1', isHttps: true, now: T0 };
  assert.strictEqual(g.evaluate({ ...base, userAgent: 'curl/8.0' }).action, 'block');
  assert.strictEqual(g.evaluate({ ...base, userAgent: 'Mozilla/5.0 (compatible; Googlebot/2.1)' }).action, 'allow');
  assert.strictEqual(
    g.evaluate({ ...base, userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/120' }).action, 'allow'
  );
});

test('Chặn request không có User-Agent', () => {
  const g = createGuard();
  const d = g.evaluate({ path: '/', ip: '2.2.2.2', userAgent: '', isHttps: true, now: T0 });
  assert.strictEqual(d.action, 'block');
  assert.strictEqual(d.reason, 'empty-user-agent');
});

// 3) Rate-limit chung
test('Rate-limit chung chặn sau khi vượt ngưỡng, asset được bỏ qua', () => {
  const g = createGuard({ antiCrawl: { rateLimit: { max: 3, windowMs: 60000 } } });
  const ua = 'Mozilla/5.0 Chrome/120';
  const req = (i) => ({ path: '/page', ip: '3.3.3.3', userAgent: ua, isHttps: true, now: T0 + i });
  assert.strictEqual(g.evaluate(req(0)).action, 'allow');
  assert.strictEqual(g.evaluate(req(1)).action, 'allow');
  assert.strictEqual(g.evaluate(req(2)).action, 'allow');
  assert.strictEqual(g.evaluate(req(3)).action, 'limit'); // lần thứ 4 vượt
  // Asset tĩnh KHÔNG bị tính
  assert.strictEqual(
    g.evaluate({ path: '/assets/app.css', ip: '3.3.3.3', userAgent: ua, isHttps: true, now: T0 + 4 }).action,
    'allow'
  );
});

test('Cửa sổ thời gian reset cho phép lại', () => {
  const g = createGuard({ antiCrawl: { rateLimit: { max: 1, windowMs: 1000 }, strictPaths: { enabled: false } } });
  const ua = 'Mozilla/5.0 Chrome/120';
  const mk = (t) => ({ path: '/x', ip: '4.4.4.4', userAgent: ua, isHttps: true, now: t });
  assert.strictEqual(g.evaluate(mk(T0)).action, 'allow');
  assert.strictEqual(g.evaluate(mk(T0 + 10)).action, 'limit');
  assert.strictEqual(g.evaluate(mk(T0 + 2000)).action, 'allow'); // qua cửa sổ → reset
});

// 4) Rate-limit chặt cho path nhạy cảm
test('Strict path (/admin/login) chặt hơn path thường', () => {
  const g = createGuard({
    antiCrawl: {
      rateLimit: { max: 1000, windowMs: 60000 },
      strictPaths: { max: 2, windowMs: 300000, paths: ['/admin/login'] },
    },
  });
  const ua = 'Mozilla/5.0 Chrome/120';
  const mk = (i) => ({ path: '/admin/login', ip: '5.5.5.5', userAgent: ua, isHttps: true, now: T0 + i });
  assert.strictEqual(g.evaluate(mk(0)).action, 'allow');
  assert.strictEqual(g.evaluate(mk(1)).action, 'allow');
  assert.strictEqual(g.evaluate(mk(2)).action, 'limit'); // lần 3 vượt ngưỡng strict
  assert.strictEqual(g.evaluate(mk(2)).reason, 'strict-rate-limit');
});

// 5) Bypass + tắt nhóm
test('bypassPaths cho qua hoàn toàn', () => {
  const g = createGuard({ bypassPaths: ['/webhook/'] });
  const d = g.evaluate({ path: '/webhook/stripe', ip: '6.6.6.6', userAgent: 'curl/8', isHttps: true, now: T0 });
  assert.strictEqual(d.action, 'allow');
  assert.strictEqual(d.reason, 'bypass');
});

test('Tắt cả antiCrawl thì không chặn gì', () => {
  const g = createGuard({ antiCrawl: { enabled: false } });
  const d = g.evaluate({ path: '/', ip: '7.7.7.7', userAgent: 'curl/8', isHttps: true, now: T0 });
  assert.strictEqual(d.action, 'allow');
});

console.log(`\nKết quả: ${pass} PASS, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
