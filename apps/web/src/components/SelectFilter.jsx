'use client';

import { useEffect, useRef, useState } from 'react';
import './SelectFilter.css';

function ChevronIcon() {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9" />
        </svg>
    );
}

function CheckIcon() {
    return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
        </svg>
    );
}

function ClearIcon() {
    return (
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
        </svg>
    );
}

/**
 * @param {{
 *   options: { value: string; label: string }[];
 *   value: string;
 *   onChange: (value: string) => void;
 *   placeholder?: string;
 *   className?: string;
 * }} props
 */
export default function SelectFilter({ options, value, onChange, placeholder = 'Pilih...', className = '' }) {
    const [open, setOpen] = useState(false);
    const [dropdownStyle, setDropdownStyle] = useState({});
    const wrapRef = useRef(null);

    const selected = options.find((opt) => opt.value === value) || null;

    useEffect(() => {
        if (!open) return;

        const handleClick = (e) => {
            if (wrapRef.current && !wrapRef.current.contains(e.target)) {
                setOpen(false);
            }
        };

        const handleScroll = () => setOpen(false);

        document.addEventListener('mousedown', handleClick);
        window.addEventListener('scroll', handleScroll, true);
        return () => {
            document.removeEventListener('mousedown', handleClick);
            window.removeEventListener('scroll', handleScroll, true);
        };
    }, [open]);

    const handleToggle = () => {
        if (!open) {
            const rect = wrapRef.current?.getBoundingClientRect();
            if (rect) {
                const MARGIN = 8;
                const MAX_HEIGHT = 240;
                const left = Math.min(rect.left, window.innerWidth - rect.width - MARGIN);
                const spaceBelow = window.innerHeight - rect.bottom - MARGIN;
                const spaceAbove = rect.top - MARGIN;
                const openUpward = spaceBelow < MAX_HEIGHT && spaceAbove > spaceBelow;
                const availableSpace = openUpward ? spaceAbove : spaceBelow;

                setDropdownStyle({
                    position: 'fixed',
                    ...(openUpward
                        ? { bottom: window.innerHeight - rect.top + 6 }
                        : { top: rect.bottom + 6 }),
                    left: Math.max(MARGIN, left),
                    minWidth: rect.width,
                    maxHeight: Math.min(MAX_HEIGHT, availableSpace),
                    overflowY: 'auto',
                    zIndex: 1000,
                });
            }
        }
        setOpen((prev) => !prev);
    };

    const handleSelect = (optValue) => {
        onChange(optValue);
        setOpen(false);
    };

    const handleClear = (e) => {
        e.stopPropagation();
        onChange('');
        setOpen(false);
    };

    const wrapClass = [
        'sf-wrap',
        selected ? 'is-active' : '',
        open ? 'is-open' : '',
        className,
    ].filter(Boolean).join(' ');

    return (
        <div className={wrapClass} ref={wrapRef}>
            <button
                type="button"
                className="sf-trigger"
                onClick={handleToggle}
                aria-haspopup="listbox"
                aria-expanded={open}
            >
                <span className="sf-label">{selected ? selected.label : placeholder}</span>
                <span className="sf-icons">
                    {selected ? (
                        <button type="button" className="sf-clear" onClick={handleClear} aria-label="Hapus filter">
                            <ClearIcon />
                        </button>
                    ) : null}
                    <span className="sf-chevron"><ChevronIcon /></span>
                </span>
            </button>

            {open ? (
                <div className="sf-dropdown" style={dropdownStyle} role="listbox">
                    {options.map((opt) => (
                        <button
                            key={opt.value}
                            type="button"
                            role="option"
                            aria-selected={opt.value === value}
                            className={`sf-option${opt.value === value ? ' is-selected' : ''}`}
                            onClick={() => handleSelect(opt.value)}
                        >
                            <span className="sf-option-label">{opt.label}</span>
                            {opt.value === value ? (
                                <span className="sf-option-check"><CheckIcon /></span>
                            ) : null}
                        </button>
                    ))}
                </div>
            ) : null}
        </div>
    );
}
