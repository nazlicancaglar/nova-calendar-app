/**
 * ai-content.js
 *
 * Uses OpenRouter API (Gemini 2.5 Flash) to generate AI-powered content for:
 * - Weekly Content Planner (hooks + ~1.5min scripts from competitor + newsletter context)
 * - Newsletter Executive Summaries
 * - Tech Alerts (breaking tech news for Reel opportunities)
 */

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
const MODEL = 'google/gemini-2.5-flash';

/**
 * Core OpenRouter chat completion call
 */
async function callOpenRouter(messages, options = {}) {
  if (!OPENROUTER_API_KEY) throw new Error('OPENROUTER_API_KEY is not set');

  const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'http://localhost:5000',
      'X-Title': 'Nova Content Creation Dashboard'
    },
    body: JSON.stringify({
      model: options.model || MODEL,
      messages,
      temperature: options.temperature || 0.75,
      max_tokens: options.maxTokens || 4000,
      response_format: options.jsonMode ? { type: 'json_object' } : undefined
    })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenRouter API error ${response.status}: ${err}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

/**
 * Build competitor posts summary string for AI prompt
 */
function buildCompetitorSummary(scrapedCompetitors) {
  const lines = [];
  scrapedCompetitors.forEach(comp => {
    lines.push(`\n### @${comp.username} (Engagement: ${comp.engagementRate})`);
    const posts = comp.rawPosts || comp.topPosts || [];
    // Limit to 4 posts per competitor to keep prompt small
    posts.slice(0, 4).forEach((p, i) => {
      const hook = (p.hook || '').substring(0, 80); // truncate long hooks
      lines.push(`Post ${i + 1}: "${hook}" [${p.type || 'Post'}]`);
    });
  });
  return lines.join('\n');
}

/**
 * Build newsletter headlines summary for AI prompt
 */
function buildNewsletterSummary(articles) {
  if (!articles || articles.length === 0) return '';
  const top = articles.slice(0, 3); // limit to 3 articles to save tokens
  return top.map((a, i) => `${i + 1}. [${a.category}] "${a.title.substring(0, 70)}"${a.summary ? ' — ' + a.summary.substring(0, 80) : ''}`).join('\n');
}

/**
 * Generate newsletter executive summaries using OpenRouter AI.
 * Replaces fragile HTML scraping for sites like Search Engine Land.
 */
async function generateNewsletterSummaries(articles) {
  if (!articles || articles.length === 0) return [];
  if (!OPENROUTER_API_KEY) {
    console.log('[Newsletter AI] No OpenRouter key, skipping AI summaries');
    return articles;
  }

  console.log(`[Newsletter AI] Generating AI summaries for ${articles.length} articles...`);

  const systemPrompt = `You are a senior technology newsletter editor. For each article provided, write a clean 2-3 paragraph executive summary in English. Be informative, precise, and avoid marketing language. Never include HTML, CSS, or code. Output valid JSON only.`;

  const articlesInput = articles.slice(0, 6).map((a, i) => ({
    index: i,
    title: a.title,
    source: a.source || a.category,
    rawContent: (a.rawDescription || a.summary || '').substring(0, 400)
  }));

  const userPrompt = `Here are ${Math.min(articles.length, 6)} articles. For each, write a concise 2-paragraph executive summary. Return JSON:
{
  "summaries": [
    { "index": 0, "content": "### Executive Summary\\n\\nParagraph 1...\\n\\nParagraph 2...\\n\\n---\\n*Source: [title](url)*" },
    ...
  ]
}

Articles:
${JSON.stringify(articlesInput, null, 2)}`;

  try {
    const raw = await callOpenRouter([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ], { jsonMode: true, maxTokens: 3500, temperature: 0.4 });

    const parsed = JSON.parse(raw);
    const summaries = parsed.summaries || [];

    return articles.map((article, i) => {
      const match = summaries.find(s => s.index === i);
      if (match && match.content && match.content.length > 50) {
        const sourceNote = `\n\n---\n*This article was automatically compiled from **${article.source || 'Unknown'}**. To read the original article, [click here](${article.link || '#'}).*`;
        return {
          ...article,
          content: match.content.includes('---') ? match.content : match.content + sourceNote
        };
      }
      return article;
    });
  } catch (err) {
    console.error('[Newsletter AI] Summary generation failed:', err.message);
    return articles;
  }
}

