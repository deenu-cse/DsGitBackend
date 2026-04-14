const { Resend } = require('resend');
const resend = new Resend(process.env.RESEND_API_KEY);

const brandColor = '#1D9E75';
const darkBg = '#FAFAF8';

const getBaseTemplate = (title, content, ctaUrl, ctaText) => `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; background-color: #f4f4f5; margin: 0; padding: 40px 20px; color: #1f2937; }
    .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); }
    .header { background: ${brandColor}; padding: 30px 20px; text-align: center; }
    .header h1 { color: #ffffff; margin: 0; font-size: 24px; display: flex; align-items: center; justify-content: center; gap: 10px; }
    .content { padding: 40px 30px; text-align: center; }
    .content h2 { color: #111827; margin-top: 0; font-size: 20px; }
    .content p { font-size: 16px; line-height: 1.6; color: #4b5563; margin-bottom: 24px; }
    .btn { display: inline-block; background-color: ${brandColor}; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600; font-size: 16px; transition: background 0.2s; }
    .footer { background: #f9fafb; padding: 20px; text-align: center; font-size: 12px; color: #6b7280; border-top: 1px solid #e5e7eb; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🔥 DSA Tracker</h1>
    </div>
    <div class="content">
      <h2>${title}</h2>
      <p>${content}</p>
      ${ctaUrl ? `<a href="${ctaUrl}" class="btn" style="color: white !important;">${ctaText}</a>` : ''}
    </div>
    <div class="footer">
      Keep pushing. Keep solving. 🔥<br>
      You received this because you connected your email to DSA Tracker.
    </div>
  </div>
</body>
</html>
`;

exports.sendChallengeReceived = async (email, challenger, type) => {
  if (!email) return;
  const content = `<b>@${challenger}</b> has challenged you to a <b>${type.toUpperCase()}</b> battle! Are you ready to defend your honor and prove your skills?`;
  const html = getBaseTemplate("A new challenger appears! ⚔️", content, "https://github.com", "Open Extension & Accept");
  try {
    await resend.emails.send({
      from: 'noreply@yatrimap.com',
      to: [email],
      subject: `⚔️ @${challenger} challenged you to a DSA Battle!`,
      html
    });
  } catch (e) {
    console.error("Email send error (Challenge Received):", e);
  }
};

exports.sendChallengeAccepted = async (email, opponent) => {
  if (!email) return;
  const content = `<b>@${opponent}</b> accepted your battle challenge! Ensure you don't miss any days, or you'll lose the battle!`;
  const html = getBaseTemplate("Battle Accepted! 🔥", content, "https://github.com", "View Status in Extension");
  try {
    await resend.emails.send({
      from: 'noreply@yatrimap.com',
      to: [email],
      subject: `🔥 @${opponent} accepted your challenge!`,
      html
    });
  } catch (e) {
    console.error("Email send error (Challenge Accepted):", e);
  }
};

exports.sendBattleWon = async (email, opponent) => {
  if (!email) return;
  const content = `<b>@${opponent}</b> broke their streak! You have emerged victorious in your battle. Incredible consistency!`;
  const html = getBaseTemplate("Victory! 🏆", content, "https://github.com", "Celebrate in Extension");
  try {
    await resend.emails.send({
      from: 'noreply@yatrimap.com',
      to: [email],
      subject: `🏆 You won the battle against @${opponent}!`,
      html
    });
  } catch (e) {
    console.error("Email send error (Battle Won):", e);
  }
};

exports.sendBattleLost = async (email, opponent) => {
  if (!email) return;
  const content = `You missed a day and broke your streak, meaning <b>@${opponent}</b> won the battle. Don't worry—every setback is a setup for a comeback. Start a new streak today!`;
  const html = getBaseTemplate("Streak Broken 💔", content, "https://github.com", "Start a New Streak");
  try {
    await resend.emails.send({
      from: 'noreply@yatrimap.com',
      to: [email],
      subject: `💔 You lost the battle against @${opponent}`,
      html
    });
  } catch (e) {
    console.error("Email send error (Battle Lost):", e);
  }
};
