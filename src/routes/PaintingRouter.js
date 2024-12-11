// routes/paintingRoutes.js
const express = require('express');
const router = express.Router();
const PaintingController = require('../controllers/PaintingController');
const MQTTService = require('../services/mqttService');
const MockMQTTService = require("../mocks/MockMQTTService");
// Testing usage
 const mockMqttService = new MockMQTTService();

// Create instances
console.log('router')
// const mqttService = MQTTService.getInstance();
// Only initialize these routes once
const paintingController = new PaintingController( mockMqttService);



 router.route('/')
     .get(paintingController.getAllPaintings.bind(paintingController))
     .post(paintingController.createPainting.bind(paintingController));

 router.route('/:sys_id')
     .get(paintingController.getPainting.bind(paintingController))
     .put(paintingController.updatePainting.bind(paintingController))
     .delete(paintingController.deletePainting.bind(paintingController));



module.exports = router;