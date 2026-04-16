const Battle = require('../models/Battle');
const User = require('../models/User');

exports.getOpenBattles = async (req, res) => {
  try {
    const battles = await Battle.find({ isPublic: true, status: 'pending_invite' })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();

    return res.json({ success: true, battles });
  } catch (err) {
    console.error('getOpenBattles error:', err);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

exports.getBattleById = async (req, res) => {
  try {
    const { id } = req.params;
    const battle = await Battle.findOne({ battleId: id }).lean();
    if (!battle) {
      return res.status(404).json({ error: 'Battle not found' });
    }
    return res.json({ success: true, battle });
  } catch (err) {
    console.error('getBattleById error:', err);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

exports.getBattleWall = async (req, res) => {
  try {
    const liveBattles = await Battle.countDocuments({ status: 'active' });
    
    // Total Fighters in active battles
    const activeBattleDocs = await Battle.find({ status: 'active' }, 'participants');
    let totalFighters = 0;
    activeBattleDocs.forEach(b => {
      totalFighters += b.participants.length;
    });

    const openToJoin = await Battle.countDocuments({ isPublic: true, acceptingJoins: true, status: 'pending_invite' });
    
    // Eliminated Today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const eliminatedBattles = await Battle.find({
      'participants.isEliminated': true,
      'participants.eliminatedOnDay': { $ne: null }
    });
    
    let eliminatedTodayCount = 0;
    // Basic active users filtering if needed, but for now we'll just count anyone eliminated today
    // Actual implementation depends on how eliminatedOnDay maps to dates. 
    // We'll approximate for now using the recent lost battles
    const lostToday = await Battle.countDocuments({ status: 'lost', updatedAt: { $gte: today } });
    eliminatedTodayCount += lostToday; // Simplified

    const recentWinners = await Battle.find({ status: 'won' })
      .sort({ updatedAt: -1 })
      .limit(5)
      .lean();

    return res.json({
      success: true,
      wallData: {
        liveBattles,
        recentWinners,
        totalActive: liveBattles, // Duplicate of liveBattles for convenience
        totalFighters,
        openToJoin,
        eliminatedToday: eliminatedTodayCount
      }
    });

  } catch (err) {
    console.error('getBattleWall error:', err);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

exports.createBattle = async (req, res) => {
  try {
    // Basic body params
    const { type, duration, isPublic, maxPlayers, opponentUsername, challengerUsername } = req.body;
    
    // Fallback ID generation
    const battleId = 'b-' + Math.random().toString(36).substring(2, 9);
    const publicUrl = process.env.NEXT_PUBLIC_SITE_URL ? `${process.env.NEXT_PUBLIC_SITE_URL}/battle/${battleId}` : `http://localhost:3001/battle/${battleId}`;

    const newBattle = new Battle({
      battleId,
      type,
      duration: parseInt(duration) || 14,
      isPublic: !!isPublic,
      maxPlayers: parseInt(maxPlayers) || 2,
      challenger: challengerUsername,
      opponent: opponentUsername || null,
      acceptingJoins: true,
      publicUrl,
      status: 'pending_invite',
      participants: [{
        username: challengerUsername,
        avatarInitial: challengerUsername ? challengerUsername.charAt(0).toUpperCase() : 'U',
        joinedAt: new Date()
      }]
    });

    await newBattle.save();

    if (newBattle.isPublic) {
      const battleHandler = require('../ws/battleHandler');
      battleHandler.broadcastAll({
        type: 'OPEN_BATTLE_CREATED',
        payload: { battle: newBattle }
      });
    }

    return res.json({ success: true, battle: newBattle });

  } catch (err) {
    console.error('createBattle error:', err);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

exports.acceptBattle = async (req, res) => {
  try {
    const { id } = req.params;
    const { username } = req.body;

    const battle = await Battle.findOne({ battleId: id });
    if (!battle) {
      return res.status(404).json({ error: 'Battle not found' });
    }

    if (!battle.acceptingJoins) {
      return res.status(400).json({ error: 'Battle is no longer accepting joins' });
    }

    if (battle.participants.length >= battle.maxPlayers) {
      return res.status(400).json({ error: 'Battle is full' });
    }

    // Check if already in participants
    const existing = battle.participants.find(p => p.username === username);
    if (!existing) {
      battle.participants.push({
        username,
        avatarInitial: username.charAt(0).toUpperCase(),
        joinedAt: new Date()
      });
    }

    // If it's a 1v1 and the second person joins, start it
    if (battle.participants.length >= battle.maxPlayers || (!battle.isPublic && battle.participants.length === 2)) {
      battle.status = 'active';
      battle.startDate = new Date();
      const end = new Date();
      end.setDate(end.getDate() + battle.duration);
      battle.endDate = end;
    }

    await battle.save();

    return res.json({ success: true, battle });
  } catch (err) {
    console.error('acceptBattle error:', err);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

exports.closeJoining = async (req, res) => {
  try {
    const { id } = req.params;
    const { username } = req.body; // To verify creator

    const battle = await Battle.findOne({ battleId: id });
    if (!battle) {
      return res.status(404).json({ error: 'Battle not found' });
    }

    // Usually, the creator is the first participant or `challenger`
    if (battle.challenger !== username) {
      return res.status(403).json({ error: 'Only the creator can close joining' });
    }

    battle.acceptingJoins = false;
    
    // If we close joining and we have at least 2 people, we might activate it
    if (battle.participants.length >= 2 && battle.status === 'pending_invite') {
      battle.status = 'active';
      battle.startDate = new Date();
      const end = new Date();
      end.setDate(end.getDate() + battle.duration);
      battle.endDate = end;
    }

    await battle.save();
    return res.json({ success: true, battle });
  } catch (err) {
    console.error('closeJoining error:', err);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};
