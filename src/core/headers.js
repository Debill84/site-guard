'use strict';

/**
 * Tạo bộ security headers từ cấu hình (thuần dữ liệu, không phụ thuộc framework).
 * Trả về object { tênHeader: giáTrị } để Express/Next.js gắn vào response.
 *
 * @param {object} securityCfg - config.security
 * @param {object} [ctx] - ngữ cảnh request, ví dụ { isHttps: boolean }
 * @returns {Object<string,string>}
 */
function buildSecurityHeaders(securityCfg, ctx = {}) {
  const headers = {};
  if (!securityCfg || securityCfg.enabled === false) return headers;
  const h = securityCfg.headers || {};

  // HSTS — chỉ gửi khi kết nối là HTTPS (gửi trên HTTP là vô nghĩa & sai chuẩn)
  if (h.hstsMaxAge && h.hstsMaxAge > 0 && ctx.isHttps) {
    let v = `max-age=${h.hstsMaxAge}`;
    if (h.hstsIncludeSubDomains) v += '; includeSubDomains';
    if (h.hstsPreload) v += '; preload';
    headers['Strict-Transport-Security'] = v;
  }

  if (h.noSniff) headers['X-Content-Type-Options'] = 'nosniff';

  if (h.frameOptions) headers['X-Frame-Options'] = String(h.frameOptions);

  if (h.referrerPolicy) headers['Referrer-Policy'] = String(h.referrerPolicy);

  if (h.permissionsPolicy) headers['Permissions-Policy'] = String(h.permissionsPolicy);

  if (h.contentSecurityPolicy) headers['Content-Security-Policy'] = String(h.contentSecurityPolicy);

  if (h.crossOriginOpenerPolicy) headers['Cross-Origin-Opener-Policy'] = String(h.crossOriginOpenerPolicy);

  if (h.crossOriginResourcePolicy) headers['Cross-Origin-Resource-Policy'] = String(h.crossOriginResourcePolicy);

  // Header "Server" tùy biến để ẩn phiên bản hạ tầng
  if (securityCfg.serverHeader) headers['Server'] = String(securityCfg.serverHeader);

  return headers;
}

module.exports = { buildSecurityHeaders };
