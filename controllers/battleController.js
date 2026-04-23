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
    const publicUrl = process.env.NEXT_PUBLIC_SITE_URL ? `${process.env.NEXT_PUBLIC_SITE_URL}/battle/${battleId}` : `http://localhost:3000/battle/${battleId}`;

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

    const battleHandler = require('../ws/battleHandler');
    battleHandler.sendToUser(challengerUsername, {
      type: 'BATTLE_SYNC',
      payload: {
        battle: {
          id: newBattle.battleId,
          type: newBattle.type,
          duration: newBattle.duration,
          opponent: newBattle.opponent,
          status: newBattle.status
        }
      }
    });

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
      // CRITICAL FIX: Mark participants array as modified so Mongoose detects the push
      battle.markModified('participants');
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

    // CRITICAL: Notify the joining user's extension to sync state
    const battleHandler = require('../ws/battleHandler');
    battleHandler.sendToUser(username, {
      type: 'BATTLE_SYNC',
      payload: {
        battle: {
          id: battle.battleId,
          type: battle.type,
          duration: battle.duration,
          opponent: battle.challenger === username ? battle.opponent : battle.challenger,
          status: battle.status,
          endDate: battle.endDate || null
        }
      }
    });

    // Notify other participants if the status changed to active
    if (battle.status === 'active') {
      battle.participants.forEach(p => {
        if (p.username !== username) {
          battleHandler.sendToUser(p.username, {
            type: 'BATTLE_SYNC',
            payload: {
              battle: {
                id: battle.battleId,
                status: 'active',
                endDate: battle.endDate
              }
            }
          });
        }
      });
    }

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

    // CRITICAL: Notify all participants to sync state
    const battleHandler = require('../ws/battleHandler');
    battle.participants.forEach(p => {
      battleHandler.sendToUser(p.username, {
        type: 'BATTLE_SYNC',
        payload: {
          battle: {
            id: battle.battleId,
            status: battle.status,
            acceptingJoins: false,
            endDate: battle.endDate
          }
        }
      });
    });

    return res.json({ success: true, battle });
  } catch (err) {
    console.error('closeJoining error:', err);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

exports.getUserBattles = async (req, res) => {
  try {
    const { username } = req.params;

    // Find all battles where this user is involved
    let battlesDocs = await Battle.find({
      $or: [
        { 'participants.username': username },
        { challenger: username },
        { opponent: username }
      ],
      status: { $in: ['active', 'pending_invite', 'won', 'lost'] }
    }).sort({ createdAt: -1 });

    // Auto-repair missing participants and recalculate scores if needed
    for (let b of battlesDocs) {
      let modified = false;
      
      const ensureParticipant = (uName) => {
        if (!uName) return;
        if (!b.participants.find(p => p.username === uName)) {
          b.participants.push({ 
            username: uName, 
            avatarInitial: uName.charAt(0).toUpperCase(), 
            joinedAt: b.createdAt || new Date()
          });
          modified = true;
        }
      };
      
      ensureParticipant(b.challenger);
      if (b.status !== 'pending_invite') ensureParticipant(b.opponent);
      
      if (modified) {
        // Recalculate scores from activity feed
        b.participants.forEach(p => {
          p.score = 0; p.hardSolved = 0; p.mediumSolved = 0; p.easySolved = 0;
          if (!p.platforms) p.platforms = { leetcode: 0, gfg: 0, codingninjas: 0 };
        });
        
        b.activityFeed.forEach(act => {
          const p = b.participants.find(p => p.username === act.username);
          if (p) {
            p.score += act.points || 0;
            if (act.difficulty === 'Hard') p.hardSolved++;
            if (act.difficulty === 'Medium') p.mediumSolved++;
            if (act.difficulty === 'Easy') p.easySolved++;
            if (act.platform === 'LeetCode') p.platforms.leetcode++;
            if (act.platform === 'GeeksForGeeks') p.platforms.gfg++;
            if (act.platform === 'CodingNinjas') p.platforms.codingninjas++;
          }
        });
        
        b.markModified('participants');
        await b.save();
      }
    }

    const battles = battlesDocs.map(b => b.toObject());

    // Find current user's participant data in each battle
    const userParticipants = new Map();
    const battleDetails = battles.map(b => {
      const userParticipant = b.participants.find(p => p.username === username);
      userParticipants.set(b.battleId, userParticipant);
      
      // Find opponent(s) - for 1v1 it's the other participant, for multi-player get all others
      const opponents = b.participants.filter(p => p.username !== username);
      
      return {
        id: b.battleId,
        battleId: b.battleId,
        type: b.type,
        duration: b.duration,
        opponent: opponents.length === 1 ? opponents[0].username : null,
        opponents: opponents,
        status: b.status,
        endDate: b.endDate,
        startDate: b.startDate,
        creator: b.challenger,
        maxPlayers: b.maxPlayers,
        isPublic: b.isPublic,
        acceptingJoins: b.acceptingJoins,
        publicUrl: b.publicUrl,
        participants: b.participants,
        // User's score data
        score: userParticipant?.score || 0,
        hardSolved: userParticipant?.hardSolved || 0,
        mediumSolved: userParticipant?.mediumSolved || 0,
        easySolved: userParticipant?.easySolved || 0,
        platforms: userParticipant?.platforms || { leetcode: 0, gfg: 0, codingninjas: 0 },
        currentStreak: userParticipant?.currentStreak || 0,
        isEliminated: userParticipant?.isEliminated || false,
        // Leaderboard data
        leaderboard: b.participants.map(p => ({
          username: p.username,
          score: p.score || 0,
          hardSolved: p.hardSolved || 0,
          mediumSolved: p.mediumSolved || 0,
          easySolved: p.easySolved || 0,
          platforms: p.platforms || { leetcode: 0, gfg: 0, codingninjas: 0 },
          isEliminated: p.isEliminated || false
        })).sort((a, b) => b.score - a.score)
      };
    });

    return res.json({
      success: true,
      battles: battleDetails
    });
  } catch (err) {
    console.error('getUserBattles error:', err);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};
