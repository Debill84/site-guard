'use strict';

const zlib = require('zlib');
const { compressibleType, pickEncoding } = require('../core/perf');

/**
 * Bọc response Express để NÉN body (gzip/brotli) bằng zlib có sẵn của Node.
 *
 * Cách làm: gom các chunk lại, đến khi `res.end` mới quyết định nén hay không
 * dựa trên Content-Type + độ dài thật + Accept-Encoding của client. Cách "gom rồi
 * nén" đơn giản & chắc hơn can thiệp stream; phù hợp vì các site render HTML trọn
 * trang (cheerio) rồi gửi một lần — body không quá lớn.
 *
 * KHÔNG nén khi: client không nhận; nội dung không phải văn bản; đã có Content-Encoding;
 * body < threshold; status 204/304; request HEAD.
 *
 * @param {object} req
 * @param {object} res
 * @param {object} cfg - config.performance.compression
 */
function wrapResponseForCompression(req, res, cfg) {
  const encoding = pickEncoding(req.headers['accept-encoding'], cfg.encodings || ['br', 'gzip']);
  if (!encoding) return; // client không nhận nén → để nguyên

  const isHead = (req.method || 'GET').toUpperCase() === 'HEAD';
  const origWrite = res.write.bind(res);
  const origEnd = res.end.bind(res);
  const chunks = [];
  let buffering = true;

  function toBuffer(chunk, enc) {
    if (chunk == null) return null;
    return Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, typeof enc === 'string' ? enc : 'utf8');
  }

  res.write = function (chunk, enc, cb) {
    if (!buffering) return origWrite(chunk, enc, cb);
    const b = toBuffer(chunk, enc);
    if (b) chunks.push(b);
    if (typeof enc === 'function') enc();
    else if (typeof cb === 'function') cb();
    return true;
  };

  res.end = function (chunk, enc, cb) {
    if (!buffering) return origEnd(chunk, enc, cb);
    buffering = false;
    if (typeof chunk === 'function') { cb = chunk; chunk = null; enc = null; }
    else if (typeof enc === 'function') { cb = enc; enc = null; }
    const last = toBuffer(chunk, enc);
    if (last) chunks.push(last);
    const body = chunks.length === 1 ? chunks[0] : Buffer.concat(chunks);

    const status = res.statusCode;
    const ct = res.getHeader('Content-Type');
    const alreadyEncoded = !!res.getHeader('Content-Encoding');
    const shouldCompress =
      !isHead &&
      !alreadyEncoded &&
      status !== 204 && status !== 304 &&
      body.length >= (cfg.threshold || 1024) &&
      compressibleType(ct);

    // Báo cho cache/CDN biết response thay đổi theo Accept-Encoding
    appendVary(res, 'Accept-Encoding');

    if (!shouldCompress) {
      res.setHeader('Content-Length', Buffer.byteLength(body));
      return origEnd(body, cb);
    }

    let out;
    try {
      out = encoding === 'br'
        ? zlib.brotliCompressSync(body, {
            params: { [zlib.constants.BROTLI_PARAM_QUALITY]: cfg.brotliQuality != null ? cfg.brotliQuality : 5 },
          })
        : zlib.gzipSync(body, { level: cfg.gzipLevel != null ? cfg.gzipLevel : 6 });
    } catch (_) {
      // Lỗi nén → gửi nguyên bản (fail-safe, không bao giờ làm hỏng response)
      res.setHeader('Content-Length', Buffer.byteLength(body));
      return origEnd(body, cb);
    }

    res.setHeader('Content-Encoding', encoding);
    res.removeHeader('Content-Length'); // độ dài đã đổi sau nén
    res.setHeader('Content-Length', out.length);
    return origEnd(out, cb);
  };
}

function appendVary(res, field) {
  const cur = res.getHeader('Vary');
  if (!cur) { res.setHeader('Vary', field); return; }
  const list = String(cur).split(',').map((s) => s.trim().toLowerCase());
  if (!list.includes(field.toLowerCase())) res.setHeader('Vary', `${cur}, ${field}`);
}

module.exports = { wrapResponseForCompression };
