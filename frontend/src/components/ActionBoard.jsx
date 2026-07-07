import React, { useState, useEffect, useRef } from 'react';
import { Plus, Check, Pencil, Trash2, X, ChevronDown, ChevronRight } from 'lucide-react';
import { translations } from '../translations';

export default function ActionBoard({ actionBoard, onRefresh, lang }) {
  const t = translations[lang] || translations.en;
  const currentYearNum = new Date().getFullYear();
  const years = Array.from({ length: 11 }, (_, i) => (currentYearNum - 5 + i).toString());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString());
  const yearTabsRef = useRef(null);

  // Local state for goals to ensure instant UI responsiveness
  const [localBoard, setLocalBoard] = useState(actionBoard || {});

  // Update localBoard when props change
  useEffect(() => {
    if (actionBoard) {
      setLocalBoard(actionBoard);
    }
  }, [actionBoard]);

  const isInitialMount = useRef(true);

  useEffect(() => {
    const scrollToTarget = () => {
      // Scroll to currentYear - 1 (e.g. 2025) on initial mount so that years before 2025 are hidden on the left.
      // On subsequent year selection changes, scroll to the selected year button.
      const targetYear = isInitialMount.current ? (currentYearNum - 1).toString() : selectedYear;
      const targetBtn = yearTabsRef.current?.querySelector(`[data-year="${targetYear}"]`);
      if (targetBtn) {
        targetBtn.scrollIntoView({
          behavior: isInitialMount.current ? 'auto' : 'smooth',
          block: 'nearest',
          inline: 'start'
        });
        isInitialMount.current = false;
      }
    };

    // Wrap in RAF + timeout to ensure container has completed mounting and calculating dimensions
    const rafId = requestAnimationFrame(() => {
      const timer = setTimeout(scrollToTarget, 60);
      return () => clearTimeout(timer);
    });

    return () => cancelAnimationFrame(rafId);
  }, [selectedYear]);

  // Determine current year and quarter for visual highlighting
  const currentYear = new Date().getFullYear().toString();
  const currentQuarter = (() => {
    const month = new Date().getMonth();
    if (month >= 0 && month <= 2) return "Q1";
    if (month >= 3 && month <= 5) return "Q2";
    if (month >= 6 && month <= 8) return "Q3";
    return "Q4";
  })();

  const monthsList = t.turkishMonths || ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
  const currentMonthName = monthsList[new Date().getMonth()];

  const quarters = t.turkishQuarters || [
    { key: "Q1", label: "Q1", months: ["Ocak", "Şubat", "Mart"] },
    { key: "Q2", label: "Q2", months: ["Nisan", "Mayıs", "Haziran"] },
    { key: "Q3", label: "Q3", months: ["Temmuz", "Ağustos", "Eylül"] },
    { key: "Q4", label: "Q4", months: ["Ekim", "Kasım", "Aralık"] }
  ];

  // States for adding new goals/subtasks
  const [addingGoalQ, setAddingGoalQ] = useState(null);
  const [addingSubtaskForGoalId, setAddingSubtaskForGoalId] = useState(null);
  const [newGoalText, setNewGoalText] = useState("");
  const [newSubtaskText, setNewSubtaskText] = useState("");

  const addInputRef = useRef(null);
  const subInputRef = useRef(null);

  // States for editing existing goals/subtasks
  const [editingGoal, setEditingGoal] = useState(null); // { quarter, id, text, subtaskId, goalId }
  const editInputRef = useRef(null);

  const [expandedGoals, setExpandedGoals] = useState({});
  const toggleExpandGoal = (goalId) => {
    setExpandedGoals(prev => ({
      ...prev,
      [goalId]: prev[goalId] === false ? true : false
    }));
  };

  useEffect(() => {
    if (addingGoalQ && addInputRef.current) {
      addInputRef.current.focus();
    }
  }, [addingGoalQ]);

  useEffect(() => {
    if (addingSubtaskForGoalId && subInputRef.current) {
      subInputRef.current.focus();
    }
  }, [addingSubtaskForGoalId]);

  useEffect(() => {
    if (editingGoal && editInputRef.current) {
      editInputRef.current.focus();
    }
  }, [editingGoal]);

  const getGoalsFor = (year, quarter) => {
    if (localBoard[year] && localBoard[year][quarter]) {
      return localBoard[year][quarter];
    }
    return [];
  };

  const saveBoardGoals = (year, quarter, updatedGoals) => {
    // 1. Optimistic update
    const updatedBoard = {
      ...localBoard,
      [year]: {
        ...(localBoard[year] || { "Q1": [], "Q2": [], "Q3": [], "Q4": [] }),
        [quarter]: updatedGoals
      }
    };
    setLocalBoard(updatedBoard);

    // 2. Persist to API
    fetch('/api/action-board/goals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ year, quarter, goals: updatedGoals })
    })
      .then(res => res.json())
      .then(resData => {
        if (resData.success) {
          onRefresh(true); // silent refresh to sync dashboard
        }
      })
      .catch(err => {
        console.error('Failed to save Action Board goals:', err);
      });
  };

  // Add Goal
  const handleAddGoal = (quarter) => {
    if (!newGoalText.trim()) {
      setAddingGoalQ(null);
      return;
    }
    const goals = getGoalsFor(selectedYear, quarter);
    const newGoalObj = {
      id: Date.now().toString(),
      text: newGoalText.trim(),
      completed: false,
      subtasks: []
    };
    const updated = [...goals, newGoalObj];
    saveBoardGoals(selectedYear, quarter, updated);
    setNewGoalText("");
    setAddingGoalQ(null);
  };

  const handleAddKeyDown = (e, quarter) => {
    if (e.key === 'Enter') handleAddGoal(quarter);
    if (e.key === 'Escape') { setAddingGoalQ(null); setNewGoalText(""); }
  };

  // Add Subtask
  const handleAddSubtask = (quarter, goalId) => {
    if (!newSubtaskText.trim()) {
      setAddingSubtaskForGoalId(null);
      return;
    }
    const goals = getGoalsFor(selectedYear, quarter);
    const updated = goals.map(g => {
      if (g.id === goalId) {
        const subtasks = [...(g.subtasks || []), {
          id: Date.now().toString(),
          text: newSubtaskText.trim(),
          completed: false
        }];
        return { ...g, subtasks, completed: false };
      }
      return g;
    });
    saveBoardGoals(selectedYear, quarter, updated);
    setNewSubtaskText("");
    setAddingSubtaskForGoalId(null);
  };

  const handleSubtaskAddKeyDown = (e, quarter, goalId) => {
    if (e.key === 'Enter') handleAddSubtask(quarter, goalId);
    if (e.key === 'Escape') { setAddingSubtaskForGoalId(null); setNewSubtaskText(""); }
  };

  // Toggle Goal
  const handleToggleGoal = (quarter, goalId) => {
    const goals = getGoalsFor(selectedYear, quarter);
    const updated = goals.map(g => {
      if (g.id === goalId) {
        const targetVal = !g.completed;
        const subtasks = (g.subtasks || []).map(s => ({ ...s, completed: targetVal }));
        return { ...g, completed: targetVal, subtasks };
      }
      return g;
    });
    saveBoardGoals(selectedYear, quarter, updated);
  };

  // Toggle Subtask
  const handleToggleSubtask = (quarter, goalId, subtaskId) => {
    const goals = getGoalsFor(selectedYear, quarter);
    const updated = goals.map(g => {
      if (g.id === goalId) {
        const subtasks = (g.subtasks || []).map(s => s.id === subtaskId ? { ...s, completed: !s.completed } : s);
        const allCompleted = subtasks.length > 0 && subtasks.every(s => s.completed);
        return { ...g, subtasks, completed: allCompleted };
      }
      return g;
    });
    saveBoardGoals(selectedYear, quarter, updated);
  };

  // Start Edit Goal
  const handleStartEdit = (quarter, goal) => {
    setEditingGoal({ quarter, id: goal.id, text: goal.text });
  };

  // Start Edit Subtask
  const handleStartSubtaskEdit = (quarter, goalId, subtask) => {
    setEditingGoal({ quarter, goalId, subtaskId: subtask.id, id: subtask.id, text: subtask.text });
  };

  // Save Edit Goal
  const handleSaveEdit = () => {
    if (!editingGoal || !editingGoal.text.trim()) return;
    const goals = getGoalsFor(selectedYear, editingGoal.quarter);
    const updated = goals.map(g => g.id === editingGoal.id ? { ...g, text: editingGoal.text.trim() } : g);
    saveBoardGoals(selectedYear, editingGoal.quarter, updated);
    setEditingGoal(null);
  };

  // Save Edit Subtask
  const handleSaveSubtaskEdit = () => {
    if (!editingGoal || !editingGoal.text.trim()) return;
    const goals = getGoalsFor(selectedYear, editingGoal.quarter);
    const updated = goals.map(g => {
      if (g.id === editingGoal.goalId) {
        const subtasks = (g.subtasks || []).map(s => s.id === editingGoal.subtaskId ? { ...s, text: editingGoal.text.trim() } : s);
        return { ...g, subtasks };
      }
      return g;
    });
    saveBoardGoals(selectedYear, editingGoal.quarter, updated);
    setEditingGoal(null);
  };

  const handleEditKeyDown = (e) => {
    if (e.key === 'Enter') {
      if (editingGoal.subtaskId) {
        handleSaveSubtaskEdit();
      } else {
        handleSaveEdit();
      }
    }
    if (e.key === 'Escape') setEditingGoal(null);
  };

  // Delete Goal
  const handleDeleteGoal = (quarter, goalId) => {
    const goals = getGoalsFor(selectedYear, quarter);
    const updated = goals.filter(g => g.id !== goalId);
    saveBoardGoals(selectedYear, quarter, updated);
  };

  // Delete Subtask
  const handleDeleteSubtask = (quarter, goalId, subtaskId) => {
    const goals = getGoalsFor(selectedYear, quarter);
    const updated = goals.map(g => {
      if (g.id === goalId) {
        const subtasks = (g.subtasks || []).filter(s => s.id !== subtaskId);
        const allCompleted = subtasks.length > 0 ? subtasks.every(s => s.completed) : g.completed;
        return { ...g, subtasks, completed: allCompleted };
      }
      return g;
    });
    saveBoardGoals(selectedYear, quarter, updated);
  };

  return (
    <div className="action-board-container" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Header Panel */}
      <div className="header" style={{ marginBottom: '4px' }}>
        <div className="greeting">
          <h1 style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {t.actionBoardTitle.split(' ')[0]} <span className="name" style={{ display: 'inline' }}>{t.actionBoardTitle.split(' ').slice(1).join(' ')}</span>
          </h1>
          <p style={{ fontSize: '14px', color: 'var(--text-muted)', marginTop: '4px' }}>
            {t.actionBoardDesc}
          </p>
        </div>

        {/* Year Tabs */}
        <div 
          ref={yearTabsRef}
          style={{ 
            display: 'flex', 
            gap: '6px', 
            background: 'rgba(228, 209, 203, 0.2)', 
            padding: '4px', 
            borderRadius: '12px',
            overflowX: 'auto',
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
            width: '300px',
            whiteSpace: 'nowrap'
          }}
        >
          {years.map(y => (
            <button
              key={y}
              data-year={y}
              data-active={selectedYear === y ? "true" : "false"}
              onClick={() => setSelectedYear(y)}
              style={{
                padding: '6px 16px',
                fontSize: '13px',
                fontWeight: '600',
                borderRadius: '8px',
                color: selectedYear === y ? 'var(--color-coral-dark)' : 'var(--text-muted)',
                background: selectedYear === y ? '#FFFFFF' : 'transparent',
                boxShadow: selectedYear === y ? 'var(--shadow-sm)' : 'none',
                transition: 'var(--transition-smooth)',
                flexShrink: 0
              }}
            >
              {y}
            </button>
          ))}
        </div>
      </div>

      {/* 4 Quarters Grid */}
      <div className="quarters-grid" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '20px' }}>
        <style>{`
          @media (min-width: 768px) {
            .quarters-grid {
              grid-template-columns: repeat(2, 1fr) !important;
            }
          }
        `}</style>

        {quarters.map(q => {
          const goals = getGoalsFor(selectedYear, q.key);
          const isCurrent = selectedYear === currentYear && q.key === currentQuarter;
          const completedCount = goals.filter(g => g.completed).length;

          return (
            <div
              key={q.key}
              className="dashboard-card"
              style={{
                position: 'relative',
                border: isCurrent ? '2px solid var(--color-coral-dark)' : '1px solid var(--border-card)',
                boxShadow: isCurrent ? 'var(--shadow-md)' : 'var(--shadow-sm)'
              }}
            >
              {isCurrent && (
                <span style={{
                  position: 'absolute',
                  top: '-12px',
                  left: '20px',
                  background: 'var(--color-coral-dark)',
                  color: '#FFFFFF',
                  fontSize: '9.5px',
                  fontWeight: '700',
                  padding: '2px 10px',
                  borderRadius: '10px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em'
                }}>
                  {t.currentQuarterLabel}
                </span>
              )}

              {/* Card Header */}
              <div className="card-header" style={{ marginBottom: '16px' }}>
                <h3 className="card-title" style={{ fontSize: '18px' }}>{q.key}</h3>
                <span className={`badge ${isCurrent ? 'badge-coral' : 'badge-gray'}`}>
                  {goals.length > 0 ? `${completedCount}/${goals.length} ${t.completedSuffix}` : t.noGoals}
                </span>
              </div>

              {/* Goals & Subtasks List */}
              <div className="goals-list" style={{ minHeight: '80px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {goals.map((goal, idx) => {
                  const hasSubtasks = goal.subtasks && goal.subtasks.length > 0;
                  const completedSubtasks = hasSubtasks ? goal.subtasks.filter(s => s.completed).length : 0;
                  const totalSubtasks = hasSubtasks ? goal.subtasks.length : 0;
                  const isExpanded = expandedGoals[goal.id] !== false;

                  return (
                    <div key={goal.id} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <div
                        className="goal-item"
                        style={{ position: 'relative', alignItems: 'flex-start', padding: '6px 4px' }}
                      >
                        {/* Expand/Collapse Toggle */}
                        {hasSubtasks ? (
                          <button
                            onClick={() => toggleExpandGoal(goal.id)}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: 'var(--text-muted)',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              padding: '2px',
                              marginRight: '2px',
                              marginTop: '2px',
                              flexShrink: 0
                            }}
                            title={isExpanded ? t.hideSubtasks : t.showSubtasks}
                          >
                            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          </button>
                        ) : (
                          <div style={{ width: '18px', flexShrink: 0, marginRight: '2px' }} />
                        )}

                        {/* Checkbox */}
                        <button
                          onClick={() => handleToggleGoal(q.key, goal.id)}
                          style={{
                            width: '18px',
                            height: '18px',
                            borderRadius: '4px',
                            flexShrink: 0,
                            marginTop: '2px',
                            border: '1.5px solid var(--color-coral-dark)',
                            background: goal.completed ? 'var(--color-coral-dark)' : 'transparent',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer'
                          }}
                        >
                          {goal.completed && <Check size={11} strokeWidth={3} color="white" />}
                        </button>

                        {/* Goal Text */}
                        {editingGoal && editingGoal.quarter === q.key && editingGoal.id === goal.id && !editingGoal.subtaskId ? (
                          <input
                            ref={editInputRef}
                            value={editingGoal.text}
                            onChange={e => setEditingGoal({ ...editingGoal, text: e.target.value })}
                            onBlur={handleSaveEdit}
                            onKeyDown={handleEditKeyDown}
                            style={{
                              flex: 1,
                              fontSize: '14px',
                              padding: '2px 8px',
                              background: 'rgba(228, 209, 203, 0.2)',
                              border: '1px solid var(--color-coral-dark)',
                              borderRadius: '6px',
                              color: 'var(--text-main)',
                              outline: 'none'
                            }}
                          />
                        ) : (
                          <span
                            className="goal-text"
                            onClick={() => handleToggleGoal(q.key, goal.id)}
                            style={{
                              cursor: 'pointer',
                              flex: 1,
                              textDecoration: goal.completed ? 'line-through' : 'none',
                              opacity: goal.completed ? 0.5 : 1,
                              fontSize: '14px',
                              lineHeight: '1.4',
                              fontWeight: '600'
                            }}
                            title={t.clickToCompleteTooltip}
                          >
                            {goal.text}
                            {hasSubtasks && (
                              <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: '6px', fontWeight: '400' }}>
                                ({completedSubtasks}/{totalSubtasks})
                              </span>
                            )}
                          </span>
                        )}

                        {/* Goal Actions */}
                        <div style={{ display: 'flex', gap: '6px', opacity: 0, transition: '0.15s' }} className="goal-actions">
                          <button
                            onClick={() => {
                              setAddingSubtaskForGoalId(goal.id);
                              setEditingGoal(null);
                              setExpandedGoals(prev => ({ ...prev, [goal.id]: true }));
                            }}
                            title={t.addSubtaskTooltip}
                            style={{ color: 'var(--color-coral-dark)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                          >
                            <Plus size={12} />
                          </button>
                          <button onClick={() => handleStartEdit(q.key, goal)} title={t.editTooltip} style={{ color: 'var(--text-muted)', cursor: 'pointer' }}>
                            <Pencil size={12} />
                          </button>
                          <button onClick={() => handleDeleteGoal(q.key, goal.id)} title={t.deleteTooltip} style={{ color: '#e57373', cursor: 'pointer' }}>
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>

                      {/* Subtasks list */}
                      {hasSubtasks && isExpanded && goal.subtasks.map(subtask => (
                        <div
                          key={subtask.id}
                          className="goal-item"
                          style={{
                            position: 'relative',
                            alignItems: 'flex-start',
                            padding: '4px 4px 4px 62px', // Indent to align with parent task text
                            borderBottom: 'none'
                          }}
                        >
                          {/* Subtask Checkbox */}
                          <button
                            onClick={() => handleToggleSubtask(q.key, goal.id, subtask.id)}
                            style={{
                              width: '14px',
                              height: '14px',
                              borderRadius: '3px',
                              flexShrink: 0,
                              marginTop: '2px',
                              border: '1.2px solid var(--text-muted)',
                              background: subtask.completed ? 'var(--text-muted)' : 'transparent',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              cursor: 'pointer'
                            }}
                          >
                            {subtask.completed && <Check size={8} strokeWidth={4} color="white" />}
                          </button>

                          {/* Subtask Text */}
                          {editingGoal && editingGoal.quarter === q.key && editingGoal.goalId === goal.id && editingGoal.subtaskId === subtask.id ? (
                            <input
                              ref={editInputRef}
                              value={editingGoal.text}
                              onChange={e => setEditingGoal({ ...editingGoal, text: e.target.value })}
                              onBlur={handleSaveSubtaskEdit}
                              onKeyDown={handleEditKeyDown}
                              style={{
                                flex: 1,
                                fontSize: '13px',
                                padding: '1px 6px',
                                background: 'rgba(228, 209, 203, 0.2)',
                                border: '1px solid var(--color-coral-dark)',
                                borderRadius: '4px',
                                color: 'var(--text-main)',
                                outline: 'none'
                              }}
                            />
                          ) : (
                            <span
                              className="goal-text"
                              onClick={() => handleToggleSubtask(q.key, goal.id, subtask.id)}
                              style={{
                                cursor: 'pointer',
                                flex: 1,
                                textDecoration: subtask.completed ? 'line-through' : 'none',
                                opacity: subtask.completed ? 0.6 : 1,
                                fontSize: '13px',
                                color: 'var(--text-main)'
                              }}
                              title={t.clickToCompleteTooltip}
                            >
                              {subtask.text}
                            </span>
                          )}

                          {/* Subtask Hover Actions */}
                          <div style={{ display: 'flex', gap: '6px', opacity: 0, transition: '0.15s' }} className="goal-actions">
                            <button onClick={() => handleStartSubtaskEdit(q.key, goal.id, subtask)} title={t.editTooltip} style={{ color: 'var(--text-muted)', cursor: 'pointer' }}>
                              <Pencil size={11} />
                            </button>
                            <button onClick={() => handleDeleteSubtask(q.key, goal.id, subtask.id)} title={t.deleteTooltip} style={{ color: '#e57373', cursor: 'pointer' }}>
                              <Trash2 size={11} />
                            </button>
                          </div>
                        </div>
                      ))}

                      {/* Subtask Adder field */}
                      {isExpanded && addingSubtaskForGoalId === goal.id && (
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', paddingLeft: '62px', marginTop: '2px' }}>
                          <div style={{ width: '14px', height: '14px', flexShrink: 0, border: '1.2px dashed var(--text-muted)', borderRadius: '3px' }} />
                          <input
                            ref={subInputRef}
                            value={newSubtaskText}
                            onChange={e => setNewSubtaskText(e.target.value)}
                            onKeyDown={e => handleSubtaskAddKeyDown(e, q.key, goal.id)}
                            onBlur={() => handleAddSubtask(q.key, goal.id)}
                            placeholder={t.addSubtaskPlaceholder}
                            style={{
                              flex: 1,
                              fontSize: '13px',
                              padding: '4px 8px',
                              background: 'rgba(228, 209, 203, 0.1)',
                              border: '1px dashed var(--text-muted)',
                              borderRadius: '6px',
                              color: 'var(--text-main)',
                              outline: 'none'
                            }}
                          />
                          <button
                            onMouseDown={(e) => {
                              e.preventDefault();
                              handleAddSubtask(q.key, goal.id);
                            }}
                            style={{ color: 'var(--color-coral-dark)', cursor: 'pointer', padding: '2px' }}
                          >
                            <Check size={14} />
                          </button>
                          <button
                            onMouseDown={(e) => {
                              e.preventDefault();
                              setAddingSubtaskForGoalId(null);
                              setNewSubtaskText("");
                            }}
                            style={{ color: 'var(--text-muted)', cursor: 'pointer', padding: '2px' }}
                          >
                            <X size={14} />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Inline goals adder field */}
                {addingGoalQ === q.key ? (
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '8px' }}>
                    <div style={{ width: '18px', height: '18px', flexShrink: 0, border: '1.5px dashed var(--color-coral-dark)', borderRadius: '4px' }} />
                    <input
                      ref={addInputRef}
                      value={newGoalText}
                      onChange={e => setNewGoalText(e.target.value)}
                      onKeyDown={e => handleAddKeyDown(e, q.key)}
                      onBlur={() => handleAddGoal(q.key)}
                      placeholder={t.addGoalPlaceholder}
                      style={{
                        flex: 1,
                        fontSize: '14px',
                        padding: '6px 10px',
                        background: 'rgba(228, 209, 203, 0.15)',
                        border: '1px dashed var(--color-coral-dark)',
                        borderRadius: '8px',
                        color: 'var(--text-main)',
                        outline: 'none'
                      }}
                    />
                    <button
                      onMouseDown={(e) => {
                        e.preventDefault();
                        handleAddGoal(q.key);
                      }}
                      style={{ color: 'var(--color-coral-dark)', cursor: 'pointer', padding: '4px' }}
                    >
                      <Check size={16} />
                    </button>
                    <button
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setAddingGoalQ(null);
                        setNewGoalText("");
                      }}
                      style={{ color: 'var(--text-muted)', cursor: 'pointer', padding: '4px' }}
                    >
                      <X size={16} />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setAddingGoalQ(q.key)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      fontSize: '13px',
                      color: 'var(--color-coral-dark)',
                      background: 'rgba(228, 209, 203, 0.15)',
                      border: '1px dashed rgba(183, 157, 148, 0.3)',
                      borderRadius: '8px',
                      padding: '8px 12px',
                      marginTop: '8px',
                      cursor: 'pointer',
                      transition: 'var(--transition-smooth)',
                      justifyContent: 'center'
                    }}
                  >
                    <Plus size={14} /> {t.addNewGoalButton}
                  </button>
                )}

                {goals.length === 0 && !addingGoalQ && (
                  <div style={{ textAlign: 'center', padding: '16px', color: 'var(--text-muted)', fontSize: '13px', fontStyle: 'italic' }}>
                    {t.noGoalsAdded}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* 12-Month Year Timeline Bar */}
      <div
        className="dashboard-card"
        style={{
          marginTop: '8px',
          padding: '16px 20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h4 style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-main)', margin: 0 }}>
            {selectedYear} {t.yearTimeline}
          </h4>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            {t.activeMonthLabel}: {selectedYear === currentYear ? currentMonthName : t.noActiveMonth}
          </span>
        </div>
        <div style={{
          display: 'flex',
          background: 'rgba(228, 209, 203, 0.1)',
          borderRadius: '16px',
          padding: '8px 10px',
          gap: '8px',
          overflowX: 'auto',
          scrollbarWidth: 'none',
          alignItems: 'stretch'
        }}>
          {quarters.map((q) => {
            const qGoals = getGoalsFor(selectedYear, q.key);
            const isQCompleted = qGoals.length > 0 && qGoals.every(g => g.completed);
            const isQCurrent = selectedYear === currentYear && q.key === currentQuarter;
            
            const qColors = {
              Q1: {
                bg: 'var(--color-gold-dark)',
                border: 'rgba(166, 110, 58, 0.35)'
              },
              Q2: {
                bg: 'var(--color-coral-dark)',
                border: 'rgba(201, 91, 67, 0.35)'
              },
              Q3: {
                bg: 'var(--color-green-dark)',
                border: 'rgba(74, 122, 84, 0.35)'
              },
              Q4: {
                bg: 'var(--color-purple-dark)',
                border: 'rgba(92, 78, 107, 0.35)'
              }
            };
            
            const colorSet = qColors[q.key];

            return (
              <div
                key={q.key}
                style={{
                  display: 'flex',
                  gap: '4px',
                  padding: '12px 6px 6px 6px',
                  borderRadius: '12px',
                  border: isQCurrent 
                    ? '1.5px solid var(--color-coral-dark)' 
                    : '1px solid rgba(183, 157, 148, 0.25)',
                  background: isQCurrent ? 'rgba(228, 209, 203, 0.15)' : 'rgba(255, 255, 255, 0.4)',
                  flex: 1,
                  minWidth: '145px',
                  alignItems: 'center',
                  justifyContent: 'space-around',
                  position: 'relative'
                }}
              >
                <div style={{
                  position: 'absolute',
                  top: '-7px',
                  left: '10px',
                  background: '#FFFFFF',
                  padding: '0 5px',
                  fontSize: '8px',
                  fontWeight: '700',
                  color: isQCurrent ? 'var(--color-coral-dark)' : 'var(--text-muted)',
                  borderRadius: '3px',
                  border: '1px solid rgba(183, 157, 148, 0.2)',
                  lineHeight: 1
                }}>
                  {q.key}
                </div>

                {q.months.map((m) => {
                  const monthIdx = monthsList.indexOf(m);
                  const currentMonthIdx = monthsList.indexOf(currentMonthName);
                  
                  const isMonthHighlight = (() => {
                    const selYear = parseInt(selectedYear);
                    const curYear = parseInt(currentYear);
                    if (selYear < curYear) return true;
                    if (selYear > curYear) return false;
                    return monthIdx <= currentMonthIdx;
                  })();
                  
                  const isCurrentMonth = selectedYear === currentYear && monthIdx === currentMonthIdx;

                  return (
                    <div
                      key={m}
                      style={{
                        flex: 1,
                        textAlign: 'center',
                        fontSize: '11px',
                        padding: isCurrentMonth ? '5px 0' : '6px 0',
                        borderRadius: '6px',
                        fontWeight: isMonthHighlight || isQCompleted ? '700' : '500',
                        color: isMonthHighlight || isQCompleted
                          ? '#FFFFFF' 
                          : 'var(--text-muted)',
                        background: isQCompleted
                          ? colorSet.bg
                          : isMonthHighlight 
                            ? colorSet.bg
                            : 'transparent',
                        border: isCurrentMonth 
                          ? '2px solid rgba(255, 255, 255, 0.85)' 
                          : isMonthHighlight || isQCompleted
                            ? `1px solid ${colorSet.border}`
                            : '1px solid rgba(183, 157, 148, 0.25)',
                        boxShadow: (isMonthHighlight || isQCompleted) ? 'var(--shadow-sm)' : 'none',
                        transition: 'var(--transition-smooth)',
                        minWidth: '40px'
                      }}
                      title={isCurrentMonth ? `${m} (${t.currentMonthTooltip})` : m}
                    >
                      {m}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
