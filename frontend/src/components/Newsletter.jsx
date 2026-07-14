import React, { useState, useEffect } from 'react';
import { X, BookOpen, Clock, Tag, Check, CheckCircle2, Circle, ChevronLeft, ChevronRight, Eye, EyeOff, Star } from 'lucide-react';

// Read/star state now lives in the backend DB. This localStorage key is only
// read once to migrate marks made before the server-side switch, then removed.
const LEGACY_READ_KEY = 'nova_newsletter_read_v1';
const articleKey = (a) => String(a.id ?? a.link ?? a.title);

const PAGE_SIZE = 6; // 6 per page × 5 pages = up to 30 articles per category

// Helper to parse inline markdown bold (**bold**) and links ([text](url)) safely in React
function parseInlineMarkdown(text, baseKey) {
  if (!text) return '';
  
  const combinedRegex = /(\*\*.*?\*\*|\[.*?\]\(.*?\))/g;
  const parts = [];
  let currentIndex = 0;
  let match;
  
  const matches = [];
  while ((match = combinedRegex.exec(text)) !== null) {
    matches.push({
      text: match[0],
      index: match.index,
      length: match[0].length
    });
  }
  
  if (matches.length === 0) {
    return text;
  }
  
  matches.forEach((m, idx) => {
    // Add plain text before match
    if (m.index > currentIndex) {
      parts.push(text.substring(currentIndex, m.index));
    }
    
    const token = m.text;
    const tokenKey = `${baseKey}-${idx}`;
    if (token.startsWith('**') && token.endsWith('**')) {
      const boldText = token.slice(2, -2);
      parts.push(<strong key={`b-${tokenKey}`}>{boldText}</strong>);
    } else if (token.startsWith('[') && token.includes('](')) {
      const closeBracket = token.indexOf('](');
      const linkText = token.substring(1, closeBracket);
      const linkUrl = token.substring(closeBracket + 2, token.length - 1);
      parts.push(
        <a 
          key={`a-${tokenKey}`} 
          href={linkUrl} 
          target="_blank" 
          rel="noopener noreferrer" 
          style={{ color: 'var(--color-coral-dark)', textDecoration: 'underline', fontWeight: '500' }}
        >
          {linkText}
        </a>
      );
    }
    
    currentIndex = m.index + m.length;
  });
  
  if (currentIndex < text.length) {
    parts.push(text.substring(currentIndex));
  }
  
  return parts;
}

// A simple local Markdown parser to convert md syntax to HTML elements safely
function renderMarkdown(mdText) {
  if (!mdText) return '';
  const lines = mdText.split('\n');
  const elements = [];
  let inList = false;
  let listItems = [];

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    
    // Header 3
    if (trimmed.startsWith('### ')) {
      if (inList) {
        elements.push(<ul key={`list-${index}`} style={{ margin: '10px 0 16px 0' }}>{listItems}</ul>);
        inList = false;
        listItems = [];
      }
      elements.push(<h3 key={`h3-${index}`} style={{ fontSize: '18px', fontWeight: '700', marginTop: '18px', marginBottom: '8px', color: 'var(--text-main)' }}>{parseInlineMarkdown(trimmed.slice(4), `h3-${index}`)}</h3>);
    }
    // Header 2
    else if (trimmed.startsWith('## ')) {
      if (inList) {
        elements.push(<ul key={`list-${index}`} style={{ margin: '10px 0 16px 0' }}>{listItems}</ul>);
        inList = false;
        listItems = [];
      }
      elements.push(<h2 key={`h2-${index}`} style={{ fontFamily: 'var(--font-serif)', fontSize: '22px', fontWeight: '700', marginTop: '24px', marginBottom: '10px', color: 'var(--text-main)' }}>{parseInlineMarkdown(trimmed.slice(3), `h2-${index}`)}</h2>);
    }
    // Header 1
    else if (trimmed.startsWith('# ')) {
      if (inList) {
        elements.push(<ul key={`list-${index}`} style={{ margin: '10px 0 16px 0' }}>{listItems}</ul>);
        inList = false;
        listItems = [];
      }
      elements.push(<h1 key={`h1-${index}`} style={{ fontFamily: 'var(--font-serif)', fontSize: '28px', fontWeight: '700', marginTop: '28px', marginBottom: '14px', color: 'var(--text-main)' }}>{parseInlineMarkdown(trimmed.slice(2), `h1-${index}`)}</h1>);
    }
    // Bullet point
    else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      inList = true;
      listItems.push(<li key={`li-${index}`} style={{ marginLeft: '20px', marginBottom: '8px', listStyleType: 'disc', color: 'var(--text-main)', lineHeight: '1.5' }}>{parseInlineMarkdown(trimmed.slice(2), `li-${index}`)}</li>);
    }
    // Empty line
    else if (trimmed === '') {
      if (inList) {
        elements.push(<ul key={`list-${index}`} style={{ margin: '10px 0 16px 0' }}>{listItems}</ul>);
        inList = false;
        listItems = [];
      }
    }
    // Plain text paragraph
    else {
      if (inList) {
        elements.push(<ul key={`list-${index}`} style={{ margin: '10px 0 16px 0' }}>{listItems}</ul>);
        inList = false;
        listItems = [];
      }
      elements.push(
        <p key={`p-${index}`} style={{ marginBottom: '16px', lineHeight: '1.6', color: 'var(--text-main)' }}>
          {parseInlineMarkdown(trimmed, `p-${index}`)}
        </p>
      );
    }
  });

  if (inList) {
    elements.push(<ul key="list-final" style={{ margin: '10px 0 16px 0' }}>{listItems}</ul>);
  }

  return elements;
}

