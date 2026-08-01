#!/usr/bin/env node
'use strict';

/**
 * `kiem-ong-loi` — CHỐT CHỐNG GỠ cho ống gửi lỗi.
 *
 * Ống lỗi là thứ **chỉ chạy khi web đã hỏng**: gỡ nó ra thì trang vẫn đẹp, test vẫn xanh,
 * chỉ có hộp lỗi SugaHub im lặng — và im lặng thì không ai đi báo. Đúng loại phải có thước canh.
 *
 * Thước này ở KHO CHUNG (không chép vào từng site) vì nó vốn sinh ra để chữa đúng bệnh
 * "chép tay 4 bản giống hệt". Chép nó đi 4 lần là tự dẫm lại vết cũ.
 *
 * DÙNG (package.json của site):
 *   "test:ong-loi": "kiem-ong-loi server.js"
 * rồi NỐI vào cổng (`npm test` / `npm run build`) — thước không được cổng gọi là thước chết.
 *
 * Đo gì:
 *   ① lối vào chung `@suga/site-guard/observe` nạp được (ghim tag sai / gói thiếu là lòi ra)
 *   ② ống lỗi CHẠY THẬT: bắn 1 lượt, và next(err) vẫn được gọi (không đọc chữ — chạy thật)
 *   ③ server có TẠO observer, và khai `slug` KHÁC RỖNG (slug rỗng ⇒ SugaHub không biết của ai)
 *   ④ server có CẮM `expressError()` vào Express
 *   ⑤ server lấy ống lỗi TỪ GÓI CHUNG, không phải bản chép tay trong repo
 *   ⑥ repo KHÔNG còn `lib/observe.*` (bản chép tay quay lại là đỏ ngay)
 */

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const TEP = args.length ? args : ['server.js'];

let pass = 0; let fail = 0;
function test(ten, fn) {
  try { fn(); pass += 1; console.log('  ✅', ten); }
  catch (e) { fail += 1; console.error('  ❌', ten, '\n     ', e.message); }
}
function doi(dieuKien, thongDiep) { if (!dieuKien) throw new Error(thongDiep); }

console.log('🔎 CHỐT ỐNG GỬI LỖI —', TEP.join(' · '));

// ① + ② — nạp thật, chạy thật
let observe = null;
test('① Lối vào chung `@suga/site-guard/observe` nạp được', () => {
  observe = require('../src/observe');
  doi(typeof observe.createObserver === 'function', 'không thấy createObserver');
});

test('② Ống lỗi CHẠY THẬT: bắn đúng 1 lượt và vẫn chuyền lỗi cho handler cuối', () => {
  doi(observe, 'bỏ qua vì ① đã trượt');
  const luot = [];
  const fetchThat = globalThis.fetch;
  globalThis.fetch = (url, opt) => { luot.push({ url, opt }); return Promise.resolve({ ok: true }); };
  let nhan = null;
  try {
    const goc = new Error('bài kiểm');
    observe.createObserver({ slug: 'kiem-ong-loi', service: 'kiem' })
      .expressError()(goc, { path: '/kiem/1', method: 'GET' }, {}, (e) => { nhan = e; });
    doi(luot.length === 1, `bắn ${luot.length} lượt, phải đúng 1`);
    doi(nhan === goc, 'lỗi bị nuốt — trang khách mất error-handler cuối');
  } finally { globalThis.fetch = fetchThat; }
});

// ③ → ⑤ — soi từng tệp máy chủ
for (const tep of TEP) {
  const duong = path.resolve(process.cwd(), tep);
  test(`③ ${tep}: có tạo observer, và \`slug\` KHÁC RỖNG`, () => {
    doi(fs.existsSync(duong), `không có tệp ${tep}`);
    const ma = fs.readFileSync(duong, 'utf8');
    const m = ma.match(/createObserver\(\s*\{([^}]*)\}/);
    doi(m, 'không thấy `createObserver({…})` — ống lỗi đã bị gỡ?');
    const s = m[1].match(/slug\s*:\s*['"`]([^'"`]*)['"`]/);
    doi(s, 'không khai `slug`');
    doi(s[1].trim().length > 0, 'slug RỖNG ⇒ SugaHub không biết lỗi của web nào');
  });

  test(`④ ${tep}: có cắm \`expressError()\` vào Express`, () => {
    const ma = fs.readFileSync(duong, 'utf8');
    doi(/\.expressError\(\)/.test(ma), 'không thấy `.expressError()` — lỗi máy chủ sẽ không bay đi đâu cả');
    doi(/app\.use\(\s*[A-Za-z_$][\w$]*\.expressError\(\)/.test(ma),
      'có gọi `.expressError()` nhưng KHÔNG `app.use(...)` ⇒ middleware nằm ngoài dây chuyền');
  });

  test(`⑤ ${tep}: lấy ống lỗi TỪ GÓI CHUNG, không phải bản chép tay`, () => {
    const ma = fs.readFileSync(duong, 'utf8');
    doi(/@suga\/site-guard\/observe/.test(ma), 'không thấy `@suga/site-guard/observe`');
    const chepTay = ma.match(/require_?\(\s*['"`](\.[^'"`]*observe[^'"`]*)['"`]\s*\)/);
    doi(!chepTay, `còn nạp bản chép tay: ${chepTay && chepTay[1]}`);
  });
}

// ⑥ — bản chép tay không được mọc lại
test('⑥ Repo KHÔNG còn bản chép tay `lib/observe.*`', () => {
  const thuMuc = path.resolve(process.cwd(), 'lib');
  if (!fs.existsSync(thuMuc)) return;
  const con = fs.readdirSync(thuMuc).filter((f) => /^observe\.(js|cjs|mjs|ts)$/.test(f));
  doi(con.length === 0, `mọc lại bản chép tay: lib/${con.join(', lib/')} — dùng @suga/site-guard/observe`);
});

console.log(`\nKết quả: ${pass} PASS, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
