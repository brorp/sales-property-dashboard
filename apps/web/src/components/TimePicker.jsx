'use client';

import { useEffect, useRef, useState } from 'react';
import './TimePicker.css';

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));

export default function TimePicker({
    value,
    onChange,
    placeholder = 'Pilih jam',
    disabled = false,
    label,
}) {
    const [isOpen, setIsOpen] = useState(false);
    const wrapRef = useRef(null);
    const hourListRef = useRef(null);
    const minListRef = useRef(null);

    const parts = value ? value.split(':') : [];
    const selHour = parts[0] || '09';
    const selMin = parts[1]?.slice(0, 2) || '00';

    useEffect(() => {
        if (!isOpen) return;
        const handleOutside = (e) => {
            if (wrapRef.current && !wrapRef.current.contains(e.target)) setIsOpen(false);
        };
        document.addEventListener('mousedown', handleOutside);
        return () => document.removeEventListener('mousedown', handleOutside);
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) return;
        const t = setTimeout(() => {
            hourListRef.current?.querySelector('.tp-item--selected')?.scrollIntoView({ block: 'center' });
            minListRef.current?.querySelector('.tp-item--selected')?.scrollIntoView({ block: 'center' });
        }, 30);
        return () => clearTimeout(t);
    }, [isOpen]);

    const pick = (h, m) => { onChange(`${h}:${m}`); setIsOpen(false); };

    return (
        <div className={`tp-wrap${isOpen ? ' is-open' : ''}${disabled ? ' is-disabled' : ''}`} ref={wrapRef}>
            {label ? <span className="tp-label">{label}</span> : null}
            <button
                type="button"
                className="tp-trigger"
                onClick={() => { if (!disabled) setIsOpen((o) => !o); }}
                disabled={disabled}
            >
                <span className={`tp-value${!value ? ' is-placeholder' : ''}`}>
                    {value || placeholder}
                </span>
                <span className="tp-icon" aria-hidden="true">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="12 6 12 12 16 14" />
                    </svg>
                </span>
            </button>

            {isOpen ? (
                <div className="tp-dropdown" role="listbox">
                    <div className="tp-columns">
                        <div className="tp-col-header">Jam</div>
                        <div className="tp-col-header" />
                        <div className="tp-col-header">Menit</div>
                    </div>
                    <div className="tp-columns tp-columns--body">
                        <div className="tp-col" ref={hourListRef}>
                            {HOURS.map((h) => (
                                <button
                                    key={h}
                                    type="button"
                                    className={`tp-item${h === selHour ? ' tp-item--selected' : ''}`}
                                    onClick={() => pick(h, selMin)}
                                >
                                    {h}
                                </button>
                            ))}
                        </div>
                        <div className="tp-sep">:</div>
                        <div className="tp-col" ref={minListRef}>
                            {MINUTES.map((m) => (
                                <button
                                    key={m}
                                    type="button"
                                    className={`tp-item${m === selMin ? ' tp-item--selected' : ''}`}
                                    onClick={() => pick(selHour, m)}
                                >
                                    {m}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
