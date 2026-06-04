'use strict';

/**
 * Phát hiện bot dựa trên User-Agent (thuần dữ liệu, không phụ thuộc framework).
 *
 * Nguyên tắc:
 *  - Cho qua các bot tìm kiếm hợp lệ (Google/Bing/...) để KHÔNG hại SEO.
 *  - Chặn các công cụ cào/script tự động phổ biến (curl, scrapy, python-requests...).
 *  - Tùy chọn chặn request không có User-Agent (đặc trưng của script thô).
 *
 * Lưu ý: UA có thể bị giả mạo — đây là LỚP 1 (chặn rẻ tiền, lọc 80% bot ngu).
 * Lớp sâu hơn (nhịp request, fingerprint, challenge) làm ở bước sau.
 */

// Bot tìm kiếm hợp lệ — cho qua khi allowSearchEngines = true
const GOOD_BOTS = [
  'googlebot', 'bingbot', 'slurp', 'duckduckbot', 'baiduspider',
  'yandexbot', 'applebot', 'facebookexternalhit', 'twitterbot',
  'linkedinbot', 'telegrambot', 'whatsapp', 'zalo',
];

// Dấu hiệu công cụ cào / thư viện HTTP tự động — chặn khi mode='block'
const BAD_BOTS = [
  'curl', 'wget', 'python-requests', 'python-urllib', 'scrapy',
  'httpclient', 'go-http-client', 'java/', 'okhttp', 'libwww-perl',
  'phantomjs', 'headlesschrome', 'puppeteer', 'playwright',
  'node-fetch', 'axios', 'aiohttp', 'httpx', 'wpscan', 'nikto',
  'sqlmap', 'masscan', 'nmap', 'zgrab', 'semrushbot', 'ahrefsbot',
  'mj12bot', 'dotbot', 'petalbot', 'bytespider',
];

// Bot AI cào dữ liệu để huấn luyện/tổng hợp — chặn TÙY CHỌN (blockAiScrapers)
const AI_SCRAPERS = [
  'gptbot', 'oai-searchbot', 'chatgpt-user', 'claudebot', 'claude-web',
  'anthropic-ai', 'perplexitybot', 'ccbot', 'google-extended', 'bytespider',
  'amazonbot', 'applebot-extended', 'cohere-ai', 'diffbot', 'imagesiftbot',
  'omgili', 'omgilibot', 'facebookbot', 'meta-externalagent', 'timpibot',
];

function lc(s) {
  return (s || '').toLowerCase();
}

function isAiScraper(ua) {
  const u = lc(ua);
  return AI_SCRAPERS.some((b) => u.includes(b));
}

function isGoodBot(ua) {
  const u = lc(ua);
  return GOOD_BOTS.some((b) => u.includes(b));
}

function isBadBot(ua) {
  const u = lc(ua);
  return BAD_BOTS.some((b) => u.includes(b));
}

/**
 * Quyết định với 1 User-Agent.
 * @param {string} ua
 * @param {object} botsCfg - config.antiCrawl.bots
 * @returns {{block:boolean, reason:string|null, good:boolean}}
 */
function inspectUserAgent(ua, botsCfg) {
  if (!botsCfg || botsCfg.mode === 'off') return { block: false, reason: null, good: false };

  const good = isGoodBot(ua);
  if (good && botsCfg.allowSearchEngines) return { block: false, reason: null, good: true };

  if (botsCfg.blockEmptyUserAgent && (!ua || !ua.trim())) {
    return { block: botsCfg.mode === 'block', reason: 'empty-user-agent', good: false };
  }

  if (isBadBot(ua)) {
    return { block: botsCfg.mode === 'block', reason: 'bad-bot-signature', good: false };
  }

  if (botsCfg.blockAiScrapers && isAiScraper(ua)) {
    return { block: botsCfg.mode === 'block', reason: 'ai-scraper', good: false };
  }

  return { block: false, reason: null, good };
}

module.exports = { inspectUserAgent, isGoodBot, isBadBot, isAiScraper, GOOD_BOTS, BAD_BOTS, AI_SCRAPERS };
