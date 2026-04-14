const User = require('../models/User');
const Battle = require('../models/Battle');

exports.getAdminStats = async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const totalBattles = await Battle.countDocuments();
    const completedBattles = await Battle.countDocuments({ status: { $in: ['won', 'lost', 'draw'] } });
    const activeBattles = await Battle.countDocuments({ status: 'active' });

    // Calculate users in last 24h
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const newUsersToday = await User.countDocuments({ signupDate: { $gte: today } });

    // Calculate users in last 7 days
    const lastWeek = new Date();
    lastWeek.setDate(lastWeek.getDate() - 7);
    const newUsersThisWeek = await User.countDocuments({ signupDate: { $gte: lastWeek } });

    return res.json({
      success: true,
      stats: {
        totalUsersRegistered: totalUsers,
        totalBattlesCreated: totalBattles,
        totalBattlesCompleted: completedBattles,
        activeBattlesCount: activeBattles,
        newUsersToday,
        newUsersThisWeek
      }
    });

  } catch (error) {
    console.error('getAdminStats Error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};
