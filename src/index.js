'use strict';

/**
 * SiteGuard — điểm vào chính.
 * Tùy framework, import đúng đầu cắm cho gọn:
 *   require('@suga/site-guard/express')   → Express middleware
 *   require('@suga/site-guard/nextjs')    → Next.js guard
 *   require('@suga/site-guard/core')      → lõi thuần (tự ráp)
 */

const core = require('./core');
const { resolveConfig, defaultConfig } = require('./config');

module.exports = {
  ...core,
  resolveConfig,
  defaultConfig,
  express: require('./express'),
  nextjs: require('./nextjs'),
};
