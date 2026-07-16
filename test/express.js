'use strict';

/**
 * Kiểm chứng đầu cắm Express bằng req/res GIẢ LẬP (không mở cổng mạng).
 * Xác nhận: gắn security headers, ẩn X-Powered-By, chặn bot (403), giới hạn (429 + Retry-After).
 * Chạy: `node test/express.js`
 */

const assert = require('assert');
const siteGuard = require('../src/express');
const { forwardedClientIp } = require('../src/core/ip');

let pass = 0; let fail = 0;
function test(name, fn) {
  try { fn(); pass += 1; console.log('  ✅', name); }
  catch (e) { fail += 1; console.error('  ❌', name, '\n     ', e.message); }
}

// res giả lập tối thiểu, đủ cho middleware dùng
function mockRes() {
  return {
    headers: {}, statusCode: 200, body: null, ended: false,
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    removeHeader(k) { delete this.headers[k.toLowerCase()]; },
    getHeader(k) { return this.headers[k.toLowerCase()]; },
    status(c) { this.statusCode = c; return this; },
    type() { return this; },
    send(b) { this.body = b; this.ended = true; return this; },
    json(o) { this.body = o; this.ended = true; return this; },
  };
}
function mockReq(over = {}) {
  return {
    path: over.path || '/',
    url: over.path || '/',
    ip: over.ip || '9.9.9.9',
    secure: over.secure || false,
    socket: { remoteAddress: over.ip || '9.9.9.9' },
    headers: Object.assign(
      { 'user-agent': over.ua != null ? over.ua : 'Mozilla/5.0 Chrome/120', 'x-forwarded-proto': 'https' },
      over.headers || {}
    ),
  };
}
function run(mw, req) {
  const res = mockRes();
  let nexted = false;
  mw(req, res, () => { nexted = true; });
  return { res, nexted };
}

test('Request thường: next() + có security headers + ẩn X-Powered-By', () => {
  const mw = siteGuard();
  const res0 = mockRes();
  res0.setHeader('X-Powered-By', 'Express'); // giả lập Express đã set
  let nexted = false;
  mw(mockReq(), res0, () => { nexted = true; });
  assert.ok(nexted, 'phải gọi next()');
  assert.strictEqual(res0.getHeader('x-content-type-options'), 'nosniff');
  assert.strictEqual(res0.getHeader('strict-transport-security') != null, true);
  assert.strictEqual(res0.getHeader('x-powered-by'), undefined, 'X-Powered-By phải bị xóa');
});

test('Bot xấu (curl): chặn 403, KHÔNG next()', () => {
  const mw = siteGuard();
  const { res, nexted } = run(mw, mockReq({ ua: 'curl/8.0' }));
  assert.strictEqual(nexted, false);
  assert.strictEqual(res.statusCode, 403);
});

test('IP đọc từ X-Forwarded-For khi sau proxy', () => {
  const mw = siteGuard({ antiCrawl: { rateLimit: { max: 1, windowMs: 60000 }, strictPaths: { enabled: false } } });
  const ua = 'Mozilla/5.0 Chrome/120';
  // 2 IP khác nhau qua XFF → không đụng nhau (mỗi IP còn quota riêng)
  const a1 = run(mw, mockReq({ ua, headers: { 'x-forwarded-for': '11.11.11.11' } }));
  const b1 = run(mw, mockReq({ ua, headers: { 'x-forwarded-for': '22.22.22.22' } }));
  assert.strictEqual(a1.nexted, true);
  assert.strictEqual(b1.nexted, true);
  // IP 11 gọi lần 2 → vượt ngưỡng (max=1) → 429
  const a2 = run(mw, mockReq({ ua, headers: { 'x-forwarded-for': '11.11.11.11' } }));
  assert.strictEqual(a2.nexted, false);
  assert.strictEqual(a2.res.statusCode, 429);
  assert.ok(a2.res.getHeader('retry-after'), 'phải có Retry-After');
});

