// src/routes/objects.js — REST для справочника объектов парка.
import { Router } from 'express';
import { getAllObjects, getObjectById, getOccupancyForDate } from '../services/objectService.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

const VALID_TYPES = ['gazebo', 'tent', 'parking'];

const router = Router();

/**
 * GET /api/objects — список объектов, опционально с занятостью на дату.
 * @returns {object[]} объекты, при наличии date — с полем busy
 */
router.get(
  '/',
  asyncHandler((req, res) => {
    const { type, date } = req.query;

    if (type && !VALID_TYPES.includes(type)) {
      res.status(400).json({ error: 'Неизвестный тип объекта' });
      return;
    }

    const objects = getAllObjects(type);

    if (!date) {
      res.json({ objects });
      return;
    }

    const occupancy = getOccupancyForDate(date);

    res.json({
      objects: objects.map((object) => ({ ...object, busy: occupancy.get(object.id) === true })),
    });
  }),
);

/**
 * GET /api/objects/:id — один объект по идентификатору.
 * @returns {object} объект
 */
router.get(
  '/:id',
  asyncHandler((req, res) => {
    const object = getObjectById(Number(req.params.id));

    if (!object) {
      res.status(404).json({ error: 'Объект не найден' });
      return;
    }

    res.json(object);
  }),
);

export default router;
