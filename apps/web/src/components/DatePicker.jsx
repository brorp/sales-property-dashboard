'use client';

import { useEffect, useRef, useState } from 'react';
import './DatePicker.css';

const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const WEEKDAYS = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];

function formatDisplay(value) {
    if (!value) return null;
    const [y, m, d] = value.split('-').map(Number);
    if (!y || !m || !d) return null;
    return `${d} ${MONTHS[m - 1]} ${y}`;
}

function getDaysInMonth(year, month) {
    return new Date(year, month + 1, 0).getDate();
}

function getStartOffset(year, month) {
    const day = new Date(year, month, 1).getDay(); // 0=Sun
    return (day + 6) % 7; // convert to Monday-first
}

export default function DatePicker({
    value,
    onChange,
    placeholder = 'Pilih tanggal',
    disabled = false,
    label,
}) {
    const today = new Date();
    const parsedValue = value ? value.split('-').map(Number) : null;

    const [isOpen, setIsOpen] = useState(false);
    const [viewYear, setViewYear] = useState(parsedValue ? parsedValue[0] : today.getFullYear());
    const [viewMonth, setViewMonth] = useState(parsedValue ? parsedValue[1] - 1 : today.getMonth());
    const wrapRef = useRef(null);

    useEffect(() => {
        if (!isOpen) return;
        const handleOutside = (e) => {
            if (wrapRef.current && !wrapRef.current.contains(e.target)) setIsOpen(false);
        };
        document.addEventListener('mousedown', handleOutside);
        return () => document.removeEventListener('mousedown', handleOutside);
    }, [isOpen]);

    const selYear = parsedValue?.[0] ?? null;
    const selMonth = parsedValue ? parsedValue[1] - 1 : null;
    const selDay = parsedValue?.[2] ?? null;

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
        const mm = String(viewMonth + 1).padStart(2, '0');
        const dd = String(d).padStart(2, '0');
        onChange(`${viewYear}-${mm}-${dd}`);
        setIsOpen(false);
    };

    const prevMonth = () => {
        if (viewMonth === 0) { setViewYear((y) => y - 1); setViewMonth(11); }
        else setViewMonth((m) => m - 1);
    };
    const nextMonth = () => {
        if (viewMonth === 11) { setViewYear((y) => y + 1); setViewMonth(0); }
        else setViewMonth((m) => m + 1);
    };

    return (
        <div className={`dp-wrap${isOpen ? ' is-open' : ''}${disabled ? ' is-disabled' : ''}`} ref={wrapRef}>
            {label ? <span className="dp-label">{label}</span> : null}
            <button
                type="button"
                className="dp-trigger"
                onClick={() => { if (!disabled) setIsOpen((o) => !o); }}
                disabled={disabled}
            >
                <span className={`dp-trigger-value${!value ? ' is-placeholder' : ''}`}>
                    {formatDisplay(value) || placeholder}
                </span>
                <span className="dp-trigger-icon" aria-hidden="true">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="4" width="18" height="18" rx="2" />
                        <line x1="16" y1="2" x2="16" y2="6" />
                        <line x1="8" y1="2" x2="8" y2="6" />
                        <line x1="3" y1="10" x2="21" y2="10" />
                    </svg>
                </span>
            </button>

            {isOpen ? (
                <div className="dp-calendar">
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
