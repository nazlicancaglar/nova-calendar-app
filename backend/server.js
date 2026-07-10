require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const scheduler = require('./services/scheduler');
const newsletterDb = require('./services/newsletter-db');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json({ limit: '15mb' })); // drawing canvases are base64 PNGs, can be a few MB

const CACHE_PATH = path.join(__dirname, 'dashboard-cache.json');
const DESIGN_BOARD_PATH = path.join(__dirname, 'design-board.json'); // kept separate from dashboard-cache to avoid bloating it with base64 image data

// Helper to migrate and initialize structured quarterly goals (Action Board)
function getOrCreateActionBoard(data) {
  if (!data.actionBoard) {
    // Migrate existing flat goals array to 2026 Q2 (current time: June 20, 2026)
    const existingGoals = data.goals || [];
    const normalized = existingGoals.map((g, i) =>
      typeof g === 'string'
        ? { id: `migrated-${i}-${Date.now()}`, text: g, completed: false }
        : { id: g.id || `migrated-${i}-${Date.now()}`, text: g.text || g, completed: !!g.completed }
    );
    data.actionBoard = {
      "2026": {
        "Q1": [],
        "Q2": normalized,
        "Q3": [],
        "Q4": []
      }
    };
    // Clean up legacy flat goals
    delete data.goals;
    fs.writeFileSync(CACHE_PATH, JSON.stringify(data, null, 2), 'utf8');
  }
  return data.actionBoard;
}

// Helper to get cached data or initialize with realistic defaults (matching reference screenshots)
function getDashboardData() {
  if (fs.existsSync(CACHE_PATH)) {
    try {
      const data = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
      getOrCreateActionBoard(data);
      if (!data.customEvents) {
        data.customEvents = [];
      }
      if (!data.calendarCategories) {
        data.calendarCategories = [
          { id: '1', name: 'Work', color: '#f97316' },
          { id: '2', name: 'Personal', color: '#10b981' },
          { id: '3', name: 'Sponsorship', color: '#8b5cf6' }
        ];
      }
      if (data.weeklyContent) {
        if (!data.weeklyContent.brainstormIdeas) {
          data.weeklyContent.brainstormIdeas = [];
        }
      }
      return data;
    } catch (e) {
      console.error('Error reading cache, resetting to defaults', e);
    }
  }

  // Realistic mock data matching the screenshot exactly as standard default
  const defaultData = {
    lastUpdated: new Date().toISOString(),
    weather: {
      temp: '—',
      condition: 'Unknown',
      summary: 'Location not detected yet — allow location access in the browser or check back after the next sync.'
    },
    location: null,
    todayContent: [
      {
        title: 'How I manage my storage',
        type: 'Talking-head',
        details: 'Visuals: editor in charge (Sophie) — Caption: ready',
        status: '1 post'
      }
    ],
    emails: {
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
        },
        {
          id: '3',
          sender: 'Nature Made Reels',
          subject: 'Pricing counter-proposal',
          snippet: 'You counter-proposed $800 — Corey checking with team, awaiting his follow-up.',
          action: 'negotiate'
        }
      ],
      summary: '5 unread cold outreach emails from brands — Cal.com creator program, Goodo Studios, Beachstreet SPF (Argento Ventures), Hurriayah Co. (deodorant), ReciMe (recipe app). Low urgency, reply when you have time.'
    },
    calendar: [
      {
        time: 'Evening',
        title: 'Dinner with Mason',
        details: 'Social evening — nothing to prep.'
      }
    ],
    priorities: [
      { id: '1', text: 'Come up with new Claude series episodes — block 2-3h this morning', checked: false, priority: 'HIGH' },
      { id: '2', text: 'Reply to editor — confirm you are starting the video draft', checked: false, priority: 'HIGH' },
      { id: '3', text: 'Add bank details via Mercury to receive payment', checked: true, priority: 'HIGH' },
      { id: '4', text: 'Finish uploading content to editors + record voiceover', checked: false, priority: 'HIGH' },
      { id: '5', text: 'Plan carousel for the week (40 min)', checked: false, priority: 'MED' },
      { id: '6', text: 'Post on IG + TikTok tonight — confirm visuals with Sophie first', checked: false, priority: 'MED' }
    ],
    actionBoard: {
      "2026": {
        "Q1": [],
        "Q2": [
          { "id": "default-1", "text": "Launch new resource", "completed": false },
          { "id": "default-2", "text": "Transition ad account", "completed": false },
          { "id": "default-3", "text": "Brand deal collabs", "completed": false }
        ],
        "Q3": [],
        "Q4": []
      }
    },
    weeklyContent: {
      instagramAnalyzed: [
        {
          username: 'competitor_design_strategist',
          engagementRate: '5.2%',
          topPosts: [
            { id: 1, hook: 'How I design brands with AI tools in 2026', views: '250K', likes: '18K', comments: '340' },
            { id: 2, hook: 'Vibe coding changed my entire developer workflow', views: '180K', likes: '12K', comments: '220' }
          ]
        }
      ],
      contentPlanner: [
        {
          id: 'default-cp-1',
          day: 'Monday',
          topic: "Survival Guide for Developers Who Can't Keep Up with the Industry",
          format: 'Reels',
          status: 'Planned',
          outline: `Hook: A new technology comes out every day. How do you set your own pace without drowning in FOMO? 3 basic rules.`,
          hook: `A new library, a new AI tool comes out every day. Do you constantly feel left behind? You are not alone.`,
          script: `Intro: Raising the coffee cup to the camera and speaking.
"The biggest enemy in software is FOMO, the fear of not keeping up with the speed of development. But it is possible to overcome it:
1. Focus on the fundamentals: JavaScript and data structures never go out of style.
2. Just-in-time learning: learn only when you need it.
3. Look at only 1 new tool per week, ignore the rest."
Call to action: "What is the technology that has excited or scared you the most recently?"`,
          isManual: true,
          type: 'content',
          checked: false,
          priority: 'MED'
        },
        {
          id: 'default-cp-2',
          day: 'Wednesday',
          topic: 'The Art of Writing Code in the Vibe Coding Era',
          format: 'Reels',
          status: 'Draft',
          outline: `Hook: Innovations in developer tools and productive working methods. Prepare yourself for 2026 conditions.`,
          hook: `We are in 2026 and just knowing how to code is no longer enough. Here is what new generation developers need to know.`,
          script: `Intro: Looking at code on the computer and turning to the camera.
"If you want to stand out in this era where writing code is automated, you must do the following:
1. Grasp system architecture and data structures very well.
2. Use AI as a multiplier, don't just copy-paste.
3. Learn to market and present your own products to people."
Call to action: "Have you heard of the vibe coding concept? Let's meet in the comments!"`,
          isManual: true,
          type: 'content',
          checked: false,
          priority: 'MED'
        },
        {
          id: 'default-cp-3',
          day: 'Friday',
          topic: 'Coding is Not Enough: Why Developers Should Learn Design',
          format: 'Carousel',
          status: 'Idea',
          outline: `Slide 1: 3 big mistakes of a coder who doesn't know design. Slide 2: Figma basic principles. Slide 3: Developer-friendly UX tips. Slide 4: Conclusion.`,
          hook: `No matter how perfect your code is, if the design is bad, no one will use it. Why do you need to know design as a developer?`,
          script: `Intro: A poorly designed website and a great design side by side on the screen.
"As developers, we all focus on the perfection of the code. But the truth is: the user only sees the interface.
Here are 3 critical reasons for you to learn Figma:
1. You can visualize your ideas instantly and build quick MVPs.
2. You work with designers with zero communication loss.
3. You understand CSS Grid and Flexbox logic visually and code clean interfaces."
Call to action: "Do you design yourself or do you prefer ready-made templates?"`,
          isManual: true,
          type: 'content',
          checked: false,
          priority: 'MED'
        }
      ],
      brainstormIdeas: []
    }
  };

  fs.writeFileSync(CACHE_PATH, JSON.stringify(defaultData, null, 2), 'utf8');
  return defaultData;
}

