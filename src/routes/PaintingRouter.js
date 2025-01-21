// routes/paintingRoutes.js
const express = require('express');
const router = express.Router();
const PaintingController = require('../controllers/PaintingController');
const RPIController = require('../controllers/RPIController');

const MQTTService = require('../services/mqttService');
const MockMQTTService = require("../mocks/MockMQTTService");
// Testing usage
//  const mockMqttService = new MockMQTTService();

const mqtt = new MQTTService
// Create instances
console.log('router')
// const mqttService = MQTTService.getInstance();
// Only initialize these routes once
const paintingController = new PaintingController(mqtt);
const rpiController = new RPIController(mqtt);



 router.route('/')
     .get(paintingController.getAllPaintings.bind(paintingController))
     .post(paintingController.createPainting.bind(paintingController))
     
    
 router.route('/painting_stats')
 .get(paintingController.getStats.bind(paintingController));

    


 router.route('/:sys_id')
     .get(paintingController.getPainting.bind(paintingController))
     .put(paintingController.updatePainting.bind(paintingController))
     .delete(paintingController.deletePainting.bind(paintingController));
     
 router.route('/:sys_id/shutdown')
.post(rpiController.shutdown_painting.bind(rpiController))

router.route('/:sys_id/restart')
.post(rpiController.restart_painting.bind(rpiController))

router.route('/:sys_id/stop_program')
.post(rpiController.stop_program_painting.bind(rpiController))


router.route('/:sys_id/start_program')
.post(rpiController.start_program_painting.bind(rpiController))





module.exports = router;