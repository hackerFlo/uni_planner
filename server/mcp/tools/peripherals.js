const { z } = require('zod');
const { DomainError } = require('../../domain/errors');
const { createMutationService } = require('../../domain/mutation');
const { createHolidayService, holidayInputSchema } = require('../../services/holidays');
const { createQuoteService, quoteDailySchema } = require('../../services/quotes');
const { createPreferenceService, preferenceSchemas } = require('../../services/preferences');
const { createNotificationService, notificationSchemas } = require('../../services/notifications');
const { createExportService, exportSchemas } = require('../../services/exports');

function quoteTools(db, config, readVersion, authorize) {
  const quotes = createQuoteService(db);
  const maintain = createMutationService(db, { authorize: ctx => {
    if (!config.writesEnabled || !ctx.capabilities?.includes('planner_write') || !authorize) {
      throw new DomainError('FORBIDDEN', 'Quote selection requires enabled planner writes', 403);
    }
    authorize(ctx, 'get_daily_quote');
  } }).maintain;
  return [
    { name: 'get_quote_stats', capability: 'planner_read', description: 'Read counts of your uploaded and visible built-in quotes, including disliked and available quotes.',
      schema: z.strictObject({}), action: quotes.stats },
    { name: 'get_daily_quote', capability: 'planner_read', writes: true,
      description: 'Read the pinned quote for an explicit calendar date. Default select=false is pure and reports selectionRequired when unpinned; select=true may change rotation and requires enabled planner writes.',
      schema: quoteDailySchema, action: (ctx, args) => {
        if (!args.select) return quotes.daily(ctx, args);
        return maintain(ctx, () => {
          const before = readVersion(ctx);
          const data = quotes.daily(ctx, args);
          return { data, changed: readVersion(ctx).revision !== before.revision };
        }).data;
      } },
  ];
}

function referenceTools(db) {
  const holidays = createHolidayService(db);
  const preferences = createPreferenceService(db);
  return [
    { name: 'list_holiday_countries', capability: 'planner_read', writes: true, openWorld: true,
      description: 'List countries from the fixed holiday provider. May refresh the shared public cache using a bounded external request.',
      schema: z.strictObject({}), action: holidays.countries },
    { name: 'get_holidays', capability: 'planner_read', writes: true, openWorld: true,
      description: 'Read holidays, including weekends, for a country/year and optional subdivision. May refresh the shared public cache from the fixed provider.',
      schema: holidayInputSchema, action: holidays.holidays },
    { name: 'list_preference_profiles', capability: 'planner_read',
      description: 'List only your device preference profiles in bounded pages. Select a specific profile before editing preferences.',
      schema: preferenceSchemas.list, action: preferences.list },
    { name: 'get_preferences', capability: 'planner_read', description: 'Read normalized preferences for one explicitly selected owned device profile, including the fuzzy, ring or robot agent activity icon choice.',
      schema: preferenceSchemas.get, action: preferences.get },
  ];
}

function sensitiveTools(db, options) {
  const notifications = createNotificationService(db, { authorize: options.authorize, sendTestEmail: options.sendTestEmail });
  const exports = createExportService(db);
  return [
    { name: 'get_notification_settings', capability: 'notifications',
      description: 'Read saved notification enabled state, time, IANA timezone and recipient address. Requires the notifications grant.',
      schema: z.strictObject({}), action: notifications.settings },
    { name: 'send_test_notification', capability: 'notifications', mutation: true, openWorld: true,
      description: 'Send a test notification only to your saved recipient. Requires current version and retry key. Reusing a key never resends; an uncertain delivery returns DELIVERY_UNKNOWN and cannot be recalled or undone.',
      schema: notificationSchemas.sendTest, action: notifications.sendTest },
    { name: 'prepare_backup_export', capability: 'export', writes: true,
      description: 'Create a frozen private backup, at most 5 MiB, expiring in ten minutes. Includes your plaintext notification email. Returns artifact ID, size, checksum and expiry; no restore or public URL.',
      schema: exportSchemas.prepare, action: exports.prepare },
    { name: 'read_backup_export_chunk', capability: 'export',
      description: 'Read up to 48 KiB of an owned unexpired frozen backup as base64. Backup includes your plaintext notification email. Returns byte offsets, total size and SHA-256 checksum.',
      schema: exportSchemas.readChunk, action: exports.readChunk },
  ];
}

function peripheralTools(db, config, readVersion, options = {}) {
  return [...referenceTools(db), ...quoteTools(db, config, readVersion, options.authorize), ...sensitiveTools(db, options)];
}
module.exports = { peripheralTools };