import { translations } from '../translations';

export default function Newsletter({ lang }) {
  const t = translations[lang] || translations.tr;
  const [articles, setArticles] = useState([]);
  const [selectedArticle, setSelectedArticle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showRead, setShowRead] = useState(false);
  const [pageByCat, setPageByCat] = useState({});

  useEffect(() => {
    // Prefer the DB-backed browse endpoint (many articles per category);
    // fall back to the legacy compiled digest if it is empty/unavailable.
    const loadLegacy = () =>
      fetch('/api/newsletter')
        .then(res => res.json())
        .then(d => setArticles(Array.isArray(d) ? d : []))
        .catch(err => console.error('Error fetching newsletter:', err));

    fetch('/api/newsletter/browse')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data) && data.length > 0) {
          // One-time migration: push read marks made before the server-side
          // switch (stored in localStorage) up to the backend, then drop the key.
          try {
            const legacy = new Set(JSON.parse(localStorage.getItem(LEGACY_READ_KEY) || '[]'));
            if (legacy.size > 0) {
              data = data.map(a => {
                if (!a.read && a.id && legacy.has(articleKey(a))) {
                  fetch('/api/newsletter/read', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: a.id, read: true })
                  }).catch(() => {});
                  return { ...a, read: true };
                }
                return a;
              });
              localStorage.removeItem(LEGACY_READ_KEY);
            }
          } catch { /* ignore migration errors */ }
          setArticles(data);
          return null;
        }
        return loadLegacy();
      })
      .catch(() => loadLegacy())
      .finally(() => setLoading(false));
  }, []);

  const toggleRead = (article) => {
    const next = !article.read;
    setArticles(prev => prev.map(a => (articleKey(a) === articleKey(article) ? { ...a, read: next } : a)));
    if (article.id) {
      fetch('/api/newsletter/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: article.id, read: next })
      }).catch(err => console.error('Error saving read state:', err));
    }
  };

  const toggleStar = (article) => {
    const next = !article.starred;
    setArticles(prev => prev.map(a => (articleKey(a) === articleKey(article) ? { ...a, starred: next } : a)));
    if (article.id) {
      fetch('/api/newsletter/star', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: article.id, starred: next })
      }).catch(err => console.error('Error saving star state:', err));
    }
  };

  const setPage = (cat, p) => setPageByCat(prev => ({ ...prev, [cat]: p }));

  const readCount = articles.reduce((n, a) => n + (a.read ? 1 : 0), 0);

  return (
    <div className="newsletter-container">
      <div className="newsletter-header">
        <h2>{t.techNewsletter}</h2>
        <p>{t.newsletterDesc}</p>
      </div>

      {!loading && articles.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
            {readCount} {t.readBadge.toLowerCase()}
          </span>
          <button
            onClick={() => setShowRead(s => !s)}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '6px 12px', borderRadius: '8px', cursor: 'pointer',
              fontSize: '13px', fontWeight: 600,
              border: '1px solid var(--border-card)',
              background: showRead ? 'var(--color-coral-dark)' : 'var(--bg-card)',
              color: showRead ? '#fff' : 'var(--text-main)'
            }}
          >
            {showRead ? <EyeOff size={14} /> : <Eye size={14} />}
            {showRead ? t.hideRead : t.showRead}
          </button>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
          {t.loadingNews}
        </div>
      ) : (
        (() => {
          // Group articles by category dynamically
          const groupedArticles = {};
          articles.forEach((article) => {
            const cat = article.category || t.technology;
            if (!groupedArticles[cat]) {
              groupedArticles[cat] = [];
            }
            groupedArticles[cat].push(article);
          });

          const categories = Object.keys(groupedArticles);

          if (categories.length === 0) {
            return (
              <div style={{ textAlign: 'center', padding: '40px', background: 'var(--bg-card)', border: '1px solid var(--border-card)', borderRadius: '12px', color: 'var(--text-muted)' }}>
                {t.noNewsSynced}
              </div>
            );
          }

          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
              {categories.map((categoryName) => {
                const all = groupedArticles[categoryName];
                // Hide read articles unless the user explicitly asks to see them
                const visible = showRead ? all : all.filter(a => !a.read);
                const totalPages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
                const page = Math.min(pageByCat[categoryName] || 0, totalPages - 1);
                const pageArticles = visible.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

                return (
                  <div key={categoryName} className="category-section">
                    <h3 style={{
                      fontFamily: 'var(--font-serif)',
                      fontSize: '18px',
                      fontWeight: '700',
                      marginBottom: '16px',
                      color: 'var(--text-main)',
                      borderBottom: '1px solid var(--border-card)',
                      paddingBottom: '8px',
                      textTransform: 'uppercase',
                      letterSpacing: '1px',
                      display: 'flex', alignItems: 'center', gap: '10px'
                    }}>
                      {categoryName}
                      <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', letterSpacing: 0, textTransform: 'none' }}>
                        {visible.length} {t.articlesSuffix}
                      </span>
                    </h3>

                    {visible.length === 0 ? (
                      <div style={{ padding: '24px', background: 'var(--bg-card)', border: '1px solid var(--border-card)', borderRadius: '12px', color: 'var(--text-muted)', textAlign: 'center', fontSize: '14px' }}>
                        {t.noUnreadNews}
                      </div>
                    ) : (
                      <>
                        <div className="article-grid">
                          {pageArticles.map((article) => {
                            const isRead = !!article.read;
                            const isStarred = !!article.starred;
                            return (
                              <div
                                className="article-card"
                                key={articleKey(article)}
                                onClick={() => setSelectedArticle(article)}
                                style={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '12px', position: 'relative', opacity: isRead ? 0.55 : 1 }}
                              >
                                <button
                                  onClick={(e) => { e.stopPropagation(); toggleStar(article); }}
                                  title={isStarred ? t.unstarArticle : t.starArticle}
                                  aria-label={isStarred ? t.unstarArticle : t.starArticle}
                                  style={{
                                    position: 'absolute', top: '10px', right: '46px', zIndex: 2,
                                    width: '30px', height: '30px', borderRadius: '50%',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    cursor: 'pointer',
                                    border: `1px solid ${isStarred ? 'var(--color-gold-dark, #C98A22)' : 'var(--border-card)'}`,
                                    background: isStarred ? '#FBF0DF' : 'var(--bg-card)',
                                    color: isStarred ? 'var(--color-gold-dark, #C98A22)' : 'var(--text-muted)'
                                  }}
                                >
                                  <Star size={15} fill={isStarred ? 'currentColor' : 'none'} />
                                </button>
                                <button
                                  onClick={(e) => { e.stopPropagation(); toggleRead(article); }}
                                  title={isRead ? t.markUnread : t.markRead}
                                  aria-label={isRead ? t.markUnread : t.markRead}
                                  style={{
                                    position: 'absolute', top: '10px', right: '10px', zIndex: 2,
                                    width: '30px', height: '30px', borderRadius: '50%',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    cursor: 'pointer',
                                    border: `1px solid ${isRead ? 'var(--color-coral-dark)' : 'var(--border-card)'}`,
                                    background: isRead ? 'var(--color-coral-dark)' : 'var(--bg-card)',
                                    color: isRead ? '#fff' : 'var(--text-muted)'
                                  }}
                                >
                                  {isRead ? <CheckCircle2 size={16} /> : <Circle size={16} />}
                                </button>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingRight: '66px' }}>
                                  <div className="article-meta">
                                    <span className="article-category">
                                      {article.category || t.technology}
                                    </span>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                      <Clock size={12} />
                                      {article.date}
                                    </span>
                                  </div>
                                  <h3 className="article-title">{article.title}</h3>
                                  <p className="article-summary" style={{
                                    overflow: 'hidden',
                                    display: '-webkit-box',
                                    WebkitLineClamp: 3,
                                    WebkitBoxOrient: 'vertical'
                                  }}>
                                    {article.summary}
                                  </p>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                                  <div className="article-readmore">
                                    <BookOpen size={14} />
                                    {t.readArticle}
                                  </div>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); toggleRead(article); }}
                                    style={{
                                      display: 'flex', alignItems: 'center', gap: '5px',
                                      padding: '4px 10px', borderRadius: '6px', cursor: 'pointer',
                                      fontSize: '12px', fontWeight: 600,
                                      border: '1px solid var(--border-card)',
                                      background: 'transparent',
                                      color: isRead ? 'var(--color-coral-dark)' : 'var(--text-muted)'
                                    }}
                                  >
                                    {isRead ? <CheckCircle2 size={13} /> : <Check size={13} />}
                                    {isRead ? t.readBadge : t.markRead}
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {totalPages > 1 && (
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px', marginTop: '18px' }}>
                            <button
                              onClick={() => setPage(categoryName, Math.max(0, page - 1))}
                              disabled={page === 0}
                              style={{
                                display: 'flex', alignItems: 'center', gap: '4px',
                                padding: '6px 12px', borderRadius: '8px',
                                border: '1px solid var(--border-card)', background: 'var(--bg-card)',
                                color: 'var(--text-main)', fontSize: '13px', fontWeight: 600,
                                cursor: page === 0 ? 'not-allowed' : 'pointer', opacity: page === 0 ? 0.4 : 1
                              }}
                            >
                              <ChevronLeft size={16} /> {t.prevPage}
                            </button>
                            <span style={{ fontSize: '13px', color: 'var(--text-muted)', fontWeight: 600 }}>
                              {t.pageLabel} {page + 1} / {totalPages}
                            </span>
                            <button
                              onClick={() => setPage(categoryName, Math.min(totalPages - 1, page + 1))}
                              disabled={page >= totalPages - 1}
                              style={{
                                display: 'flex', alignItems: 'center', gap: '4px',
                                padding: '6px 12px', borderRadius: '8px',
                                border: '1px solid var(--border-card)', background: 'var(--bg-card)',
                                color: 'var(--text-main)', fontSize: '13px', fontWeight: 600,
                                cursor: page >= totalPages - 1 ? 'not-allowed' : 'pointer', opacity: page >= totalPages - 1 ? 0.4 : 1
                              }}
                            >
                              {t.nextPage} <ChevronRight size={16} />
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })()
      )}

      {/* Reader Modal */}
      {selectedArticle && (
        <div className="modal-overlay" onClick={() => setSelectedArticle(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setSelectedArticle(null)}>
              <X size={20} />
            </button>
            <div className="article-meta" style={{ borderBottom: '1px solid var(--border-card)', paddingBottom: '12px' }}>
              <span className="article-category" style={{ fontSize: '14px', fontWeight: '600' }}>
                {selectedArticle.category}
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px' }}>
                <Clock size={14} />
                {selectedArticle.date}
              </span>
            </div>
            <h2 className="card-title" style={{ fontSize: '28px', lineHeight: '1.2', color: 'var(--text-main)', marginTop: '8px' }}>
              {selectedArticle.title}
            </h2>
            <div className="modal-body">
              {renderMarkdown(selectedArticle.content)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
