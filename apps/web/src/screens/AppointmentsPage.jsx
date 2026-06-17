'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Header from '../components/Header';
import UserAvatar from '../components/UserAvatar';
import { useLeads } from '../context/LeadsContext';
import { useAuth } from '../context/AuthContext';
import { getAppointmentTagLabel, getStatusBadgeClass, toWaLink } from '../constants/crm';
import { usePagePolling } from '../hooks/usePagePolling';
import Select from '../components/Select';
import { apiRequest } from '../lib/api';
import './AppointmentsPage.css';

const TAG_OPTIONS = [
    { value: 'active', label: 'Active' },
    { value: 'mau_survey', label: 'Mau Survey' },
    { value: 'sudah_survey', label: 'Sudah Survey' },
    { value: 'dibatalkan', label: 'Dibatalkan' },
];

const IconCalendar = () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
);

const IconPin = () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 21c-4-4-7-7.5-7-11a7 7 0 1 1 14 0c0 3.5-3 7-7 11z" />
        <circle cx="12" cy="10" r="2.5" />
    </svg>
);

const IconWhatsApp = () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
);

const IconUser = () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="8" r="4" />
        <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
    </svg>
);

function getAppointmentGroup(appt) {
    if (!appt.date) return 'nanti';
    const today = new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    const parts = appt.date.split('-').map(Number);
    if (parts.length !== 3) return 'nanti';
    const apptTime = new Date(parts[0], parts[1] - 1, parts[2]).getTime();

    if (apptTime < todayStart) return 'terlewat';
    if (apptTime === todayStart) return 'hari_ini';
    return 'nanti';
}

