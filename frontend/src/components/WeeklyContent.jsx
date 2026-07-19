import React, { useState, useEffect, useRef } from 'react';
import {
  Eye, Heart, MessageCircle, PlayCircle, CalendarRange, Flame,
  ChevronDown, ChevronUp, TrendingUp, Lightbulb, Zap, BookOpen,
  ArrowRight, Sparkles, AlertTriangle, Clock,
  Plus, Trash2, Edit3, Check, X, Calendar, RotateCcw,
  ChevronLeft, ChevronRight, Repeat, Bell, ArrowRightCircle
} from 'lucide-react';

// ── Hafta yardımcıları ───────────────────────────────────────────────────────
// Tüm hafta hesapları Pazartesi-başlangıçlı. offset: 0 = bu hafta, -1 = geçen,
// +1 = gelecek. Yerel saat diliminde çalışır (tarih string'leri YYYY-MM-DD).
const TR_DAYS = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];

const toDateStr = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const parseDateStr = (s) => {
  const [y, m, d] = s.split('-');
  return new Date(Number(y), Number(m) - 1, Number(d));
};

// Verilen offset için o haftanın Pazartesi ve Pazar tarihlerini döndürür.
const getWeekRange = (offset = 0) => {
  const today = new Date();
  const day = today.getDay();
  const diff = today.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(today);
  monday.setDate(diff + offset * 7);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return { monday, sunday };
};

// Bir item'ın verilen offset haftasında o haftanın hangi tarihine düştüğünü
// (recurring materializasyonu ve carry-over için) hesaplar. dayName Türkçe.
const dateForWeekday = (offset, dayName) => {
  const { monday } = getWeekRange(offset);
  const idx = TR_DAYS.indexOf(dayName); // 0=Pazar..6=Cumartesi
  // Pazartesi-başlangıçlı ofset: Pazartesi=0 ... Pazar=6
  const monBasedIdx = idx === 0 ? 6 : idx - 1;
  const d = new Date(monday);
  d.setDate(monday.getDate() + monBasedIdx);
  return toDateStr(d);
};

const DONE_STATUSES = ['published', 'yayında', 'yayinlandi', 'yayınlandı', 'done', 'tamamlandı', 'tamamlandi', 'completed'];
const isDoneItem = (item) =>
  item.checked === true || DONE_STATUSES.includes(String(item.status || '').toLowerCase().trim());

const DAYS_OF_WEEK = [
  { value: 'Pazartesi', label: 'Pazartesi' },
  { value: 'Salı', label: 'Salı' },
  { value: 'Çarşamba', label: 'Çarşamba' },
  { value: 'Perşembe', label: 'Perşembe' },
  { value: 'Cuma', label: 'Cuma' },
  { value: 'Cumartesi', label: 'Cumartesi' },
  { value: 'Pazar', label: 'Pazar' }
];

const truncateText = (text, maxLength = 30) => {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
};

import { translations } from '../translations';

const getDayLabel = (dayName, lang) => {
  if (!dayName) return '';
  const trToEn = {
    'Pazartesi': 'Monday', 'Salı': 'Tuesday', 'Çarşamba': 'Wednesday', 'Perşembe': 'Thursday',
    'Cuma': 'Friday', 'Cumartesi': 'Saturday', 'Pazar': 'Sunday',
    'Monday': 'Monday', 'Tuesday': 'Tuesday', 'Wednesday': 'Wednesday', 'Thursday': 'Thursday',
    'Friday': 'Friday', 'Saturday': 'Saturday', 'Sunday': 'Sunday'
  };
  return trToEn[dayName] || dayName;
};

