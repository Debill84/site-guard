'use strict';

/**
 * Test v0.2 Bước 1: headers mới + chặn bot AI + honeypot + cache CF.
 * Chạy: `node test/v02.js`
 */

const assert = require('assert');
const { resolveConfig } = require('../src/config');
const { buildSecurityHeaders } = require('../src/core/headers');
const { createGuard } = require('../src/core');
const { inspectUserAgent, isAiScraper } = require('../src/core/bot');
const { CACHE_PRESETS } = require('../src/core/perf');
const siteGuard = require('../src/express');

let pass = 0; let fail = 0;
function test(name, fn) {
  try { fn(); pass += 1; console.log('  ✅', name); }
  catch (e) { fail += 1; console.error('  ❌', name, '\n     ', e.message); }
}

// --- Headers mới (ngang helmet) ---
test('Phát Origin-Agent-Cluster, X-DNS-Prefetch-Control, X-Permitted-Cross-Domain-Policies', () => {
  const h = buildSecurityHeaders(resolveConfig().security, { isHttps: true });
  assert.strictEqual(h['Origin-Agent-Cluster'], '?1');
  assert.strictEqual(h['X-DNS-Prefetch-Control'], 'off');
  assert.strictEqual(h['X-Permitted-Cross-Domain-Policies'], 'none');
});

// --- Chặn bot AI (tùy chọn) ---
test('isAiScraper nhận diện GPTBot/ClaudeBot/PerplexityBot', () => {
  assert.ok(isAiScraper('Mozilla/5.0 (compatible; GPTBot/1.1)'));
  assert.ok(isAiScraper('ClaudeBot/1.0'));
  assert.ok(isAiScraper('PerplexityBot/1.0'));
  assert.ok(!isAiScraper('Mozilla/5.0 Chrome/120'));
});

test('blockAiScrapers TẮT mặc định → AI bot đi qua; BẬT → chặn', () => {
  const off = inspectUserAgent('GPTBot/1.1', { mode: 'block', allowSearchEngines: true });
  assert.strictEqual(off.block, false); // mặc định không chặn AI
  const on = inspectUserAgent('GPTBot/1.1', { mode: 'block', allowSearchEngines: true, blockAiScrapers: true });
  assert.strictEqual(on.block, true);
  assert.strictEqual(on.reason, 'ai-scraper');
});

test('Bật blockAiScrapers KHÔNG ảnh hưởng Googlebot (vẫn cho SEO)', () => {
  const g = inspectUserAgent('Googlebot/2.1', { mode: 'block', allowSearchEngines: true, blockAiScrapers: true });
  assert.strictEqual(g.block, false);
});

// --- Honeypot ---
function mockRes() {
  return { statusCode: 200, body: null, headers: {},
    status(c) { this.statusCode = c; return this; },
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    send(b) { this.body = b; return this; } };
}
test('Honeypot: ô ẩn trống → qua; có điền → chặn 400', () => {
  const { honeypot, HONEYPOT_FIELD } = siteGuard;
  const mw = honeypot();
  let passed = false;
  mw({ body: {}, path: '/c' }, mockRes(), () => { passed = true; });
  assert.ok(passed, 'người thật (trống) phải qua');
  const res = mockRes();
  let passed2 = false;
  mw({ body: { [HONEYPOT_FIELD]: 'http://spam' }, path: '/c' }, res, () => { passed2 = true; });
  assert.ok(!passed2, 'bot (có điền) KHÔNG được qua');
  assert.strictEqual(res.statusCode, 400);
});

test('honeypotField() trả HTML ô ẩn đúng tên field', () => {
  const { honeypotField, HONEYPOT_FIELD } = siteGuard;
  const html = honeypotField();
  assert.ok(html.includes(`name="${HONEYPOT_FIELD}"`));
  assert.ok(html.includes('position:absolute'));
});

// --- Cache CF helper ---
test('cache(preset) đặt Cache-Control đúng', () => {
  const { cache } = siteGuard;
  const res = mockRes();
  cache(CACHE_PRESETS.cdnDynamic)({}, res, () => {});
  assert.strictEqual(res.headers['cache-control'], 'public, max-age=0, s-maxage=60, stale-while-revalidate=600');
  assert.ok(CACHE_PRESETS.noStore.includes('no-store'));
});

// --- Không phá hành vi cũ ---
test('Bot xấu cũ (curl) vẫn bị chặn như v0.1', () => {
  const g = createGuard();
  const d = g.evaluate({ path: '/', ip: '1.1.1.1', userAgent: 'curl/8', isHttps: true, now: 1000 });
  assert.strictEqual(d.action, 'block');
});

console.log(`\nKết quả: ${pass} PASS, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
