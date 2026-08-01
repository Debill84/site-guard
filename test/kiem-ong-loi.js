'use strict';

/**
 * Kiểm chứng CHÍNH CÁI CHỐT `bin/kiem-ong-loi.js`.
 *
 * Thước tự nó cũng là một thứ phải đem ra đo — nhà này đã trả giá 3 lần vì tin thước mà không
 * nghiệm thước (chuông kêu oan, xanh giả, đứt cầu require). Bài này dựng repo GIẢ trong thư mục
 * tạm rồi chạy cái chốt như CI chạy, đòi ĐỎ đúng chỗ đáng đỏ và XANH khi mọi thứ đúng.
 *
 * Chạy: `node test/kiem-ong-loi.js`
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const CHOT = path.resolve(__dirname, '../bin/kiem-ong-loi.js');

let pass = 0; let fail = 0;
function test(name, fn) {
  try { fn(); pass += 1; console.log('  ✅', name); }
  catch (e) { fail += 1; console.error('  ❌', name, '\n     ', e.message); }
}

const SERVER_TOT = `
const { createObserver } = require('@suga/site-guard/observe');
const observe = createObserver({ slug: 'repo-gia', service: 'repo-gia-web' });
app.use(observe.expressError());
`;

// Dựng 1 repo GIẢ rồi chạy cái chốt trong đó. Trả về { ma, out }.
function chayTrongRepoGia({ server = SERVER_TOT, them = {} } = {}) {
  const thuMuc = fs.mkdtempSync(path.join(os.tmpdir(), 'kiem-ong-loi-'));
  try {
    fs.writeFileSync(path.join(thuMuc, 'server.js'), server);
    for (const [ten, noi] of Object.entries(them)) {
      const d = path.join(thuMuc, ten);
      fs.mkdirSync(path.dirname(d), { recursive: true });
      fs.writeFileSync(d, noi);
    }
    const r = spawnSync(process.execPath, [CHOT, 'server.js'], { cwd: thuMuc, encoding: 'utf8' });
    return { ma: r.status, out: (r.stdout || '') + (r.stderr || '') };
  } finally { fs.rmSync(thuMuc, { recursive: true, force: true }); }
}

test('Repo lành → XANH (mã thoát 0)', () => {
  const { ma, out } = chayTrongRepoGia();
  assert.strictEqual(ma, 0, 'chốt kêu oan trên repo lành:\n' + out);
  assert.ok(/0 FAIL/.test(out));
});

test('Gỡ `app.use(observe.expressError())` → ĐỎ', () => {
  const { ma, out } = chayTrongRepoGia({
    server: SERVER_TOT.replace('app.use(observe.expressError());', ''),
  });
  assert.strictEqual(ma, 1, 'gỡ middleware mà chốt vẫn xanh — chốt mù');
  assert.ok(/expressError/.test(out));
});

test('Gọi `.expressError()` nhưng KHÔNG `app.use(...)` → ĐỎ', () => {
  const { ma } = chayTrongRepoGia({
    server: SERVER_TOT.replace('app.use(observe.expressError());', 'const mw = observe.expressError();'),
  });
  assert.strictEqual(ma, 1);
});

test('Gỡ hẳn `createObserver` → ĐỎ', () => {
  const { ma } = chayTrongRepoGia({ server: '// trống trơn\n' });
  assert.strictEqual(ma, 1);
});

test('`slug` RỖNG → ĐỎ (SugaHub không biết lỗi của web nào)', () => {
  const { ma, out } = chayTrongRepoGia({
    server: SERVER_TOT.replace("slug: 'repo-gia'", "slug: ''"),
  });
  assert.strictEqual(ma, 1);
  assert.ok(/slug/i.test(out));
});

test('Quay lại nạp BẢN CHÉP TAY (`require("./lib/observe")`) → ĐỎ', () => {
  const { ma, out } = chayTrongRepoGia({
    server: SERVER_TOT.replace(
      "require('@suga/site-guard/observe')", "require('./lib/observe')",
    ),
  });
  assert.strictEqual(ma, 1);
  assert.ok(/chép tay|@suga\/site-guard\/observe/.test(out));
});

test('Bản chép tay MỌC LẠI ở `lib/observe.js` → ĐỎ (dù server.js vẫn đúng)', () => {
  const { ma, out } = chayTrongRepoGia({ them: { 'lib/observe.js': '// bản chép tay thứ 5\n' } });
  assert.strictEqual(ma, 1, 'chép tay mọc lại mà chốt im — đúng cái bệnh đang chữa');
  assert.ok(/mọc lại/.test(out));
});

test('`lib/` không tồn tại thì KHÔNG kêu oan', () => {
  const { ma } = chayTrongRepoGia();
  assert.strictEqual(ma, 0);
});

test('Thiếu hẳn tệp máy chủ → ĐỎ, không nổ trần', () => {
  const thuMuc = fs.mkdtempSync(path.join(os.tmpdir(), 'kiem-ong-loi-'));
  try {
    const r = spawnSync(process.execPath, [CHOT, 'khong-co.js'], { cwd: thuMuc, encoding: 'utf8' });
    assert.strictEqual(r.status, 1);
    assert.ok(/không có tệp/.test(r.stdout + r.stderr));
  } finally { fs.rmSync(thuMuc, { recursive: true, force: true }); }
});

console.log(`\nKết quả: ${pass} PASS, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
