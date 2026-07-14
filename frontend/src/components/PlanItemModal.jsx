import React, { useState } from 'react';
import { X, Trash2, Clock, Calendar as CalendarIcon, AlignLeft, Flag } from 'lucide-react';

// Shared Add/Edit modal for a Content Plan or Task item, used by both the
// Calendar (day-cell add/edit) and the Dashboard ("Top priorities today"
// Add Task button) so task creation looks and behaves identically everywhere.
export default function PlanItemModal({
  t,
  isOpen,
  mode = 'add', // 'add' | 'edit'
  initialItem = null,
  initialDate = '',
  lockType = false,
  defaultType = 'content', // 'content' | 'task', used when lockType or no initialItem
  onClose,
  onSaved
}) {
  const [planId] = useState(initialItem?.id || '');
  const [selectedDateStr, setSelectedDateStr] = useState(initialItem?.date || initialDate || '');
  const [planTime, setPlanTime] = useState(initialItem?.time || '');
  const [planTopic, setPlanTopic] = useState(initialItem?.topic || '');
  const [planFormat, setPlanFormat] = useState(initialItem?.format || 'Reels');
  const [planStatus, setPlanStatus] = useState(initialItem?.status || 'Planned');
  const [planOutline, setPlanOutline] = useState(initialItem?.outline || '');
  const [planType, setPlanType] = useState(initialItem?.type || defaultType);
  const [taskPriority, setTaskPriority] = useState(initialItem?.priority || 'MED');
  const [taskChecked] = useState(initialItem?.checked || false);
  const [taskNotes, setTaskNotes] = useState(initialItem?.notes || '');

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!planTopic.trim()) return;

    const bodyData = {
      id: planId || undefined,
      date: selectedDateStr,
      time: planTime,
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
          if (onSaved) onSaved();
          if (onClose) onClose();
        }
      })
      .catch(err => console.error('Error saving plan item:', err));
  };

  const handleDelete = () => {
    if (!planId) return;

    fetch('/api/weekly-content/planner/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: planId })
    })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          if (onSaved) onSaved();
          if (onClose) onClose();
        }
      })
      .catch(err => console.error('Error deleting plan item:', err));
  };

  const modalTitle = mode === 'edit'
    ? t.editCalendarItem
    : (lockType ? t.addNewTask : t.addItemToCalendar);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content plan-item-modal" style={{ maxWidth: '560px' }} onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>
          <X size={20} />
        </button>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <h3 className="modal-title" style={{ fontSize: '22px', borderBottom: '1px solid var(--border-card)', paddingBottom: '10px' }}>
            {modalTitle}
          </h3>

          {!lockType && (
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
          )}

          <div className="plan-modal-section">
            <div className="plan-modal-section-label">
              <CalendarIcon size={13} />
              <span>{t.planSectionWhen}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
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
                  <Clock size={11} style={{ verticalAlign: '-1px', marginRight: '3px' }} />
                  {t.timeOptional || 'Time (optional)'}
                </label>
                <input
                  type="time"
                  value={planTime}
                  onChange={(e) => setPlanTime(e.target.value)}
                  style={{ padding: '10px', borderRadius: '8px', border: '1px solid var(--border-card)', background: 'var(--bg-app)', color: 'var(--text-main)' }}
                />
              </div>
            </div>
          </div>

          <div className="plan-modal-section">
            <div className="plan-modal-section-label">
              <AlignLeft size={13} />
              <span>{t.planSectionWhat}</span>
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
                autoFocus
                style={{ padding: '10px', borderRadius: '8px', border: '1px solid var(--border-card)', background: 'var(--bg-app)', color: 'var(--text-main)' }}
              />
            </div>

            {planType === 'content' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '12px' }}>
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
            )}

            {planType === 'task' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '12px' }}>
                <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)' }}>
                  <Flag size={11} style={{ verticalAlign: '-1px', marginRight: '3px' }} />
                  {t.priorityLevelLabel}
                </label>
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
            )}
          </div>

          <div className="plan-modal-section">
            <div className="plan-modal-section-label">
              <AlignLeft size={13} />
              <span>{t.planSectionDetails}</span>
            </div>
            {planType === 'content' ? (
              <textarea
                value={planOutline}
                onChange={(e) => setPlanOutline(e.target.value)}
                placeholder="Hooks, slides descriptions, details..."
                rows={4}
                style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-card)', background: 'var(--bg-app)', color: 'var(--text-main)', resize: 'vertical' }}
              />
            ) : (
              <textarea
                value={taskNotes}
                onChange={(e) => setTaskNotes(e.target.value)}
                placeholder="Mini notes about the task..."
                rows={4}
                style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-card)', background: 'var(--bg-app)', color: 'var(--text-main)', resize: 'vertical', fontSize: '13px' }}
              />
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
            {mode === 'edit' ? (
              <button
                type="button"
                onClick={handleDelete}
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
                onClick={onClose}
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
      </div>
    </div>
  );
}
