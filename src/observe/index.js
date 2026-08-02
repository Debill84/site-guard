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
      const fingerprint = (service + ':' + errorType + ':' + (route || '?')).slice(0, 300);

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

  return { reportError, expressError };
}

// `normRoute` + `DEFAULT_MONEY_RE` xuất ra để ĐO ĐƯỢC (test/observe.js) — site không cần gọi.
module.exports = { createObserver, normRoute, DEFAULT_MONEY_RE, DEFAULT_INGEST_URL, TIMEOUT_MS };
