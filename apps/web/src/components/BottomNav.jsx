'use client';

import { useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '../context/AuthContext';
import { useWorkspace } from '../context/WorkspaceContext';
import { useNavData } from '../hooks/useNavData';
import { useTheme } from '../context/ThemeContext';
import './BottomNav.css';

const ADMIN_TABS = [
    { key: '/overview', icon: 'overview', label: 'Ringkasan' },
    { key: '/', icon: 'analytics', label: 'Analitik' },
    { key: '/leads', icon: 'leads', label: 'Leads' },
    { key: '/team', icon: 'team', label: 'Tim' },
    { key: '/appointments', icon: 'appointment', label: 'Janji Temu' },
    { key: '/settings', icon: 'settings', label: 'Pengaturan' },
];

const SUPERVISOR_TABS = [
    { key: '/supervisor-tasks', icon: 'tasks', label: 'Tugas' },
    { key: '/', icon: 'analytics', label: 'Analitik' },
    { key: '/team', icon: 'team', label: 'Tim' },
    { key: '/leads', icon: 'leads', label: 'Leads' },
    { key: '/settings', icon: 'settings', label: 'Pengaturan' },
];

const SALES_TABS = [
    { key: '/daily-tasks', icon: 'tasks', label: 'Tugas' },
    { key: '/leads', icon: 'leads', label: 'Leads' },
    { key: '/settings', icon: 'settings', label: 'Pengaturan' },
];

function Icon({ name }) {
    const c = { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.75, strokeLinecap: 'round', strokeLinejoin: 'round' };
    if (name === 'overview') return <svg {...c}><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>;
    if (name === 'analytics') return <svg {...c}><path d="M3 3v18h18" /><path d="M7 16l4-5 4 4 4-6" /></svg>;
    if (name === 'leads') return <svg {...c}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>;
    if (name === 'team') return <svg {...c}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>;
    if (name === 'appointment') return <svg {...c}><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01" /></svg>;
    if (name === 'tasks') return <svg {...c}><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>;
    if (name === 'settings') return <svg {...c}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>;
    return <svg {...c}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>;
}

export default function BottomNav() {
    const { user } = useAuth();
    const { theme } = useTheme();
    const { activeWorkspace, workspaces, switchWorkspace } = useWorkspace();
    const { hasUnreadLeads, hasUnreadLogs, taskCounts, supervisorTaskCount } = useNavData();
    const curveFill   = theme === 'dark' ? '#1E293B' : '#FFFFFF';
    const curveStroke = theme === 'dark' ? 'rgba(255,255,255,0.08)' : '#E5E7EB';
    const [wsSheetOpen, setWsSheetOpen] = useState(false);
    const pathname = usePathname();
    const router = useRouter();

    const tabs = useMemo(() => {
        return user?.role === 'sales' ? SALES_TABS
            : user?.role === 'supervisor' ? SUPERVISOR_TABS
                : ADMIN_TABS;
    }, [user?.role]);

    const isActive = (key) => key === '/' ? pathname === '/' : pathname.startsWith(key);

    const activeIndex = useMemo(() => {
        return tabs.findIndex((tab) => isActive(tab.key));
    }, [tabs, pathname]);

    if (!user || pathname === '/login') return null;

    return (
        <>
            {wsSheetOpen ? (
                <>
                    <div className="ws-sheet-backdrop" onClick={() => setWsSheetOpen(false)} />
                    <div className="ws-sheet">
                        <div className="ws-sheet-handle" />
                        <div className="ws-sheet-title">Pilih Workspace</div>
                        {workspaces.map((ws) => (
                            <button
                                key={ws.slug}
                                type="button"
                                className={`ws-sheet-item${activeWorkspace?.slug === ws.slug ? ' active' : ''}`}
                                onClick={() => { switchWorkspace(ws.slug); setWsSheetOpen(false); }}
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

            <nav className="bottom-nav">
                <div className="bottom-nav-inner">
                    <div
                        className="bottom-nav-curve"
                        style={{
                            left: `calc(${(activeIndex + 0.5) * (100 / tabs.length)}% - 80px)`,
                            opacity: activeIndex === -1 ? 0 : 1,
                        }}
                    >
                        <svg viewBox="0 0 160 32" preserveAspectRatio="none" width="160" height="32">
                            <path d="M0,32 L0,20 L30,20 C55,20 60,0 80,0 C100,0 105,20 130,20 L160,20 L160,32 Z" fill={curveFill} />
                            <path d="M0,20 L30,20 C55,20 60,0 80,0 C100,0 105,20 130,20 L160,20" fill="none" stroke={curveStroke} strokeWidth="1" />
                        </svg>
                    </div>
                    {tabs.map((tab) => (
                        <button
                            key={tab.key}
                            className={`bottom-nav-tab${isActive(tab.key) ? ' active' : ''}`}
                            onClick={() => router.push(tab.key)}
                        >
                            <span className="bottom-nav-icon">
                                <Icon name={tab.icon} />
                                {tab.key === '/leads' && hasUnreadLeads && !isActive(tab.key) ? <span className="bottom-nav-unread-dot" /> : null}
                                {tab.key === '/daily-tasks' && taskCounts.totalCount > 0 ? (
                                    <span className="bottom-nav-count-badge">{taskCounts.totalCount}</span>
                                ) : null}
                                {tab.key === '/supervisor-tasks' && supervisorTaskCount > 0 ? (
                                    <span className="bottom-nav-count-badge" style={{ background: '#ef4444' }}>{supervisorTaskCount}</span>
                                ) : null}
                            </span>
                            <span className="bottom-nav-label">{tab.label}</span>
                            {isActive(tab.key) && <span className="bottom-nav-indicator" />}
                        </button>
                    ))}
                </div>
            </nav>
        </>
    );
}
