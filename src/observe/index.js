// @suga/site-guard/observe — Ống gửi lỗi (CATCH) → HỘP LỖI TRUNG TÂM SugaHub. Bản CommonJS cho site Express.
//
// 🏠 GỐC: trước 01/08/2026 đây là **4 bản chép tay giống nhau từng byte** nằm ở
//    hidental-site/lib/observe.cjs · fidesholding-site/lib/observe.js · sugagroup-site/lib/observe.js ·
//    santapocket-site/lib/observe.js (md5 27cab1e5f8c53b16fd09241b5b82d936). Nay gom về đây.
//    ⚠️ VÌ SAO Ở KHO NÀY chứ không phải `@suga-co/observe-web`: bản kia ship **mã TypeScript thô**
//    (`main: ./src/index.ts`) và nằm ở kho gói RIÊNG — mà cả 4 site đều **0 bí mật Actions**
//    (đã đo `gh secret list`) ⇒ cắm vào là CI đỏ. `@suga/site-guard` công khai, 0 phụ thuộc,
//    và cả 4 site ĐÃ cài sẵn ⇒ thêm một lối vào là xong, không repo nào phải thêm chìa.
//
// Song song bản @suga-co/observe-web (Next.js) — GIỮ NGUYÊN hợp đồng payload đã PROVE ở 5 app
// (nho-nho/marketing/finance/hidental/sugalegal). Đầu nhận: SugaHub POST /api/ingest/errors.
//
// NGUYÊN TẮC:
//  - FIRE-AND-FORGET + timeout cứng 1.5s → KHÔNG bao giờ làm chậm/treo request.
//  - Tự NUỐT mọi lỗi của chính nó (ống gửi lỗi KHÔNG được tự gây lỗi / vòng lặp).
//  - Chỉ gửi METADATA lỗi (loại/route/stack), KHÔNG gửi PII (body/user/cookie).
//  - KEYLESS: gửi kèm project_slug (SugaHub "Ống lỗi MỞ" định tuyến, khỏi cần secret).
//  - Mặc định 🟠 CHỈ-BẮT (engine KHÔNG tự-vá). Van CHÍNH = công tắc trung tâm
//    error_ingest_open ở SugaHub (Bill tắt tất cả 1 chỗ); tắt riêng 1 app: SUGAHUB_OBSERVE=0.
//
// DÙNG (server.js Express):
//   const { createObserver } = require('@suga/site-guard/observe');
//   const observe = createObserver({ slug: 'fides-site', service: 'fides-web' });
//   app.use(observe.expressError());   // đặt NGAY TRƯỚC error-handler cuối
//
// Node 18+ có sẵn fetch/AbortController global — không cần phụ thuộc gì thêm.

'use strict';

const DEFAULT_INGEST_URL = 'https://sugahub.suga.vn/api/ingest/errors';
const TIMEOUT_MS = 1500;
const DEFAULT_CANARY_MS = 15 * 60 * 1000; // 15 phút

// Đọc số NGUYÊN DƯƠNG từ ENV, cắt TRƯỚC `Number()` — vì `Number('')` là `0` chứ không phải
// `NaN`, và số 0 đó đi thẳng vào `setInterval(cb, 0)` ⇒ bắn nhịp liên tục, ngập ống báo lỗi.
// Rỗng/0/âm/không-phải-số → rơi về mặc định (không kêu to, canary không phải cấu hình bắt buộc).
function soDuongTuEnv(raw, macDinh) {
  if (raw === undefined) return macDinh;
  const s = String(raw).trim();
  const v = s === '' ? NaN : Number(s);
  return Number.isFinite(v) && v > 0 ? v : macDinh;
}

// Route đụng tiền MẶC ĐỊNH → gắn money_touch để engine KHÔNG tự-vá. App truyền moneyRe riêng để phủ đúng nghiệp vụ.
const DEFAULT_MONEY_RE =
  /(payment|momo|vnpay|invoice|hoa-don|checkout|cong-no|wallet|ledger|but-toan|so-cai|thanh-toan|luong|payroll|vat|thue)/i;

// Chuẩn hoá route: bỏ id số/uuid để gộp fingerprint đúng nhóm.
function normRoute(r) {
  return String(r || '')
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':uuid')
    .replace(/\/\d+/g, '/:id')
    .slice(0, 300);
}

/**
 * Tạo 1 "ống gửi lỗi" cho site. ENV VẪN override (Railway đổi khỏi sửa code):
 *   SUGAHUB_INGEST_URL · SUGAHUB_PROJECT_SLUG · SUGAHUB_SERVICE · SUGAHUB_INGEST_KEY · SUGAHUB_SEVERITY.
 * Tắt khẩn 1 app: SUGAHUB_OBSERVE=0.
 */
