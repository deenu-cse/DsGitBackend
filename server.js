require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const WebSocket = require('ws');

const userController = require('./controllers/userController');
const adminController = require('./controllers/adminController');
const battleHandler = require('./ws/battleHandler');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.json());

// Apply CORS with restricted origin
app.use(cors({
  origin: (origin, callback) => {
    // allow chrome-extension:// origins
    if (!origin || origin.startsWith('chrome-extension://')) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  }
}));

// Connect to MongoDB
if (process.env.MONGO_URI) {
  mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log('MongoDB Connected'))
  .catch(err => console.log('MongoDB Connection Error:', err));
} else {
  console.log("No MONGO_URI provided in .env");
}

// Routes
app.get('/health', (req, res) => {
  res.json({ status: 'ok', time: new Date() });
});

app.post('/api/sync-user', userController.syncUser);
app.post('/api/update-email', userController.updateEmail);

app.get('/admin/stats', adminController.getAdminStats);

// WebSocket setup
wss.on('connection', (ws, req) => {
  // Extract username from query param e.g., ?username=octocat
  const urlParams = new URLSearchParams(req.url.split('?')[1]);
  const username = urlParams.get('username');

  if (username) {
    battleHandler.addClient(username, ws);
  }

  ws.on('message', async (message) => {
    if (username) {
      await battleHandler.handleMessage(username, message, ws);
    }
  });

  ws.on('close', () => {
    if (username) {
      battleHandler.removeClient(username);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
