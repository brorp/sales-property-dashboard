'use client';

import { useEffect, useRef, useState } from 'react';
import './DateRangePicker.css';

const DAY_LABELS = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];

function startOfMonth(date) {
    return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date, n) {
    return new Date(date.getFullYear(), date.getMonth() + n, 1);
}

function parseDateStr(value) {
    if (!value) return null;
    const [y, m, d] = String(value).split('-').map(Number);
    if (!y || !m || !d) return null;
    const date = new Date(y, m - 1, d);
    return Number.isNaN(date.getTime()) ? null : date;
}

function toDateStr(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function isSameDay(a, b) {
    if (!a || !b) return false;
    return a.getFullYear() === b.getFullYear()
        && a.getMonth() === b.getMonth()
        && a.getDate() === b.getDate();
}

function buildMonthGrid(monthDate) {
    const first = startOfMonth(monthDate);
    const offset = (first.getDay() + 6) % 7;
    const gridStart = new Date(first);
    gridStart.setDate(first.getDate() - offset);
    return Array.from({ length: 42 }, (_, i) => {
        const d = new Date(gridStart);
        d.setDate(gridStart.getDate() + i);
        return d;
    });
}

function formatMonthTitle(date) {
    return new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' }).format(date);
}

export default function DateRangePicker({ value = {}, onApply, onReset, loading, trigger }) {
    const [isOpen, setIsOpen] = useState(false);
    const [popoverPos, setPopoverPos] = useState({ top: 0, left: 0 });
    const [draft, setDraft] = useState({ dateFrom: value.dateFrom || '', dateTo: value.dateTo || '' });
    const [calMonth, setCalMonth] = useState(() => startOfMonth(parseDateStr(value.dateFrom) || new Date()));
    const triggerRef = useRef(null);
    const popoverRef = useRef(null);

    const isActive = Boolean(value?.dateFrom);

    useEffect(() => {
        if (!isOpen) return undefined;
        const handlePointerDown = (e) => {
            if (
                popoverRef.current && !popoverRef.current.contains(e.target) &&
                triggerRef.current && !triggerRef.current.contains(e.target)
            ) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handlePointerDown);
        return () => document.removeEventListener('mousedown', handlePointerDown);
    }, [isOpen]);

    const handleOpen = () => {
        if (isOpen) { setIsOpen(false); return; }
        const rect = triggerRef.current?.getBoundingClientRect();
        if (rect) {
            const POPOVER_WIDTH = 286;
            const MARGIN = 8;
            const left = Math.min(rect.left, window.innerWidth - POPOVER_WIDTH - MARGIN);
            setPopoverPos({ top: rect.bottom + 8, left: Math.max(MARGIN, left) });
        }
        setDraft({ dateFrom: value.dateFrom || '', dateTo: value.dateTo || '' });
        setCalMonth(startOfMonth(parseDateStr(value.dateFrom) || new Date()));
        setIsOpen(true);
    };

    const handleApply = () => {
        onApply?.({ dateFrom: draft.dateFrom, dateTo: draft.dateTo || draft.dateFrom });
        setIsOpen(false);
    };

    const handleReset = () => {
        onReset?.();
        setIsOpen(false);
    };

    const start = parseDateStr(draft.dateFrom);
    const end = parseDateStr(draft.dateTo);
    const days = buildMonthGrid(calMonth);
    const hasSelection = Boolean(draft.dateFrom || draft.dateTo);
    const hasFullRange = Boolean(start && end && !isSameDay(start, end));

    const handleDayClick = (day) => {
        const clicked = toDateStr(day);
        if (!start || (start && end)) {
            setDraft({ dateFrom: clicked, dateTo: '' });
        } else if (day < start) {
            setDraft({ dateFrom: clicked, dateTo: draft.dateFrom });
        } else {
            setDraft((prev) => ({ ...prev, dateTo: clicked }));
        }
    };

    return (
        <div ref={triggerRef} style={{ display: 'inline-block' }}>
            {trigger?.({ open: handleOpen, isActive })}

            {isOpen ? (
                <div ref={popoverRef} className="drp-popover" style={{ position: 'fixed', top: popoverPos.top, left: popoverPos.left }}>
                    <div className="drp">
                        <div className="drp-nav">
                            <button type="button" className="drp-nav-btn" onClick={() => setCalMonth((p) => addMonths(p, -1))} aria-label="Bulan sebelumnya">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="m15 18-6-6 6-6"/>
                                </svg>
                            </button>
                            <span className="drp-nav-label">{formatMonthTitle(calMonth)}</span>
                            <button type="button" className="drp-nav-btn" onClick={() => setCalMonth((p) => addMonths(p, 1))} aria-label="Bulan berikutnya">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="m9 18 6-6-6-6"/>
                                </svg>
                            </button>
                        </div>

                        <div className="drp-weekdays">
                            {DAY_LABELS.map((d) => <span key={d}>{d}</span>)}
                        </div>

                        <div className="drp-grid">
                            {days.map((day) => {
                                const outside = day.getMonth() !== calMonth.getMonth();
                                const isStart = isSameDay(day, start);
                                const isEnd = isSameDay(day, end);
                                const inRange = !outside && start && end && day > start && day < end;
                                const isToday = isSameDay(day, new Date());

                                const cls = [
                                    'drp-day',
                                    outside && 'is-outside',
                                    isToday && !isStart && !isEnd && 'is-today',
                                    inRange && 'is-in-range',
                                    isStart && 'is-start',
                                    isEnd && 'is-end',
                                    isStart && hasFullRange && 'has-end',
                                    isEnd && hasFullRange && 'has-start',
                                ].filter(Boolean).join(' ');

                                return (
                                    <button
                                        key={toDateStr(day)}
                                        type="button"
                                        className={cls}
                                        onClick={() => !outside && handleDayClick(day)}
                                        tabIndex={outside ? -1 : 0}
                                        aria-label={toDateStr(day)}
                                    >
                                        <span className="drp-day-inner">{day.getDate()}</span>
                                    </button>
                                );
                            })}
                        </div>

                        {hasSelection ? (
                            <button type="button" className="drp-clear" onClick={() => setDraft({ dateFrom: '', dateTo: '' })}>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                                </svg>
                                Hapus tanggal
                            </button>
                        ) : null}
                    </div>

                    <div className="drp-actions">
                        <button type="button" className="drp-action-btn drp-action-btn--secondary" onClick={handleReset} disabled={loading}>
                            Reset
                        </button>
                        <button type="button" className="drp-action-btn drp-action-btn--primary" onClick={handleApply} disabled={loading || !draft.dateFrom}>
                            {loading ? 'Loading...' : 'Terapkan'}
                        </button>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
