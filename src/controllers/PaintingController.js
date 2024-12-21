const Painting = require('../models/PaintingSystem');

// controllers/PaintingController.js
class PaintingController {
    constructor(mqttService) {
        this.mqttService = mqttService; // DI
    }

    async getAllPaintings(req, res) {
        try {
            const paintings = await Painting.find();
    
            // Convert binary photo data to Base64
            const formattedPaintings = paintings.map((painting) => ({
                ...painting.toObject(),
                photo: painting.photo ? `data:image/jpeg;base64,${painting.photo.toString('base64')}` : null,
            }));
    
            res.json({
                success: true,
                count: formattedPaintings.length,
                data: formattedPaintings,
            });
        } catch (error) {
            console.error("Error fetching paintings:", error);
            res.status(500).json({
                success: false,
                error: error.message,
            });
        }
    }
    

    async getPainting(req, res) {
        try {
            const painting = await Painting.findBySysId(req.params.sys_id);

            if (!painting) {
                return res.status(404).json({
                    success: false,
                    error: 'Painting not found'
                });
            }

            res.json({
                success: true,
                data: painting
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    async createPainting(req, res) {
        try {
            const { photo, ...otherData } = req.body;
    
            // Convert Base64 to Buffer
            const bufferPhoto = photo ? Buffer.from(photo.split(",")[1], "base64") : null;
    
            const installationData = {
                sys_id: Date.now(),
                ...otherData    ,
                photo: bufferPhoto, // Save buffer in DB
            };
                
            const response = await this.mqttService.publish_installation(installationData);
    
            if (response.success) {
                const painting = new Painting({ ...installationData, status: 'Active' });
                await painting.save();
    
                res.status(201).json({
                    success: true,
                    data: painting,
                });
            } else {
                res.status(400).json({
                    success: false,
                    error: response.error || 'Installation failed',
                });
            }
        } catch (error) {
            console.error('createPainting: Error:', error);
            res.status(500).json({
                success: false,
                error: error.message,
            });
        }
    }
    

    async updatePainting(req, res) {
        console.log('body', req.body.data)
        try {
            const painting = await Painting.findOne({ sys_id: req.params.sys_id });

            if (!painting) {
                return res.status(404).json({
                    success: false,
                    error: 'Painting not found'
                });
            }
    
            // Destructure fields to be updated from the request body
            const {  name,painter_name,base_height,height,width,status,photo,weight } = req.body.data;
            // Update fields only if they are provided
                painting.height = height;
                painting.base_height = base_height;
                painting.status = status;
                painting.painter_name = painter_name;
                painting.name = name;
                painting.width = width;
                painting.weight=weight;
                if(photo)
                painting.photo = photo; 
            
            console.log('Saving painting with updates:', painting);
            await painting.save(); // Save updated document to the database
    
            res.json({
                success: true,
                data: painting
            });
        } catch (error) {
            console.error('Error during updatePainting:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }
    
    
    async deletePainting(req, res) {
        try {
            const {sys_id} = req.params
            const painting =
                await Painting.findOne({ sys_id : sys_id }, null, { lean: true });

            if (!painting) {
                return res.status(404).json({
                    success: false,
                    error: 'Painting not found'
                });
            }
           const mqttResponse =  await this.mqttService.publish_deletion(req.params.sys_id);
            console.log('deletePainting: mqttResponse, ',mqttResponse)
            if(mqttResponse.success) {
                await Painting.deleteOne({ sys_id });

                res.json({
                    success: true,
                    message: 'Painting removed successfully'
                });
            }
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }
}

module.exports = PaintingController;