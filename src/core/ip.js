'use strict';

/**
 * Chọn IP client THẬT từ chuỗi X-Forwarded-For, theo đúng ngữ nghĩa "trust proxy".
 *
 * BẢO MẬT: proxy tin cậy (Railway/Cloudflare) NỐI THÊM IP thật vào ĐUÔI PHẢI của
 * XFF; client CHỈ chèn được vào ĐẦU TRÁI. Lấy phần tử TRÁI-NHẤT (`[0]`) = tin
 * chuỗi do client tự bịa → kẻ tấn công đổi IP mỗi request để LÁCH rate-limit.
 * Vì vậy phải đếm `hops` bậc TỪ PHẢI sang (giống Express `trust proxy` / proxy-addr):
 * với 1 proxy tin cậy → lấy phần tử phải-nhất (client KHÔNG giả mạo được).
 *
 * @param {string} xff - giá trị header X-Forwarded-For (có thể rỗng)
 * @param {number|boolean} [trustProxy=true] - true = 1 hop; số N = N proxy tin cậy
 * @returns {string|null} IP đã chọn, hoặc null nếu XFF rỗng/không hợp lệ
 */
function forwardedClientIp(xff, trustProxy = true) {
  if (!xff) return null;
  const parts = String(xff).split(',').map((s) => s.trim()).filter(Boolean);
  if (!parts.length) return null;
  const hops = trustProxy === true ? 1 : (Number(trustProxy) > 0 ? Number(trustProxy) : 1);
  const idx = parts.length - hops;
  // Nếu ít mục hơn số hop tin cậy → lùi tối đa về trái-nhất (an toàn nhất có thể).
  return parts[idx >= 0 ? idx : 0];
}

module.exports = { forwardedClientIp };
