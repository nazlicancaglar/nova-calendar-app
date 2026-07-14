import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, Trash2, Clock, Calendar as CalendarIcon, FileText, X, Lightbulb, CalendarPlus, Pencil } from 'lucide-react';
import { translations } from '../translations';
import PlanItemModal from './PlanItemModal';
import BrainstormIdeaModal from './BrainstormIdeaModal';

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const HOUR_HEIGHT = 48; // px per hour row in the week hour-grid

const formatHourLabel = (h) => {
  if (h === 0) return '12 AM';
  if (h === 12) return '12 PM';
  return h < 12 ? `${h} AM` : `${h - 12} PM`;
};

// Parses "3:00 PM - 4:00 PM" into {startMin, endMin} minutes-from-midnight.
// Returns null for "All Day" or anything unparseable.
const parseTimeRange = (timeStr) => {
  if (!timeStr) return null;
  const match = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)\s*-\s*(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!match) return null;
  const toMinutes = (h, m, ampm) => {
    let hour = parseInt(h, 10) % 12;
    if (ampm.toUpperCase() === 'PM') hour += 12;
    return hour * 60 + parseInt(m, 10);
  };
  const startMin = toMinutes(match[1], match[2], match[3]);
  let endMin = toMinutes(match[4], match[5], match[6]);
  if (endMin <= startMin) endMin = Math.min(startMin + 30, 24 * 60);
  return { startMin, endMin };
};

const PLANNER_ITEM_DURATION_MIN = 30;

// Converts a 24h "HH:MM" input value (from <input type="time">) into
// {startMin, endMin} for positioning on the week hour-grid.
const parseHHMM = (timeStr) => {
  if (!timeStr) return null;
  const match = timeStr.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const startMin = parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
  const endMin = Math.min(startMin + PLANNER_ITEM_DURATION_MIN, 24 * 60);
  return { startMin, endMin };
};

