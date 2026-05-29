'use client';

import { createContext, useContext, useState, useCallback } from 'react';

const ToastContext = createContext(null);

// Status Icons Helpers
const getIcon = (type) => {
    switch (type) {
        case 'success':
            return (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                    <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
            );
        case 'error':
            return (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="15" y1="9" x2="9" y2="15" />
                    <line x1="9" y1="9" x2="15" y2="15" />
                </svg>
            );
        case 'warning':
            return (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                    <line x1="12" y1="9" x2="12" y2="13" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
            );
        case 'info':
        default:
            return (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="16" x2="12" y2="12" />
                    <line x1="12" y1="8" x2="12.01" y2="8" />
                </svg>
            );
    }
};

export function ToastProvider({ children, position = 'bottom-right' }) {
    const [toasts, setToasts] = useState([]);

    // Remove a toast immediately (e.g. manual click close)
    const removeToast = useCallback((id) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
    }, []);

    // Dismiss trigger (start fade-out exit animation, then delete)
    const dismissToast = useCallback((id) => {
        setToasts((prev) =>
            prev.map((t) => (t.id === id ? { ...t, exiting: true } : t))
        );
        setTimeout(() => {
            removeToast(id);
        }, 250); // matches CSS animation transition length
    }, [removeToast]);

    // Add new toast with double timer
    const showToast = useCallback((message, type = 'success', duration = 3000) => {
        const id = Date.now() + Math.random().toString(36).substr(2, 9);
        
        setToasts((prev) => [...prev, { id, message, type, exiting: false }]);

        // 1. Trigger exit animation shortly before duration ends
        const exitTimeout = setTimeout(() => {
            setToasts((prev) =>
                prev.map((t) => (t.id === id ? { ...t, exiting: true } : t))
            );
        }, Math.max(0, duration - 250));

        // 2. Remove completely once finished
        const removeTimeout = setTimeout(() => {
            setToasts((prev) => prev.filter((t) => t.id !== id));
        }, duration);

        return { id, exitTimeout, removeTimeout };
    }, []);

    const toastHelpers = {
        success: (msg, dur) => showToast(msg, 'success', dur),
        error: (msg, dur) => showToast(msg, 'error', dur),
        warning: (msg, dur) => showToast(msg, 'warning', dur),
        info: (msg, dur) => showToast(msg, 'info', dur),
    };

    return (
        <ToastContext.Provider value={toastHelpers}>
            {children}
            <div className={`toast-container toast-pos-${position}`}>
                {toasts.map((t) => (
                    <div
                        key={t.id}
                        className={`toast-item toast-${t.type}${t.exiting ? ' is-exiting' : ''}`}
                        onClick={() => dismissToast(t.id)}
                        role="alert"
                        aria-live="polite"
                    >
                        <span className="toast-icon">{getIcon(t.type)}</span>
                        <span className="toast-message">{t.message}</span>
                        <button
                            type="button"
                            className="toast-close-btn"
                            onClick={(e) => {
                                e.stopPropagation(); // prevent double clicking
                                dismissToast(t.id);
                            }}
                            title="Tutup"
                            aria-label="Close notification"
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="18" y1="6" x2="6" y2="18" />
                                <line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                        </button>
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    );
}

export const useToast = () => {
    const context = useContext(ToastContext);
    if (!context) {
        throw new Error('useToast must be used within a ToastProvider');
    }
    return context;
};
