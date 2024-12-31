const mqtt = require('mqtt');
const Painting = require('../models/PaintingSystem');
const IMQTTService = require("../interfaces/IMQTTService");
const chalk = require('chalk');
const {start_camera_analyze} = require("../camera/ML-Stream");
const CameraProcessor = require("../camera/ML-Stream");
const {PaintingStats} = require("../models/PaintingStats");
const { AsyncClient } = require("async-mqtt");
const {broadcastWS} = require("./websocketService");
const {painting_status} = require('../utils/config')
const sleep = (ms) =>
    new Promise(resolve => setTimeout(resolve, ms));
class MQTTService extends IMQTTService {
    constructor() {
        super();
        console.log('mqttttttt')
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
        this.mqttClient.on('connect', () => {
            console.log('Connected to MQTT broker');

            this.mqttClient.subscribe('m5stack/#', {qos: 2});
        });

        this.mqttClient.on('message', async (topic, message) => {
            try {
                console.log(`Received message on topic: ${topic}`);

                const payload = JSON.parse(message?.toString());
                console.log('Message payload:');

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
                        console.log(`Processing installation response for ${sys_id}:`, payload);
                        await callback(payload);//it will resolve callback and return data to paintingController
                        this.installationCallbacks.delete(sys_id);
                    }
                }

                switch (subTopic) {
                    case 'sensor':
                        console.log(`sensor :  response from ${sys_id}:`);
                        const paintingStatus = this.paintingStatusMap.get(sys_id)
                        paintingStatus.sensor = true;
                        await broadcastWS({sys_id,...paintingStatus})
                        try {
                            const painting = await Painting.findOne({sys_id})
                            painting.sensor = true
                            // Find or create stats record
                            let stats = await PaintingStats.findOne({sys_id: sys_id});
                            const currentTime = new Date();

                            // First time this painting has ever been viewed - need to create stats record
                            if (!stats) {
                                if (!painting) {
                                    throw new Error(`No painting found with sys_id: ${sys_id}`);
                                }
                                console.log(chalk.green(' First time this painting has ever been viewed'));

                                stats = new PaintingStats({
                                    sys_id: sys_id,
                                    painting_id: painting._id
                                });
                                await stats.save();

                                // First approach - detect wheelchair
                                painting.wheelchair = 1
                                paintingStatus.wheelchair = 1;
                                await broadcastWS({sys_id,...paintingStatus})
                                const is_detected = await this.camera.startAnalyze(sys_id)
                                await sleep(3000)
                                if (is_detected.detected) {
                                    await this.publish_height(sys_id);
                                    painting.wheelchair = 2
                                    paintingStatus.wheelchair = 2;
                                    await broadcastWS({sys_id,...paintingStatus})

                                }else {
                                    paintingStatus.wheelchair = 0;
                                    painting.wheelchair= 0
                                    await broadcastWS({sys_id,...paintingStatus})
                                }

                                // Start new viewing session
                                await stats.addViewingSession(currentTime, null);

                            } else { //the painting is already in painting_stats collection
                                // Check if there's an ongoing session
                                const lastSession =
                                    stats.viewingSessions[stats.viewingSessions.length - 1];
                                // If lastSession.endTime is null,
                                // it means the session is ongoing
                                // (the person is still viewing the painting).
                                // In this case, you might want to not start a new session but
                                // rather update the existing session if the person leaves.
                                //     If lastSession.endTime is not null (i.e., the session has ended),
                                //     a new session would be started since the person has either
                                //     left or completed their viewing.


                                if ( !lastSession || lastSession.endTime) {
                                    // New approach - no ongoing session or previous session has ended
                                    // paintingStatus.sensor = true
                                    // painting.sensor = true
                                    console.log(chalk.green('New approach - no ongoing session or previous session has ended:'));
                                    paintingStatus.wheelchair = 1
                                    painting.wheelchair = 1
                                    await broadcastWS({sys_id,...paintingStatus})
                                    const is_detected = await this.camera.startAnalyze(sys_id);
                                    await sleep(3000)
                                    if (is_detected.detected) {
                                        await this.publish_height(sys_id);
                                        paintingStatus.wheelchair = 2
                                        painting.wheelchair = 2
                                        await broadcastWS({sys_id,...paintingStatus})

                                    }else {
                                        paintingStatus.wheelchair = 0;
                                        painting.wheelchair= 0
                                        await broadcastWS({sys_id,...paintingStatus})
                                    }

                                    // Start new session
                                    await stats.addViewingSession(currentTime, null);


                                } else {
                                    // Person leaving - end current session
                                    console.log(chalk.green
                                    ('Person leaving - end current session\n'));

                                    await stats.addViewingSession(lastSession.startTime, currentTime);
                                    paintingStatus.wheelchair = 0
                                    paintingStatus.sensor = false
                                    paintingStatus.height_adjust = false
                                    painting.wheelchair = 0
                                    painting.sensor = false
                                    painting.height_adjust = false
                                    await broadcastWS({sys_id,...paintingStatus})
                                }
                            }

                            await stats.save();
                            await painting.save()
                            console.log(chalk.bgGreen(`Updated viewing statistics for painting ${sys_id}`));

                        } catch (error) {
                            console.error('Error handling sensor trigger:', error);
                        }
                        break;
                    case 'height':
                        console.log(chalk.bgMagenta(`Height adjustment response from ${sys_id}:`), payload);
                        const status = this.paintingStatusMap.get(sys_id);
                        const painting = await Painting.findOne({sys_id})
                        status.height_adjust = true
                        painting.height_adjust =true
                        await sleep(3000)
                        await broadcastWS({sys_id,...status})
                        await painting.save()
                        if (payload.status) {
                            console.log('received status height done from m5stack')
                            //we might send an rest api back to dashboard
                        }
                        break;
                    case 'install':

                        console.log('installlllll', payload)
                        switch (payload.device) {
                            case 'm5stack':
                                this.devices.push('m5stack');
                                break;
                            case 'esp32':
                                this.devices.push('esp32');
                                break
                        }
                        console.log(this.devices)
                        const callback = this.installationCallbacks.get(parseInt(sys_id));
                        if (callback && payload.success !== undefined
                            // && this.devices.length === 2
                        ) {
                            console.log(`Processing installation response for ${sys_id}:`, payload);
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
                            frameCallback(payload.frameData);
                            this.frameCallbacks.delete(sys_id);
                        }
                        break;
                    case 'error':
                        console.error(`Error from device ${sys_id}:`, payload);
                        break;

                    default:
                        console.log(`Unhandled subtopic: ${subTopic}`);
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

    async publish_installation(installationData) {
        const sys_id = parseInt(installationData.sys_id);
        installationData.width = parseInt(installationData.width)
        installationData.height = parseInt(installationData.height)
        installationData.weight = parseInt(installationData.weight)
        installationData.base_height = parseInt(installationData.base_height)
        console.log('installl data, ', installationData)
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
        console.log('tyoe pf ', typeof height, typeof JSON.stringify(height))
            // Publish with QoS 2
            console.log('Publishing installation request:', {sys_id});
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
            const height_adjust = base_height - (height / 2 + 130);

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
            console.log('height adjustment is minus.')
            return false;
        } catch (error) {
            process.stdout.write(`Error publishing height: ${error.message}\n`);
            throw error;
        }
    }

    publish_deletion(id) {
        return new Promise((resolve, reject) => {
            console.log('Publishing deletion request:', id);

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
                console.log('Installation response:', response);
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