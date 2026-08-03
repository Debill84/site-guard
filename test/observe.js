'use strict';

/**
 * Kiểm chứng ỐNG GỬI LỖI `@suga/site-guard/observe`.
 *
 * Vì sao bài này tồn tại: ống lỗi là thứ **chỉ chạy khi web đã hỏng**. Nó im lặng suốt đời,
 * nên hỏng cũng không ai biết — đúng loại phải có thước canh. 4 site đã chép tay nó 4 lần
 * (giống hệt từng byte) rồi mới gom về đây; gom xong mà không đo thì chỉ là dời chỗ.
 *
 * KHÔNG chạm mạng thật: mọi bài đều thay `globalThis.fetch` bằng máy ghi.
 * Chạy: `node test/observe.js`
 */

const assert = require('assert');
const { createObserver, normRoute, DEFAULT_INGEST_URL, DEFAULT_CANARY_MS } = require('../src/observe');

let pass = 0; let fail = 0;
function test(name, fn) {
  try { fn(); pass += 1; console.log('  ✅', name); }
  catch (e) { fail += 1; console.error('  ❌', name, '\n     ', e.message); }
}

// --- máy ghi thay cho mạng ---------------------------------------------------
// Trả về mảng các lượt gọi; tự trả `fetch` thật lại sau khi chạy xong.
function ghiLai(fn, { fetchNem = false } = {}) {
  const luot = [];
  const that = globalThis.fetch;
  globalThis.fetch = (url, opt) => {
    luot.push({ url, opt, body: opt && opt.body ? JSON.parse(opt.body) : null });
    if (fetchNem) throw new Error('mạng chết');
    return Promise.resolve({ ok: true });
  };
  try { fn(luot); } finally { globalThis.fetch = that; }
  return luot;
}

// Máy ghi thay cho `setInterval` thật — canary không được lập đồng hồ THẬT trong lúc test (treo
// máy chạy test / bắn nhịp thật ra mạng). Trả về mảng {ms, cb}; cb gọi tay để "bấm" 1 nhịp.
function ghiDongHo(fn) {
  const luot = [];
  const goc = global.setInterval;
  global.setInterval = (cb, ms) => {
    const gia = { unref() {} };
    luot.push({ ms, cb, handle: gia });
    return gia;
  };
  try { fn(luot); } finally { global.setInterval = goc; }
}

// Đổi biến môi trường trong đúng 1 bài rồi trả lại nguyên trạng.
function voiEnv(bien, fn) {
  const cu = {};
  for (const k of Object.keys(bien)) { cu[k] = process.env[k]; process.env[k] = bien[k]; }
  try { return fn(); }
  finally {
    for (const k of Object.keys(bien)) {
      if (cu[k] === undefined) delete process.env[k]; else process.env[k] = cu[k];
    }
  }
}

// --- xuất khẩu ---------------------------------------------------------------
test('Xuất từ `@suga/site-guard/observe`', () => {
  assert.strictEqual(typeof createObserver, 'function');
  const o = createObserver({ slug: 'x', service: 'y' });
  assert.strictEqual(typeof o.reportError, 'function');
  assert.strictEqual(typeof o.expressError, 'function');
});

// --- CÔNG TẮC TẮT KHẨN --------------------------------------------------------
test('SUGAHUB_OBSERVE=0 → KHÔNG gọi mạng lần nào (van tắt riêng 1 app)', () => {
  const luot = ghiLai((l) => {
    voiEnv({ SUGAHUB_OBSERVE: '0' }, () => {
      createObserver({ slug: 'a', service: 'b' }).reportError(new Error('bụp'), { route: '/x' });
    });
    assert.strictEqual(l.length, 0, 'van đã tắt mà vẫn bắn đi');
  });
  assert.strictEqual(luot.length, 0);
});

test('Không tắt van → gửi đúng 1 lượt, đúng đầu nhận, đúng POST/JSON', () => {
  ghiLai((l) => {
    createObserver({ slug: 'a', service: 'b' }).reportError(new Error('bụp'), { route: '/x' });
    assert.strictEqual(l.length, 1);
    assert.strictEqual(l[0].url, DEFAULT_INGEST_URL);
    assert.strictEqual(l[0].opt.method, 'POST');
    assert.strictEqual(l[0].opt.headers['Content-Type'], 'application/json');
  });
});

