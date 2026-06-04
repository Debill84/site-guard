# 🛡️ SiteGuard

Module **rời, cắm-là-chạy** cho mọi site của SugaGroup: **bảo mật + chống crawl + tối ưu tốc độ**.
Một lõi dùng chung, hai đầu cắm: **Express** và **Next.js**.

> Triết lý: **an toàn mặc định** — bật sẵn những thứ không thể làm hỏng site; thứ dễ vỡ giao diện
> (như CSP) để tắt, bật khi sẵn sàng. SiteGuard **không bao giờ làm chết request** (lỗi → cho qua + ghi log).

---

## Cài đặt

Đây là module nội bộ. Cài từ git (hoặc copy thư mục vào dự án):

```bash
npm install github:Debill84/site-guard      # hoặc đường dẫn local
```

---

## Dùng với Express (Suga / Fides / Santa)

Trong `server.js`, đặt **ngay sau** `const app = express()` và **trước** các route:

```js
const siteGuard = require('@suga/site-guard/express');

app.set('trust proxy', 1);   // đứng sau Railway/Cloudflare → đọc IP thật
app.use(siteGuard());        // mặc định an toàn — xong!
```

Tùy biến (tùy site):

```js
app.use(siteGuard({
  antiCrawl: {
    rateLimit: { max: 200 },                  // nới/siết tần suất
    strictPaths: { paths: ['/admin/login'] }, // đường nhạy cảm cần chặt
  },
  security: {
    headers: { contentSecurityPolicy: "default-src 'self'" }, // bật CSP khi đã test
  },
}));
```

## Dùng với Next.js (NhoNho / DynamicDev / Marketing-AI)

Trong `src/middleware.ts`:

```ts
import { NextResponse } from 'next/server';
import { createNextGuard } from '@suga/site-guard/nextjs';

const guard = createNextGuard();

export function middleware(req: Request) {
  const d = guard.evaluate(req);
  if (d.action !== 'allow') {
    return new NextResponse(d.message || 'Forbidden', { status: d.status, headers: d.headers });
  }
  const res = NextResponse.next();
  for (const [k, v] of Object.entries(d.headers)) res.headers.set(k, v);
  return res;
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
```

---

## Đang có gì

| Nhóm | Tính năng | Trạng thái |
|---|---|---|
| 🛡️ Bảo mật | Security headers (HSTS, X-Frame-Options, nosniff, Referrer/Permissions-Policy), ẩn `X-Powered-By`, CSP (tùy chọn) | ✅ |
| 🤖 Chống crawl | Rate-limit theo IP (chung + chặt cho path nhạy cảm), chặn bot xấu theo User-Agent, cho qua bot tìm kiếm | ✅ |
| ⚡ Tốc độ | Nén brotli/gzip (zlib có sẵn, **không thêm thư viện**), Cache-Control theo path | ✅ |

### Ghi chú gói Tốc độ
- **Nén**: tự động cho nội dung văn bản (HTML/CSS/JS/JSON/SVG) ≥ 1KB. Giảm ~**70–85%** dung lượng
  trang thật. Bỏ qua ảnh/video (đã nén) và body nhỏ. Lỗi nén → gửi nguyên bản (an toàn).
- **Cache-Control: MẶC ĐỊNH TẮT** — vì asset của site clone (WordPress) **không có hash tên file**,
  cache "immutable" sẽ làm khách kẹt CSS cũ sau khi cập nhật. Bật + thêm rule khi asset đã hash tên.

## v0.2 — Tính năng mới

### 🛡️ Chống CSRF (double-submit + HMAC, 0 phụ thuộc)
```js
const { csrfProtection } = require('@suga/site-guard/express');
const csrf = csrfProtection({ secret: process.env.SESSION_SECRET });
app.use(csrf);
// Render form (EJS): <input type="hidden" name="_csrf" value="<%= req.csrfToken() %>">
// Hoặc JS gửi header: X-CSRF-Token: <token lấy từ <meta>>
```
GET tự phát cookie; POST/PUT/PATCH/DELETE bắt buộc token khớp, sai → 403. `ignorePaths` để bỏ qua webhook.

### 🤖 Turnstile (CAPTCHA Cloudflare miễn phí) cho form/login
```js
const { createTurnstile, turnstileWidget, turnstileScript } = require('@suga/site-guard/express');
const ts = createTurnstile({ secret: process.env.TURNSTILE_SECRET });
app.post('/api/contact', express.urlencoded({extended:true}), ts.middleware(), handler);
// Trong <head>: turnstileScript()   |   Trong <form>: turnstileWidget(process.env.TURNSTILE_SITEKEY)
```
Lấy key: Cloudflare dashboard → Turnstile → Add site (SITE KEY gắn web, SECRET KEY cho server).

### 🪤 Honeypot (chống bot điền form, không phiền người thật)
```js
const { honeypot, honeypotField } = require('@suga/site-guard/express');
app.post('/api/contact', express.urlencoded({extended:true}), honeypot(), handler);
// Trong <form>: honeypotField()   ← ô ẩn, người thật để trống, bot tự điền → chặn
```

### ⚡ Cache thông minh cho Cloudflare (tăng tốc trang động)
```js
const { cache, CACHE_PRESETS } = require('@suga/site-guard/express');
app.get('/', cache(CACHE_PRESETS.cdnDynamic), handler);   // CF cache 60s + stale-while-revalidate
app.use('/admin', cache(CACHE_PRESETS.noStore));          // admin: không cache
```
`cdnDynamic` = trang động được Cloudflare phục vụ như tĩnh → nhanh & giảm tải server. Admin sửa nội dung: purge cache CF hoặc chờ tối đa 60s.

### Chặn bot AI (tùy chọn — mặc định TẮT để giữ AI index)
```js
app.use(siteGuard({ antiCrawl: { bots: { blockAiScrapers: true } } })); // chặn GPTBot/ClaudeBot/PerplexityBot...
```

### Headers bổ sung (tự động, ngang helmet)
Origin-Agent-Cluster, X-DNS-Prefetch-Control, X-Permitted-Cross-Domain-Policies.

## Cấu hình

Xem toàn bộ mặc định + giải thích trong [`src/config.js`](src/config.js). Mọi nhóm có cờ `enabled`
để bật/tắt độc lập. `bypassPaths` để cho qua hoàn toàn (vd webhook nội bộ).

## Kiểm thử

```bash
npm test     # smoke (lõi) + integration (đầu cắm Express) — thuần Node, không cần mạng
```

---
*Tài liệu nội bộ SugaGroup. Không công khai.*
