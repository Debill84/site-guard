// Bài kiểm cho `src/core/loc-html.js` — BẢN CHUẨN lọc HTML người nhập của nhà.
//
// Bài này canh 3 thứ, mất cái nào là ĐỎ:
//   ① `locHtml` cắt đúng phần nguy hiểm (mỗi mẩu dưới đây từng là một đường chạy mã thật);
//   ② GIỮ ĐỦ định dạng thật — cắt nhầm là **mất chữ của khách**, hỏng câm không ai báo;
//   ③ cửa xuất `@suga/site-guard/loc-html` còn khai trong `package.json` — mất khai là mọi site
//      bên ngoài gãy ngay lúc nạp, mà bài kiểm nội bộ (nạp theo đường tương đối) vẫn xanh.
const assert = require('assert');
const path = require('path');
const { locHtml, hrefAnToan } = require('../src/core/loc-html.js');

let so = 0;
const ok = (ten) => { so++; console.log('  ✓', ten); };

// ── ① CẮT: mỗi mẩu dưới đây từng là một đường chạy mã trong phiên của Chủ ─────────────────────
const DON = [
  ['thẻ script thẳng', '<script>alert(1)</script>'],
  ['script viết hoa/lẫn lộn', '<ScRiPt>alert(1)</sCrIpT>'],
  ['script lồng để né bộ cắt', '<scr<script>ipt>alert(1)</script>'],
  ['script không đóng thẻ', '<script>alert(1)'],
  ['ảnh hỏng gọi onerror', '<img src=x onerror=alert(1)>'],
  ['onerror không dấu nháy', '<img src=x onerror=alert(document.cookie)>'],
  ['svg onload', '<svg onload=alert(1)></svg>'],
  ['thẻ body onload', '<body onload=alert(1)>'],
  ['link javascript:', '<a href="javascript:alert(1)">bấm</a>'],
  ['javascript: có TAB chèn giữa', '<a href="java\tscript:alert(1)">bấm</a>'],
  ['javascript: mã hoá thực thể', '<a href="java&#115;cript:alert(1)">bấm</a>'],
  ['javascript: viết hoa + khoảng trắng', '<a href="  JAVA SCRIPT:alert(1)">bấm</a>'],
  ['iframe nhét vào', '<iframe src="//ke-la.example/x"></iframe>'],
  ['iframe srcdoc', '<iframe srcdoc="<script>alert(1)</script>"></iframe>'],
  ['form giả nuốt mật khẩu', '<form action="//ke-la.example"><input name="password"></form>'],
  ['thẻ style đè giao diện', '<style>body{display:none}</style>'],
  ['style phủ kín màn đè nút Lưu', '<div style="position:fixed;inset:0;z-index:9999">x</div>'],
  ['đè id của trang admin (phá DOM)', '<div id="editform">x</div>'],
  ['object/embed', '<object data="x"></object><embed src="x">'],
  ['thẻ meta chuyển hướng', '<meta http-equiv="refresh" content="0;url=//ke-la.example">'],
];
const CAM = /<script|<iframe|<svg|<object|<embed|<form|<style|<meta|<img|on(error|load|click|mouseover)\s*=|javascript\s*:|srcdoc|position\s*:\s*fixed|id\s*=/i;
for (const [ten, doc] of DON) {
  const ra = locHtml(doc);
  assert.ok(!CAM.test(ra), `❌ CÒN SÓT ở "${ten}": ${JSON.stringify(ra)}`);
  ok(`cắt sạch — ${ten}`);
}