// Get compiled dashboard data
app.get('/api/dashboard', (req, res) => {
  const data = getDashboardData();
  res.json(data);
});

// GET categories
app.get('/api/dashboard/categories', (req, res) => {
  const data = getDashboardData();
  if (!data.calendarCategories) {
    data.calendarCategories = [
      { id: '1', name: 'Work', color: '#f97316' },
      { id: '2', name: 'Personal', color: '#10b981' },
      { id: '3', name: 'Sponsorship', color: '#8b5cf6' }
    ];
  }
  res.json(data.calendarCategories);
});

// POST categories
app.post('/api/dashboard/categories', (req, res) => {
  const { name, color } = req.body;
  if (!name || !color) {
    return res.status(400).json({ error: 'Name and color are required' });
  }
  const data = getDashboardData();
  if (!data.calendarCategories) {
    data.calendarCategories = [
      { id: '1', name: 'Work', color: '#f97316' },
      { id: '2', name: 'Personal', color: '#10b981' },
      { id: '3', name: 'Sponsorship', color: '#8b5cf6' }
    ];
  }
  
  const existing = data.calendarCategories.find(c => c.name.toLowerCase() === name.toLowerCase());
  if (existing) {
    return res.json({ success: true, categories: data.calendarCategories });
  }

  const newCat = {
    id: Date.now().toString(),
    name,
    color
  };
  data.calendarCategories.push(newCat);
  fs.writeFileSync(CACHE_PATH, JSON.stringify(data, null, 2), 'utf8');
  res.json({ success: true, categories: data.calendarCategories });
});

