# 🛡️ SiteGuard

Module **rời, cắm-là-chạy** cho mọi site của SugaGroup: **bảo mật + chống crawl + tối ưu tốc độ**.
Một lõi dùng chung, hai đầu cắm: **Express** và **Next.js**.

> Triết lý: **an toàn mặc định** — bật sẵn những thứ không thể làm hỏng site; thứ dễ vỡ giao diện
> (như CSP) để tắt, bật khi sẵn sàng. SiteGuard **không bao giờ làm chết request** (lỗi → cho qua + ghi log).

---

## ⚠️ Repo này là NGUỒN DUY NHẤT của SiteGuard — ĐỪNG tạo bản sao

Mọi nơi dùng SiteGuard đều ghim thẳng repo này qua git-ref, ví dụ:

```jsonc
"@suga/site-guard": "github:Debill84/site-guard#v0.2.2"
```

Consumer hiện tại: 7 web LIVE (santamarket-web · nhonho-code · sghub · santapocket-site ·
marketing-ai · fidesholding-site · sugagroup-site) **và** `suga-backend-kit/apps/fides-kit`.

**KHÔNG copy code này thành package thứ hai** (ví dụ `packages/site-guard` trong monorepo). Trước đây
từng có bản sao `@suga-co/site-guard` trong `suga-backend-kit` → mỗi lần vá lỗ phải sửa 2 chỗ, dễ sót
(đã dính đúng khi vá lỗ rate-limit XFF). Bản sao đó đã bị xoá, monorepo nay trỏ về đây.

> **Vì sao repo này (PUBLIC) bắt buộc là nguồn chính:** SiteGuard là dependency **chạy-thật production**.
> Web deploy trên Railway bằng `npm ci` **không có token kho riêng** → chỉ **git-ref tới repo PUBLIC**
> mới cài được token-free. Một package private (GitHub Packages, cần token) sẽ làm **gãy deploy**. Vá lỗ
> → sửa ở đây, bump version, tag mới; consumer bump git-ref là xong.

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

## Dùng với Next.js (NhoNho / SugaHub / Marketing-AI)

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
| 🕳️ Fail-closed | `laBanThat()` + `khoaPhien()` — cấu hình vắng mặt **ngã về KHOÁ**, không rơi về khoá dev trong repo (v0.3) | ✅ |
| ⚡ Tốc độ | Nén brotli/gzip (zlib có sẵn, **không thêm thư viện**), Cache-Control theo path | ✅ |

### Ghi chú gói Tốc độ
- **Nén**: tự động cho nội dung văn bản (HTML/CSS/JS/JSON/SVG) ≥ 1KB. Giảm ~**70–85%** dung lượng
  trang thật. Bỏ qua ảnh/video (đã nén) và body nhỏ. Lỗi nén → gửi nguyên bản (an toàn).
- **Cache-Control: MẶC ĐỊNH TẮT** — vì asset của site clone (WordPress) **không có hash tên file**,
  cache "immutable" sẽ làm khách kẹt CSS cũ sau khi cập nhật. Bật + thêm rule khi asset đã hash tên.

## v0.3 — 🕳️ "Cấu hình vắng mặt phải ngã về KHOÁ"

Đúc từ **2 sự cố cùng ngày 26/07/2026** (Santa lộ mã OTP · HiDental rớt biến Supabase là vào thẳng
quyền CHỦ). Câu hỏi đắt khi rà **không** phải "biến này đúng chưa" mà:

> **"Biến này BIẾN MẤT thì hệ ngã về KHOÁ hay ngã về MỞ?"**

```js
const { laBanThat, khoaPhien } = require('@suga/site-guard/core');

app.use(cookieSession({
  name: 'sgsite_sess',
  // THIẾU/YẾU biến ⇒ KHÔNG rơi về khoá dev nằm trong repo (ai đọc repo cũng tự ký được
  // cookie `role: owner` → chiếm trọn CMS). Bản thật: sinh khoá ngẫu nhiên + kêu to + báo Hộp lỗi.
  secret: khoaPhien({ khoaDev: 'dev_secret_change_me', baoLoi: (e) => observe.reportError(e) }).khoa,
  maxAge: 7 * 24 * 60 * 60 * 1000,
  sameSite: 'lax',
}));
```

| Hàm | Việc |
|---|---|
| `laBanThat(env?)` | "Đang chạy trên bản THẬT?" — soi `NODE_ENV`, biến **đặt tên sân** (`APP_ENV`/`ENVIRONMENT`), và **dấu máy chủ của 12 nhà cung cấp** (Railway/Render/Fly/Heroku/K8s/AWS/Azure/Vercel/Netlify) + lối phổ quát `DEPLOYED=1`. Nghi ngờ → nghiêng về **bản thật**. |
| `khoaPhien({ten,khoaDev,toiThieu,baoLoi,log,env})` | Khoá ký cookie phiên: có biến hợp lệ → dùng; thiếu/yếu/đang-là-khoá-dev → **máy thợ** dùng khoá dev, **bản thật** sinh khoá ngẫu nhiên + kêu to. Trả `{khoa, nguon, lyDo}`. |

**2 cái bẫy đã trả giá để biết** (đừng dẫm lại):

1. ❌ **Đừng nhận diện bản thật bằng `NODE_ENV==='production'`.** Site Express chạy `node server.js`
   thường **không có** biến đó (đo thật: cả 3 site Suga trên Railway) ⇒ tưởng bản thật là máy thợ →
   vẫn dùng khoá dev. *(App Next.js thì `next build/start` tự đặt — đừng suy rộng từ Next sang Express.)*
2. ❌ **Đừng chỉ soi `RAILWAY_*`.** Rời Railway sang Fly/Render/VPS là hết biến đó ⇒ bản thật bị coi
   là máy thợ. → xem `Bill-AI` luật *không phụ thuộc nhà cung cấp*.

Cố ý **không** `process.exit`: web công khai phải sống. Hệ quả duy nhất khi thiếu biến trên bản thật
là ai đang đăng nhập `/admin` bị đăng xuất sau mỗi lần deploy — **không phải** lỗ bảo mật.

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
