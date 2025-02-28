const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const chalk = require('chalk');
const {json} = require("express");

// Store active camera processing states



class CameraProcessor {
    constructor(mqttClient) {
        this.mqttClient = mqttClient;
        this.activeSystems = new Map();
        this.timeoutDuration = 16000;
        this.errorTimeoutDuration = 30000;
        this.frameInterval = 3000;
        this.frameCallbacks= new Map();
        // Store promises so we can resolve/reject later
        this.cameraPromisesMap = new Map();
    }
    async startAnalyze(sys_id) {
        if (this.activeSystems.get(sys_id) === 'active') {
            console.log(chalk.yellow(`System ${sys_id} is already running`));
            this.stopCamera(sys_id);
            return;
        }

        try {
            console.log('Start camera frame analyzing...');
            this.activeSystems.set(sys_id, 'active');

            const cameraPromise = new Promise((resolve, reject) => {
                this.cameraPromisesMap.set(sys_id, { resolve, reject });
            });

            this.processCamera(sys_id)
                .then((result) => {
                    console.log('result, ', result);
                    console.log(chalk.blue(`System ${sys_id} completed processing:`), {
                        detected: result.detected,
                        reason: result.reason,
                    });
                    this.cameraPromisesMap.get(sys_id).resolve(result);
                    this.stopCamera(sys_id);
                })
                .catch((error) => {
                    console.error(chalk.red(`Fatal error in system ${sys_id}:`), error);
                    this.stopCamera(sys_id);
                    this.cameraPromisesMap.get(sys_id).reject({
                        detected: false,
                        reason: 'fatal_error',
                    });
                });

            return cameraPromise;
        } catch (error) {
            console.error(chalk.red(`Fatal error in system ${sys_id}:`), error);
            this.activeSystems.delete(sys_id);
            return { detected: false, reason: 'fatal_error' };
        }
    }

    async waitForFrame(sys_id) {
        // Implement a Promise-based waiting mechanism
        return new Promise((resolve, reject) => {
            // Set up a timeout
            const timeout = setTimeout(() => {
                reject(new Error('Frame request timeout, waitForFrame'));
            }, 5000); // 5 second timeout

            // Store the resolve function to be called when the frame is received
            this.frameCallbacks.set(sys_id, (frameData) => {
                clearTimeout(timeout);
                resolve(frameData);
            });
        });
    }

    getSystemStatus(sys_id) {
        return this.activeSystems.get(sys_id) || 'not started';
    }


    async processCamera(sys_id, startProcessingTime = Date.now()) {
        if (this.isTimeoutReached(startProcessingTime)) {
            return this.handleTimeout(sys_id);
        }
        // Check if system was stopped
        if (!this.activeSystems.has(sys_id)) {
            console.log(chalk.yellow(`System ${sys_id} processing stopped mid-way.`));
            return { detected: false, reason: 'sensor got out of range' };
        }
        const frameStartTime = Date.now();

        try {


            // Capture the frame - this is already a base64 string
            const base64Image = await this.captureFrame(sys_id);

            // Save the original frame data if needed (you might want to decode it back to a buffer)
            await this.saveFrame(sys_id, Buffer.from(base64Image, 'base64'));


            const isWheelchairDetected = await detect_activeLearning(base64Image);
            //const isWheelchairDetected = await mock_detect(base64Image);

            console.log(chalk.cyan(`System ${sys_id} - Wheelchair detection status:`, isWheelchairDetected));

            if (isWheelchairDetected) {
                return this.handleWheelchairDetected(sys_id);
            }

            await this.waitForNextFrame(frameStartTime);
            return this.processCamera(sys_id, startProcessingTime);
        } catch (error) {
            return this.handleError(sys_id, startProcessingTime, error);
        }
    }



    async captureFrame(sys_id) {
        return new Promise((resolve, reject) => {
            // Create a callback that will be called when the frame is received
            const frameCallback = (frameData) => {
                resolve(frameData);
                console.log(chalk.cyan('captureFrame callback data,'))
            };

            // Store the callback in MQTTService's frameCallbacks Map
            this.mqttClient.registerFrameCallback(sys_id, frameCallback);

            // Publish a request to get the frame
            this.mqttClient.publishGetFrame(sys_id);
        });


    }

    async saveFrame(sys_id, frameData) {
        try {
            const folderPath = path.join(__dirname, 'frames', sys_id.toString());
            const filePath = path.join(folderPath, `frame_${Date.now()}.jpg`);
            await fs.mkdir(folderPath, { recursive: true });
            await fs.writeFile(filePath, frameData);
        } catch (err) {
            console.error(chalk.red(`Error saving frame for system ${sys_id}:`, err.message));
        }
    }


    isTimeoutReached(startTime) {
        return Date.now() - startTime >= this.timeoutDuration;
    }



