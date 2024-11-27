const mqtt = require('mqtt');
const Painting = require('../models/PaintingSystem');
const IMQTTService = require("../interfaces/IMQTTService");

class MQTTService extends IMQTTService {
    constructor() {
        super();
        this.mqttClient = mqtt.connect('mqtt://j81f31b4.ala.eu-central-1.emqxsl.com', {
            username: "art",
            password: "art123",
            clientId: "art_backend",
            port: 8883,
            protocol: 'mqtts',
        });
        this.installationCallbacks = new Map();
        this.deletionCallbacks = new Map();
         this.devices = []

        this.mqttClient.on('connect', () => {
            console.log('Connected to MQTT broker');
            this.mqttClient.subscribe('m5stack/#', { qos: 2 });
            this.promptHeight();
        });

        this.mqttClient.on('message', async (topic, message) => {
            try {
                console.log(`Received message on topic: ${topic}`);
                const payload = JSON.parse(message.toString());
                console.log('Message payload:', payload);

                const [mainTopic, sys_id, subTopic] = topic.split('/');
                console.log('maintopic', mainTopic)
                if (mainTopic === 'install') {
                    const callback = this.installationCallbacks.get(parseInt(sys_id));
                    if (callback && payload.success !== undefined) {
                        console.log(`Processing installation response for ${sys_id}:`, payload);
                        await callback(payload);//it will resolve callback and return data to paintingController
                        this.installationCallbacks.delete(sys_id);
                    }
                }

                switch (subTopic) {

                    case 'sensor':
                        console.log(`sensor : Height adjustment response from ${sys_id}:`, payload);
                        this.publish_height(sys_id).then(() => {
                            console.log('sent height publish to m5stack');
                        });
                        break;
                    case 'height':
                        console.log(`Height adjustment response from ${sys_id}:`, payload);
                        if(payload.status){
                            console.log('received status height done from m5stack')
                            //we might send an rest api back to dashboard
                        }
                        break;
                    case 'install':

                        console.log('installlllll')
                        switch(payload.device) {
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
                            && this.devices.length === 2 ) {
                            console.log(`Processing installation response for ${sys_id}:`, payload);
                            callback(payload);
                            this.installationCallbacks.delete(sys_id);
                            this.devices = [];
                        }
                        return;
                    case 'delete':

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

    async publish_installation(installationData) {
        const sys_id = parseInt(installationData.sys_id);

        // Clear any existing callbacks for this sys_id
        this.installationCallbacks.delete(sys_id);

        try {
            // Wait for the installation mqtt response on topic install
            const response = await this.waitForInstallationResponse(sys_id);
            return response;
        } finally {
            // Cleanup: remove the callback regardless of success/failure
            this.installationCallbacks.delete(sys_id);
        }
    }

    async waitForInstallationResponse(sys_id) {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error(`Installation timeout for sys_id: ${sys_id}`));
            }, 9000);

            this.installationCallbacks.set(sys_id, (response) => {
                clearTimeout(timeout);
                resolve(response);
            });

            // Publish with QoS 2
            console.log('Publishing installation request:', { sys_id });
            this.mqttClient.publish('install', JSON.stringify({ sys_id }), { qos: 2 }, (err) => {
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
            if(!found_painting)
                return null;

            const {base_height, height} = found_painting;
            const height_adjust = base_height - (height/2 + 122);

            if(height_adjust > 0) {
                // Publish with QoS 2
                return new Promise((resolve, reject) => {
                    this.mqttClient.publish(
                        `m5stack/${sys_id}/height`,
                        JSON.stringify(height_adjust),
                        { qos: 2 },
                        (err) => {
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
                    { qos: 2 },
                    (err) => {
                        clearTimeout(timeout); // Clear timeout regardless of success/failure

                        if (err) {
                            reject(new Error(`Deletion publication failed: ${err.message}`));
                        } else {
                            resolve({ success: true });
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
                const response = await this.publish_installation({ sys_id });
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