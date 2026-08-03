# 🛡️ SiteGuard

Module **rời, cắm-là-chạy** cho mọi site của SugaGroup: **bảo mật + chống crawl + tối ưu tốc độ**.
Một lõi dùng chung, hai đầu cắm: **Express** và **Next.js**.

> Triết lý: **an toàn mặc định** — bật sẵn những thứ không thể làm hỏng site; thứ dễ vỡ giao diện
> (như CSP) để tắt, bật khi sẵn sàng. SiteGuard **không bao giờ làm chết request** (lỗi → cho qua + ghi log).

---

## ⚠️ Repo này là NGUỒN DUY NHẤT của SiteGuard — ĐỪNG tạo bản sao

Mọi nơi dùng SiteGuard đều ghim thẳng repo này qua git-ref, ví dụ:

```jsonc
"@suga/site-guard": "github:Debill84/site-guard#v0.5.0"
```

Consumer hiện tại: 8 web LIVE (santamarket-web · nhonho-code · sghub · santapocket-site ·
marketing-ai · fidesholding-site · sugagroup-site · hidental-site) **và** `suga-backend-kit/apps/fides-kit`.

| Bản | Ai đang ở đó |
|---|---|
| **v0.6.0** (03/08/2026) | chưa consumer nào bump — mới ra, chỉ THÊM `startCanary()` |
| **v0.5.0** (01/08/2026) | 4 site Express dùng ống lỗi: hidental-site · fidesholding-site · sugagroup-site · santapocket-site |
| **v0.3.0** (27/07/2026) | 5 nơi còn lại — **không cần vội bump**: v0.4/v0.5/v0.6 chỉ THÊM (`./observe` + lệnh `kiem-ong-loi` + `startCanary()`), không đổi một dòng nào của `./core` · `./express` · `./nextjs` |

*(v0.4.0 = ống lỗi; v0.5.0 = ống lỗi **+ cái chốt canh nó**; v0.6.0 = **+ nhịp tim tự-giám-sát**. Cắm mới thì lấy thẳng v0.6.0.)*

### 🔁 Ra tag mới thì phải LAN sang consumer — gộp ở đây KHÔNG tự lan

Tag mới nằm im ở repo này thì consumer vẫn chạy bản cũ. Rà bằng:
`grep -rn "site-guard#v" <repo>/package.json`. Khi bump, **sửa cả file lock**, vì dep kiểu git
ghim theo **commit**, không theo tag:

| Trình cài | Chỗ phải sửa trong lock | Sha nào |
|---|---|---|
| npm (`package-lock.json`) | dep gốc + `version` + `resolved#<sha>` | sha **COMMIT** (`git ls-remote --tags` dòng `^{}`) |
| pnpm (`pnpm-lock.yaml`) | `specifier` + `version` + `resolution.tarball` | sha **ĐỐI TƯỢNG TAG** (dòng KHÔNG có `^{}`) — vì pnpm tải qua `codeload.github.com` |

Sửa `package.json` một mình: npm vẫn kéo commit cũ (lưới xanh mà chạy bản cũ), pnpm thì đỏ
`ERR_PNPM_OUTDATED_LOCKFILE`. Tag có chú thích ⇒ **hai sha khác nhau**, đừng dùng lẫn.

### 🧪 CI của consumer chạy test đo thước này mà KHÔNG có token

Nếu consumer còn gói riêng (vd `@debill84/cms` cần token) thì `npm ci` sẽ 403. Lấy đúng một gói:

```bash
GIT_SSH_COMMAND=/usr/bin/false npm i --no-save --prefix /tmp/thuoc \
  "https://github.com/Debill84/site-guard/archive/refs/tags/v0.5.0.tar.gz"
NODE_PATH=/tmp/thuoc/node_modules npm test
```

