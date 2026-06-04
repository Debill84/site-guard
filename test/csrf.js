'use strict';

/**
 * Test CSRF (double-submit + HMAC). Chạy: `node test/csrf.js`
 */

const assert = require('assert');
const core = require('../src/core/csrf');
const { csrfProtection } = require('../src/express/csrf');

let pass = 0; let fail = 0;
function test(name, fn) {
  try { fn(); pass += 1; console.log('  ✅', name); }
  catch (e) { fail += 1; console.error('  ❌', name, '\n     ', e.message); }
}

const SECRET = 'test-secret-123';

// --- Lõi ---
test('Ký + mở lại token khớp; sửa chữ ký → null', () => {
  const t = core.generateToken();
  const signed = core.makeSigned(t, SECRET);
  assert.strictEqual(core.verifySigned(signed, SECRET), t);
  assert.strictEqual(core.verifySigned(signed + 'x', SECRET), null); // sửa → hỏng
  assert.strictEqual(core.verifySigned(signed, 'secret-khac'), null); // sai secret
});

test('verifyRequest: token submit khớp cookie → true; lệch → false', () => {
  const t = core.generateToken();
  const signed = core.makeSigned(t, SECRET);
  assert.strictEqual(core.verifyRequest(signed, t, SECRET), true);
  assert.strictEqual(core.verifyRequest(signed, 'token-gia', SECRET), false);
  assert.strictEqual(core.verifyRequest(null, t, SECRET), false);
});

// --- Middleware Express ---
function mockRes() {
  return { statusCode: 200, body: null, headers: {},
    status(c) { this.statusCode = c; return this; },
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    getHeader(k) { return this.headers[k.toLowerCase()]; },
    send(b) { this.body = b; return this; } };
}
function cookieFromRes(res) {
  const sc = res.getHeader('set-cookie');
  const arr = Array.isArray(sc) ? sc : [sc];
  const c = arr.find((x) => x && x.startsWith('sg_csrf='));
  return c ? c.split(';')[0].split('=').slice(1).join('=') : null; // "sg_csrf=<val>"
}

test('GET phát cookie + req.csrfToken() hoạt động', () => {
  const mw = csrfProtection({ secret: SECRET });
  const req = { method: 'GET', path: '/form', headers: {} };
  const res = mockRes();
  let nexted = false;
  mw(req, res, () => { nexted = true; });
  assert.ok(nexted);
  assert.ok(cookieFromRes(res), 'phải set cookie sg_csrf');
  assert.ok(typeof req.csrfToken === 'function');
  assert.ok(req.csrfToken().length > 10, 'token có giá trị');
});

test('POST có token đúng (qua body) → qua', () => {
  const mw = csrfProtection({ secret: SECRET });
  // bước 1: GET lấy token + cookie
  const g = { method: 'GET', path: '/', headers: {} }; const gr = mockRes();
  mw(g, gr, () => {});
  const token = g.csrfToken();
  const cookieVal = decodeURIComponent(cookieFromRes(gr));
  // bước 2: POST kèm cookie + token
  const p = { method: 'POST', path: '/save', headers: { cookie: `sg_csrf=${encodeURIComponent(cookieVal)}` }, body: { _csrf: token } };
  const pr = mockRes(); let ok = false;
  mw(p, pr, () => { ok = true; });
  assert.ok(ok, 'POST token đúng phải qua');
  assert.strictEqual(pr.statusCode, 200);
});

test('POST thiếu/sai token → chặn 403', () => {
  const mw = csrfProtection({ secret: SECRET });
  const g = { method: 'GET', path: '/', headers: {} }; const gr = mockRes();
  mw(g, gr, () => {});
  const cookieVal = decodeURIComponent(cookieFromRes(gr));
  // sai token
  const p = { method: 'POST', path: '/save', headers: { cookie: `sg_csrf=${encodeURIComponent(cookieVal)}` }, body: { _csrf: 'sai' } };
  const pr = mockRes(); let ok = false;
  mw(p, pr, () => { ok = true; });
  assert.ok(!ok); assert.strictEqual(pr.statusCode, 403);
  // thiếu hẳn cookie + token
  const p2 = { method: 'POST', path: '/save', headers: {}, body: {} };
  const pr2 = mockRes(); let ok2 = false;
  mw(p2, pr2, () => { ok2 = true; });
  assert.ok(!ok2); assert.strictEqual(pr2.statusCode, 403);
});

test('POST chấp nhận token qua header X-CSRF-Token', () => {
  const mw = csrfProtection({ secret: SECRET });
  const g = { method: 'GET', path: '/', headers: {} }; const gr = mockRes();
  mw(g, gr, () => {});
  const token = g.csrfToken();
  const cookieVal = decodeURIComponent(cookieFromRes(gr));
  const p = { method: 'POST', path: '/api', headers: { cookie: `sg_csrf=${encodeURIComponent(cookieVal)}`, 'x-csrf-token': token }, body: {} };
  const pr = mockRes(); let ok = false;
  mw(p, pr, () => { ok = true; });
  assert.ok(ok); assert.strictEqual(pr.statusCode, 200);
});

test('ignorePaths bỏ qua kiểm (vd webhook)', () => {
  const mw = csrfProtection({ secret: SECRET, ignorePaths: ['/webhook/'] });
  const p = { method: 'POST', path: '/webhook/stripe', headers: {}, body: {} };
  const pr = mockRes(); let ok = false;
  mw(p, pr, () => { ok = true; });
  assert.ok(ok, 'webhook được bỏ qua CSRF');
});

test('Thiếu secret → ném lỗi rõ ràng', () => {
  assert.throws(() => csrfProtection({}), /secret/);
});

console.log(`\nKết quả: ${pass} PASS, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
