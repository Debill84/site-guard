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
// Thẻ RỖNG (không có thẻ đóng) — đừng đẩy vào chồng chờ đóng.
const THE_RONG = new Set(['br', 'hr']);

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
function dungTheMo(ten, phan) {
  const giu = [];
  let m;
  RE_TT.lastIndex = 0;
  while ((m = RE_TT.exec(phan))) {
    const tt = m[1].toLowerCase();
    const gt = m[2] != null ? m[2] : m[3] != null ? m[3] : m[4] != null ? m[4] : '';
    if (tt === 'style') {
      const s = locStyle(gt);
      if (s) giu.push(['style', s]);
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
 * @returns {string} HTML đã lọc, cắm thẳng vào trang được
 */
function locHtml(html) {
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
    if (!THE_CHO.has(ten)) continue;        // ngoài danh sách → bỏ THẺ, giữ chữ bên trong
    if (dong) {
      // Thẻ đóng lạc loài (không có thẻ mở tương ứng) → bỏ, kẻo nó đóng nhầm khối của trang admin.
      const k = chong.lastIndexOf(ten);
      if (k < 0) continue;
      while (chong.length > k) ra += `</${chong.pop()}>`;
    } else {
      ra += dungTheMo(ten, t[3].replace(/\/?>$/, ''));
      if (!THE_RONG.has(ten)) chong.push(ten);
    }
  }
  ra += khoaChu(s.slice(cuoi));
  // Đóng nốt phần bỏ ngỏ: một `<b>` quên đóng sẽ bôi đậm **toàn bộ phần còn lại của trang admin**.
  while (chong.length) ra += `</${chong.pop()}>`;
  return ra;
}

module.exports = { locHtml, hrefAnToan };
