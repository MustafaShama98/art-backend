const axios = require('axios');
const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
// Function to capture a frame, encode it, and send it to the ML API
 const processFrame = async () => {
    try {
        // Fetch a single frame from the Python server
        const response = await axios({
            method: 'get',
            url: 'http://127.0.0.1:4000/video_feed',
            responseType: 'arraybuffer',
        });

        const timestamp = Date.now();
        const outputPath = path.join(__dirname, 'frames', `frame_${timestamp}.jpg`);
        fs.writeFileSync(outputPath, response.data);
        console.log(`Frame saved ${timestamp}`);

        // Convert the frame to Base64
        const base64Image = Buffer.from(response.data).toString('base64');

        // Wait for the detection API to respond before fetching the next frame
        //  await detectWheelchair(base64Image);
         await detect_activeLearning(base64Image)
        console.log('Ready for the next frame...');
        // Call processFrame recursively
        await processFrame();
    } catch (error) {
        console.error('Error fetching or processing frame:', error.message);
    }
};

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
        parse_response(response.data.predictions, 'normal')


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
    }else console.log(chalk.red('NO WHEELCHAIR!'));
    return
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
        parse_response(response.data.outputs[0].predictions, 'active')
    }
    catch (e) {
        console.log(e.message)
    }
}
// Create frames directory if it doesn't exist
if (!fs.existsSync(path.join(__dirname, 'frames'))) {
    fs.mkdirSync(path.join(__dirname, 'frames'));
}


module.exports = { processFrame };
