const fs = require('fs');
const path = require('path');
const simpleGit = require('simple-git');
const axios = require('axios');

const REPO_URL = 'https://github.com/gencturkler/teknopol-newsletter-digest.git';
const REPO_DIR = path.join(__dirname, '..', 'newsletter-repo');
const DATA_FILE = path.join(__dirname, 'newsletter-data.json');

async function syncNewsletterRepo() {
  console.log('[Newsletter] Syncing from newsletter-repo DB...');

  // Try DB first (newsletter-repo SQLite)
  try {
    const newsletterDb = require('./newsletter-db');
    const stats = newsletterDb.getStats();

    if (stats && stats.articleCount > 0) {
      console.log(`[Newsletter] DB has ${stats.articleCount} articles (${stats.marketingCount} marketing). Reading top articles...`);

      // Get top articles by category for the newsletter
      const topArticles = newsletterDb.getTopArticles(30, 7);
      const marketingArticles = newsletterDb.getMarketingArticles(12, 7);

      // Merge: top articles + marketing-specific, deduplicate by URL
      const seen = new Set();
      const combined = [];
      for (const a of [...topArticles, ...marketingArticles]) {
        if (!seen.has(a.url)) {
          seen.add(a.url);
          combined.push(a);
        }
      }

      // Format to match existing newsletter data structure
      const baseArticles = combined.slice(0, 12).map(a => {
        const tags = (() => { try { return JSON.parse(a.tags || '[]'); } catch { return []; } })();
        return {
          title: a.title,
          link: a.url,
          date: new Date(a.published_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
          summary: a.snippet,
          rawDescription: a.snippet,
          source: a.feed_name,
          category: a.category === 'marketing' ? 'Marketing' : a.category === 'business' ? 'Startups' : 'Technology',
          importance: a.importance,
          tags,
          content: `### Executive Summary\n\n${a.snippet}\n\n---\n*This article was automatically compiled from **${a.feed_name}**. To read the original article or check comments, [click here](${a.url}).*`
        };
      });

      if (baseArticles.length === 0) {
        console.log('[Newsletter] No articles in DB yet — triggering feed fetch and falling back to RSS.');
        newsletterDb.fetchAllFeeds().catch(err => console.error('[Newsletter] Feed fetch error:', err));
        await compileWeeklyNews();
        return;
      }

      // Use OpenRouter AI for clean executive summaries if key is available
      if (process.env.OPENROUTER_API_KEY) {
        try {
          console.log('[Newsletter] Using OpenRouter AI to generate clean executive summaries...');
          const { generateNewsletterSummaries } = require('./ai-content');
          const aiEnhanced = await generateNewsletterSummaries(baseArticles);
          fs.writeFileSync(DATA_FILE, JSON.stringify(aiEnhanced, null, 2), 'utf8');
          console.log(`[Newsletter] AI summaries generated for ${aiEnhanced.length} articles from DB.`);
          return;
        } catch (aiErr) {
          console.error('[Newsletter] AI summary failed, using raw DB snippets:', aiErr.message);
        }
      }

      // Fallback: use DB snippets as-is
      fs.writeFileSync(DATA_FILE, JSON.stringify(baseArticles, null, 2), 'utf8');
      console.log(`[Newsletter] Saved ${baseArticles.length} articles from DB (no AI key).`);
      return;
    }
  } catch (dbErr) {
    console.warn('[Newsletter] DB read failed, falling back to RSS:', dbErr.message);
  }

  // RSS fallback (original behavior — runs when DB is empty or unavailable)
  await compileWeeklyNews();
}



function cleanXmlEntities(str) {
  if (!str) return '';
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#039;/g, "'")
    .replace(/&#8217;/g, "'")
    .replace(/&#8216;/g, "'")
    .replace(/&#8220;/g, '"')
    .replace(/&#8221;/g, '"')
    .replace(/<!\[CDATA\[/g, '')
    .replace(/\]\]>/g, '')
    .trim();
}

// Scrape target webpage to extract the first 3 substantial paragraphs of the news story
async function fetchFullArticleParagraphs(url) {
  try {
    console.log(`Scraping news article content from: ${url}...`);
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      timeout: 5000
    });
    const html = response.data;

    // Extract standard paragraph tags
    const pRegex = /<p[^>]*>([\s\S]*?)<\/p>/g;
    let match;
    let paragraphs = [];

    while ((match = pRegex.exec(html)) !== null) {
      const pText = match[1].replace(/<[^>]*>?/gm, '').trim();
      const cleaned = cleanXmlEntities(pText);

      // Filter out short fragments, copyright notices, cookie consent, and ads
      if (cleaned.length > 120 &&
        !cleaned.includes('©') &&
        !cleaned.includes('Terms of Service') &&
        !cleaned.includes('Privacy Policy') &&
        !cleaned.toLowerCase().includes('newsletter') &&
        !cleaned.toLowerCase().includes('subscribe') &&
        !cleaned.toLowerCase().includes('cookie') &&
        !cleaned.toLowerCase().includes('related:') &&
        !cleaned.toLowerCase().startsWith('written by') &&
        !cleaned.toLowerCase().startsWith('read more') &&
        paragraphs.length < 3) {
        paragraphs.push(cleaned);
      }
    }

    if (paragraphs.length > 0) {
      return paragraphs;
    }
  } catch (e) {
    console.error(`Failed to scrape webpage paragraphs from ${url}:`, e.message);
  }
  return null;
}

// Fallback cleaner for RSS descriptions if scraping fails
function getCleanExecutiveSummary(rawDesc) {
  if (!rawDesc) return 'Summary details are currently not available.';

  let cleaned = rawDesc
    // Remove entire <style> and <script> blocks
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    // Remove CSS selector blocks (e.g. "html div#om-xxx .class, html div#yyy .class { ... }")
    .replace(/html\s+[^{]*\{[^}]*\}/g, '')
    // Remove standalone CSS-like selectors that don't have braces but are clearly CSS
    .replace(/(?:html|body)\s+(?:div|span|p|h[1-6])[^\n{]*(?:,\s*(?:html|body)\s+(?:div|span|p|h[1-6])[^\n{]*)*/g, '')
    // Remove any remaining CSS-like content: selectors with class/id patterns
    .replace(/[.#][\w-]+(?:\s*[>,~+]\s*[.#]?[\w-]+)*\s*\{[^}]*\}/g, '')
    // Convert links
    .replace(/<a\s+(?:[^>]*?\s+)?href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<p>/gi, '')
    .replace(/<li>/gi, '\n- ')
    .replace(/<\/li>/gi, '')
    // Remove all remaining HTML tags
    .replace(/<[^>]*>?/gm, '');

  cleaned = cleanXmlEntities(cleaned).trim();

  // Filter paragraphs: must be >40 chars AND not look like CSS/code
  const paragraphs = cleaned
    .split(/\n\s*\n+/)
    .map(p => p.trim())
    .filter(p => {
      if (p.length < 40) return false;
      // Reject paragraphs that look like CSS selectors or code artifacts
      if (p.includes('.lomita-c-canvas') || p.includes('div#om-') || p.includes('wpforms')) return false;
      if (p.includes(':not(') || p.includes('.ignore-reset)')) return false;
      if ((p.match(/[{}:;#.]/g) || []).length > p.length * 0.15) return false; // >15% special chars = code
      return true;
    });

  if (paragraphs.length > 0) {
    cleaned = paragraphs.slice(0, 3).join('\n\n');
  } else {
    // All paragraphs were code — return a simple fallback
    cleaned = 'Executive summary is currently being prepared. Please check the original source for details.';
  }

  return cleaned;
}


function getCategoryForSource(source) {
  if (source === 'HackerNews') return 'Startups';
  if (['MarTech', 'Search Engine Land', 'Neil Patel Blog', 'Google Keyword Blog', 'The Business of Fashion Podcast'].includes(source)) return 'Marketing';
  return 'Technology';
}

async function fetchRssFeeds() {
  let feeds = [
    { name: 'TechCrunch', url: 'https://techcrunch.com/feed/' },
    { name: 'Wired', url: 'https://www.wired.com/feed/rss' },
    { name: 'HackerNews', url: 'https://hnrss.org/frontpage?points=100' }
  ];

  try {
    const feedsFile = path.join(__dirname, 'feeds.json');
    if (fs.existsSync(feedsFile)) {
      feeds = JSON.parse(fs.readFileSync(feedsFile, 'utf8'));
    }
  } catch (e) {
    console.error('Failed to load feeds.json, using hardcoded defaults:', e.message);
  }

  let allArticles = [];

  for (const feed of feeds) {
    try {
      console.log(`Fetching feed: ${feed.name}...`);
      const response = await axios.get(feed.url, { timeout: 6000 });
      const xml = response.data;

      const itemRegex = /<item>([\s\S]*?)<\/item>/g;
      let match;

      while ((match = itemRegex.exec(xml)) !== null) {
        const itemContent = match[1];

        const titleMatch = itemContent.match(/<title>(<!\[CDATA\[)?([\s\S]*?)(]]>)?<\/title>/);
        const linkMatch = itemContent.match(/<link>(<!\[CDATA\[)?([\s\S]*?)(]]>)?<\/link>/);
        const descMatch = itemContent.match(/<description>(<!\[CDATA\[)?([\s\S]*?)(]]>)?<\/description>/);
        const contentMatch = itemContent.match(/<content:encoded>(<!\[CDATA\[)?([\s\S]*?)(]]>)?<\/content:encoded>/);
        const dateMatch = itemContent.match(/<pubDate>(<!\[CDATA\[)?([\s\S]*?)(]]>)?<\/pubDate>/);

        if (titleMatch) {
          const rawTitle = titleMatch[2] || titleMatch[0].replace(/<\/?title>/g, '');
          const title = cleanXmlEntities(rawTitle);
          const link = linkMatch ? (linkMatch[2] || linkMatch[0].replace(/<\/?link>/g, '')) : '';

          const rawDesc = descMatch ? (descMatch[2] || descMatch[0].replace(/<\/?description>/g, '')) : '';
          const fullContent = contentMatch ? (contentMatch[2] || contentMatch[0].replace(/<\/?content:encoded>/g, '')) : '';

          const bestDesc = fullContent.length > rawDesc.length ? fullContent : rawDesc;

          const summary = cleanXmlEntities(rawDesc.replace(/<[^>]*>?/gm, '')).substring(0, 180) + '...';
          const pubDate = dateMatch ? new Date(dateMatch[2] || dateMatch[0].replace(/<\/?pubDate>/g, '')) : new Date();

          allArticles.push({
            title,
            link: link.trim(),
            summary,
            rawDescription: bestDesc,
            date: pubDate,
            source: feed.name
          });
        }
      }
    } catch (e) {
      console.error(`Failed to fetch RSS from ${feed.name}:`, e.message);
    }
  }

  // Sort by date (newest first)
  allArticles.sort((a, b) => b.date - a.date);
  return allArticles;
}

async function compileWeeklyNews() {
  console.log('Compiling most important weekly news for each category...');
  try {
    const rawArticles = await fetchRssFeeds();
    if (rawArticles.length === 0) {
      console.log('No articles fetched from feeds. Leaving cache as is.');
      return;
    }

    // Select top articles per category
    const articlesByCategory = {
      Technology: [],
      Startups: [],
      Marketing: []
    };

    for (const art of rawArticles) {
      const cat = getCategoryForSource(art.source);
      if (articlesByCategory[cat] && articlesByCategory[cat].length < 4) {
        articlesByCategory[cat].push(art);
      }
    }

    const selectedArticles = [
      ...articlesByCategory.Technology,
      ...articlesByCategory.Startups,
      ...articlesByCategory.Marketing
    ];

    // Build base articles with raw content preserved
    const baseArticles = selectedArticles.map(art => ({
      title: art.title,
      link: art.link,
      date: art.date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
      summary: art.summary,
      rawDescription: art.rawDescription || art.summary || '',
      source: art.source,
      category: getCategoryForSource(art.source),
      content: `### Executive Summary\n\n${getCleanExecutiveSummary(art.rawDescription)}\n\n---\n*This article was automatically compiled from **${art.source}**. To read the original article or check comments, [click here](${art.link}).*`
    }));

    // Use OpenRouter AI for clean executive summaries if key is available
    if (process.env.OPENROUTER_API_KEY) {
      try {
        console.log('[Newsletter] Using OpenRouter AI to generate clean executive summaries...');
        const { generateNewsletterSummaries } = require('./ai-content');
        const aiEnhanced = await generateNewsletterSummaries(baseArticles);
        fs.writeFileSync(DATA_FILE, JSON.stringify(aiEnhanced, null, 2), 'utf8');
        console.log(`[Newsletter] AI summaries generated for ${aiEnhanced.length} articles.`);
        return;
      } catch (aiErr) {
        console.error('[Newsletter] AI summary failed, using fallback:', aiErr.message);
      }
    }

    // Fallback: try web scraping for known-clean sources, otherwise use RSS text
    console.log('[Newsletter] No OpenRouter key or AI failed — using web scrape + RSS fallback.');
    const fallbackData = [];
    for (const art of baseArticles) {
      let cleanSummary = '';
      if (!['HackerNews', 'The Business of Fashion Podcast'].includes(art.source)) {
        const paragraphs = await fetchFullArticleParagraphs(art.link);
        if (paragraphs) cleanSummary = paragraphs.join('\n\n');
      }
      if (!cleanSummary) cleanSummary = getCleanExecutiveSummary(art.rawDescription);

      fallbackData.push({
        ...art,
        content: `### Executive Summary\n\n${cleanSummary}\n\n---\n*This article was automatically compiled from **${art.source}**. To read the original article or check comments, [click here](${art.link}).*`
      });
    }

    fs.writeFileSync(DATA_FILE, JSON.stringify(fallbackData, null, 2), 'utf8');
    console.log(`[Newsletter] Compiled ${fallbackData.length} articles with fallback summaries.`);

  } catch (error) {
    console.error('Error compiling weekly news:', error.message);
  }
}



module.exports = { syncNewsletterRepo, compileWeeklyNews };
