const Painting = require('../models/PaintingSystem');

// controllers/PaintingController.js
class PaintingController {
    constructor(mqttService) {
        this.mqttService = mqttService; // DI
    }

    async getAllPaintings(req, res) {
        try {
            const paintings = await Painting.find();

            res.json({
                success: true,
                count: paintings.length,
                data: paintings
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
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
            const installationData = {
                sys_id: Date.now(),
                ...req.body
            };

            console.log('createPainting: Starting installation process for:', installationData);

            const response = await this.mqttService.publish_installation(installationData);
            console.log('createPainting: Received installation response:', response);

            if (response.success) {
                const painting = new Painting({...installationData, status:'active'});
                await painting.save();
                console.log('createPainting: Saved to database');
                res.status(201).json({
                    success: true,
                    data: painting
                });
            } else {
                res.status(400).json({
                    success: false,
                    error: response.error || 'createPainting: Installation failed'
                });
            }
        } catch (error) {
            console.error('createPainting:  error:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    async updatePainting(req, res) {
        try {
            const painting = await Painting.findBySysId(req.params.sys_id);

            if (!painting) {
                return res.status(404).json({
                    success: false,
                    error: 'Painting not found'
                });
            }

            const { height, base_height, status } = req.body;

            if (height !== undefined) {
                await painting.updateHeight(height);
            }

            if (base_height !== undefined) {
                painting.base_height = base_height;
            }

            if (status !== undefined) {
                painting.status = status;
            }

            await painting.save();

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

    async deletePainting(req, res) {
        try {
            const painting = await Painting.findBySysId(req.params.sys_id);

            if (!painting) {
                return res.status(404).json({
                    success: false,
                    error: 'Painting not found'
                });
            }

            await painting.remove();

            res.json({
                success: true,
                message: 'Painting removed successfully'
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }
}

module.exports = PaintingController;