// POST events (Supports both Create and Edit)
app.post('/api/dashboard/events', (req, res) => {
  const { id, title, date, time, details, categoryId } = req.body;
  if (!title || !date || !time) {
    return res.status(400).json({ error: 'Title, date, and time are required' });
  }
  const data = getDashboardData();
  if (!data.customEvents) {
    data.customEvents = [];
  }
  if (!data.calendarCategories) {
    data.calendarCategories = [
      { id: '1', name: 'Work', color: '#f97316' },
      { id: '2', name: 'Personal', color: '#10b981' },
      { id: '3', name: 'Sponsorship', color: '#8b5cf6' }
    ];
  }

  const category = data.calendarCategories.find(c => c.id === categoryId);
  const categoryName = category ? category.name : 'General';
  const categoryColor = category ? category.color : '#6b7280';

  if (id) {
    // Edit existing event
    const eventIdx = data.customEvents.findIndex(e => e.id === id);
    if (eventIdx > -1) {
      data.customEvents[eventIdx] = {
        ...data.customEvents[eventIdx],
        title,
        date,
        time,
        details: details || '',
        categoryId: categoryId || null,
        categoryName,
        categoryColor
      };
    }
  } else {
    // Create new event
    const newEvent = {
      id: 'custom-' + Date.now().toString(),
      title,
      date,
      time,
      details: details || '',
      categoryId: categoryId || null,
      categoryName,
      categoryColor,
      isCustom: true
    };
    data.customEvents.push(newEvent);
  }

  const today = new Date();
  const y = today.getFullYear();
  const m = (today.getMonth() + 1).toString().padStart(2, '0');
  const d = today.getDate().toString().padStart(2, '0');
  const todayStr = `${y}-${m}-${d}`;

  const syncedEvents = data.allCalendarEvents || [];
  const todaySynced = syncedEvents.filter(e => e.date === todayStr);
  const todayCustom = data.customEvents.filter(e => e.date === todayStr);
  data.calendar = [...todaySynced, ...todayCustom];

  fs.writeFileSync(CACHE_PATH, JSON.stringify(data, null, 2), 'utf8');
  res.json({ success: true, calendar: data.calendar, customEvents: data.customEvents });
});

// Edit category
app.post('/api/dashboard/categories/edit', (req, res) => {
  const { id, name, color } = req.body;
  if (!id || !name || !color) {
    return res.status(400).json({ error: 'ID, name, and color are required' });
  }
  const data = getDashboardData();
  if (data.calendarCategories) {
    const idx = data.calendarCategories.findIndex(c => c.id === id);
    if (idx > -1) {
      data.calendarCategories[idx] = { ...data.calendarCategories[idx], name, color };
      
      // Also update name/color in all custom events associated with this category
      if (data.customEvents) {
        data.customEvents = data.customEvents.map(event => {
          if (event.categoryId === id) {
            return {
              ...event,
              categoryName: name,
              categoryColor: color
            };
          }
          return event;
        });

        const today = new Date();
        const y = today.getFullYear();
        const m = (today.getMonth() + 1).toString().padStart(2, '0');
        const d = today.getDate().toString().padStart(2, '0');
        const todayStr = `${y}-${m}-${d}`;

        const syncedEvents = data.allCalendarEvents || [];
        const todaySynced = syncedEvents.filter(e => e.date === todayStr);
        const todayCustom = data.customEvents.filter(e => e.date === todayStr);
        data.calendar = [...todaySynced, ...todayCustom];
      }

      fs.writeFileSync(CACHE_PATH, JSON.stringify(data, null, 2), 'utf8');
    }
  }
  res.json({ success: true, categories: data.calendarCategories || [] });
});

// Delete category
app.post('/api/dashboard/categories/delete', (req, res) => {
  const { id } = req.body;
  if (!id) {
    return res.status(400).json({ error: 'ID is required' });
  }
  const data = getDashboardData();
  if (data.calendarCategories) {
    data.calendarCategories = data.calendarCategories.filter(c => c.id !== id);
    
    // Also remove category info from associated custom events
    if (data.customEvents) {
      data.customEvents = data.customEvents.map(event => {
        if (event.categoryId === id) {
          return {
            ...event,
            categoryId: null,
            categoryName: 'General',
            categoryColor: '#6b7280'
          };
        }
        return event;
      });

      const today = new Date();
      const y = today.getFullYear();
      const m = (today.getMonth() + 1).toString().padStart(2, '0');
      const d = today.getDate().toString().padStart(2, '0');
      const todayStr = `${y}-${m}-${d}`;

      const syncedEvents = data.allCalendarEvents || [];
      const todaySynced = syncedEvents.filter(e => e.date === todayStr);
      const todayCustom = data.customEvents.filter(e => e.date === todayStr);
      data.calendar = [...todaySynced, ...todayCustom];
    }

    fs.writeFileSync(CACHE_PATH, JSON.stringify(data, null, 2), 'utf8');
  }
  res.json({ success: true, categories: data.calendarCategories || [] });
});

