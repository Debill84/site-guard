# Hướng dẫn dev — site-guard (`@suga/site-guard`)

> Dành cho dev mới vào repo này. Đọc hết một lượt (~8 phút) trước khi gõ lệnh đầu tiên.
> Có gì sai/thiếu trong file này → sửa nó trong cùng PR, đừng để người sau vấp lại.

## 1. Repo này là gì

**Thư viện dùng chung** — module bảo mật + chống crawl + tối ưu tốc độ + ống gửi lỗi, cắm vào site
Express và Next.js. **Nó không chạy riêng**: không có `npm start`, không có server, không có CSDL.

Hai điều làm repo này khác mọi repo sản phẩm:

- **Đây là NGUỒN DUY NHẤT.** Nơi khác ghim thẳng repo này qua git-ref
  (`"@suga/site-guard": "github:Debill84/site-guard#vX.Y.Z"`). Đừng tạo bản sao — chuyện đó **đã
  xảy ra rồi**: 4 repo từng có bản chép tay của ống lỗi, giống nhau **từng byte**, và đã phải dọn.
- **Sửa ở đây không đỏ ở đây.** Một thay đổi phá tương thích là gãy site **đang chạy thật** của
  nơi khác, trong khi `npm test` của repo này vẫn xanh.

🌍 **Kho này CÔNG KHAI.** Xem mục 2 — có một luật chỉ áp cho repo công khai.

## 2. ⛔ Việc CẤM — đọc trước mọi thứ khác

| Cấm | Nếu làm thì mất gì |
|---|---|
| **Nêu tên tủ bộ nhớ / két bí mật / đường dẫn nội bộ trong bất kỳ tệp nào** | Kho **công khai** — ai cũng đọc được. Sổ tay và chú thích chỉ được nói *"sổ tay nội bộ của máy"*, không nêu tên. |
| **Tạo bản sao SiteGuard ở repo khác** (chép `src/` sang) | Bản chép không nhận được bản vá. Đã có tiền lệ 4 bản giống nhau từng byte, phải dọn tay. Cần thêm gì thì **thêm vào đây rồi ra tag**. |
| **Đổi API công khai (khoá `exports`) mà không nâng phiên bản + ra tag** | 8+ site đang ghim. Đổi ngầm là site khác gãy lúc cài lại, người sửa không có manh mối vì repo của họ không đổi dòng nào. |
| **Gộp vào `main` rồi tưởng consumer tự có bản mới** | **Tag không tự lan.** Gộp xong mà không ra tag + không đi sửa từng consumer thì mọi nơi vẫn chạy bản cũ — xem mục 6. |
| **Thêm phụ thuộc (`dependencies`)** | Repo cố ý **0 phụ thuộc**: CI của các site kéo nó bằng tarball tag ~1 giây, **không cần token**. Thêm một gói là phá đúng tính chất đó. |
| **Viết mã có thể làm CHẾT request** | Triết lý của thư viện: **an toàn mặc định, không bao giờ làm chết request** — lỗi thì cho qua + ghi log. Một `throw` lọt ra là làm sập trang của mọi consumer cùng lúc. |
| **Cắm SiteGuard vào app mà không loại trừ endpoint thanh toán / cron / webhook** | Rate-limit + chặn bot sẽ chặn nhầm máy gọi máy. Đây là việc ở phía app, nhưng lỗi thì đổ về đây. |
| **`git add -A` / `git add .`** | Cuốn theo `node_modules/`, `package-lock.json` sinh ra ngoài ý muốn (xem mục 4). |
| **Commit secret trần** | `.env` + `.env.*` đã bị chặn. Có workflow gitleaks. Kho công khai ⇒ lỡ commit là coi như lộ ngay, xoá sau không cứu được. |

## 3. Dựng máy — một lệnh

```bash
git clone https://github.com/Debill84/site-guard.git
cd site-guard
bash scripts/setup-dev.sh
```

