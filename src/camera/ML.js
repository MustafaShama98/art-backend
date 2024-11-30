const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Function to capture a frame, encode it, and send it to the ML API
const processFrame = async () => {
    try {
        // Fetch a single frame from the Python server
        const response = await axios({
            method: 'get',
            url: 'http://127.0.0.1:4000/single_frame',
            responseType: 'arraybuffer',
        });

        const timestamp = Date.now();
        const outputPath = path.join(__dirname, 'frames', `frame_${timestamp}.jpg`);
        fs.writeFileSync(outputPath, response.data);
        console.log(`Frame saved ${timestamp}`);

        // Convert the frame to Base64
        const base64Image = Buffer.from(response.data).toString('base64');

        // Wait for the detection API to respond before fetching the next frame
        await detectWheelchair(base64Image);

        console.log('Ready for the next frame...');
        // Call processFrame recursively
        // processFrame();
    } catch (error) {
        console.error('Error fetching or processing frame:', error.message);
    }
};

