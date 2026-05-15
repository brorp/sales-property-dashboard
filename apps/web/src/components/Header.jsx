'use client';

import { useRouter } from 'next/navigation';
import WorkspaceSwitcher from './WorkspaceSwitcher';

export default function Header({ title, subtitle = null, showBack = false, rightAction = null }) {
    const router = useRouter();

    return (
        <header className="app-header">
            <div className="app-header-left">
                {showBack && (
                    <button className="app-header-back" onClick={() => router.back()} aria-label="Kembali">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="15 18 9 12 15 6" />
                        </svg>
                    </button>
                )}
                <div className="app-header-title-wrap">
                    <h1 className="app-header-title">{title}</h1>
                    {subtitle ? <span className="app-header-subtitle">{subtitle}</span> : null}
                </div>
            </div>
            <div className="app-header-right">
                {rightAction ? <div className="app-header-action">{rightAction}</div> : null}
            </div>
        </header>
    );
}