// ── ② GIỮ: cắt nhầm là MẤT CHỮ. Đây đúng là thứ trình soạn Tiptap đẻ ra ───────────────────────
const GIU = [
  ['chữ tiếng Việt có dấu', '<p>Nha khoa <strong>Hi</strong>Dental — chăm sóc răng miệng</p>'],
  ['đậm/nghiêng/gạch chân', '<p><strong>đậm</strong><em>nghiêng</em><u>gạch chân</u></p>'],
  ['đầu dòng chấm', '<ul><li>một</li><li>hai</li></ul>'],
  ['đầu dòng số', '<ol><li>một</li><li>hai</li></ol>'],
  ['căn lề (TextAlign)', '<p style="text-align: center">giữa</p>'],
  ['link tương đối', '<a href="/lien-he">Liên hệ</a>'],
  ['link ngoài', '<a href="https://suga.vn">Suga</a>'],
  ['link thư/điện thoại', '<a href="mailto:a@b.vn">thư</a><a href="tel:0900">gọi</a>'],
  ['xuống dòng', 'dòng một<br>dòng hai'],
];
for (const [ten, doc] of GIU) {
  const ra = locHtml(doc);
  const chu = (s) => s.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  assert.strictEqual(chu(ra), chu(doc), `❌ MẤT CHỮ ở "${ten}": ${JSON.stringify(ra)}`);
  ok(`giữ nguyên — ${ten}`);
}
assert.ok(/<strong>/.test(locHtml('<p><strong>x</strong></p>')), '❌ mất thẻ đậm');
assert.ok(/text-align: center/.test(locHtml('<p style="text-align: center">x</p>')), '❌ mất căn lề');
assert.ok(/href="\/lien-he"/.test(locHtml('<a href="/lien-he">x</a>')), '❌ mất link tương đối');
assert.ok(/rel="noopener noreferrer"/.test(locHtml('<a href="https://x.vn" target="_blank">x</a>')),
  '❌ mở tab mới mà thiếu noopener');
ok('định dạng + link còn đủ, mở tab mới có noopener');

// dấu `&` trong chữ KHÔNG được mã hoá hai lần (hỏng câm: màn hiện ra chữ "&amp;")
assert.ok(!/&amp;amp;/.test(locHtml('<p>Suga &amp; Group</p>')), '❌ mã hoá 2 lần dấu &');
// thẻ mở bỏ ngỏ phải được đóng lại, kẻo bôi đậm cả trang admin
assert.ok(/<\/b>/.test(locHtml('<b>quên đóng')), '❌ thẻ bỏ ngỏ không được đóng');
ok('không mã hoá 2 lần · tự đóng thẻ bỏ ngỏ');

assert.strictEqual(hrefAnToan('data:text/html,<script>alert(1)</script>'), false, '❌ lọt data:');
assert.strictEqual(hrefAnToan('vbscript:msgbox(1)'), false, '❌ lọt vbscript:');
assert.strictEqual(hrefAnToan('#phan-1'), true, '❌ chặn nhầm neo #');
ok('lược đồ link: chặn data:/vbscript:, cho qua neo #');

// ── ③ CỬA XUẤT: site ngoài nạp bằng `@suga/site-guard/loc-html`, KHÔNG bằng đường tương đối ───
// Bài kiểm ở trên nạp `../src/core/loc-html.js` nên **vẫn xanh dù ai đó xoá khai báo cửa xuất** —
// mà xoá là mọi site bên ngoài gãy ngay lúc `require`. Vì vậy phải canh riêng khai báo, và canh cả
// `files:` (không có `src` thì gói xuất ra thiếu tệp, chỉ vỡ khi cài từ xa — muộn nhất có thể).
const pkg = require('../package.json');
assert.strictEqual(pkg.exports['./loc-html'], './src/core/loc-html.js',
  '❌ MẤT khai báo cửa xuất `./loc-html` — site ngoài sẽ gãy lúc nạp, bài kiểm nội bộ KHÔNG thấy');
assert.ok((pkg.files || []).includes('src'), '❌ `files:` thiếu `src` — gói xuất ra sẽ không có tệp lọc');
ok('cửa xuất `@suga/site-guard/loc-html` còn khai + `files:` có `src`');

// Nạp đúng như site ngoài nạp — bắt lỗi cú pháp/đường dẫn mà đường tương đối che mất.
const quaCua = require(path.join(__dirname, '..', pkg.exports['./loc-html']));
assert.strictEqual(typeof quaCua.locHtml, 'function', '❌ cửa xuất không trả về hàm `locHtml`');
assert.strictEqual(typeof quaCua.hrefAnToan, 'function', '❌ cửa xuất không trả về hàm `hrefAnToan`');
assert.strictEqual(quaCua.locHtml('<img src=x onerror=alert(1)>b'), 'b',
  '❌ hàm lấy qua cửa xuất KHÔNG lọc — hai đường nạp đang trỏ hai tệp khác nhau');
ok('nạp qua cửa xuất ra đúng hàm, và hàm đó lọc thật');

console.log(`\n✅ loc-html: ${so} phép kiểm — PASS`);
