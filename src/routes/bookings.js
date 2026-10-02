// src/routes/bookings.js — REST для броней.
import { Router } from 'express';
import {
  createBooking,
  getBookings,
  setStatus,
  cancelBooking,
  getPriceQuote,
  getDashboardSummary,
} from '../services/bookingService.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

const router = Router();

/**
 * POST /api/bookings — создаёт бронь в статусе pending.
 * Тело: { objectId, date, hours, guests, cars }
 * @returns {object} созданная бронь
 */
router.post(
  '/',
  asyncHandler((req, res) => {
    res.status(201).json(createBooking(req.body).booking);
  }),
);

/**
 * POST /api/bookings/quote — считает цену без создания брони.
 * Тело: { objectId, hours, date }
 * @returns {{totalPrice: number, seasonCoefficient: number}}
 */
router.post(
  '/quote',
  asyncHandler((req, res) => {
    const { objectId, hours, date } = req.body;
    res.json(getPriceQuote(objectId, hours, date));
  }),
);

/**
 * GET /api/bookings/summary — срез статистики для дашборда директора.
 * @returns {{total: number, byStatus: object, revenue: number}}
 */
router.get('/summary', asyncHandler((req, res) => {
  res.json(getDashboardSummary());
}));

/**
 * GET /api/bookings — список броней. Фильтры: status, date, objectId.
 * @returns {object[]} брони
 */
router.get(
  '/',
  asyncHandler((req, res) => {
    const { status, date, objectId } = req.query;
    res.json({ bookings: getBookings({ status, date, objectId }) });
  }),
);

/**
 * PATCH /api/bookings/:id/status — меняет статус брони.
 * Тело: { status }
 * @returns {object} обновлённая бронь
 */
router.patch(
  '/:id/status',
  asyncHandler((req, res) => {
    res.json(setStatus(Number(req.params.id), req.body.status).booking);
  }),
);

/**
 * DELETE /api/bookings/:id — отменяет бронь.
 * @returns {object} отменённая бронь
 */
router.delete(
  '/:id',
  asyncHandler((req, res) => {
    res.json(cancelBooking(Number(req.params.id)).booking);
  }),
);

export default router;
