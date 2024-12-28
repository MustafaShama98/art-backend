// index.js
const express = require('express');
const cors = require('cors');
const morgan = require('morgan'); // Optional: for logging
require('dotenv').config();
const session = require('express-session');

// Create Express app
const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(morgan('dev')); // Optional: for logging
app.use(session({
    secret: 'your-secret-key',
    resave: false,
    saveUninitialized: false,

}));
// Import routes
const paintingRoutes = require('./src/routes/PaintingRouter');
const connectDB = require("./src/database/config");
const {processFrame, processCamera, start_camera_analyze} = require("./src/camera/ML-Stream");
const MQTTService = require("./src/services/mqttService");
const {initializePaintingStats} = require("./src/models/PaintingStats");
const {seedUsers} = require("./src/models/User");
const {initializeWebSocket} = require("./src/services/websocketService");
const {createServer} = require("node:http");

// middleware/auth.js
const isAuthenticated = (req, res, next) => {
    if (req.session && req.session.userId) {
        return next();
    }
    res.status(401).json({ message: 'Unauthorized' });
};

const isAdmin = (req, res, next) => {
    if (req.session && req.session.userRole === 'admin') {
        return next();
    }
    res.status(403).json({ message: 'Forbidden' });
};

// Use routes - all painting routes will be prefixed with /api/paintings
app.use('/auth', require('./src/controllers/AuthController'));
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
let mqttService
// Start server
const PORT = process.env.PORT || 5000;

const server = app.listen(PORT, async () => {
    console.log(`Server is running on port ${PORT}`);
    await connectDB();
    await seedUsers();
    console.log("Connected to MongoDB");

});

const wss = initializeWebSocket(server);
console.log('WebSocket server initialized');
app.on('error', (error) => {
    console.error('Server error:', error);
});

module.exports = app;