/**
 * Main: Generate AI-powered weekly content plan.
 * 
 * Script length target: ~1.5 minutes of speech = ~225 Turkish words
 * (Turkish speaking pace ~150 words/minute)
 * 
 * @param {Array} scrapedCompetitors - scraped competitor post data
 * @param {Array} newsletterArticles - this week's top news articles (optional)
 */
async function generateAIWeeklyContent(scrapedCompetitors, newsletterArticles = []) {
  console.log('[AI Content] Starting AI content generation via OpenRouter...');

  const competitorSummary = buildCompetitorSummary(scrapedCompetitors);
  const newsletterSummary = buildNewsletterSummary(newsletterArticles);
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });

  const systemPrompt = `You are Nova's content strategist assistant. Nova is a developer and content creator who speaks English. Nova produces Instagram/social media content for the software developer community.

Nova's voice:
- Warm, direct, wise but accessible
- Makes technical topics feel interesting and motivating
- Shares personal experiences in the first-person
- No clickbait, no hype or exaggeration
- Educational but not preachy — a storyteller

RULE: All outputs must be in English. Respond in JSON format only.`;

  const userPrompt = `Today: ${today}

## Competitor Posts This Week
${competitorSummary}

${newsletterSummary ? `## Important Tech News This Week
${newsletterSummary}

