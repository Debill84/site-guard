'use strict';

/**
 * Rate limiter trong-bộ-nhớ theo "cửa sổ cố định" (fixed window).
 * Không cần Redis — đủ cho 1 tiến trình Node trên Railway. Nếu sau này chạy
 * nhiều instance thì thay store bằng Redis (giữ nguyên interface hit/reset).
 *
 * Tự dọn rác định kỳ để không phình bộ nhớ.
 */
function createRateLimiter({ windowMs, max }) {
  /** @type {Map<string, {count:number, resetAt:number}>} */
  const store = new Map();
  let lastSweep = 0;

  function sweep(now) {
    // Dọn các khóa đã hết hạn (chạy nhiều nhất 1 lần / cửa sổ)
    if (now - lastSweep < windowMs) return;
    lastSweep = now;
    for (const [key, rec] of store) {
      if (rec.resetAt <= now) store.delete(key);
    }
  }

  /**
   * Ghi nhận 1 lượt cho `key`. Lưu ý: NHẬN `now` từ ngoài để dễ test & tránh
   * gọi Date.now() rải rác.
   * @returns {{limited:boolean, remaining:number, retryAfterMs:number, count:number}}
   */
  function hit(key, now) {
    sweep(now);
    let rec = store.get(key);
    if (!rec || rec.resetAt <= now) {
      rec = { count: 0, resetAt: now + windowMs };
      store.set(key, rec);
    }
    rec.count += 1;
    const limited = rec.count > max;
    return {
      limited,
      remaining: Math.max(0, max - rec.count),
      retryAfterMs: Math.max(0, rec.resetAt - now),
      count: rec.count,
    };
  }

  function reset(key) {
    store.delete(key);
  }

  function size() {
    return store.size;
  }

  return { hit, reset, size };
}

module.exports = { createRateLimiter };
