// index.js
const express = require('express');
const cors = require('cors');
const morgan = require('morgan'); // Optional: for logging
require('dotenv').config();

// Create Express app
const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(morgan('dev')); // Optional: for logging

// Import routes
const paintingRoutes = require('./src/routes/PaintingRouter');
const connectDB = require("./src/database/config");
const {processFrame} = require("./src/camera/ML-Stream");

// Use routes - all painting routes will be prefixed with /api/paintings
app.use('/paintings', paintingRoutes);

// 404 handler for undefined routes
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: 'Route not found'
    });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({
        success: false,
        error: 'Something went wrong!'
    });
});

// Start server
const PORT = process.env.PORT || 3000;

app.listen(PORT, async () => {
    console.log(`Server is running on port ${PORT}`);
    await connectDB();
    console.log("Connected to MongoDB");

// Start the frame capture and processing loop
    console.log('Started capturing and processing frames...');
    // await processFrame();

});

// For testing purposes
module.exports = app;