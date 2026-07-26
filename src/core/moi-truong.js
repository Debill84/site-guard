'use strict';

/**
 * "Đang ở SÂN nào?" + "dùng KHOÁ PHIÊN nào?" — 1 THƯỚC DUY NHẤT cho mọi site Suga.
 *
 * Vì sao có file này (đúc 26/07/2026, sau 2 sự cố CÙNG NGÀY):
 *   · Santa lộ mã OTP: cấu hình VẮNG MẶT làm cổng chặn NGÃ VỀ MỞ.
 *   · HiDental: rớt 2 biến Supabase là vào thẳng quyền CHỦ (chế độ demo) trên dữ liệu bệnh nhân thật.
 *   ⇒ Câu hỏi khi rà KHÔNG phải "biến này đúng chưa" mà là
 *      **"biến này BIẾN MẤT thì hệ ngã về KHOÁ hay ngã về MỞ?"**
 *
 * Hai cái bẫy đã trả giá để biết — ĐỌC TRƯỚC KHI SỬA:
 *   1) ĐỪNG nhận diện bản thật bằng `NODE_ENV === 'production'`. Site Express chạy `node server.js`
 *      thường KHÔNG có biến đó (đo thật 25–26/07: cả 3 site Suga trên Railway đều không có) ⇒ soi
 *      NODE_ENV là TƯỞNG bản thật là máy thợ → vẫn dùng khoá DEV nằm trong repo.
 *      (Ngược lại, app Next.js thì `next build/start` TỰ đặt NODE_ENV=production — đừng suy rộng
 *      từ Next sang site Express.)
 *   2) ĐỪNG chỉ soi biến `RAILWAY_*`. Rời Railway sang Fly/Render/VPS là hết biến đó ⇒ bản THẬT bị
 *      coi là máy thợ → quay lại khoá DEV. Soi dấu máy chủ của NHIỀU nhà cung cấp + lối phổ quát
 *      `DEPLOYED=1` để nhà cung cấp lạ chỉ cần đặt 1 biến.
 *   Nghi ngờ thì NGHIÊNG VỀ "bản thật" — đoán nhầm sang "máy thợ" mới là cái nguy hiểm.
 */

/** Dấu hiệu "tôi đang chạy trên MÁY CHỦ của một nhà cung cấp" — không phụ thuộc 1 hãng nào. */
const DAU_MAY_CHU = [
  'DEPLOYED', 'APP_DEPLOYED',                                   // phổ quát — nhà cung cấp lạ chỉ cần đặt cái này
  'RAILWAY_ENVIRONMENT', 'RAILWAY_SERVICE_ID', 'RAILWAY_PROJECT_ID', 'RAILWAY_DEPLOYMENT_ID',
  'RENDER', 'RENDER_SERVICE_ID',                                // Render
  'FLY_APP_NAME', 'FLY_MACHINE_ID',                             // Fly.io
  'DYNO',                                                       // Heroku
  'K_SERVICE', 'KUBERNETES_SERVICE_HOST',                       // Cloud Run · Kubernetes
  'AWS_LAMBDA_FUNCTION_NAME', 'AWS_EXECUTION_ENV', 'ECS_CONTAINER_METADATA_URI', // AWS
  'WEBSITE_INSTANCE_ID', 'CONTAINER_APP_NAME',                  // Azure
  'VERCEL', 'NETLIFY',
];

/** Biến ĐẶT TÊN SÂN (lời khai tường minh của người vận hành). */
const BIEN_TEN_SAN = ['APP_ENV', 'ENVIRONMENT', 'ENVIRONMENT_NAME', 'RAILWAY_ENVIRONMENT_NAME'];

/**
 * Có phải BẢN THẬT (chạy trên máy chủ / sân production) không?
 * Nghiêng về `true` khi nghi ngờ — vì hệ quả của đoán nhầm sang "máy thợ" là dùng khoá dev/mở cửa.
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {boolean}
 */
