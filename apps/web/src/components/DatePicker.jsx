'use client';

import { useEffect, useRef, useState } from 'react';
import './DatePicker.css';

const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const WEEKDAYS = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];
const ITEM_H = 36;
const MARGIN = 8;

function ScrollPicker({ value, min, max, onChange }) {
    const items = [];
    for (let i = min; i <= max; i++) items.push(i);

    const listRef = useRef(null);
    const timerRef = useRef(null);

    useEffect(() => {
        const el = listRef.current;
        if (!el) return;
        const idx = Math.max(0, items.indexOf(value));
        el.scrollTop = idx * ITEM_H;
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const handleScroll = () => {
        clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
            const el = listRef.current;
            if (!el) return;
            const idx = Math.round(el.scrollTop / ITEM_H);
            const clamped = Math.max(0, Math.min(items.length - 1, idx));
            el.scrollTo({ top: clamped * ITEM_H, behavior: 'smooth' });
            onChange(items[clamped]);
        }, 80);
    };

    return (
        <div className="sp-wrap">
            <div className="sp-band" />
            <div className="sp-list" ref={listRef} onScroll={handleScroll}>
                <div className="sp-pad" />
                {items.map((item) => (
                    <div key={item} className={`sp-item${item === value ? ' is-sel' : ''}`}>
                        {String(item).padStart(2, '0')}
                    </div>
                ))}
                <div className="sp-pad" />
            </div>
            <div className="sp-mask sp-mask--t" />
            <div className="sp-mask sp-mask--b" />
        </div>
    );
}

function parseDatePart(datePart) {
    if (!datePart) return null;
    const parts = datePart.split('-').map(Number);
    return parts.length === 3 && !parts.some(isNaN) ? parts : null;
}

function getDaysInMonth(year, month) {
    return new Date(year, month + 1, 0).getDate();
}

function getStartOffset(year, month) {
    const day = new Date(year, month, 1).getDay();
    return (day + 6) % 7;
}

