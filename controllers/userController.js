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
