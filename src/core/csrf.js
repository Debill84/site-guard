'use strict';

const crypto = require('crypto');

/**
 * Lõi CSRF — mẫu "double-submit cookie" có KÝ HMAC (giống csrf-csrf), thuần Node crypto.
 *
 * Ý tưởng: server phát 1 token ngẫu nhiên, lưu vào cookie dưới dạng ĐÃ KÝ (token.hmac).
 * Form/JS gửi lại token (không ký) khi POST. Server: (1) mở cookie + kiểm chữ ký HMAC để
 * chắc token do chính mình phát (chống cookie giả), (2) so token gửi lên == token trong cookie.
 * Kẻ tấn công ở site khác KHÔNG đọc được cookie của ta nên không gửi đúng token → bị chặn.
 */

function generateToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function sign(token, secret) {
  return crypto.createHmac('sha256', secret).update(token).digest('base64url');
}

/** Đóng gói token thành chuỗi đã ký để lưu cookie. */
function makeSigned(token, secret) {
  return `${token}.${sign(token, secret)}`;
}

/** So sánh hằng-thời-gian (chống dò theo thời gian). */
function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

/** Mở chuỗi cookie đã ký → trả token nếu chữ ký hợp lệ, ngược lại null. */
function verifySigned(signed, secret) {
  if (!signed || typeof signed !== 'string') return null;
  const i = signed.lastIndexOf('.');
  if (i <= 0) return null;
  const token = signed.slice(0, i);
  const mac = signed.slice(i + 1);
  if (!safeEqual(mac, sign(token, secret))) return null;
  return token;
}

/**
 * Kiểm 1 lượt submit: token client gửi lên có khớp token trong cookie (đã ký) không.
 * @returns {boolean}
 */
function verifyRequest(signedCookie, submittedToken, secret) {
  const cookieToken = verifySigned(signedCookie, secret);
  if (!cookieToken || !submittedToken) return false;
  return safeEqual(submittedToken, cookieToken);
}

module.exports = { generateToken, sign, makeSigned, verifySigned, verifyRequest, safeEqual };
