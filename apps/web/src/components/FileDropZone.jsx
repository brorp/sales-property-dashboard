'use client';

import { useRef, useState } from 'react';
import './FileDropZone.css';

function formatFileSize(bytes) {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function FileDropZone({
    accept,
    fileName = '',
    fileSize = 0,
    onChange,
    onClear,
    label = 'Klik atau drag file ke sini',
    hint,
    loading = false,
    disabled = false,
}) {
    const inputRef = useRef(null);
    const [dragging, setDragging] = useState(false);

    const handleFiles = (files) => {
        const file = files?.[0];
        if (!file) return;
        onChange?.(file);
    };

    const handleDragOver = (e) => {
        e.preventDefault();
        if (!disabled) setDragging(true);
    };
    const handleDragLeave = (e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false);
    };
    const handleDrop = (e) => {
        e.preventDefault();
        setDragging(false);
        if (!disabled) handleFiles(e.dataTransfer.files);
    };

    if (fileName) {
        return (
            <div className="fdz-selected">
                <div className="fdz-selected-icon">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                    </svg>
                </div>
                <div className="fdz-selected-info">
                    <span className="fdz-selected-name">{fileName}</span>
                    {fileSize ? <span className="fdz-selected-size">{formatFileSize(fileSize)}</span> : null}
                </div>
                <button
                    type="button"
                    className="fdz-clear"
                    onClick={onClear}
                    disabled={disabled || loading}
                    title="Hapus file"
                >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                </button>
            </div>
        );
    }

    return (
        <div
            className={`fdz-zone${dragging ? ' is-dragging' : ''}${disabled ? ' is-disabled' : ''}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => !disabled && !loading && inputRef.current?.click()}
            role="button"
            tabIndex={disabled ? -1 : 0}
            onKeyDown={(e) => e.key === 'Enter' && !disabled && inputRef.current?.click()}
        >
            <input
                ref={inputRef}
                type="file"
                accept={accept}
                style={{ display: 'none' }}
                onChange={(e) => handleFiles(e.target.files)}
                disabled={disabled}
            />
            <div className="fdz-icon">
                {loading ? (
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="fdz-spin">
                        <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" />
                    </svg>
                ) : (
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="17 8 12 3 7 8" />
                        <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                )}
            </div>
            <span className="fdz-label">{loading ? 'Memproses...' : label}</span>
            {hint && !loading ? <span className="fdz-hint">{hint}</span> : null}
            {!loading ? <span className="fdz-hint fdz-hint--drag">atau drag & drop di sini</span> : null}
        </div>
    );
}
