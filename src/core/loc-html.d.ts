// Khai kiểu cho `@suga/site-guard/loc-html` — để site viết bằng TypeScript (Next.js) nạp được mà
// KHÔNG phải tự chế khai báo riêng trong repo mình.
//
// 🩸 Vì sao có tệp này (05/08/2026): `nhonho-code` bật `strict` ⇒ nạp một gói không có khai kiểu là
// `next build` ĐỎ ngay. Cách chữa tại chỗ là mỗi repo tự viết một tệp `.d.ts` — đúng cái bệnh
// "mỗi nơi vá một nửa" mà gói này sinh ra để dẹp. Khai ở NHÀ thì mọi site dùng chung một bản.

/** Nới cho THÂN BÀI: giữ ảnh + khung + lớp CSS của WordPress/Elementor. */
export interface TuyChonLoc {
  baiViet?: boolean;
}

/**
 * Lọc HTML người nhập theo danh sách cho phép — dùng lúc **HIỂN THỊ**, không phải lúc lưu.
 * Mặc định là bản HẸP (chữ + định dạng + link): đúng cho tiêu đề, tên hàng, tóm tắt.
 */
export function locHtml(html: unknown, tuyChon?: TuyChonLoc): string;

/** Lọc **thân bài viết** — giữ ảnh, khung, lớp CSS; vẫn cắt mã. */
export function locHtmlBaiViet(html: unknown): string;

/** Đường link có an toàn để cắm vào `href`/`src` không (chặn cả bản nguỵ trang `java&#9;script:`). */
export function hrefAnToan(u: unknown): boolean;