Script **không cài gói, không ghi gì lên mạng.** Nó kiểm Node → xác nhận repo vẫn **0 phụ thuộc** →
`npm test` → **nạp thử từng lối vào khai trong `exports`** → đối chiếu `version` với tag đã ra.

## 4. Máy cần gì

| Thứ | Bản đúng cho repo này | Cách kiểm |
|---|---|---|
| Node | **>= 18** (`engines`), CI chạy **20** | `node -v` |
| Trình quản lý gói | npm — nhưng **gần như không dùng đến** | `npm -v` |
| Token gói riêng | **KHÔNG CẦN** — repo không có phụ thuộc nào | — |
| GitHub CLI | mở PR, xem CI đỏ, ra tag | `gh auth status` |

> 🪤 **Đừng chạy `npm install` ở đây theo phản xạ.** Repo **không có `package-lock.json`** (0 phụ
> thuộc nên lockfile vô nghĩa). `npm install` sẽ **sinh ra một cái** — rồi nó lẫn vào PR của bạn.
> Nếu lỡ, xoá đi: `rm package-lock.json`.

## 5. Kiểm trước khi mở PR

```bash
npm test    # 10 tệp: smoke · express · perf · v02 · csrf · turnstile · moi-truong · observe · kiem-ong-loi · loc-html
```

Bài kiểm **tự dựng server nội bộ** để đo CSRF/turnstile/perf — không cần mạng, không cần CSDL.

> ⚠️ `npm test` ở đây là **danh sách gõ tay** trong `package.json`. Thêm `test/abc.js` mà quên nối
> vào dòng `"test"` thì **bài kiểm nằm chết, không ai réo**. (Chính repo này xuất ra lệnh
> `kiem-ong-loi` cho nơi khác canh chuyện tương tự — nhưng ở đây thì tự canh lấy.)

Lệnh xuất ra cho consumer dùng:

```bash
node bin/kiem-ong-loi.js <đường dẫn server.js của site>
```

## 6. Ra bản mới — phần dễ trượt nhất

Bốn bước, **thiếu bước nào cũng thành "vá rồi mà nơi khác vẫn hỏng"**:

1. **Nâng `version`** trong `package.json`.
2. **Ra tag** khớp đúng số đó: `git tag vX.Y.Z && git push origin vX.Y.Z`.
3. **Đi từng consumer mà sửa** — gộp ở đây **không tự lan**. Rà bằng:
   ```bash
   grep -rn "site-guard#v" <repo>/package.json
   ```
4. **Sửa cả file lock của consumer.** Dep kiểu git ghim theo **commit**, không theo tag: phải sửa
   dep gốc + `version` + `resolved#<sha>`, với sha là **sha COMMIT** —
   `git ls-remote --tags https://github.com/Debill84/site-guard` rồi lấy dòng có `^{}`.

Và một chỗ nữa dễ quên: vài site ghim tag ở **hai nơi** — `package.json` **và** URL tarball trong
`ci.yml` của chúng. Sửa một nơi là **CI của site đó đang đo một bản khác bản chạy thật** (đã trả
giá 05/08/2026).

> 🪤 **Đừng tin bảng phiên bản trong `README.md` — đo lại.** Bảng đó liệt kê "ai đang ở bản nào";
> nó **trôi** mỗi lần có tag mới mà chưa ai cập nhật. Đo bằng `git tag --sort=-v:refname | head -1`
> và `grep -rn "site-guard#v"` ở từng consumer.

## 7. Mở PR

- **Fetch/pull trước khi làm và trước khi push.**
- Stage đúng file mình sửa, không `git add -A`.
- Đổi thứ nằm trong `exports` → nói rõ trong PR **nơi nào đang dùng lối vào đó** và **có phá tương
  thích không**.
- CI: `ci.yml` (Node 20 · `npm test`) + `secret-scan.yml` (gitleaks).

## 8. Bộ nhớ dự án

Nằm ở sổ tay nội bộ trên máy, **không nằm trong repo này** và **không được nêu tên ở đây** (kho
công khai — mục 2).