Repo này PUBLIC ⇒ tarball tải được **không token, không khoá SSH**, ~2 giây.

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
| 📮 Ống gửi lỗi | `createObserver()` — lỗi máy chủ tự bay về hộp lỗi SugaHub, bắn-rồi-quên, không chìa (v0.4) | ✅ |
| 🔒 Chốt canh ống lỗi | Lệnh `kiem-ong-loi` — ai gỡ ống lỗi khỏi `server.js` là cổng ĐỎ (v0.5) | ✅ |
| 💓 Nhịp tim ống lỗi | `startCanary()` — tự bắn "lỗi giả" định kỳ để CHỨNG MINH ống còn thông, không chỉ chờ có lỗi thật (v0.6) | ✅ |

### Ghi chú gói Tốc độ
- **Nén**: tự động cho nội dung văn bản (HTML/CSS/JS/JSON/SVG) ≥ 1KB. Giảm ~**70–85%** dung lượng
  trang thật. Bỏ qua ảnh/video (đã nén) và body nhỏ. Lỗi nén → gửi nguyên bản (an toàn).
- **Cache-Control: MẶC ĐỊNH TẮT** — vì asset của site clone (WordPress) **không có hash tên file**,
  cache "immutable" sẽ làm khách kẹt CSS cũ sau khi cập nhật. Bật + thêm rule khi asset đã hash tên.

## v0.4 — 📮 Ống gửi lỗi (`@suga/site-guard/observe`)

Lỗi máy chủ của site tự bay về **hộp lỗi trung tâm SugaHub**, thay vì nằm chết trong log Railway
mà không ai mở.

```js
const { createObserver } = require('@suga/site-guard/observe');
const observe = createObserver({ slug: 'hidental-site', service: 'hidental-web' });

app.use(observe.expressError());   // đặt NGAY TRƯỚC error-handler cuối
observe.reportError(e, { route: '/admin' });   // hoặc gọi tay ở chỗ đã bắt lỗi
```

**Vì sao nó nằm ở đây.** Trước 01/08/2026 đây là **4 bản chép tay giống nhau từng byte**
(hidental · fides · sugagroup · santapocket, md5 `27cab1e5…`). Chỗ ở "đúng lý" là
`@suga-co/observe-web` — nhưng gói đó ship **mã TypeScript thô** (`main: ./src/index.ts`) và nằm ở
kho gói RIÊNG, trong khi **cả 4 site đều 0 bí mật Actions** (đo bằng `gh secret list`) ⇒ cắm vào là
CI đỏ ngay. Repo này công khai, 0 phụ thuộc, và **cả 4 đã cài sẵn** ⇒ chỉ thêm một lối vào.

| Luật | Nghĩa |
|---|---|
| **Bắn-rồi-quên** | `reportError` trả `undefined` — **không ai await được** ⇒ khách không bao giờ phải chờ ống lỗi |
| **Hạn giờ cứng 1,5s** | có `AbortSignal`; đầu nhận chết cũng không treo request |
| **Tự nuốt lỗi của chính nó** | mạng chết / không có `fetch` → vẫn im, không đẻ vòng lặp lỗi |
| **KHÔNG PII** | chỉ metadata (loại lỗi · route · stack). Không cookie, không body, không user |
| **Không chìa** | gửi kèm `project_slug`; SugaHub định tuyến. Có `SUGAHUB_INGEST_KEY` thì dùng chìa và **bỏ** slug |
| **Route chuẩn hoá** | `/bai-viet/123` → `/bai-viet/:id`, uuid → `:uuid` ⇒ gộp fingerprint đúng nhóm |
| **Van tắt** | van CHÍNH là công tắc trung tâm ở SugaHub; tắt riêng 1 app: `SUGAHUB_OBSERVE=0` |

ENV đè được cấu hình code (Railway đổi khỏi sửa code): `SUGAHUB_INGEST_URL` ·
`SUGAHUB_PROJECT_SLUG` · `SUGAHUB_SERVICE` · `SUGAHUB_INGEST_KEY` · `SUGAHUB_SEVERITY`.

> Mặc định severity `orange` = **CHỈ-BẮT**, engine SugaHub KHÔNG tự-vá. Route đụng tiền
> (`thanh-toan`, `checkout`, `invoice`…) tự gắn `money_touch` để chắc chắn không bị tự-vá.

