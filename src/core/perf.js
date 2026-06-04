'use strict';

/**
 * Lõi gói TỐC ĐỘ (thuần dữ liệu, không phụ thuộc framework).
 * Việc thực sự nén stream nằm ở đầu cắm (express) vì đụng response; ở đây chỉ là
 * các quyết định: kiểu nội dung có nên nén? chọn encoding nào? Cache-Control ra sao?
 */

// Các kiểu nội dung dạng văn bản → nén có lợi (ảnh/video/zip đã nén rồi, bỏ qua)
const COMPRESSIBLE = [
  'text/', 'application/json', 'application/javascript', 'application/xml',
  'application/rss+xml', 'application/atom+xml', 'image/svg+xml',
  'application/ld+json', 'application/manifest+json', 'application/wasm',
  'font/ttf', 'font/otf', 'application/vnd.ms-fontobject',
];

function compressibleType(contentType) {
  if (!contentType) return false;
  const ct = String(contentType).toLowerCase();
  return COMPRESSIBLE.some((t) => ct.includes(t));
}

/**
 * Chọn encoding tốt nhất client chấp nhận, theo thứ tự ưu tiên của ta.
 * @param {string} acceptEncoding - header Accept-Encoding
 * @param {string[]} preferred - vd ['br','gzip']
 * @returns {'br'|'gzip'|null}
 */
function pickEncoding(acceptEncoding, preferred) {
  if (!acceptEncoding) return null;
  const ae = String(acceptEncoding).toLowerCase();
  for (const enc of preferred) {
    // bỏ qua nếu client đặt q=0 cho encoding đó
    const re = new RegExp(`(^|[,\\s])${enc}\\b(?!\\s*;\\s*q=0(\\.0+)?\\b)`);
    if (re.test(ae)) return enc;
  }
  return null;
}

/**
 * Tính giá trị Cache-Control cho 1 path theo luật cấu hình.
 * @returns {string|null} null = không đụng (để route/express.static tự quyết)
 */
function cacheControlFor(path, cacheCfg) {
  if (!cacheCfg || cacheCfg.enabled === false) return null;
  for (const rule of cacheCfg.rules || []) {
    if ((rule.prefixes || []).some((p) => path.startsWith(p))) return rule.value;
  }
  return cacheCfg.htmlDefault || null;
}

/**
 * Preset Cache-Control sẵn dùng — đặc biệt cho site ĐỨNG SAU CLOUDFLARE.
 * `cdnDynamic`: trình duyệt không cache, nhưng CF cache 60s + phục vụ bản cũ
 * trong khi nền tải bản mới (stale-while-revalidate) → trang động vẫn nhanh như tĩnh,
 * giảm tải server mạnh. Khi admin sửa nội dung: purge cache CF hoặc chờ tối đa 60s.
 */
const CACHE_PRESETS = {
  // HTML động sau Cloudflare: nhanh mà vẫn tươi (CF cache 60s, nền làm mới tới 10 phút)
  cdnDynamic: 'public, max-age=0, s-maxage=60, stale-while-revalidate=600',
  // Asset đã hash tên file (Next.js /_next/static…): cache vĩnh viễn an toàn
  cdnStaticImmutable: 'public, max-age=31536000, immutable',
  // Asset tên cố định (clone WordPress): cache ngắn ở CF, trình duyệt revalidate
  cdnStaticNamed: 'public, max-age=600, s-maxage=86400, stale-while-revalidate=86400',
  // Không cache gì (trang nhạy cảm: admin, giỏ hàng…)
  noStore: 'no-store, max-age=0',
};

module.exports = { compressibleType, pickEncoding, cacheControlFor, COMPRESSIBLE, CACHE_PRESETS };
