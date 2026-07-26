'use strict';

/**
 * Test "sân nào + khoá phiên nào" (v0.3.0) — 2 CHIỀU: vừa kiểm CHẶN, vừa kiểm CHO QUA.
 * Đúc từ 2 sự cố 26/07/2026 (Santa lộ mã OTP · HiDental demo quyền CHỦ): cấu hình vắng mặt
 * KHÔNG được ngã về MỞ. Chạy: `node test/moi-truong.js`
 */

const assert = require('assert');
const { laBanThat, khoaPhien } = require('../src/core/moi-truong');
const core = require('../src/core');

let pass = 0; let fail = 0;
function test(name, fn) {
  try { fn(); pass += 1; console.log('  ✅', name); }
  catch (e) { fail += 1; console.error('  ❌', name, '\n     ', e.message); }
}

const IM = { warn() {}, error() {} }; // log im để test khỏi ồn
const DEV = 'dev_secret_change_me';
const THAT = 'x'.repeat(48);

// --- laBanThat: nhận ra BẢN THẬT qua nhiều đường, KHÔNG chỉ NODE_ENV ---
test('Máy thợ trắng (không biến nào) ⇒ KHÔNG phải bản thật', () => {
  assert.strictEqual(laBanThat({}), false);
});
test('NODE_ENV=production ⇒ bản thật', () => {
  assert.strictEqual(laBanThat({ NODE_ENV: 'production' }), true);
});
test('KHÔNG có NODE_ENV nhưng có dấu Railway ⇒ VẪN là bản thật (ca thật của 3 site Suga)', () => {
  assert.strictEqual(laBanThat({ RAILWAY_SERVICE_ID: 'abc' }), true);
});
test('Rời Railway sang Fly/Render/Heroku/K8s/AWS vẫn nhận ra bản thật', () => {
  for (const k of ['FLY_APP_NAME', 'RENDER', 'DYNO', 'K_SERVICE', 'AWS_LAMBDA_FUNCTION_NAME', 'DEPLOYED']) {
    assert.strictEqual(laBanThat({ [k]: '1' }), true, `thiếu nhận diện qua ${k}`);
  }
});
test('Biến đặt TÊN SÂN = production ⇒ bản thật (không phụ thuộc nhà cung cấp)', () => {
  assert.strictEqual(laBanThat({ APP_ENV: 'production' }), true);
  assert.strictEqual(laBanThat({ ENVIRONMENT: 'PRODUCTION' }), true);
});
test('Tên sân KHÁC production (staging/preview) mà không dấu máy chủ ⇒ không tính là bản thật', () => {
  assert.strictEqual(laBanThat({ APP_ENV: 'staging' }), false);
});

// --- khoaPhien: CHO QUA khi khoá thật ---
test('Có SESSION_SECRET đủ dài ⇒ dùng đúng khoá đó (phiên sống qua restart)', () => {
  const r = khoaPhien({ env: { SESSION_SECRET: THAT, RAILWAY_SERVICE_ID: 'x' }, khoaDev: DEV, log: IM });
  assert.strictEqual(r.nguon, 'env');
  assert.strictEqual(r.khoa, THAT);
});
test('Máy thợ không khai gì ⇒ dùng khoá DEV cho tiện (KHÔNG bắt thợ đặt biến)', () => {
  const r = khoaPhien({ env: {}, khoaDev: DEV, log: IM });
  assert.strictEqual(r.nguon, 'dev');
  assert.strictEqual(r.khoa, DEV);
});

// --- khoaPhien: CHẶN trên bản thật (đây là cái lỗ đang bịt) ---
test('BẢN THẬT + THIẾU biến ⇒ KHÔNG rơi về khoá trong repo, sinh khoá ngẫu nhiên', () => {
  const r = khoaPhien({ env: { RAILWAY_SERVICE_ID: 'x' }, khoaDev: DEV, log: IM });
  assert.strictEqual(r.nguon, 'ngau-nhien');
  assert.notStrictEqual(r.khoa, DEV);
  assert.strictEqual(r.khoa.length, 64);
});
test('BẢN THẬT + biến ĐANG LÀ đúng khoá dev trong repo ⇒ vẫn từ chối', () => {
  const r = khoaPhien({ env: { SESSION_SECRET: DEV, NODE_ENV: 'production' }, khoaDev: DEV, log: IM });
  assert.strictEqual(r.nguon, 'ngau-nhien');
  assert.match(r.lyDo, /khoá DEV/);
});
test('BẢN THẬT + khoá quá ngắn ⇒ từ chối', () => {
  const r = khoaPhien({ env: { SESSION_SECRET: 'abc', DEPLOYED: '1' }, khoaDev: DEV, log: IM });
  assert.strictEqual(r.nguon, 'ngau-nhien');
  assert.match(r.lyDo, /ngắn/);
});
test('BẢN THẬT + thiếu khoá ⇒ báo về Hộp lỗi (baoLoi được gọi)', () => {
  let n = 0;
  khoaPhien({ env: { DEPLOYED: '1' }, khoaDev: DEV, log: IM, baoLoi: () => { n += 1; } });
  assert.strictEqual(n, 1);
});
test('baoLoi NÉM cũng không được làm chết boot', () => {
  const r = khoaPhien({ env: { DEPLOYED: '1' }, khoaDev: DEV, log: IM, baoLoi: () => { throw new Error('ống lỗi tắc'); } });
  assert.strictEqual(r.nguon, 'ngau-nhien');
});
test('KHÔNG bao giờ trả về khoá rỗng (cookie-session sẽ ném)', () => {
  for (const env of [{}, { DEPLOYED: '1' }, { SESSION_SECRET: '' }]) {
    assert.ok(khoaPhien({ env, khoaDev: DEV, log: IM }).khoa.length >= 16);
  }
});
test('Không truyền khoaDev + máy thợ ⇒ vẫn có khoá (ngẫu nhiên), không rỗng', () => {
  const r = khoaPhien({ env: {}, log: IM });
  assert.strictEqual(r.nguon, 'ngau-nhien');
  assert.strictEqual(r.khoa.length, 64);
});

// --- xuất khẩu ---
test('Xuất từ `@suga/site-guard/core` (1 thước duy nhất cho mọi site)', () => {
  assert.strictEqual(typeof core.laBanThat, 'function');
  assert.strictEqual(typeof core.khoaPhien, 'function');
});

console.log(`\nKết quả: ${pass} PASS, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