function createObserver(config) {
  config = config || {};
  const env = process.env;
  const url = (env.SUGAHUB_INGEST_URL || config.url || DEFAULT_INGEST_URL).trim();
  const slug = (env.SUGAHUB_PROJECT_SLUG || config.slug || '').trim();
  const service = (env.SUGAHUB_SERVICE || config.service || 'web').trim();
  const key = (env.SUGAHUB_INGEST_KEY || config.key || '').trim();
  const severity = (env.SUGAHUB_SEVERITY || config.severity || 'orange').toLowerCase();
  const moneyRe = config.moneyRe || DEFAULT_MONEY_RE;

  const enabled = () => process.env.SUGAHUB_OBSERVE !== '0';

  // Gửi 1 lỗi về hộp lỗi SugaHub. KHÔNG await, KHÔNG throw.
  function reportError(err, meta) {
    if (!enabled()) return;
    meta = meta || {};
    try {
      const e = err instanceof Error ? err : new Error(String(err));
      const errorType = e.name || 'Error';
      const route = normRoute(meta.route);
      const money = meta.moneyTouch != null ? !!meta.moneyTouch : moneyRe.test(route);
      // meta.fingerprint: lối riêng cho startCanary() ép fingerprint cố định `heartbeat:<service>`
      // (SugaHub khớp `/^(heartbeat|canary):/i` để CHỈ cập "ống còn thông", không đẻ vé lỗi). Site
      // gọi reportError() bình thường không truyền field này ⇒ hành vi cũ giữ nguyên 100%.
      const fingerprint = (meta.fingerprint || (service + ':' + errorType + ':' + (route || '?'))).slice(0, 300);

      const body = {
        fingerprint,
        service,
        env: env.NODE_ENV || 'production',
        severity,
        category: 'exception',
        error_type: errorType,
        message: String(e.message || '').slice(0, 1000),
        route: route || undefined,
        http_method: meta.method,
        http_status: meta.httpStatus,
        request_id: meta.requestId,
        money_touch: money,
        stack: String(e.stack || '').slice(0, 8000),
      };
      if (key) body.ingest_key = key;
      else body.project_slug = slug;

      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
      if (timer && typeof timer.unref === 'function') timer.unref();
      Promise.resolve(
        fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body), // field undefined tự bị loại → giữ allowlist đầu nhận
          signal: ctrl.signal,
        }),
      )
        .catch(() => {})
        .finally(() => clearTimeout(timer));
    } catch (_e) {
      /* nuốt — ống gửi lỗi KHÔNG được tự gây lỗi */
    }
  }

  let canaryTimer = null;

  /**
   * startCanary() — NHỊP-TIM tự-giám-sát của chính ống gửi lỗi này.
   *
   * Định kỳ bắn 1 "lỗi giả" đi TRỌN ĐƯỜNG THẬT (qua đúng `reportError` → POST tới đầu nhận)
   * với fingerprint CỐ ĐỊNH `heartbeat:<service>`. SugaHub khớp `/^(heartbeat|canary):/i` thì
   * CHỈ cập "ống còn thông" — KHÔNG đẻ vé lỗi (xem SugaHub `src/app/api/ingest/errors/route.ts`
   * ~dòng 140). Nhịp NGỪNG tới quá lâu = ống TẮC mà không ai biết (đã từng mù 12 ngày).
   *
   * DÙNG (server.js, sau khi tạo observer):
   *   observe.startCanary();
   *
   * An toàn: 1 đồng hồ/observer (gọi lại vô hại, không chồng đồng hồ) · `unref()` để không giữ
   * process sống · nhịp mặc định 15' đổi bằng `CANARY_INTERVAL_MS` (rỗng/0/âm ⇒ mặc định, KHÔNG
   * bắn liên tục ngập ống) · tắt riêng: `CANARY_DISABLED=1` · tôn trọng công tắc chung
   * `SUGAHUB_OBSERVE=0` · tự nuốt MỌI lỗi, không bao giờ ném ra.
   */
  function startCanary() {
    try {
      if (canaryTimer) return; // đã có đồng hồ — gọi lại là vô hại
      if (env.CANARY_DISABLED === '1') return;
      if (!enabled()) return; // công tắc chung SUGAHUB_OBSERVE=0 tắt luôn cả canary

      const ms = soDuongTuEnv(env.CANARY_INTERVAL_MS, DEFAULT_CANARY_MS);
      const ping = () => {
        try {
          reportError(new Error('canary: kiểm ống báo lỗi còn thông'), {
            route: '/observe/canary',
            moneyTouch: false,
            fingerprint: 'heartbeat:' + service,
          });
        } catch (_e) {
          /* nuốt — nhịp tim KHÔNG được tự gây lỗi */
        }
      };
      canaryTimer = setInterval(ping, ms);
      if (canaryTimer && typeof canaryTimer.unref === 'function') canaryTimer.unref();
    } catch (_e) {
      /* nuốt — startCanary KHÔNG bao giờ được ném ra */
    }
  }

  // Middleware BÁO LỖI cho Express — đặt NGAY TRƯỚC error-handler cuối.
  // Báo lỗi (fire-and-forget) rồi next(err) để handler cũ trả response. KHÔNG đổi hành vi hiện tại.
  function expressError() {
    return function observeErrorReporter(err, req, res, next) {
      try {
        reportError(err, {
          route: req && (req.path || req.originalUrl),
          method: req && req.method,
          httpStatus: 500,
        });
      } catch (_e) {
        /* nuốt */
      }
      next(err);
    };
  }

  return { reportError, expressError, startCanary };
}

// `normRoute` + `DEFAULT_MONEY_RE` xuất ra để ĐO ĐƯỢC (test/observe.js) — site không cần gọi.
module.exports = {
  createObserver, normRoute, DEFAULT_MONEY_RE, DEFAULT_INGEST_URL, TIMEOUT_MS, DEFAULT_CANARY_MS,
};