// --- KHÔNG CHÌA (keyless) -----------------------------------------------------
test('Không có chìa → gửi `project_slug`, TUYỆT ĐỐI không có `ingest_key`', () => {
  ghiLai((l) => {
    createObserver({ slug: 'hidental-site', service: 'hidental-web' }).reportError(new Error('e'), { route: '/a' });
    assert.strictEqual(l[0].body.project_slug, 'hidental-site');
    assert.ok(!('ingest_key' in l[0].body), 'lọt chìa vào payload keyless');
  });
});

test('Có chìa → gửi `ingest_key`, BỎ `project_slug` (không gửi cả hai)', () => {
  ghiLai((l) => {
    createObserver({ slug: 'a', service: 'b', key: 'K123' }).reportError(new Error('e'), { route: '/a' });
    assert.strictEqual(l[0].body.ingest_key, 'K123');
    assert.ok(!('project_slug' in l[0].body));
  });
});

// --- CHUẨN HOÁ ROUTE (gộp fingerprint đúng nhóm) -------------------------------
test('normRoute: số → `:id`, uuid → `:uuid`, cắt 300 ký tự', () => {
  assert.strictEqual(normRoute('/bai-viet/123'), '/bai-viet/:id');
  assert.strictEqual(normRoute('/a/1/b/22/c'), '/a/:id/b/:id/c');
  assert.strictEqual(normRoute('/u/3f2504e0-4f89-11d3-9a0c-0305e82c3301'), '/u/:uuid');
  assert.strictEqual(normRoute(null), '');
  assert.strictEqual(normRoute('/' + 'x'.repeat(500)).length, 300);
});

test('Route vào payload đã CHUẨN HOÁ, và fingerprint dựng từ bản chuẩn hoá', () => {
  ghiLai((l) => {
    const o = createObserver({ slug: 'a', service: 'sv' });
    const e = new TypeError('hỏng');
    o.reportError(e, { route: '/tin-tuc/987' });
    assert.strictEqual(l[0].body.route, '/tin-tuc/:id');
    assert.strictEqual(l[0].body.fingerprint, 'sv:TypeError:/tin-tuc/:id');
    assert.strictEqual(l[0].body.error_type, 'TypeError');
  });
});

// --- ĐỤNG TIỀN → engine KHÔNG tự-vá -------------------------------------------
test('Route đụng tiền tự bật `money_touch`; route thường thì không', () => {
  ghiLai((l) => {
    const o = createObserver({ slug: 'a', service: 'b' });
    o.reportError(new Error('e'), { route: '/thanh-toan/momo' });
    o.reportError(new Error('e'), { route: '/checkout' });
    o.reportError(new Error('e'), { route: '/tin-tuc' });
    assert.strictEqual(l[0].body.money_touch, true);
    assert.strictEqual(l[1].body.money_touch, true);
    assert.strictEqual(l[2].body.money_touch, false);
  });
});

test('`meta.moneyTouch` ĐÈ được suy đoán theo route (cả bật lẫn tắt)', () => {
  ghiLai((l) => {
    const o = createObserver({ slug: 'a', service: 'b' });
    o.reportError(new Error('e'), { route: '/tin-tuc', moneyTouch: true });
    o.reportError(new Error('e'), { route: '/thanh-toan', moneyTouch: false });
    assert.strictEqual(l[0].body.money_touch, true);
    assert.strictEqual(l[1].body.money_touch, false);
  });
});

test('`moneyRe` riêng của app phủ được bảng mặc định', () => {
  ghiLai((l) => {
    createObserver({ slug: 'a', service: 'b', moneyRe: /don-hang/ })
      .reportError(new Error('e'), { route: '/don-hang/5' });
    assert.strictEqual(l[0].body.money_touch, true);
  });
});