Thước: `node test/observe.js` (33 bài, không chạm mạng). Nghiệm bằng **9 phép đục, đỏ 9/9**.

## v0.6 — 💓 Nhịp tim tự-giám-sát (`startCanary`)

Ống lỗi CHỈ chạy khi web đã hỏng ⇒ nó im lặng suốt đời, hỏng cũng chẳng ai biết cho tới khi mù
hàng chục ngày (đúng bệnh đã đo được: **19/20 dự án SugaHub 0 nhịp tim ống lỗi**). Nhịp tim là
1 "lỗi giả" định kỳ đi TRỌN đường thật để tự chứng minh ống còn thông.

```js
const observe = createObserver({ slug: 'hidental-site', service: 'hidental-web' });
app.use(observe.expressError());
observe.startCanary();   // gọi 1 lần sau khi tạo observer — KHÔNG cần gọi trong request nào
```

| Luật | Nghĩa |
|---|---|
| **Đi đường thật** | qua đúng `reportError()` → cùng POST/timeout/retry-null như lỗi thật, không phải đường tắt |
| **Fingerprint cố định** | `heartbeat:<service>` — SugaHub khớp `/^(heartbeat\|canary):/i` thì CHỈ cập "ống còn thông", KHÔNG đẻ vé lỗi |
| **1 đồng hồ/observer** | gọi `startCanary()` nhiều lần vô hại, không chồng đồng hồ |
| **`unref()`** | đồng hồ không giữ tiến trình sống |
| **Nhịp mặc định 15'** | đổi bằng `CANARY_INTERVAL_MS`; rỗng/0/âm ⇒ rơi về mặc định — **không** bắn liên tục (bẫy `Number('')===0` ngập ống) |
| **Tắt riêng** | `CANARY_DISABLED=1`; canary cũng tôn trọng công tắc chung `SUGAHUB_OBSERVE=0` |
| **Tự nuốt lỗi** | như mọi phần khác của ống lỗi — không bao giờ ném ra |

Thước: `node test/observe.js` (chung file với v0.4, 10 bài canary trong tổng 33). Nghiệm bằng
**5 phép đục** nhắm đúng 5 luật trên (đồng hồ chồng · nhịp 0/rỗng · `CANARY_DISABLED` ·
`SUGAHUB_OBSERVE=0` · thiếu tiền tố `heartbeat:`) — đỏ đúng 5/5, không lệch bài.

## v0.5 — 🔒 Cái chốt canh ống lỗi (`kiem-ong-loi`)

Ống lỗi là thứ **chỉ chạy khi web đã hỏng**. Gỡ nó ra thì trang vẫn đẹp, mọi test vẫn xanh, chỉ có
hộp lỗi SugaHub im lặng — mà im lặng thì **không ai đi báo**. Nên nó phải có thước canh.

```jsonc
// package.json của site
"test:ong-loi": "kiem-ong-loi server.js"
```
rồi **nối vào cổng** (`npm test` / `npm run build`) — thước không được cổng gọi là thước chết.

Đo 6 thứ: ① lối vào `./observe` nạp được (ghim tag sai là lòi ra) · ② ống lỗi **chạy thật**: bắn
đúng 1 lượt và vẫn `next(err)` · ③ server có tạo observer và `slug` **khác rỗng** (slug rỗng ⇒
SugaHub không biết lỗi của web nào) · ④ có `app.use(...expressError())` · ⑤ lấy từ **gói chung**,
không phải bản chép tay · ⑥ `lib/observe.*` **không mọc lại**.

> Cái chốt nằm ở kho CHUNG, không chép vào từng site — vì nó vốn sinh ra để chữa đúng bệnh
> "chép tay 4 bản giống hệt". Chép nó đi 4 lần là tự dẫm lại vết cũ.

Thước của chính cái chốt: `node test/kiem-ong-loi.js` — dựng **repo giả** trong thư mục tạm rồi
chạy cái chốt như CI chạy, đòi đỏ đúng 7 kiểu phá và xanh khi repo lành (9 bài).

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
