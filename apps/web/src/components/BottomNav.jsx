'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '../context/AuthContext';
import { useTenant } from '../context/TenantContext';
import { apiRequest } from '../lib/api';
import {
    getSeenLeadsAt,
    getSeenLogsAt,
    hasUnreadSince,
    markLeadsSeenAt,
    markLogsSeenAt,
} from '../lib/notification-seen';
import { usePagePolling } from '../hooks/usePagePolling';
import WorkspaceSwitcher from './WorkspaceSwitcher';
import { useWorkspace } from '../context/WorkspaceContext';

function Icon({ name }) {
    const c = { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.75, strokeLinecap: 'round', strokeLinejoin: 'round' };
    if (name === 'analytics') return (
        <svg {...c}>
            <path d="M3 3v18h18"/>
            <path d="M7 16l4-5 4 4 4-6"/>
        </svg>
    );
    if (name === 'leads') return (
        <svg {...c}>
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
            <circle cx="9" cy="7" r="4"/>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
        </svg>
    );
    if (name === 'team') return (
        <svg {...c}>
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
            <circle cx="9" cy="7" r="4"/>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
        </svg>
    );
    if (name === 'appointment') return (
        <svg {...c}>
            <rect x="3" y="4" width="18" height="18" rx="2"/>
            <path d="M16 2v4M8 2v4M3 10h18"/>
            <path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/>
        </svg>
    );
    if (name === 'logs') return (
        <svg {...c}>
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <path d="M14 2v6h6"/>
            <path d="M16 13H8M16 17H8M10 9H8"/>
        </svg>
    );
    if (name === 'tasks') return (
        <svg {...c}>
            <path d="M9 11l3 3L22 4"/>
            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
        </svg>
    );
    if (name === 'warning') return (
        <svg {...c}>
            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
    );
    if (name === 'settings') return (
        <svg {...c}>
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
        </svg>
    );
    if (name === 'logout') return (
        <svg {...c}>
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
            <polyline points="16 17 21 12 16 7"/>
            <line x1="21" y1="12" x2="9" y2="12"/>
        </svg>
    );
    return (
        <svg {...c}>
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
            <circle cx="12" cy="7" r="4"/>
        </svg>
    );
}

const ADMIN_TABS = [
    { key: '/', icon: 'analytics', label: 'Analytics' },
    { key: '/leads', icon: 'leads', label: 'Leads' },
    { key: '/appointments', icon: 'appointment', label: 'Appt' },
    { key: '/activity-logs', icon: 'logs', label: 'Logs' },
    { key: '/penalties', icon: 'warning', label: 'Penalty' },
    { key: '/team', icon: 'team', label: 'Teams' },
    { key: '/settings', icon: 'settings', label: 'Settings' },
];

const SUPERVISOR_TABS = [
    { key: '/supervisor-tasks', icon: 'tasks', label: 'Tasks' },
    { key: '/leads', icon: 'leads', label: 'Leads' },
    { key: '/', icon: 'analytics', label: 'Analytics' },
    { key: '/team', icon: 'team', label: 'Team' },
    { key: '/penalties', icon: 'warning', label: 'Penalty' },
    { key: '/settings', icon: 'settings', label: 'Settings' },
];

const SALES_TABS = [
    { key: '/daily-tasks', icon: 'tasks', label: 'Tasks' },
    { key: '/leads', icon: 'leads', label: 'Leads' },
    { key: '/appointments', icon: 'appointment', label: 'Appt' },
    { key: '/', icon: 'analytics', label: 'Analytics' },
    { key: '/penalties', icon: 'warning', label: 'Penalty' },
    { key: '/settings', icon: 'settings', label: 'Settings' },
];

function formatClientNameFromSlug(slug) {
    if (!slug) {
        return '';
    }

    return String(slug)
        .split(/[-_]/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
}

function ChevronLeftIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"/>
        </svg>
    );
}

function ChevronRightIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6"/>
        </svg>
    );
}

function SidebarOpenIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2"/>
            <line x1="9" y1="3" x2="9" y2="21"/>
            <line x1="3" y1="7" x2="9" y2="7"/>
            <line x1="3" y1="11" x2="9" y2="11"/>
            <line x1="3" y1="15" x2="9" y2="15"/>
        </svg>
    );
}

function SidebarCloseIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2"/>
            <line x1="15" y1="3" x2="15" y2="21"/>
            <line x1="15" y1="7" x2="21" y2="7"/>
            <line x1="15" y1="11" x2="21" y2="11"/>
            <line x1="15" y1="15" x2="21" y2="15"/>
        </svg>
    );
}

function WorkspacesIcon() {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="7" height="7"/>
            <rect x="14" y="3" width="7" height="7"/>
            <rect x="14" y="14" width="7" height="7"/>
            <rect x="3" y="14" width="7" height="7"/>
        </svg>
    );
}

function getInitials(text) {
    if (!text) return '';
    return text
        .split(' ')
        .map(word => word.charAt(0).toUpperCase())
        .join('')
        .slice(0, 2);
}

export default function BottomNav() {
    const { user, isAdmin, logout } = useAuth();
    const tenant = useTenant();
    const { activeWorkspace } = useWorkspace();
    const pathname = usePathname();
    const router = useRouter();
    const [summary, setSummary] = useState({ latestLeadAt: null, latestLogAt: null });
    const [seenState, setSeenState] = useState({ leads: null, logs: null });
    const [taskCounts, setTaskCounts] = useState({ totalCount: 0, newLeadCount: 0, followUpCount: 0 });
    const [supervisorTaskCount, setSupervisorTaskCount] = useState(0);
    const [collapsed, setCollapsed] = useState(() => {
        if (typeof window === 'undefined') return false;
        // Mobile: always start expanded (false)
        if (window.innerWidth < 1024) return false;
        // Desktop: load from localStorage
        return localStorage.getItem('sidebar-collapsed') === '1';
    });

    const loadNotificationSummary = useCallback(async () => {
        if (!user) {
            return;
        }

        const data = await apiRequest('/api/notifications/summary', { user });
        setSummary({
            latestLeadAt: data?.latestLeadAt || null,
            latestLogAt: data?.latestLogAt || null,
        });
    }, [user]);

    const loadDailyTaskCounts = useCallback(async () => {
        if (!user || user.role !== 'sales') {
            setTaskCounts({ totalCount: 0, newLeadCount: 0, followUpCount: 0 });
            return;
        }

        const data = await apiRequest('/api/daily-tasks/counts', { user });
        setTaskCounts({
            totalCount: Number(data?.totalCount || 0),
            newLeadCount: Number(data?.newLeadCount || 0),
            followUpCount: Number(data?.followUpCount || 0),
        });
    }, [user]);

    const loadSupervisorTaskCount = useCallback(async () => {
        if (!user || user.role !== 'supervisor') return;
        try {
            const data = await apiRequest('/api/supervisor-tasks', { user });
            setSupervisorTaskCount(Array.isArray(data) ? data.length : 0);
        } catch {
            // non-critical, ignore
        }
    }, [user]);

    const toggleCollapsed = () => {
        setCollapsed((prev) => {
            const next = !prev;
            localStorage.setItem('sidebar-collapsed', next ? '1' : '0');
            if (next) {
                document.body.classList.add('sidebar-collapsed');
            } else {
                document.body.classList.remove('sidebar-collapsed');
            }
            return next;
        });
    };

    useEffect(() => {
        if (!user) {
            return;
        }

        setSeenState({
            leads: getSeenLeadsAt(),
            logs: getSeenLogsAt(),
        });
        void loadNotificationSummary();
        void loadDailyTaskCounts();
        void loadSupervisorTaskCount();
    }, [loadDailyTaskCounts, loadNotificationSummary, loadSupervisorTaskCount, user]);

    useEffect(() => {
        if (collapsed) {
            document.body.classList.add('sidebar-collapsed');
        } else {
            document.body.classList.remove('sidebar-collapsed');
        }
        return () => document.body.classList.remove('sidebar-collapsed');
    }, [collapsed]);

    usePagePolling({
        enabled: Boolean(user),
        intervalMs: 3000,
        run: async () => {
            await loadNotificationSummary();
            await loadDailyTaskCounts();
            await loadSupervisorTaskCount();
        },
    });

    useEffect(() => {
        if (pathname.startsWith('/leads')) {
            const nextValue = summary.latestLeadAt || new Date().toISOString();
            markLeadsSeenAt(nextValue);
            setSeenState((prev) => ({ ...prev, leads: nextValue }));
        }

        if (pathname.startsWith('/activity-logs')) {
            const nextValue = summary.latestLogAt || new Date().toISOString();
            markLogsSeenAt(nextValue);
            setSeenState((prev) => ({ ...prev, logs: nextValue }));
        }
    }, [pathname, summary.latestLeadAt, summary.latestLogAt]);

    if (!user || pathname === '/login') return null;

    const tabs =
        user?.role === 'sales'
            ? SALES_TABS
            : user?.role === 'supervisor'
                ? SUPERVISOR_TABS
                : ADMIN_TABS;
    const isActive = (key) => key === '/' ? pathname === '/' : pathname.startsWith(key);
    
    const clientName = activeWorkspace?.name || tenant.tenant?.name || formatClientNameFromSlug(user?.clientSlug);
    const isTenantWorkspace = user?.role !== 'root_admin' && Boolean(clientName);
    const brandTitle =
        isTenantWorkspace
            ? `${clientName} CMS Dashboard`
            : 'Property Lounge';
    const brandSubtitle =
        isTenantWorkspace
            ? ''
            : 'CRM Dashboard';
    const handleLogout = () => {
        logout();
        router.replace('/login');
    };
    const hasUnreadLeads = hasUnreadSince(summary.latestLeadAt, seenState.leads);
    const hasUnreadLogs = hasUnreadSince(summary.latestLogAt, seenState.logs);

    const isWR = clientName?.toLowerCase().includes('residence');
    const isWV = clientName?.toLowerCase().includes('village');
    
    const logoUrl = isWR 
        ? 'https://ik.imagekit.io/plcrm/property-lounge/asset/logo-wr.png'
        : isWV 
            ? 'https://ik.imagekit.io/plcrm/property-lounge/asset/logo-wv.png'
            : null;

    return (
        <nav className={`bottom-nav${collapsed ? ' is-collapsed' : ''}`}>
            <div className="bottom-nav-brand">
                {!collapsed ? (
                    <>
                        {logoUrl ? (
                            <img src={logoUrl} alt={clientName} style={{ height: '64px', width: '100%', objectFit: 'contain', objectPosition: 'left' }} />
                        ) : (
                            <div className="bottom-nav-brand-title">{brandTitle}</div>
                        )}
                        {brandSubtitle && !logoUrl ? <div className="bottom-nav-brand-subtitle">{brandSubtitle}</div> : null}
                        <WorkspaceSwitcher variant="desktop" />
                    </>
                ) : (
                    <>
                        <div className="bottom-nav-initials" title={brandTitle}>
                            {getInitials(brandTitle)}
                        </div>
                        <div style={{ width: '100%', height: '1px', background: '#F1F5F9', margin: '4px 0' }} />
                        <WorkspaceSwitcher variant="collapsed" />
                    </>
                )}
            </div>

            <div className="bottom-nav-inner">
                {tabs.map(tab => (
                    <button
                        key={tab.key}
                        className={`bottom-nav-tab ${isActive(tab.key) ? 'active' : ''}`}
                        onClick={() => router.push(tab.key)}
                    >
                        <span className="bottom-nav-icon"><Icon name={tab.icon} /></span>
                        <span className="bottom-nav-label">{tab.label}</span>
                        {tab.key === '/leads' && hasUnreadLeads && !isActive(tab.key) ? <span className="bottom-nav-unread-dot" /> : null}
                        {tab.key === '/activity-logs' && hasUnreadLogs && !isActive(tab.key) ? <span className="bottom-nav-unread-dot" /> : null}
                        {tab.key === '/daily-tasks' && taskCounts.totalCount > 0 ? (
                            <span className="bottom-nav-count-badge">{taskCounts.totalCount}</span>
                        ) : null}
                        {tab.key === '/supervisor-tasks' && supervisorTaskCount > 0 ? (
                            <span className="bottom-nav-count-badge" style={{ background: '#ef4444' }}>{supervisorTaskCount}</span>
                        ) : null}
                        {isActive(tab.key) && <span className="bottom-nav-indicator" />}
                    </button>
                ))}
            </div>

            <div className="bottom-nav-footer">
                <button type="button" className="bottom-nav-logout" onClick={handleLogout}>
                    <span className="bottom-nav-icon"><Icon name="logout" /></span>
                    <span className="bottom-nav-label">Logout</span>
                </button>
            </div>

            <button
                type="button"
                className="sidebar-toggle"
                onClick={toggleCollapsed}
                aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
                {collapsed ? <SidebarOpenIcon /> : <SidebarCloseIcon />}
            </button>
        </nav>
    );
}