// DELETE events
app.post('/api/dashboard/events/delete', (req, res) => {
  const { id } = req.body;
  if (!id) {
    return res.status(400).json({ error: 'ID is required' });
  }
  const data = getDashboardData();
  if (data.customEvents) {
    data.customEvents = data.customEvents.filter(e => e.id !== id);
  }

  const today = new Date();
  const y = today.getFullYear();
  const m = (today.getMonth() + 1).toString().padStart(2, '0');
  const d = today.getDate().toString().padStart(2, '0');
  const todayStr = `${y}-${m}-${d}`;

  const syncedEvents = data.allCalendarEvents || [];
  const todaySynced = syncedEvents.filter(e => e.date === todayStr);
  const todayCustom = (data.customEvents || []).filter(e => e.date === todayStr);
  data.calendar = [...todaySynced, ...todayCustom];

  fs.writeFileSync(CACHE_PATH, JSON.stringify(data, null, 2), 'utf8');
  res.json({ success: true, calendar: data.calendar, customEvents: data.customEvents });
});

// Update priorities check status
app.post('/api/dashboard/priorities/toggle', (req, res) => {
  const { id } = req.body;
  const data = getDashboardData();
  const priority = data.priorities.find(p => p.id === id);
  if (priority) {
    priority.checked = !priority.checked;
    fs.writeFileSync(CACHE_PATH, JSON.stringify(data, null, 2), 'utf8');
    return res.json({ success: true, priorities: data.priorities });
  }
  res.status(404).json({ error: 'Priority item not found' });
});

// Add a new priority item
app.post('/api/dashboard/priorities', (req, res) => {
  const { text, priority } = req.body;
  if (!text) {
    return res.status(400).json({ error: 'Text is required' });
  }
  const data = getDashboardData();
  const newItem = {
    id: Date.now().toString(),
    text,
    checked: false,
    priority: priority || 'MED'
  };
  if (!data.priorities) {
    data.priorities = [];
  }
  data.priorities.push(newItem);
  fs.writeFileSync(CACHE_PATH, JSON.stringify(data, null, 2), 'utf8');
  res.json({ success: true, priorities: data.priorities });
});

// Delete a priority item
app.post('/api/dashboard/priorities/delete', (req, res) => {
  const { id } = req.body;
  const data = getDashboardData();
  if (data.priorities) {
    data.priorities = data.priorities.filter(p => p.id !== id);
    fs.writeFileSync(CACHE_PATH, JSON.stringify(data, null, 2), 'utf8');
  }
  res.json({ success: true, priorities: data.priorities || [] });
});

// Get parsed tech newsletter articles
app.get('/api/newsletter', (req, res) => {
  const newsletterPath = path.join(__dirname, 'services', 'newsletter-data.json');
  if (fs.existsSync(newsletterPath)) {
    try {
      const articles = JSON.parse(fs.readFileSync(newsletterPath, 'utf8'));
      return res.json(articles);
    } catch (e) {
      console.error('Error reading newsletter data', e);
    }
  }

  // Fallback newsletter articles
  const defaultArticles = [
    {
      title: 'Devin vs. Vibe Coding: The Future of Software Architecture',
      date: 'June 18, 2026',
      summary: 'A deep dive into how natural language programming models are shifting the requirements from coding syntax to system architecture and branding design.',
      content: '### The Shift to Vibe Coding\n\nSoftware engineering is no longer just about typing loops and functions. It is about "vibe coding" - where the user guides the system using agentic models...\n\n### Why Branding Matters Now\nWith implementation becoming a solved problem, developers who understand **brand strategy** will stand out.',
      category: 'Software Architecture'
    },
    {
      title: 'GPT-5.5 and Agentic Workflow Pipelines',
      date: 'June 15, 2026',
      summary: 'OpenAI\'s latest model introduces native task loop executions, drastically reducing token usage for complex multi-agent reasoning tasks.',
      content: '### Agentic Workflows\n\nWith new reasoning models, task-specific pipelines are becoming standard. We examine how local developer dashboard apps can hook into external databases seamlessly.',
      category: 'Artificial Intelligence'
    }
  ];
  res.json(defaultArticles);
});

// Get detailed weekly content ideas and transcripts
app.get('/api/weekly-content', (req, res) => {
  const data = getDashboardData();
  res.json(data.weeklyContent || {});
});

// Get calendar data: combined allCalendarEvents and contentPlanner items
app.get('/api/calendar', (req, res) => {
  const data = getDashboardData();
  res.json({
    allCalendarEvents: data.allCalendarEvents || [],
    contentPlanner: (data.weeklyContent && data.weeklyContent.contentPlanner) || []
  });
});

