'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Header from '../components/Header';
import UserAvatar from '../components/UserAvatar';
import { useLeads } from '../context/LeadsContext';
import { useAuth } from '../context/AuthContext';
import { getAppointmentTagLabel, getStatusBadgeClass, toWaLink } from '../constants/crm';
import { usePagePolling } from '../hooks/usePagePolling';
import SelectFilter from '../components/SelectFilter';
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

function matchesTagFilter(item, tagFilter) {
    if (!tagFilter) return true;
    if (tagFilter === 'active') return item.appointmentTag === 'mau_survey' || item.appointmentTag === 'sudah_survey';
    return item.appointmentTag === tagFilter;
}

export default function AppointmentsPage() {
    const { user, isAdmin } = useAuth();
    const { appointments, refreshAppointments, getSalesUsers } = useLeads();
    const router = useRouter();
    const [search, setSearch] = useState('');
    const [tagFilter, setTagFilter] = useState('');
    const [salesFilter, setSalesFilter] = useState('');
    const salesUsers = getSalesUsers();
    const canFilterBySales = user?.role === 'root_admin' || user?.role === 'client_admin' || user?.role === 'supervisor';
    const hasAnyFilter = Boolean(search || tagFilter !== '' || salesFilter);
    const resetAllFilters = () => { setSearch(''); setTagFilter(''); setSalesFilter(''); };

    useEffect(() => {
        document.body.classList.add('light-page');
        return () => document.body.classList.remove('light-page');
    }, []);

    usePagePolling({
        enabled: Boolean(user),
        intervalMs: 3000,
        run: useCallback(async () => {
            await refreshAppointments();
        }, [refreshAppointments]),
    });

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        return appointments.filter((item) => {
            if (!matchesTagFilter(item, tagFilter)) return false;
            if (salesFilter && item.salesId !== salesFilter) return false;
            if (!q) return true;
            return (
                String(item.leadName || '').toLowerCase().includes(q) ||
                String(item.leadPhone || '').includes(q) ||
                String(item.location || '').toLowerCase().includes(q)
            );
        });
    }, [appointments, salesFilter, search, tagFilter]);

    return (
        <div className="page-container ap-page">
            <Header
                title="Appointments"
                rightAction={
                    <button className="btn btn-sm btn-secondary" onClick={() => void refreshAppointments()}>
                        Refresh
                    </button>
                }
            />

            <div className="ap-filter-bar">
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
                <div className="ap-selects-row">
                    <SelectFilter
                        placeholder="Status Appointment"
                        options={TAG_OPTIONS}
                        value={tagFilter}
                        onChange={setTagFilter}
                    />
                    {canFilterBySales ? (
                        <SelectFilter
                            placeholder="Semua Sales"
                            options={salesUsers.map((s) => ({ value: s.id, label: s.name }))}
                            value={salesFilter}
                            onChange={setSalesFilter}
                        />
                    ) : null}
                </div>
                {hasAnyFilter ? (
                    <button type="button" className="ap-reset-all" onClick={resetAllFilters}>Reset</button>
                ) : null}
            </div>

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
                        {tagFilter || salesFilter ? 'Tidak ada hasil' : 'Belum ada appointment'}
                    </p>
                    <p className="ap-empty-desc">
                        {tagFilter || salesFilter
                            ? 'Coba ubah atau hapus filter yang aktif.'
                            : 'Appointment yang dibuat di detail lead akan muncul di sini.'}
                    </p>
                    {(tagFilter || salesFilter) ? (
                        <button
                            className="ap-empty-reset"
                            onClick={() => { setTagFilter(''); setSalesFilter(''); }}
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
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