// forwardedClientIp: chọn ĐUÔI PHẢI (proxy nối vào), KHÔNG lấy trái-nhất (client bịa)
test('forwardedClientIp: 1 hop → lấy phần tử phải-nhất, bỏ phần client bịa bên trái', () => {
  assert.strictEqual(forwardedClientIp('1.2.3.4, 100.100.100.100', true), '100.100.100.100');
  assert.strictEqual(forwardedClientIp('9.9.9.9', true), '9.9.9.9');
  assert.strictEqual(forwardedClientIp('  a ,  b ,  c ', true), 'c');
  assert.strictEqual(forwardedClientIp('', true), null);
  assert.strictEqual(forwardedClientIp(undefined, true), null);
});
test('forwardedClientIp: N hop → lùi N bậc từ phải; thiếu mục thì về trái-nhất', () => {
  assert.strictEqual(forwardedClientIp('client, cf, railway', 2), 'cf');   // 2 proxy tin cậy
  assert.strictEqual(forwardedClientIp('only-one', 2), 'only-one');        // ít hơn số hop
});

test('trustProxy=2 (Cloudflare→Railway): khóa theo client THẬT ở giữa, không phải IP Cloudflare', () => {
  const mw = siteGuard({ trustProxy: 2, antiCrawl: { rateLimit: { max: 1, windowMs: 60000 }, strictPaths: { enabled: false } } });
  const ua = 'Mozilla/5.0 Chrome/120';
  const CF = '172.16.0.9'; // IP Cloudflare (phải-nhất, dùng chung nhiều khách)
  // XFF = "clientThật, IP-Cloudflare"; 2 hop tin cậy → lấy client thật (bậc 2 từ phải)
  const a1 = run(mw, mockReq({ ua, headers: { 'x-forwarded-for': `55.55.55.55, ${CF}` } }));
  const b1 = run(mw, mockReq({ ua, headers: { 'x-forwarded-for': `66.66.66.66, ${CF}` } }));
  assert.strictEqual(a1.nexted, true, 'client 55 lần đầu qua');
  assert.strictEqual(b1.nexted, true, 'client 66 KHÁC người → còn quota riêng (không bị gộp theo IP Cloudflare)');
  const a2 = run(mw, mockReq({ ua, headers: { 'x-forwarded-for': `55.55.55.55, ${CF}` } }));
  assert.strictEqual(a2.res.statusCode, 429, 'client 55 lần 2 → dính giới hạn của chính nó');
});

test('CHỐNG LÁCH RATE-LIMIT: đổi IP giả ở đầu XFF vẫn KHÔNG lách được (cùng client thật)', () => {
  const mw = siteGuard({ antiCrawl: { rateLimit: { max: 1, windowMs: 60000 }, strictPaths: { enabled: false } } });
  const ua = 'Mozilla/5.0 Chrome/120';
  const REAL = '203.0.113.7'; // IP thật do proxy Railway nối vào ĐUÔI PHẢI
  // Lần 1: kẻ tấn công bịa '1.1.1.1' ở đầu → key phải là REAL (đuôi phải)
  const r1 = run(mw, mockReq({ ua, headers: { 'x-forwarded-for': `1.1.1.1, ${REAL}` } }));
  assert.strictEqual(r1.nexted, true, 'lần đầu cho qua');
  // Lần 2: đổi IP bịa sang '2.2.2.2' (cùng client thật) → PHẢI dính 429, không được reset quota
  const r2 = run(mw, mockReq({ ua, headers: { 'x-forwarded-for': `2.2.2.2, ${REAL}` } }));
  assert.strictEqual(r2.nexted, false, 'đổi IP giả KHÔNG được cấp quota mới');
  assert.strictEqual(r2.res.statusCode, 429);
});

console.log(`\nKết quả: ${pass} PASS, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