export default function WeeklyContent({ lang, weeklyData, aiEnabled = false, onRefresh }) {
  const t = translations[lang] || translations.en;
  const [expandedDay, setExpandedDay] = useState(null);
  const [expandedInsight, setExpandedInsight] = useState(null);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiError, setAiError] = useState(null);

  // Brainstorm states
  const [newTitle, setNewTitle] = useState('');
  const [newHook, setNewHook] = useState('');
  const [newDetails, setNewDetails] = useState('');
  const [newScript, setNewScript] = useState('');
  const [newFormat, setNewFormat] = useState('Reels');
  const [videoUrl, setVideoUrl] = useState('');
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcribeError, setTranscribeError] = useState(null);
  const [selectedScript, setSelectedScript] = useState(null);
  const [activeFormatFilter, setActiveFormatFilter] = useState('All');
  const [draggedId, setDraggedId] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);
  
  const [editingId, setEditingId] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [editHook, setEditHook] = useState('');
  const [editDetails, setEditDetails] = useState('');
  const [editScript, setEditScript] = useState('');
  const [editFormat, setEditFormat] = useState('Reels');
  
  const [convertingId, setConvertingId] = useState(null);

  // Hafta navigasyonu: 0 = bu hafta, -1 geçen, +1 gelecek.
  const [weekOffset, setWeekOffset] = useState(0);
  // Otomatik carry-over sonrası kullanıcıya gösterilecek bilgi satırı.
  const [carryOverToast, setCarryOverToast] = useState(null);
  // Aynı oturumda carry-over ve bildirim izin akışının bir kez çalışması için.
  const carriedOverRef = useRef(false);
  const notifiedRef = useRef(new Set());

  // Effect'ler için planner referansı — Hook kuralları gereği erken-return'den
  // ÖNCE tanımlanmalı (weeklyData null olabilir, o yüzden güvenli erişim).
  const plannerForEffects = weeklyData?.contentPlanner;

  // ── Otomatik carry-over ──────────────────────────────────────────────────
  // Uygulama açılıp planner geldiğinde bir kez çalışır: bu haftadan ÖNCEKİ
  // tarihli, tamamlanmamış (ne checked ne de "yayında/done") içerik item'larını
  // bu haftanın aynı hafta-gününe sessizce taşır. Görevler (task) hariç.
  useEffect(() => {
    if (carriedOverRef.current) return;
    if (!plannerForEffects || plannerForEffects.length === 0) return;

    const { monday: thisMonday } = getWeekRange(0);
    const stale = plannerForEffects.filter(item => {
      if (item.type === 'task') return false;
      if (item.recurring === 'weekly') return false; // şablonlar taşınmaz
      if (!item.date) return false;                  // tarihsiz zaten bu hafta
      if (isDoneItem(item)) return false;
      return parseDateStr(item.date) < thisMonday;
    });

    if (stale.length === 0) {
      carriedOverRef.current = true;
      return;
    }

    carriedOverRef.current = true; // tekrar tetiklenmesin
    (async () => {
      let moved = 0;
      for (const item of stale) {
        const newDate = dateForWeekday(0, item.day || TR_DAYS[parseDateStr(item.date).getDay()]);
        try {
          const res = await fetch('/api/weekly-content/planner', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...item, date: newDate, carriedOverAt: new Date().toISOString() })
          });
          if (res.ok) moved++;
        } catch (err) {
          console.error('Carry-over failed for item', item.id, err);
        }
      }
      if (moved > 0) {
        const label = (translations[lang] || translations.en).carriedOverToast;
        setCarryOverToast(`${moved} ${label}`);
        setTimeout(() => setCarryOverToast(null), 6000);
        if (onRefresh) await onRefresh(true);
      }
    })();
  }, [plannerForEffects]);

  // ── Tarayıcı bildirimi (uygulama açıkken) ────────────────────────────────
  // `time` alanı dolu, bugüne tarihli, tamamlanmamış item'lar için; planlanan
  // dakika geldiğinde (uygulama açıksa) bir Notification gösterir. Kapalıyken
  // bildirim (push) bu sürümde yoktur — Service Worker gerektirir.
  useEffect(() => {
    if (typeof Notification === 'undefined') return;
    if (Notification.permission === 'default') {
      // İlk yüklemede izin iste (kullanıcı reddederse sessizce devre dışı kalır).
      Notification.requestPermission().catch(() => {});
    }
    if (Notification.permission !== 'granted') return;

    const checkReminders = () => {
      const now = new Date();
      const todayStr = toDateStr(now);
      const fallbackTitle = (translations[lang] || translations.en).reminderFallbackTitle;
      (plannerForEffects || []).forEach(item => {
        if (item.type === 'task') return;
        if (!item.time || !item.date) return;
        if (item.date !== todayStr) return;
        if (isDoneItem(item)) return;
        const [hh, mm] = String(item.time).split(':').map(Number);
        if (Number.isNaN(hh)) return;
        const target = new Date(now);
        target.setHours(hh, mm || 0, 0, 0);
        const diffMin = (target - now) / 60000;
        const key = `${item.id}-${item.date}`;
        // Planlanan dakikaya 0–1 dk kala, bir kez tetikle.
        if (diffMin <= 1 && diffMin >= 0 && !notifiedRef.current.has(key)) {
          notifiedRef.current.add(key);
          try {
            new Notification(`📅 ${item.topic || fallbackTitle}`, {
              body: `${item.time} · ${item.format || ''} ${item.hook ? '— ' + item.hook : ''}`.trim(),
            });
          } catch (e) { /* yok say */ }
        }
      });
    };

    checkReminders();
    const interval = setInterval(checkReminders, 30000); // 30 sn'de bir kontrol
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plannerForEffects, lang]);

  if (!weeklyData) return null;

  const { instagramAnalyzed, contentPlanner, weeklyDigest } = weeklyData;
  const brainstormIdeas = weeklyData.brainstormIdeas || [];

  const { monday, sunday } = getWeekRange(weekOffset);
  const isCurrentWeek = weekOffset === 0;

  // Seçili haftanın (Pzt–Paz) içeriğini üret. Üç kaynak birleşir:
  //  1) O haftaya tarihli gerçek planner item'ları.
  //  2) Yalnızca bu hafta görünen tarihsiz gün-adı item'ları (legacy/AI).
  //  3) `recurring: 'weekly'` item'larından, o hafta karşılığı yoksa
  //     görüntüde üretilen (materialize) kopyalar — düzenlenince gerçek olur.
  const plannerThisWeek = (() => {
    const base = (contentPlanner || []).filter(item => {
      if (item.type === 'task') return false;
      if (!item.date) return isCurrentWeek; // tarihsiz item sadece bu hafta
      const itemDate = parseDateStr(item.date);
      return itemDate >= monday && itemDate <= sunday;
    });

    // Recurring şablonlarını materialize et (bu haftada tarihli karşılığı yoksa).
    const recurringTemplates = (contentPlanner || []).filter(
      item => item.recurring === 'weekly' && item.type !== 'task'
    );
    const virtual = [];
    for (const tmpl of recurringTemplates) {
      const targetDate = dateForWeekday(weekOffset, tmpl.recurDay || tmpl.day || 'Pazartesi');
      const alreadyReal = base.some(
        b => b.date === targetDate || b.recurOriginId === tmpl.id || b.id === tmpl.id
      );
      // Şablonun kendisi bu haftaya tarihliyse ikinci kez ekleme.
      if (tmpl.date === targetDate) continue;
      if (!alreadyReal) {
        virtual.push({
          ...tmpl,
          id: `virtual-${tmpl.id}-${targetDate}`,
          date: targetDate,
          day: tmpl.recurDay || tmpl.day,
          status: 'Planlandı',
          checked: false,
          isVirtualRecurring: true,
          recurOriginId: tmpl.id,
        });
      }
    }

    const combined = [...base, ...virtual];
    // Gün sırasına göre sırala (Pazartesi → Pazar).
    return combined.sort((a, b) => {
      const da = a.date ? parseDateStr(a.date).getTime() : 0;
      const db = b.date ? parseDateStr(b.date).getTime() : 0;
      return da - db;
    });
  })();

  const fmtShort = (d) => `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`;
  const weekRangeLabel = `${fmtShort(monday)} – ${fmtShort(sunday)}`;
  const weekTitle = weekOffset === 0 ? t.thisWeek : weekOffset === -1 ? t.lastWeek : weekOffset === 1 ? t.nextWeek : `${weekOffset > 0 ? '+' : ''}${weekOffset} ${t.weeksLabel}`;
  const displayedIdeas = activeFormatFilter === 'All' 
    ? brainstormIdeas 
    : brainstormIdeas.filter(idea => idea.format === activeFormatFilter);

  // ── Brainstorm handlers ────────────────────────────────────────────────────
  const handleAddIdea = async (e) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    try {
      const res = await fetch('/api/weekly-content/brainstorm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newTitle,
          hook: newHook,
          details: newDetails,
          script: newScript,
          format: newFormat
        })
      });
      if (res.ok) {
        setNewTitle('');
        setNewHook('');
        setNewDetails('');
        setNewScript('');
        setNewFormat('Reels');
        if (onRefresh) await onRefresh(true);
      }
    } catch (err) {
      console.error('Error adding brainstorm idea:', err);
    }
  };

  const handleUpdateIdea = async (id) => {
    if (!editTitle.trim()) return;
    try {
      const res = await fetch('/api/weekly-content/brainstorm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          title: editTitle,
          hook: editHook,
          details: editDetails,
          script: editScript,
          format: editFormat
        })
      });
      if (res.ok) {
        setEditingId(null);
        if (onRefresh) await onRefresh(true);
      }
    } catch (err) {
      console.error('Error updating brainstorm idea:', err);
    }
  };

  const handleDeleteIdea = async (id) => {
    if (!window.confirm(t.confirmDeleteIdea)) return;
    try {
      const res = await fetch('/api/weekly-content/brainstorm/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      });
      if (res.ok) {
        if (onRefresh) await onRefresh(true);
      }
    } catch (err) {
      console.error('Error deleting brainstorm idea:', err);
    }
  };

  const handleConvertToPlanner = async (idea, dateStr) => {
    try {
      const resPlanner = await fetch('/api/weekly-content/planner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: Date.now().toString(),
          date: dateStr,
          topic: idea.title,
          format: idea.format,
          hook: idea.hook || '',
          outline: idea.details || idea.description || '',
          script: idea.script || '',
          status: 'Planlandı',
          isManual: true,
          type: 'content'
        })
      });
      
      if (!resPlanner.ok) throw new Error('Planner save failed');
      
      const resDelete = await fetch('/api/weekly-content/brainstorm/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: idea.id })
      });
      
      if (!resDelete.ok) throw new Error('Brainstorm delete failed');
      
      setConvertingId(null);
      if (onRefresh) await onRefresh(true);
    } catch (err) {
      console.error('Error converting brainstorm idea to planner:', err);
    }
  };

  // Bir planner item'ını haftalık tekrar şablonuna çevir / şablonu kapat.
  // Virtual (henüz kaydedilmemiş) recurring kopyayı önce gerçek item yapıp
  // şablon olarak işaretler.
  const handleToggleRecurring = async (plannerItem) => {
    // Virtual (henüz kaydedilmemiş) recurring kopya için işlem, onu üreten
    // GERÇEK şablonu hedeflemeli — yoksa yeni bir kopya yaratılır ve şablon
    // olduğu gibi kalır.
    if (plannerItem.isVirtualRecurring) {
      const origin = (contentPlanner || []).find(p => p.id === plannerItem.recurOriginId);
      if (!origin) return;
      const payload = { ...origin, recurring: null, recurDay: null };
      try {
        const res = await fetch('/api/weekly-content/planner', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (res.ok && onRefresh) await onRefresh(true);
      } catch (err) {
        console.error('Error toggling recurring (virtual):', err);
      }
      return;
    }

    const willRecur = !(plannerItem.recurring === 'weekly');
    const payload = {
      ...plannerItem,
      recurring: willRecur ? 'weekly' : null,
      recurDay: willRecur ? (plannerItem.day || null) : null,
    };
    try {
      const res = await fetch('/api/weekly-content/planner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok && onRefresh) await onRefresh(true);
    } catch (err) {
      console.error('Error toggling recurring:', err);
    }
  };

  const handleRevertToBrainstorm = async (plannerItem) => {
    if (!window.confirm(t.confirmRevert)) return;
    try {
      const res = await fetch('/api/weekly-content/planner/revert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: plannerItem.id })
      });
      if (res.ok) {
        if (onRefresh) await onRefresh(true);
      }
    } catch (err) {
      console.error('Error reverting planner item to brainstorm:', err);
    }
  };

  const handleTranscribeAndRewrite = async (e) => {
    e.preventDefault();
    if (!videoUrl.trim()) return;
    setIsTranscribing(true);
    setTranscribeError(null);
    try {
      const res = await fetch('/api/weekly-content/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: videoUrl })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Transcription failed.');
      }
      if (data.success && data.transcription) {
        setNewScript(data.transcription);
        setNewTitle('Video Transcription (' + new Date().toLocaleDateString('en-US') + ')');
        setVideoUrl('');
      }
    } catch (err) {
      console.error('Error transcribing:', err);
      setTranscribeError(err.message);
    } finally {
      setIsTranscribing(false);
    }
  };

  const handleMoveIdea = async (ideaId, direction) => {
    const filteredIdx = displayedIdeas.findIndex(item => item.id === ideaId);
    if (filteredIdx === -1) return;
    
    const targetFilteredIdx = filteredIdx + direction;
    if (targetFilteredIdx < 0 || targetFilteredIdx >= displayedIdeas.length) return;
    
    const currentIdea = displayedIdeas[filteredIdx];
    const targetIdea = displayedIdeas[targetFilteredIdx];
    
    const globalIdx = brainstormIdeas.findIndex(item => item.id === currentIdea.id);
    const targetGlobalIdx = brainstormIdeas.findIndex(item => item.id === targetIdea.id);
    
    if (globalIdx === -1 || targetGlobalIdx === -1) return;
    
    const reorderedIdeas = [...brainstormIdeas];
    const temp = reorderedIdeas[globalIdx];
    reorderedIdeas[globalIdx] = reorderedIdeas[targetGlobalIdx];
    reorderedIdeas[targetGlobalIdx] = temp;
    
    try {
      const res = await fetch('/api/weekly-content/brainstorm/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ideas: reorderedIdeas })
      });
      if (res.ok) {
        if (onRefresh) await onRefresh(true);
      }
    } catch (err) {
      console.error('Error reordering ideas:', err);
    }
  };

  const handleDragStart = (e, ideaId) => {
    setDraggedId(ideaId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', ideaId);
  };

  const handleDragOver = (e, ideaId) => {
    e.preventDefault();
    if (dragOverId !== ideaId) {
      setDragOverId(ideaId);
    }
  };

  const handleDrop = async (e, targetId) => {
    e.preventDefault();
    const sourceId = e.dataTransfer.getData('text/plain') || draggedId;
    setDraggedId(null);
    setDragOverId(null);
    
    if (!sourceId || sourceId === targetId) return;
    
    const draggedGlobalIdx = brainstormIdeas.findIndex(item => item.id === sourceId);
    const targetGlobalIdx = brainstormIdeas.findIndex(item => item.id === targetId);
    
    if (draggedGlobalIdx === -1 || targetGlobalIdx === -1) return;
    
    const reorderedIdeas = [...brainstormIdeas];
    const [draggedItem] = reorderedIdeas.splice(draggedGlobalIdx, 1);
    reorderedIdeas.splice(targetGlobalIdx, 0, draggedItem);
    
    try {
      const res = await fetch('/api/weekly-content/brainstorm/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ideas: reorderedIdeas })
      });
      if (res.ok) {
        if (onRefresh) await onRefresh(true);
      }
    } catch (err) {
      console.error('Error reordering ideas via drag-and-drop:', err);
    }
  };

  const handleDragEnd = () => {
    setDraggedId(null);
    setDragOverId(null);
  };

  const toggleDay = (day) => setExpandedDay(expandedDay === day ? null : day);
  const toggleInsight = (rank) => setExpandedInsight(expandedInsight === rank ? null : rank);

  // ── AI Generate handler ───────────────────────────────────────────────────
  const handleAIGenerate = async () => {
    setAiGenerating(true);
    setAiError(null);
    try {
      const res = await fetch('/api/ai-generate', { method: 'POST' });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'AI generation failed');
      }
      if (onRefresh) await onRefresh();
    } catch (e) {
      console.error('AI generate error:', e);
      setAiError(e.message);
    } finally {
      setAiGenerating(false);
    }
  };

  const techAlerts = (weeklyDigest?.techAlerts || []);

  return (
    <div className="weekly-container">
      {/* ── Weekly Content Planner ─────────────────────────────────────────── */}
      <div className="influencer-section">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <CalendarRange size={20} style={{ color: 'var(--color-coral-dark)' }} />
            <h2 className="card-title" style={{ fontSize: '24px' }}>{t.weeklyPlanner}</h2>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {/* ── Hafta navigasyonu ── */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--bg-card)', border: '1px solid var(--border-card)', borderRadius: '20px', padding: '4px 6px' }}>
              <button
                onClick={() => setWeekOffset(weekOffset - 1)}
                title={t.prevWeek}
                style={{ display: 'flex', alignItems: 'center', border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-muted)', padding: '4px', borderRadius: '50%' }}
              >
                <ChevronLeft size={16} />
              </button>
              <div style={{ textAlign: 'center', minWidth: '120px', lineHeight: 1.2 }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: isCurrentWeek ? 'var(--color-coral-dark)' : 'var(--text-main)' }}>{weekTitle}</div>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{weekRangeLabel}</div>
              </div>
              <button
                onClick={() => setWeekOffset(weekOffset + 1)}
                title={t.nextWeekBtn}
                style={{ display: 'flex', alignItems: 'center', border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-muted)', padding: '4px', borderRadius: '50%' }}
              >
                <ChevronRight size={16} />
              </button>
              {!isCurrentWeek && (
                <button
                  onClick={() => setWeekOffset(0)}
                  title={t.backToThisWeek}
                  style={{ fontSize: '10px', fontWeight: 700, border: 'none', background: 'var(--color-coral-dark)', color: 'white', cursor: 'pointer', padding: '4px 8px', borderRadius: '12px' }}
                >
                  {t.today}
                </button>
              )}
            </div>
            {/* AI üretimi yalnızca 'ai' özelliği açıkken görünür (aksi halde
                endpoint 503 döner). Kapalıysa buton hiç render edilmez. */}
            {aiEnabled && aiError && (
               <span style={{ fontSize: '11px', color: '#C0392B', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                ⚠️ {aiError}
              </span>
            )}
            {aiEnabled && (
            <button
               onClick={handleAIGenerate}
               disabled={aiGenerating}
               style={{
                 display: 'flex', alignItems: 'center', gap: '6px',
                 padding: '7px 14px', borderRadius: '20px', border: 'none',
                 cursor: aiGenerating ? 'wait' : 'pointer',
                 background: aiGenerating
                   ? 'rgba(138, 92, 246, 0.4)'
                   : 'linear-gradient(135deg, #8B5CF6 0%, #6D28D9 100%)',
                 color: 'white', fontSize: '12px', fontWeight: '600',
                 boxShadow: '0 2px 8px rgba(138, 92, 246, 0.25)',
                 transition: 'all 0.2s ease', whiteSpace: 'nowrap'
               }}
            >
              <Sparkles size={13} style={{ animation: aiGenerating ? 'spin 1.5s linear infinite' : 'none' }} />
              {aiGenerating ? t.aiGenerating : t.aiGenerate}
            </button>
            )}
          </div>
        </div>

        {carryOverToast && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px',
            padding: '10px 14px', borderRadius: '10px',
            background: 'rgba(52, 168, 83, 0.12)', border: '1px solid rgba(52, 168, 83, 0.35)',
            color: '#1E7E34', fontSize: '13px', fontWeight: 600
          }}>
            <ArrowRightCircle size={16} />
            {carryOverToast}
          </div>
        )}

        <div className="planner-grid">
          {plannerThisWeek.map((dayPlan, idx) => {
            const isExpanded = expandedDay === (dayPlan.day || dayPlan.date || idx);
            const dayKey = dayPlan.day || dayPlan.date || idx;
            return (
              <div
                 className="planner-day-row"
                 key={idx}
                 onClick={() => toggleDay(dayKey)}
                 style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '12px', transition: 'var(--transition-smooth)' }}
              >
                <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr', gap: '16px', width: '100%', alignItems: 'flex-start' }}>
                  <div className="planner-day-name" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {getDayLabel(dayPlan.day, lang) || dayPlan.date}
                    {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </div>
                  <div className="planner-day-content" style={{ width: '100%' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                      <span className="planner-day-title" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {dayPlan.topic || dayPlan.title}
                        {(dayPlan.recurring === 'weekly' || dayPlan.isVirtualRecurring) && (
                          <span title={t.recurringWeekly} style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '10px', fontWeight: 700, color: '#8B5CF6', background: 'rgba(139,92,246,0.12)', padding: '1px 6px', borderRadius: '8px' }}>
                            <Repeat size={10} /> {t.recurringBadge}
                          </span>
                        )}
                        {dayPlan.carriedOverAt && (
                          <span title={t.carriedOverBadgeTip} style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '10px', fontWeight: 700, color: '#1E7E34', background: 'rgba(52,168,83,0.12)', padding: '1px 6px', borderRadius: '8px' }}>
                            <ArrowRightCircle size={10} /> {t.carriedOverBadge}
                          </span>
                        )}
                        {dayPlan.time && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)' }}>
                            <Clock size={10} /> {dayPlan.time}
                          </span>
                        )}
                      </span>
                      <div className="planner-meta">
                        <span className="planner-format">{dayPlan.format}</span>
                        <span className="planner-status">· {dayPlan.status}</span>
                      </div>
                    </div>
                    {dayPlan.outline && <p className="planner-day-outline">{dayPlan.outline}</p>}
                  </div>
                </div>

                {isExpanded && (
                  <div
                     className="planner-expanded-details"
                     onClick={(e) => e.stopPropagation()}
                     style={{
                       marginTop: '4px', padding: '16px',
                       background: 'rgba(228, 209, 203, 0.15)', borderRadius: '8px',
                       borderLeft: '4px solid var(--color-coral-dark)', width: '100%', boxSizing: 'border-box'
                     }}
                  >
                    <div style={{ marginBottom: '16px' }}>
                      <strong style={{ fontSize: '12px', color: 'var(--color-coral-dark)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '6px' }}>
                        Kanca (Hook)
                      </strong>
                      <p style={{ margin: 0, fontSize: '14px', fontStyle: 'italic', color: 'var(--text-main)', lineHeight: '1.4' }}>
                        "{dayPlan.hook || t.noHookSpecified}"
                      </p>
                    </div>
                    <div>
                      <strong style={{ fontSize: '12px', color: 'var(--color-coral-dark)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '6px' }}>
                        Video Akışı & Senaryo (Script)
                      </strong>
                      <p style={{ margin: 0, fontSize: '14px', whiteSpace: 'pre-line', color: 'var(--text-main)', lineHeight: '1.7' }}>
                        {dayPlan.script || t.noScriptSpecified}
                      </p>
                      {dayPlan.script && (
                        <div style={{ marginTop: '10px', fontSize: '11px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Clock size={11} />
                          ~{Math.round(dayPlan.script.trim().split(/\s+/).length / 150)} {t.speechDuration}
                          · {dayPlan.script.trim().split(/\s+/).length} {t.words}
                        </div>
                      )}
                    </div>
                    
                    {/* Action buttons: recurring toggle + revert to brainstorm */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', borderTop: '1px dashed rgba(183, 157, 148, 0.25)', paddingTop: '12px', gap: '8px', flexWrap: 'wrap' }}>
                      <button
                         onClick={() => handleToggleRecurring(dayPlan)}
                         title={t.recurringToggleTip}
                         style={{
                           display: 'flex', alignItems: 'center', gap: '6px',
                           padding: '6px 12px', borderRadius: '8px',
                           border: `1px solid ${(dayPlan.recurring === 'weekly') ? '#8B5CF6' : 'rgba(139,92,246,0.4)'}`,
                           background: (dayPlan.recurring === 'weekly') ? 'rgba(139,92,246,0.12)' : 'transparent',
                           color: '#8B5CF6', fontSize: '11.5px', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s'
                         }}
                      >
                        <Repeat size={12} />
                        {(dayPlan.recurring === 'weekly') ? t.recurringOn : t.makeRecurring}
                      </button>
                      {!dayPlan.isVirtualRecurring && (
                        <button
                           onClick={() => handleRevertToBrainstorm(dayPlan)}
                           style={{
                             display: 'flex',
                             alignItems: 'center',
                             gap: '6px',
                             padding: '6px 12px',
                             borderRadius: '8px',
                             border: '1px solid rgba(183, 157, 148, 0.4)',
                             background: 'transparent',
                             color: 'var(--text-muted)',
                             fontSize: '11.5px',
                             fontWeight: '600',
                             cursor: 'pointer',
                             transition: 'all 0.2s'
                           }}
                           onMouseEnter={(e) => {
                             e.currentTarget.style.background = 'rgba(183, 157, 148, 0.1)';
                             e.currentTarget.style.color = 'var(--text-main)';
                           }}
                           onMouseLeave={(e) => {
                             e.currentTarget.style.background = 'transparent';
                             e.currentTarget.style.color = 'var(--text-muted)';
                           }}
                        >
                          <RotateCcw size={12} />
                          {t.removeFromPlanner}
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {plannerThisWeek.length === 0 && (
            <div style={{ textAlign: 'center', padding: '24px', background: 'var(--bg-card)', borderRadius: '12px', border: '1px solid var(--border-card)', color: 'var(--text-muted)' }}>
              {isCurrentWeek ? t.noContentPlanned : t.noContentThisWeek}
            </div>
          )}
        </div>
      </div>

      {/* ── Canvas (Brainstorming & Ideas Zone) ────────────────────────────── */}
      <div className="influencer-section" style={{ marginTop: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Lightbulb size={22} style={{ color: 'var(--color-gold-dark)' }} />
            <h2 className="card-title" style={{ fontSize: '24px' }}>{t.canvasTitle}</h2>
            <span style={{ fontSize: '12px', background: 'rgba(210,160,50,0.15)', color: 'var(--color-gold-dark)', padding: '2px 8px', borderRadius: '10px', fontWeight: '600' }}>
              {brainstormIdeas.length} {t.ideasCount}
            </span>
          </div>
        </div>

        <p style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '16px', marginTop: '-8px' }}>
          {t.canvasDesc}
        </p>

        {/* Add Idea Form */}
        <form onSubmit={handleAddIdea} className="brainstorm-form" style={{
          background: 'var(--bg-card)', border: '1px solid var(--border-card)',
          borderRadius: '12px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px',
          boxShadow: 'var(--shadow-sm)', marginBottom: '24px'
        }}>
          <h3 style={{ margin: '0 0 4px 0', fontSize: '15px', fontWeight: '700', color: 'var(--text-main)' }}>
            💡 {t.addNewIdea}
          </h3>
          
          {/* Video URL Transcription & Rewrite Widget — 'ai' özelliği (Whisper +
              OpenRouter) açıkken görünür; kapalı deploy'da endpoint 503 döner. */}
          {aiEnabled && (
          <div style={{
            background: 'var(--bg-app)', border: '1.5px dashed var(--border-card)',
            borderRadius: '10px', padding: '14px', marginBottom: '8px',
            boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.02)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
              <PlayCircle size={15} style={{ color: 'var(--color-coral-dark)' }} />
              <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-main)' }}>
                {t.whisperWidgetTitle}
              </span>
            </div>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                type="text"
                placeholder={t.whisperInputPlaceholder}
                value={videoUrl}
                onChange={e => setVideoUrl(e.target.value)}
                style={{
                  flex: 1, minWidth: '240px', padding: '8px 12px', borderRadius: '6px',
                  border: '1px solid var(--border-card)', background: 'var(--bg-card)',
                  color: 'var(--text-main)', fontSize: '13px', boxSizing: 'border-box'
                }}
              />
              <button
                type="button"
                onClick={handleTranscribeAndRewrite}
                disabled={isTranscribing || !videoUrl.trim()}
                style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  padding: '8px 14px', borderRadius: '8px', border: 'none',
                  cursor: (isTranscribing || !videoUrl.trim()) ? 'not-allowed' : 'pointer',
                  background: isTranscribing
                    ? 'rgba(138, 92, 246, 0.4)'
                    : 'linear-gradient(135deg, #8B5CF6 0%, #6D28D9 100%)',
                  color: 'white', fontSize: '12px', fontWeight: '600',
                  boxShadow: '0 2px 6px rgba(138, 92, 246, 0.2)',
                  transition: 'all 0.2s ease', whiteSpace: 'nowrap'
                }}
              >
                {isTranscribing ? t.transcribingButton : t.extractScriptButton}
              </button>
            </div>
            {isTranscribing && (
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#8B5CF6', animation: 'pulse 1.2s infinite' }}></div>
                {t.whisperProgressDesc}
              </div>
            )}
            {transcribeError && (
              <div style={{ fontSize: '11px', color: '#C0392B', marginTop: '8px', fontWeight: '500' }}>
                ⚠️ Hata: {transcribeError}
              </div>
            )}
          </div>
          )}

          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: '200px' }}>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>{t.ideaTitleLabel}</label>
              <input
                type="text"
                placeholder={t.ideaTitlePlaceholder}
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                style={{
                  width: '100%', padding: '10px 14px', borderRadius: '8px',
                  border: '1px solid var(--border-card)', background: 'var(--bg-app)',
                  color: 'var(--text-main)', fontSize: '14px', boxSizing: 'border-box'
                }}
                required
              />
            </div>
            <div style={{ width: '180px' }}>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>{t.formatLabel}</label>
              <select
                value={newFormat}
                onChange={e => setNewFormat(e.target.value)}
                style={{
                  width: '100%', padding: '10px 14px', borderRadius: '8px',
                  border: '1px solid var(--border-card)', background: 'var(--bg-app)',
                  color: 'var(--text-main)', fontSize: '14px', cursor: 'pointer', boxSizing: 'border-box'
                }}
              >
                <option value="Reels">Reels</option>
                <option value="Carousel">Carousel</option>
                <option value="Shorts">Shorts</option>
                <option value="YouTube">YouTube</option>
                <option value="Newsletter">Newsletter</option>
                <option value="Thread">Thread</option>
              </select>
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>{t.hookLabel}</label>
            <input
              type="text"
              placeholder={t.hookPlaceholder}
              value={newHook}
              onChange={e => setNewHook(e.target.value)}
              style={{
                width: '100%', padding: '10px 14px', borderRadius: '8px',
                border: '1px solid var(--border-card)', background: 'var(--bg-app)',
                color: 'var(--text-main)', fontSize: '14px', boxSizing: 'border-box'
              }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>{t.visualNotesLabel}</label>
              <textarea
                placeholder={t.visualNotesPlaceholder}
                value={newDetails}
                onChange={e => setNewDetails(e.target.value)}
                rows={3}
                style={{
                  width: '100%', padding: '10px 14px', borderRadius: '8px',
                  border: '1px solid var(--border-card)', background: 'var(--bg-app)',
                  color: 'var(--text-main)', fontSize: '14px', fontFamily: 'inherit',
                  resize: 'vertical', boxSizing: 'border-box'
                }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>{t.scriptLabel}</label>
              <textarea
                placeholder={t.scriptPlaceholder}
                value={newScript}
                onChange={e => setNewScript(e.target.value)}
                rows={3}
                style={{
                  width: '100%', padding: '10px 14px', borderRadius: '8px',
                  border: '1px solid var(--border-card)', background: 'var(--bg-app)',
                  color: 'var(--text-main)', fontSize: '14px', fontFamily: 'inherit',
                  resize: 'vertical', boxSizing: 'border-box'
                }}
              />
            </div>
          </div>

          <button
            type="submit"
            style={{
              alignSelf: 'flex-end', display: 'flex', alignItems: 'center', gap: '6px',
              padding: '8px 18px', borderRadius: '20px', border: 'none',
              cursor: 'pointer', background: 'linear-gradient(135deg, var(--color-gold-dark) 0%, #D97706 100%)',
              color: 'white', fontSize: '13px', fontWeight: '600',
              boxShadow: '0 2px 8px rgba(217, 119, 6, 0.25)',
              transition: 'var(--transition-smooth)'
            }}
            className="brainstorm-submit-btn"
          >
            <Plus size={14} />
            {t.addIdeaButton}
          </button>
        </form>

        {/* Format Filters */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
          {['All', 'Reels', 'Carousel', 'Shorts', 'YouTube', 'Newsletter', 'Thread'].map(format => {
            const isActive = activeFormatFilter === format;
            return (
              <button
                key={format}
                type="button"
                onClick={() => setActiveFormatFilter(format)}
                style={{
                  padding: '6px 12px',
                  borderRadius: '12px',
                  border: '1px solid var(--border-card)',
                  background: isActive ? 'var(--color-gold-dark)' : 'var(--bg-card)',
                  color: isActive ? 'white' : 'var(--text-muted)',
                  fontSize: '12px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  boxShadow: isActive ? '0 2px 6px rgba(217,119,6,0.15)' : 'none'
                }}
                onMouseEnter={(e) => {
                  if (!isActive) e.currentTarget.style.background = 'rgba(183, 157, 148, 0.1)';
                }}
                onMouseLeave={(e) => {
                  if (!isActive) e.currentTarget.style.background = 'var(--bg-card)';
                }}
              >
                {format === 'All' ? t.allFilter : format}
              </button>
            );
          })}
        </div>

        {/* Ideas Table */}
        <div style={{ overflow: 'visible', background: 'var(--bg-card)', border: '1px solid var(--border-card)', borderRadius: '12px', boxShadow: 'var(--shadow-sm)', marginBottom: '16px' }} className="brainstorm-table-container">
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', tableLayout: 'fixed' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-card)', background: 'rgba(228, 209, 203, 0.15)' }}>
                <th style={{ padding: '12px 16px', color: 'var(--text-muted)', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', width: '80px' }}>{t.formatHeader}</th>
                <th style={{ padding: '12px 16px', color: 'var(--text-muted)', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', width: '160px' }}>{t.titleIdeaHeader}</th>
                <th style={{ padding: '12px 16px', color: 'var(--text-muted)', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', width: '140px' }}>{t.hookHeader}</th>
                <th style={{ padding: '12px 16px', color: 'var(--text-muted)', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', width: '170px' }}>{t.visualNotesHeader}</th>
                <th style={{ padding: '12px 16px', color: 'var(--text-muted)', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', width: '170px' }}>{t.scriptHeader}</th>
                <th style={{ padding: '12px 16px', color: 'var(--text-muted)', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', width: '70px' }}>{t.dateHeader}</th>
                <th style={{ padding: '12px 16px', color: 'var(--text-muted)', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', width: '120px', textAlign: 'right' }}>{t.actionsHeader}</th>
              </tr>
            </thead>
            <tbody>
              {displayedIdeas.map((idea, idx) => {
                const isEditing = editingId === idea.id;
                const isConverting = convertingId === idea.id;
                
                return (
                  <tr
                    key={idea.id}
                    draggable={!isEditing}
                    onDragStart={(e) => handleDragStart(e, idea.id)}
                    onDragOver={(e) => handleDragOver(e, idea.id)}
                    onDrop={(e) => handleDrop(e, idea.id)}
                    onDragEnd={handleDragEnd}
                    style={{
                      borderBottom: '1px solid var(--border-card)',
                      background: isEditing 
                        ? 'rgba(217, 119, 6, 0.03)' 
                        : (draggedId === idea.id 
                            ? 'rgba(228, 209, 203, 0.2)' 
                            : (dragOverId === idea.id 
                                ? 'rgba(138, 92, 246, 0.12)' 
                                : 'transparent')),
                      cursor: !isEditing ? 'grab' : 'default',
                      opacity: draggedId === idea.id ? 0.5 : 1,
                      transition: 'all 0.15s ease'
                    }}
                    className="brainstorm-table-row"
                  >
                    {isEditing ? (
                      /* Inline Editing Row cells */
                      <>
                        <td style={{ padding: '12px', verticalAlign: 'top' }}>
                          <select
                            value={editFormat}
                            onChange={e => setEditFormat(e.target.value)}
                            style={{
                              width: '100%', padding: '6px 8px', borderRadius: '6px',
                              border: '1px solid var(--border-card)', background: 'var(--bg-app)',
                              color: 'var(--text-main)', fontSize: '12.5px', cursor: 'pointer', boxSizing: 'border-box'
                            }}
                          >
                            <option value="Reels">Reels</option>
                            <option value="Carousel">Carousel</option>
                            <option value="Shorts">Shorts</option>
                            <option value="YouTube">YouTube</option>
                            <option value="Newsletter">Newsletter</option>
                            <option value="Thread">Thread</option>
                          </select>
                        </td>
                        <td style={{ padding: '12px', verticalAlign: 'top' }}>
                          <input
                            type="text"
                            value={editTitle}
                            onChange={e => setEditTitle(e.target.value)}
                            style={{
                              width: '100%', padding: '6px 8px', borderRadius: '6px',
                              border: '1px solid var(--border-card)', background: 'var(--bg-app)',
                              color: 'var(--text-main)', fontSize: '12.5px', boxSizing: 'border-box'
                            }}
                            required
                          />
                        </td>
                        <td style={{ padding: '12px', verticalAlign: 'top' }}>
                          <input
                            type="text"
                            value={editHook}
                            onChange={e => setEditHook(e.target.value)}
                            style={{
                              width: '100%', padding: '6px 8px', borderRadius: '6px',
                              border: '1px solid var(--border-card)', background: 'var(--bg-app)',
                              color: 'var(--text-main)', fontSize: '12.5px', boxSizing: 'border-box'
                            }}
                             placeholder="Hook..."
                          />
                        </td>
                        <td style={{ padding: '12px', verticalAlign: 'top' }}>
                          <textarea
                            value={editDetails}
                            onChange={e => setEditDetails(e.target.value)}
                            rows={3}
                            style={{
                              width: '100%', padding: '6px 8px', borderRadius: '6px',
                              border: '1px solid var(--border-card)', background: 'var(--bg-app)',
                              color: 'var(--text-main)', fontSize: '12.5px', fontFamily: 'inherit',
                              resize: 'vertical', boxSizing: 'border-box'
                            }}
                             placeholder="Visual notes..."
                          />
                        </td>
                        <td style={{ padding: '12px', verticalAlign: 'top' }}>
                          <textarea
                            value={editScript}
                            onChange={e => setEditScript(e.target.value)}
                            rows={3}
                            style={{
                              width: '100%', padding: '6px 8px', borderRadius: '6px',
                              border: '1px solid var(--border-card)', background: 'var(--bg-app)',
                              color: 'var(--text-main)', fontSize: '12.5px', fontFamily: 'inherit',
                              resize: 'vertical', boxSizing: 'border-box'
                            }}
                             placeholder="Script..."
                          />
                        </td>
                        <td style={{ padding: '12px', verticalAlign: 'middle', color: 'var(--text-muted)', fontSize: '12px' }}>
                          -
                        </td>
                        <td style={{ padding: '12px', verticalAlign: 'middle', textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                            <button
                              onClick={() => setEditingId(null)}
                              style={{
                                display: 'flex', alignItems: 'center', gap: '3px',
                                padding: '6px 10px', borderRadius: '12px', border: '1px solid var(--border-card)',
                                background: 'transparent', color: 'var(--text-muted)', fontSize: '11px',
                                fontWeight: '600', cursor: 'pointer'
                              }}
                            >
                              <X size={11} />
                              {t.cancelButton}
                            </button>
                            <button
                              onClick={() => handleUpdateIdea(idea.id)}
                              style={{
                                display: 'flex', alignItems: 'center', gap: '3px',
                                padding: '6px 10px', borderRadius: '12px', border: 'none',
                                background: 'var(--color-green-dark)', color: 'white', fontSize: '11px',
                                fontWeight: '600', cursor: 'pointer'
                              }}
                            >
                              <Check size={11} />
                              {t.saveButton}
                            </button>
                          </div>
                        </td>
                      </>
                    ) : (
                      /* Display Row cells */
                      <>
                        <td style={{ padding: '14px 16px', verticalAlign: 'top' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            {!isEditing && (
                              <div style={{ cursor: 'grab', color: 'var(--text-light)', opacity: 0.6, display: 'flex', alignItems: 'center' }} title={t.dragReorderTooltip}>
                                <svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor" style={{ opacity: 0.6 }}>
                                  <circle cx="2" cy="2" r="1.5" />
                                  <circle cx="2" cy="8" r="1.5" />
                                  <circle cx="2" cy="14" r="1.5" />
                                  <circle cx="8" cy="2" r="1.5" />
                                  <circle cx="8" cy="8" r="1.5" />
                                  <circle cx="8" cy="14" r="1.5" />
                                </svg>
                              </div>
                            )}
                            <span style={{
                              fontSize: '9.5px', fontWeight: '700', padding: '2px 8px', borderRadius: '6px',
                              display: 'inline-block', textAlign: 'center', width: '100%', boxSizing: 'border-box',
                              background: idea.format === 'Carousel' ? 'rgba(100, 160, 255, 0.15)' :
                                          idea.format === 'YouTube' ? 'rgba(230, 80, 50, 0.15)' :
                                          idea.format === 'Newsletter' ? 'rgba(180, 100, 255, 0.15)' :
                                          'rgba(210, 160, 50, 0.15)',
                              color: idea.format === 'Carousel' ? '#2563EB' :
                                     idea.format === 'YouTube' ? '#DC2626' :
                                     idea.format === 'Newsletter' ? '#7C3AED' :
                                     '#D97706',
                              border: `1px solid ${
                                idea.format === 'Carousel' ? 'rgba(100, 160, 255, 0.25)' :
                                idea.format === 'YouTube' ? 'rgba(230, 80, 50, 0.25)' :
                                idea.format === 'Newsletter' ? 'rgba(180, 100, 255, 0.25)' :
                                'rgba(210, 160, 50, 0.25)'
                              }`
                            }}>
                              {idea.format}
                            </span>
                          </div>
                        </td>
                        <td style={{ padding: '14px 16px', verticalAlign: 'top', wordBreak: 'break-word' }}>
                          <div style={{ fontWeight: '700', fontSize: '13.5px', color: 'var(--text-main)', lineHeight: '1.3' }}>
                            {idea.title}
                          </div>
                        </td>
                        <td style={{ padding: '14px 16px', verticalAlign: 'top', fontStyle: 'italic', fontSize: '13.5px', color: 'var(--color-coral-dark)', lineHeight: '1.4', wordBreak: 'break-word' }}>
                          {idea.hook ? `"${idea.hook}"` : <span style={{ color: 'var(--text-light)', opacity: 0.5 }}>-</span>}
                        </td>
                        <td style={{ padding: '14px 16px', verticalAlign: 'top', fontSize: '13px', color: 'var(--text-muted)', lineHeight: '1.4', wordBreak: 'break-word', whiteSpace: 'pre-line' }}>
                          {idea.details || idea.description || <span style={{ color: 'var(--text-light)', opacity: 0.5 }}>-</span>}
                        </td>
                        <td 
                          onClick={() => {
                            if (idea.script) {
                              setSelectedScript({ title: idea.title, script: idea.script });
                            }
                          }}
                          style={{ 
                            padding: '14px 16px', 
                            verticalAlign: 'top', 
                            fontSize: '13px', 
                            color: 'var(--text-muted)', 
                            lineHeight: '1.4', 
                            wordBreak: 'break-word', 
                            whiteSpace: 'pre-line',
                            cursor: idea.script ? 'pointer' : 'default',
                            transition: 'background-color 0.2s'
                          }}
                          className={idea.script ? "clickable-script-cell" : ""}
                          title={idea.script ? t.showFullScriptTooltip : ""}
                        >
                          {idea.script ? (
                            <>
                              <div>{truncateText(idea.script, 100)}</div>
                              {idea.script.length > 100 && (
                                <span style={{ 
                                  fontSize: '11px', 
                                  color: 'var(--color-coral-dark)', 
                                  fontWeight: '600',
                                  display: 'inline-block',
                                  marginTop: '4px'
                                }}>
                                  {t.viewFullSuffix}
                                </span>
                              )}
                            </>
                          ) : (
                            <span style={{ color: 'var(--text-light)', opacity: 0.5 }}>-</span>
                          )}
                        </td>
                        <td style={{ padding: '14px 16px', verticalAlign: 'top', fontSize: '11.5px', color: 'var(--text-muted)' }}>
                           {new Date(idea.createdAt).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}
                        </td>
                        <td style={{ padding: '14px 16px', verticalAlign: 'top', textAlign: 'right' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
                            <button
                              onClick={() => {
                                setEditingId(idea.id);
                                setEditTitle(idea.title);
                                setEditHook(idea.hook || '');
                                setEditDetails(idea.details || idea.description || '');
                                setEditScript(idea.script || '');
                                setEditFormat(idea.format);
                              }}
                              style={{
                                background: 'transparent', border: 'none', cursor: 'pointer',
                                color: 'var(--text-muted)', padding: '4px', borderRadius: '4px',
                                display: 'flex', alignItems: 'center', justifyContent: 'center'
                              }}
                              className="action-icon-btn"
                              title={t.editIdeaTooltip}
                            >
                              <Edit3 size={13} />
                            </button>
                            <button
                              onClick={() => handleDeleteIdea(idea.id)}
                              style={{
                                background: 'transparent', border: 'none', cursor: 'pointer',
                                color: 'var(--text-muted)', padding: '4px', borderRadius: '4px',
                                display: 'flex', alignItems: 'center', justifyContent: 'center'
                              }}
                              className="action-icon-btn-delete"
                              title={t.deleteIdeaTooltip}
                            >
                              <Trash2 size={13} />
                            </button>
                            <div style={{ position: 'relative' }}>
                              <button
                                onClick={() => setConvertingId(isConverting ? null : idea.id)}
                                style={{
                                  display: 'flex', alignItems: 'center', gap: '3px',
                                  background: 'var(--color-coral-light)', color: 'var(--color-coral-dark)',
                                  border: 'none', padding: '4px 8px', borderRadius: '8px',
                                  fontSize: '11px', fontWeight: '700', cursor: 'pointer',
                                  transition: 'var(--transition-smooth)'
                                }}
                                className="convert-planner-btn"
                              >
                                <Calendar size={11} />
                                {t.addToPlannerButton}
                              </button>

                              {isConverting && (
                                <div style={{
                                  position: 'absolute', bottom: '28px', right: 0, zIndex: 10,
                                  background: 'var(--bg-card)', border: '1px solid var(--border-card)',
                                  borderRadius: '10px', boxShadow: 'var(--shadow-md)',
                                  padding: '10px', width: '200px', display: 'flex', flexDirection: 'column', gap: '8px'
                                }}>
                                  <div style={{ fontSize: '10px', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase', textAlign: 'left' }}>
                                    {t.selectDateHeader}
                                  </div>
                                  <input
                                    type="date"
                                    id={`date-picker-${idea.id}`}
                                    style={{
                                      padding: '6px 8px', borderRadius: '6px',
                                      border: '1px solid var(--border-card)', background: 'var(--bg-app)',
                                      color: 'var(--text-main)', fontSize: '12px', width: '100%', boxSizing: 'border-box'
                                    }}
                                  />
                                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '6px' }}>
                                    <button
                                      onClick={() => setConvertingId(null)}
                                      style={{
                                        padding: '5px 10px', border: '1px solid var(--border-card)', background: 'transparent',
                                        color: 'var(--text-muted)', fontSize: '11px', borderRadius: '6px', cursor: 'pointer'
                                      }}
                                    >
                                      {t.cancelButton}
                                    </button>
                                    <button
                                      onClick={() => {
                                        const dateVal = document.getElementById(`date-picker-${idea.id}`).value;
                                        if (dateVal) {
                                          handleConvertToPlanner(idea, dateVal);
                                        } else {
                                          alert(t.confirmSelectDate);
                                        }
                                      }}
                                      style={{
                                        padding: '5px 10px', border: 'none', background: 'var(--color-coral-dark)',
                                        color: 'white', fontSize: '11px', borderRadius: '6px', cursor: 'pointer', fontWeight: '700'
                                      }}
                                    >
                                      {t.planButton}
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}

              {displayedIdeas.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                      <Lightbulb size={24} style={{ color: 'var(--text-muted)', opacity: 0.5 }} />
                      <span style={{ fontSize: '13.5px', fontWeight: '600' }}>{t.noSavedIdeas}</span>
                      <span style={{ fontSize: '12px', opacity: 0.7 }}>{t.addFirstIdeaPrompt}</span>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Tech Alert: "Bu Hafta Kaçırılmamalı" ──────────────────────────── */}
      {techAlerts.length > 0 && (
        <div style={{
          background: 'linear-gradient(135deg, rgba(255, 178, 120, 0.12) 0%, rgba(255, 120, 80, 0.08) 100%)',
          border: '1.5px solid rgba(230, 140, 80, 0.35)',
          borderRadius: '14px', padding: '20px', marginTop: '8px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <AlertTriangle size={18} style={{ color: '#E8750A' }} />
            <span style={{ fontSize: '14px', fontWeight: '700', color: '#E8750A', letterSpacing: '0.02em' }}>
              ⚡ {t.techAlertHeader}
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {techAlerts.map((alert, idx) => (
              <div key={idx} style={{
                background: 'rgba(255, 255, 255, 0.6)', borderRadius: '10px', padding: '14px',
                borderLeft: '3px solid #E8750A'
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', marginBottom: '8px' }}>
                  <div style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-main)', lineHeight: '1.3' }}>
                    {alert.headline}
                  </div>
                  <span style={{
                    fontSize: '10px', fontWeight: '700', padding: '3px 8px', borderRadius: '8px', flexShrink: 0,
                    background: alert.urgency === 'Bu hafta' ? 'rgba(230, 80, 50, 0.15)' : 'rgba(230, 160, 50, 0.15)',
                    color: alert.urgency === 'Bu hafta' ? '#C0392B' : '#8B6914'
                  }}>
                    {alert.urgency || 'Bu hafta'}
                  </span>
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px', lineHeight: '1.4' }}>
                  {alert.why}
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
                  <ArrowRight size={12} style={{ color: '#E8750A', marginTop: '2px', flexShrink: 0 }} />
                  <span style={{ fontSize: '12px', color: '#E8750A', fontWeight: '500' }}>
                    {alert.contentAngle}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}



      {/* ── Competitor Intelligence ────────────────────────────────────────── */}
      <div className="influencer-section" style={{ marginTop: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
          <Flame size={20} style={{ color: 'var(--color-coral-dark)' }} />
          <h2 className="card-title" style={{ fontSize: '24px' }}>{t.competitorIntelligence}</h2>
        </div>
        <p style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '20px' }}>
          {t.competitorIntelligenceDesc}
        </p>

        {/* Weekly Summary Box */}
        {weeklyDigest && (
          <div style={{
            background: 'linear-gradient(135deg, rgba(228, 209, 203, 0.25) 0%, rgba(183, 157, 148, 0.12) 100%)',
            border: '1px solid rgba(183, 157, 148, 0.35)', borderRadius: '14px',
            padding: '20px', marginBottom: '20px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
              <TrendingUp size={16} style={{ color: 'var(--color-coral-dark)' }} />
              <span style={{ fontSize: '13px', fontWeight: '600', color: 'var(--color-coral-dark)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                {t.weeklySummary}
              </span>
              {weeklyDigest.totalPostsAnalyzed > 0 && (
                <span style={{ marginLeft: 'auto', fontSize: '12px', color: 'var(--text-muted)', background: 'rgba(183,157,148,0.2)', padding: '2px 8px', borderRadius: '10px' }}>
                  {weeklyDigest.totalPostsAnalyzed} {t.postsAnalyzed}
                </span>
              )}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
              <div style={{ background: 'rgba(255,255,255,0.5)', borderRadius: '10px', padding: '12px' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>{t.dominantTheme}</div>
                <div style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-main)' }}>{weeklyDigest.dominantTheme}</div>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.5)', borderRadius: '10px', padding: '12px' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>{t.topFormat}</div>
                <div style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-main)' }}>{weeklyDigest.dominantFormat}</div>
              </div>
            </div>
            {weeklyDigest.topCompetitor && (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', marginBottom: '10px' }}>
                <Zap size={14} style={{ color: 'var(--color-coral-dark)', marginTop: '2px', flexShrink: 0 }} />
                <span style={{ fontSize: '13px', color: 'var(--text-main)' }}>
                  <strong>{t.featuredCompetitorPrefix}</strong> {weeklyDigest.topCompetitor}
                </span>
              </div>
            )}
            {weeklyDigest.audienceSignal && (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                <BookOpen size={14} style={{ color: 'var(--text-muted)', marginTop: '2px', flexShrink: 0 }} />
                <span style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: '1.5' }}>
                  {weeklyDigest.audienceSignal}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Top Insights — Max 3 */}
        {weeklyDigest?.topInsights?.length > 0 && (
          <div style={{ marginBottom: '20px' }}>
            <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-main)', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Lightbulb size={14} style={{ color: 'var(--color-coral-dark)' }} />
              {t.topInsightsTitle}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {weeklyDigest.topInsights.map((insight, idx) => {
                const isOpen = expandedInsight === insight.rank;
                return (
                  <div
                    key={idx}
                    style={{
                      background: 'var(--bg-card)', border: '1px solid var(--border-card)',
                      borderRadius: '12px', overflow: 'hidden', cursor: 'pointer',
                      transition: 'var(--transition-smooth)'
                    }}
                    onClick={() => toggleInsight(insight.rank)}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', padding: '14px 16px' }}>
                      <span style={{
                        width: '24px', height: '24px', borderRadius: '50%',
                        background: 'var(--color-coral-dark)', color: 'white',
                        fontSize: '12px', fontWeight: '700', display: 'flex',
                        alignItems: 'center', justifyContent: 'center', flexShrink: 0
                      }}>{insight.rank}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-main)', marginBottom: '4px', lineHeight: '1.3' }}>
                          {insight.novaTopic}
                        </div>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)', background: 'rgba(183,157,148,0.15)', padding: '2px 8px', borderRadius: '10px' }}>
                            {insight.novaFormat}
                          </span>
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{t.triggerLabel} {insight.emotionalTrigger}</span>
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)', opacity: 0.6 }}>via {insight.competitorSource}</span>
                        </div>
                      </div>
                      <div style={{ color: 'var(--text-muted)', flexShrink: 0 }}>
                        {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </div>
                    </div>

                    {isOpen && (
                      <div onClick={e => e.stopPropagation()} style={{ borderTop: '1px solid var(--border-card)', padding: '14px 16px', background: 'rgba(228, 209, 203, 0.08)' }}>
                        <div style={{ marginBottom: '14px' }}>
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '5px' }}>
                            {t.competitorHook} ({insight.competitorSource})
                          </div>
                          <div style={{ fontSize: '13px', color: 'var(--text-muted)', fontStyle: 'italic', borderLeft: '2px solid rgba(183,157,148,0.4)', paddingLeft: '10px' }}>
                            "{insight.competitorHook}"
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
                          <ArrowRight size={14} style={{ color: 'var(--color-coral-dark)' }} />
                          <span style={{ fontSize: '12px', color: 'var(--color-coral-dark)', fontWeight: '600' }}>{t.novasAngle}</span>
                         </div>
                        <div style={{ fontSize: '13px', color: 'var(--text-main)', lineHeight: '1.5', marginBottom: '10px' }}>
                          {insight.novaAngle}
                        </div>
                        <div style={{
                          background: 'rgba(228, 209, 203, 0.2)', borderRadius: '8px',
                          padding: '12px', borderLeft: '3px solid var(--color-coral-dark)'
                        }}>
                          <div style={{ fontSize: '11px', color: 'var(--color-coral-dark)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: '600', marginBottom: '6px' }}>
                            {t.novaHookSuggestion}
                          </div>
                          <div style={{ fontSize: '14px', color: 'var(--text-main)', fontStyle: 'italic', lineHeight: '1.4' }}>
                            "{insight.novaHook}"
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Overflow Notes */}
        {weeklyDigest?.overflowNotes?.length > 0 && (
          <div style={{
            background: 'linear-gradient(135deg, rgba(255, 248, 210, 0.35) 0%, rgba(255, 237, 160, 0.2) 100%)',
            border: '1px solid rgba(220, 190, 80, 0.35)',
            borderRadius: '14px', padding: '18px 20px', marginBottom: '20px'
          }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <span style={{ fontSize: '16px' }}>📌</span>
              <span style={{ fontSize: '13px', fontWeight: '700', color: '#7A6A25' }}>
                {t.overflowNotesTitle}
              </span>
            </div>
            <div style={{ fontSize: '12px', color: '#9A8A45', marginBottom: '14px', paddingLeft: '24px' }}>
              {t.overflowNotesDesc}
            </div>

            {/* Idea cards */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {weeklyDigest.overflowNotes.map((note, idx) => (
                <div key={idx} style={{
                  display: 'flex', gap: '12px', alignItems: 'flex-start',
                  background: 'rgba(255, 255, 255, 0.45)', borderRadius: '10px',
                  padding: '12px 14px', border: '1px solid rgba(220, 190, 80, 0.2)'
                }}>
                  {/* Index badge */}
                  <div style={{
                    width: '26px', height: '26px', borderRadius: '50%', flexShrink: 0,
                    background: 'rgba(220, 190, 80, 0.25)', display: 'flex',
                    alignItems: 'center', justifyContent: 'center',
                    fontSize: '11px', fontWeight: '700', color: '#7A6A25', marginTop: '1px'
                  }}>
                    {idx + 4}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    {/* Topic + format row */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '5px' }}>
                      <span style={{ fontSize: '13px', color: 'var(--text-main)', fontWeight: '600' }}>
                        {note.topic}
                      </span>
                      <span style={{
                        fontSize: '10px', fontWeight: '600', padding: '2px 7px', borderRadius: '20px',
                        background: note.format === 'Carousel' ? 'rgba(100, 160, 255, 0.15)' : 'rgba(180, 100, 255, 0.15)',
                        color: note.format === 'Carousel' ? '#4A80CF' : '#9B4DCA',
                        border: `1px solid ${note.format === 'Carousel' ? 'rgba(100, 160, 255, 0.25)' : 'rgba(180, 100, 255, 0.25)'}`
                      }}>
                        {note.format || 'Reels'}
                      </span>
                      {note.source && (
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{note.source}</span>
                      )}
                    </div>

                    {/* Hook */}
                    {note.hook && (
                      <div style={{
                        fontSize: '12px', color: '#5A4A15', fontStyle: 'italic',
                        background: 'rgba(255, 230, 100, 0.2)', borderRadius: '6px',
                        padding: '5px 8px', marginBottom: '5px', borderLeft: '3px solid rgba(200, 160, 50, 0.5)'
                      }}>
                        ✦ "{note.hook}"
                      </div>
                    )}

                    {/* Emotional trigger / why */}
                    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                      {note.emotionalTrigger && (
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                          🎯 <strong>{t.triggerLabelSub}</strong> {note.emotionalTrigger}
                        </span>
                      )}
                      {note.novaAngle && (
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                          💡 {note.novaAngle}
                        </span>
                      )}
                    </div>

                    {/* Fallback if no extra fields */}
                    {!note.hook && !note.emotionalTrigger && !note.novaAngle && (
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        {note.format} {t.overflowContentSuffix}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Bottom tip */}
            <div style={{
              marginTop: '12px', paddingTop: '10px',
              borderTop: '1px solid rgba(220, 190, 80, 0.25)',
              fontSize: '11px', color: '#9A8A45', display: 'flex', gap: '6px', alignItems: 'flex-start'
            }}>
              <span>💡</span>
              <span>
                <strong>{t.tipPrefix}</strong> {t.overflowNotesTip}
              </span>
            </div>
          </div>
        )}


        {(!weeklyDigest || !weeklyDigest.topInsights || weeklyDigest.topInsights.length === 0) && (
          <div style={{ textAlign: 'center', padding: '24px', background: 'var(--bg-card)', borderRadius: '12px', border: '1px solid var(--border-card)', color: 'var(--text-muted)', marginBottom: '20px' }}>
            {t.noCompetitorAnalysis}
          </div>
        )}
      </div>

      {/* Script Modal */}
      {selectedScript && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0, 0, 0, 0.4)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 9999, padding: '20px'
        }} onClick={() => setSelectedScript(null)}>
          <div style={{
            background: 'var(--bg-card)', border: '1px solid var(--border-card)',
            borderRadius: '16px', width: '100%', maxWidth: '500px',
            boxShadow: 'var(--shadow-lg)', display: 'flex', flexDirection: 'column',
            overflow: 'hidden', animation: 'slideDown 0.2s ease-out'
          }} onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '16px 20px', borderBottom: '1px solid var(--border-card)',
              background: 'rgba(228, 209, 203, 0.15)'
            }}>
              <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '700', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>🎬</span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '350px' }}>
                  {selectedScript.title} — {t.scriptTitleSuffix}
                </span>
              </h3>
              <button
                onClick={() => setSelectedScript(null)}
                style={{
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  color: 'var(--text-muted)', display: 'flex', alignItems: 'center',
                  padding: '4px', borderRadius: '50%'
                }}
              >
                <X size={18} />
              </button>
            </div>
            {/* Body */}
            <div style={{
              padding: '20px', overflowY: 'auto', maxHeight: '350px',
              fontSize: '14px', color: 'var(--text-main)', lineHeight: '1.6',
              whiteSpace: 'pre-line', background: 'var(--bg-app)'
            }}>
              {selectedScript.script}
            </div>
            {/* Footer */}
            <div style={{
              display: 'flex', justifyContent: 'flex-end', gap: '8px',
              padding: '12px 20px', borderTop: '1px solid var(--border-card)',
              background: 'var(--bg-card)'
            }}>
              <button
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(selectedScript.script);
                    alert(t.copiedToast);
                  } catch (err) {
                    console.error('Kopyalama hatası:', err);
                  }
                }}
                style={{
                  padding: '7px 14px', borderRadius: '8px', border: 'none',
                  background: 'var(--color-coral-dark)', color: 'white',
                  fontSize: '12.5px', fontWeight: '600', cursor: 'pointer',
                  transition: 'opacity 0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.opacity = '0.9'}
                onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
              >
                {t.copyButton}
              </button>
              <button
                onClick={() => setSelectedScript(null)}
                style={{
                  padding: '7px 14px', borderRadius: '8px',
                  border: '1px solid var(--border-card)', background: 'transparent',
                  color: 'var(--text-muted)', fontSize: '12.5px', fontWeight: '600',
                  cursor: 'pointer'
                }}
              >
                {t.closeButton}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