// --- KHÔNG PII (lằn ranh cứng) -------------------------------------------------
test('Payload chỉ có metadata — KHÔNG lọt cookie/body/user/header của khách', () => {
  ghiLai((l) => {
    const req = {
      path: '/lien-he',
      method: 'POST',
      body: { email: 'khach@example.com', mat_khau: 'bimat' },
      headers: { cookie: 'sess=abc' },
      user: { id: 7 },
    };
    createObserver({ slug: 'a', service: 'b' }).expressError()(new Error('e'), req, {}, () => {});
    const CHO_PHEP = new Set([
      'fingerprint', 'service', 'env', 'severity', 'category', 'error_type', 'message',
      'route', 'http_method', 'http_status', 'request_id', 'money_touch', 'stack',
      'project_slug', 'ingest_key',
    ]);
    const la = Object.keys(l[0].body).filter((k) => !CHO_PHEP.has(k));
    assert.deepStrictEqual(la, [], 'payload mọc thêm ô lạ: ' + la.join(', '));
    const chuoi = JSON.stringify(l[0].body);
    for (const cam of ['khach@example.com', 'bimat', 'sess=abc']) {
      assert.ok(!chuoi.includes(cam), 'LỌT PII: ' + cam);
    }
  });
});

test('Chữ dài bị CẮT: message ≤1000, stack ≤8000', () => {
  ghiLai((l) => {
    const e = new Error('x'.repeat(5000));
    e.stack = 'y'.repeat(20000);
    createObserver({ slug: 'a', service: 'b' }).reportError(e, { route: '/a' });
    assert.strictEqual(l[0].body.message.length, 1000);
    assert.strictEqual(l[0].body.stack.length, 8000);
  });
});

// --- ỐNG GỬI LỖI KHÔNG ĐƯỢC TỰ GÂY LỖI ----------------------------------------
test('Mạng chết → reportError vẫn KHÔNG ném', () => {
  ghiLai(() => {
    assert.doesNotThrow(() => {
      createObserver({ slug: 'a', service: 'b' }).reportError(new Error('e'), { route: '/a' });
    });
  }, { fetchNem: true });
});

test('Không có `fetch` trên máy → vẫn KHÔNG ném', () => {
  const that = globalThis.fetch;
  globalThis.fetch = undefined;
  try {
    assert.doesNotThrow(() => {
      createObserver({ slug: 'a', service: 'b' }).reportError(new Error('e'), { route: '/a' });
    });
  } finally { globalThis.fetch = that; }
});

test('Ném vào thứ KHÔNG phải Error (chuỗi/null) vẫn gửi được', () => {
  ghiLai((l) => {
    const o = createObserver({ slug: 'a', service: 'b' });
    o.reportError('hỏng rồi', { route: '/a' });
    o.reportError(null, { route: '/a' });
    assert.strictEqual(l.length, 2);
    assert.strictEqual(l[0].body.error_type, 'Error');
    assert.ok(l[0].body.message.includes('hỏng rồi'));
  });
});

test('BẮN-RỒI-QUÊN: reportError trả về undefined (không ai await được ⇒ không chặn khách)', () => {
  ghiLai((l) => {
    const kq = createObserver({ slug: 'a', service: 'b' }).reportError(new Error('e'), { route: '/a' });
    assert.strictEqual(kq, undefined);
    assert.strictEqual(l.length, 1);
  });
});

test('Có hạn giờ cứng: mỗi lượt gửi kèm `signal` để tự huỷ', () => {
  ghiLai((l) => {
    createObserver({ slug: 'a', service: 'b' }).reportError(new Error('e'), { route: '/a' });
    assert.ok(l[0].opt.signal, 'thiếu signal ⇒ mạng treo là treo luôn request');
    assert.strictEqual(typeof l[0].opt.signal.aborted, 'boolean');
  });
});

// --- ĐẦU CẮM EXPRESS ----------------------------------------------------------
test('expressError CHUYỀN TIẾP đúng lỗi đó cho handler cuối (không nuốt)', () => {
  ghiLai((l) => {
    const goc = new Error('bụp');
    let nhan = 'CHƯA GỌI';
    createObserver({ slug: 'a', service: 'b' }).expressError()(
      goc, { path: '/a', method: 'GET' }, {}, (e) => { nhan = e; },
    );
    assert.strictEqual(nhan, goc, 'lỗi bị nuốt hoặc bị đổi ⇒ trang khách mất luôn error-handler cũ');
    assert.strictEqual(l.length, 1);
  });
});

