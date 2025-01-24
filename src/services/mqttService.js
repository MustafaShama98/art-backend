const mqtt = require('mqtt');
const Painting = require('../models/PaintingSystem');
const IMQTTService = require("../interfaces/IMQTTService");
const chalk = require('chalk');
const {start_camera_analyze} = require("../camera/ML-Stream");
const {CameraProcessor} = require("../camera/ML-Stream");
const {PaintingStats} = require("../models/PaintingStats");
const { AsyncClient } = require("async-mqtt");
const {broadcastWS} = require("./websocketService");
const {painting_status} = require('../utils/config')
const winston = require('winston');

const logger = winston.createLogger({
    level: 'info', // Log level
    format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), // Add timestamp
        winston.format.printf(({ level, message, timestamp }) => {
            return `${timestamp} [${level.toUpperCase()}]: ${message}`;
        })
    ),
    transports: [
        new winston.transports.Console() // Log to console
    ]
});

const sleep = (ms) =>
    new Promise(resolve => setTimeout(resolve, ms));


class MQTTService extends IMQTTService {
    constructor() {
        super();
        logger.info('mqttttttt')
        this.mqttClient = mqtt.connect('mqtt://j81f31b4.ala.eu-central-1.emqxsl.com', {
            username: "art",
            password: "art123",
            // clientId: "art_backend111",
            port: 8883,
            protocol: 'mqtts',
        });
        this.paintingStatusMap = new Map(); // Map to hold painting status for each sys_id
        const asyncClient = new AsyncClient(this.mqttClient);
        this.installationCallbacks = new Map();
        this.deletionCallbacks = new Map();
        this.frameCallbacks = new Map();
        this.devices = []
        this.camera = new CameraProcessor(this);

        this.mqttClient.on('connect', async () => {
            logger.info('Connected to MQTT broker');
            const result = await Painting.updateMany({}, { $set: { status: 'Inactive' } });
            logger.info(`${result.modifiedCount} paintings updated to "Inactive".`);
            this.mqttClient.subscribe('m5stack/#', {qos: 2});


            this.mqttClient.publish(
                `status`,
                JSON.stringify(""),
                {qos: 2}
            );

        });

        this.mqttClient.on('message', async (topic, message) => {
            try {
                logger.info(`Received message on topic: ${topic}`);

                const payload = JSON.parse(message?.toString());
                // logger.info('Message payload:',payload);

                let [mainTopic, sys_id, subTopic] = topic.split('/');
                sys_id = parseInt(sys_id)
                if (!this.paintingStatusMap.has(sys_id)) {
                    this.paintingStatusMap.set(sys_id, {
                        wheelchair: 0,
                        sensor: false,
                        height_adjust: false,
                    });
                }
                if (mainTopic === 'install') {
                    const callback = this.installationCallbacks.get(sys_id);
                    if (callback && payload.success !== undefined) {
                        logger.info(`Processing installation response for ${sys_id}:`, payload);
                        await callback(payload);//it will resolve callback and return data to paintingController
                        this.installationCallbacks.delete(sys_id);
                    }
                }

                switch (subTopic) {
                    case 'active': 
                    try {
                        const found_painting = await Painting.findOne({sys_id})
                        if(found_painting && payload.status ) {
                            found_painting.status = "Active"
                            await broadcastWS({sys_id, status: "Active"})
                            await found_painting.save();
                        }
                        else if(found_painting && payload.status === false){
                            if (this.camera.cameraPromisesMap.get(sys_id)) {
                                const {resolve, reject} = this.camera.cameraPromisesMap.get(sys_id);
                                // Option A: Manually resolve
                                resolve({detected: false, reason: 'manually_resolved'})
                            }
                            this.camera.stopCamera(sys_id)
                            found_painting.status = "Inactive"
                            found_painting.sensor = false
                            await broadcastWS({sys_id, status : "Inactive",sensor: false})
                            await found_painting.save()
                            
                    }   
                    break;                 
                } catch (error) {
                        console.error(`Error parsing MQTT payload: ${error.message}`);
                        break; // Exit if the payload is invalid
                    }
                       
                        
                        case 'sensor':
                            logger.info(`Sensor response from ${sys_id}`);
                      
                            const { status: sensor_status, distance } = payload;
                            logger.info(chalk.green(distance,sensor_status))
                          
                        
                            const paintingStatus = this.paintingStatusMap.get(sys_id);
                            try {
                                if (sensor_status === 'in') {
                                    logger.info(chalk.green(`Person detected in range for ${sys_id}. Distance: ${distance} cm`));
                        
                                    // Update painting status and broadcast
                                    paintingStatus.sensor = true;
                                    await broadcastWS({ sys_id, ...paintingStatus });
                        
                                    const painting = await Painting.findOne({ sys_id });
                                    painting.sensor = true;
                        
                                    // Check or create stats record
                                    let stats = await PaintingStats.findOne({ sys_id });
                                    const currentTime = new Date();
                        
                                    if (!stats) {
                                        logger.info(chalk.green('First time this painting has ever been viewed.'));
                                        stats = new PaintingStats({
                                            sys_id: sys_id,
                                            painting_id: painting._id,
                                        });
                                        await stats.save();
                        
                                        // Handle wheelchair detection and height adjustment
                                        painting.wheelchair = 1;
                                        paintingStatus.wheelchair = 1;
                                        await broadcastWS({ sys_id, ...paintingStatus });
                        
                                        const isDetected = await this.camera.startAnalyze(sys_id);
                                        // await sleep(3000);
                        
                                        if (isDetected.detected) {
                                            if(await this.publish_height(sys_id) !== false){
                                                painting.height_adjust = true;
                                                painting.height_adjust = true;
                                            }
                                            painting.wheelchair = 2;
                                            paintingStatus.wheelchair = 2;
                                            await broadcastWS({ sys_id, ...paintingStatus });
                                        } else {
                                            paintingStatus.wheelchair = 0;
                                            painting.wheelchair = 0;
                                            await broadcastWS({ sys_id, ...paintingStatus });
                                        }
                        
                                        await stats.addViewingSession(currentTime, null);
                                    } else {
                                        const lastSession = stats.viewingSessions[stats.viewingSessions.length - 1];
                                     
                                            logger.info(chalk.green('New session started for this painting.'));
                                            painting.wheelchair = 1;
                                            paintingStatus.wheelchair = 1;
                                            await broadcastWS({ sys_id, ...paintingStatus });
                        
                                            const isDetected = await this.camera.startAnalyze(sys_id);
                                            logger.info('Detection result:', isDetected);
                        
                                            if (isDetected?.detected) {
                                                if(await this.publish_height(sys_id) !== false){
                                                    painting.height_adjust = true;
                                                    painting.height_adjust = true;
                                                }                                                painting.wheelchair = 2;
                                                paintingStatus.wheelchair = 2;
                                                await broadcastWS({ sys_id, ...paintingStatus });
                                            } else {
                                                paintingStatus.wheelchair = 0;
                                                painting.wheelchair = 0;
                                                await broadcastWS({ sys_id, ...paintingStatus });
                                            }
                        
                                            await stats.addViewingSession(currentTime, null);
                                            await stats.save();
                                        
                                    }
                        
                                    await painting.save();
                                    logger.info(chalk.bgGreen(`Updated viewing statistics for painting ${sys_id}.`));
                                } else if (sensor_status === 'left') {
                                    logger.info(chalk.yellow(`Person left range for ${sys_id}.`));
                                // Check if the system is active
                                if (this.camera.activeSystems.get(sys_id) === 'active') {
                                    const { resolve } = this.camera.cameraPromisesMap.get(sys_id);
                                    resolve({ detected: false, reason: 'manually_resolved' });
                                    this.camera.stopCamera(sys_id);
                                }
                                    // Handle leaving logic
                                    paintingStatus.sensor = false;
                                    paintingStatus.wheelchair = 0;
                                    paintingStatus.height_adjust = false;
                        
                                    const painting = await Painting.findOne({ sys_id });
                                    painting.sensor = false;
                                    painting.wheelchair = 0;
                                    painting.height_adjust = false;
                        
                                    // Update stats if there's an ongoing session
                                    const stats = await PaintingStats.findOne({ sys_id });
                                    if (stats) {
                                        const lastSession = stats.viewingSessions[stats.viewingSessions.length - 1];
                                        const currentTime = new Date();
                                        if (lastSession && !lastSession.endTime) {
                                            logger.info(chalk.green('Ending current viewing session.'));
                                            await stats.addViewingSession(lastSession.startTime, currentTime);
                                            await stats.save();
                                        }
                                    }
                        
                                    await painting.save();
                                    await broadcastWS({ sys_id, ...paintingStatus });
                                    logger.info(chalk.bgYellow(`Updated painting and statistics for ${sys_id} after leaving.`));
                                } else {
                                    console.warn(`Unknown status "${status}" received for ${sys_id}.`);
                                }
                            } catch (error) {
                                console.error(`Error handling sensor topic for ${sys_id}:`, error);
                            }
                            break;
                        
                    case 'height_done':
                        logger.info(chalk.bgMagenta(`Height adjustment response from ${sys_id}:`), payload);
                        const status = this.paintingStatusMap.get(sys_id);
                        const painting = await Painting.findOne({sys_id})
                        status.height_adjust = true
                        painting.height_adjust =true
                        await sleep(3000)
                        await broadcastWS({sys_id,...status})
                        await painting.save()
                        if (payload.status) {
                            logger.info('received status height done from m5stack')
                            //we might send an rest api back to dashboard
                        }
                        break;
                    case 'install':

                        logger.info('installlllll', payload)
                        switch (payload.device) {
                            case 'm5stack':
                                this.devices.push('m5stack');
                                break;
                            case 'esp32':
                                this.devices.push('esp32');
                                break
                        }
                        logger.info(this.devices)
                        const callback = this.installationCallbacks.get(parseInt(sys_id));
                        if (callback && payload.success !== undefined
                            // && this.devices.length === 2
                        ) {
                            logger.info(`Processing installation response for ${sys_id}:`, payload);
                            callback(payload);
                            this.installationCallbacks.delete(sys_id);
                            this.devices = [];
                        }
                        return;
                    case 'delete':

                        break;
                    case 'frame_response':
                        const frameCallback = this.frameCallbacks.get(sys_id);
                        if (frameCallback) {
                            logger.info('framecallback', frameCallback)
                            frameCallback(payload.frameData);
                            this.frameCallbacks.delete(sys_id);
                        }
                        break;
                    case 'error':
                        console.error(`Error from device ${sys_id}:`, payload);
                        break;

                    default:
                        logger.info(`Unhandled subtopic: ${subTopic}`);
                        break;
                }
            } catch (error) {
                console.error('Error processing message:', error);
            }
        });
    }