function laBanThat(env) {
  const e = env || process.env;
  if (String(e.NODE_ENV || '').trim() === 'production') return true;
  if (BIEN_TEN_SAN.some((k) => String(e[k] || '').trim().toLowerCase() === 'production')) return true;
  return DAU_MAY_CHU.some((k) => !!String(e[k] || '').trim());
}

/**
 * Lấy khoá ký cookie phiên — THIẾU/YẾU thì KHÔNG rơi về khoá nằm trong repo.
 *
 * Vì sao khoá dev trong repo là lỗ THẬT: phiên chỉ chứa `{uid,email,role}` ⇒ ai đọc được repo
 * (kể cả AI) tự ký được cookie `role: owner` → chiếm trọn CMS.
 *
 * Cố ý KHÔNG `process.exit` (không fail-closed cứng): web CÔNG KHAI phải sống. Trên bản thật mà
 * thiếu khoá thì sinh khoá NGẪU NHIÊN cho lần chạy này + KÊU TO — hệ quả duy nhất là ai đang
 * đăng nhập /admin bị đăng xuất sau mỗi lần deploy (chấp nhận được, KHÔNG phải lỗ bảo mật).
 *
 * @param {object} [opts]
 * @param {NodeJS.ProcessEnv} [opts.env]        mặc định `process.env`
 * @param {string}   [opts.ten]                 tên biến (mặc định `SESSION_SECRET`)
 * @param {string}   [opts.khoaDev]             khoá dev đang nằm trong repo (để NHẬN RA và từ chối)
 * @param {number}   [opts.toiThieu]            độ dài tối thiểu (mặc định 16)
 * @param {Function} [opts.baoLoi]              (Error) => void — đẩy về Hộp lỗi khi thiếu trên bản thật
 * @param {object}   [opts.log]                 {warn, error} — mặc định `console`
 * @returns {{khoa:string, nguon:'env'|'dev'|'ngau-nhien', lyDo:string|null}}
 */
function khoaPhien(opts) {
  const o = opts || {};
  const env = o.env || process.env;
  const ten = o.ten || 'SESSION_SECRET';
  const khoaDev = o.khoaDev;
  const toiThieu = typeof o.toiThieu === 'number' ? o.toiThieu : 16;
  const log = o.log || console;

  const s = String(env[ten] || '').trim();
  if (s && (!khoaDev || s !== khoaDev) && s.length >= toiThieu) {
    return { khoa: s, nguon: 'env', lyDo: null };
  }

  const lyDo = !s
    ? `THIẾU biến ${ten}`
    : (khoaDev && s === khoaDev)
      ? 'đang dùng khoá DEV có trong repo'
      : `khoá quá ngắn (<${toiThieu} ký tự)`;

  if (!laBanThat(env)) {
    if (khoaDev) {
      log.warn(`⚠️  ${ten}: ${lyDo} → dùng khoá DEV (chỉ máy thợ). Bản thật PHẢI đặt ${ten}.`);
      return { khoa: khoaDev, nguon: 'dev', lyDo };
    }
    log.warn(`⚠️  ${ten}: ${lyDo} → sinh khoá ngẫu nhiên (máy thợ, mất phiên sau mỗi lần khởi động).`);
  } else {
    log.error(
      `🔴 ${ten}: ${lyDo} → sinh khoá NGẪU NHIÊN cho lần chạy này. Cookie /admin sẽ mất sau mỗi lần `
      + `deploy. HÃY đặt ${ten} (chuỗi ngẫu nhiên ≥32 ký tự) trong biến môi trường.`,
    );
    if (typeof o.baoLoi === 'function') {
      try { o.baoLoi(new Error(`${ten} không hợp lệ trên bản thật: ${lyDo}`)); } catch (_) { /* không để việc báo lỗi làm chết boot */ }
    }
  }
  return { khoa: require('crypto').randomBytes(32).toString('hex'), nguon: 'ngau-nhien', lyDo };
}

module.exports = { laBanThat, khoaPhien, DAU_MAY_CHU, BIEN_TEN_SAN };
