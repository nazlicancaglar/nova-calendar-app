import React, { useState, useEffect, useRef } from 'react';
import { Sun, Check, Mail, Plus, Trash2, Pencil, X, CheckSquare, RefreshCw } from 'lucide-react';
import { translations } from '../translations';

export default function Dashboard({ lang, data, onTogglePriority, onAddPriority, onDeletePriority, onSync, syncing, onRefresh }) {
  const t = translations[lang] || translations.en;
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [taskText, setTaskText] = useState('');
  const [taskPriority, setTaskPriority] = useState('MED');

  const [categories, setCategories] = useState([]);
  const [isEventModalOpen, setIsEventModalOpen] = useState(false);
  const [eventTitle, setEventTitle] = useState('');
  const [eventDate, setEventDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [eventTime, setEventTime] = useState('');
  const [eventDetails, setEventDetails] = useState('');
  const [eventCategoryId, setEventCategoryId] = useState('');
  const [showNewCategoryForm, setShowNewCategoryForm] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryColor, setNewCategoryColor] = useState('#f97316');

  // Event editing & Category management states
  const [editingEventId, setEditingEventId] = useState(null);
  const [isManagingCategories, setIsManagingCategories] = useState(false);
  const [editingCategoryId, setEditingCategoryId] = useState(null);
  const [editingCategoryName, setEditingCategoryName] = useState('');
  const [editingCategoryColor, setEditingCategoryColor] = useState('#f97316');

  // Goals state — fetched from API, fully editable
  const [goals, setGoals] = useState([]);
  const [editingGoalIdx, setEditingGoalIdx] = useState(null);
  const [editingGoalText, setEditingGoalText] = useState('');
  const [newGoalText, setNewGoalText] = useState('');
  const [showNewGoalInput, setShowNewGoalInput] = useState(false);
  const editInputRef = useRef(null);
  const newGoalRef = useRef(null);

  // ── Categories & Custom Events: load from API on mount ───────────────────
  useEffect(() => {
    fetch('/api/dashboard/categories')
      .then(r => r.json())
      .then(fetchedCats => {
        setCategories(fetchedCats || []);
        if (fetchedCats && fetchedCats.length > 0) {
          setEventCategoryId(fetchedCats[0].id);
        }
      })
      .catch(err => console.error('Error fetching categories:', err));
  }, []);

  const handleOpenEventModal = (eventToEdit = null) => {
    setIsEventModalOpen(true);
    setIsManagingCategories(false);
    
    if (eventToEdit && eventToEdit.isCustom) {
      setEditingEventId(eventToEdit.id);
      setEventTitle(eventToEdit.title || '');
      setEventDate(eventToEdit.date || new Date().toISOString().split('T')[0]);
      setEventTime(eventToEdit.time || '');
      setEventDetails(eventToEdit.details || '');
      setEventCategoryId(eventToEdit.categoryId || '');
    } else {
      setEditingEventId(null);
      setEventTitle('');
      setEventDate(new Date().toISOString().split('T')[0]);
      setEventTime('');
      setEventDetails('');
      if (categories.length > 0) {
        setEventCategoryId(categories[0].id);
      }
    }
    setShowNewCategoryForm(false);
  };

  const handleCloseEventModal = () => {
    setIsEventModalOpen(false);
    setEditingEventId(null);
    setIsManagingCategories(false);
  };

  const handleCreateCategory = (e) => {
    e.preventDefault();
    if (!newCategoryName.trim()) return;
    
    fetch('/api/dashboard/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newCategoryName.trim(), color: newCategoryColor })
    })
      .then(r => r.json())
      .then(resData => {
        if (resData.success && resData.categories) {
          setCategories(resData.categories);
          const created = resData.categories.find(c => c.name.toLowerCase() === newCategoryName.trim().toLowerCase());
          if (created) {
            setEventCategoryId(created.id);
          }
          setNewCategoryName('');
          setShowNewCategoryForm(false);
        }
      })
      .catch(err => console.error('Error creating category:', err));
  };

  const handleSaveCategoryEdit = (e) => {
    e.preventDefault();
    if (!editingCategoryName.trim() || !editingCategoryId) return;

    fetch('/api/dashboard/categories/edit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: editingCategoryId, name: editingCategoryName.trim(), color: editingCategoryColor })
    })
      .then(r => r.json())
      .then(resData => {
        if (resData.success && resData.categories) {
          setCategories(resData.categories);
          setEditingCategoryId(null);
          if (onRefresh) onRefresh();
        }
      })
      .catch(err => console.error('Error editing category:', err));
  };

  const handleDeleteCategory = (id) => {
    if (!confirm('Are you sure you want to delete this category? All events under this category will be reset to General.')) return;
    fetch('/api/dashboard/categories/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id })
    })
      .then(r => r.json())
      .then(resData => {
        if (resData.success && resData.categories) {
          setCategories(resData.categories);
          if (onRefresh) onRefresh();
        }
      })
      .catch(err => console.error('Error deleting category:', err));
  };

  const handleCreateEvent = (e) => {
    e.preventDefault();
    if (!eventTitle.trim() || !eventDate || !eventTime.trim()) return;

    fetch('/api/dashboard/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: editingEventId,
        title: eventTitle.trim(),
        date: eventDate,
        time: eventTime.trim(),
        details: eventDetails.trim(),
        categoryId: eventCategoryId
      })
    })
      .then(r => r.json())
      .then(resData => {
        if (resData.success && onRefresh) {
          onRefresh();
        }
      })
      .catch(err => console.error('Error creating event:', err))
      .finally(() => {
        setIsEventModalOpen(false);
        setEditingEventId(null);
      });
  };

  const handleDeleteEvent = (id) => {
    if (!confirm('Are you sure you want to delete this event?')) return;
    fetch('/api/dashboard/events/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id })
    })
      .then(r => r.json())
      .then(resData => {
        if (resData.success && onRefresh) {
          onRefresh();
        }
      })
      .catch(err => console.error('Error deleting event:', err));
  };

  if (!data) return null;

  const { weather, todayContent, emails, calendar } = data;

  // ── Goals: load from API on mount ──────────────────────────────────────────
  useEffect(() => {
    fetch('/api/goals')
      .then(r => r.json())
      .then(fetchedGoals => {
        // Normalize — goals can be strings or objects
        const normalized = fetchedGoals.map((g, i) =>
          typeof g === 'string'
            ? { id: String(i), text: g, completed: false, subtasks: [] }
            : { id: g.id || String(i), text: g.text || g, completed: g.completed || false, subtasks: g.subtasks || [] }
        );
        setGoals(normalized);
      })
      .catch(() => {
        // Fallback: use data.goals from dashboard cache
        const fallback = (data.goals || []).map((g, i) =>
          typeof g === 'string'
            ? { id: String(i), text: g, completed: false, subtasks: [] }
            : { id: g.id || String(i), text: g.text || g, completed: g.completed || false, subtasks: g.subtasks || [] }
        );
        setGoals(fallback);
      });
  }, []);

  // Focus editing input when opened
  useEffect(() => {
    if (editingGoalIdx !== null && editInputRef.current) {
      editInputRef.current.focus();
    }
  }, [editingGoalIdx]);

  useEffect(() => {
    if (showNewGoalInput && newGoalRef.current) {
      newGoalRef.current.focus();
    }
  }, [showNewGoalInput]);

  const saveGoals = (updated) => {
    setGoals(updated);
    fetch('/api/goals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ goals: updated })
    }).catch(err => console.error('Failed to save goals:', err));
  };

  const handleGoalToggle = (id) => {
    const updated = goals.map(g => {
      if (g.id === id) {
        const targetVal = !g.completed;
        const subtasks = (g.subtasks || []).map(s => ({ ...s, completed: targetVal }));
        return { ...g, completed: targetVal, subtasks };
      }
      return g;
    });
    saveGoals(updated);
  };

  const handleGoalEditStart = (goal, idx) => {
    setEditingGoalIdx(idx);
    setEditingGoalText(goal.text);
  };

  const handleGoalEditSave = () => {
    if (!editingGoalText.trim()) return;
    const updated = goals.map((g, i) =>
      i === editingGoalIdx ? { ...g, text: editingGoalText.trim() } : g
    );
    saveGoals(updated);
    setEditingGoalIdx(null);
    setEditingGoalText('');
  };

  const handleGoalEditKeyDown = (e) => {
    if (e.key === 'Enter') handleGoalEditSave();
    if (e.key === 'Escape') { setEditingGoalIdx(null); setEditingGoalText(''); }
  };

  const handleGoalDelete = (id) => {
    const updated = goals.filter(g => g.id !== id);
    saveGoals(updated);
  };

  const handleGoalAdd = () => {
    if (!newGoalText.trim()) {
      setShowNewGoalInput(false);
      return;
    }
    const newGoal = { id: Date.now().toString(), text: newGoalText.trim(), completed: false };
    const updated = [...goals, newGoal];
    saveGoals(updated);
    setNewGoalText('');
    setShowNewGoalInput(false);
  };

  const handleNewGoalKeyDown = (e) => {
    if (e.key === 'Enter') handleGoalAdd();
    if (e.key === 'Escape') { setShowNewGoalInput(false); setNewGoalText(''); }
  };

  // ── Top Priorities: pull today's Calendar tasks ─────────────────────────────
  const todayStr = (() => {
    const d = new Date();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${mm}-${dd}`;
  })();
  const todayDayName = new Date().toLocaleDateString('en-US', { weekday: 'long' });

  // Get today's week range (Mon–Sun) for day-name matching
  const getTodayWeekRange = () => {
    const today = new Date();
    const day = today.getDay();
    const diff = today.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(today); monday.setDate(diff); monday.setHours(0,0,0,0);
    const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6); sunday.setHours(23,59,59,999);
    return { monday, sunday };
  };
  const todayWeek = getTodayWeekRange();
  const now = new Date();

  // Merge priorities from cache + today's calendar tasks
  const allContentPlanner = data.weeklyContent?.contentPlanner || [];
  const calendarTodayItems = allContentPlanner.filter(item => {
    if (item.type !== 'task') return false; // Filter out content plans
    if (item.date && item.date === todayStr) return true;
    if (!item.date && item.day === todayDayName) {
      return now >= todayWeek.monday && now <= todayWeek.sunday;
    }
    return false;
  });

  // Static priorities from cache + live calendar items for today
  const staticPriorities = data.priorities || [];
  const calendarPriorities = calendarTodayItems.map(item => ({
    id: `cal-${item.id || item.topic || item.title || 'untitled'}`,
    text: item.topic || item.title || 'Untitled',
    priority: item.type === 'task' ? (item.priority || 'MED') : 'MED',
    checked: item.checked || false,
    isCalendar: true,
    format: item.format,
    type: item.type
  }));

  // Combine, dedup by text
  const allPriorities = [
    ...staticPriorities,
    ...calendarPriorities.filter(cp => !staticPriorities.some(sp => sp.text === cp.text))
  ];

  // ── Add Task Modal ─────────────────────────────────────────────────────────
  const handleOpenModal = () => { setIsModalOpen(true); setTaskText(''); setTaskPriority('MED'); };
  const handleCloseModal = () => setIsModalOpen(false);
  const handleSubmit = (e) => {
    e.preventDefault();
    if (!taskText.trim()) return;
    onAddPriority(taskText.trim(), taskPriority);
    setIsModalOpen(false);
  };

  const formatTodayDate = () => new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });

  return (
    <div className="dashboard-container" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* Header Panel */}
      <div className="header dashboard-header">
        <div className="greeting">
          <h1 style={{ margin: 0, padding: 0 }}>{t.goodMorning} <span className="name">Nova</span></h1>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <div className="date-capsule">{formatTodayDate()}</div>
          {onSync && (
            <button
              className={`sync-button ${syncing ? 'spinning' : ''}`}
              onClick={onSync}
              disabled={syncing}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 16px',
                fontSize: '14px',
                fontWeight: '500',
                color: 'var(--color-coral-dark)',
                background: 'var(--color-coral-light)',
                borderRadius: '20px',
                transition: 'var(--transition-smooth)',
                cursor: 'pointer',
                border: 'none'
              }}
            >
              <RefreshCw size={14} className={syncing ? 'spinning' : ''} />
              {syncing ? t.syncingBtn : t.syncNowBtn}
            </button>
          )}
        </div>
      </div>

      {/* Weather Widget */}
      {weather && (
        <div className="weather-widget">
          <div className="weather-icon-container"><Sun size={32} /></div>
          <div className="weather-info">
            <div className="weather-tag">{t.weatherFilming}</div>
            <div className="weather-temp">{weather.temp} · {weather.condition}</div>
            <div className="weather-desc">{weather.summary}</div>
          </div>
        </div>
      )}

      {/* Today's Content Widget */}
      {todayContent && todayContent.length > 0 && (
        <div className="dashboard-card">
          <div className="card-header">
            <h2 className="card-title">{t.todaysContent}</h2>
            <span className="badge badge-gray">{todayContent[0].status || t.onePostBadge}</span>
          </div>
          <div className="content-list">
            {todayContent.map((item, index) => (
              <div className="content-item" key={index}>
                <div className="bullet-red"></div>
                <div className="content-body">
                  <div className="content-title">{item.title}</div>
                  <div className="content-desc">{item.type} · {item.details}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Emails Widget (Temporarily Hidden) */}

      {/* Your Day (Calendar Events) */}
      {calendar && (
        <div className="dashboard-card">
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h2 className="card-title">{t.yourDay}</h2>
              <span className="badge badge-green">
                {calendar.length === 1 ? t.oneEventBadge : `${calendar.length} ${t.eventsBadgeSuffix}`}
              </span>
            </div>
            <button className="add-task-btn" onClick={handleOpenEventModal}>
              <Plus size={14} /><span>Add Event</span>
            </button>
          </div>
          <div className="calendar-list">
            {calendar.map((event, index) => (
              <div 
                className="calendar-item" 
                key={index}
                style={event.categoryColor ? { borderLeft: `4px solid ${event.categoryColor}`, paddingLeft: '10px' } : {}}
              >
                <span className="calendar-time">{event.time}</span>
                <div 
                  className="calendar-details" 
                  style={{ 
                    display: 'flex', 
                    flexDirection: 'row', 
                    justifyContent: 'space-between', 
                    alignItems: 'flex-start', 
                    width: '100%', 
                    flex: 1, 
                    borderLeft: event.categoryColor ? 'none' : undefined, 
                    paddingLeft: event.categoryColor ? 0 : undefined 
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', textAlign: 'left' }}>
                    <span className="calendar-title" style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', textAlign: 'left', justifyContent: 'flex-start' }}>
                      {event.title}
                      {event.categoryName && (
                        <span 
                          style={{ 
                            fontSize: '9px', 
                            fontWeight: '700', 
                            background: event.categoryColor || 'var(--border-card)', 
                            color: '#fff', 
                            padding: '1px 6px', 
                            borderRadius: '4px',
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em'
                          }}
                        >
                          {event.categoryName}
                        </span>
                      )}
                    </span>
                    <span className="calendar-desc" style={{ textAlign: 'left' }}>{event.details}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexShrink: 0 }}>
                    {event.isCustom && (
                      <>
                        <button 
                          onClick={() => handleOpenEventModal(event)} 
                          style={{ 
                            background: 'transparent', 
                            border: 'none', 
                            cursor: 'pointer', 
                            color: 'var(--text-muted)', 
                            padding: '4px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}
                          title="Edit Event"
                        >
                          <Pencil size={13} />
                        </button>
                        <button 
                          onClick={() => handleDeleteEvent(event.id)} 
                          style={{ 
                            background: 'transparent', 
                            border: 'none', 
                            cursor: 'pointer', 
                            color: 'var(--text-muted)', 
                            padding: '4px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}
                          title="Delete Event"
                        >
                          <Trash2 size={13} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {calendar.length === 0 && (
              <div className="calendar-item">
                <span className="calendar-time">Agenda</span>
                <div className="calendar-details">
                  <span className="calendar-title">{t.noEventsScheduled}</span>
                  <span className="calendar-desc">{t.perfectDayDeepWork}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Top Priorities Today — from Calendar + manual tasks */}
      <div className="dashboard-card">
        <div className="card-header">
          <h2 className="card-title">{t.topPrioritiesToday}</h2>
          <button className="add-task-btn" onClick={handleOpenModal}>
            <Plus size={14} /><span>{t.addTask}</span>
          </button>
        </div>
        {calendarPriorities.length > 0 && (
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '5px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--color-coral-dark)', display: 'inline-block' }}></span>
            {`${calendarPriorities.length} ${calendarPriorities.length > 1 ? 'items' : 'item'} from today's calendar`}
          </div>
        )}
        <div className="priority-list">
          {allPriorities.map((item) => (
            <div className="priority-item" key={item.id}>
              <div
                className={`checkbox-container ${item.checked ? 'checked' : ''}`}
                onClick={() => onTogglePriority(item.id)}
                style={{ cursor: 'pointer' }}
              >
                <div className="checkbox-box">
                  {item.checked && <Check size={12} strokeWidth={3} />}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                  <span className="checkbox-label" style={{ textDecoration: item.checked ? 'line-through' : 'none' }}>
                    {item.text}
                  </span>

                </div>
              </div>
              <div className="priority-actions">
                {item.priority && (
                  <span className={`priority-tag ${item.priority.toLowerCase()}`}>{item.priority}</span>
                )}
                 {!item.isCalendar ? (
                  <button
                    className="delete-task-btn"
                    onClick={(e) => { e.stopPropagation(); onDeletePriority(item.id); }}
                    title={t.deleteTask}
                  >
                    <Trash2 size={13} />
                  </button>
                ) : (
                  <div style={{ width: '21px', flexShrink: 0 }} />
                )}
              </div>
            </div>
          ))}
          {allPriorities.length === 0 && (
            <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)', fontSize: '14px' }}>
              {t.noPrioritiesToday}
            </div>
          )}
        </div>
      </div>

      {/* Goals — Fully editable in-place */}
      <div className="dashboard-card">
        <div className="card-header">
          <h2 className="card-title">{t.goals}</h2>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>

            {/* Date card — table-number style */}
            {(() => {
              const now = new Date();
              const day = String(now.getDate()).padStart(2, '0');
              const month = now.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
              const year = now.getFullYear();
              return (
                <div style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  background: 'rgba(245, 240, 235, 0.9)',
                  border: '1px solid rgba(183, 157, 148, 0.25)',
                  borderRadius: '10px', padding: '4px 11px 5px',
                  lineHeight: 1, minWidth: '52px', height: '44px',
                  justifyContent: 'center'
                }}>
                  <span style={{
                    fontSize: '8.5px', fontWeight: '600', letterSpacing: '0.13em',
                    color: 'rgba(130, 100, 90, 0.65)', textTransform: 'uppercase',
                    marginBottom: '2px'
                  }}>
                    {month} {year}
                  </span>
                  <span style={{
                    fontSize: '24px', fontWeight: '700',
                    color: 'var(--color-coral-dark)',
                    fontFamily: '"Georgia", "Times New Roman", serif',
                    letterSpacing: '-0.03em', lineHeight: 1
                  }}>
                    {day}
                  </span>
                </div>
              );
            })()}

            <button
              onClick={() => setShowNewGoalInput(!showNewGoalInput)}
              style={{
                display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px',
                color: 'var(--color-coral-dark)', padding: '0 12px',
                background: 'rgba(228, 209, 203, 0.3)', borderRadius: '10px',
                border: '1px solid rgba(183, 157, 148, 0.3)', cursor: 'pointer',
                height: '44px', whiteSpace: 'nowrap'
              }}
            >
              <Plus size={12} /> {t.newGoal}
            </button>
          </div>


        </div>

        <div className="goals-list">
          {goals.map((goal, idx) => (
            <div
              key={goal.id}
              className="goal-item"
              style={{ position: 'relative', alignItems: 'flex-start' }}
            >
              {/* Completion toggle */}
              <button
                onClick={() => handleGoalToggle(goal.id)}
                style={{
                  width: '18px', height: '18px', borderRadius: '4px', flexShrink: 0, marginTop: '1px',
                  border: '1.5px solid var(--color-coral-dark)',
                  background: goal.completed ? 'var(--color-coral-dark)' : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer'
                }}
              >
                {goal.completed && <Check size={11} strokeWidth={3} color="white" />}
              </button>

              {/* Goal text — click to edit */}
              {editingGoalIdx === idx ? (
                <input
                  ref={editInputRef}
                  value={editingGoalText}
                  onChange={e => setEditingGoalText(e.target.value)}
                  onBlur={handleGoalEditSave}
                  onKeyDown={handleGoalEditKeyDown}
                  style={{
                    flex: 1, fontSize: '14px', padding: '2px 8px',
                    background: 'rgba(228, 209, 203, 0.2)', border: '1px solid var(--color-coral-dark)',
                    borderRadius: '6px', color: 'var(--text-main)', outline: 'none'
                  }}
                />
              ) : (
                <span
                  className="goal-text"
                  onClick={() => handleGoalToggle(goal.id)}
                  style={{
                    cursor: 'pointer', flex: 1,
                    textDecoration: goal.completed ? 'line-through' : 'none',
                    opacity: goal.completed ? 0.5 : 1
                  }}
                  title={t.clickToToggle}
                >
                  {goal.text}
                  {goal.subtasks && goal.subtasks.length > 0 && (
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: '6px' }}>
                      ({goal.subtasks.filter(s => s.completed).length}/{goal.subtasks.length})
                    </span>
                  )}
                </span>
              )}

              {/* Actions */}
              <div style={{ display: 'flex', gap: '6px', opacity: 0, transition: '0.15s' }} className="goal-actions">
                <button onClick={() => handleGoalEditStart(goal, idx)} title={t.edit} style={{ color: 'var(--text-muted)', cursor: 'pointer' }}>
                  <Pencil size={12} />
                </button>
                <button onClick={() => handleGoalDelete(goal.id)} title={t.delete} style={{ color: '#e57373', cursor: 'pointer' }}>
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          ))}

          {/* New Goal Input */}
          {showNewGoalInput && (
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '8px' }}>
              <div style={{ width: '18px', height: '18px', flexShrink: 0, border: '1.5px dashed var(--color-coral-dark)', borderRadius: '4px' }} />
              <input
                ref={newGoalRef}
                value={newGoalText}
                onChange={e => setNewGoalText(e.target.value)}
                onKeyDown={handleNewGoalKeyDown}
                onBlur={handleGoalAdd}
                placeholder={t.addGoalPlaceholder}
                style={{
                  flex: 1, fontSize: '14px', padding: '6px 10px',
                  background: 'rgba(228, 209, 203, 0.15)', border: '1px dashed var(--color-coral-dark)',
                  borderRadius: '8px', color: 'var(--text-main)', outline: 'none'
                }}
              />
              <button
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleGoalAdd();
                }}
                style={{ color: 'var(--color-coral-dark)', cursor: 'pointer', padding: '4px' }}
              >
                <Check size={16} />
              </button>
              <button
                onMouseDown={(e) => {
                  e.preventDefault();
                  setShowNewGoalInput(false);
                  setNewGoalText('');
                }}
                style={{ color: 'var(--text-muted)', cursor: 'pointer', padding: '4px' }}
              >
                <X size={16} />
              </button>
            </div>
          )}

          {goals.length === 0 && !showNewGoalInput && (
            <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)', fontSize: '14px' }}>
              {t.noGoalsYet}
            </div>
          )}
        </div>
      </div>

      {/* Add Task Modal */}
      {isModalOpen && (
        <div className="modal-overlay" onClick={handleCloseModal}>
          <div className="modal-content task-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">{t.addNewTask}</h3>
              <button className="modal-close-btn" onClick={handleCloseModal}>&times;</button>
            </div>
            <form onSubmit={handleSubmit} className="task-form">
              <div className="form-group">
                <label htmlFor="taskText" className="form-label">{t.accomplishQuestion}</label>
                <input
                  type="text" id="taskText" className="form-input"
                  value={taskText} onChange={(e) => setTaskText(e.target.value)}
                  placeholder="e.g., Plan newsletter carousel" autoFocus required
                />
              </div>
              <div className="form-group">
                <label className="form-label">{t.priorityLevel}</label>
                <div className="priority-selector">
                  {['HIGH', 'MED', 'LOW'].map(p => (
                    <label key={p} className={`priority-option ${p.toLowerCase()} ${taskPriority === p ? 'selected' : ''}`}>
                      <input type="radio" name="priority" value={p} checked={taskPriority === p}
                        onChange={() => setTaskPriority(p)} style={{ display: 'none' }} />
                      <span>{p === 'HIGH' ? t.high : p === 'MED' ? t.medium : t.low}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="form-actions">
                <button type="button" className="btn btn-secondary" onClick={handleCloseModal}>{t.cancel}</button>
                <button type="submit" className="btn btn-primary">{t.createTask}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add/Edit Event Modal */}
      {isEventModalOpen && (
        <div className="modal-overlay" onClick={handleCloseEventModal}>
          <div className="modal-content task-modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '460px' }}>
            <div className="modal-header">
              <h3 className="modal-title">
                {isManagingCategories 
                  ? 'Manage Categories' 
                  : (editingEventId ? 'Edit Custom Event' : 'Add Custom Event')}
              </h3>
              <button className="modal-close-btn" onClick={handleCloseEventModal}>&times;</button>
            </div>
            
            {isManagingCategories ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '320px', overflowY: 'auto', paddingRight: '4px' }}>
                  {categories.map(cat => (
                    <div key={cat.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px', background: 'rgba(228, 209, 203, 0.1)', border: '1px solid var(--border-card)', borderRadius: '8px' }}>
                      {editingCategoryId === cat.id ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
                          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <input 
                              type="text" 
                              className="form-input" 
                              value={editingCategoryName} 
                              onChange={e => setEditingCategoryName(e.target.value)} 
                              style={{ flex: 1, padding: '6px 10px', fontSize: '13px' }} 
                            />
                            <button 
                              type="button" 
                              onClick={handleSaveCategoryEdit} 
                              className="btn btn-primary" 
                              style={{ padding: '6px 12px', fontSize: '12px', height: '32px', minWidth: 'auto' }}
                            >
                              Save
                            </button>
                            <button 
                              type="button" 
                              onClick={() => setEditingCategoryId(null)} 
                              className="btn btn-secondary" 
                              style={{ padding: '6px 12px', fontSize: '12px', height: '32px', minWidth: 'auto' }}
                            >
                              Cancel
                            </button>
                          </div>
                          <div>
                            <label style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px', display: 'block' }}>Choose Color Theme:</label>
                            <div style={{ display: 'flex', gap: '6px' }}>
                              {['#ef4444', '#f97316', '#f59e0b', '#10b981', '#3b82f6', '#6366f1', '#8b5cf6', '#ec4899'].map(color => (
                                <button
                                  key={color}
                                  type="button"
                                  onClick={() => setEditingCategoryColor(color)}
                                  style={{
                                    width: '18px',
                                    height: '18px',
                                    borderRadius: '50%',
                                    background: color,
                                    border: editingCategoryColor === color ? '2px solid var(--text-main)' : '1px solid rgba(0,0,0,0.15)',
                                    cursor: 'pointer',
                                    padding: 0
                                  }}
                                />
                              ))}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ width: '12px', height: '12px', borderRadius: '50%', background: cat.color, display: 'inline-block' }} />
                            <span style={{ fontSize: '14px', fontWeight: '500', color: 'var(--text-main)' }}>{cat.name}</span>
                          </div>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button 
                              type="button" 
                              onClick={() => {
                                setEditingCategoryId(cat.id);
                                setEditingCategoryName(cat.name);
                                setEditingCategoryColor(cat.color);
                              }}
                              style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '4px' }}
                              title="Edit Category Name & Color"
                            >
                              <Pencil size={13} />
                            </button>
                            <button 
                              type="button" 
                              onClick={() => handleDeleteCategory(cat.id)}
                              style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#e57373', padding: '4px' }}
                              title="Delete Category"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                  {categories.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '16px', color: 'var(--text-muted)', fontSize: '13px' }}>
                      No categories created yet.
                    </div>
                  )}
                </div>
                <div className="form-actions" style={{ marginTop: '8px' }}>
                  <button 
                    type="button" 
                    className="btn btn-secondary" 
                    onClick={() => setIsManagingCategories(false)}
                    style={{ width: '100%' }}
                  >
                    Back to Event Form
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleCreateEvent} className="task-form" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div className="form-group">
                  <label className="form-label">Event Title</label>
                  <input
                    type="text"
                    className="form-input"
                    value={eventTitle}
                    onChange={(e) => setEventTitle(e.target.value)}
                    placeholder="e.g., Brand partnership meeting"
                    required
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="form-group">
                    <label className="form-label">Date</label>
                    <input
                      type="date"
                      className="form-input"
                      value={eventDate}
                      onChange={(e) => setEventDate(e.target.value)}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Time</label>
                    <input
                      type="text"
                      className="form-input"
                      value={eventTime}
                      onChange={(e) => setEventTime(e.target.value)}
                      placeholder="e.g., 2:00 PM - 3:00 PM"
                      required
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Details / Description</label>
                  <textarea
                    className="form-input"
                    value={eventDetails}
                    onChange={(e) => setEventDetails(e.target.value)}
                    placeholder="Additional event description..."
                    rows={2}
                    style={{ fontFamily: 'inherit', resize: 'vertical' }}
                  />
                </div>

                <div className="form-group">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <label className="form-label" style={{ marginBottom: 0 }}>Category</label>
                    <button 
                      type="button" 
                      onClick={() => setIsManagingCategories(true)} 
                      style={{ 
                        background: 'transparent', 
                        border: 'none', 
                        color: 'var(--color-coral-dark)', 
                        fontSize: '11px', 
                        fontWeight: '600',
                        cursor: 'pointer', 
                        padding: 0,
                        textDecoration: 'underline' 
                      }}
                    >
                      Manage Categories
                    </button>
                  </div>
                  <select
                    className="form-input"
                    value={eventCategoryId}
                    onChange={(e) => {
                      if (e.target.value === 'new') {
                        setShowNewCategoryForm(true);
                      } else {
                        setEventCategoryId(e.target.value);
                        setShowNewCategoryForm(false);
                      }
                    }}
                  >
                    {categories.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                    <option value="new">+ Create New Category...</option>
                  </select>
                </div>

                {showNewCategoryForm && (
                  <div style={{ 
                    background: 'var(--bg-app)', 
                    border: '1px dashed var(--border-card)', 
                    borderRadius: '8px', 
                    padding: '12px', 
                    display: 'flex', 
                    flexDirection: 'column', 
                    gap: '10px' 
                  }}>
                    <div style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-muted)' }}>Create Custom Category</div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <input
                        type="text"
                        className="form-input"
                        value={newCategoryName}
                        onChange={(e) => setNewCategoryName(e.target.value)}
                        placeholder="Category Name (e.g. Finance)"
                        style={{ flex: 1, padding: '6px 8px', fontSize: '13px' }}
                      />
                      <button 
                        type="button" 
                        onClick={handleCreateCategory}
                        className="btn btn-primary"
                        style={{ padding: '6px 12px', fontSize: '12px', height: '32px', minWidth: 'auto' }}
                      >
                        Save Category
                      </button>
                    </div>
                    <div>
                      <label style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px', display: 'block' }}>Choose Color Theme:</label>
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        {[
                          '#ef4444', '#f97316', '#f59e0b', '#10b981', 
                          '#3b82f6', '#6366f1', '#8b5cf6', '#ec4899'
                        ].map(color => (
                          <button
                            key={color}
                            type="button"
                            onClick={() => setNewCategoryColor(color)}
                            style={{
                              width: '20px',
                              height: '20px',
                              borderRadius: '50%',
                              background: color,
                              border: newCategoryColor === color ? '2px solid var(--text-main)' : '1px solid rgba(0,0,0,0.15)',
                              cursor: 'pointer',
                              padding: 0
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                <div className="form-actions">
                  <button type="button" className="btn btn-secondary" onClick={handleCloseEventModal}>Cancel</button>
                  <button type="submit" className="btn btn-primary">
                    {editingEventId ? 'Save Changes' : 'Create Event'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
