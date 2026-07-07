const fs = require('fs');
const path = require('path');

// Helper to convert short numbers like "2k" or "1.5m" to actual numbers
function parseCount(str) {
  if (!str) return 0;
  str = str.toLowerCase().trim();
  if (str.endsWith('k')) {
    return parseFloat(str) * 1000;
  }
  if (str.endsWith('m')) {
    return parseFloat(str) * 1000000;
  }
  return parseFloat(str) || 0;
}

// Scrape competitor profile from imginn.com
async function parseCompetitorProfile(username) {
  try {
    console.log(`[Scraper] Scraping profile: ${username}...`);
    const response = await fetch(`https://imginn.com/${username}/`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const html = await response.text();
    
    // Parse followers count
    // Example: "description": "... 70.5K Followers, 598 Following, 303 Posts"
    const followerMatch = html.match(/"description":\s*"[^"]*?([0-9.]+[KMB]?)\s*Followers/i);
    let followersStr = followerMatch ? followerMatch[1] : '10K';
    const followers = parseCount(followersStr) || 10000;
    
    // Split into individual post cards
    const items = html.split('<div class="item">');
    const posts = [];
    
    // First element in split is header, skip it
    for (let i = 1; i < items.length; i++) {
      const card = items[i];
      
      // 1. Post ID/URL
      const idMatch = card.match(/href="\/p\/([^"\/]+)\//);
      const id = idMatch ? idMatch[1] : null;
      if (!id) continue;
      
      // 2. Caption (Hook)
      const altMatch = card.match(/<img[^>]*alt="([^"]*)"/);
      let caption = altMatch ? altMatch[1] : '';
      caption = caption
        .replace(/&#38;/g, '&')
        .replace(/&#34;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&#60;/g, '<')
        .replace(/&#62;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&')
        .trim();
        
      // Extract hook (first 60 chars or up to the first punctuation/hashtag)
      let hook = caption.split('\n')[0].split('#')[0].trim();
      if (hook.length > 80) {
        hook = hook.substring(0, 77) + '...';
      }
      if (!hook) {
        hook = 'Post without caption';
      }
      
      // 3. Type (Video/Reel vs Image/Carousel)
      const isVideo = card.includes('icon-video');
      const type = isVideo ? 'Video' : 'Image';
      
      // 4. Likes
      const likesMatch = card.match(/class="likes"[^>]*><i[^>]*><\/i>\s*<span>([^<]*)<\/span>/);
      const likes = likesMatch ? likesMatch[1].trim() : '0';
      
      // 5. Comments
      const commentsMatch = card.match(/class="comments"[^>]*><i[^>]*><\/i>\s*<span>([^<]*)<\/span>/);
      const comments = commentsMatch ? commentsMatch[1].trim() : '0';
      
      posts.push({
        id,
        hook,
        caption,
        type,
        likes,
        comments
      });
    }
    
    // Sort posts by popularity (likes + comments)
    const postsToAnalyze = posts.slice(0, 10);
    let totalLikesVal = 0;
    let totalCommentsVal = 0;
    
    postsToAnalyze.forEach(p => {
      totalLikesVal += parseCount(p.likes);
      totalCommentsVal += parseCount(p.comments);
    });
    
    const count = postsToAnalyze.length || 1;
    const avgLikes = totalLikesVal / count;
    const avgComments = totalCommentsVal / count;
    const er = ((avgLikes + avgComments) / followers * 100).toFixed(1) + '%';
    
    return {
      username,
      followersStr,
      engagementRate: er,
      topPosts: postsToAnalyze.map((p, idx) => ({
        id: idx + 1,
        hook: p.hook,
        views: p.type === 'Video' ? 'Reel' : 'Post',
        likes: p.likes,
        comments: p.comments,
        url: `https://www.instagram.com/reels/${p.id}/`
      })),
      rawPosts: postsToAnalyze
    };
  } catch (error) {
    console.error(`[Scraper] Failed to scrape competitor ${username}:`, error.message);
    return {
      username,
      engagementRate: '4.5%',
      topPosts: [
        { id: 1, hook: 'Bilinmeyen Figma Taktikleri ve UX Tasarım Sırları', views: 'Post', likes: '1.2k', comments: '45', url: '#' },
        { id: 2, hook: 'Yazılımcılar İçin Hayat Kurtaran Yapay Zeka Araçları', views: 'Reel', likes: '950', comments: '30', url: '#' }
      ],
      rawPosts: []
    };
  }
}

// Local strategists to map competitor content into Turkish ideas for Nova
function generateTurkishStrategy(scrapedCompetitors) {
  // Extract all scraped posts from all competitors to find the top performers
  const allPosts = [];
  scrapedCompetitors.forEach(comp => {
    if (comp.rawPosts) {
      comp.rawPosts.forEach(p => {
        allPosts.push({
          username: comp.username,
          ...p,
          popularity: parseCount(p.likes) + parseCount(p.comments)
        });
      });
    }
  });

  // Sort all posts by popularity
  allPosts.sort((a, b) => b.popularity - a.popularity);

  // Pre-coded high-quality Turkish templates based on topic matching
  const getTurkishTemplate = (post) => {
    const text = (post.hook + ' ' + (post.caption || '')).toLowerCase();
    
    if (text.includes('figma') || text.includes('design') || text.includes('ui') || text.includes('ux')) {
      return {
        title: 'Yazılımcılar İçin Figma & Tasarım Sırları',
        type: 'Talking-head',
        details: 'Visuals: Figma arayüzünde hızlı bileşen tasarlama adımları gösterilecek. Caption: Tasarım bilmeyen yazılımcı kalmasın!',
        plannerTopic: 'Kodlama Bilmek Yetmez: Yazılımcılar Neden Tasarım Öğrenmeli?',
        plannerFormat: 'Carousel',
        plannerOutline: 'Slide 1: Tasarım bilmeyen kodcunun 3 büyük hatası. Slide 2: Figma temel prensipleri. Slide 3: Geliştirici dostu UX ipuçları. Slide 4: Sonuç.',
        plannerHook: 'Kodunuz ne kadar mükemmel olursa olsun, tasarımı kötüyse kimse kullanmayacak. Yazılımcı olarak neden tasarım bilmeniz gerekiyor?',
        plannerScript: 'Giriş: Ekranda kötü tasarlanmış bir web sitesi ve yanında harika bir tasarım yan yana.\n"Yazılımcılar olarak hepimiz kodun kusursuzluğuna odaklanıyoruz. Ama gerçek şu ki: Kullanıcı sadece arayüzü görüyor.\nİşte Figma öğrenmeniz için 3 kritik sebep:\n1. Fikirlerinizi anında görselleştirip hızlı MVP yapabilirsiniz.\n2. Tasarımcılarla sıfır iletişim kaybıyla çalışırsınız.\n3. CSS Grid ve Flexbox mantığını görsel olarak anlayıp temiz arayüzler kodlarsınız."\nÇağrı: "Tasarım yapıyor musunuz yoksa hazır şablonları mı tercih ediyorsunuz?"',
        emotionalTrigger: 'FOMO + Kimlik',
        novaAngle: 'Figma\'yı öğrendiğimde kariyer açısından yaşadığım somut değişim',
        competitorSource: post.username
      };
    }
    
    if (text.includes('cursor') || text.includes('repl.it') || text.includes('replit') || text.includes('build') || text.includes('experiment')) {
      return {
        title: 'Cursor AI ile 15 Dakikada Uygulama Geliştirme Deneyimi',
        type: 'Screen-share',
        details: 'Visuals: Cursor editöründe hızlı prompt yazarak sıfırdan çalışan kod üretme ekran kaydı. Caption: Vibe coding çağındayız!',
        plannerTopic: 'Cursor AI Kullanarak Geliştirdiğim İlk Proje ve Kod Analizi',
        plannerFormat: 'Reels',
        plannerOutline: 'Hook: Kod yazmadan sadece fikir belirterek uygulama yaptık. Nasıl çalıştığını ve Cursor prompt taktiklerimi gösteriyorum.',
        plannerHook: 'Cursor AI kullanarak sadece 15 dakikada, tek satır kod yazmadan sıfırdan çalışan bir uygulama geliştirdim! İşte adımları.',
        plannerScript: 'Giriş: Cursor editöründe Composer modunu (Ctrl+I) açıp prompt yazıyorum.\n"Yapay zeka ile kod yazmak artık sadece otomatik tamamlama değil, tüm projeyi oluşturmak demek. İşte sıfırdan yapılışı:\n1. Composer moduna fikrimi ve istediklerimi detaylıca anlattım.\n2. AI\'ın oluşturduğu dosyaları tek tıkla kabul ettim.\n3. Aldığım hataları terminale kopyalayıp tek seferde düzelttirdim."\nÇağrı: "Sizce yapay zeka yazılımcıların yerini alacak mı, yoksa sadece işimizi mi hızlandıracak?"',
        emotionalTrigger: 'Merak + İlham',
        novaAngle: 'Kendi Cursor deneyimim — ilk kez denediğimde ne hissettim ve nasıl geliştim',
        competitorSource: post.username
      };
    }
    
    if (text.includes('behind') || text.includes('late') || text.includes('fomo') || text.includes('feel')) {
      return {
        title: 'Yazılım Sektöründe Geri Kalma Korkusuyla Baş Etmek',
        type: 'Talking-head',
        details: 'Visuals: Ev ortamında loş ışıkta kahve eşliğinde rahat bir konuşma açısı. Caption: FOMO hepimizin derdi, yalnız değilsin.',
        plannerTopic: 'Sektörün Hızına Yetişemeyen Yazılımcılar İçin Hayatta Kalma Rehberi',
        plannerFormat: 'Reels',
        plannerOutline: 'Hook: Her gün yeni bir teknoloji çıkıyor. FOMO ile boğulmadan kendi temponuzu nasıl belirlersiniz? 3 temel kural.',
        plannerHook: 'Her gün yeni bir kütüphane, yeni bir yapay zeka aracı çıkıyor. Kendinizi sürekli geride kalmış mı hissediyorsunuz? Yalnız değilsiniz.',
        plannerScript: 'Giriş: Kahve bardağını kameraya doğru kaldırıp konuşuyorum.\n"Yazılımdaki en büyük düşmanımız FOMO, yani gelişim hızına yetişememe korkusu. Ama bunu yenmek mümkün:\n1. Temel bilgilere odaklanın: JavaScript ve veri yapıları asla eskimez.\n2. Sadece ihtiyacınız olduğunda öğrenin (Just-in-time learning).\n3. Haftada sadece 1 yeni araca bakın, geri kalanını görmezden gelin."\nÇağrı: "Sizi son zamanlarda en çok heyecanlandıran ya da korkutan teknoloji hangisi?"',
        emotionalTrigger: 'Empati + Rahatlama',
        novaAngle: 'FOMO\'yu yaşadığım bir dönem ve beni kurtaran 3 basit kural',
        competitorSource: post.username
      };
    }

    if (text.includes('ai') || text.includes('agent') || text.includes('automation') || text.includes('claude') || text.includes('gpt')) {
      return {
        title: 'Yapay Zeka Kodlama Araçlarını Doğru Kullanıyor musunuz?',
        type: 'Screen-share',
        details: 'Visuals: Yapay zekanın yanlış kod ürettiği ve bunu nasıl düzeltebileceğimizi gösteren anlar. Caption: AI asistan, köle değil!',
        plannerTopic: 'Yapay Zekayı Fazla Kullanmak Yazılım Yeteneğinizi Köreltir mi?',
        plannerFormat: 'Reels',
        plannerOutline: 'Hook: Sadece TAB tuşuna basarak kod yazmak sizi tembelleştiriyor mu? AI asistanlarla verimli ve dengeli çalışmanın formülü.',
        plannerHook: 'Yapay zeka ile kod yazarken sadece TAB tuşuna basıp geçiyorsanız, yazılımcı olarak kendi sonunuzu hazırlıyor olabilirsiniz!',
        plannerScript: 'Giriş: Editörde AI kod tamamlamasını ve otomatik kabul etmeyi gösteriyorum.\n"AI asistanlar harika ama beynimizi kapatmamalıyız. İşte AI ile çalışırken uymanız gereken 3 kural:\n1. Kodu projenize eklemeden önce satır satır okuyun ve anlayın.\n2. AI\'ın ürettiği algoritmaları mutlaka test edin.\n3. AI\'ı bir köle olarak değil, pair-programming yaptığınız bir arkadaşınız gibi konumlandırın."\nÇağrı: "Kod yazarken yapay zeka araçlarını yüzde kaç kullanıyorsunuz?"',
        emotionalTrigger: 'FOMO + Merak',
        novaAngle: 'AI kullanarak hata yaptığım anlar ve bu hatalardan öğrendiklerim',
        competitorSource: post.username
      };
    }

    if (text.includes('life') || text.includes('vlog') || text.includes('day') || text.includes('apartment') || text.includes('routine') || text.includes('morning')) {
      return {
        title: 'Bir Yazılımcının Günlük Rutini (Estetik Vlog)',
        type: 'Vlog',
        details: 'Visuals: Sabah kahvesi hazırlama, estetik masa düzeni, odaklanarak kodlama anları. Caption: Home-office çalışma hayatı.',
        plannerTopic: 'Home-Office Yazılımcı Günlüğü: Odaklanma ve Disiplin Rutinim',
        plannerFormat: 'Reels',
        plannerOutline: 'Hook: Evden çalışan bir yazılımcının günü nasıl geçer? İş-yaşam dengesini ve odaklanmayı artırma yöntemleri.',
        plannerHook: 'Evden çalışan bir yazılımcının günü gerçekten verimli geçiyor mu? İşte odağımı kaybetmeden günü tamamlama şeklim.',
        plannerScript: 'Giriş: Estetik bir sabah açılışı ve bilgisayarı açarken masa detayları.\n"Home-office çalışırken en büyük düşman odaklanamamak. İşte benim disiplin rutinim:\n1. Pomodoro tekniği (50 dakika çalışma, 10 dakika mola) ile bölünmeden ilerliyorum.\n2. Masamda sadece o an çalıştığım işe ait şeyler duruyor.\n3. Gün biter bitmez bilgisayarı kapatıp mutlaka dışarıda kısa bir yürüyüş yapıyorum."\nÇağrı: "Evden çalışmayı mı yoksa ofisi mi daha verimli buluyorsunuz?"',
        emotionalTrigger: 'Kimlik + İlham',
        novaAngle: 'Sabah rutinimin içerik üretimdeki somut etkisi',
        competitorSource: post.username
      };
    }

    if (text.includes('freelan') || text.includes('client') || text.includes('money') || text.includes('income') || text.includes('earn')) {
      return {
        title: 'Freelance Gelir Sistemi: Nasıl Düzenli Proje Bulunur?',
        type: 'Talking-head',
        details: 'Visuals: Ekranda proje teklif mailleri ve müzakere ekranı. Caption: Freelancing kaygı değil, sistem meselesi.',
        plannerTopic: 'Freelancer Olarak Düzenli Gelir İçin Kullandığım 3 Strateji',
        plannerFormat: 'Carousel',
        plannerOutline: 'Slide 1: Freelancing\'te en büyük korku: boş ay. Slide 2-4: 3 kanal stratejisi. Slide 5: Gerçek rakamlar ve sonuçlar.',
        plannerHook: 'Freelancer olarak her ay yeni müşteri aramak zorunda kalmak istemiyorsanız, şu 3 strateji hayatınızı değiştirir.',
        plannerScript: 'Giriş: Bilgisayarda bir proje teklif mailini açıyorum.\n"Freelancing\'te en büyük korku boş ay. Ama düzgün bir sistem kurduğunuzda bu korku ortadan kalkıyor:\n1. LinkedIn profilinizi sürekli güncelleyin — sizin en iyi satış ekibiniz.\n2. Her müşteriye referans ağı oluşturun — en ucuz pazarlama.\n3. Tekrarlayan proje türleri için fiyat paketleri oluşturun."\nÇağrı: "Freelance çalışıyorsanız en zorlandığınız konu nedir?"',
        emotionalTrigger: 'Rahatlama + Güven',
        novaAngle: 'İlk düzenli geliri kazandığım dönem ve o süreci bana öğretenler',
        competitorSource: post.username
      };
    }

    // Default template if no matches
    return {
      title: 'Yazılımcılar İçin Üretkenlik ve Kodlama Taktikleri',
      type: 'Talking-head',
      details: 'Visuals: Temiz bir çalışma masası ve modern bir editör arayüzü gösterimi. Caption: Daha akıllıca kod yazmak için ipuçları.',
      plannerTopic: 'Vibe Coding Çağında Kod Yazma Sanatı',
      plannerFormat: 'Reels',
      plannerOutline: 'Hook: Geliştirici araçlarındaki yenilikler ve verimli çalışma yöntemleri. Kendinizi 2026 şartlarına hazırlayın.',
      plannerHook: '2026 yılındayız ve sadece kod yazmayı bilmek artık yetmiyor. İşte yeni nesil yazılımcıların bilmesi gerekenler.',
      plannerScript: 'Giriş: Bilgisayar başında kodu incelerken kameraya dönüş.\n"Kod yazmanın otomatikleştiği bu dönemde öne çıkmak istiyorsanız şunları yapmalısınız:\n1. Sistem mimarisi ve veri yapılarını çok iyi kavrayın.\n2. Yapay zekayı bir çarpan olarak kullanın, sadece kopyala-yapıştır yapmayın.\n3. Kendi ürünlerinizi pazarlamayı ve insanlara sunmayı öğrenin."\nÇağrı: "Vibe coding kavramını duydunuz mu? Yorumlarda buluşalım!"',
      emotionalTrigger: 'Merak + FOMO',
      novaAngle: 'Vibe coding keşfettiğimde üretkenliğimin nasıl değiştiği',
      competitorSource: post.username
    };
  };

  // Select top posts to build recommendations
  const top1 = allPosts[0];
  const top2 = allPosts[1] || top1;
  const top3 = allPosts[2] || top1;
  const overflowPosts = allPosts.slice(3, 6); // Extra ideas beyond top 3

  const t1 = top1 ? getTurkishTemplate(top1) : null;
  const t2 = top2 ? getTurkishTemplate(top2) : null;
  const t3 = top3 ? getTurkishTemplate(top3) : null;

  // Determine dominant theme from all posts this week
  const allText = allPosts.map(p => (p.hook + ' ' + (p.caption || '')).toLowerCase()).join(' ');
  let dominantTheme = 'Geliştirici Araçları & Üretkenlik';
  let dominantFormat = 'Reel';
  if (allText.includes('figma') || allText.includes('design')) {
    dominantTheme = 'Tasarım & UI/UX';
    dominantFormat = 'Carousel';
  } else if (allText.includes('freelan') || allText.includes('client')) {
    dominantTheme = 'Freelancing & Kariyer';
    dominantFormat = 'Carousel';
  } else if (allText.includes('ai') || allText.includes('claude') || allText.includes('gpt') || allText.includes('cursor')) {
    dominantTheme = 'Yapay Zeka Araçları';
    dominantFormat = 'Reel';
  } else if (allText.includes('life') || allText.includes('vlog') || allText.includes('routine')) {
    dominantTheme = 'Günlük Rutin & Vlog';
    dominantFormat = 'Reel';
  }

  // Find top competitor this week
  const topCompetitor = scrapedCompetitors.reduce((best, comp) => {
    const er = parseFloat(comp.engagementRate) || 0;
    const bestEr = parseFloat(best ? best.engagementRate : '0') || 0;
    return er > bestEr ? comp : best;
  }, scrapedCompetitors[0] || { username: 'competitor', engagementRate: '0%' });

  // Build overflow notes if more than 3 ideas
  const overflowNotes = overflowPosts.map(p => {
    const t = getTurkishTemplate(p);
    return {
      topic: t.plannerTopic,
      hook: t.plannerHook,
      format: t.plannerFormat,
      source: `@${p.username}`
    };
  });

  // Build top insights (max 3) with Nova's tone
  const topInsights = [];
  if (t1) topInsights.push({
    rank: 1,
    competitorHook: top1.hook,
    competitorSource: `@${top1.username}`,
    emotionalTrigger: t1.emotionalTrigger,
    novaAngle: t1.novaAngle,
    novaTopic: t1.plannerTopic,
    novaHook: t1.plannerHook,
    novaFormat: t1.plannerFormat
  });
  if (t2 && t2.plannerTopic !== (t1 && t1.plannerTopic)) topInsights.push({
    rank: 2,
    competitorHook: top2.hook,
    competitorSource: `@${top2.username}`,
    emotionalTrigger: t2.emotionalTrigger,
    novaAngle: t2.novaAngle,
    novaTopic: t2.plannerTopic,
    novaHook: t2.plannerHook,
    novaFormat: t2.plannerFormat
  });
  if (t3 && t3.plannerTopic !== (t1 && t1.plannerTopic) && t3.plannerTopic !== (t2 && t2.plannerTopic)) topInsights.push({
    rank: 3,
    competitorHook: top3.hook,
    competitorSource: `@${top3.username}`,
    emotionalTrigger: t3.emotionalTrigger,
    novaAngle: t3.novaAngle,
    novaTopic: t3.plannerTopic,
    novaHook: t3.plannerHook,
    novaFormat: t3.plannerFormat
  });

  return {
    todayContent: t1 ? [
      {
        title: t1.title,
        type: t1.type,
        details: t1.details,
        status: 'Önerilen Post'
      }
    ] : [],
    weeklyContent: {
      instagramAnalyzed: scrapedCompetitors.map(c => ({
        username: c.username,
        engagementRate: c.engagementRate,
        topPosts: c.topPosts
      })),
      weeklyDigest: {
        dominantTheme,
        dominantFormat,
        topCompetitor: topCompetitor ? `@${topCompetitor.username}` : null,
        audienceSignal: `Bu hafta kitlenin en çok ilgi gösterdiği konu: ${dominantTheme}. ${dominantFormat} formatı en yüksek etkileşimi aldı.`,
        totalPostsAnalyzed: allPosts.length,
        topInsights,
        overflowNotes: overflowNotes.length > 0 ? overflowNotes : null
      },
      contentPlanner: [
        t1 ? { day: 'Pazartesi', topic: t1.plannerTopic, format: t1.plannerFormat, status: 'Planlandı', outline: t1.plannerOutline, hook: t1.plannerHook, script: t1.plannerScript } : null,
        t2 ? { day: 'Çarşamba', topic: t2.plannerTopic, format: t2.plannerFormat, status: 'Taslak', outline: t2.plannerOutline, hook: t2.plannerHook, script: t2.plannerScript } : null,
        t3 ? { day: 'Cuma', topic: t3.plannerTopic, format: t3.plannerFormat, status: 'Fikir', outline: t3.plannerOutline, hook: t3.plannerHook, script: t3.plannerScript } : null,
      ].filter(Boolean)
    }
  };
}

// Core service exporter
async function runInstagramAnalysis(techNewsSummary = '') {
  const competitorHandles = (process.env.INSTAGRAM_COMPETITORS || 'nazlican_yoney,meshtimes,thedvlprl,morilliu,galinie_codes')
    .split(',')
    .map(c => c.trim())
    .filter(Boolean);

  const scrapedData = [];
  for (const handle of competitorHandles) {
    const data = await parseCompetitorProfile(handle);
    scrapedData.push(data);
  }

  // Try AI-powered generation if OpenRouter key is available
  if (process.env.OPENROUTER_API_KEY) {
    try {
      console.log('[Instagram] OpenRouter key found — using AI content generation');
      const { generateAIWeeklyContent } = require('./ai-content');
      const aiResult = await generateAIWeeklyContent(scrapedData);
      console.log('[Instagram] AI content generation successful');
      return aiResult;
    } catch (err) {
      console.error('[Instagram] AI generation failed, falling back to static templates:', err.message);
    }
  } else {
    console.log('[Instagram] No OpenRouter key — using static templates');
  }

  // Fallback: static template-based generation
  return generateTurkishStrategy(scrapedData);
}

module.exports = { runInstagramAnalysis };

