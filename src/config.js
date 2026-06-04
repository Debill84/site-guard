'use strict';

/**
 * Cấu hình mặc định của SiteGuard.
 *
 * Triết lý: AN TOÀN MẶC ĐỊNH — bật những thứ không thể làm hỏng site,
 * còn những thứ có thể vỡ giao diện (CSP) thì để TẮT, người dùng tự bật khi sẵn sàng.
 * Mọi nhóm đều có cờ `enabled` để bật/tắt độc lập từng site.
 */

/** @returns {object} bản sao cấu hình mặc định (deep) */
function defaultConfig() {
  return {
    // 🛡️ NHÓM BẢO MẬT — security headers + ẩn thông tin server
    security: {
      enabled: true,
      // Xóa header lộ công nghệ (X-Powered-By: Express ...)
      hidePoweredBy: true,
      // Giá trị header "Server" tùy biến (null = giữ nguyên của hạ tầng)
      serverHeader: null,
      headers: {
        // Ép HTTPS trong N giây (chỉ gửi khi request là https). 0 = tắt.
        hstsMaxAge: 15552000, // 180 ngày
        hstsIncludeSubDomains: true,
        hstsPreload: false,
        // Chống đoán kiểu file (MIME sniffing)
        noSniff: true,
        // Chống nhúng site vào iframe site khác (clickjacking)
        frameOptions: 'SAMEORIGIN', // 'DENY' | 'SAMEORIGIN' | false
        // Mức độ rò rỉ referrer khi điều hướng
        referrerPolicy: 'strict-origin-when-cross-origin',
        // Khóa bớt quyền trình duyệt nhạy cảm
        permissionsPolicy: 'camera=(), microphone=(), geolocation=()',
        // Content-Security-Policy: MẶC ĐỊNH TẮT (dễ vỡ site). Đặt chuỗi để bật.
        contentSecurityPolicy: false,
        // Cách ly cross-origin (chặt) — tắt mặc định để không vỡ embed bên thứ 3
        crossOriginOpenerPolicy: false, // vd 'same-origin'
        crossOriginResourcePolicy: false, // vd 'same-origin'
      },
    },

    // 🤖 CHỐNG CRAWL — rate-limit + chặn bot xấu
    antiCrawl: {
      enabled: true,
      rateLimit: {
        enabled: true,
        windowMs: 60 * 1000, // cửa sổ 1 phút
        max: 120, // tối đa 120 request/IP/phút (toàn site)
        // Đường dẫn không tính rate-limit (asset tĩnh, health check)
        skipPaths: ['/assets/', '/vendor/', '/modules/', '/storage/', '/_next/', '/favicon', '/health'],
        message: 'Bạn thao tác quá nhanh. Vui lòng thử lại sau giây lát.',
        statusCode: 429,
      },
      // Rate-limit RIÊNG, chặt hơn, cho các đường nhạy cảm (đăng nhập, form)
      strictPaths: {
        enabled: true,
        windowMs: 5 * 60 * 1000, // 5 phút
        max: 10, // 10 lần/5 phút (chống dò mật khẩu / spam form)
        paths: ['/admin/login', '/login', '/contact', '/api/'],
        message: 'Quá nhiều lần thử. Vui lòng đợi vài phút rồi thử lại.',
        statusCode: 429,
      },
      bots: {
        // 'block' = chặn bot xấu | 'log' = chỉ ghi nhận | 'off'
        mode: 'block',
        // Cho phép các bot tìm kiếm hợp lệ đi qua (SEO)
        allowSearchEngines: true,
        // Chặn request KHÔNG có User-Agent (thường là script cào)
        blockEmptyUserAgent: true,
        statusCode: 403,
        message: 'Truy cập bị từ chối.',
      },
    },

    // ⚡ TỐC ĐỘ — nén + cache
    performance: {
      enabled: true,
      compression: {
        enabled: true,
        threshold: 1024, // chỉ nén body >= 1KB (nhỏ hơn thì nén tốn hơn lợi)
        encodings: ['br', 'gzip'], // ưu tiên brotli (nén tốt hơn), fallback gzip
        brotliQuality: 5, // 0-11: cân bằng tốc độ/tỉ lệ (5 nhanh, vẫn nén tốt)
        gzipLevel: 6, // 1-9 mặc định 6
      },
      cacheHeaders: {
        // MẶC ĐỊNH AN TOÀN: không tự đặt Cache-Control (tránh asset cũ bị "kẹt" với
        // site asset KHÔNG có hash tên file). Site có asset hash tên thì tự thêm rule.
        enabled: false,
        // Ví dụ rule khi bật (asset đã hash tên → cache vĩnh viễn an toàn):
        // rules: [{ prefixes: ['/_next/static/'], value: 'public, max-age=31536000, immutable' }],
        rules: [],
        htmlDefault: null, // null = không đụng HTML động
      },
    },

    // Hạ tầng đứng sau proxy (Railway/Cloudflare) → đọc IP thật từ X-Forwarded-For
    trustProxy: true,

    // Bỏ qua TOÀN BỘ SiteGuard cho các path này (vd webhook nội bộ)
    bypassPaths: [],

    // Hàm log tùy biến (mặc định console). Nhận (level, event) — event là object.
    logger: null,
  };
}

/** Gộp sâu cấu hình người dùng lên mặc định (object lồng nhau). */
function mergeConfig(base, override) {
  if (!override || typeof override !== 'object') return base;
  const out = Array.isArray(base) ? base.slice() : { ...base };
  for (const key of Object.keys(override)) {
    const ov = override[key];
    const bv = base ? base[key] : undefined;
    if (ov && typeof ov === 'object' && !Array.isArray(ov) && bv && typeof bv === 'object' && !Array.isArray(bv)) {
      out[key] = mergeConfig(bv, ov);
    } else {
      out[key] = ov;
    }
  }
  return out;
}

/** Tạo cấu hình hoàn chỉnh từ tùy chọn người dùng. */
function resolveConfig(userConfig) {
  return mergeConfig(defaultConfig(), userConfig || {});
}

module.exports = { defaultConfig, mergeConfig, resolveConfig };
