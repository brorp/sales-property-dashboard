'use client';

import './DashboardPage.css';
import './OverviewPage.css';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useWorkspace } from '../context/WorkspaceContext';
import { apiRequest } from '../lib/api';
import Header from '../components/Header';
import { usePagePolling } from '../hooks/usePagePolling';
import OverviewSection from './dashboard-sections/OverviewSection';

function FilterIcon() {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="4" y1="6" x2="20" y2="6" />
            <line x1="8" y1="12" x2="16" y2="12" />
            <line x1="11" y1="18" x2="13" y2="18" />
        </svg>
    );
}

function CheckIcon() {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
        </svg>
    );
}

const PERIOD_OPTIONS = [
    { value: 'today', label: 'Hari Ini' },
    { value: 'last7', label: '7 Hari Terakhir' },
    { value: 'last30', label: '30 Hari Terakhir' },
    { value: 'last90', label: '90 Hari Terakhir' },
    { value: 'thisMonth', label: 'Bulan Ini' },
];

function formatDateInput(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function getPresetRange(key) {
    const today = new Date();
    const end = formatDateInput(today);
    if (key === 'today') return { dateFrom: end, dateTo: end };
    if (key === 'last7') { const s = new Date(today); s.setDate(today.getDate() - 6); return { dateFrom: formatDateInput(s), dateTo: end }; }
    if (key === 'last30') { const s = new Date(today); s.setDate(today.getDate() - 29); return { dateFrom: formatDateInput(s), dateTo: end }; }
    if (key === 'last90') { const s = new Date(today); s.setDate(today.getDate() - 89); return { dateFrom: formatDateInput(s), dateTo: end }; }
    const s = new Date(today.getFullYear(), today.getMonth(), 1);
    return { dateFrom: formatDateInput(s), dateTo: end };
}

function buildQuery(range) {
    const params = new URLSearchParams();
    if (range?.dateFrom) params.set('dateFrom', range.dateFrom);
    if (range?.dateTo) params.set('dateTo', range.dateTo);
    const q = params.toString();
    return q ? `?${q}` : '';
}

const DEFAULT_ANALYTICS = {
    surveyRatio: { totalLeads: 0, surveyedLeads: 0, ratioPercent: 0 },
    statusPie: { total: 0, items: [] },
    transactionRecap: null,
    resultRecap: { total: 0, items: [], cancelReasons: { total: 0, items: [] } },
    dailySalesReport: null,
    ongoingAppointments: [],
    perAgentSurveyRatio: [],
};

export default function OverviewPage() {
    const { user } = useAuth();
    const { activeWorkspace } = useWorkspace();
    const [analytics, setAnalytics] = useState(DEFAULT_ANALYTICS);
    const [activePeriod, setActivePeriod] = useState('today');
    const [loading, setLoading] = useState(false);
    const [appliedRange, setAppliedRange] = useState(() => getPresetRange('today'));
    const [filterOpen, setFilterOpen] = useState(false);

    const loadData = useCallback(async (range) => {
        if (!user) return;
        const data = await apiRequest(`/api/dashboard/home-analytics${buildQuery(range)}`, { user });
        if (data) setAnalytics(data);
    }, [user]);

    useEffect(() => {
        void loadData(appliedRange);
    }, [loadData, appliedRange]);

    usePagePolling({
        enabled: Boolean(user),
        intervalMs: 3000,
        run: useCallback(async () => { await loadData(appliedRange); }, [appliedRange, loadData]),
    });

    useEffect(() => {
        document.body.classList.add('dash-body');
        return () => document.body.classList.remove('dash-body');
    }, []);

    const handlePeriodChange = async (value) => {
        if (!value) return;
        setActivePeriod(value);
        setFilterOpen(false);
        const range = getPresetRange(value);
        setLoading(true);
        try {
            setAppliedRange(range);
            await loadData(range);
        } finally {
            setLoading(false);
        }
    };

    const currentLabel = PERIOD_OPTIONS.find((o) => o.value === activePeriod)?.label ?? 'Hari Ini';

    return (
        <div className="page-container dash-page">
            <Header title="Overview" />

            <div className="dash-sticky-bar">
                <div className="overview-header-bar">
                    <div className="overview-header-text">
                        {activeWorkspace?.name && (
                            <span className="overview-ws-name">{activeWorkspace.name}</span>
                        )}
                        <div className="overview-title-row">
                            <span className="overview-title">Ringkasan</span>
                            <span className="overview-period-tag">{currentLabel}</span>
                        </div>
                    </div>
                    <button
                        type="button"
                        className={`overview-filter-btn${filterOpen ? ' is-active' : ''}`}
                        onClick={() => setFilterOpen((v) => !v)}
                        aria-label="Filter periode"
                    >
                        <FilterIcon />
                    </button>
                </div>
            </div>

            {filterOpen && (
                <>
                    <div className="overview-sheet-backdrop" onClick={() => setFilterOpen(false)} />
                    <div className="overview-sheet">
                        <div className="overview-sheet-handle" />
                        <div className="overview-sheet-title">Pilih Periode</div>
                        {PERIOD_OPTIONS.map((opt) => (
                            <button
                                key={opt.value}
                                type="button"
                                className={`overview-sheet-item${activePeriod === opt.value ? ' active' : ''}`}
                                onClick={() => handlePeriodChange(opt.value)}
                            >
                                <span>{opt.label}</span>
                                <span className="overview-sheet-check"><CheckIcon /></span>
                            </button>
                        ))}
                    </div>
                </>
            )}

            <OverviewSection
                surveyRatio={analytics.surveyRatio}
                statusPie={analytics.statusPie}
                transactionRecap={analytics.transactionRecap}
                resultRecap={analytics.resultRecap}
                dailySalesReport={analytics.dailySalesReport}
                ongoingAppointments={analytics.ongoingAppointments}
                perAgentSurveyRatio={analytics.perAgentSurveyRatio}
            />
        </div>
    );
}