test('expressError vẫn gọi next() KỂ CẢ khi mạng chết', () => {
  ghiLai(() => {
    let goi = 0;
    createObserver({ slug: 'a', service: 'b' }).expressError()(
      new Error('e'), { path: '/a', method: 'GET' }, {}, () => { goi += 1; },
    );
    assert.strictEqual(goi, 1);
  }, { fetchNem: true });
});

test('expressError lấy route/method/status từ req; thiếu `path` thì lùi về `originalUrl`', () => {
  ghiLai((l) => {
    const mw = createObserver({ slug: 'a', service: 'b' }).expressError();
    mw(new Error('e'), { path: '/dich-vu/12', method: 'PUT' }, {}, () => {});
    mw(new Error('e'), { originalUrl: '/en/blog/9', method: 'GET' }, {}, () => {});
    assert.strictEqual(l[0].body.route, '/dich-vu/:id');
    assert.strictEqual(l[0].body.http_method, 'PUT');
    assert.strictEqual(l[0].body.http_status, 500);
    assert.strictEqual(l[1].body.route, '/en/blog/:id');
  });
});

test('Không có req (gọi trần) → vẫn không ném, vẫn next()', () => {
  ghiLai(() => {
    let goi = 0;
    assert.doesNotThrow(() => {
      createObserver({ slug: 'a', service: 'b' }).expressError()(new Error('e'), null, null, () => { goi += 1; });
    });
    assert.strictEqual(goi, 1);
  });
});

// --- BIẾN MÔI TRƯỜNG ĐÈ CẤU HÌNH (Railway đổi khỏi sửa code) -------------------
test('ENV đè: URL · service · severity · slug', () => {
  ghiLai((l) => {
    voiEnv({
      SUGAHUB_INGEST_URL: 'https://thu.example/ingest',
      SUGAHUB_SERVICE: 'sv-env',
      SUGAHUB_SEVERITY: 'RED',
      SUGAHUB_PROJECT_SLUG: 'slug-env',
    }, () => {
      createObserver({ slug: 'slug-code', service: 'sv-code', severity: 'orange' })
        .reportError(new Error('e'), { route: '/a' });
    });
    assert.strictEqual(l[0].url, 'https://thu.example/ingest');
    assert.strictEqual(l[0].body.service, 'sv-env');
    assert.strictEqual(l[0].body.severity, 'red', 'severity phải hạ về chữ thường');
    assert.strictEqual(l[0].body.project_slug, 'slug-env');
  });
});

test('Mặc định: severity `orange` (CHỈ-BẮT, engine không tự-vá)', () => {
  ghiLai((l) => {
    createObserver({ slug: 'a', service: 'b' }).reportError(new Error('e'), { route: '/a' });
    assert.strictEqual(l[0].body.severity, 'orange');
    assert.strictEqual(l[0].body.category, 'exception');
  });
});

// --- NHỊP TIM (startCanary) — v0.6 --------------------------------------------
// Ống lỗi CHỈ chạy khi web đã hỏng ⇒ tự nó im lặng suốt đời, hỏng cũng không ai biết.
// Nhịp tim là 1 "lỗi giả" định kỳ đi TRỌN đường thật để chứng minh ống còn thông.

test('startCanary: xuất từ createObserver()', () => {
  const o = createObserver({ slug: 'a', service: 'b' });
  assert.strictEqual(typeof o.startCanary, 'function');
});

test('startCanary: gọi 2 lần chỉ tạo 1 đồng hồ (không chồng đồng hồ)', () => {
  ghiDongHo((luot) => {
    const o = createObserver({ slug: 'a', service: 'canary-sv' });
    o.startCanary();
    o.startCanary();
    assert.strictEqual(luot.length, 1, `gọi 2 lần mà tạo ${luot.length} đồng hồ`);
  });
});

