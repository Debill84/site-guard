'use strict';

/**
 * Test Turnstile với fetch GIẢ LẬP (không gọi mạng thật). Chạy: `node test/turnstile.js`
 */

const assert = require('assert');
const { createTurnstile, turnstileWidget, turnstileScript } = require('../src/express/turnstile');

let pass = 0; let fail = 0;
function test(name, fn) { Promise.resolve(); }
const tests = [];
function reg(name, fn) { tests.push([name, fn]); }

// fetch giả: trả success theo token
function fakeFetch(expectSuccess) {
  return async (url, init) => {
    const body = init.body.toString();
    assert.ok(body.includes('secret='), 'phải gửi secret');
    assert.ok(body.includes('response='), 'phải gửi response token');
    return { json: async () => ({ success: expectSuccess, 'error-codes': expectSuccess ? [] : ['invalid-input-response'] }) };
  };
}

function mockRes() {
  return { statusCode: 200, body: null, headers: {},
    status(c) { this.statusCode = c; return this; },
    json(o) { this.body = o; return this; },
    send(b) { this.body = b; return this; } };
}

reg('verify(token) gọi đúng API + trả success', async () => {
  const ts = createTurnstile({ secret: 'sk', fetch: fakeFetch(true) });
  const out = await ts.verify('tok-123', '1.2.3.4');
  assert.strictEqual(out.success, true);
});

reg('verify thiếu token → success=false, không gọi mạng', async () => {
  let called = false;
  const ts = createTurnstile({ secret: 'sk', fetch: async () => { called = true; return { json: async () => ({}) }; } });
  const out = await ts.verify('');
  assert.strictEqual(out.success, false);
  assert.strictEqual(called, false);
});

reg('middleware: token hợp lệ → next()', async () => {
  const ts = createTurnstile({ secret: 'sk', fetch: fakeFetch(true) });
  const mw = ts.middleware();
  const req = { body: { 'cf-turnstile-response': 'tok' }, headers: {}, path: '/contact' };
  const res = mockRes(); let ok = false;
  await mw(req, res, () => { ok = true; });
  assert.ok(ok); assert.strictEqual(res.statusCode, 200);
  assert.ok(req.turnstile && req.turnstile.success);
});

reg('middleware: token sai → chặn 403', async () => {
  const ts = createTurnstile({ secret: 'sk', fetch: fakeFetch(false) });
  const mw = ts.middleware();
  const req = { body: { 'cf-turnstile-response': 'bad' }, headers: {}, path: '/contact' };
  const res = mockRes(); let ok = false;
  await mw(req, res, () => { ok = true; });
  assert.ok(!ok); assert.strictEqual(res.statusCode, 403);
});

reg('middleware: fetch lỗi mạng → fail (403), không vỡ', async () => {
  const ts = createTurnstile({ secret: 'sk', fetch: async () => { throw new Error('net down'); } });
  const mw = ts.middleware();
  const req = { body: { 'cf-turnstile-response': 'tok' }, headers: {}, path: '/c' };
  const res = mockRes(); let ok = false;
  await mw(req, res, () => { ok = true; });
  assert.ok(!ok); assert.strictEqual(res.statusCode, 403);
});

reg('Thiếu secret → ném lỗi', async () => {
  assert.throws(() => createTurnstile({ fetch: fakeFetch(true) }), /secret/);
});

reg('widget + script trả HTML đúng', async () => {
  const w = turnstileWidget('0xSITEKEY', { theme: 'light' });
  assert.ok(w.includes('data-sitekey="0xSITEKEY"'));
  assert.ok(w.includes('cf-turnstile'));
  assert.ok(turnstileScript().includes('challenges.cloudflare.com/turnstile'));
});

(async () => {
  for (const [name, fn] of tests) {
    try { await fn(); pass += 1; console.log('  ✅', name); }
    catch (e) { fail += 1; console.error('  ❌', name, '\n     ', e.message); }
  }
  console.log(`\nKết quả: ${pass} PASS, ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
})();