// Add or update a content planner item
app.post('/api/weekly-content/planner', (req, res) => {
  const { id, day, date, topic, format, status, outline, isManual, type, checked, priority, notes, hook, script } = req.body;
  const data = getDashboardData();

  if (!data.weeklyContent) {
    data.weeklyContent = { instagramAnalyzed: [], contentPlanner: [], brainstormIdeas: [] };
  }
  if (!data.weeklyContent.contentPlanner) {
    data.weeklyContent.contentPlanner = [];
  }

  const planner = data.weeklyContent.contentPlanner;

  // Find index by id first, then fallback to matching date or day (for legacy items)
  let index = -1;
  if (id) {
    index = planner.findIndex(item => item.id === id);
  } else if (date) {
    index = planner.findIndex(item => item.date === date);
  } else if (day) {
    index = planner.findIndex(item => item.day === day && !item.date);
  }

  const calculatedDay = day || (() => {
    if (date) {
      const parts = date.split('-');
      const dateObj = new Date(parts[0], parts[1] - 1, parts[2]);
      const days = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
      return days[dateObj.getDay()];
    }
    return 'Pazartesi';
  })();

  const newItem = {
    id: id || Date.now().toString(),
    day: calculatedDay,
    date: date || null,
    topic: topic || 'New Topic',
    format: format || 'Reels',
    status: status || 'Planned',
    outline: outline || '',
    notes: notes || '',
    hook: hook || '',
    script: script || '',
    isManual: isManual !== undefined ? isManual : true,
    type: type || 'content',
    checked: checked !== undefined ? checked : false,
    priority: priority || 'MED'
  };

  if (index > -1) {
    planner[index] = newItem;
  } else {
    planner.push(newItem);
  }

  fs.writeFileSync(CACHE_PATH, JSON.stringify(data, null, 2), 'utf8');
  res.json({ success: true, weeklyContent: data.weeklyContent });
});

// Delete a content planner item
app.post('/api/weekly-content/planner/delete', (req, res) => {
  const { id, day, date } = req.body;
  const data = getDashboardData();

  if (data.weeklyContent && data.weeklyContent.contentPlanner) {
    data.weeklyContent.contentPlanner = data.weeklyContent.contentPlanner.filter(item => {
      if (id && item.id === id) return false;
      if (date && item.date === date) return false;
      if (day && item.day === day && !item.date && !date) return false;
      return true;
    });
    fs.writeFileSync(CACHE_PATH, JSON.stringify(data, null, 2), 'utf8');
  }

  res.json({ success: true, weeklyContent: data.weeklyContent || { instagramAnalyzed: [], contentPlanner: [], brainstormIdeas: [] } });
});

// Add or update a brainstorm idea
app.post('/api/weekly-content/brainstorm', (req, res) => {
  const { id, title, hook, details, script, format, createdAt } = req.body;
  const data = getDashboardData();
  
  if (!data.weeklyContent) {
    data.weeklyContent = { instagramAnalyzed: [], contentPlanner: [], brainstormIdeas: [] };
  }
  if (!data.weeklyContent.brainstormIdeas) {
    data.weeklyContent.brainstormIdeas = [];
  }
  
  const ideas = data.weeklyContent.brainstormIdeas;
  let index = -1;
  if (id) {
    index = ideas.findIndex(item => item.id === id);
  }
  
  const newItem = {
    id: id || Date.now().toString(),
    title: title || 'Yeni Fikir',
    hook: hook || '',
    details: details || req.body.description || '',
    script: script || '',
    format: format || 'Reels',
    createdAt: createdAt || new Date().toISOString()
  };
  
  if (index > -1) {
    ideas[index] = newItem;
  } else {
    ideas.push(newItem);
  }
  
  fs.writeFileSync(CACHE_PATH, JSON.stringify(data, null, 2), 'utf8');
  res.json({ success: true, weeklyContent: data.weeklyContent });
});

// Delete a brainstorm idea
app.post('/api/weekly-content/brainstorm/delete', (req, res) => {
  const { id } = req.body;
  const data = getDashboardData();
  
  if (data.weeklyContent && data.weeklyContent.brainstormIdeas) {
    data.weeklyContent.brainstormIdeas = data.weeklyContent.brainstormIdeas.filter(item => item.id !== id);
    fs.writeFileSync(CACHE_PATH, JSON.stringify(data, null, 2), 'utf8');
  }
  
  res.json({ success: true, weeklyContent: data.weeklyContent || { instagramAnalyzed: [], contentPlanner: [], brainstormIdeas: [] } });
});

// Reorder brainstorm ideas
app.post('/api/weekly-content/brainstorm/reorder', (req, res) => {
  const { ideas } = req.body;
  if (!Array.isArray(ideas)) {
    return res.status(400).json({ error: 'Ideas must be an array' });
  }
  const data = getDashboardData();
  if (!data.weeklyContent) {
    data.weeklyContent = { instagramAnalyzed: [], contentPlanner: [], brainstormIdeas: [] };
  }
  data.weeklyContent.brainstormIdeas = ideas;
  fs.writeFileSync(CACHE_PATH, JSON.stringify(data, null, 2), 'utf8');
  res.json({ success: true, weeklyContent: data.weeklyContent });
});

