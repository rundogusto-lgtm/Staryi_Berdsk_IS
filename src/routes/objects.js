// src/routes/objects.js — REST для объектов парка
const express = require('express');
const { getAllObjects, getObjectById } = require('../services/objectService');

const router = express.Router();

router.get('/', (req, res) => {
  const { type } = req.query;
  res.json({ objects: getAllObjects(type) });
});

router.get('/:id', (req, res) => {
  const object = getObjectById(Number(req.params.id));
  if (!object) return res.status(404).json({ error: 'Объект не найден' });
  res.json(object);
});

module.exports = router;