    registerFrameCallback(sys_id, callback) {
        this.frameCallbacks.set(sys_id, callback);
    }

    publishGetFrame(sys_id) {
        // Publish to the get_frame topic
        this.mqttClient.publish(`m5stack/${sys_id}/get_frame`, JSON.stringify({
            request: 'frame'
        }));
    }

    publish_shutdown(sys_id) {
        // Publish to the get_frame topic
        this.mqttClient.publish(`m5stack/${sys_id}/shutdown`, JSON.stringify({
            payload: 'shutdown'
        }));
    }

    publish_restart(sys_id) {
        // Publish to the get_frame topic
        this.mqttClient.publish(`m5stack/${sys_id}/restart`, JSON.stringify({
            payload: 'restart'
        }));
    }

    publish_stop_program(sys_id) {
        // Publish to the get_frame topic
        this.mqttClient.publish(`m5stack/${sys_id}/stop`, JSON.stringify({
            payload: 'restart'
        }));
    }


    publish_start_program(sys_id) {
        // Publish to the get_frame topic
        this.mqttClient.publish(`m5stack/${sys_id}/start`, JSON.stringify({
            payload: 'restart'
        }));
    }




    async publish_installation(installationData) {
        const sys_id = parseInt(installationData.sys_id);
        installationData.width = parseInt(installationData.width)
        installationData.height = parseInt(installationData.height)
        installationData.weight = parseInt(installationData.weight)
        installationData.base_height = parseInt(installationData.base_height)
        logger.info('installl data, ', installationData)
        // Clear any existing callbacks for this sys_id
        this.installationCallbacks.delete(sys_id)

        try {
            // Wait for the installation mqtt response on topic install
            const response = await this.waitForInstallationResponse(sys_id,installationData);
            return response;
        } finally {
            // Cleanup: remove the callback regardless of success/failure
            this.installationCallbacks.delete(sys_id);
        }
    }

