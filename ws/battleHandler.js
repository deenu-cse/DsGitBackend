const Battle = require('../models/Battle');
const User = require('../models/User');
const emailService = require('../services/emailService');

// Map of githubId -> valid socket connection
const clients = new Map();

exports.addClient = (username, ws) => {
  if (username) {
    clients.set(username.toLowerCase(), ws);
    console.log(`User connected: ${username}`);
  }
};

exports.removeClient = (username) => {
  if (username) {
    clients.delete(username.toLowerCase());
    console.log(`User disconnected: ${username}`);
  }
};

exports.sendToUser = (username, messageObj) => {
  const ws = clients.get(username.toLowerCase());
  if (ws && ws.readyState === 1) { // WebSocket.OPEN
    ws.send(JSON.stringify(messageObj));
  }
};

exports.broadcastAll = (messageObj) => {
  const messageStr = JSON.stringify(messageObj);
  for (const ws of clients.values()) {
    if (ws.readyState === 1) {
      ws.send(messageStr);
    }
  }
};

exports.broadcastToParticipants = (participants, messageObj) => {
  participants.forEach(p => {
    exports.sendToUser(p.username, messageObj);
  });
};

exports.handleMessage = async (username, message, ws) => {
  try {
    const data = JSON.parse(message);
    const type = data.type;

    if (type === 'SEND_CHALLENGE') {
      const { opponent, battleType, duration, battleId } = data.payload;
      
      const battle = new Battle({
        battleId,
        challenger: username,
        opponent,
        type: battleType,
        duration: parseInt(duration),
        status: 'pending_invite'
      });
      await battle.save();

      // Notify Opponent via WS
      exports.sendToUser(opponent, {
        type: 'CHALLENGE_RECEIVED',
        payload: { battle }
      });

      // Send Email
      const oppUser = await User.findOne({ username: new RegExp('^' + opponent + '$', 'i') });
      if (oppUser && oppUser.email) {
        await emailService.sendChallengeReceived(oppUser.email, username, battleType);
      }
    } 
    else if (type === 'ACCEPT_CHALLENGE') {
      const { battleId } = data.payload;
      
      const battle = await Battle.findOne({ battleId });
      if (!battle) return;

      battle.status = 'active';
      battle.startDate = new Date();
      
      const end = new Date();
      end.setDate(end.getDate() + battle.duration);
      battle.endDate = end;

      await battle.save();

      // Notify Challenger via WS
      exports.sendToUser(battle.challenger, {
        type: 'CHALLENGE_ACCEPTED',
        payload: { battleId, opponent: username }
      });

      // Notify accepter (to ensure their UI updates)
      exports.sendToUser(username, {
        type: 'CHALLENGE_ACCEPTED_CONFIRM',
        payload: { battleId }
      });

      // Send Email
      const challengerUser = await User.findOne({ username: new RegExp('^' + battle.challenger + '$', 'i') });
      if (challengerUser && challengerUser.email) {
        await emailService.sendChallengeAccepted(challengerUser.email, username);
      }
    }
    // E.g., client detects missed day, sends BATTLE_LOST
    else if (type === 'BATTLE_LOST' || type === 'PLAYER_ELIMINATED') {
      const { battleId, dayBrokeOn } = data.payload;
      const battle = await Battle.findOne({ battleId, status: { $in: ['active', 'pending_invite'] } });
      if (!battle) return;

      // New Participant architecture logic
      const participant = battle.participants.find(p => p.username === username);
      if (participant) {
        participant.isEliminated = true;
        participant.eliminatedOnDay = dayBrokeOn || null;
        // CRITICAL FIX: Mark participants array as modified
        battle.markModified('participants');
      }
      
      // Determine if only one participant remains
      const remaining = battle.participants.filter(p => !p.isEliminated);
      if (remaining.length === 1 && battle.participants.length > 1) {
        battle.status = 'won';
        battle.winner = remaining[0].username;
        // Old fields fallback
        battle.loser = username;
      } else if (remaining.length === 0) {
        battle.status = 'draw';
      }

      await battle.save();

      // Broadcast elimination
      exports.broadcastToParticipants(battle.participants, {
        type: 'PLAYER_ELIMINATED',
        payload: { username, dayBrokeOn, battleId }
      });

      // If finished, broadcast win
      if (battle.status === 'won') {
        exports.broadcastToParticipants(battle.participants, {
          type: 'BATTLE_WON',
          payload: { winner: battle.winner, loser: username, battleStats: battle }
        });

        // Email both
        const winnerUser = await User.findOne({ username: new RegExp('^' + battle.winner + '$', 'i') });
        const loserUser = await User.findOne({ username: new RegExp('^' + username + '$', 'i') });

        if (winnerUser && winnerUser.email) {
          await emailService.sendBattleWon(winnerUser.email, username);
        }
        if (loserUser && loserUser.email) {
          await emailService.sendBattleLost(loserUser.email, battle.winner);
        }
      }
    }
    else if (type === 'BATTLE_ACTIVITY') {
      const { battleId, questionName, platform, difficulty, points } = data.payload;
      const battle = await Battle.findOne({ battleId, status: { $in: ['active', 'pending_invite'] } });
      if (!battle) return;

      // Update participant stats
      const participant = battle.participants.find(p => p.username === username);
      if (participant && !participant.isEliminated) {
        participant.score += points || 0;
        if (difficulty === 'Hard') participant.hardSolved++;
        if (difficulty === 'Medium') participant.mediumSolved++;
        if (difficulty === 'Easy') participant.easySolved++;
        if (platform === 'LeetCode') participant.platforms.leetcode++;
        if (platform === 'GeeksForGeeks') participant.platforms.gfg++;
        if (platform === 'CodingNinjas') participant.platforms.codingninjas++;
        
        // CRITICAL FIX: Mark participants array as modified so Mongoose detects nested changes
        battle.markModified('participants');
      }

      const activity = {
        username,
        questionName,
        platform,
        difficulty,
        points: points || 0,
        timestamp: new Date()
      };
      
      battle.activityFeed.push(activity);
      // Mark activityFeed as modified to ensure it's persisted
      battle.markModified('activityFeed');
      await battle.save();

      // Room broadcast
      exports.broadcastToParticipants(battle.participants, {
        type: 'BATTLE_ACTIVITY',
        payload: activity
      });
    }
    else if (type === 'PING') {
      // Just keepalive
      ws.send(JSON.stringify({ type: 'PONG' }));
    }

  } catch (err) {
    console.error('WS MSG ERROR:', err);
  }
};
