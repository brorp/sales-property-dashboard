'use client';

import { useEffect, useRef, useState } from 'react';
import './Select.css';

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
 *   value: string | string[];
 *   onChange: (value: any) => void;
 *   placeholder?: string;
 *   className?: string;
 *   disabled?: boolean;
 *   clearable?: boolean;
 *   variant?: string;
 *   searchable?: boolean;
 *   multiple?: boolean;
 * }} props
 */
export default function Select({
    options,
    value,
    onChange,
    placeholder = 'Pilih...',
    className = '',
    disabled = false,
    clearable = true,
    variant = 'default',
    searchable = false,
    multiple = false,
    maxDisplayed,
    allowEmpty = true,
}) {
    const [open, setOpen] = useState(false);
    const [dropdownStyle, setDropdownStyle] = useState({});
    const [searchQuery, setSearchQuery] = useState('');
    const [isMobile, setIsMobile] = useState(false);
    const wrapRef = useRef(null);
    const searchRef = useRef(null);

    useEffect(() => {
        const handleResize = () => {
            setIsMobile(window.innerWidth < 640);
        };
        handleResize();
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Normalize value for single vs multiple select
    const selectedValues = multiple ? (Array.isArray(value) ? value : []) : (value ? [value] : []);
    const isSelected = (val) => selectedValues.includes(val);

    // Build the trigger label
    let triggerLabel = placeholder;
    if (multiple) {
        if (selectedValues.length > 0) {
            const selectedLabels = options
                .filter((opt) => selectedValues.includes(opt.value))
                .map((opt) => opt.label);
            
            const effectiveMax = isMobile ? 1 : maxDisplayed;
            if (effectiveMax && selectedLabels.length > effectiveMax) {
                const visibleLabels = selectedLabels.slice(0, effectiveMax);
                triggerLabel = `${visibleLabels.join(', ')}, ++`;
            } else {
                triggerLabel = selectedLabels.join(', ');
            }
        }
    } else {
        const selectedOpt = options.find((opt) => opt.value === value);
        if (selectedOpt) {
            triggerLabel = selectedOpt.label;
        }
    }

    let filteredOptions = searchable && searchQuery.trim()
        ? options.filter((opt) => opt.isGroupHeader || opt.label.toLowerCase().includes(searchQuery.toLowerCase()))
        : options;

    if (searchable && searchQuery.trim()) {
        const finalOptions = [];
        for (let i = 0; i < filteredOptions.length; i++) {
            const opt = filteredOptions[i];
            if (opt.isGroupHeader) {
                let hasActiveOption = false;
                for (let j = i + 1; j < filteredOptions.length; j++) {
                    if (filteredOptions[j].isGroupHeader) break;
                    hasActiveOption = true;
                }
                if (hasActiveOption) {
                    finalOptions.push(opt);
                }
            } else {
                finalOptions.push(opt);
            }
        }
        filteredOptions = finalOptions;
    }

    useEffect(() => {
        if (!open) return;

        const handleClick = (e) => {
            if (wrapRef.current && !wrapRef.current.contains(e.target)) {
                setOpen(false);
            }
        };

        const handleScroll = (e) => {
            if (wrapRef.current && wrapRef.current.contains(e.target)) return;
            if (window.innerWidth < 768) return;
            setOpen(false);
        };

        document.addEventListener('mousedown', handleClick);
        window.addEventListener('scroll', handleScroll, true);
        return () => {
            document.removeEventListener('mousedown', handleClick);
            window.removeEventListener('scroll', handleScroll, true);
        };
    }, [open]);

    const handleToggle = () => {
        if (disabled) return;
        if (!open) {
            setSearchQuery('');
            const rect = wrapRef.current?.getBoundingClientRect();
            if (rect) {
                const MARGIN = 8;
                const MAX_HEIGHT = 300;
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
                    zIndex: 1000,
                });
            }
            setTimeout(() => searchRef.current?.focus(), 50);
        }
        setOpen((prev) => !prev);
    };

    const handleSelect = (optValue) => {
        if (multiple) {
            const isAlreadySelected = isSelected(optValue);
            const nextValues = isAlreadySelected
                ? selectedValues.filter((v) => v !== optValue)
                : [...selectedValues, optValue];
            if (!allowEmpty && nextValues.length === 0) {
                return;
            }
            onChange(nextValues);
        } else {
            if (!allowEmpty && value === optValue) {
                return;
            }
            onChange(optValue);
            setOpen(false);
        }
    };

    const handleClear = (e) => {
        e.stopPropagation();
        if (!allowEmpty && options.length > 0) {
            const firstValOpt = options.find((opt) => !opt.isGroupHeader);
            onChange(multiple ? (firstValOpt ? [firstValOpt.value] : []) : (firstValOpt ? firstValOpt.value : ''));
        } else {
            onChange(multiple ? [] : '');
        }
        setOpen(false);
    };

    const hasValue = multiple ? selectedValues.length > 0 : Boolean(value);

    const wrapClass = [
        'sf-wrap',
        variant === 'white' ? 'sf-wrap--white' : '',
        hasValue ? 'is-active' : '',
        open ? 'is-open' : '',
        disabled ? 'is-disabled' : '',
        className,
    ].filter(Boolean).join(' ');

    return (
        <div className={wrapClass} ref={wrapRef}>
            <button
                type="button"
                className="sf-trigger"
                onClick={handleToggle}
                disabled={disabled}
                aria-haspopup="listbox"
                aria-expanded={open}
            >
                <span className="sf-label">{triggerLabel}</span>
                <span className="sf-icons">
                    {hasValue && clearable ? (
                        <button type="button" className="sf-clear" onClick={handleClear} aria-label="Hapus filter">
                            <ClearIcon />
                        </button>
                    ) : null}
                    <span className="sf-chevron"><ChevronIcon /></span>
                </span>
            </button>

            {open ? (
                <div className="sf-dropdown" style={dropdownStyle} role="listbox">
                    {searchable && (
                        <div className="sf-search-wrap">
                            <input
                                ref={searchRef}
                                type="text"
                                className="sf-search"
                                placeholder="Cari..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                onClick={(e) => e.stopPropagation()}
                            />
                        </div>
                    )}
                    <div className="sf-options-list">
                        {filteredOptions.length > 0 ? (() => {
                            const hasGroups = options.some((o) => o.isGroupHeader);
                            return filteredOptions.map((opt, index) => {
                                if (opt.isGroupHeader) {
                                    return (
                                        <div key={`group-${index}`} className="sf-group-header">
                                            {opt.label}
                                        </div>
                                    );
                                }
                                return (
                                    <button
                                        key={opt.value}
                                        type="button"
                                        role="option"
                                        aria-selected={isSelected(opt.value)}
                                        className={`sf-option${isSelected(opt.value) ? ' is-selected' : ''}${hasGroups ? ' is-indented' : ''}`}
                                        onClick={() => handleSelect(opt.value)}
                                    >
                                        <span className="sf-option-label">{opt.label}</span>
                                        {isSelected(opt.value) ? (
                                            <span className="sf-option-check"><CheckIcon /></span>
                                        ) : null}
                                    </button>
                                );
                            });
                        })() : (
                            <div className="sf-no-result">Tidak ditemukan</div>
                        )}
                    </div>
                </div>
            ) : null}
        </div>
    );
}
