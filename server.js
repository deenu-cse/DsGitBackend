require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const WebSocket = require('ws');

const userController = require('./controllers/userController');
const adminController = require('./controllers/adminController');
const battleController = require('./controllers/battleController');
const battleHandler = require('./ws/battleHandler');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.json());

// Apply CORS with restricted origin
app.use(cors({
  origin: (origin, callback) => {
    // allow chrome-extension:// origins
    if (!origin || origin.startsWith('chrome-extension://') || origin.startsWith('http://localhost:3001') || origin.startsWith('http://localhost:3000')) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  }
}));

// Connect to MongoDB
if (process.env.MONGO_URI) {
  mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('MongoDB Connected'))
    .catch(err => console.log('MongoDB Connection Error:', err));
} else {
  console.log("No MONGO_URI provided in .env");
}

// Routes
app.get('/health', (req, res) => {
  res.json({ status: 'ok', time: new Date() });
});

// ─── Web OAuth: exchange GitHub code for profile ───────────────────────────
app.post('/auth/github-web', async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ error: 'Missing code' });

    const clientId = process.env.GITHUB_WEB_CLIENT_ID;
    const clientSecret = process.env.GITHUB_WEB_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return res.status(500).json({ error: 'Server missing GitHub OAuth config' });
    }

    // Exchange code → token directly with GitHub
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) {
      return res.status(401).json({ error: 'Token exchange failed: ' + (tokenData.error_description || tokenData.error || 'unknown') });
    }

    // Fetch GitHub profile using the token
    const profileRes = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        'User-Agent': 'DSA-Tracker-Web',
      },
    });
    const profile = await profileRes.json();
    if (!profile.login) {
      return res.status(401).json({ error: 'Failed to fetch GitHub profile' });
    }

    // Sync user to DB (same as extension does)
    const User = require('./models/User');
    let user = await User.findOne({ githubId: String(profile.id) });
    if (!user) {
      user = new User({ githubId: String(profile.id), username: profile.login, avatar_url: profile.avatar_url });
    } else {
      user.username = profile.login;
      user.avatar_url = profile.avatar_url;
      user.lastActive = Date.now();
    }
    await user.save();

    return res.json({
      success: true,
      user: {
        username: profile.login,
        avatar_url: profile.avatar_url,
        githubId: String(profile.id),
      }
    });
  } catch (err) {
    console.error('github-web auth error:', err);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.post('/api/sync-user', userController.syncUser);
app.post('/api/update-email', userController.updateEmail);
app.get('/users/:username/public-stats', userController.getUserPublicStats);

app.get('/admin/stats', adminController.getAdminStats);

app.get('/battles/wall', battleController.getBattleWall);
app.get('/battles/open', battleController.getOpenBattles);
app.get('/battles/:id', battleController.getBattleById);
app.post('/battles/create', battleController.createBattle);
app.post('/battles/:id/accept', battleController.acceptBattle);
app.post('/battles/:id/close-joining', battleController.closeJoining);

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