// Revert planner item back to brainstorm
app.post('/api/weekly-content/planner/revert', (req, res) => {
  const { id } = req.body;
  const data = getDashboardData();
  
  if (data.weeklyContent && data.weeklyContent.contentPlanner) {
    const itemIndex = data.weeklyContent.contentPlanner.findIndex(item => item.id === id);
    if (itemIndex > -1) {
      const item = data.weeklyContent.contentPlanner[itemIndex];
      
      // Move to brainstormIdeas
      if (!data.weeklyContent.brainstormIdeas) {
        data.weeklyContent.brainstormIdeas = [];
      }
      data.weeklyContent.brainstormIdeas.push({
        id: Date.now().toString(),
        title: item.topic || item.title || 'Geri Alınan Fikir',
        hook: item.hook || '',
        details: item.outline || item.notes || '',
        script: item.script || '',
        format: item.format || 'Reels',
        createdAt: new Date().toISOString()
      });
      
      // Remove from planner
      data.weeklyContent.contentPlanner.splice(itemIndex, 1);
      
      fs.writeFileSync(CACHE_PATH, JSON.stringify(data, null, 2), 'utf8');
    }
  }
  
  res.json({ success: true, weeklyContent: data.weeklyContent || { instagramAnalyzed: [], contentPlanner: [], brainstormIdeas: [] } });
});

// Video transcription and AI script rewrite
app.post('/api/weekly-content/transcribe', async (req, res) => {
  const { url } = req.body;
  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  try {
    const { spawn } = require('child_process');
    const { callOpenRouter } = require('./services/ai-content');
    
    const pythonPath = 'C:\\ProgramData\\anaconda3\\python.exe';
    const transcribeScript = path.join(__dirname, 'transcribe.py');
    const suffix = Date.now().toString();

    console.log(`[Transcribe API] Starting transcription for URL: ${url}`);
    
    const pyProcess = spawn(pythonPath, [transcribeScript, url, suffix]);
    
    let stdoutData = '';
    let stderrData = '';
    
    pyProcess.stdout.on('data', (data) => {
      stdoutData += data.toString();
    });
    
    pyProcess.stderr.on('data', (data) => {
      stderrData += data.toString();
    });
    
    pyProcess.on('close', async (code) => {
      console.log(`[Transcribe API] Process completed with code ${code}`);
      
      if (code !== 0) {
        console.error(`[Transcribe API] Error details:\n${stderrData}`);
        return res.status(500).json({ error: `Transcription process failed: ${stderrData}` });
      }

      const transcriptionText = stdoutData.trim();
      if (!transcriptionText) {
        return res.status(500).json({ error: 'No text transcribed from the video.' });
      }

      console.log(`[Transcribe API] Transcribed text: "${transcriptionText.substring(0, 100)}..."`);
      res.json({
        success: true,
        transcription: transcriptionText
      });
    });

    pyProcess.on('error', (err) => {
      console.error(`[Transcribe API] Spawning error: ${err.message}`);
      res.status(500).json({ error: `Failed to spawn transcription script: ${err.message}` });
    });

  } catch (err) {
    console.error(`[Transcribe API] Unexpected error: ${err.message}`);
    res.status(500).json({ error: `An unexpected error occurred: ${err.message}` });
  }
});

// Goals CRUD — in-place editable goals on dashboard (active quarter only)
app.get('/api/goals', (req, res) => {
  const data = getDashboardData();
  const board = getOrCreateActionBoard(data);

  const now = new Date();
  const yearStr = now.getFullYear().toString();
  const month = now.getMonth();
  let qStr = "Q1";
  if (month >= 3 && month <= 5) qStr = "Q2";
  else if (month >= 6 && month <= 8) qStr = "Q3";
  else if (month >= 9 && month <= 11) qStr = "Q4";

  if (!board[yearStr]) {
    board[yearStr] = { "Q1": [], "Q2": [], "Q3": [], "Q4": [] };
  }
  if (!board[yearStr][qStr]) {
    board[yearStr][qStr] = [];
  }

  res.json(board[yearStr][qStr]);
});

