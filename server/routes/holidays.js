const express = require('express');
const db = require('../db');
const requireAuth = require('../middleware/auth');
const domainError = require('../middleware/domainError');
const { createHolidayService } = require('../services/holidays');
const router = express.Router();
const service = createHolidayService(db);
router.use(requireAuth);
const context = req => ({ userId: req.user.id, actor: 'web', log: req.log });
router.get('/countries', async (req, res, next) => {
  try { res.json(await service.countries(context(req))); } catch (error) { next(error); }
});
router.get('/', async (req, res, next) => {
  const year = typeof req.query.year === 'string' && /^\d{4}$/.test(req.query.year) ? Number(req.query.year) : NaN;
  try { res.json(await service.holidays(context(req), { country: req.query.country, year })); }
  catch (error) { next(error); }
});
router.use(domainError);
module.exports = router;
