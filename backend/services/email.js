const imaps = require('imap-simple');
const simpleParser = require('mailparser').simpleParser;

async function fetchEmailsFromProvider(config, providerName) {
  if (!config.user || !config.password || config.user.includes('your_') || config.password.includes('your_')) {
    console.log(`${providerName} email credentials not configured.`);
    return [];
  }

  const imapConfig = {
    imap: {
      user: config.user,
      password: config.password,
      host: config.host,
      port: 993,
      tls: true,
      authTimeout: 5000,
      tlsOptions: { rejectUnauthorized: false }
    }
  };

  let connection;
  try {
    connection = await imaps.connect(imapConfig);
    await connection.openBox('INBOX');

    // Search for unread emails from the last 3 days
    const delay = 3 * 24 * 60 * 60 * 1000;
    const sinceDate = new Date(Date.now() - delay).toISOString();
    const searchCriteria = [
      'UNSEEN',
      ['SINCE', sinceDate]
    ];
    const fetchOptions = {
      bodies: ['HEADER', 'TEXT', ''],
      struct: true
    };

    const messages = await connection.search(searchCriteria, fetchOptions);
    const parsedEmails = [];

    for (const item of messages) {
      const all = item.parts.find(part => part.which === '');
      if (!all) continue;
      
      const parsed = await simpleParser(all.body);
      const subject = parsed.subject || 'No Subject';
      const sender = parsed.from ? parsed.from.text : 'Unknown';
      const date = parsed.date || new Date();
      const snippet = parsed.text ? parsed.text.substring(0, 150).replace(/\s+/g, ' ') + '...' : '';

      // Simple heuristic for branding and sponsorship keywords
      const isUrgent = /offer|sponsor|brand|collab|proposal|contract|invoice|partnership|pricing|urgent/i.test(subject + snippet);

      parsedEmails.push({
        id: item.attributes.uid.toString(),
        provider: providerName,
        sender: sender,
        subject: subject,
        snippet: snippet,
        date: date,
        action: isUrgent ? 'reply' : 'review'
      });
    }

    return parsedEmails;
  } catch (error) {
    console.error(`Error fetching emails from ${providerName}:`, error.message);
    return [];
  } finally {
    if (connection) {
      connection.end();
    }
  }
}

async function fetchAllEmails() {
  const gmailConfig = {
    user: process.env.GMAIL_USER,
    password: process.env.GMAIL_APP_PASSWORD,
    host: 'imap.gmail.com'
  };

  const outlookConfig = {
    user: process.env.OUTLOOK_USER,
    password: process.env.OUTLOOK_APP_PASSWORD,
    host: 'outlook.office365.com'
  };

  // If neither is configured, return null to fallback to mock
  const gmailValid = gmailConfig.user && !gmailConfig.user.includes('your_');
  const outlookValid = outlookConfig.user && !outlookConfig.user.includes('your_');

  if (!gmailValid && !outlookValid) {
    return null;
  }

  const [gmails, outlooks] = await Promise.all([
    fetchEmailsFromProvider(gmailConfig, 'Gmail'),
    fetchEmailsFromProvider(outlookConfig, 'Outlook')
  ]);

  const allEmails = [...gmails, ...outlooks];

  // Sort by date (most recent first)
  allEmails.sort((a, b) => b.date - a.date);

  const urgent = allEmails.filter(e => e.action === 'reply' || e.action === 'negotiate').slice(0, 5);
  const others = allEmails.filter(e => e.action !== 'reply' && e.action !== 'negotiate');

  const countBadge = `${urgent.length} need replies`;

  // Build outreach summaries
  let summary = '';
  if (others.length > 0) {
    const unreadCount = others.length;
    const senders = Array.from(new Set(others.slice(0, 5).map(e => e.sender.split('<')[0].trim()))).join(', ');
    summary = `${unreadCount} unread cold outreach / low urgency emails from ${senders}. Reply when you have time.`;
  } else {
    summary = 'No other unread emails today.';
  }

  return {
    countBadge,
    urgent,
    summary
  };
}

module.exports = { fetchAllEmails };