test('CANARY_INTERVAL_MS rỗng hoặc "0" → rơi về mặc định 15 phút (KHÔNG bắn liên tục)', () => {
  ghiDongHo((luot) => {
    voiEnv({ CANARY_INTERVAL_MS: '' }, () => {
      createObserver({ slug: 'a', service: 'sv-rong' }).startCanary();
    });
    voiEnv({ CANARY_INTERVAL_MS: '0' }, () => {
      createObserver({ slug: 'a', service: 'sv-khong' }).startCanary();
    });
    voiEnv({ CANARY_INTERVAL_MS: '-500' }, () => {
      createObserver({ slug: 'a', service: 'sv-am' }).startCanary();
    });
    assert.strictEqual(luot.length, 3);
    assert.strictEqual(luot[0].ms, DEFAULT_CANARY_MS, 'rỗng phải rơi về mặc định, không phải 0');
    assert.strictEqual(luot[1].ms, DEFAULT_CANARY_MS, '"0" phải rơi về mặc định, không phải 0');
    assert.strictEqual(luot[2].ms, DEFAULT_CANARY_MS, 'số âm phải rơi về mặc định');
  });
});

test('CANARY_INTERVAL_MS hợp lệ (số dương) → dùng ĐÚNG giá trị đó (đối chứng dương)', () => {
  ghiDongHo((luot) => {
    voiEnv({ CANARY_INTERVAL_MS: '5000' }, () => {
      createObserver({ slug: 'a', service: 'b' }).startCanary();
    });
    assert.strictEqual(luot[0].ms, 5000);
  });
});

test('CANARY_DISABLED=1 → KHÔNG tạo đồng hồ nào (im hoàn toàn)', () => {
  ghiDongHo((luot) => {
    voiEnv({ CANARY_DISABLED: '1' }, () => {
      createObserver({ slug: 'a', service: 'b' }).startCanary();
    });
    assert.strictEqual(luot.length, 0);
  });
});

test('SUGAHUB_OBSERVE=0 (công tắc chung) → startCanary cũng im theo', () => {
  ghiDongHo((luot) => {
    voiEnv({ SUGAHUB_OBSERVE: '0' }, () => {
      createObserver({ slug: 'a', service: 'b' }).startCanary();
    });
    assert.strictEqual(luot.length, 0);
  });
});

test('Đồng hồ có unref() (không giữ process sống)', () => {
  ghiDongHo((luot) => {
    createObserver({ slug: 'a', service: 'b' }).startCanary();
    assert.strictEqual(typeof luot[0].handle.unref, 'function');
  });
});

test('Nhịp thật: fingerprint bắt đầu `heartbeat:`, đúng `heartbeat:<service>`, money_touch=false, route riêng', () => {
  ghiDongHo((dongHo) => {
    createObserver({ slug: 'a', service: 'canary-sv' }).startCanary();
    assert.strictEqual(dongHo.length, 1);
    ghiLai((l) => {
      dongHo[0].cb(); // tự tay bấm 1 nhịp thay vì chờ 15 phút
      assert.strictEqual(l.length, 1);
      assert.match(l[0].body.fingerprint, /^heartbeat:/);
      assert.strictEqual(l[0].body.fingerprint, 'heartbeat:canary-sv');
      assert.strictEqual(l[0].body.money_touch, false);
      assert.strictEqual(l[0].body.route, '/observe/canary');
    });
  });
});

test('startCanary tự nuốt lỗi: đồng hồ hệ thống hỏng vẫn KHÔNG ném', () => {
  const goc = global.setInterval;
  global.setInterval = () => { throw new Error('đồng hồ hỏng'); };
  try {
    assert.doesNotThrow(() => {
      createObserver({ slug: 'a', service: 'b' }).startCanary();
    });
  } finally { global.setInterval = goc; }
});

test('Nhịp tim: mạng chết vẫn KHÔNG ném (giống hợp đồng reportError)', () => {
  ghiDongHo((dongHo) => {
    createObserver({ slug: 'a', service: 'b' }).startCanary();
    ghiLai(() => {
      assert.doesNotThrow(() => { dongHo[0].cb(); });
    }, { fetchNem: true });
  });
});

console.log(`\nKết quả: ${pass} PASS, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
