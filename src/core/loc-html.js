// Lọc HTML người nhập theo DANH SÁCH CHO PHÉP — dùng lúc **HIỂN THỊ**, KHÔNG phải lúc lưu.
//
// 🏠 ĐÂY LÀ BẢN CHUẨN CỦA NHÀ (05/08/2026). Mọi site có ô soạn thảo dùng chung tệp này —
//    ĐỪNG CHÉP TAY sang repo khác. Chép tay là mỗi nơi vá một nửa rồi lệch nhau âm thầm
//    (đúng cái đã xảy ra: `santapocket-site` phải tự dựng `lib/an-toan-html.js` vì nhà chưa có bản
//    chuẩn, rồi 3 site anh em cùng thủng suốt nhiều tháng mà không ai biết).
//
// 🩸 VÌ SAO CÓ TỆP NÀY — chỗ đầu tiên nó chữa: gói `@debill84/cms` đổ thẳng nội dung kho vào trang
// admin (`<div class="sg-rt-area">${v}</div>`). Ai ghi được vào kho (vai quyền thấp, hoặc một dòng
// lọt vào từ đường di trú) là gài được `<img src=x onerror=…>`; **người mở form ra xem là Chủ/Biên
// tập** ⇒ mã chạy bằng phiên của người quyền cao nhất. Đường LEO QUYỀN, không phải lỗi giao diện.
// Chỗ thứ hai: hàm `rich()` của từng site đổ nội dung kho ra **TRANG CÔNG KHAI**.
//
// ⚠️ LỌC LÚC HIỂN THỊ, KHÔNG LỌC LÚC LƯU (luật đã trả giá — xem `_backlog` §B440):
//   • lọc lúc lưu thì **dữ liệu bẩn đã nằm sẵn trong kho vẫn nguyên vẹn nguy hiểm** — vá mà không đỡ;
//   • lọc lúc lưu mà cắt nhầm là **MẤT CHỮ VĨNH VIỄN**, không có bản gốc để lùi.
// Ở trang admin, ô ẩn `<input type="hidden" value="${esc(v)}">` vẫn mang **nguyên văn bản gốc**, và
// Tiptap dựng nội dung từ ô ẩn đó chứ không từ vùng đã lọc (`area.innerHTML=""` rồi
// `content: hidden.value`) ⇒ lọc **không đổi một byte nào** của kho, cũng không đổi thứ người soạn
// nhìn thấy. Nó chỉ chữa cái ảnh nháy trước khi trình soạn lên + đường xem khi JS không tải được.
//
// 🧭 Cách chống: DANH SÁCH CHO PHÉP (chỉ giữ thứ có tên), không phải danh sách cấm. Danh sách cấm
// luôn thua — mỗi năm trình duyệt lại đẻ thêm một thẻ/thuộc tính mới mà mình chưa kịp cấm.

'use strict';

// Thẻ ĐƯỢC GIỮ. Bám sát thứ trình soạn thật sự đẻ ra (StarterKit đã tắt heading/blockquote/code/hr
// + Link + Underline + TextAlign), NỚI thêm mấy thẻ chữ thường gặp ở nội dung dán vào hoặc di trú
// từ site cũ — giữ rộng ở đây là an toàn vì mọi thuộc tính đều bị lọc riêng bên dưới.
const THE_CHO = new Set([
  'p', 'br', 'hr', 'strong', 'b', 'em', 'i', 'u', 's', 'strike', 'del', 'ins', 'sub', 'sup',
  'ul', 'ol', 'li', 'a', 'span', 'blockquote', 'code', 'pre',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
]);

// 📰 NỚI RIÊNG CHO **THÂN BÀI VIẾT** (chế độ `baiViet`, 05/08/2026 — xem `locHtmlBaiViet` cuối tệp).
//
// 🩸 Vì sao phải có chế độ thứ hai: đo bài thật trên `nhonho.vn` ngày 05/08 — thân bài là markup
// **Elementor** di trú từ site cũ, một bài có `img` x18 + `div` x58. Đẩy nguyên khối đó qua danh
// sách hẹp ở trên là **XOÁ SẠCH ẢNH VÀ KHUNG BÀI** — vá xong thì bài viết trắng trơn, hỏng câm mà
// không ai báo. Đúng cái luật đã trả giá: **cắt nhầm = mất chữ**, nguy hiểm ngang chỗ thủng.
// ⚠️ Chỉ dùng cho THÂN BÀI. Tiêu đề/tên hàng/tóm tắt vẫn đi bản hẹp — mấy ô đó không đời nào cần
// `<div>` lẫn `<img>`, nới ra là tự mở cửa không lý do.
const THE_CHO_BAI = new Set([
  'div', 'img', 'figure', 'figcaption', 'picture',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'caption', 'col', 'colgroup',
  'dl', 'dt', 'dd', 'section', 'article', 'header', 'footer', 'main', 'aside', 'nav',
]);