export default function AppointmentsPage() {
    const { user, isAdmin } = useAuth();
    const {
        appointments,
        refreshAppointments,
        getSalesUsers,
        appointmentsFilters,
        updateAppointmentsFilters,
        resetAppointmentsFilters,
        leads
    } = useLeads();
    const router = useRouter();

    const {
        search,
        salesFilter
    } = appointmentsFilters;

    const setSearch = (val) => updateAppointmentsFilters((prev) => ({ ...prev, search: typeof val === 'function' ? val(prev.search) : val }));
    const setSalesFilter = (val) => updateAppointmentsFilters((prev) => ({ ...prev, salesFilter: typeof val === 'function' ? val(prev.salesFilter) : val }));

    const [mainTab, setMainTab] = useState('active');
    const [subTab, setSubTab] = useState('hari_ini');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [reschedulingApptId, setReschedulingApptId] = useState(null);
    const [rescheduleValue, setRescheduleValue] = useState('');

    const [showMobileFilter, setShowMobileFilter] = useState(false);
    const [sortOption, setSortOption] = useState('terbaru');
    const [showSortDrawer, setShowSortDrawer] = useState(false);
    const salesUsers = getSalesUsers();
    const salesOptions = useMemo(() => {
        const activeSales = salesUsers.filter((s) => s.isActive !== false);
        const inactiveSales = salesUsers.filter((s) => s.isActive === false);

        const options = [];
        if (activeSales.length > 0) {
            options.push({ isGroupHeader: true, label: 'Aktif' });
            activeSales.forEach((s) => {
                options.push({ value: s.id, label: s.name });
            });
        }
        if (inactiveSales.length > 0) {
            options.push({ isGroupHeader: true, label: 'Nonaktif' });
            inactiveSales.forEach((s) => {
                options.push({ value: s.id, label: s.name });
            });
        }
        return options;
    }, [salesUsers]);
    const canFilterBySales = user?.role === 'root_admin' || user?.role === 'client_admin' || user?.role === 'supervisor';
    const hasAnyFilter = Boolean(search || salesFilter);
    const resetAllFilters = () => {
        resetAppointmentsFilters();
        setMainTab('active');
        setSubTab('hari_ini');
    };
    const activeFilterCount = [Boolean(salesFilter)].filter(Boolean).length;

    usePagePolling({
        enabled: Boolean(user),
        intervalMs: 3000,
        run: useCallback(async () => {
            await refreshAppointments();
        }, [refreshAppointments]),
    });

    const handleUpdateAppointmentStatus = async (appt, status) => {
        try {
            setError('');
            setSuccess('');
            await apiRequest(`/api/appointments/${appt.id}`, {
                method: 'PATCH',
                user,
                body: { status }
            });
            setSuccess(
                status === 'sudah_survey'
                    ? `Janji temu dengan ${appt.leadName} ditandai Sudah Survey.`
                    : `Janji temu dengan ${appt.leadName} dibatalkan.`
            );
            await refreshAppointments();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Gagal memperbarui janji temu');
        }
    };

    const handleStartReschedule = (e, appt) => {
        e.stopPropagation();
        setReschedulingApptId(appt.id);
        const defaultVal = appt.date ? `${appt.date}T${appt.time || '12:00'}` : '';
        setRescheduleValue(defaultVal);
    };

    const handleSaveReschedule = async (appt) => {
        if (!rescheduleValue) return;
        const [datePart, timePart] = rescheduleValue.split('T');
        try {
            setError('');
            setSuccess('');
            await apiRequest(`/api/appointments/${appt.id}`, {
                method: 'PATCH',
                user,
                body: {
                    date: datePart,
                    time: timePart || '12:00'
                }
            });
            setSuccess(`Janji temu dengan ${appt.leadName} berhasil dijadwal ulang.`);
            setReschedulingApptId(null);
            await refreshAppointments();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Gagal mengubah jadwal janji temu');
        }
    };

    const counts = useMemo(() => {
        let activeHariIni = 0;
        let activeNanti = 0;
        let activeTerlewat = 0;
        let historySudah = 0;
        let historyBatal = 0;

        appointments.forEach((item) => {
            if (salesFilter && item.salesId !== salesFilter) return;

            if (item.appointmentTag === 'mau_survey') {
                const group = getAppointmentGroup(item);
                if (group === 'hari_ini') activeHariIni++;
                else if (group === 'nanti') activeNanti++;
                else if (group === 'terlewat') activeTerlewat++;
            } else if (item.appointmentTag === 'sudah_survey') {
                historySudah++;
            } else if (item.appointmentTag === 'dibatalkan') {
                historyBatal++;
            }
        });

        return {
            active: activeHariIni + activeNanti + activeTerlewat,
            history: historySudah + historyBatal,
            hari_ini: activeHariIni,
            nanti: activeNanti,
            terlewat: activeTerlewat,
            sudah: historySudah,
            batal: historyBatal
        };
    }, [appointments, salesFilter]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        const list = appointments.filter((item) => {
            if (mainTab === 'active') {
                if (item.appointmentTag !== 'mau_survey') return false;
                const group = getAppointmentGroup(item);
                if (subTab === 'hari_ini' && group !== 'hari_ini') return false;
                if (subTab === 'nanti' && group !== 'nanti') return false;
                if (subTab === 'terlewat' && group !== 'terlewat') return false;
            } else {
                if (subTab === 'sudah' && item.appointmentTag !== 'sudah_survey') return false;
                if (subTab === 'batal' && item.appointmentTag !== 'dibatalkan') return false;
            }

            if (salesFilter && item.salesId !== salesFilter) return false;
            if (!q) return true;
            return (
                String(item.leadName || '').toLowerCase().includes(q) ||
                String(item.leadPhone || '').includes(q) ||
                String(item.location || '').toLowerCase().includes(q)
            );
        });

        const getCountVal = (appt) => {
            const leadDetail = (Array.isArray(leads) ? leads : []).find((l) => l.id === appt.leadId);
            if (!leadDetail) return 0;
            return (leadDetail.customerPipelineCompletedCount || 0) + (leadDetail.activities?.length || 0);
        };

        if (sortOption === 'terbaru') {
            return list.sort((a, b) => new Date(b.date + 'T' + (b.time || '00:00')) - new Date(a.date + 'T' + (a.time || '00:00')));
        }
        if (sortOption === 'terlama') {
            return list.sort((a, b) => new Date(a.date + 'T' + (a.time || '00:00')) - new Date(b.date + 'T' + (b.time || '00:00')));
        }
        if (sortOption === 'terbanyak') {
            return list.sort((a, b) => getCountVal(b) - getCountVal(a));
        }
        if (sortOption === 'terdikit') {
            return list.sort((a, b) => getCountVal(a) - getCountVal(b));
        }
        if (sortOption === 'abjad' || sortOption === 'abjad_asc') {
            return list.sort((a, b) => String(a.leadName || '').localeCompare(String(b.leadName || '')));
        }
        if (sortOption === 'abjad_desc') {
            return list.sort((a, b) => String(b.leadName || '').localeCompare(String(a.leadName || '')));
        }

        return list;
    }, [appointments, salesFilter, search, mainTab, subTab, sortOption, leads]);

    return (
        <div className="page-container ap-page">
            <Header
                title="Janji Temu"
                rightAction={
                    <button className="btn btn-sm btn-secondary btn-icon-refresh" onClick={() => void refreshAppointments()} title="Refresh">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /></svg>
                    </button>
                }
            />

            {/* Main Tabs (Active vs Riwayat/Inactive) */}
            <div className="ap-main-tabs">
                <button
                    type="button"
                    className={`ap-main-tab${mainTab === 'active' ? ' is-active' : ''}`}
                    onClick={() => {
                        setMainTab('active');
                        setSubTab('hari_ini');
                    }}
                >
                    <span className="ap-main-tab-label">Active</span>
                    <span className="ap-main-tab-badge">{counts.active}</span>
                </button>
                <button
                    type="button"
                    className={`ap-main-tab${mainTab === 'history' ? ' is-active' : ''}`}
                    onClick={() => {
                        setMainTab('history');
                        setSubTab('sudah');
                    }}
                >
                    <span className="ap-main-tab-label">Riwayat / Inactive</span>
                    <span className="ap-main-tab-badge">{counts.history}</span>
                </button>
            </div>

            {/* Sub Tabs */}
            <div className="ap-subtabs">
                {mainTab === 'active' ? (
                    <>
                        <button
                            type="button"
                            className={`ap-subtab${subTab === 'hari_ini' ? ' is-active' : ''}`}
                            onClick={() => setSubTab('hari_ini')}
                        >
                            <span>Hari Ini</span>
                            <span className="ap-subtab-badge" style={counts.hari_ini === 0 ? { display: 'none' } : undefined}>{counts.hari_ini}</span>
                        </button>
                        <button
                            type="button"
                            className={`ap-subtab${subTab === 'nanti' ? ' is-active' : ''}`}
                            onClick={() => setSubTab('nanti')}
                        >
                            <span>Nanti</span>
                            <span className="ap-subtab-badge" style={counts.nanti === 0 ? { display: 'none' } : undefined}>{counts.nanti}</span>
                        </button>
                        <button
                            type="button"
                            className={`ap-subtab${subTab === 'terlewat' ? ' is-active' : ''}`}
                            onClick={() => setSubTab('terlewat')}
                        >
                            <span>Terlewat</span>
                            <span className="ap-subtab-badge" style={counts.terlewat === 0 ? { display: 'none' } : undefined}>{counts.terlewat}</span>
                        </button>
                    </>
                ) : (
                    <>
                        <button
                            type="button"
                            className={`ap-subtab${subTab === 'sudah' ? ' is-active' : ''}`}
                            onClick={() => setSubTab('sudah')}
                        >
                            <span>Sudah Survey</span>
                            <span className="ap-subtab-badge" style={counts.sudah === 0 ? { display: 'none' } : undefined}>{counts.sudah}</span>
                        </button>
                        <button
                            type="button"
                            className={`ap-subtab${subTab === 'batal' ? ' is-active' : ''}`}
                            onClick={() => setSubTab('batal')}
                        >
                            <span>Dibatalkan</span>
                            <span className="ap-subtab-badge" style={counts.batal === 0 ? { display: 'none' } : undefined}>{counts.batal}</span>
                        </button>
                    </>
                )}
            </div>

            <div className="ap-filter-bar">
                <div className="ap-search-row">
                    <div className="input-icon-wrapper ap-search-wrap">
                        <span className="input-icon">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
                            </svg>
                        </span>
                        <input
                            type="text"
                            className="input-field"
                            placeholder="Cari nama, nomor, atau lokasi..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>
                    <div style={{ position: 'relative', display: 'inline-flex' }}>
                        <button
                            type="button"
                            className="ap-mobile-filter-btn ap-sort-btn"
                            onClick={() => setShowSortDrawer(true)}
                            title="Urutkan"
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="21" y1="10" x2="3" y2="10" />
                                <line x1="21" y1="6" x2="3" y2="6" />
                                <line x1="21" y1="14" x2="3" y2="14" />
                                <line x1="21" y1="18" x2="3" y2="18" />
                            </svg>
                        </button>
                        {sortOption !== 'terbaru' ? (
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setSortOption('terbaru');
                                }}
                                title="Reset Urutan"
                                style={{
                                    position: 'absolute',
                                    top: '-6px',
                                    right: '-6px',
                                    width: '18px',
                                    height: '18px',
                                    borderRadius: '50%',
                                    background: '#EF4444',
                                    color: '#FFFFFF',
                                    border: 'none',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    cursor: 'pointer',
                                    zIndex: 2,
                                    padding: 0,
                                    boxShadow: '0 2px 5px rgba(0,0,0,0.2)'
                                }}
                            >
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                                    <line x1="18" y1="6" x2="6" y2="18" />
                                    <line x1="6" y1="6" x2="18" y2="18" />
                                </svg>
                            </button>
                        ) : null}
                    </div>
                    {canFilterBySales ? (
                        <button
                            type="button"
                            className={`ap-mobile-filter-btn${activeFilterCount > 0 ? ' is-active' : ''}`}
                            onClick={() => setShowMobileFilter(true)}
                            title="Filter"
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                            </svg>
                            {activeFilterCount > 0 ? (
                                <button
                                    type="button"
                                    className="ap-filter-reset-badge"
                                    onClick={(e) => { e.stopPropagation(); resetAllFilters(); }}
                                    title="Reset filter"
                                >
                                    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                                    </svg>
                                </button>
                            ) : null}
                        </button>
                    ) : null}
                    {hasAnyFilter ? (
                        <button type="button" className="ap-reset-all ap-reset-desktop-only" onClick={resetAllFilters}>Reset</button>
                    ) : null}
                </div>
                {canFilterBySales ? (
                    <div className="ap-selects-row">
                        <Select
                            placeholder="Semua Sales"
                            options={salesOptions}
                            value={salesFilter}
                            onChange={setSalesFilter}
                        />
                    </div>
                ) : null}
            </div>

            {error ? <div className="login-error" style={{ marginBottom: 16 }}>{error}</div> : null}
            {success ? <div className="login-success" style={{ marginBottom: 16, color: '#10B981', fontWeight: 600 }}>{success}</div> : null}

            {filtered.length > 0 ? (
                <p className="ap-result-count">{filtered.length} appointment</p>
            ) : null}

            {filtered.length === 0 ? (
                <div className="ap-empty">
                    <div className="ap-empty-icon">
                        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="4" width="18" height="18" rx="2" />
                            <path d="M16 2v4M8 2v4M3 10h18" />
                            <path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01" />
                        </svg>
                    </div>
                    <p className="ap-empty-title">
                        {search || salesFilter ? 'Tidak ada hasil' : 'Belum ada appointment'}
                    </p>
                    <p className="ap-empty-desc">
                        {search || salesFilter
                            ? 'Coba ubah atau hapus filter yang aktif.'
                            : 'Janji temu yang dibuat di detail lead akan muncul di sini.'}
                    </p>
                    {(search || salesFilter) ? (
                        <button
                            className="ap-empty-reset"
                            onClick={() => { setSearch(''); setSalesFilter(''); }}
                        >
                            Hapus semua filter
                        </button>
                    ) : null}
                </div>
            ) : (
                <div className="ap-list">
                    {filtered.map((item) => (
                        <div
                            key={item.id}
                            className="ap-card"
                            onClick={() => router.push(`/leads/${item.leadId}`)}
                        >
                            <div className="ap-card-head">
                                <UserAvatar name={item.leadName} size="xs" shape="circle" />
                                <div className="ap-card-info">
                                    <div className="ap-card-name-row">
                                        <span className="ap-card-name">{item.leadName}</span>
                                        <span className={`badge ${getStatusBadgeClass('appointment', item.appointmentTag)}`}>
                                            {getAppointmentTagLabel(item.appointmentTag)}
                                        </span>
                                    </div>
                                    <div className="ap-card-meta">
                                        <span className="ap-meta-item">
                                            <IconCalendar />
                                            {item.date} · {item.time}
                                        </span>
                                        <span className="ap-meta-item">
                                            <IconPin />
                                            {item.location}
                                        </span>
                                    </div>
                                    <div className="ap-card-meta">
                                        <a
                                            className="ap-meta-item ap-meta-link"
                                            href={toWaLink(item.leadPhone)}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            onClick={(event) => event.stopPropagation()}
                                        >
                                            <IconWhatsApp />
                                            {item.leadPhone}
                                        </a>
                                        {isAdmin ? (
                                            <span className="ap-meta-item ap-card-sales">
                                                <IconUser />
                                                {item.salesName || '-'}
                                            </span>
                                        ) : null}
                                    </div>
                                </div>
                            </div>

                            {item.notes ? (
                                <div className="ap-card-notes">{item.notes}</div>
                            ) : null}

                            {/* Render reschedule form or action buttons if active appointment */}
                            {mainTab === 'active' ? (
                                reschedulingApptId === item.id ? (
                                    <div className="dt-reschedule-form" onClick={(e) => e.stopPropagation()} style={{ marginTop: '12px' }}>
                                        <input
                                            type="datetime-local"
                                            className="input-field"
                                            value={rescheduleValue}
                                            onChange={(e) => setRescheduleValue(e.target.value)}
                                            onClick={(e) => e.stopPropagation()}
                                        />
                                        <div className="dt-reschedule-actions" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '8px' }}>
                                            <button
                                                type="button"
                                                className="btn btn-sm btn-primary"
                                                onClick={() => handleSaveReschedule(item)}
                                            >
                                                Simpan
                                            </button>
                                            <button
                                                type="button"
                                                className="btn btn-sm btn-secondary"
                                                onClick={() => setReschedulingApptId(null)}
                                            >
                                                Batal
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="dt-appt-actions-wrap" onClick={(e) => e.stopPropagation()} style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%', marginTop: '12px' }}>
                                        <div className="dt-appt-actions" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                            <button
                                                type="button"
                                                className="dt-btn-action btn-sudah-survey"
                                                onClick={(e) => { e.stopPropagation(); void handleUpdateAppointmentStatus(item, 'sudah_survey'); }}
                                            >
                                                Sudah Survey
                                            </button>
                                            <div className="dt-appt-actions-row" style={{ display: 'flex', gap: '8px', width: '100%' }}>
                                                <button
                                                    type="button"
                                                    className="dt-btn-action btn-reschedule"
                                                    style={{ flex: 1 }}
                                                    onClick={(e) => handleStartReschedule(e, item)}
                                                >
                                                    Reschedule
                                                </button>
                                                <button
                                                    type="button"
                                                    className="dt-btn-action btn-batal-survey"
                                                    style={{ flex: 1 }}
                                                    onClick={(e) => { e.stopPropagation(); void handleUpdateAppointmentStatus(item, 'dibatalkan'); }}
                                                >
                                                    Batal Survey
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )
                            ) : null}
                        </div>
                    ))}
                </div>
            )}
            {showMobileFilter ? (
                <div className="sheet-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowMobileFilter(false); }}>
                    <div className="bottom-sheet">
                        <div className="sheet-handle" />
                        <h2>Filter Janji Temu</h2>
                        <div className="ap-filter-sheet-body">
                            {canFilterBySales ? (
                                <Select
                                    placeholder="Semua Sales"
                                    options={salesOptions}
                                    value={salesFilter}
                                    onChange={setSalesFilter}
                                />
                            ) : null}
                        </div>
                        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                            <button type="button" className="btn btn-ghost" style={{ flex: 1 }} onClick={() => { resetAllFilters(); setShowMobileFilter(false); }}>Reset Semua</button>
                            <button type="button" className="btn btn-primary" style={{ flex: 1 }} onClick={() => setShowMobileFilter(false)}>Tutup</button>
                        </div>
                    </div>
                </div>
            ) : null}

            {showSortDrawer ? (
                <div className="sheet-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowSortDrawer(false); }}>
                    <div className="bottom-sheet">
                        <div className="sheet-handle" />
                        <h2>Urutkan Janji Temu</h2>
                        <div className="ap-filter-sheet-body">
                            {[
                                {
                                    id: 'date',
                                    label: 'Waktu / Tanggal',
                                    icon: (
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                                            <line x1="16" y1="2" x2="16" y2="6" />
                                            <line x1="8" y1="2" x2="8" y2="6" />
                                            <line x1="3" y1="10" x2="21" y2="10" />
                                        </svg>
                                    ),
                                    options: {
                                        desc: { value: 'terbaru', label: 'Terbaru' },
                                        asc: { value: 'terlama', label: 'Terlama' }
                                    }
                                },
                                {
                                    id: 'name',
                                    label: 'Nama Lead (Abjad)',
                                    icon: (
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                                            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                                        </svg>
                                    ),
                                    options: {
                                        asc: { value: 'abjad', label: 'A-Z' },
                                        desc: { value: 'abjad_desc', label: 'Z-A' }
                                    }
                                }
                            ].map((field) => {
                                const isAscActive = sortOption === field.options.asc.value || (field.id === 'name' && sortOption === 'abjad_asc');
                                const isDescActive = sortOption === field.options.desc.value;
                                const isActive = isAscActive || isDescActive;
                                return (
                                    <button
                                        key={field.id}
                                        type="button"
                                        className={`sfd-item${isActive ? ' active' : ''}`}
                                        onClick={() => {
                                            if (field.id === 'date') {
                                                setSortOption(sortOption === 'terbaru' ? 'terlama' : 'terbaru');
                                            } else if (field.id === 'name') {
                                                setSortOption((sortOption === 'abjad' || sortOption === 'abjad_asc') ? 'abjad_desc' : 'abjad');
                                            }
                                        }}
                                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '12px 16px' }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                            <span style={{ display: 'flex', color: isActive ? 'var(--primary)' : 'var(--text-muted)' }}>
                                                {field.icon}
                                            </span>
                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                                                <span className="sfd-item-label" style={{ fontWeight: isActive ? '700' : '500', color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                                                    {field.label}
                                                </span>
                                                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                                    {isActive ? (isDescActive ? field.options.desc.label : field.options.asc.label) : 'Pilih untuk mengurutkan'}
                                                </span>
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            {/* ASC (Up Arrow) */}
                                            <span style={{
                                                display: 'flex',
                                                padding: '4px',
                                                borderRadius: '6px',
                                                background: isAscActive ? 'var(--primary-glow, rgba(30, 58, 95, 0.1))' : 'transparent',
                                                color: isAscActive ? 'var(--primary)' : 'var(--text-muted)',
                                                transition: 'all 150ms ease'
                                            }}>
                                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                                    <polyline points="18 15 12 9 6 15" />
                                                </svg>
                                            </span>
                                            {/* DESC (Down Arrow) */}
                                            <span style={{
                                                display: 'flex',
                                                padding: '4px',
                                                borderRadius: '6px',
                                                background: isDescActive ? 'var(--primary-glow, rgba(30, 58, 95, 0.1))' : 'transparent',
                                                color: isDescActive ? 'var(--primary)' : 'var(--text-muted)',
                                                transition: 'all 150ms ease'
                                            }}>
                                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                                    <polyline points="6 9 12 15 18 9" />
                                                </svg>
                                            </span>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                            <button type="button" className="btn btn-primary animate-hover" style={{ flex: 1 }} onClick={() => setShowSortDrawer(false)}>Tutup</button>
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
