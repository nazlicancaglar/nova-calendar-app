import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Eraser, Pencil, Undo2, Trash2, Plus, X, Check, Loader2, ScanText, ListPlus } from 'lucide-react';
import { translations } from '../translations';

// Fixed internal drawing resolution — displayed responsively via CSS, kept
// constant so undo snapshots and saved PNGs never need rescaling.
const CANVAS_W = 1600;
const CANVAS_H = 900;
const MAX_HISTORY = 30;

const BRUSH_COLORS = ['#1f2937', '#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899'];
const BRUSH_SIZES = [3, 6, 12];
const NOTE_COLORS = ['#fff7ae', '#ffd6d6', '#d6f5d6', '#d6e6ff', '#f0d6ff'];

export default function DesignBoard({ lang, ocrEnabled = false, onAddPriority, onRefresh }) {
  const t = translations[lang] || translations.tr;

  const canvasRef = useRef(null);
  const ctxRef = useRef(null);
  const isDrawingRef = useRef(false);
  const isSelectingRef = useRef(false);
  const lastPointRef = useRef({ x: 0, y: 0 });
  const selectStartRef = useRef({ x: 0, y: 0 });
  const historyRef = useRef([]); // undo stack of dataURLs
  const saveTimerRef = useRef(null);
  const skipNextSaveRef = useRef(false);

  const [color, setColor] = useState(BRUSH_COLORS[0]);
  const [brushSize, setBrushSize] = useState(BRUSH_SIZES[1]);
  const [tool, setTool] = useState('pen'); // 'pen' | 'eraser' | 'select'
  const [selection, setSelection] = useState(null); // {x0,y0,x1,y1} in logical canvas coords
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState('idle'); // idle | saving | saved

  // Handwriting -> text recognition (TrOCR) state
  const [recognizing, setRecognizing] = useState(false);
  const [recognizeError, setRecognizeError] = useState('');
  const [recognizedText, setRecognizedText] = useState(null); // null = panel hidden
  const [taskPriority, setTaskPriority] = useState('MED');
  const [taskAdded, setTaskAdded] = useState(false);

  const fillWhite = (ctx) => {
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.restore();
  };

  // ── Init canvas + load saved board ──────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = CANVAS_W * dpr;
    canvas.height = CANVAS_H * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    fillWhite(ctx);
    ctxRef.current = ctx;

    fetch('/api/design-board')
      .then(res => res.json())
      .then(data => {
        if (data.drawing) {
          const img = new Image();
          img.onload = () => {
            ctx.drawImage(img, 0, 0, CANVAS_W, CANVAS_H);
            historyRef.current = [canvas.toDataURL('image/png')];
          };
          img.src = data.drawing;
        } else {
          historyRef.current = [canvas.toDataURL('image/png')];
        }
        setNotes(Array.isArray(data.notes) ? data.notes : []);
        setLoading(false);
      })
      .catch(err => {
        console.error('Error loading design board:', err);
        historyRef.current = [canvas.toDataURL('image/png')];
        setLoading(false);
      });
  }, []);

  // ── Debounced autosave whenever notes change ────────────────────────────
  const scheduleSave = useCallback((overrideDrawing) => {
    setSaveStatus('saving');
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const canvas = canvasRef.current;
      const drawing = overrideDrawing !== undefined ? overrideDrawing : (canvas ? canvas.toDataURL('image/png') : null);
      fetch('/api/design-board', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ drawing, notes })
      })
        .then(res => res.json())
        .then(() => setSaveStatus('saved'))
        .catch(err => {
          console.error('Error saving design board:', err);
          setSaveStatus('idle');
        });
    }, 900);
  }, [notes]);

  useEffect(() => {
    if (loading) return;
    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false;
      return;
    }
    scheduleSave();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notes]);

  // ── Pointer coordinate helper (works for mouse, touch, pen) ─────────────
  const getPos = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = CANVAS_W / rect.width;
    const scaleY = CANVAS_H / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    };
  };

  const pushHistory = () => {
    const canvas = canvasRef.current;
    const snapshot = canvas.toDataURL('image/png');
    historyRef.current.push(snapshot);
    if (historyRef.current.length > MAX_HISTORY) historyRef.current.shift();
  };

  const handlePointerDown = (e) => {
    e.preventDefault();

    if (tool === 'select') {
      const pos = getPos(e);
      isSelectingRef.current = true;
      selectStartRef.current = pos;
      setSelection({ x0: pos.x, y0: pos.y, x1: pos.x, y1: pos.y });
      return;
    }

    const ctx = ctxRef.current;
    pushHistory();
    isDrawingRef.current = true;
    const pos = getPos(e);
    lastPointRef.current = pos;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, (tool === 'eraser' ? brushSize * 2 : brushSize) / 2, 0, Math.PI * 2);
    ctx.fillStyle = tool === 'eraser' ? '#ffffff' : color;
    ctx.fill();
  };

  const handlePointerMove = (e) => {
    if (tool === 'select') {
      if (!isSelectingRef.current) return;
      e.preventDefault();
      const pos = getPos(e);
      setSelection({ x0: selectStartRef.current.x, y0: selectStartRef.current.y, x1: pos.x, y1: pos.y });
      return;
    }

    if (!isDrawingRef.current) return;
    e.preventDefault();
    const ctx = ctxRef.current;
    const pos = getPos(e);
    ctx.strokeStyle = tool === 'eraser' ? '#ffffff' : color;
    ctx.lineWidth = tool === 'eraser' ? brushSize * 2 : brushSize;
    ctx.beginPath();
    ctx.moveTo(lastPointRef.current.x, lastPointRef.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    lastPointRef.current = pos;
  };

  const handlePointerUp = () => {
    if (tool === 'select') {
      isSelectingRef.current = false;
      return;
    }
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    scheduleSave();
  };

  const handleUndo = () => {
    if (historyRef.current.length === 0) return;
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    const prev = historyRef.current.pop();
    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
      ctx.drawImage(img, 0, 0, CANVAS_W, CANVAS_H);
      scheduleSave(canvas.toDataURL('image/png'));
    };
    img.src = prev;
  };

  const handleClear = () => {
    if (!window.confirm(t.confirmClearCanvas)) return;
    pushHistory();
    const ctx = ctxRef.current;
    fillWhite(ctx);
    setSelection(null);
    scheduleSave(canvasRef.current.toDataURL('image/png'));
  };

  // ── Handwriting recognition (Design Board ink -> text via TrOCR) ────────
  const selectionBox = () => {
    if (!selection) return null;
    const x = Math.min(selection.x0, selection.x1);
    const y = Math.min(selection.y0, selection.y1);
    const w = Math.abs(selection.x1 - selection.x0);
    const h = Math.abs(selection.y1 - selection.y0);
    return { x, y, w, h };
  };

  const cropSelectionToDataURL = () => {
    const box = selectionBox();
    const canvas = canvasRef.current;
    if (!box || box.w < 4 || box.h < 4) return null;

    // Canvas backing-store pixels are devicePixelRatio-scaled, while selection
    // coordinates are in the logical CANVAS_W x CANVAS_H space — convert.
    const scaleX = canvas.width / CANVAS_W;
    const scaleY = canvas.height / CANVAS_H;

    const temp = document.createElement('canvas');
    temp.width = box.w * scaleX;
    temp.height = box.h * scaleY;
    temp.getContext('2d').drawImage(
      canvas,
      box.x * scaleX, box.y * scaleY, box.w * scaleX, box.h * scaleY,
      0, 0, temp.width, temp.height
    );
    return temp.toDataURL('image/png');
  };

  const handleRecognize = () => {
    const dataUrl = cropSelectionToDataURL();
    if (!dataUrl) {
      setRecognizeError(t.noSelectionError);
      return;
    }
    setRecognizing(true);
    setRecognizeError('');
    setRecognizedText(null);
    setTaskAdded(false);

    fetch('/api/design-board/recognize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: dataUrl })
    })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setRecognizedText(data.text || '');
        } else {
          setRecognizeError(data.error || t.recognitionFailedError);
        }
      })
      .catch(err => {
        console.error('Recognition error:', err);
        setRecognizeError(t.recognitionFailedError);
      })
      .finally(() => setRecognizing(false));
  };

  const handleAddAsTask = () => {
    if (!recognizedText || !recognizedText.trim() || !onAddPriority) return;
    onAddPriority(recognizedText.trim(), taskPriority);
    setTaskAdded(true);
    if (onRefresh) onRefresh(true);
  };

  const closeRecognizePanel = () => {
    setRecognizedText(null);
    setRecognizeError('');
    setTaskAdded(false);
  };

  // ── Notes ────────────────────────────────────────────────────────────────
  const addNote = () => {
    const newNote = {
      id: Date.now().toString(),
      text: '',
      color: NOTE_COLORS[notes.length % NOTE_COLORS.length]
    };
    setNotes(prev => [newNote, ...prev]);
  };

  const updateNoteText = (id, text) => {
    setNotes(prev => prev.map(n => n.id === id ? { ...n, text } : n));
  };

  const deleteNote = (id) => {
    if (!window.confirm(t.confirmDeleteNote)) return;
    setNotes(prev => prev.filter(n => n.id !== id));
  };

  return (
    <div className="newsletter-container">
      <div className="newsletter-header">
        <h2>{t.designTab}</h2>
        <p>{t.designDesc}</p>
      </div>

        <div style={{ display: 'flex', gap: '24px', alignItems: 'flex-start', flexWrap: 'wrap', opacity: loading ? 0.5 : 1, pointerEvents: loading ? 'none' : 'auto', transition: 'opacity 0.2s' }}>
          {/* Canvas panel */}
          <div style={{ flex: '2 1 560px', minWidth: '320px' }}>
            {/* Toolbar */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap',
              background: 'var(--bg-card)', border: '1px solid var(--border-card)',
              borderRadius: '12px', padding: '12px 16px', marginBottom: '14px'
            }}>
              <div style={{ display: 'flex', gap: '6px' }}>
                {BRUSH_COLORS.map(c => (
                  <button
                    key={c}
                    onClick={() => { setTool('pen'); setColor(c); }}
                    title={c}
                    style={{
                      width: '22px', height: '22px', borderRadius: '50%', background: c,
                      cursor: 'pointer',
                      border: (tool === 'pen' && color === c) ? '2px solid var(--text-main)' : '2px solid transparent',
                      boxShadow: '0 0 0 1px var(--border-card)',
                      padding: 0
                    }}
                  />
                ))}
              </div>

              <div style={{ width: '1px', height: '22px', background: 'var(--border-card)' }} />

              <div style={{ display: 'flex', gap: '4px' }}>
                {BRUSH_SIZES.map(s => (
                  <button
                    key={s}
                    onClick={() => setBrushSize(s)}
                    title={`${s}px`}
                    style={{
                      width: '30px', height: '30px', borderRadius: '8px',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: 'pointer',
                      border: `1px solid ${brushSize === s ? 'var(--color-coral-dark)' : 'var(--border-card)'}`,
                      background: brushSize === s ? 'var(--color-coral-light)' : 'transparent'
                    }}
                  >
                    <div style={{ width: `${s}px`, height: `${s}px`, borderRadius: '50%', background: 'var(--text-main)' }} />
                  </button>
                ))}
              </div>

              <div style={{ width: '1px', height: '22px', background: 'var(--border-card)' }} />

              <button
                onClick={() => setTool('pen')}
                title={t.penTool}
                style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  padding: '6px 10px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 600,
                  border: `1px solid ${tool === 'pen' ? 'var(--color-coral-dark)' : 'var(--border-card)'}`,
                  background: tool === 'pen' ? 'var(--color-coral-light)' : 'transparent',
                  color: tool === 'pen' ? 'var(--color-coral-dark)' : 'var(--text-main)'
                }}
              >
                <Pencil size={14} /> {t.penTool}
              </button>
              <button
                onClick={() => setTool('eraser')}
                title={t.eraserTool}
                style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  padding: '6px 10px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 600,
                  border: `1px solid ${tool === 'eraser' ? 'var(--color-coral-dark)' : 'var(--border-card)'}`,
                  background: tool === 'eraser' ? 'var(--color-coral-light)' : 'transparent',
                  color: tool === 'eraser' ? 'var(--color-coral-dark)' : 'var(--text-main)'
                }}
              >
                <Eraser size={14} /> {t.eraserTool}
              </button>
              <button
                onClick={() => setTool('select')}
                title={t.selectTool}
                style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  padding: '6px 10px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 600,
                  border: `1px solid ${tool === 'select' ? 'var(--color-coral-dark)' : 'var(--border-card)'}`,
                  background: tool === 'select' ? 'var(--color-coral-light)' : 'transparent',
                  color: tool === 'select' ? 'var(--color-coral-dark)' : 'var(--text-main)'
                }}
              >
                <ScanText size={14} /> {t.selectTool}
              </button>

              {/* El yazısı tanıma (TrOCR) yalnızca 'ocr' özelliği açıkken
                  görünür; kapalı deploy'da endpoint 503 döner. */}
              {ocrEnabled && (<>
              <div style={{ width: '1px', height: '22px', background: 'var(--border-card)' }} />

              <button
                onClick={handleRecognize}
                disabled={recognizing}
                title={t.recognizeButton}
                style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  padding: '6px 12px', borderRadius: '8px', cursor: recognizing ? 'default' : 'pointer', fontSize: '13px', fontWeight: 600,
                  border: '1px solid var(--color-coral-dark)',
                  background: 'var(--color-coral-dark)', color: '#fff',
                  opacity: recognizing ? 0.7 : 1
                }}
              >
                {recognizing ? <Loader2 size={14} className="spin" /> : <ScanText size={14} />}
                {recognizing ? t.recognizingStatus : t.recognizeButton}
              </button>
              </>)}

              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '5px' }}>
                  {saveStatus === 'saving' && <><Loader2 size={12} className="spin" /> {t.savingStatus}</>}
                  {saveStatus === 'saved' && <><Check size={12} /> {t.savedStatus}</>}
                </span>
                <button
                  onClick={handleUndo}
                  title={t.undoTooltip}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    padding: '6px 10px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 600,
                    border: '1px solid var(--border-card)', background: 'transparent', color: 'var(--text-main)'
                  }}
                >
                  <Undo2 size={14} /> {t.undoTooltip}
                </button>
                <button
                  onClick={handleClear}
                  title={t.clearCanvas}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    padding: '6px 10px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 600,
                    border: '1px solid var(--border-card)', background: 'transparent', color: '#ef4444'
                  }}
                >
                  <Trash2 size={14} /> {t.clearCanvas}
                </button>
              </div>
            </div>

            {tool === 'select' && (
              <div style={{ fontSize: '12.5px', color: 'var(--text-muted)', marginBottom: '8px' }}>
                {t.selectionHint}
              </div>
            )}

            {/* Canvas surface */}
            <div style={{
              background: 'var(--bg-card)', border: '1px solid var(--border-card)',
              borderRadius: '12px', padding: '10px', boxShadow: 'var(--shadow-sm)'
            }}>
              <div style={{ position: 'relative' }}>
                <canvas
                  ref={canvasRef}
                  style={{
                    width: '100%', aspectRatio: `${CANVAS_W} / ${CANVAS_H}`, display: 'block',
                    borderRadius: '8px', touchAction: 'none',
                    cursor: tool === 'eraser' ? 'cell' : tool === 'select' ? 'crosshair' : 'crosshair',
                    background: '#ffffff'
                  }}
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerLeave={handlePointerUp}
                />
                {selection && (() => {
                  const box = selectionBox();
                  return (
                    <div style={{
                      position: 'absolute', pointerEvents: 'none',
                      left: `${(box.x / CANVAS_W) * 100}%`,
                      top: `${(box.y / CANVAS_H) * 100}%`,
                      width: `${(box.w / CANVAS_W) * 100}%`,
                      height: `${(box.h / CANVAS_H) * 100}%`,
                      border: '2px dashed var(--color-coral-dark)',
                      background: 'rgba(244, 115, 88, 0.1)',
                      borderRadius: '2px'
                    }} />
                  );
                })()}
              </div>
            </div>

            {/* Recognized text -> task panel */}
            {(recognizing || recognizeError || recognizedText !== null) && (
              <div style={{
                marginTop: '14px', background: 'var(--bg-card)', border: '1px solid var(--border-card)',
                borderRadius: '12px', padding: '16px', position: 'relative'
              }}>
                <button
                  onClick={closeRecognizePanel}
                  style={{
                    position: 'absolute', top: '10px', right: '10px',
                    width: '24px', height: '24px', borderRadius: '50%',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer', border: 'none', background: 'transparent', color: 'var(--text-muted)'
                  }}
                >
                  <X size={15} />
                </button>

                <h4 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-main)', marginBottom: '10px' }}>
                  {t.recognizedTextTitle}
                </h4>

                {recognizing && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)', fontSize: '13px' }}>
                    <Loader2 size={14} className="spin" /> {t.recognizingStatus}
                  </div>
                )}

                {recognizeError && !recognizing && (
                  <div style={{ color: '#ef4444', fontSize: '13px' }}>{recognizeError}</div>
                )}

                {!recognizing && recognizedText !== null && (
                  <>
                    <textarea
                      value={recognizedText}
                      onChange={(e) => setRecognizedText(e.target.value)}
                      rows={3}
                      style={{
                        width: '100%', padding: '10px', borderRadius: '8px', fontSize: '14px',
                        border: '1px solid var(--border-card)', background: 'transparent', color: 'var(--text-main)',
                        fontFamily: 'inherit', resize: 'vertical', marginBottom: '12px'
                      }}
                    />
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                      <select
                        value={taskPriority}
                        onChange={(e) => setTaskPriority(e.target.value)}
                        style={{
                          padding: '6px 10px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
                          border: '1px solid var(--border-card)', background: 'var(--bg-card)', color: 'var(--text-main)'
                        }}
                      >
                        <option value="HIGH">{t.high}</option>
                        <option value="MED">{t.medium}</option>
                        <option value="LOW">{t.low}</option>
                      </select>
                      <button
                        onClick={handleAddAsTask}
                        disabled={!recognizedText.trim() || taskAdded}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '6px',
                          padding: '7px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
                          cursor: (!recognizedText.trim() || taskAdded) ? 'default' : 'pointer',
                          border: '1px solid var(--color-coral-dark)',
                          background: taskAdded ? 'transparent' : 'var(--color-coral-dark)',
                          color: taskAdded ? 'var(--color-coral-dark)' : '#fff',
                          opacity: !recognizedText.trim() ? 0.5 : 1
                        }}
                      >
                        {taskAdded ? <Check size={14} /> : <ListPlus size={14} />}
                        {taskAdded ? t.taskAddedToast : t.addAsTaskButton}
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Notes panel */}
          <div style={{ flex: '1 1 280px', minWidth: '260px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
              <h3 style={{ fontFamily: 'var(--font-serif)', fontSize: '18px', fontWeight: 700, color: 'var(--text-main)' }}>
                {t.notesTitle}
              </h3>
              <button
                onClick={addNote}
                style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  padding: '6px 12px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 600,
                  border: '1px solid var(--color-coral-dark)', background: 'var(--color-coral-dark)', color: '#fff'
                }}
              >
                <Plus size={14} /> {t.addNote}
              </button>
            </div>

            {notes.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '28px 16px', background: 'var(--bg-card)', border: '1px solid var(--border-card)', borderRadius: '12px', color: 'var(--text-muted)', fontSize: '13px' }}>
                {t.noNotesYet}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '760px', overflowY: 'auto', paddingRight: '4px' }}>
                {notes.map(note => (
                  <div
                    key={note.id}
                    style={{
                      background: note.color, borderRadius: '10px', padding: '12px',
                      boxShadow: 'var(--shadow-sm)', position: 'relative'
                    }}
                  >
                    <button
                      onClick={() => deleteNote(note.id)}
                      title={t.deleteNoteTooltip}
                      style={{
                        position: 'absolute', top: '6px', right: '6px',
                        width: '22px', height: '22px', borderRadius: '50%',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        cursor: 'pointer', border: 'none', background: 'rgba(0,0,0,0.08)', color: '#333'
                      }}
                    >
                      <X size={13} />
                    </button>
                    <textarea
                      value={note.text}
                      onChange={(e) => updateNoteText(note.id, e.target.value)}
                      placeholder={t.notePlaceholder}
                      rows={4}
                      style={{
                        width: '100%', border: 'none', background: 'transparent', resize: 'vertical',
                        fontSize: '13.5px', lineHeight: 1.5, color: '#2b2b2b', fontFamily: 'inherit',
                        outline: 'none', paddingRight: '18px'
                      }}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
    </div>
  );
}