// Lớp CSS giữ theo **HỌ TÊN**, không giữ bừa. Bỏ `class` hẳn thì bài Elementor mất khung; giữ bừa
// thì kẻ ghi được vào kho mượn luôn lớp tiện ích của chính site (Tailwind: `fixed inset-0 z-50`)
// dựng tấm phủ kín màn đè lên nút thật — không cần chạy một dòng mã nào. Mấy họ dưới đây là của
// site cũ/WordPress, KHÔNG trùng họ tiện ích của site mới ⇒ giữ được khung mà không mượn được gì.
const RE_LOP_CHO = /^(elementor|e|wp|has|is|align|gallery|size|attachment)([-_]|$)/i;

// Thuộc tính ảnh giữ thêm (ngoài `src` đã lọc riêng). Cố ý BỎ `srcset`: nó chứa NHIỀU đường link
// ngăn bằng dấu phẩy, lọc đúng phải tách từng cái — nội dung đo được 05/08 không dùng tới, nên bỏ
// cho gọn còn hơn lọc nửa vời. Cũng bỏ mọi `data-*` (móc chạy của Elementor, site mới không nạp).
const ATT_ANH = new Set(['alt', 'title', 'width', 'height', 'loading', 'decoding']);

// Thẻ RỖNG (không có thẻ đóng) — đừng đẩy vào chồng chờ đóng.
const THE_RONG = new Set(['br', 'hr', 'img', 'col']);

// Mấy thẻ này phải NUỐT CẢ RUỘT: bỏ mỗi cái thẻ thì phần chữ bên trong (mã JS, mã CSS) rơi ra
// thành chữ hiện trên màn — vừa xấu vừa lộ. `<title>`/`<textarea>` nằm đây vì trình duyệt đọc
// ruột chúng theo luật khác, dễ thành đường lách.
const TEN_NUOT = 'script|style|iframe|object|embed|noscript|template|textarea|title|svg|math';
const RE_NUOT = new RegExp('<(' + TEN_NUOT + ')\\b[\\s\\S]*?<\\/\\1\\s*>', 'gi');

const RE_THE = /<[^>]*(?:>|$)/g;
const RE_TEN = /^<\s*(\/?)\s*([a-zA-Z][a-zA-Z0-9-]*)([\s\S]*)$/;
const RE_TT = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'`=<>]+)))?/g;

