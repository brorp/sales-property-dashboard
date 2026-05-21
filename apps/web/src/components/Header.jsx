'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useWorkspace } from '../context/WorkspaceContext';

export default function Header({ title, subtitle = null, showBack = false, rightAction = null, showWorkspaceMobile = false, hasTabs = false }) {
    const router = useRouter();
    const { workspaces, activeWorkspace, switchWorkspace } = useWorkspace();
    const [wsOpen, setWsOpen] = useState(false);

    const hasMultiWs = workspaces?.length > 1;

    return (
        <>
            <header className={`app-header${hasTabs ? ' app-header--has-tabs' : ''}`}>
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
                    {showWorkspaceMobile && hasMultiWs ? (
                        <button type="button" className="app-header-ws-btn" onClick={() => setWsOpen(true)}>
                            <span className="app-header-ws-name">{activeWorkspace?.name || 'Workspace'}</span>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="6 9 12 15 18 9" />
                            </svg>
                        </button>
                    ) : null}
                    {rightAction ? <div className="app-header-action">{rightAction}</div> : null}
                </div>
            </header>

            {showWorkspaceMobile && wsOpen ? (
                <>
                    <div className="ws-sheet-backdrop" onClick={() => setWsOpen(false)} />
                    <div className="ws-sheet">
                        <div className="ws-sheet-handle" />
                        <div className="ws-sheet-title">Pilih Workspace</div>
                        {workspaces.map((ws) => (
                            <button
                                key={ws.slug}
                                type="button"
                                className={`ws-sheet-item${activeWorkspace?.slug === ws.slug ? ' active' : ''}`}
                                onClick={() => { switchWorkspace(ws.slug); setWsOpen(false); }}
                            >
                                <span>{ws.name}</span>
                                {activeWorkspace?.slug === ws.slug ? (
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                        <polyline points="20 6 9 17 4 12" />
                                    </svg>
                                ) : null}
                            </button>
                        ))}
                    </div>
                </>
            ) : null}
        </>
    );
}
