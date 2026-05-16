'use client';

import { useRef } from 'react';

function formatDisplayValue(type, value, placeholder) {
    if (!value) {
        return placeholder;
    }

    if (type === 'time') {
        return value;
    }

    const parsed = new Date(`${value}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) {
        return placeholder;
    }

    return new Intl.DateTimeFormat('id-ID', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
    }).format(parsed);
}

export default function PickerTriggerField({
    label,
    type = 'date',
    value,
    onChange,
    placeholder,
    disabled = false,
    required = false,
    min,
    max,
}) {
    const inputRef = useRef(null);
    const nextPlaceholder =
        placeholder || (type === 'time' ? 'Pilih jam' : 'Pilih tanggal');
    const displayValue = formatDisplayValue(type, value, nextPlaceholder);
    const openNativePicker = () => {
        if (disabled) {
            return;
        }

        const input = inputRef.current;
        if (!input) {
            return;
        }

        input.focus();
        if (typeof input.showPicker === 'function') {
            try {
                input.showPicker();
            } catch {
                // Some browsers only allow showPicker during direct user activation.
            }
        }
    };

    return (
        <label
            className={`picker-trigger-field ${disabled ? 'is-disabled' : ''}`}
            onClick={openNativePicker}
        >
            {label ? <span className="picker-trigger-caption">{label}</span> : null}
            <div className="picker-trigger-button">
                <span className={`picker-trigger-value ${value ? '' : 'is-placeholder'}`}>
                    {displayValue}
                </span>
                <span className="picker-trigger-icon" aria-hidden="true">
                    {type === 'time' ? (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                        </svg>
                    ) : (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
                        </svg>
                    )}
                </span>
            </div>
            <input
                ref={inputRef}
                type={type}
                className="picker-trigger-native"
                value={value || ''}
                onChange={onChange}
                onClick={openNativePicker}
                disabled={disabled}
                required={required}
                min={min}
                max={max}
            />
        </label>
    );
}