// Chữ nằm giữa các thẻ: CHỈ khoá `<` `>`. **Đừng đụng `&`** — chuỗi vào đã là HTML nên `&amp;`
// trong đó là dấu `&` hợp lệ; escape lần nữa thì màn hiện ra chữ "&amp;" (hỏng câm, không ai báo).
function khoaChu(s) {
  return String(s).replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function khoaGiaTri(s) {
  return khoaChu(s).replace(/"/g, '&quot;');
}

// Đường link an toàn? Chặn `javascript:` `data:` `vbscript:`… nhưng phải chặn CẢ BẢN NGUỴ TRANG:
// `java&#9;script:` và `java script:` — trình duyệt bỏ khoảng trắng/ký tự điều khiển rồi giải mã
// thực thể TRƯỚC khi đọc lược đồ, nên mình phải làm y hệt trước khi phán.
function hrefAnToan(u) {
  const tho = String(u == null ? '' : u)
    .replace(/&#x([0-9a-f]+);?/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);?/g, (_, d) => String.fromCharCode(parseInt(d, 10)))
    .replace(/[\s\u0000-\u001f\u007f]/g, '')
    .toLowerCase();
  // Có lược đồ (`abc:`) thì phải nằm trong danh sách cho phép; không có lược đồ = đường dẫn tương
  // đối hoặc neo `#…` ⇒ vô hại, cho qua.
  if (/^[a-z][a-z0-9+.-]*:/.test(tho)) return /^(https?|mailto|tel):/.test(tho);
  return true;
}

// `style` chỉ giữ ĐÚNG căn lề — đó là thứ duy nhất trình soạn đẻ ra (TextAlign). Mở rộng `style`
// là mở cửa cho `position:fixed` phủ kín màn hình đè lên nút Lưu (bấm nhầm mà không biết).
function locStyle(v) {
  return String(v).split(';')
    .map((d) => d.trim())
    .filter((d) => /^text-align\s*:\s*(left|right|center|justify)$/i.test(d))
    .join('; ');
}

// Dựng lại thẻ mở CHỈ từ những thuộc tính có tên trong danh sách. Cách này diệt luôn MỌI `on…=`
// (onerror/onload/onmouseover/…) mà không cần biết tên chúng — kể cả thứ trình duyệt mới đẻ ra.
// Cũng cố ý bỏ `id`/`name`: một `<div id="editform">` gài vào là **đè** lên phần tử thật, làm mạch
// xem-trước của `admin-ui.js` trỏ nhầm chỗ (kiểu phá DOM clobbering, không cần chạy mã nào).
function dungTheMo(ten, phan, bai) {
  const giu = [];
  let m;
  RE_TT.lastIndex = 0;
  while ((m = RE_TT.exec(phan))) {
    const tt = m[1].toLowerCase();
    const gt = m[2] != null ? m[2] : m[3] != null ? m[3] : m[4] != null ? m[4] : '';
    if (tt === 'style') {
      const s = locStyle(gt);
      if (s) giu.push(['style', s]);
    } else if (bai && tt === 'class') {
      // Giữ theo TỪNG lớp một, không giữ cả cụm: một cụm lành lẫn một lớp mượn của site là lọt.
      const lop = String(gt).split(/\s+/).filter((c) => c && RE_LOP_CHO.test(c));
      if (lop.length) giu.push(['class', lop.join(' ')]);
    } else if (bai && ten === 'img' && tt === 'src') {
      // `src` của ảnh cũng là ĐƯỜNG LINK — `hrefAnToan` chặn `javascript:`/`data:` (kể cả bản nguỵ
      // trang). Ảnh hỏng thì mất một tấm ảnh; ảnh `data:text/html` thì mất cả trang.
      if (hrefAnToan(gt)) giu.push(['src', gt]);
    } else if (bai && ten === 'img' && ATT_ANH.has(tt)) {
      giu.push([tt, gt]);
    } else if (ten === 'a' && tt === 'href') {
      if (hrefAnToan(gt)) giu.push(['href', gt]);
    } else if (ten === 'a' && tt === 'target' && gt === '_blank') {
      // `rel` do MÌNH đặt, không lấy theo bản gốc: mở tab mới mà thiếu `noopener` thì trang đích
      // với tay ngược lại `window.opener` được.
      giu.push(['target', '_blank'], ['rel', 'noopener noreferrer']);
    }
  }
  const chuoi = giu.map(([k, v]) => ` ${k}="${khoaGiaTri(v)}"`).join('');
  return `<${ten}${chuoi}${THE_RONG.has(ten) ? ' /' : ''}>`;
}

/**
 * Lọc một mẩu HTML còn lại đúng phần chữ + định dạng an toàn.
 * @param {*} html chuỗi HTML lấy từ kho (có thể là bất cứ thứ gì)
 * @param {{baiViet?: boolean}} [tuyChon] `baiViet: true` = nới cho THÂN BÀI (giữ ảnh + khung
 *        + lớp CSS của WordPress/Elementor). Mặc định là bản HẸP — dùng cho tiêu đề/tên/tóm tắt.
 * @returns {string} HTML đã lọc, cắm thẳng vào trang được
 */
function locHtml(html, tuyChon) {
  const bai = !!(tuyChon && tuyChon.baiViet);
  let s = String(html == null ? '' : html);

  // Nuốt cả ruột — chạy lặp vì trò lồng nhau `<scr<script>ipt>` cần vài lượt mới rụng hết.
  for (let i = 0; i < 5; i++) {
    const truoc = s;
    s = s.replace(RE_NUOT, '');
    if (s === truoc) break;
  }

  let ra = '';
  let cuoi = 0;
  const chong = [];
  let m;
  RE_THE.lastIndex = 0;
  while ((m = RE_THE.exec(s))) {
    ra += khoaChu(s.slice(cuoi, m.index));
    cuoi = RE_THE.lastIndex;
    const the = m[0];
    // `<!-- … -->`, `<!doctype>`, `<?xml?>` → bỏ hẳn. Thẻ cụt ở cuối chuỗi (không có `>`) cũng bỏ:
    // giữ lại thì nó nuốt luôn phần HTML mình ghép vào sau.
    if (!/>$/.test(the) || /^<[!?]/.test(the)) continue;
    const t = the.match(RE_TEN);
    if (!t) continue;                       // `< div`, `<3`… không phải thẻ → bỏ
    const dong = t[1] === '/';
    const ten = t[2].toLowerCase();
    if (!THE_CHO.has(ten) && !(bai && THE_CHO_BAI.has(ten))) continue; // ngoài ds → bỏ THẺ, giữ chữ
    if (dong) {
      // Thẻ đóng lạc loài (không có thẻ mở tương ứng) → bỏ, kẻo nó đóng nhầm khối của trang admin.
      const k = chong.lastIndexOf(ten);
      if (k < 0) continue;
      while (chong.length > k) ra += `</${chong.pop()}>`;
    } else {
      ra += dungTheMo(ten, t[3].replace(/\/?>$/, ''), bai);
      if (!THE_RONG.has(ten)) chong.push(ten);
    }
  }
  ra += khoaChu(s.slice(cuoi));
  // Đóng nốt phần bỏ ngỏ: một `<b>` quên đóng sẽ bôi đậm **toàn bộ phần còn lại của trang admin**.
  while (chong.length) ra += `</${chong.pop()}>`;
  return ra;
}

/**
 * Lọc **THÂN BÀI VIẾT** — giữ ảnh, khung và lớp CSS của WordPress/Elementor, vẫn cắt mã.
 * Đọc rõ hơn ở chỗ gọi so với `locHtml(x, { baiViet: true })`.
 * @param {*} html thân bài lấy từ kho
 * @returns {string} HTML đã lọc
 */
function locHtmlBaiViet(html) {
  return locHtml(html, { baiViet: true });
}

module.exports = { locHtml, locHtmlBaiViet, hrefAnToan };
