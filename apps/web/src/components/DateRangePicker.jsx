'use client';

import { useState } from 'react';

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

function formatPreviewDate(value) {
    const d = parseDateStr(value);
    if (!d) return '—';
    return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }).format(d);
}

function getPreset(key) {
    const today = new Date();
    const end = toDateStr(today);
    if (key === 'today') return { dateFrom: end, dateTo: end };
    if (key === 'last7') {
        const s = new Date(today);
        s.setDate(today.getDate() - 6);
        return { dateFrom: toDateStr(s), dateTo: end };
    }
    if (key === 'last30') {
        const s = new Date(today);
        s.setDate(today.getDate() - 29);
        return { dateFrom: toDateStr(s), dateTo: end };
    }
    const s = new Date(today.getFullYear(), today.getMonth(), 1);
    return { dateFrom: toDateStr(s), dateTo: end };
}

export default function DateRangePicker({ dateFrom, dateTo, onChange }) {
    const [calMonth, setCalMonth] = useState(
        () => startOfMonth(parseDateStr(dateFrom) || new Date()),
    );

    const start = parseDateStr(dateFrom);
    const end = parseDateStr(dateTo);
    const days = buildMonthGrid(calMonth);
    const hasSelection = Boolean(dateFrom || dateTo);
    const hasFullRange = Boolean(start && end && !isSameDay(start, end));

    const handleDayClick = (day) => {
        const clicked = toDateStr(day);
        if (!start || (start && end)) {
            onChange({ dateFrom: clicked, dateTo: '' });
        } else if (day < start) {
            onChange({ dateFrom: clicked, dateTo: dateFrom });
        } else {
            onChange({ dateFrom, dateTo: clicked });
        }
    };

    const handleQuick = (key) => {
        const range = getPreset(key);
        onChange(range);
        setCalMonth(startOfMonth(parseDateStr(range.dateFrom) || new Date()));
    };

    return (
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
                <button type="button" className="drp-clear" onClick={() => onChange({ dateFrom: '', dateTo: '' })}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                    Hapus tanggal
                </button>
            ) : null}
        </div>
    );
}