function buildDateValue(year, month0, day) {
    return `${year}-${String(month0 + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export default function DatePicker({
    value,
    onChange,
    placeholder = 'Pilih tanggal',
    disabled = false,
    label,
    align = 'left',
    showTime = false,
}) {
    const today = new Date();

    const datePart = showTime ? (value || '').split('T')[0] : value || '';
    const timePart = showTime ? ((value || '').split('T')[1] || '') : '';
    const parsedDate = parseDatePart(datePart);

    let tHour = 8;
    let tMin = 0;
    if (showTime && timePart) {
        const [h, m] = timePart.split(':').map(Number);
        tHour = isNaN(h) ? 8 : Math.min(23, Math.max(0, h));
        tMin = isNaN(m) ? 0 : Math.min(59, Math.max(0, m));
    }

    const [isOpen, setIsOpen] = useState(false);
    const [calStyle, setCalStyle] = useState({});
    const [viewYear, setViewYear] = useState(parsedDate ? parsedDate[0] : today.getFullYear());
    const [viewMonth, setViewMonth] = useState(parsedDate ? parsedDate[1] - 1 : today.getMonth());
    const wrapRef = useRef(null);

    useEffect(() => {
        if (!isOpen) return;
        const handleOutside = (e) => {
            if (wrapRef.current && !wrapRef.current.contains(e.target)) setIsOpen(false);
        };
        const handleScroll = (e) => {
            // Don't close when scrolling inside the picker drums
            if (wrapRef.current && wrapRef.current.contains(e.target)) return;
            setIsOpen(false);
        };
        document.addEventListener('mousedown', handleOutside);
        window.addEventListener('scroll', handleScroll, true);
        return () => {
            document.removeEventListener('mousedown', handleOutside);
            window.removeEventListener('scroll', handleScroll, true);
        };
    }, [isOpen]);

    const handleToggle = () => {
        if (disabled) return;
        if (!isOpen) {
            const rect = wrapRef.current?.getBoundingClientRect();
            if (rect) {
                const isMobile = window.innerWidth <= 480;
                const popupW = showTime ? (isMobile ? Math.min(340, window.innerWidth - 24) : 420) : 272;
                const POPUP_H = showTime ? 520 : 320;
                const spaceBelow = window.innerHeight - rect.bottom - MARGIN;
                const spaceAbove = rect.top - MARGIN;
                const openUpward = spaceBelow < POPUP_H && spaceAbove > spaceBelow;

                const leftPos = align === 'right'
                    ? rect.right - popupW
                    : rect.left;
                const clampedLeft = Math.max(MARGIN, Math.min(leftPos, window.innerWidth - popupW - MARGIN));

                setCalStyle({
                    position: 'fixed',
                    left: clampedLeft,
                    ...(openUpward
                        ? { bottom: window.innerHeight - rect.top + 6 }
                        : { top: rect.bottom + 6 }),
                    zIndex: 600,
                });
            }
        }
        setIsOpen((o) => !o);
    };

    const selYear = parsedDate?.[0] ?? null;
    const selMonth = parsedDate ? parsedDate[1] - 1 : null;
    const selDay = parsedDate?.[2] ?? null;
    const hasDate = selDay !== null && selYear !== null && selMonth !== null;

    const daysInMonth = getDaysInMonth(viewYear, viewMonth);
    const startOffset = getStartOffset(viewYear, viewMonth);
    const cells = [];
    for (let i = 0; i < startOffset; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);

    const isToday = (d) =>
        d === today.getDate() && viewMonth === today.getMonth() && viewYear === today.getFullYear();
    const isSelected = (d) =>
        d === selDay && viewMonth === selMonth && viewYear === selYear;

    const handleSelect = (d) => {
        if (!d) return;
        const base = buildDateValue(viewYear, viewMonth, d);
        if (showTime) {
            onChange(`${base}T${String(tHour).padStart(2, '0')}:${String(tMin).padStart(2, '0')}`);
        } else {
            onChange(base);
            setIsOpen(false);
        }
    };

    const handleTimeInput = (newHour, newMin) => {
        if (!hasDate) return;
        const base = buildDateValue(selYear, selMonth, selDay);
        onChange(`${base}T${String(newHour).padStart(2, '0')}:${String(newMin).padStart(2, '0')}`);
    };

    const prevMonth = () => {
        if (viewMonth === 0) { setViewYear((y) => y - 1); setViewMonth(11); }
        else setViewMonth((m) => m - 1);
    };
    const nextMonth = () => {
        if (viewMonth === 11) { setViewYear((y) => y + 1); setViewMonth(0); }
        else setViewMonth((m) => m + 1);
    };

    const displayValue = () => {
        if (!value) return null;
        const dp = parseDatePart(datePart);
        if (!dp) return null;
        const [y, m, d] = dp;
        const base = `${d} ${MONTHS[m - 1]} ${y}`;
        if (showTime && timePart) return `${base}, ${timePart}`;
        return base;
    };

    return (
        <div className={`dp-wrap${isOpen ? ' is-open' : ''}${disabled ? ' is-disabled' : ''}`} ref={wrapRef}>
            {label ? <span className="dp-label">{label}</span> : null}
            <button
                type="button"
                className="dp-trigger"
                onClick={handleToggle}
                disabled={disabled}
            >
                <span className={`dp-trigger-value${!value ? ' is-placeholder' : ''}`}>
                    {displayValue() || placeholder}
                </span>
                <span className="dp-trigger-icon" aria-hidden="true">
                    {showTime ? (
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                        </svg>
                    ) : (
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="4" width="18" height="18" rx="2" />
                            <line x1="16" y1="2" x2="16" y2="6" />
                            <line x1="8" y1="2" x2="8" y2="6" />
                            <line x1="3" y1="10" x2="21" y2="10" />
                        </svg>
                    )}
                </span>
            </button>

            {isOpen ? (
                <div
                    className={`dp-calendar${showTime ? ' dp-calendar--with-time' : ''}`}
                    style={calStyle}
                >
                    <div className={showTime ? 'dp-body' : undefined}>
                        <div className={showTime ? 'dp-date-col' : undefined}>
                            <div className="dp-header">
                                <button type="button" className="dp-nav" onClick={prevMonth} aria-label="Bulan sebelumnya">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                        <polyline points="15 18 9 12 15 6" />
                                    </svg>
                                </button>
                                <span className="dp-month-label">{MONTHS[viewMonth]} {viewYear}</span>
                                <button type="button" className="dp-nav" onClick={nextMonth} aria-label="Bulan berikutnya">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                        <polyline points="9 18 15 12 9 6" />
                                    </svg>
                                </button>
                            </div>

                            <div className="dp-weekdays">
                                {WEEKDAYS.map((d) => (
                                    <span key={d} className="dp-weekday">{d}</span>
                                ))}
                            </div>

                            <div className="dp-grid">
                                {cells.map((d, i) => (
                                    <button
                                        key={i}
                                        type="button"
                                        className={[
                                            'dp-day',
                                            !d ? 'dp-day--empty' : '',
                                            d && isToday(d) ? 'dp-day--today' : '',
                                            d && isSelected(d) ? 'dp-day--selected' : '',
                                        ].filter(Boolean).join(' ')}
                                        onClick={() => handleSelect(d)}
                                        disabled={!d}
                                        tabIndex={d ? 0 : -1}
                                    >
                                        {d || ''}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {showTime ? (
                            <div className="dp-time-col">
                                <span className="dp-time-col-label">Waktu</span>
                                <div className="dp-time-drums">
                                    <ScrollPicker
                                        value={tHour}
                                        min={0}
                                        max={23}
                                        onChange={(h) => handleTimeInput(h, tMin)}
                                    />
                                    <span className="dp-time-colon">:</span>
                                    <ScrollPicker
                                        value={tMin}
                                        min={0}
                                        max={59}
                                        onChange={(m) => handleTimeInput(tHour, m)}
                                    />
                                </div>
                                {!hasDate ? <span className="dp-time-hint">Pilih tanggal dulu</span> : null}
                                <button
                                    type="button"
                                    className="dp-time-done"
                                    onClick={() => setIsOpen(false)}
                                    disabled={!hasDate}
                                >
                                    Selesai
                                </button>
                            </div>
                        ) : null}
                    </div>

                    {value ? (
                        <div className="dp-footer">
                            <button
                                type="button"
                                className="dp-clear"
                                onClick={() => { onChange(''); setIsOpen(false); }}
                            >
                                Hapus tanggal
                            </button>
                        </div>
                    ) : null}
                </div>
            ) : null}
        </div>
    );
}
