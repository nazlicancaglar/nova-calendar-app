/**
 * newsletter-db.js
 * 
 * Bridge service: reads newsletter-repo's SQLite database directly
 * from the Express backend. Uses better-sqlite3 for synchronous reads.
 * 
 * Also runs a built-in cron to fetch feeds periodically so the DB
 * stays fresh without needing to run the SvelteKit server separately.
 */

const Database = require('better-sqlite3');
const path = require('path');
const { XMLParser } = require('fast-xml-parser');
const https = require('https');
const http = require('http');
const crypto = require('crypto');
const cron = require('node-cron');

// ── DB Path ──────────────────────────────────────────────────────────────────
const DB_PATH = process.env.NEWSLETTER_DB_PATH ||
  path.join(__dirname, '..', 'newsletter-repo', 'data', 'ai-updates.db');

let _db = null;

function getDb() {
  if (!_db) {
    try {
      _db = new Database(DB_PATH);
      _db.pragma('journal_mode = WAL');
      _db.pragma('foreign_keys = ON');
      ensureUserStateColumns(_db);
      console.log('[newsletter-db] Connected to', DB_PATH);
    } catch (err) {
      console.error('[newsletter-db] Failed to open DB:', err.message);
      return null;
    }
  }
  return _db;
}

// The upstream newsletter-repo schema has no per-user state; we add our own
// columns on first open. `archived` (not DELETE) hides items permanently —
// deleting the row would drop its deduplication_hash and the RSS poller
// would re-insert the same article as unread on the next fetch.
function ensureUserStateColumns(db) {
  const cols = db.prepare('PRAGMA table_info(articles)').all().map(c => c.name);
  if (!cols.includes('read_at')) db.exec('ALTER TABLE articles ADD COLUMN read_at TEXT');
  if (!cols.includes('starred')) db.exec('ALTER TABLE articles ADD COLUMN starred INTEGER DEFAULT 0');
  if (!cols.includes('archived')) db.exec('ALTER TABLE articles ADD COLUMN archived INTEGER DEFAULT 0');
}

// ── Read Functions ───────────────────────────────────────────────────────────

/**
 * Get recent articles ordered by importance then date.
 * @param {number} limit
 * @param {number} days - only articles from last N days
 * @param {string[]} categories - filter by categories (empty = all)
 */
function getRecentArticles(limit = 20, days = 7, categories = []) {
  const db = getDb();
  if (!db) return [];

  try {
    const catFilter = categories.length > 0
      ? `AND a.category IN (${categories.map(() => '?').join(',')})`
      : '';

    // params order: [...categories, limit] because LIMIT ? is last in SQL
    const params = categories.length > 0 ? [...categories, limit] : [limit];

    return db.prepare(`
      SELECT a.id, a.title, a.url, a.snippet, a.published_at, a.fetched_at,
             a.category, a.importance, a.is_breaking, a.tags,
             f.name as feed_name, f.category as feed_category
      FROM articles a
      JOIN feeds f ON f.id = a.feed_id
      WHERE a.published_at >= datetime('now', '-${Math.floor(days)} days')
      ${catFilter}
      ORDER BY a.importance DESC, a.published_at DESC
      LIMIT ?
    `).all(...params);

  } catch (err) {
    console.error('[newsletter-db] getRecentArticles error:', err.message);
    return [];
  }
}

/**
 * Get marketing-specific articles.
 */
function getMarketingArticles(limit = 15, days = 7) {
  return getRecentArticles(limit, days, ['marketing']);
}

/**
 * Browse list for the Newsletter UI: always the newest articles first.
 * Returns up to `limit` unread articles (so as items get read, the next
 * newest ones backfill the list and it stays at `limit`), plus up to
 * `limit` read-but-unarchived ones so the "show read" toggle still works.
 * Archived articles (weekly cleanup) never appear.
 */