    async waitForInstallationResponse(sys_id,installationData) {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error(`Installation timeout for sys_id: ${sys_id}`));
            }, 15000);

            this.installationCallbacks.set(sys_id, (response) => {
                clearTimeout(timeout);
                resolve(response);
            });
        const {base_height, height, width, microcontroller} = installationData
        logger.info('tyoe pf ', typeof height, typeof JSON.stringify(height))
            // Publish with QoS 2
            logger.info('Publishing installation request:', {sys_id});
            this.mqttClient.publish('install', JSON.stringify({sys_id,base_height, height, width,microcontroller}),
                {qos: 2}, (err) => {
                if (err) {
                    clearTimeout(timeout);
                    reject(new Error(`Failed to publish installation request: ${err.message}`));
                }
            });
        });
    }


    async publish_height(sys_id) {
        try {
            const found_painting = await Painting.findOne({sys_id: sys_id});
            if (!found_painting)
                return null;

            const {base_height, height} = found_painting;
            const height_adjust = Math.round((height / 2 + base_height) - 119.25);
           

            if (height_adjust > 0) {
                // Publish with QoS 2
                return await new Promise((resolve, reject) => {
                    this.mqttClient.publish(
                        `m5stack/${sys_id}/height`,
                        JSON.stringify(height_adjust),
                        {qos: 2},
                        async (err) => {
                            if (err) {
                                reject(err);
                            } else {

                                process.stdout.write('Height published successfully\n');
                                resolve(true);
                            }
                        }
                    );
                });
            }
            logger.info('height adjustment is minus.')
            return false;
        } catch (error) {
            process.stdout.write(`Error publishing height: ${error.message}\n`);
            throw error;
        }
    }

    publish_deletion(id) {
        return new Promise((resolve, reject) => {
            logger.info('Publishing deletion request:', id);

            // Set timeout for 9 seconds
            const timeout = setTimeout(() => {
                reject(new Error('Deletion request timed out after 9 seconds'));
            }, 9000);

            try {
                this.mqttClient.publish(
                    `m5stack/${id}/delete`,
                    JSON.stringify(id),
                    {qos: 2},
                    (err) => {
                        clearTimeout(timeout); // Clear timeout regardless of success/failure

                        if (err) {
                            reject(new Error(`Deletion publication failed: ${err.message}`));
                        } else {
                            resolve({success: true});
                        }
                    }
                );
            } catch (error) {
                clearTimeout(timeout);
                reject(new Error(`Deletion publication error: ${error.message}`));
            }
        });
    }

    promptInstallation() {
        process.stdout.write('Enter sys_id: ');
        process.stdin.on('data', async (data) => {
            try {
                const sys_id = data.toString().trim();
                const response = await this.publish_installation({sys_id});
                logger.info('Installation response:', response);
                this.promptHeight();
            } catch (error) {
                console.error('Installation failed:', error.message);
                this.promptInstallation();
            }
        });
    }

    promptHeight() {
        process.stdout.write('Enter height: ');
        let height = null;

        process.stdin.on('data', async (data) => {
            const input = data.toString().trim();

            if (!height) {
                height = parseFloat(input);
                process.stdout.write('Enter sys_id: ');
            } else {
                const sys_id = input;
                await this.publish_height(height, sys_id);
                height = null;
                this.promptHeight();
            }
        });
    }

}

module.exports = MQTTService;