const User = require('../models/User');

exports.syncUser = async (req, res) => {
  try {
    const { githubId, username, avatar_url } = req.body;
    if (!githubId || !username) {
      return res.status(400).json({ error: 'Missing githubId or username' });
    }

    let user = await User.findOne({ githubId });
    if (!user) {
      user = new User({ githubId, username, avatar_url });
    } else {
      user.username = username;
      if (avatar_url) user.avatar_url = avatar_url;
      user.lastActive = Date.now();
    }
    
    await user.save();
    return res.json({ success: true, user });
  } catch (error) {
    console.error('syncUser Error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

exports.updateEmail = async (req, res) => {
  try {
    const { username, email } = req.body;
    if (!username || !email) {
      return res.status(400).json({ error: 'Missing username or email' });
    }

    const user = await User.findOneAndUpdate({ username }, { email }, { new: true });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.json({ success: true, user });
  } catch (error) {
    console.error('updateEmail Error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

exports.getUserPublicStats = async (req, res) => {
  try {
    const { username } = req.params;
    
    // Find the user to get basic info
    const user = await User.findOne({ username: new RegExp('^' + username + '$', 'i') }).lean();
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // In a real scenario, you'd fetch the actual streak/platform data.
    // Since this may come from github polling, we will mock it or return 0s if we don't store it yet.
    // The previous extension fetched this via gh-pages. 
    // For the UI, we'll return mock stats as placeholders for the public stats endpoints.
    
    return res.json({
      success: true,
      stats: {
        username: user.username,
        avatar_url: user.avatar_url,
        streak: 12,
        longestStreak: 25,
        totalSolved: 154,
        hardCount: 15,
        mediumCount: 89,
        easyCount: 50,
        platforms: {
          leetcode: 100,
          gfg: 40,
          codingninjas: 14
        },
        badges: ['30-Day Warrior', 'Early Bird'],
        dayNumber: 45
      }
    });

  } catch (error) {
    console.error('getUserPublicStats Error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};