function getBrowseArticles(limit = 30, days = 7, categories = []) {
  const db = getDb();
  if (!db) return [];

  try {
    const catFilter = categories.length > 0
      ? `AND a.category IN (${categories.map(() => '?').join(',')})`
      : '';
    const baseParams = categories.length > 0 ? [...categories, limit] : [limit];

    const select = (readCond) => db.prepare(`
      SELECT a.id, a.title, a.url, a.snippet, a.published_at, a.fetched_at,
             a.category, a.importance, a.is_breaking, a.tags,
             a.read_at, a.starred,
             f.name as feed_name, f.category as feed_category
      FROM articles a
      JOIN feeds f ON f.id = a.feed_id
      WHERE COALESCE(a.archived, 0) = 0
        AND ${readCond}
        AND a.published_at >= datetime('now', '-${Math.floor(days)} days')
      ${catFilter}
      ORDER BY a.published_at DESC
      LIMIT ?
    `).all(...baseParams);

    const unread = select('a.read_at IS NULL');
    const read = select('a.read_at IS NOT NULL');
    return [...unread, ...read];
  } catch (err) {
    console.error('[newsletter-db] getBrowseArticles error:', err.message);
    return [];
  }
}

/**
 * Mark an article read/unread.
 */
function markArticleRead(id, read = true) {
  const db = getDb();
  if (!db) return false;
  try {
    const info = read
      ? db.prepare("UPDATE articles SET read_at = datetime('now') WHERE id = ?").run(id)
      : db.prepare('UPDATE articles SET read_at = NULL WHERE id = ?').run(id);
    return info.changes > 0;
  } catch (err) {
    console.error('[newsletter-db] markArticleRead error:', err.message);
    return false;
  }
}

/**
 * Star/unstar an article. Starred articles survive the weekly cleanup.
 */
function setArticleStarred(id, starred = true) {
  const db = getDb();
  if (!db) return false;
  try {
    const info = db.prepare('UPDATE articles SET starred = ? WHERE id = ?').run(starred ? 1 : 0, id);
    return info.changes > 0;
  } catch (err) {
    console.error('[newsletter-db] setArticleStarred error:', err.message);
    return false;
  }
}

/**
 * Weekly reset: archive every read article that was not starred.
 * Archived rows stay in the DB (keeps deduplication intact) but never
 * show up in the browse list again.
 */
function weeklyCleanupReadArticles() {
  const db = getDb();
  if (!db) return 0;
  try {
    const info = db.prepare(`
      UPDATE articles SET archived = 1
      WHERE read_at IS NOT NULL AND COALESCE(starred, 0) = 0 AND COALESCE(archived, 0) = 0
    `).run();
    console.log(`[newsletter-db] Weekly cleanup: archived ${info.changes} read/unstarred articles`);
    return info.changes;
  } catch (err) {
    console.error('[newsletter-db] weeklyCleanupReadArticles error:', err.message);
    return 0;
  }
}

/**
 * Get top articles across all categories (importance >= 50).
 */
function getTopArticles(limit = 20, days = 7) {
  const db = getDb();
  if (!db) return [];

  try {
    return db.prepare(`
      SELECT a.id, a.title, a.url, a.snippet, a.published_at,
             a.category, a.importance, a.is_breaking, a.tags,
             f.name as feed_name
      FROM articles a
      JOIN feeds f ON f.id = a.feed_id
      WHERE a.published_at >= datetime('now', '-${Math.floor(days)} days')
        AND a.importance >= 35
      ORDER BY a.importance DESC, a.published_at DESC
      LIMIT ?
    `).all(limit);
  } catch (err) {
    console.error('[newsletter-db] getTopArticles error:', err.message);
    return [];
  }
}

/**
 * Get articles grouped by category for the newsletter digest.
 */
function getDigestArticles(days = 7) {
  const db = getDb();
  if (!db) return {};

  try {
    const rows = db.prepare(`
      SELECT a.id, a.title, a.url, a.snippet, a.published_at,
             a.category, a.importance, a.is_breaking, a.tags,
             f.name as feed_name
      FROM articles a
      JOIN feeds f ON f.id = a.feed_id
      WHERE a.published_at >= datetime('now', '-${Math.floor(days)} days')
      ORDER BY a.importance DESC, a.published_at DESC
      LIMIT 200
    `).all();

    // Group by category
    const grouped = {};
    for (const row of rows) {
      const cat = row.category || 'other';
      if (!grouped[cat]) grouped[cat] = [];
      if (grouped[cat].length < 10) grouped[cat].push(row); // max 10 per category
    }
    return grouped;
  } catch (err) {
    console.error('[newsletter-db] getDigestArticles error:', err.message);
    return {};
  }
}

