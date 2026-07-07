import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, Trash2, Clock, Calendar as CalendarIcon, FileText, X } from 'lucide-react';
import { translations } from '../translations';

export default function CalendarView({ lang, allEvents = [], contentPlanner = [], onRefresh }) {
  const t = translations[lang] || translations.en;
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDateStr, setSelectedDateStr] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState('add'); // 'add', 'edit', 'view-event'
  const [selectedEvent, setSelectedEvent] = useState(null);

  // Form states for Content Plan & Tasks
  const [planId, setPlanId] = useState('');
  const [planTopic, setPlanTopic] = useState('');
  const [planFormat, setPlanFormat] = useState('Reels');
  const [planStatus, setPlanStatus] = useState('Planned');
  const [planOutline, setPlanOutline] = useState('');
  const [planType, setPlanType] = useState('content'); // 'content' or 'task'
  const [taskPriority, setTaskPriority] = useState('MED');
  const [taskChecked, setTaskChecked] = useState(false);
  const [taskNotes, setTaskNotes] = useState('');

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  // Helper to format date as YYYY-MM-DD in local time
  const formatDateStr = (year, month, day) => {
    const mm = (month + 1).toString().padStart(2, '0');
    const dd = day.toString().padStart(2, '0');
    return `${year}-${mm}-${dd}`;
  };

  // Month navigation
  const prevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  // Get days in month
  const getDaysInMonth = (year, month) => {
    return new Date(year, month + 1, 0).getDate();
  };

  // Get week range of today (system time) to match legacy "day: Monday" items
  const getTodayWeekRange = () => {
    const today = new Date();
    const day = today.getDay();
    // Monday is start of week
    const diff = today.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(today.setDate(diff));
    monday.setHours(0, 0, 0, 0);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);
    return { monday, sunday };
  };

  const todayWeek = getTodayWeekRange();

  // Match items for a given cell date
  const getItemsForDate = (dateObj) => {
    const cellDateStr = formatDateStr(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate());
    const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'long' });

    // 1. Match Google/Outlook Calendar events
    const calendarEvents = allEvents.filter(e => e.date === cellDateStr);

    // 2. Match Content Planner items
    const contentItems = contentPlanner.filter(item => {
      if (item.date && item.date === cellDateStr) {
        return true;
      }
      // If legacy item with no date, map to this week's matching day
      if (!item.date && item.day === dayName) {
        return dateObj >= todayWeek.monday && dateObj <= todayWeek.sunday;
      }
      return false;
    });

    return { calendarEvents, contentItems };
  };

  // Open modal to add plan
  const handleAddPlanClick = (dateStr) => {
    setSelectedDateStr(dateStr);
    setPlanId('');
    setPlanTopic('');
    setPlanFormat('Reels');
    setPlanStatus('Planned');
    setPlanOutline('');
    setPlanType('content');
    setTaskPriority('MED');
    setTaskChecked(false);
    setTaskNotes('');
    setModalMode('add');
    setIsModalOpen(true);
  };

  // Open modal to edit plan
  const handleEditPlanClick = (item, dateStr) => {
    setSelectedDateStr(dateStr || item.date || '');
    setPlanId(item.id || '');
    setPlanTopic(item.topic || '');
    setPlanFormat(item.format || 'Reels');
    setPlanStatus(item.status || 'Planned');
    setPlanOutline(item.outline || '');
    setPlanType(item.type || 'content');
    setTaskPriority(item.priority || 'MED');
    setTaskChecked(item.checked || false);
    setTaskNotes(item.notes || '');
    setModalMode('edit');
    setIsModalOpen(true);
  };

  // Open modal to view calendar event details
  const handleViewEventClick = (event) => {
    setSelectedEvent(event);
    setModalMode('view-event');
    setIsModalOpen(true);
  };

  // Save Content Plan
  const handleSavePlan = (e) => {
    e.preventDefault();
    if (!planTopic.trim()) return;

    const bodyData = {
      id: planId || undefined,
      date: selectedDateStr,
      topic: planTopic,
      format: planFormat,
      status: planStatus,
      outline: planOutline,
      notes: taskNotes,
      isManual: true,
      type: planType,
      priority: taskPriority,
      checked: taskChecked
    };

    fetch('/api/weekly-content/planner', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bodyData)
    })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setIsModalOpen(false);
          if (onRefresh) onRefresh();
        }
      })
      .catch(err => console.error('Error saving content plan:', err));
  };

  // Toggle calendar task status directly
  const handleToggleCalendarTask = (item) => {
    const bodyData = {
      ...item,
      checked: !item.checked
    };

    fetch('/api/weekly-content/planner', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bodyData)
    })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          if (onRefresh) onRefresh();
        }
      })
      .catch(err => console.error('Error toggling calendar task:', err));
  };

  // Delete Content Plan
  const handleDeletePlan = () => {
    if (!planId) return;

    fetch('/api/weekly-content/planner/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: planId })
    })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setIsModalOpen(false);
          if (onRefresh) onRefresh();
        }
      })
      .catch(err => console.error('Error deleting content plan:', err));
  };

  // Generate calendar grid array
  const generateGrid = () => {
    const daysInMonth = getDaysInMonth(year, month);
    const firstDayIndex = new Date(year, month, 1).getDay(); // 0 is Sunday, 1 is Monday...
    const adjustedFirstDay = firstDayIndex === 0 ? 6 : firstDayIndex - 1; // Start with Monday

    const cells = [];
    const prevMonthDays = getDaysInMonth(year, month - 1);

    // Padding from previous month
    for (let i = adjustedFirstDay - 1; i >= 0; i--) {
      const prevDate = new Date(year, month - 1, prevMonthDays - i);
      cells.push({ date: prevDate, isCurrentMonth: false });
    }

    // Days in current month
    for (let i = 1; i <= daysInMonth; i++) {
      const currentDateObj = new Date(year, month, i);
      cells.push({ date: currentDateObj, isCurrentMonth: true });
    }

    // Padding for next month to finish row/grid
    const remainingCells = 42 - cells.length; // standard 6-row grid
    for (let i = 1; i <= remainingCells; i++) {
      const nextDate = new Date(year, month + 1, i);
      cells.push({ date: nextDate, isCurrentMonth: false });
    }

    return cells;
  };

  const getOverdueTasks = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return contentPlanner.filter(item => {
      if (item.type !== 'task') return false;
      if (item.checked) return false;
      if (!item.date) return false;

      const parts = item.date.split('-');
      const taskDate = new Date(parts[0], parts[1] - 1, parts[2]);
      taskDate.setHours(0, 0, 0, 0);

      return taskDate < today;
    });
  };

  const handleRescheduleTask = (item, newDate) => {
    if (!newDate) return;
    const bodyData = {
      ...item,
      date: newDate
    };

    fetch('/api/weekly-content/planner', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bodyData)
    })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          if (onRefresh) onRefresh();
        }
      })
      .catch(err => console.error('Error rescheduling task:', err));
  };

  const gridCells = generateGrid();
  const weekDays = t.weekDays || ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  const monthNames = t.months || [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  return (
    <div className="calendar-widget-container">
      
      {/* Calendar Header Control */}
      <div className="calendar-widget-header">
        <div className="calendar-title-wrapper">
          <CalendarIcon size={24} style={{ color: 'var(--color-coral-dark)' }} />
          <h2>{monthNames[month]} {year}</h2>
        </div>
        <div className="calendar-nav-buttons">
          <button className="nav-btn" onClick={prevMonth}>
            <ChevronLeft size={16} />
          </button>
          <button className="nav-btn-today" onClick={() => setCurrentDate(new Date())}>
            {t.today}
          </button>
          <button className="nav-btn" onClick={nextMonth}>
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* Legend showing sources */}
      <div className="calendar-legend">
        <div className="legend-item">
          <span className="dot dot-google"></span>
          <span>{t.googleCalendar}</span>
        </div>
        <div className="legend-item">
          <span className="dot dot-outlook"></span>
          <span>{t.outlookCalendar}</span>
        </div>
        <div className="legend-item">
          <span className="dot dot-content"></span>
          <span>{t.contentPlan}</span>
        </div>
        <div className="legend-item">
          <span className="dot dot-task" style={{ background: '#3A66A6' }}></span>
          <span>{t.task}</span>
        </div>
      </div>

      {/* Grid Container */}
      <div className="calendar-grid-wrapper">
        {/* Days Header */}
        <div className="calendar-grid-header">
          {weekDays.map((day, index) => (
            <div className="grid-header-cell" key={index}>{day}</div>
          ))}
        </div>

        {/* Days Grid Cells */}
        <div className="calendar-grid-body">
          {gridCells.map((cell, index) => {
            const { date, isCurrentMonth } = cell;
            const { calendarEvents, contentItems } = getItemsForDate(date);
            const cellDateStr = formatDateStr(date.getFullYear(), date.getMonth(), date.getDate());
            
            const isToday = new Date().toDateString() === date.toDateString();

            return (
              <div 
                className={`calendar-cell ${isCurrentMonth ? 'current-month' : 'other-month'} ${isToday ? 'today' : ''}`}
                key={index}
              >
                {/* Cell Header */}
                <div className="cell-header">
                  <span className="cell-day-num">{date.getDate()}</span>
                  {isCurrentMonth && (
                    <button 
                      className="cell-add-btn" 
                      onClick={() => handleAddPlanClick(cellDateStr)}
                      title={t.addContentPlan}
                    >
                      <Plus size={10} />
                    </button>
                  )}
                </div>

                {/* Cell Content (Events List) */}
                <div className="cell-events">
                  {/* Render Google/Outlook Events */}
                  {calendarEvents.map((evt, eIdx) => {
                    const isGoogle = evt.source === 'Google Calendar';
                    return (
                      <div 
                        className={`event-pill ${isGoogle ? 'pill-google' : 'pill-outlook'}`}
                        key={`evt-${eIdx}`}
                        onClick={() => handleViewEventClick(evt)}
                        title={`${evt.title} (${evt.time})`}
                      >
                        {evt.title}
                      </div>
                    );
                  })}

                  {/* Render Content Planner Items */}
                  {contentItems.map((item, cIdx) => {
                    const isTask = item.type === 'task';
                    if (isTask) {
                      return (
                        <div 
                          className={`event-pill pill-calendar-task ${item.priority ? item.priority.toLowerCase() : 'med'} ${item.checked ? 'checked' : ''}`}
                          key={`cnt-${cIdx}`}
                          onClick={() => handleEditPlanClick(item, cellDateStr)}
                          title={`[Task] ${item.topic}`}
                          style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                        >
                          <input 
                            type="checkbox" 
                            checked={item.checked} 
                            onClick={(e) => e.stopPropagation()}
                            onChange={() => handleToggleCalendarTask(item)}
                            style={{ cursor: 'pointer', margin: 0, width: '12px', height: '12px' }}
                          />
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {item.topic}
                          </span>
                        </div>
                      );
                    }
                    return (
                      <div 
                        className="event-pill pill-content"
                        key={`cnt-${cIdx}`}
                        onClick={() => handleEditPlanClick(item, cellDateStr)}
                        title={`[${item.format}] ${item.topic}`}
                      >
                        🎬 {item.topic}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Overdue/Incomplete Tasks Section */}
      <div className="overdue-tasks-container">
        <div className="overdue-tasks-header">
          <Clock size={18} style={{ color: 'var(--color-coral-dark)' }} />
          <h3>{t.incompleteTasks}</h3>
        </div>
        
        {getOverdueTasks().length === 0 ? (
          <div className="overdue-tasks-empty">
            <span className="celebration-icon">🎉</span>
            <p>{t.noIncompleteTasks}</p>
          </div>
        ) : (
          <div className="overdue-tasks-list">
            {getOverdueTasks().map((item, idx) => (
              <div 
                key={item.id || idx} 
                className={`overdue-task-item ${item.priority ? item.priority.toLowerCase() : 'med'}`}
              >
                <div className="overdue-task-left">
                  <input 
                    type="checkbox" 
                    checked={item.checked} 
                    onChange={() => handleToggleCalendarTask(item)}
                    style={{ cursor: 'pointer', width: '16px', height: '16px', accentColor: 'var(--color-coral-dark)', marginRight: '8px' }}
                  />
                  <span 
                    className="overdue-task-title"
                    onClick={() => handleEditPlanClick(item, item.date)}
                    title="Click to edit"
                  >
                    {item.topic}
                  </span>
                  {item.notes && (
                    <span 
                      className="overdue-task-notes-indicator" 
                      title={item.notes}
                      style={{ cursor: 'help', marginLeft: '6px', fontSize: '13px' }}
                    >
                      📝
                    </span>
                  )}
                </div>
                
                <div className="overdue-task-right">
                  <span className={`overdue-priority-badge ${item.priority ? item.priority.toLowerCase() : 'med'}`}>
                    {item.priority === 'HIGH' ? t.highPriority : item.priority === 'LOW' ? t.lowPriority : t.mediumPriority}
                  </span>
                  <span className="overdue-date-badge">
                    {item.date.split('-').reverse().join('.')}
                  </span>
                  <div className="overdue-reschedule-picker">
                    <span className="reschedule-picker-label">{t.rescheduleLabel}</span>
                    <input 
                      type="date" 
                      value={item.date} 
                      onChange={(e) => handleRescheduleTask(item, e.target.value)}
                      className="overdue-reschedule-input"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add / Edit / View Modal */}
      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '500px' }}>
            <button className="modal-close" onClick={() => setIsModalOpen(false)}>
              <X size={20} />
            </button>

            {modalMode === 'view-event' && selectedEvent && (
              <div className="event-details-view">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                  <span className={`dot ${selectedEvent.source === 'Google Calendar' ? 'dot-google' : 'dot-outlook'}`}></span>
                  <span style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                    {selectedEvent.source}
                  </span>
                </div>
                <h3 className="modal-title" style={{ fontSize: '22px', marginBottom: '8px' }}>
                  {selectedEvent.title}
                </h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--color-coral-dark)', fontSize: '14px', marginBottom: '16px' }}>
                  <Clock size={14} />
                  <span>{selectedEvent.date} · {selectedEvent.time}</span>
                </div>
                <div className="event-details-content" style={{ background: 'var(--bg-app)', padding: '16px', borderRadius: '12px', fontSize: '14px', color: 'var(--text-main)', border: '1px solid var(--border-card)', lineHeight: '1.5' }}>
                  {selectedEvent.details}
                </div>
              </div>
            )}

            {(modalMode === 'add' || modalMode === 'edit') && (
              <form onSubmit={handleSavePlan} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <h3 className="modal-title" style={{ fontSize: '22px', borderBottom: '1px solid var(--border-card)', paddingBottom: '10px' }}>
                  {modalMode === 'add' ? t.addItemToCalendar : t.editCalendarItem}
                </h3>

                {/* Type Selector (Content vs Task) */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)' }}>{t.type}</label>
                  <div className="priority-selector" style={{ gridTemplateColumns: '1fr 1fr' }}>
                    <button 
                      type="button"
                      className={`priority-option ${planType === 'content' ? 'selected high' : ''}`}
                      onClick={() => setPlanType('content')}
                      style={{ padding: '8px', fontSize: '13px' }}
                    >
                      {t.contentPlan}
                    </button>
                    <button 
                      type="button"
                      className={`priority-option ${planType === 'task' ? 'selected high' : ''}`}
                      onClick={() => setPlanType('task')}
                      style={{ padding: '8px', fontSize: '13px' }}
                    >
                      {t.task}
                    </button>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)' }}>{t.date}</label>
                  <input 
                    type="date" 
                    value={selectedDateStr} 
                    onChange={(e) => setSelectedDateStr(e.target.value)}
                    required
                    style={{ padding: '10px', borderRadius: '8px', border: '1px solid var(--border-card)', background: 'var(--bg-app)', color: 'var(--text-main)' }}
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)' }}>
                    {planType === 'task' ? t.taskTitle : t.topicHook}
                  </label>
                  <input 
                    type="text" 
                    value={planTopic}
                    onChange={(e) => setPlanTopic(e.target.value)}
                    placeholder={planType === 'task' ? 'e.g., Edit vlog footage' : 'Why Brand Strategy is the new Coding...'}
                    required
                    style={{ padding: '10px', borderRadius: '8px', border: '1px solid var(--border-card)', background: 'var(--bg-app)', color: 'var(--text-main)' }}
                  />
                </div>

                {/* Conditional Fields based on Type */}
                {planType === 'content' && (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)' }}>{t.format}</label>
                        <select 
                          value={planFormat} 
                          onChange={(e) => setPlanFormat(e.target.value)}
                          style={{ padding: '10px', borderRadius: '8px', border: '1px solid var(--border-card)', background: 'var(--bg-app)', color: 'var(--text-main)' }}
                        >
                          <option value="Reels">Reels</option>
                          <option value="Shorts">Shorts</option>
                          <option value="Carousel">Carousel</option>
                          <option value="TikTok">TikTok</option>
                          <option value="Article">Article</option>
                          <option value="YouTube Video">YouTube Video</option>
                        </select>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)' }}>{t.status}</label>
                        <select 
                          value={planStatus} 
                          onChange={(e) => setPlanStatus(e.target.value)}
                          style={{ padding: '10px', borderRadius: '8px', border: '1px solid var(--border-card)', background: 'var(--bg-app)', color: 'var(--text-main)' }}
                        >
                          <option value="Planned">{t.planned}</option>
                          <option value="Drafting">{t.drafting}</option>
                          <option value="Ideas">{t.ideas}</option>
                          <option value="Posted">{t.posted}</option>
                        </select>
                      </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)' }}>{t.outlineVisualInstructions}</label>
                      <textarea 
                        value={planOutline}
                        onChange={(e) => setPlanOutline(e.target.value)}
                        placeholder="Hooks, slides descriptions, details..."
                        rows={4}
                        style={{ padding: '10px', borderRadius: '8px', border: '1px solid var(--border-card)', background: 'var(--bg-app)', color: 'var(--text-main)', resize: 'vertical' }}
                      />
                    </div>
                  </>
                )}

                {planType === 'task' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)' }}>{t.priorityLevelLabel}</label>
                      <div className="priority-selector">
                        <button 
                          type="button"
                          className={`priority-option high ${taskPriority === 'HIGH' ? 'selected' : ''}`}
                          onClick={() => setTaskPriority('HIGH')}
                          style={{ fontSize: '12px', padding: '8px' }}
                        >
                          {t.highPriority}
                        </button>
                        <button 
                          type="button"
                          className={`priority-option med ${taskPriority === 'MED' ? 'selected' : ''}`}
                          onClick={() => setTaskPriority('MED')}
                          style={{ fontSize: '12px', padding: '8px' }}
                        >
                          {t.mediumPriority}
                        </button>
                        <button 
                          type="button"
                          className={`priority-option low ${taskPriority === 'LOW' ? 'selected' : ''}`}
                          onClick={() => setTaskPriority('LOW')}
                          style={{ fontSize: '12px', padding: '8px' }}
                        >
                          {t.lowPriority}
                        </button>
                      </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)' }}>{t.taskNotesLabel}</label>
                      <textarea 
                        value={taskNotes}
                        onChange={(e) => setTaskNotes(e.target.value)}
                        placeholder="Mini notes about the task..."
                        rows={3}
                        style={{ padding: '10px', borderRadius: '8px', border: '1px solid var(--border-card)', background: 'var(--bg-app)', color: 'var(--text-main)', resize: 'vertical', fontSize: '13px' }}
                      />
                    </div>
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '10px' }}>
                  {modalMode === 'edit' ? (
                    <button 
                      type="button" 
                      onClick={handleDeletePlan}
                      className="btn-danger"
                      style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 16px', background: '#FCECE8', color: '#C95B43', borderRadius: '20px', fontWeight: '500' }}
                    >
                      <Trash2 size={14} />
                      {t.delete}
                    </button>
                  ) : <div />}

                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button 
                      type="button" 
                      onClick={() => setIsModalOpen(false)}
                      style={{ padding: '10px 16px', border: '1px solid var(--border-card)', borderRadius: '20px', color: 'var(--text-muted)' }}
                    >
                      {t.cancel}
                    </button>
                    <button 
                      type="submit" 
                      style={{ padding: '10px 20px', background: 'var(--color-coral-dark)', color: '#FFFFFF', borderRadius: '20px', fontWeight: '600' }}
                    >
                      {t.saveButton}
                    </button>
                  </div>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
