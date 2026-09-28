// src/routes/bookings.js — REST для броней
const express = require('express');
const {
  createBooking,
  listBookings,
  setStatus,
} = require('../services/bookingService');

const router = express.Router();

router.post('/', (req, res) => {
  const result = createBooking(req.body);
  if (!result.ok) return res.status(400).json({ error: result.error });
  res.status(201).json(result.booking);
});

router.get('/', (req, res) => {
  const { status, date } = req.query;
  res.json({ bookings: listBookings({ status, date }) });
});

router.patch('/:id/status', (req, res) => {
  const { status } = req.body;
  const result = setStatus(Number(req.params.id), status);
  if (!result.ok) return res.status(400).json({ error: result.error });
  res.json(result.booking);
});

module.exports = router;
