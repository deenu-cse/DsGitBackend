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

const sendToUser = (username, messageObj) => {
  const ws = clients.get(username.toLowerCase());
  if (ws && ws.readyState === 1) { // WebSocket.OPEN
    ws.send(JSON.stringify(messageObj));
  }
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
      sendToUser(opponent, {
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
      sendToUser(battle.challenger, {
        type: 'CHALLENGE_ACCEPTED',
        payload: { battleId, opponent: username }
      });

      // Notify accepter (to ensure their UI updates)
      sendToUser(username, {
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
    else if (type === 'BATTLE_LOST') {
      const { battleId } = data.payload;
      const battle = await Battle.findOne({ battleId, status: 'active' });
      if (!battle) return;

      battle.status = 'lost';
      battle.loser = username;
      battle.winner = (battle.challenger === username) ? battle.opponent : battle.challenger;
      await battle.save();

      // Notify winner via WS (They Won)
      sendToUser(battle.winner, {
        type: 'BATTLE_WON',
        payload: { battleId, loser: username }
      });

      // Email both
      const winnerUser = await User.findOne({ username: new RegExp('^' + battle.winner + '$', 'i') });
      const loserUser = await User.findOne({ username: new RegExp('^' + battle.loser + '$', 'i') });

      if (winnerUser && winnerUser.email) {
        await emailService.sendBattleWon(winnerUser.email, username);
      }
      if (loserUser && loserUser.email) {
        await emailService.sendBattleLost(loserUser.email, battle.winner);
      }
    }
    else if (type === 'PING') {
      // Just keepalive
      ws.send(JSON.stringify({ type: 'PONG' }));
    }

  } catch (err) {
    console.error('WS MSG ERROR:', err);
  }
};
