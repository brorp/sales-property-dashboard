'use client';

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Header from '../components/Header';
import { useLeads } from '../context/LeadsContext';
import { useAuth } from '../context/AuthContext';
import { getAppointmentTagLabel, getStatusBadgeClass, toWaLink } from '../constants/crm';
import { usePagePolling } from '../hooks/usePagePolling';

const FILTER_OPTIONS = [
    { key: 'active', label: 'Active' },
    { key: 'mau_survey', label: 'Mau Survey' },
    { key: 'sudah_survey', label: 'Sudah Survey' },
    { key: 'dibatalkan', label: 'Dibatalkan' },
    { key: 'all', label: 'Semua' },
];

function matchesTagFilter(item, tagFilter) {
    if (tagFilter === 'all') return true;
    if (tagFilter === 'active') return item.appointmentTag === 'mau_survey' || item.appointmentTag === 'sudah_survey';
    return item.appointmentTag === tagFilter;
}

export default function AppointmentsPage() {
    const { user, isAdmin } = useAuth();
    const { appointments, refreshAppointments, getSalesUsers } = useLeads();
    const router = useRouter();
    const [search, setSearch] = useState('');
    const [tagFilter, setTagFilter] = useState('active');
    const [salesFilter, setSalesFilter] = useState('all');
    const salesUsers = getSalesUsers();
    const canFilterBySales = user?.role === 'root_admin' || user?.role === 'client_admin' || user?.role === 'supervisor';

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
            if (!matchesTagFilter(item, tagFilter)) {
                return false;
            }

            if (salesFilter !== 'all' && item.salesId !== salesFilter) {
                return false;
            }

            if (!q) {
                return true;
            }

            return (
                String(item.leadName || '').toLowerCase().includes(q) ||
                String(item.leadPhone || '').includes(q) ||
                String(item.location || '').toLowerCase().includes(q)
            );
        });
    }, [appointments, salesFilter, search, tagFilter]);

    return (
        <div className="page-container">
            <Header
                title="Appointments"
                rightAction={
                    <button className="btn btn-sm btn-secondary" onClick={() => void refreshAppointments()}>
                        Refresh
                    </button>
                }
            />

            <div className="input-icon-wrapper" style={{ marginBottom: 12 }}>
                <span className="input-icon">🔎</span>
                <input
                    type="text"
                    className="input-field"
                    placeholder="Cari nama / nomor / lokasi..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />
            </div>

            <div className="filter-pills" style={{ marginBottom: 12 }}>
                {FILTER_OPTIONS.map((opt) => (
                    <button
                        key={opt.key}
                        className={`filter-pill ${tagFilter === opt.key ? 'active' : ''}`}
                        onClick={() => setTagFilter(opt.key)}
                    >
                        {opt.label}
                    </button>
                ))}
            </div>

            {canFilterBySales ? (
                <div className="filter-pills" style={{ marginBottom: 16 }}>
                    <button
                        className={`filter-pill ${salesFilter === 'all' ? 'active' : ''}`}
                        onClick={() => setSalesFilter('all')}
                    >
                        Semua Sales
                    </button>
                    {salesUsers.map((sales) => (
                        <button
                            key={sales.id}
                            className={`filter-pill ${salesFilter === sales.id ? 'active' : ''}`}
                            onClick={() => setSalesFilter(sales.id)}
                        >
                            {sales.name}
                        </button>
                    ))}
                </div>
            ) : null}

            <p className="leads-result-count">{filtered.length} appointment</p>

            <div className="card-list">
                {filtered.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-icon">📅</div>
                        <div className="empty-title">Belum ada appointment</div>
                        <div className="empty-desc">Data appointment akan muncul di sini</div>
                    </div>
                ) : (
                    filtered.map((item) => (
                        <div
                            key={item.id}
                            className="card card-clickable appt-card"
                            onClick={() => router.push(`/leads/${item.leadId}`)}
                        >
                            <div className="lead-row-top">
                                <div className="lead-row-name">{item.leadName}</div>
                                <span className={`badge ${getStatusBadgeClass('appointment', item.appointmentTag)}`}>
                                    {getAppointmentTagLabel(item.appointmentTag)}
                                </span>
                            </div>
                            <div className="lead-row-meta">
                                <span>📅 {item.date}</span>
                                <span>🕐 {item.time}</span>
                            </div>
                            <div className="lead-row-meta">
                                <span>📍 {item.location}</span>
                            </div>
                            <div className="lead-row-meta">
                                <a
                                    href={toWaLink(item.leadPhone)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={(event) => event.stopPropagation()}
                                >
                                    💬 {item.leadPhone}
                                </a>
                                {isAdmin ? <span>👤 {item.salesName || '-'}</span> : null}
                            </div>
                            {item.notes ? <div className="detail-appt-notes">{item.notes}</div> : null}
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
