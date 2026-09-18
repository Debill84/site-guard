#!/usr/bin/env bash
# Dựng môi trường dev cho site-guard (@suga/site-guard) — chạy: bash scripts/setup-dev.sh
#
# Repo này là THƯ VIỆN, không chạy riêng. Script CỐ Ý không cài gói và không ghi
# gì lên mạng: nó kiểm máy, chạy bộ kiểm, NẠP THỬ từng lối vào khai trong `exports`,
# rồi đối chiếu `version` với tag đã ra. Xanh = máy đủ để làm việc.

set -euo pipefail
cd "$(dirname "$0")/.."

NODE_TOI_THIEU=18
NODE_CI=20

do=$'\e[31m'; xanh=$'\e[32m'; vang=$'\e[33m'; het=$'\e[0m'
ok()   { echo "${xanh}  ✓${het} $1"; }
nhac() { echo "${vang}  ▲${het} $1"; }
chet() { echo "${do}  ✗ $1${het}"; echo; echo "${do}Dừng ở đây. Sửa đúng dòng trên rồi chạy lại.${het}"; exit 1; }
muc()  { echo; echo "── $1"; }

echo "Dựng môi trường dev — site-guard (@suga/site-guard)"
echo "⚠️  Đây là NGUỒN DUY NHẤT của thư viện: nhiều site LIVE ghim thẳng repo này theo tag."
echo "    Sửa ở đây có thể gãy site của nơi khác trong khi repo này vẫn xanh."

muc "1/5 · Node"
command -v node >/dev/null || chet "Chưa có Node. Cài Node ${NODE_CI} trở lên."
node_hien=$(node -v | sed 's/^v//'); node_lon=${node_hien%%.*}
[ "$node_lon" -lt "$NODE_TOI_THIEU" ] && chet "Node đang là $node_hien, repo đòi >= ${NODE_TOI_THIEU} (engines)."
[ "$node_lon" -lt "$NODE_CI" ] && nhac "CI chạy Node ${NODE_CI}. Máy bạn đang ${node_hien} — xanh ở máy chưa chắc xanh ở CI."
ok "Node $node_hien"

muc "2/5 · Phụ thuộc — repo này CỐ Ý không có cái nào"
so_dep=$(node -p 'const p=require("./package.json");Object.keys(p.dependencies||{}).length+Object.keys(p.devDependencies||{}).length')
if [ "$so_dep" != "0" ]; then
  nhac "package.json đang khai ${so_dep} phụ thuộc. Repo vốn 0 phụ thuộc — đó là thứ giúp CI của các site kéo nó bằng tarball ~1 giây, KHÔNG cần token. Chắc chắn chưa?"
else
  ok "0 phụ thuộc — không phải cài gì"
fi
if [ -f package-lock.json ]; then
  nhac "Thấy package-lock.json. Repo vốn KHÔNG có tệp này (0 phụ thuộc nên lockfile vô nghĩa) — nhiều khả năng do lỡ chạy 'npm install'. Đừng commit nó: rm package-lock.json"
fi

muc "3/5 · Bộ kiểm (npm test)"
npm test
ok "npm test xanh"

muc "4/5 · Nạp thử từng lối vào khai trong \"exports\""
node -e '
const p = require("./package.json");
const duong = [];
const gom = (v) => {
  if (typeof v === "string") duong.push(v);
  else if (v && typeof v === "object") for (const k of Object.keys(v)) { if (k !== "types") gom(v[k]); }
};
gom(p.exports || {});
let hong = 0;
for (const d of [...new Set(duong)]) {
  try { require("./" + d.replace(/^\.\//, "")); console.log("  ✓ nạp được " + d); }
  catch (e) { hong++; console.log("  ✗ HỎNG " + d + " — " + e.message); }
}
if (hong) { console.log("\n" + hong + " lối vào hỏng. Consumer cài bản này về là gãy ngay lúc require."); process.exit(1); }
'
ok "Mọi lối vào trong \"exports\" đều nạp được"

muc "5/5 · Đối chiếu version với tag đã ra"
ver=$(node -p 'require("./package.json").version')
tag_moi=$(git tag --sort=-v:refname | head -1 || true)
echo "  package.json: v${ver}   ·   tag mới nhất: ${tag_moi:-(chưa có tag nào)}"
if git rev-parse -q --verify "refs/tags/v${ver}" >/dev/null; then
  ok "v${ver} ĐÃ có tag — bản này đã phát hành"
else
  nhac "v${ver} CHƯA có tag ⇒ chưa nơi nào ghim được bản này. Ra bản mới: git tag v${ver} && git push origin v${ver} — rồi ĐI TỪNG CONSUMER mà sửa (đọc docs/HUONG-DAN-DEV.md mục 6)."
fi

echo
echo "${xanh}Xong. Máy đã đủ để làm việc.${het}"
cat <<'KE'

Bước tiếp:
  npm test                              CỔNG CHÍNH — chạy trước mỗi lần đẩy
  node bin/kiem-ong-loi.js <server.js>  lệnh repo này xuất ra cho consumer dùng

⚠️ `npm test` là DANH SÁCH GÕ TAY trong package.json — thêm test/abc.js mà quên nối
   vào dòng "test" thì bài kiểm nằm chết, KHÔNG ai réo.

⚠️ Kho này CÔNG KHAI: đừng nêu tên tủ bộ nhớ / két bí mật / đường dẫn nội bộ trong
   bất kỳ tệp nào, kể cả dòng chú thích.

Ra bản mới KHÔNG chỉ là gộp vào main — tag không tự lan sang consumer.
Đọc docs/HUONG-DAN-DEV.md mục 6 trước khi bump.
KE