    handleTimeout(sys_id) {
        this.activeSystems.delete(sys_id);
        console.log(chalk.bgYellow(`System ${sys_id} - Timeout reached`));
        return { detected: false, reason: 'timeout' };
    }

    handleWheelchairDetected(sys_id) {
        this.activeSystems.delete(sys_id);
        console.log(chalk.bgGreen(`System ${sys_id} - Wheelchair detected!`));
        return { detected: true, reason: 'wheelchair_detected' };
    }

    async handleError(sys_id, startTime, error) {
        console.error(chalk.red(`Error in system ${sys_id}:`, error.message));

        if (Date.now() - startTime >= this.errorTimeoutDuration) {
            this.activeSystems.delete(sys_id);
            return { detected: false, reason: 'timeout_during_error' };
        }

        if (this.activeSystems.get(sys_id) === 'active') {
            await new Promise(resolve => setTimeout(resolve, 1000));
            return this.processCamera(sys_id, startTime);
        }

        this.activeSystems.delete(sys_id);
        return { detected: false, reason: 'error' };
    }

    async waitForNextFrame(frameStartTime) {
        const frameProcessingTime = Date.now() - frameStartTime;
        const waitTime = Math.max(1000, this.frameInterval - frameProcessingTime);
        await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    getSystemStatus(sys_id) {
        return this.activeSystems.get(sys_id) || 'not started';
    }

    stopCamera(sys_id) {
        if (this.activeSystems.has(sys_id)) {
            this.activeSystems.delete(sys_id); // Remove from active systems
            console.log(chalk.yellow(`System ${sys_id} stopped `));
            return { detected: false, reason: 'stopped process midway' };
        }
        return false;
    }
}




// Function to send a Base64-encoded image to the ML API
const detectWheelchair = async (base64Image) => {
    try {
        // Add data URI prefix if required by the API
        const base64Data = `data:image/jpeg;base64,${base64Image}`;

        // Send the request to the ML API
        const response = await axios({
            method: "POST",
            url: "https://detect.roboflow.com/wheelchair-merged/1",
            params: {
                api_key: "2Oe0piuFz1O3lnbWZ10C",
            },
            data: base64Image, // Ensure proper encoding
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
            },
        });

        // console.log("Detection result:", response.data);
        if(response.data)
        return parse_response(response.data.predictions, 'normal')


    } catch (error) {
        console.error("Error detecting wheelchair:", error.message);
    }
};

function parse_response(response, type= 'active') {
    let prediction = null;
console.log(response)
    switch(type) {
        case 'active':
            prediction = response.predictions;
            console.log(chalk.bgYellow('confidience: ' ,prediction[0].confidence))
            break;
        case 'normal':
            prediction= response
            console.log(chalk.bgYellow('confidience: ' ,prediction[0].confidence))
            break;
    }

    if(
        prediction.length > 0
        && prediction[0].confidence > 0.60) {
        console.log(chalk.green('detected wheelchair'))
        return true
    }else {
        console.log(chalk.red('NO WHEELCHAIR!'));
        return false;
    }

}

async function detect_activeLearning(base64Image) {
    try {// Read and convert image to base64

        const response =
            await axios.post('https://detect.roboflow.com/infer/workflows/wheelchair-gohwp/active-learning-lca', {
                api_key: '2Oe0piuFz1O3lnbWZ10C',
                inputs: {
                    image: {
                        type: 'base64',
                        value: base64Image
                    }
                }
            }, {
                headers: {
                    'Content-Type': 'application/json'
                }
            });

        // return response.data;
       return parse_response(response.data.outputs[0].predictions, 'active')
    }
    catch (e) {
        console.log(e.message)
    }
}


async function mock_detect(base64image){
    new Promise(resolve => setTimeout(resolve, 1000));
    return true
}

async function MockcaptureFrame(camera_host) {
        // Simulate network delay
        await new Promise(resolve => setTimeout(resolve, 100));

        // Mock image data
        const mockData = Buffer.from('mock_image_data');

        return {
            base64Image: mockData.toString('base64'),
            frameData: mockData
        };
    }

async function deleteAllFrameFolders() {
    try {
        // Define the path to the "frames" directory
        const framesPath = path.join(__dirname, 'frames');

        // Check if the "frames" directory exists
        try {
            const folders = await fs.readdir(framesPath, { withFileTypes: true });

            // Filter and delete only directories
            for (const folder of folders) {
                if (folder.isDirectory()) {
                    const folderPath = path.join(framesPath, folder.name);
                    await fs.rm(folderPath, { recursive: true, force: true });
                    console.log(chalk.green(`Deleted folder: ${folderPath}`));
                }
            }
        } catch (err) {
            console.error(chalk.red(`Error reading "frames" directory:`, err.message));
        }
    } catch (err) {
        console.error(chalk.red('Error deleting frame folders:', err.message));
    }
}
module.exports = {
    deleteAllFrameFolders,
    CameraProcessor
};