` : ''}## Task

Generate the following JSON structure. Scripts are critical: the average person speaks ~150 words per minute, so each script must be between 225-250 words (approx. 1.5 minutes).

{
  "weeklyDigest": {
    "dominantTheme": "Dominant theme of the week (1 headline)",
    "dominantFormat": "Reel or Carousel",
    "topCompetitor": "@username — 1 sentence explanation why",
    "audienceSignal": "1-2 sentence analysis of what developer audience wants this week",
    "totalPostsAnalyzed": 50,
    "topInsights": [
      {
        "rank": 1,
        "competitorHook": "Competitor's original hook text",
        "competitorSource": "@username",
        "emotionalTrigger": "Emotional trigger (e.g., FOMO + Identity)",
        "novaAngle": "How Nova would present this topic from personal experience (1 sentence)",
        "novaTopic": "Topic title for Nova (English, 5-10 words)",
        "novaHook": "Nova's hook sentence (English, less than 15 words, catchy)",
        "novaFormat": "Reel or Carousel"
      },
      { "rank": 2, "competitorHook": "...", "competitorSource": "@...", "emotionalTrigger": "...", "novaAngle": "...", "novaTopic": "...", "novaHook": "...", "novaFormat": "..." },
      { "rank": 3, "competitorHook": "...", "competitorSource": "@...", "emotionalTrigger": "...", "novaAngle": "...", "novaTopic": "...", "novaHook": "...", "novaFormat": "..." }
    ],
    "overflowNotes": [
      { "topic": "Additional idea title", "hook": "Catchy hook sentence (English, max 12 words)", "format": "Reel or Carousel", "source": "@source", "emotionalTrigger": "Emotional trigger (e.g., FOMO, Identity, Curiosity)", "novaAngle": "Nova's unique angle on this — 1 sentence" }
    ],
    "techAlerts": [
      {
        "headline": "Trending tech news headline of the week (English)",
        "why": "Why it matters to developer audience (1 sentence)",
        "contentAngle": "How Nova can turn this into a Reel",
        "urgency": "This week or Next week"
      }
    ]
  },
  "contentPlanner": [
    {
      "day": "Monday",
      "topic": "Content topic (English)",
      "format": "Reels",
      "status": "Planned",
      "outline": "Hook + 3 main points + CTA structure (2-3 sentences)",
      "hook": "Hook sentence — grabs the viewer in the first 3 seconds (English, max 15 words)",
      "script": "FULL VIDEO SCRIPT — 225-250 English words (about 1.5 minutes speaking):\\n\\nINTRO (first 10 seconds — hook):\\n[Nova turns to camera] \\"[hook sentence]\\"\\n\\nBODY (main content — 3 clear steps/points, 2-3 sentences each):\\n1. [First point — concrete, using personal experience]\\n2. [Second point — practical info or stat]\\n3. [Third point — surprise insight or personal confession]\\n\\nCONCLUSION AND CTA (last 15 seconds):\\n\\"[Summary sentence]\\" + \\"[CTA question or action — comment, save, share]\\""
    },
    {
      "day": "Wednesday",
      "topic": "...",
      "format": "Reels or Carousel",
      "status": "Drafting",
      "outline": "...",
      "hook": "...",
      "script": "FULL VIDEO SCRIPT — 225-250 English words:\\n\\nINTRO (first 10 seconds):\\n...\\n\\nBODY:\\n1. ...\\n2. ...\\n3. ...\\n\\nCONCLUSION AND CTA:\\n..."
    },
    {
      "day": "Friday",
      "topic": "...",
      "format": "Reels",
      "status": "Ideas",
      "outline": "...",
      "hook": "...",
      "script": "FULL VIDEO SCRIPT — 225-250 English words:\\n\\nINTRO (first 10 seconds):\\n...\\n\\nBODY:\\n1. ...\\n2. ...\\n3. ...\\n\\nCONCLUSION AND CTA:\\n..."
    }
  ],
  "todayContent": {
    "title": "Recommended content title for today",
    "type": "Talking-head or Screen-share or Carousel or Vlog",
    "details": "Filming details and caption note",
    "status": "Recommended Post"
  }
}

RULES:
- Each script must ACTUALLY be 225-250 words — do not keep it short, write fully
- Scripts must be written in natural spoken language, as if actually speaking
- All 3 content items must be about DIFFERENT topics
- techAlerts: only fill if there is truly important news (max 2-3 items, otherwise empty array)
- Keep Nova's unique voice, do not copy competitor content"`;

  try {
    const rawContent = await callOpenRouter([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ], { jsonMode: true, maxTokens: 4500, temperature: 0.75 });

    console.log('[AI Content] Received response from OpenRouter');

    let parsed;
    try {
      parsed = JSON.parse(rawContent);
    } catch (e) {
      const jsonMatch = rawContent.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[1]);
      } else {
        throw new Error('Failed to parse AI JSON: ' + e.message);
      }
    }

    console.log('[AI Content] Successfully parsed AI-generated content plan');

    const todayContentArr = parsed.todayContent
      ? [parsed.todayContent]
      : [{
          title: parsed.contentPlanner?.[0]?.topic || "Today's content",
          type: 'Talking-head',
          details: parsed.contentPlanner?.[0]?.outline || '',
          status: 'Recommended Post'
        }];

    return {
      todayContent: todayContentArr,
      weeklyContent: {
        instagramAnalyzed: scrapedCompetitors.map(c => ({
          username: c.username,
          engagementRate: c.engagementRate,
          topPosts: c.topPosts || []
        })),
        weeklyDigest: {
          ...parsed.weeklyDigest,
          totalPostsAnalyzed: scrapedCompetitors.reduce((sum, c) => {
            return sum + ((c.rawPosts && c.rawPosts.length) || (c.topPosts && c.topPosts.length) || 0);
          }, 0),
          techAlerts: parsed.weeklyDigest?.techAlerts || []
        },
        contentPlanner: (parsed.contentPlanner || []).map(item => ({
          day: item.day,
          topic: item.topic,
          format: item.format,
          status: item.status,
          outline: item.outline,
          hook: item.hook,
          script: item.script,
          isManual: false
        }))
      }
    };
  } catch (error) {
    console.error('[AI Content] OpenRouter generation failed:', error.message);
    throw error;
  }
}

module.exports = { generateAIWeeklyContent, generateNewsletterSummaries, callOpenRouter };
