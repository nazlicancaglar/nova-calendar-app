const cron = require('node-cron');
const fs = require('fs');
const path = require('path');

const { fetchNotionTasks } = require('./notion');
const { fetchAllEmails } = require('./email');
const { fetchAllCalendarEvents } = require('./calendar');
const { syncNewsletterRepo } = require('./newsletter');
const { runInstagramAnalysis } = require('./instagram');
const { getVancouverWeather } = require('./weather');

const CACHE_PATH = path.join(__dirname, '..', 'dashboard-cache.json');
const GOALS_PATH = path.join(__dirname, '..', '..', 'goals.json');

// Get current month name (e.g., "June 2026")
function getCurrentMonthString() {
  const date = new Date();
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

// Fetch goals from local goals.json
function getGoalsForCurrentMonth() {
  try {
    if (fs.existsSync(GOALS_PATH)) {
      const data = JSON.parse(fs.readFileSync(GOALS_PATH, 'utf8'));
      const currentMonth = getCurrentMonthString();
      const monthGoal = data.goals.find(g => g.month.toLowerCase().includes(currentMonth.toLowerCase()) || currentMonth.toLowerCase().includes(g.month.toLowerCase()));
      if (monthGoal) {
        return monthGoal.items;
      }
    }
  } catch (e) {
    console.error('Error reading goals.json:', e.message);
  }
  return ["Launch new resource", "Transition ad account", "Brand deal collabs"]; // fallback
}

// Core sync workflow
async function syncAllData() {
  console.log('Initiating dashboard synchronization...');
  
  // 1. Sync Newsletter Git Repository (clones/pulls & parses MDs)
  await syncNewsletterRepo();
  
  // Read parsed news summary if available to feed into Instagram analysis
  let techNewsSummary = '';
  const newsPath = path.join(__dirname, 'newsletter-data.json');
  if (fs.existsSync(newsPath)) {
    try {
      const news = JSON.parse(fs.readFileSync(newsPath, 'utf8'));
      techNewsSummary = news.slice(0, 3).map(n => `${n.title}: ${n.summary}`).join(' | ');
    } catch (e) {
      console.error('Error parsing news for strategy input:', e.message);
    }
  }

  // 2. Fetch all other integrations in parallel (Notion tasks disabled per user request)
  const [emailData, calendarEvents, instagramData, liveWeather] = await Promise.all([
    fetchAllEmails(),
    fetchAllCalendarEvents(),
    runInstagramAnalysis(techNewsSummary),
    getVancouverWeather()
  ]);

  // 3. Load existing cache to preserve static or checkbox states
  let currentCache = {};
  if (fs.existsSync(CACHE_PATH)) {
    try {
      currentCache = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
    } catch (e) {}
  }

  // 4. Merge results with fallbacks if APIs returned null (not configured yet)
  const mergedData = {
    lastUpdated: new Date().toISOString(),
    weather: liveWeather || currentCache.weather || {
      temp: '17°C',
      condition: 'Sunny & clear',
      summary: 'Perfect conditions to film outside — great light all morning and afternoon'
    },
    todayContent: instagramData ? instagramData.todayContent : (currentCache.todayContent || [
      {
        title: 'How I manage my storage (Vibe Coding Edition)',
        type: 'Talking-head',
        details: 'Visuals: editor in charge (Sophie) — Caption: ready',
        status: '1 post'
      }
    ]),
    emails: emailData || (currentCache.emails || {
      countBadge: '2 need replies',
      urgent: [
        {
          id: '1',
          sender: 'Brand Partner',
          subject: 'Waiting for your confirmation',
          snippet: 'Offered $1200 for the upcoming campaign sponsorship, awaiting response.',
          action: 'reply'
        },
        {
          id: '2',
          sender: 'Flawlesss — Joseph',
          subject: 'Big fan of your content',
          snippet: 'Tran made the intro — Joseph already tried reaching out to collaborate on strategy.',
          action: 'reply'
        }
      ],
      summary: '5 unread cold outreach emails from brands. Low urgency, reply when you have time.'
    }),
    customEvents: currentCache.customEvents || [],
    calendarCategories: currentCache.calendarCategories || [
      { id: '1', name: 'Work', color: '#f97316' },
      { id: '2', name: 'Personal', color: '#10b981' },
      { id: '3', name: 'Sponsorship', color: '#8b5cf6' }
    ],
    allCalendarEvents: calendarEvents || currentCache.allCalendarEvents || [
      {
        date: (() => {
          const today = new Date();
          const y = today.getFullYear();
          const m = (today.getMonth() + 1).toString().padStart(2, '0');
          const d = today.getDate().toString().padStart(2, '0');
          return `${y}-${m}-${d}`;
        })(),
        time: 'Evening',
        title: 'Dinner with Mason',
        details: 'Social evening — nothing to prep.',
        source: 'Google Calendar'
      }
    ],
    calendar: (() => {
      const today = new Date();
      const y = today.getFullYear();
      const m = (today.getMonth() + 1).toString().padStart(2, '0');
      const d = today.getDate().toString().padStart(2, '0');
      const todayStr = `${y}-${m}-${d}`;
      
      const syncedEvents = calendarEvents || currentCache.allCalendarEvents || [
        {
          date: todayStr,
          time: 'Evening',
          title: 'Dinner with Mason',
          details: 'Social evening — nothing to prep.',
          source: 'Google Calendar'
        }
      ];
      const todaySynced = syncedEvents.filter(e => e.date === todayStr);
      const customEventsList = currentCache.customEvents || [];
      const todayCustom = customEventsList.filter(e => e.date === todayStr);
      return [...todaySynced, ...todayCustom];
    })(),
    priorities: currentCache.priorities || [
      { id: '1', text: 'Come up with new Claude series episodes — block 2-3h this morning', checked: false, priority: 'HIGH' },
      { id: '2', text: 'Reply to editor — confirm you are starting the video draft', checked: false, priority: 'HIGH' },
      { id: '3', text: 'Add bank details via Mercury to receive payment', checked: true, priority: 'HIGH' },
      { id: '4', text: 'Finish uploading content to editors + record voiceover', checked: false, priority: 'HIGH' },
      { id: '5', text: 'Plan carousel for the week (40 min)', checked: false, priority: 'MED' },
      { id: '6', text: 'Post on IG + TikTok tonight — confirm visuals with Sophie first', checked: false, priority: 'MED' }
    ],
    goals: getGoalsForCurrentMonth(),
    weeklyContent: (() => {
      const currentPlanner = (currentCache.weeklyContent && currentCache.weeklyContent.contentPlanner) || [];
      const manualEntries = currentPlanner.filter(item => item.isManual || item.date);
      
      let baseWeekly = instagramData ? instagramData.weeklyContent : currentCache.weeklyContent;
      if (!baseWeekly) {
        baseWeekly = {
          instagramAnalyzed: (currentCache.weeklyContent && currentCache.weeklyContent.instagramAnalyzed) || [
            {
              username: 'competitor_brand_strategist',
              engagementRate: '5.2%',
              topPosts: [
                { id: 1, hook: 'How I design brands with AI tools in 2026', views: '250K', likes: '18K', comments: '340' }
              ]
            }
          ],
          contentPlanner: [
            { day: 'Monday', topic: 'Why Brand Strategy is the new Coding', format: 'Reels', status: 'Planned', outline: 'Hook: If you only know how to code in 2026, you are in trouble. Vibe coding handles syntax. Strategy is key.' }
          ]
        };
      }
      
      const newPlanner = baseWeekly.contentPlanner || [];
      const mergedPlanner = [...manualEntries];
      
      for (const item of newPlanner) {
        const exists = mergedPlanner.some(m => 
          (m.date && item.date && m.date === item.date) || 
          (m.day && item.day && m.day === item.day && !m.date && !item.date)
        );
        if (!exists) {
          mergedPlanner.push(item);
        }
      }
      
      return {
        instagramAnalyzed: baseWeekly.instagramAnalyzed || [],
        contentPlanner: mergedPlanner
      };
    })()
  };

  // Write new cache to file
  fs.writeFileSync(CACHE_PATH, JSON.stringify(mergedData, null, 2), 'utf8');
  console.log('Dashboard cache updated successfully at:', mergedData.lastUpdated);
  return mergedData;
}

// Schedule the task daily at 7 AM
// Expression format: second (optional), minute, hour, day of month, month, day of week
cron.schedule('0 7 * * *', async () => {
  console.log('Running daily 7 AM scheduled updates...');
  try {
    await syncAllData();
  } catch (error) {
    console.error('Scheduled sync job failed:', error.message);
  }
});

module.exports = { syncAllData };