app.post('/api/goals', (req, res) => {
  try {
    const { goals } = req.body;
    if (!Array.isArray(goals)) return res.status(400).json({ error: 'goals must be an array' });
    const data = getDashboardData();
    const board = getOrCreateActionBoard(data);

    const now = new Date();
    const yearStr = now.getFullYear().toString();
    const month = now.getMonth();
    let qStr = "Q1";
    if (month >= 3 && month <= 5) qStr = "Q2";
    else if (month >= 6 && month <= 8) qStr = "Q3";
    else if (month >= 9 && month <= 11) qStr = "Q4";

    if (!board[yearStr]) {
      board[yearStr] = { "Q1": [], "Q2": [], "Q3": [], "Q4": [] };
    }
    board[yearStr][qStr] = goals;

    data.actionBoard = board;
    fs.writeFileSync(CACHE_PATH, JSON.stringify(data, null, 2), 'utf8');
    res.json({ success: true, goals: board[yearStr][qStr] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Action Board API endpoints (for full quarterly views)
app.get('/api/action-board', (req, res) => {
  const data = getDashboardData();
  const board = getOrCreateActionBoard(data);
  res.json(board);
});

app.post('/api/action-board/goals', (req, res) => {
  try {
    const { year, quarter, goals } = req.body;
    if (!year || !quarter || !Array.isArray(goals)) {
      return res.status(400).json({ error: 'year, quarter, and goals are required' });
    }
    const data = getDashboardData();
    const board = getOrCreateActionBoard(data);

    if (!board[year]) {
      board[year] = { "Q1": [], "Q2": [], "Q3": [], "Q4": [] };
    }
    board[year][quarter] = goals;

    data.actionBoard = board;
    fs.writeFileSync(CACHE_PATH, JSON.stringify(data, null, 2), 'utf8');
    res.json({ success: true, actionBoard: board });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
// Trigger manual data synchronization/refresh
app.post('/api/sync', async (req, res) => {
  try {
    const syncAllData = require('./services/scheduler').syncAllData;
    const updatedData = await syncAllData();
    res.json({ success: true, data: updatedData });
  } catch (error) {
    console.error('Manual sync failed:', error);
    res.status(500).json({ error: 'Sync failed: ' + error.message });
  }
});


// AI-powered content regeneration (uses cached competitor + newsletter data)
app.post('/api/ai-generate', async (req, res) => {
  try {
    if (!process.env.OPENROUTER_API_KEY) {
      return res.status(400).json({ error: 'OPENROUTER_API_KEY not configured' });
    }

    const { generateAIWeeklyContent } = require('./services/ai-content');

    // Load existing cache
    const cache = getDashboardData();
    const instagramAnalyzed = (cache.weeklyContent && cache.weeklyContent.instagramAnalyzed) || [];

    if (instagramAnalyzed.length === 0) {
      return res.status(400).json({ error: 'No competitor data in cache. Run a full Sync first.' });
    }

    // Build competitor data shape
    const scrapedData = instagramAnalyzed.map(c => ({
      username: c.username,
      engagementRate: c.engagementRate,
      topPosts: c.topPosts || [],
      rawPosts: (c.topPosts || []).map(p => ({
        hook: p.hook,
        caption: p.hook,
        likes: p.likes,
        comments: p.comments,
        type: p.views === 'Reel' ? 'Video' : 'Image'
      }))
    }));

    // Load newsletter articles for additional context
    let newsletterArticles = [];
    try {
      const NEWSLETTER_DATA = path.join(__dirname, 'services', 'newsletter-data.json');
      if (fs.existsSync(NEWSLETTER_DATA)) {
        newsletterArticles = JSON.parse(fs.readFileSync(NEWSLETTER_DATA, 'utf8')).slice(0, 6);
        console.log(`[AI Generate] Loaded ${newsletterArticles.length} newsletter articles as context`);
      }
    } catch (e) {
      console.warn('[AI Generate] Could not load newsletter data:', e.message);
    }

    console.log('[AI Generate] Running AI content generation...');
    const aiResult = await generateAIWeeklyContent(scrapedData, newsletterArticles);

    // Merge into existing cache (preserve manually-dated entries)
    const currentCache = getDashboardData();
    const existingPlanner = (currentCache.weeklyContent && currentCache.weeklyContent.contentPlanner) || [];
    const manualEntries = existingPlanner.filter(item => item.isManual || item.date);
    const aiEntries = (aiResult.weeklyContent.contentPlanner || []).filter(item => !item.date);

    const mergedPlanner = [...manualEntries];
    for (const item of aiEntries) {
      const exists = mergedPlanner.some(m => m.day === item.day && !m.date);
      if (!exists) mergedPlanner.push(item);
    }

    const updatedData = {
      ...currentCache,
      todayContent: aiResult.todayContent || currentCache.todayContent,
      weeklyContent: {
        ...currentCache.weeklyContent,
        instagramAnalyzed: aiResult.weeklyContent.instagramAnalyzed || currentCache.weeklyContent?.instagramAnalyzed || [],
        weeklyDigest: aiResult.weeklyContent.weeklyDigest,
        contentPlanner: mergedPlanner
      }
    };

    fs.writeFileSync(CACHE_PATH, JSON.stringify(updatedData, null, 2), 'utf8');
    console.log('[AI Generate] Cache updated with AI-generated content');

    res.json({ success: true, data: updatedData });
  } catch (error) {
    console.error('[AI Generate] Failed:', error.message);
    res.status(500).json({ error: 'AI generation failed: ' + error.message });
  }
});


// ── /api/newsletter/refresh — trigger manual feed fetch ──────────────────────
app.post('/api/newsletter/refresh', async (req, res) => {
  try {
    console.log('[server] Manual newsletter feed refresh triggered');
    const newCount = await newsletterDb.fetchAllFeeds();
    const stats = newsletterDb.getStats();
    res.json({ success: true, newArticles: newCount, stats });
  } catch (err) {
    console.error('[server] Newsletter refresh error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Location + live weather (browser geolocation -> Open-Meteo) ─────────────
// Fixes the earlier hardcoded-Vancouver bug: the frontend asks the browser
// for real coordinates and posts them here; we save them and refresh weather
// immediately using the free/open Open-Meteo API (no key needed).
app.post('/api/location', async (req, res) => {
  try {
    const { lat, lon, label } = req.body;
    if (typeof lat !== 'number' || typeof lon !== 'number') {
      return res.status(400).json({ error: 'lat and lon (numbers) are required' });
    }

    const { getWeatherForLocation } = require('./services/weather');
    const data = getDashboardData();
    data.location = { lat, lon, label: label || null };
    data.weather = await getWeatherForLocation(data.location, null);
    fs.writeFileSync(CACHE_PATH, JSON.stringify(data, null, 2), 'utf8');

    res.json({ success: true, weather: data.weather, location: data.location });
  } catch (err) {
    console.error('[server] Location/weather update error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Design Board (canvas drawing + sticky notes) ────────────────────────────
function getDesignBoard() {
  if (fs.existsSync(DESIGN_BOARD_PATH)) {
    try {
      return JSON.parse(fs.readFileSync(DESIGN_BOARD_PATH, 'utf8'));
    } catch (e) {
      console.error('Error reading design-board.json, resetting to defaults', e);
    }
  }
  return { drawing: null, notes: [] };
}

app.get('/api/design-board', (req, res) => {
  res.json(getDesignBoard());
});

app.post('/api/design-board', (req, res) => {
  try {
    const { drawing, notes } = req.body;
    const board = {
      drawing: drawing !== undefined ? drawing : getDesignBoard().drawing,
      notes: Array.isArray(notes) ? notes : []
    };
    fs.writeFileSync(DESIGN_BOARD_PATH, JSON.stringify(board), 'utf8');
    res.json({ success: true });
  } catch (err) {
    console.error('[server] Design board save error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Handwriting recognition (Design Board ink -> text via Microsoft TrOCR) ──
// Runs fully locally through transformers.js/ONNX — no external API, no key.
app.post('/api/design-board/recognize', async (req, res) => {
  try {
    const { image } = req.body;
    if (!image) {
      return res.status(400).json({ error: 'image (base64 data URL) is required' });
    }
    const { recognizeHandwriting } = require('./services/handwriting-ocr');
    const text = await recognizeHandwriting(image);
    res.json({ success: true, text });
  } catch (err) {
    console.error('[server] Handwriting recognition error:', err.message);
    res.status(500).json({ error: 'Recognition failed: ' + err.message });
  }
});

// ── /api/newsletter/browse — many articles per category (DB-backed, paginated) ──
// Returns a large flat list so the frontend can page through ~5 pages per category.
app.get('/api/newsletter/browse', (req, res) => {
  try {
    const perCategory = Math.min(parseInt(req.query.perCategory, 10) || 30, 60);

    const cleanTitle = (t) => (t || '')
      .replace(/&#0?39;/g, "'")
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#8217;/g, "'")
      .replace(/<[^>]+>/g, '')
      .trim();

    const mapRow = (row, categoryLabel) => ({
      id: row.id,
      title: cleanTitle(row.title),
      link: row.url,
      date: new Date(row.published_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
      summary: row.snippet,
      source: row.feed_name,
      category: categoryLabel,
      importance: row.importance,
      content: `### Executive Summary\n\n${row.snippet || ''}\n\n---\n*This article was automatically compiled from **${row.feed_name}**. To read the original article or check comments, [click here](${row.url}).*`
    });

    // Technology (feeds tagged 'other') is plentiful in the last 30 days.
    // Marketing is scarcer, so widen the window to fill ~5 pages.
    const tech = newsletterDb.getRecentArticles(perCategory, 30, ['other']).map(r => mapRow(r, 'Technology'));
    const marketing = newsletterDb.getRecentArticles(perCategory, 180, ['marketing']).map(r => mapRow(r, 'Marketing'));

    res.json([...tech, ...marketing]);
  } catch (err) {
    console.error('[server] Newsletter browse error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── /api/newsletter/stats — DB stats ────────────────────────────────────────
app.get('/api/newsletter/stats', (req, res) => {
  try {
    const stats = newsletterDb.getStats();
    res.json(stats || { error: 'DB not available' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    // Start newsletter feed poller (fetches feeds every 60 min)
    newsletterDb.startFeedPoller();
  });
}

module.exports = app;

