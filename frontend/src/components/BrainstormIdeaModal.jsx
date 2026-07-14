import React, { useState } from 'react';
import { X, Lightbulb } from 'lucide-react';

// Full-detail Add/Edit modal for a Brainstorm idea — lets ideas be fleshed
// out at capture time. An idea can be a content idea (hook, script, format)
// or a plain task (priority + notes); the type carries over when the idea is
// later assigned to a calendar date.
export default function BrainstormIdeaModal({ t, isOpen, mode = 'add', initialItem = null, onClose, onSaved }) {
  const [ideaId] = useState(initialItem?.id || '');
  const [title, setTitle] = useState(initialItem?.title || '');
  const [ideaType, setIdeaType] = useState(initialItem?.type === 'task' ? 'task' : 'content');
  const [format, setFormat] = useState(initialItem?.format || 'Reels');
  const [hook, setHook] = useState(initialItem?.hook || '');
  const [details, setDetails] = useState(initialItem?.details || '');
  const [script, setScript] = useState(initialItem?.script || '');
  const [priority, setPriority] = useState(initialItem?.priority || 'MED');

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!title.trim()) return;

    fetch('/api/weekly-content/brainstorm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: ideaId || undefined,
        title: title.trim(),
        type: ideaType,
        format,
        hook: ideaType === 'content' ? hook : '',
        details,
        script: ideaType === 'content' ? script : '',
        priority
      })
    })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          if (onSaved) onSaved();
          if (onClose) onClose();
        }
      })
      .catch(err => console.error('Error saving brainstorm idea:', err));
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" style={{ maxWidth: '520px' }} onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>
          <X size={20} />
        </button>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <h3 className="modal-title" style={{ fontSize: '22px', borderBottom: '1px solid var(--border-card)', paddingBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Lightbulb size={18} style={{ color: 'var(--color-coral-dark)' }} />
            {mode === 'edit' ? t.brainstormModalTitleEdit : t.brainstormModalTitleAdd}
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)' }}>{t.type}</label>
            <div className="priority-selector" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <button
                type="button"
                className={`priority-option ${ideaType === 'content' ? 'selected high' : ''}`}
                onClick={() => setIdeaType('content')}
                style={{ padding: '8px', fontSize: '13px' }}
              >
                {t.brainstormTypeContent}
              </button>
              <button
                type="button"
                className={`priority-option ${ideaType === 'task' ? 'selected high' : ''}`}
                onClick={() => setIdeaType('task')}
                style={{ padding: '8px', fontSize: '13px' }}
              >
                {t.task}
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)' }}>
              {ideaType === 'task' ? t.taskTitle : t.brainstormTitleLabel}
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={ideaType === 'task' ? 'e.g., Edit vlog footage' : t.brainstormTitlePlaceholder}
              required
              autoFocus
              style={{ padding: '10px', borderRadius: '8px', border: '1px solid var(--border-card)', background: 'var(--bg-app)', color: 'var(--text-main)' }}
            />
          </div>

          {ideaType === 'content' && (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)' }}>{t.formatLabel || t.format}</label>
                <select
                  value={format}
                  onChange={(e) => setFormat(e.target.value)}
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
                <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)' }}>{t.brainstormHookLabel}</label>
                <input
                  type="text"
                  value={hook}
                  onChange={(e) => setHook(e.target.value)}
                  placeholder={t.brainstormHookPlaceholder}
                  style={{ padding: '10px', borderRadius: '8px', border: '1px solid var(--border-card)', background: 'var(--bg-app)', color: 'var(--text-main)' }}
                />
              </div>
            </>
          )}

          {ideaType === 'task' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)' }}>{t.priorityLevelLabel}</label>
              <div className="priority-selector">
                <button
                  type="button"
                  className={`priority-option high ${priority === 'HIGH' ? 'selected' : ''}`}
                  onClick={() => setPriority('HIGH')}
                  style={{ fontSize: '12px', padding: '8px' }}
                >
                  {t.highPriority}
                </button>
                <button
                  type="button"
                  className={`priority-option med ${priority === 'MED' ? 'selected' : ''}`}
                  onClick={() => setPriority('MED')}
                  style={{ fontSize: '12px', padding: '8px' }}
                >
                  {t.mediumPriority}
                </button>
                <button
                  type="button"
                  className={`priority-option low ${priority === 'LOW' ? 'selected' : ''}`}
                  onClick={() => setPriority('LOW')}
                  style={{ fontSize: '12px', padding: '8px' }}
                >
                  {t.lowPriority}
                </button>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)' }}>
              {ideaType === 'task' ? t.taskNotesLabel : t.brainstormDetailsLabel}
            </label>
            <textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder={ideaType === 'task' ? 'Mini notes about the task...' : t.brainstormDetailsPlaceholder}
              rows={4}
              style={{ padding: '10px', borderRadius: '8px', border: '1px solid var(--border-card)', background: 'var(--bg-app)', color: 'var(--text-main)', resize: 'vertical' }}
            />
          </div>

          {ideaType === 'content' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)' }}>{t.brainstormScriptLabel}</label>
              <textarea
                value={script}
                onChange={(e) => setScript(e.target.value)}
                placeholder={t.brainstormScriptPlaceholder}
                rows={3}
                style={{ padding: '10px', borderRadius: '8px', border: '1px solid var(--border-card)', background: 'var(--bg-app)', color: 'var(--text-main)', resize: 'vertical', fontSize: '13px' }}
              />
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '4px' }}>
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
        </form>
      </div>
    </div>
  );
}
