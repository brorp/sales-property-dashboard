'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Header from '../components/Header';
import { useLeads } from '../context/LeadsContext';
import { useAuth } from '../context/AuthContext';
import { getAppointmentTagLabel, toWaLink } from '../constants/crm';

export default function AppointmentsPage() {
    const { isAdmin } = useAuth();
    const { appointments, refreshAppointments } = useLeads();
    const router = useRouter();
    const [search, setSearch] = useState('');
    const [tagFilter, setTagFilter] = useState('all');

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        return appointments.filter((item) => {
            if (tagFilter !== 'all' && item.appointmentTag !== tagFilter) {
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
    }, [appointments, search, tagFilter]);

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
                <button
                    className={`filter-pill ${tagFilter === 'all' ? 'active' : ''}`}
                    onClick={() => setTagFilter('all')}
                >
                    Semua
                </button>
                <button
                    className={`filter-pill ${tagFilter === 'mau_survey' ? 'active' : ''}`}
                    onClick={() => setTagFilter('mau_survey')}
                >
                    Mau Survey
                </button>
                <button
                    className={`filter-pill ${tagFilter === 'sudah_survey' ? 'active' : ''}`}
                    onClick={() => setTagFilter('sudah_survey')}
                >
                    Sudah Survey
                </button>
            </div>

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
                                <span className={`badge ${item.appointmentTag === 'mau_survey' ? 'badge-warm' : 'badge-success'}`}>
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