export default function CalendarView({ lang, allEvents = [], contentPlanner = [], brainstormIdeas = [], onRefresh }) {
  const t = translations[lang] || translations.en;
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDateStr, setSelectedDateStr] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState('add'); // 'add', 'edit', 'view-event'
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [editingItem, setEditingItem] = useState(null); // full item object when modalMode === 'edit'
  const [addDefaultType, setAddDefaultType] = useState('content'); // which tab the add modal opens on
  const [assigningIdeaId, setAssigningIdeaId] = useState(null);
  const [isIdeaModalOpen, setIsIdeaModalOpen] = useState(false);
  const [ideaModalMode, setIdeaModalMode] = useState('add');
  const [editingIdea, setEditingIdea] = useState(null);
  const [viewMode, setViewMode] = useState('month'); // 'month' or 'week'
  const [draggedItem, setDraggedItem] = useState(null);
  const [dragOverKey, setDragOverKey] = useState(null);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  // Helper to format date as YYYY-MM-DD in local time
  const formatDateStr = (year, month, day) => {
    const mm = (month + 1).toString().padStart(2, '0');
    const dd = day.toString().padStart(2, '0');
    return `${year}-${mm}-${dd}`;
  };

  // Navigation: shifts by month or by week depending on the active view
  const prevPeriod = () => {
    if (viewMode === 'week') {
      const d = new Date(currentDate);
      d.setDate(d.getDate() - 7);
      setCurrentDate(d);
    } else {
      setCurrentDate(new Date(year, month - 1, 1));
    }
  };

  const nextPeriod = () => {
    if (viewMode === 'week') {
      const d = new Date(currentDate);
      d.setDate(d.getDate() + 7);
      setCurrentDate(d);
    } else {
      setCurrentDate(new Date(year, month + 1, 1));
    }
  };

  // Get days in month
  const getDaysInMonth = (year, month) => {
    return new Date(year, month + 1, 0).getDate();
  };

  // Get Monday-Sunday range for the week containing a given date
  const getWeekRangeOf = (dateObj) => {
    const d = new Date(dateObj);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(d.setDate(diff));
    monday.setHours(0, 0, 0, 0);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return { monday, sunday };
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

  // Open modal to add plan (defaultType: which tab the modal opens on)
  const handleAddPlanClick = (dateStr, defaultType = 'content') => {
    setSelectedDateStr(dateStr);
    setEditingItem(null);
    setAddDefaultType(defaultType);
    setModalMode('add');
    setIsModalOpen(true);
  };

  // Open modal to edit plan
  const handleEditPlanClick = (item, dateStr) => {
    setSelectedDateStr(dateStr || item.date || '');
    setEditingItem(item);
    setModalMode('edit');
    setIsModalOpen(true);
  };

  // Open modal to view calendar event details
  const handleViewEventClick = (event) => {
    setSelectedEvent(event);
    setModalMode('view-event');
    setIsModalOpen(true);
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
          if (onRefresh) onRefresh(true);
        }
      })
      .catch(err => console.error('Error toggling calendar task:', err));
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

  // Generate a single Monday-Sunday row for week view
  const generateWeekGrid = () => {
    const { monday } = getWeekRangeOf(currentDate);
    const cells = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      cells.push({ date: d, isCurrentMonth: true });
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
          if (onRefresh) onRefresh(true);
        }
      })
      .catch(err => console.error('Error rescheduling task:', err));
  };

  // Drag-and-drop: move a content/task item to a new date, optionally a new time
  // (pass newTime='' to drop it into the all-day row / clear its time)
  const handleMoveItem = (item, newDate, newTime) => {
    if (!item || !newDate) return;
    const bodyData = {
      ...item,
      date: newDate,
      time: newTime !== undefined ? newTime : (item.time || '')
    };

    fetch('/api/weekly-content/planner', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bodyData)
    })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          if (onRefresh) onRefresh(true);
        }
      })
      .catch(err => console.error('Error moving item:', err));
  };

  const handleItemDragStart = (item) => (e) => {
    e.stopPropagation();
    setDraggedItem(item);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', item.id || '');
  };

  const handleItemDragEnd = () => {
    setDraggedItem(null);
    setDragOverKey(null);
  };

  const handleCellDragOver = (cellKey) => (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverKey !== cellKey) setDragOverKey(cellKey);
  };

  const handleCellDragLeave = (cellKey) => () => {
    setDragOverKey((prev) => (prev === cellKey ? null : prev));
  };

  // Drop on a month cell: change date, keep whatever time (if any) it already had
  const handleMonthCellDrop = (cellDateStr) => (e) => {
    e.preventDefault();
    setDragOverKey(null);
    if (draggedItem) handleMoveItem(draggedItem, cellDateStr, draggedItem.time || '');
    setDraggedItem(null);
  };

  // Drop on the week view's all-day row: change date, clear any fixed time
  const handleAllDayCellDrop = (cellDateStr) => (e) => {
    e.preventDefault();
    setDragOverKey(null);
    if (draggedItem) handleMoveItem(draggedItem, cellDateStr, '');
    setDraggedItem(null);
  };

  // Drop on an hour column: change date AND derive a time from the drop position
  const handleHourColDrop = (cellDateStr) => (e) => {
    e.preventDefault();
    setDragOverKey(null);
    if (draggedItem) {
      const rect = e.currentTarget.getBoundingClientRect();
      const offsetY = Math.max(0, e.clientY - rect.top);
      const rawMinutes = (offsetY / HOUR_HEIGHT) * 60;
      const snappedMinutes = Math.min(23 * 60 + 45, Math.round(rawMinutes / 15) * 15);
      const hh = Math.floor(snappedMinutes / 60).toString().padStart(2, '0');
      const mm = (snappedMinutes % 60).toString().padStart(2, '0');
      handleMoveItem(draggedItem, cellDateStr, `${hh}:${mm}`);
    }
    setDraggedItem(null);
  };

  // Brainstorm sidebar handlers (park ideas/tasks with no date yet)
  const handleOpenAddIdeaModal = () => {
    setEditingIdea(null);
    setIdeaModalMode('add');
    setIsIdeaModalOpen(true);
  };

  const handleOpenEditIdeaModal = (idea) => {
    setEditingIdea(idea);
    setIdeaModalMode('edit');
    setIsIdeaModalOpen(true);
  };

  const handleDeleteBrainstormIdea = (id) => {
    fetch('/api/weekly-content/brainstorm/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id })
    })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          if (onRefresh) onRefresh(true);
        }
      })
      .catch(err => console.error('Error deleting brainstorm idea:', err));
  };

  const handleAssignBrainstormDate = async (idea, dateStr) => {
    if (!dateStr) return;
    try {
      const isTask = idea.type === 'task';
      const resPlanner = await fetch('/api/weekly-content/planner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: dateStr,
          topic: idea.title,
          format: idea.format || 'Reels',
          outline: isTask ? '' : (idea.details || ''),
          notes: isTask ? (idea.details || '') : '',
          status: 'Planned',
          isManual: true,
          type: isTask ? 'task' : 'content',
          priority: idea.priority || 'MED'
        })
      });
      if (!resPlanner.ok) throw new Error('Planner save failed');

      const resDelete = await fetch('/api/weekly-content/brainstorm/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: idea.id })
      });
      if (!resDelete.ok) throw new Error('Brainstorm delete failed');

      setAssigningIdeaId(null);
      if (onRefresh) onRefresh(true);
    } catch (err) {
      console.error('Error assigning date to brainstorm idea:', err);
    }
  };

  const gridCells = viewMode === 'week' ? generateWeekGrid() : generateGrid();
  const weekDays = t.weekDays || ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  const monthNames = t.months || [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  // Header title: month/year for month view, "D–D Mon Year" range for week view
  const headerTitle = (() => {
    if (viewMode !== 'week') return `${monthNames[month]} ${year}`;
    const { monday, sunday } = getWeekRangeOf(currentDate);
    if (monday.getMonth() === sunday.getMonth()) {
      return `${monday.getDate()} – ${sunday.getDate()} ${monthNames[monday.getMonth()]} ${monday.getFullYear()}`;
    }
    return `${monday.getDate()} ${monthNames[monday.getMonth()]} – ${sunday.getDate()} ${monthNames[sunday.getMonth()]} ${sunday.getFullYear()}`;
  })();

  return (
    <div className="calendar-widget-container">
      
      {/* Calendar Header Control */}
      <div className="calendar-widget-header">
        <div className="calendar-title-wrapper">
          <CalendarIcon size={24} style={{ color: 'var(--color-coral-dark)' }} />
          <h2>{headerTitle}</h2>
        </div>
        <div className="calendar-nav-buttons">
          <div className="view-mode-switch">
            <button
              type="button"
              className={`view-mode-btn ${viewMode === 'month' ? 'active' : ''}`}
              onClick={() => setViewMode('month')}
            >
              {t.monthView || 'Month'}
            </button>
            <button
              type="button"
              className={`view-mode-btn ${viewMode === 'week' ? 'active' : ''}`}
              onClick={() => setViewMode('week')}
            >
              {t.weekView || 'Week'}
            </button>
          </div>
          <button
            type="button"
            className="add-task-btn"
            onClick={() => {
              const now = new Date();
              handleAddPlanClick(formatDateStr(now.getFullYear(), now.getMonth(), now.getDate()), 'task');
            }}
          >
            <Plus size={14} /><span>{t.addTask}</span>
          </button>
          <button className="nav-btn" onClick={prevPeriod}>
            <ChevronLeft size={16} />
          </button>
          <button className="nav-btn-today" onClick={() => setCurrentDate(new Date())}>
            {t.today}
          </button>
          <button className="nav-btn" onClick={nextPeriod}>
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      <div className="calendar-main-layout">
      <div className="calendar-main-col">

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
      {viewMode === 'week' ? (
        <div className="week-hourgrid">
          {/* Day headers with date numbers */}
          <div className="week-hourgrid-header-row">
            <div className="week-hourgrid-gutter-cell" />
            {gridCells.map((cell, index) => {
              const isToday = new Date().toDateString() === cell.date.toDateString();
              return (
                <div className={`week-day-header ${isToday ? 'today' : ''}`} key={index}>
                  <span className="week-day-name">{weekDays[index]}</span>
                  <span className="week-day-num">{cell.date.getDate()}</span>
                </div>
              );
            })}
          </div>

          {/* All-day row: content plan/tasks (no fixed time) + all-day calendar events */}
          <div className="week-hourgrid-allday-row">
            <div className="week-hourgrid-gutter-label">{t.allDay || 'All-day'}</div>
            {gridCells.map((cell, index) => {
              const cellDateStr = formatDateStr(cell.date.getFullYear(), cell.date.getMonth(), cell.date.getDate());
              const { calendarEvents, contentItems } = getItemsForDate(cell.date);
              const allDayEvents = calendarEvents.filter(e => e.time === 'All Day');
              const untimedContentItems = contentItems.filter(item => !item.time);
              const allDayKey = `wa-${cellDateStr}`;
              return (
                <div
                  className={`week-allday-cell ${dragOverKey === allDayKey ? 'drag-over-cell' : ''}`}
                  key={index}
                  onDragOver={handleCellDragOver(allDayKey)}
                  onDragLeave={handleCellDragLeave(allDayKey)}
                  onDrop={handleAllDayCellDrop(cellDateStr)}
                >
                  {allDayEvents.map((evt, eIdx) => {
                    const isGoogle = evt.source === 'Google Calendar';
                    return (
                      <div
                        className={`event-pill ${isGoogle ? 'pill-google' : 'pill-outlook'}`}
                        key={`wevt-${eIdx}`}
                        onClick={() => handleViewEventClick(evt)}
                        title={evt.title}
                      >
                        {evt.title}
                      </div>
                    );
                  })}
                  {untimedContentItems.map((item, cIdx) => {
                    const isTask = item.type === 'task';
                    if (isTask) {
                      return (
                        <div
                          className={`event-pill pill-calendar-task ${item.priority ? item.priority.toLowerCase() : 'med'} ${item.checked ? 'checked' : ''}`}
                          key={item.id || `wcnt-${cIdx}`}
                          draggable
                          onDragStart={handleItemDragStart(item)}
                          onDragEnd={handleItemDragEnd}
                          onClick={() => handleEditPlanClick(item, cellDateStr)}
                          title={`[Task] ${item.topic}`}
                          style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'grab' }}
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
                        key={item.id || `wcnt-${cIdx}`}
                        draggable
                        onDragStart={handleItemDragStart(item)}
                        onDragEnd={handleItemDragEnd}
                        onClick={() => handleEditPlanClick(item, cellDateStr)}
                        title={`[${item.format}] ${item.topic}`}
                        style={{ cursor: 'grab' }}
                      >
                        🎬 {item.topic}
                      </div>
                    );
                  })}
                  <button
                    className="week-allday-add-btn"
                    onClick={() => handleAddPlanClick(cellDateStr)}
                    title={t.addContentPlan}
                  >
                    <Plus size={10} />
                  </button>
                </div>
              );
            })}
          </div>

          {/* Scrollable hour-by-hour grid */}
          <div className="week-hourgrid-body">
            <div className="week-hour-labels-col">
              {HOURS.map((h) => (
                <div className="week-hour-label" key={h}>{formatHourLabel(h)}</div>
              ))}
            </div>
            {gridCells.map((cell, index) => {
              const cellDateStr = formatDateStr(cell.date.getFullYear(), cell.date.getMonth(), cell.date.getDate());
              const { calendarEvents, contentItems } = getItemsForDate(cell.date);
              const timedEvents = calendarEvents
                .filter(e => e.time !== 'All Day')
                .map(e => ({ ...e, range: parseTimeRange(e.time) }))
                .filter(e => e.range);
              const timedContentItems = contentItems
                .filter(item => item.time)
                .map(item => ({ ...item, range: parseHHMM(item.time) }))
                .filter(item => item.range);

              const hourColKey = `wh-${cellDateStr}`;
              return (
                <div
                  className={`week-hour-col ${dragOverKey === hourColKey ? 'drag-over-cell' : ''}`}
                  key={index}
                  onDragOver={handleCellDragOver(hourColKey)}
                  onDragLeave={handleCellDragLeave(hourColKey)}
                  onDrop={handleHourColDrop(cellDateStr)}
                >
                  {HOURS.map((h) => (
                    <div className="week-hour-line" key={h} />
                  ))}
                  {timedEvents.map((evt, eIdx) => {
                    const top = (evt.range.startMin / 60) * HOUR_HEIGHT;
                    const height = Math.max(((evt.range.endMin - evt.range.startMin) / 60) * HOUR_HEIGHT, 22);
                    const isGoogle = evt.source === 'Google Calendar';
                    return (
                      <div
                        className={`week-timed-event ${isGoogle ? 'pill-google' : 'pill-outlook'}`}
                        style={{ top: `${top}px`, height: `${height}px` }}
                        onClick={() => handleViewEventClick(evt)}
                        key={`timed-${eIdx}`}
                        title={`${evt.title} (${evt.time})`}
                      >
                        <span className="week-timed-event-title">{evt.title}</span>
                        <span className="week-timed-event-time">{evt.time}</span>
                      </div>
                    );
                  })}
                  {timedContentItems.map((item, iIdx) => {
                    const top = (item.range.startMin / 60) * HOUR_HEIGHT;
                    const height = Math.max(((item.range.endMin - item.range.startMin) / 60) * HOUR_HEIGHT, 22);
                    const isTask = item.type === 'task';
                    return (
                      <div
                        className={`week-timed-event ${isTask ? `pill-calendar-task ${item.priority ? item.priority.toLowerCase() : 'med'} ${item.checked ? 'checked' : ''}` : 'pill-content'}`}
                        style={{ top: `${top}px`, height: `${height}px`, cursor: 'grab' }}
                        draggable
                        onDragStart={handleItemDragStart(item)}
                        onDragEnd={handleItemDragEnd}
                        onClick={() => handleEditPlanClick(item, cellDateStr)}
                        key={item.id || `timed-plan-${iIdx}`}
                        title={`${item.topic} (${item.time})`}
                      >
                        <span className="week-timed-event-title">{isTask ? '' : '🎬 '}{item.topic}</span>
                        <span className="week-timed-event-time">{item.time}</span>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
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
                className={`calendar-cell ${isCurrentMonth ? 'current-month' : 'other-month'} ${isToday ? 'today' : ''} ${dragOverKey === `m-${cellDateStr}` ? 'drag-over-cell' : ''}`}
                key={index}
                onDragOver={handleCellDragOver(`m-${cellDateStr}`)}
                onDragLeave={handleCellDragLeave(`m-${cellDateStr}`)}
                onDrop={handleMonthCellDrop(cellDateStr)}
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
                          key={item.id || `cnt-${cIdx}`}
                          draggable
                          onDragStart={handleItemDragStart(item)}
                          onDragEnd={handleItemDragEnd}
                          onClick={() => handleEditPlanClick(item, cellDateStr)}
                          title={`[Task] ${item.topic}`}
                          style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'grab' }}
                        >
                          <input
                            type="checkbox"
                            checked={item.checked}
                            onClick={(e) => e.stopPropagation()}
                            onChange={() => handleToggleCalendarTask(item)}
                            style={{ cursor: 'pointer', margin: 0, width: '12px', height: '12px' }}
                          />
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {item.time ? `${item.time} · ` : ''}{item.topic}
                          </span>
                        </div>
                      );
                    }
                    return (
                      <div
                        className="event-pill pill-content"
                        key={item.id || `cnt-${cIdx}`}
                        draggable
                        onDragStart={handleItemDragStart(item)}
                        onDragEnd={handleItemDragEnd}
                        onClick={() => handleEditPlanClick(item, cellDateStr)}
                        title={`[${item.format}] ${item.topic}`}
                        style={{ cursor: 'grab' }}
                      >
                        🎬 {item.time ? `${item.time} · ` : ''}{item.topic}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      )}

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

      </div>
      {/* Brainstorm Sidebar - park undated ideas/tasks, assign a date later */}
      <div className="calendar-brainstorm-sidebar">
        <div className="brainstorm-sidebar-header">
          <Lightbulb size={18} style={{ color: 'var(--color-coral-dark)' }} />
          <h3>{t.brainstormPanelTitle}</h3>
        </div>
        <p className="brainstorm-sidebar-desc">{t.brainstormPanelDesc}</p>

        <button type="button" className="add-task-btn brainstorm-sidebar-add-idea-btn" onClick={handleOpenAddIdeaModal}>
          <Plus size={14} /><span>{t.brainstormNewIdeaBtn}</span>
        </button>

        <div className="brainstorm-sidebar-list">
          {brainstormIdeas.length === 0 ? (
            <div className="brainstorm-sidebar-empty">{t.brainstormNoIdeas}</div>
          ) : (
            brainstormIdeas.map((idea) => (
              <div key={idea.id} className="brainstorm-sidebar-item">
                <div className="brainstorm-sidebar-item-row">
                  <span
                    className="brainstorm-sidebar-item-title"
                    onClick={() => handleOpenEditIdeaModal(idea)}
                    style={{ cursor: 'pointer' }}
                  >
                    {idea.type === 'task' && (
                      <span className="brainstorm-sidebar-item-type-badge">{t.task}</span>
                    )}
                    {idea.title}
                  </span>
                  <div className="brainstorm-sidebar-item-actions">
                    <button
                      type="button"
                      className="brainstorm-sidebar-icon-btn"
                      title={t.editIdeaTooltip}
                      onClick={() => handleOpenEditIdeaModal(idea)}
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      type="button"
                      className="brainstorm-sidebar-icon-btn"
                      title={t.brainstormAssignDate}
                      onClick={() => setAssigningIdeaId(assigningIdeaId === idea.id ? null : idea.id)}
                    >
                      <CalendarPlus size={14} />
                    </button>
                    <button
                      type="button"
                      className="brainstorm-sidebar-icon-btn"
                      title={t.deleteIdeaTooltip}
                      onClick={() => handleDeleteBrainstormIdea(idea.id)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                {idea.hook && (
                  <p className="brainstorm-sidebar-item-hook">{idea.hook}</p>
                )}
                {assigningIdeaId === idea.id && (
                  <input
                    type="date"
                    autoFocus
                    className="brainstorm-sidebar-date-input"
                    onChange={(e) => handleAssignBrainstormDate(idea, e.target.value)}
                  />
                )}
              </div>
            ))
          )}
        </div>
      </div>
      </div>

      {/* View Calendar Event Modal (Google/Outlook) */}
      {isModalOpen && modalMode === 'view-event' && selectedEvent && (
        <div className="modal-overlay" onClick={() => setIsModalOpen(false)}>
          <div className="modal-content" style={{ maxWidth: '500px' }} onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setIsModalOpen(false)}>
              <X size={20} />
            </button>

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
          </div>
        </div>
      )}

      {/* Add / Edit Plan Modal — shared with Dashboard's Add Task button */}
      {isModalOpen && (modalMode === 'add' || modalMode === 'edit') && (
        <PlanItemModal
          t={t}
          isOpen
          mode={modalMode === 'edit' ? 'edit' : 'add'}
          initialItem={editingItem}
          initialDate={selectedDateStr}
          defaultType={addDefaultType}
          onClose={() => setIsModalOpen(false)}
          onSaved={() => { if (onRefresh) onRefresh(true); }}
        />
      )}

      {/* Add / Edit Brainstorm Idea Modal */}
      {isIdeaModalOpen && (
        <BrainstormIdeaModal
          t={t}
          isOpen
          mode={ideaModalMode}
          initialItem={editingIdea}
          onClose={() => setIsIdeaModalOpen(false)}
          onSaved={() => { if (onRefresh) onRefresh(true); }}
        />
      )}
    </div>
  );
}
