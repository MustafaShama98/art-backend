// websocket.js
const { WebSocketServer, WebSocket } = require('ws');

let wss;
const clients = new Set();

function initializeWebSocket(server) {
    wss = new WebSocketServer({ server });

    wss.on('connection', (ws) => {
        console.log('New client connected');
        clients.add(ws);

        ws.on('close', () => {
            console.log('Client disconnected');
            clients.delete(ws);
        });

        // Optional: Add message handler
        ws.on('message', (message) => {
            console.log('Received:', message.toString());
            // Handle incoming messages if needed
        });
    });

    return wss;
}

async function broadcastWS(data) {
    if (!wss) {
        throw new Error('WebSocket server not initialized');
    }
    console.log('brodcast WS', data)
    clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            try {
                client.send(JSON.stringify(data));
            } catch (error) {
                console.error('Error sending message to client:', error);
            }
        }
    });
}

module.exports = {
    initializeWebSocket,
    broadcastWS
};