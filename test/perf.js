'use strict';

/**
 * Kiểm chứng gói TỐC ĐỘ: quyết định nén (lõi) + nén thật qua đầu cắm Express.
 * Nén xong GIẢI NÉN LẠI để chắc chắn nội dung không hỏng.
 * Chạy: `node test/perf.js`
 */

const assert = require('assert');
const zlib = require('zlib');
const { compressibleType, pickEncoding, cacheControlFor } = require('../src/core/perf');
const siteGuard = require('../src/express');

let pass = 0; let fail = 0;
function test(name, fn) {
  try { fn(); pass += 1; console.log('  ✅', name); }
  catch (e) { fail += 1; console.error('  ❌', name, '\n     ', e.message); }
}

// --- Lõi quyết định ---
test('compressibleType: văn bản nén, nhị phân thì không', () => {
  assert.ok(compressibleType('text/html; charset=utf-8'));
  assert.ok(compressibleType('application/json'));
  assert.ok(compressibleType('image/svg+xml'));
  assert.ok(!compressibleType('image/png'));
  assert.ok(!compressibleType('video/mp4'));
  assert.ok(!compressibleType(undefined));
});

test('pickEncoding: ưu tiên brotli, fallback gzip, tôn trọng q=0', () => {
  assert.strictEqual(pickEncoding('gzip, deflate, br', ['br', 'gzip']), 'br');
  assert.strictEqual(pickEncoding('gzip, deflate', ['br', 'gzip']), 'gzip');
  assert.strictEqual(pickEncoding('identity', ['br', 'gzip']), null);
  assert.strictEqual(pickEncoding('br;q=0, gzip', ['br', 'gzip']), 'gzip');
  assert.strictEqual(pickEncoding('', ['br', 'gzip']), null);
});

test('cacheControlFor: tắt → null; có rule prefix → đúng giá trị', () => {
  assert.strictEqual(cacheControlFor('/a', { enabled: false }), null);
  const cfg = { enabled: true, rules: [{ prefixes: ['/_next/static/'], value: 'immutable-x' }], htmlDefault: 'html-x' };
  assert.strictEqual(cacheControlFor('/_next/static/app.js', cfg), 'immutable-x');
  assert.strictEqual(cacheControlFor('/trang', cfg), 'html-x');
});

// --- Nén thật qua Express adapter (mock res dạng writable đơn giản) ---
function mockRes() {
  return {
    _headers: {}, statusCode: 200, _written: [], finished: null, method: 'GET',
    setHeader(k, v) { this._headers[k.toLowerCase()] = v; },
    getHeader(k) { return this._headers[k.toLowerCase()]; },
    removeHeader(k) { delete this._headers[k.toLowerCase()]; },
    status(c) { this.statusCode = c; return this; },
    type(t) { this.setHeader('Content-Type', t); return this; },
    write(chunk) { this._written.push(Buffer.from(chunk)); return true; },
    end(chunk) { if (chunk) this._written.push(Buffer.from(chunk)); this.finished = Buffer.concat(this._written); return this; },
  };
}
function mockReq(over = {}) {
  return {
    method: over.method || 'GET',
    path: over.path || '/', url: over.path || '/',
    ip: '8.8.8.8', secure: true, socket: { remoteAddress: '8.8.8.8' },
    headers: Object.assign(
      { 'user-agent': 'Mozilla/5.0 Chrome/120', 'accept-encoding': over.ae != null ? over.ae : 'br, gzip', 'x-forwarded-proto': 'https' },
      over.headers || {}
    ),
  };
}
function runResponse(mw, req, res, fn) {
  mw(req, res, () => { fn(res); res.end(); });
}

const BIG_HTML = '<!doctype html><html><body>' + 'A'.repeat(5000) + '</body></html>';

test('Nén HTML lớn bằng brotli → giải nén lại khớp 100%', () => {
  const mw = siteGuard();
  const req = mockReq({ ae: 'br, gzip' });
  const res = mockRes();
  runResponse(mw, req, res, (r) => { r.setHeader('Content-Type', 'text/html'); r.write(BIG_HTML); });
  assert.strictEqual(res.getHeader('content-encoding'), 'br');
  assert.ok((res.getHeader('vary') || '').toLowerCase().includes('accept-encoding'));
  assert.ok(res.finished.length < Buffer.byteLength(BIG_HTML), 'phải nhỏ hơn bản gốc');
  const back = zlib.brotliDecompressSync(res.finished).toString();
  assert.strictEqual(back, BIG_HTML);
});

test('Client chỉ nhận gzip → nén gzip, giải nén khớp', () => {
  const mw = siteGuard();
  const res = mockRes();
  runResponse(mw, mockReq({ ae: 'gzip' }), res, (r) => { r.setHeader('Content-Type', 'text/html'); r.write(BIG_HTML); });
  assert.strictEqual(res.getHeader('content-encoding'), 'gzip');
  assert.strictEqual(zlib.gunzipSync(res.finished).toString(), BIG_HTML);
});

test('Body nhỏ hơn ngưỡng → KHÔNG nén', () => {
  const mw = siteGuard();
  const res = mockRes();
  runResponse(mw, mockReq(), res, (r) => { r.setHeader('Content-Type', 'text/html'); r.write('<p>hi</p>'); });
  assert.strictEqual(res.getHeader('content-encoding'), undefined);
  assert.strictEqual(res.finished.toString(), '<p>hi</p>');
});

test('Kiểu nhị phân (image/png) → KHÔNG nén', () => {
  const mw = siteGuard();
  const res = mockRes();
  const bin = Buffer.alloc(5000, 1);
  runResponse(mw, mockReq(), res, (r) => { r.setHeader('Content-Type', 'image/png'); r.write(bin); });
  assert.strictEqual(res.getHeader('content-encoding'), undefined);
  assert.strictEqual(res.finished.length, 5000);
});

test('Client không nhận nén (identity) → KHÔNG nén', () => {
  const mw = siteGuard();
  const res = mockRes();
  runResponse(mw, mockReq({ ae: 'identity' }), res, (r) => { r.setHeader('Content-Type', 'text/html'); r.write(BIG_HTML); });
  assert.strictEqual(res.getHeader('content-encoding'), undefined);
  assert.strictEqual(res.finished.toString(), BIG_HTML);
});

console.log(`\nKết quả: ${pass} PASS, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