/**
 * Get total article count and feed stats.
 */
function getStats() {
  const db = getDb();
  if (!db) return null;

  try {
    const articleCount = db.prepare("SELECT COUNT(*) as c FROM articles").get().c;
    const feedCount = db.prepare("SELECT COUNT(*) as c FROM feeds WHERE is_active = 1").get().c;
    const marketingCount = db.prepare("SELECT COUNT(*) as c FROM articles WHERE category = 'marketing'").get().c;
    const lastFetched = db.prepare("SELECT MAX(fetched_at) as t FROM articles").get().t;
    return { articleCount, feedCount, marketingCount, lastFetched };
  } catch (err) {
    console.error('[newsletter-db] getStats error:', err.message);
    return null;
  }
}

// ── Feed Fetcher (built-in cron, no SvelteKit needed) ────────────────────────

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  isArray: (name) => ['item', 'entry'].includes(name)
});

function httpGet(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, {
      headers: {
        'User-Agent': 'NovaContentBot/1.0 (+https://nova.local)',
        'Accept': 'application/rss+xml, application/atom+xml, text/xml, */*'
      },
      timeout: 10000
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(httpGet(res.headers.location));
      }
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

function deduplicationHash(url, title) {
  return crypto.createHash('sha256').update(`${url}|${title}`).digest('hex').slice(0, 32);
}

function parseRss(xml) {
  try {
    const parsed = parser.parse(xml);
    const channel = parsed?.rss?.channel || parsed?.feed;
    if (!channel) return [];

    const items = channel.item || channel.entry || [];
    return items.map(item => ({
      title: String(item.title || '').trim().replace(/<[^>]+>/g, ''),
      url: String(item.link?.['#text'] || item.link || item.url || ''),
      snippet: String(item.description || item.summary || item.content || item['content:encoded'] || '')
        .replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').slice(0, 500).trim(),
      publishedAt: new Date(item.pubDate || item.published || item.updated || Date.now()).toISOString()
    })).filter(i => i.url && i.title);
  } catch {
    return [];
  }
}

// Score importance heuristically (mirrors importance-scorer.ts but in JS)
const MARKETING_WORDS = ['seo', 'roas', 'cpa', 'ctr', 'campaign', 'influencer', 'content creator',
  'social media', 'google ads', 'meta ads', 'email marketing', 'brand', 'analytics', 'engagement'];
const BREAKTHROUGH_WORDS = ['breakthrough', 'milestone', 'record', 'surpasses', 'first ever', 'unprecedented'];
const NOVELTY_WORDS = ['launch', 'launching', 'launches', 'released', 'announcing', 'unveils', 'new'];

function scoreImportance(title, snippet, category, feedName) {
  const text = `${title} ${snippet}`.toLowerCase();
  const ageScore = 9; // fresh from fetch
  const marketingHits = MARKETING_WORDS.reduce((a, w) => a + (text.includes(w) ? 1 : 0), 0);
  const breakthroughHits = BREAKTHROUGH_WORDS.reduce((a, w) => a + (text.includes(w) ? 1 : 0), 0);
  const noveltyHits = NOVELTY_WORDS.reduce((a, w) => a + (text.includes(w) ? 1 : 0), 0);
  const wordCount = snippet.split(/\s+/).length;
  const depth = wordCount > 80 ? 10 : wordCount > 40 ? 7 : wordCount > 20 ? 5 : 3;
  const marketing = Math.min(10, marketingHits * 2);
  const breakthrough = Math.min(10, breakthroughHits * 4);
  const novelty = Math.min(10, noveltyHits * 3);

  const raw = ageScore * 1.4 + breakthrough * 1.8 + novelty * 1.3 + depth * 0.7 + marketing * 1.4;
  return Math.min(100, Math.round((raw / 60) * 100));
}

function heuristicCategory(title, snippet, feedCategory) {
  if (feedCategory === 'marketing') return 'marketing';
  const text = `${title} ${snippet}`.toLowerCase();
  const mHits = MARKETING_WORDS.reduce((a, w) => a + (text.includes(w) ? 1 : 0), 0);
  if (mHits >= 2) return 'marketing';
  return 'other';
}

async function fetchOneFeed(db, feed) {
  try {
    const { status, body } = await httpGet(feed.url);
    if (status !== 200) {
      db.prepare("UPDATE feeds SET last_fetch_error = ?, last_fetched_at = datetime('now') WHERE id = ?")
        .run(`HTTP ${status}`, feed.id);
      return 0;
    }

    const items = parseRss(body);
    if (!items.length) {
      db.prepare("UPDATE feeds SET last_fetched_at = datetime('now'), last_fetch_error = NULL WHERE id = ?")
        .run(feed.id);
      return 0;
    }

    const insert = db.prepare(`
      INSERT OR IGNORE INTO articles (id, title, url, snippet, published_at, feed_id, category, importance, is_breaking, tags, deduplication_hash)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, '[]', ?)
    `);

    let newCount = 0;
    const tx = db.transaction(() => {
      for (const item of items) {
        const hash = deduplicationHash(item.url, item.title);
        const category = heuristicCategory(item.title, item.snippet, feed.category);
        const importance = scoreImportance(item.title, item.snippet, category, feed.name);
        const id = crypto.randomUUID();
        const info = insert.run(id, item.title, item.url, item.snippet, item.publishedAt, feed.id, category, importance, hash);
        if (info.changes > 0) newCount++;
      }
    });
    tx();

    db.prepare("UPDATE feeds SET last_fetched_at = datetime('now'), last_fetch_error = NULL, item_count = item_count + ? WHERE id = ?")
      .run(newCount, feed.id);

    return newCount;
  } catch (err) {
    console.warn(`[newsletter-db] fetchOneFeed error for ${feed.name}:`, err.message);
    return 0;
  }
}

async function fetchAllFeeds() {
  const db = getDb();
  if (!db) return;

  const feeds = db.prepare(`
    SELECT id, url, name, category FROM feeds
    WHERE is_active = 1
    ORDER BY last_fetched_at ASC NULLS FIRST
  `).all();

  console.log(`[newsletter-db] Fetching ${feeds.length} feeds...`);
  let totalNew = 0;

  for (const feed of feeds) {
    const n = await fetchOneFeed(db, feed);
    totalNew += n;
    await new Promise(r => setTimeout(r, 300)); // polite delay
  }

  console.log(`[newsletter-db] Done. ${totalNew} new articles.`);
  return totalNew;
}

// Run once on startup, then every 60 minutes
let fetchInterval = null;
let weeklyCleanupJob = null;

function startFeedPoller() {
  // Run immediately on first startup
  fetchAllFeeds().catch(err => console.error('[newsletter-db] Initial fetch error:', err));

  // Then every 60 minutes
  fetchInterval = setInterval(() => {
    fetchAllFeeds().catch(err => console.error('[newsletter-db] Cron fetch error:', err));
  }, 60 * 60 * 1000);

  // Weekly reset: every Monday 04:00 archive read-but-unstarred articles
  weeklyCleanupJob = cron.schedule('0 4 * * 1', () => {
    weeklyCleanupReadArticles();
  });

  console.log('[newsletter-db] Feed poller started (every 60 min) + weekly cleanup (Mon 04:00)');
}

function stopFeedPoller() {
  if (fetchInterval) {
    clearInterval(fetchInterval);
    fetchInterval = null;
  }
  if (weeklyCleanupJob) {
    weeklyCleanupJob.stop();
    weeklyCleanupJob = null;
  }
}

module.exports = {
  getDb,
  getRecentArticles,
  getBrowseArticles,
  getMarketingArticles,
  getTopArticles,
  getDigestArticles,
  getStats,
  markArticleRead,
  setArticleStarred,
  weeklyCleanupReadArticles,
  fetchAllFeeds,
  startFeedPoller,
  stopFeedPoller
};
