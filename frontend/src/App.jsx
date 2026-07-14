import React, { useState, useEffect, useRef } from 'react';
import { RefreshCw, LayoutDashboard, Newspaper, Calendar, CalendarRange, Target, Moon, Palette } from 'lucide-react';
import Dashboard from './components/Dashboard';
import Newsletter from './components/Newsletter';
import WeeklyContent from './components/WeeklyContent';
import CalendarView from './components/Calendar';
import ActionBoard from './components/ActionBoard';
import DesignBoard from './components/DesignBoard';
import { translations } from './translations';
import './App.css';

export default function App() {
  const [activeTab, setActiveTab] = useState('home');
  const [dashboardData, setDashboardData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'peach');
  const [showThemeDropdown, setShowThemeDropdown] = useState(false);
  const [lang, setLang] = useState(() => localStorage.getItem('lang') || 'en');
  const dropdownRef = useRef(null);

  const handleSetLang = (newLang) => {
    setLang(newLang);
    localStorage.setItem('lang', newLang);
  };

  const t = translations[lang] || translations.en;

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowThemeDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Fetch dashboard data on mount
  useEffect(() => {
    fetchDashboardData();
  }, []);

  // Ask the browser for the real location once (ever) and push it to the
  // backend so weather reflects where the user actually is (fixes the old
  // hardcoded-Vancouver bug). The result is cached in localStorage so the
  // browser's permission prompt only fires a single time across visits —
  // subsequent loads just resend the cached coords. Silently no-ops if
  // permission is denied — the backend then falls back to IP-based
  // geolocation on its own.
  useEffect(() => {
    const sendLocation = (lat, lon) => {
      fetch('/api/location', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat, lon })
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.success && data.weather) {
            setDashboardData((prev) => (prev ? { ...prev, weather: data.weather } : prev));
          }
        })
        .catch((err) => console.error('Error saving location:', err));
    };

    const cachedRaw = localStorage.getItem('nova_location');
    if (cachedRaw) {
      try {
        const cached = JSON.parse(cachedRaw);
        if (cached && typeof cached.lat === 'number' && typeof cached.lon === 'number') {
          sendLocation(cached.lat, cached.lon);
          return;
        }
      } catch (e) {
        // fall through to re-request below
      }
    }

    if (!('geolocation' in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        localStorage.setItem('nova_location', JSON.stringify({ lat: latitude, lon: longitude }));
        sendLocation(latitude, longitude);
      },
      (err) => console.warn('Geolocation unavailable/denied:', err.message),
      { timeout: 10000, maximumAge: 60 * 60 * 1000 }
    );
  }, []);

  const fetchDashboardData = (silent = false) => {
    if (!silent) setLoading(true);
    fetch('/api/dashboard')
      .then((res) => res.json())
      .then((data) => {
        setDashboardData(data);
        if (!silent) setLoading(false);
      })
      .catch((err) => {
        console.error('Error fetching dashboard data:', err);
        if (!silent) setLoading(false);
      });
  };

  // Sync data manually
  const handleSyncData = () => {
    setSyncing(true);
    fetch('/api/sync', { method: 'POST' })
      .then((res) => res.json())
      .then((resData) => {
        if (resData.success && resData.data) {
          setDashboardData(resData.data);
        } else {
          console.error('Sync failed:', resData.error);
        }
        setSyncing(false);
      })
      .catch((err) => {
        console.error('Error syncing:', err);
        setSyncing(false);
      });
  };



  // Toggle priority items
  const handleTogglePriority = (id) => {
    console.log('[DEBUG] handleTogglePriority called with id:', id);
    if (id.startsWith('cal-')) {
      const originalId = id.replace('cal-', '');
      console.log('[DEBUG] Calendar task toggle. originalId:', originalId);
      const planner = dashboardData?.weeklyContent?.contentPlanner || [];
      const item = planner.find(p => p.id === originalId || p.topic === originalId || p.title === originalId);
      console.log('[DEBUG] Found planner item:', item);
      if (item) {
        // Optimistic UI update
        const updatedPlanner = planner.map(p => 
          (p.id === originalId || p.topic === originalId || p.title === originalId) ? { ...p, checked: !p.checked } : p
        );
        console.log('[DEBUG] Setting optimistic weeklyContent planner...');
        setDashboardData({
          ...dashboardData,
          weeklyContent: {
            ...dashboardData.weeklyContent,
            contentPlanner: updatedPlanner
          }
        });

        const body = {
          ...item,
          checked: !item.checked
        };
        console.log('[DEBUG] POST /api/weekly-content/planner with body:', body);
        fetch('/api/weekly-content/planner', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        })
          .then(res => res.json())
          .then(data => {
            console.log('[DEBUG] POST response data:', data);
            if (data.success) {
              fetchDashboardData(true);
            }
          })
          .catch(err => console.error('Error toggling calendar task:', err));
      } else {
        console.log('[DEBUG] Planner item not found for toggle.');
      }
      return;
    }

    // Optimistic UI update
    if (dashboardData && dashboardData.priorities) {
      const updatedPriorities = dashboardData.priorities.map((item) =>
        item.id === id ? { ...item, checked: !item.checked } : item
      );
      setDashboardData({ ...dashboardData, priorities: updatedPriorities });
    }

    fetch('/api/dashboard/priorities/toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setDashboardData((prev) => ({ ...prev, priorities: data.priorities }));
        }
      })
      .catch((err) => {
        console.error('Error toggling priority status:', err);
      });
  };

  // Add new priority item — always created as a calendar task dated today,
  // so Top Priorities Today and the Calendar's today cell stay in sync (a
  // task added from either side always shows up in both).
  const handleAddPriority = (text, priority) => {
    const todayStr = (() => {
      const d = new Date();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return `${d.getFullYear()}-${mm}-${dd}`;
    })();

    fetch('/api/weekly-content/planner', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'task',
        date: todayStr,
        topic: text,
        priority: priority || 'MED',
        isManual: true
      }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          fetchDashboardData(true);
        }
      })
      .catch((err) => {
        console.error('Error adding priority:', err);
      });
  };

  // Delete priority item
  const handleDeletePriority = (id) => {
    if (id.startsWith('cal-')) {
      const originalId = id.replace('cal-', '');
      fetch('/api/weekly-content/planner/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: originalId }),
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.success) {
            fetchDashboardData(true);
          }
        })
        .catch((err) => {
          console.error('Error deleting calendar task:', err);
        });
      return;
    }

    // Optimistic UI update
    if (dashboardData && dashboardData.priorities) {
      const updatedPriorities = dashboardData.priorities.filter((item) => item.id !== id);
      setDashboardData({ ...dashboardData, priorities: updatedPriorities });
    }

    fetch('/api/dashboard/priorities/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setDashboardData((prev) => ({ ...prev, priorities: data.priorities }));
        }
      })
      .catch((err) => {
        console.error('Error deleting priority:', err);
      });
  };

  // Persist the user's manual up/down order for the combined Top Priorities
  // list (static priorities + today's calendar tasks together)
  const handleReorderPriorities = (orderIds) => {
    setDashboardData((prev) => (prev ? { ...prev, priorityListOrder: orderIds } : prev));
    fetch('/api/dashboard/priorities/reorder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order: orderIds }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setDashboardData((prev) => (prev ? { ...prev, priorityListOrder: data.priorityListOrder } : prev));
        }
      })
      .catch((err) => {
        console.error('Error reordering priorities:', err);
      });
  };

  return (
    <div className={`app-container${activeTab === 'calendar' ? ' app-container-wide' : ''}`} style={{ position: 'relative' }}>
      
      {/* Floating Theme Selector (outside navbar) */}
      <div 
        ref={dropdownRef}
        className="theme-floating-container"
        style={{
          position: 'fixed',
          top: '40px',
          right: '40px',
          zIndex: 1001,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '8px'
        }}
      >
        <button
          onClick={() => setShowThemeDropdown(!showThemeDropdown)}
          title="Temayı Değiştir"
          style={{
            width: '40px',
            height: '40px',
            borderRadius: '50%',
            backgroundColor: 'var(--bg-card)',
            border: '1px solid var(--border-card)',
            color: 'var(--text-main)',
            boxShadow: 'var(--shadow-md)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            transition: 'var(--transition-smooth)',
            transform: showThemeDropdown ? 'rotate(15deg) scale(1.05)' : 'none'
          }}
          className="theme-toggle-btn"
        >
          <Moon size={20} />
        </button>

        {showThemeDropdown && (
          <div
            className="theme-dropdown-menu"
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
              padding: '8px',
              backgroundColor: 'var(--bg-card)',
              border: '1px solid var(--border-card)',
              borderRadius: '18px',
              boxShadow: 'var(--shadow-lg)',
              animation: 'slideDown 0.2s cubic-bezier(0.4, 0, 0.2, 1) forwards',
              width: '180px',
              position: 'absolute',
              top: '48px',
              right: '0',
              zIndex: 1002
            }}
          >
            {[
              { key: 'peach', label: 'Sunkissed Echo', bg: '#FDF8F6', accent: '#f47358' },
              { key: 'inferno', label: 'Burnt Inferno', bg: '#200808', accent: '#4E0000' },
              { key: 'breakfast', label: 'Plum Tea Royale', bg: '#F5F2F5', accent: '#451616' },
              { key: 'bluebell', label: 'Indigo Dew', bg: '#F0F2F9', accent: '#99a5cd' },
              { key: 'artcoast', label: 'Artcoast Velvet', bg: '#FFF3EE', accent: '#CB5D35' },
              { key: 'parrish', label: 'Pampas Tiber Olive', bg: '#F9F6F3', accent: '#721B32' },
              { key: 'olive', label: 'Velvet Olive', bg: '#F4F6F4', accent: '#556B2F' }
            ].map((t) => {
              const isActive = theme === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => setTheme(t.key)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '8px 12px',
                    width: '100%',
                    borderRadius: '10px',
                    backgroundColor: isActive ? 'var(--bg-nav-active)' : 'transparent',
                    cursor: 'pointer',
                    transition: 'var(--transition-smooth)',
                    textAlign: 'left'
                  }}
                  className="theme-menu-item"
                >
                  <div
                    style={{
                      width: '16px',
                      height: '16px',
                      borderRadius: '50%',
                      background: `linear-gradient(135deg, ${t.bg} 50%, ${t.accent} 50%)`,
                      border: '1px solid var(--border-card)',
                      boxShadow: 'var(--shadow-sm)',
                      flexShrink: 0
                    }}
                  />
                  <span
                    style={{
                      fontSize: '12.5px',
                      fontWeight: isActive ? '700' : '500',
                      color: isActive ? 'var(--text-main)' : 'var(--text-muted)',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {t.label}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Navigation Header */}
      <nav className="navbar">
        <div className="nav-links">
          <button 
            className={`nav-item ${activeTab === 'home' ? 'active' : ''}`}
            onClick={() => setActiveTab('home')}
          >
            <LayoutDashboard size={18} />
            <span className="nav-text">{t.home}</span>
          </button>
          <button 
            className={`nav-item ${activeTab === 'newsletter' ? 'active' : ''}`}
            onClick={() => setActiveTab('newsletter')}
          >
            <Newspaper size={18} />
            <span className="nav-text">{t.newsletter}</span>
          </button>
          <button 
            className={`nav-item ${activeTab === 'weekly-content' ? 'active' : ''}`}
            onClick={() => setActiveTab('weekly-content')}
          >
            <CalendarRange size={18} />
            <span className="nav-text">{t.weeklyContent}</span>
          </button>
          <button 
            className={`nav-item ${activeTab === 'calendar' ? 'active' : ''}`}
            onClick={() => setActiveTab('calendar')}
          >
            <Calendar size={18} />
            <span className="nav-text">{t.calendar}</span>
          </button>
          <button
            className={`nav-item ${activeTab === 'action-board' ? 'active' : ''}`}
            onClick={() => setActiveTab('action-board')}
          >
            <Target size={18} />
            <span className="nav-text">{t.actionBoard}</span>
          </button>
          {/* Design tab hidden for now — not shipping yet. Restore this block to re-enable.
          <button
            className={`nav-item ${activeTab === 'design' ? 'active' : ''}`}
            onClick={() => setActiveTab('design')}
          >
            <Palette size={18} />
            <span className="nav-text">{t.design}</span>
          </button>
          */}
        </div>
      </nav>

      {/* Main Tab Render */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>
          {t.loadingWorkspace}
        </div>
      ) : (
        <>
          {activeTab === 'home' && (
            <Dashboard 
              lang={lang}
              data={dashboardData} 
              onTogglePriority={handleTogglePriority}
              onAddPriority={handleAddPriority}
              onDeletePriority={handleDeletePriority}
              onReorderPriorities={handleReorderPriorities}
              onSync={onSync => handleSyncData()}
              syncing={syncing}
              onRefresh={fetchDashboardData}
            />
          )}
          {activeTab === 'action-board' && (
            <ActionBoard 
              lang={lang}
              actionBoard={dashboardData ? dashboardData.actionBoard : null}
              onRefresh={fetchDashboardData}
            />
          )}
          {activeTab === 'newsletter' && (
            <Newsletter lang={lang} />
          )}
          {activeTab === 'design' && (
            <DesignBoard lang={lang} onAddPriority={handleAddPriority} onRefresh={fetchDashboardData} />
          )}
          {activeTab === 'weekly-content' && (
            <WeeklyContent
              lang={lang}
              weeklyData={dashboardData ? dashboardData.weeklyContent : null}
              onRefresh={fetchDashboardData}
            />
          )}
          {activeTab === 'calendar' && (
            <CalendarView 
              lang={lang}
              allEvents={dashboardData ? dashboardData.allCalendarEvents : []}
              contentPlanner={dashboardData && dashboardData.weeklyContent ? dashboardData.weeklyContent.contentPlanner : []}
              brainstormIdeas={dashboardData && dashboardData.weeklyContent ? dashboardData.weeklyContent.brainstormIdeas : []}
              onRefresh={fetchDashboardData}
            />
          )}
        </>
      )}
    </div>
  );
}
