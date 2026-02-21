import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLeads } from '../context/LeadsContext';
import { getSalesName, getTimeAgo, formatDate, PROGRESS_STEPS, CLIENT_STATUSES } from '../data/mockData';
import Header from '../components/Header';
import './LeadDetailPage.css';

export default function LeadDetailPage() {
    const { id } = useParams();
    const { user, isAdmin } = useAuth();
    const { getLeadById, updateLead, addAppointment, getSalesUsers } = useLeads();
    const navigate = useNavigate();
    const [showAppt, setShowAppt] = useState(false);
    const [showNote, setShowNote] = useState(false);
    const [note, setNote] = useState('');
    const [appt, setAppt] = useState({ date: '', time: '', location: '', notes: '' });
    const [showReassign, setShowReassign] = useState(false);

    const lead = getLeadById(id);
    if (!lead) return (
        <div className="page-container">
            <Header title="Detail Lead" showBack />
            <div className="empty-state"><div className="empty-icon">❌</div><div className="empty-title">Lead tidak ditemukan</div></div>
        </div>
    );

    const progressIndex = PROGRESS_STEPS.findIndex(s => s.key === lead.progress);
    const isRejected = lead.progress === 'rejected';
    const salesUsers = getSalesUsers();
    const waLink = `https://wa.me/${lead.phone.replace(/^0/, '62').replace(/[^0-9]/g, '')}`;

    const handleAddNote = (e) => { e.preventDefault(); if (!note.trim()) return; updateLead(lead.id, { activityNote: note }); setNote(''); setShowNote(false); };
    const handleAddAppt = (e) => { e.preventDefault(); if (!appt.date || !appt.time || !appt.location) return; addAppointment(lead.id, appt); setAppt({ date: '', time: '', location: '', notes: '' }); setShowAppt(false); };

    const actIcons = {
        new: { icon: '📥', bg: 'var(--primary-glow)' }, 'follow-up': { icon: '📞', bg: 'var(--warm-bg)' },
        pending: { icon: '⏳', bg: 'var(--purple-bg)' }, appointment: { icon: '📅', bg: 'var(--success-bg)' },
        rejected: { icon: '❌', bg: 'var(--danger-bg)' }, closed: { icon: '✅', bg: 'var(--success-bg)' },
        note: { icon: '📝', bg: 'rgba(148,163,184,0.12)' },
    };

    return (
        <div className="page-container">
            <Header title="Detail Lead" showBack />

            <div className="card detail-info-card">
                <h2 className="detail-client-name">{lead.name}</h2>
                <div className="detail-info-row"><span>📱</span><span>{lead.phone}</span></div>
                <div className="detail-info-row"><span>📅</span><span>Masuk: {formatDate(lead.createdAt)}</span></div>
                <div className="detail-info-row"><span>📣</span><span>{lead.source}</span></div>
                <div className="detail-info-row">
                    <span>👨‍💼</span>
                    <span>Sales: {getSalesName(lead.assignedTo)}
                        {isAdmin && <button className="detail-reassign-btn" onClick={() => setShowReassign(true)}>✏️ Ubah</button>}
                    </span>
                </div>
                <a href={waLink} target="_blank" rel="noopener noreferrer" className="btn btn-whatsapp btn-full" style={{ marginTop: 12 }}>💬 Chat WhatsApp</a>
            </div>

            <div className="detail-section">
                <h3 className="section-title">Client Status</h3>
                <div className="detail-status-grid">
                    {CLIENT_STATUSES.map(s => (
                        <button key={s.key} className={`detail-status-btn ${lead.clientStatus === s.key ? 'active' : ''}`} data-status={s.key}
                            onClick={() => updateLead(lead.id, { clientStatus: s.key })}>
                            <span>{s.icon}</span><span>{s.label}</span>
                        </button>
                    ))}
                </div>
            </div>

            <div className="detail-section">
                <h3 className="section-title">Sales Progress</h3>
                <div className="progress-stepper">
                    {PROGRESS_STEPS.map((step, i) => {
                        const isCurrent = lead.progress === step.key;
                        const isCompleted = !isRejected && progressIndex > i;
                        return (
                            <span key={step.key} style={{ display: 'contents' }}>
                                {i > 0 && <div className={`progress-line ${isCompleted ? 'completed' : ''}`} />}
                                <button className={`progress-step ${isCompleted ? 'completed' : ''} ${isCurrent ? 'active' : ''}`}
                                    onClick={() => {
                                        if (step.key === 'appointment') { setShowAppt(true); return; }
                                        updateLead(lead.id, { progress: step.key });
                                    }}>
                                    <span className="step-dot">{isCompleted ? '✓' : step.icon}</span>
                                    <span className="step-label">{step.label}</span>
                                </button>
                            </span>
                        );
                    })}
                </div>
                {!isRejected && lead.progress !== 'closed' && (
                    <button className="btn btn-sm btn-danger" style={{ marginTop: 12 }} onClick={() => updateLead(lead.id, { progress: 'rejected' })}>❌ Tandai Rejected</button>
                )}
                {isRejected && <div className="detail-rejected-banner">❌ Lead ini ditandai sebagai Rejected</div>}
            </div>

            {lead.appointments?.length > 0 && (
                <div className="detail-section">
                    <h3 className="section-title">📅 Appointments</h3>
                    {lead.appointments.map(a => (
                        <div key={a.id} className="card detail-appt-card">
                            <div className="detail-appt-date">🕐 {a.date} • {a.time}</div>
                            <div className="detail-appt-location">📍 {a.location}</div>
                            {a.notes && <div className="detail-appt-notes">{a.notes}</div>}
                        </div>
                    ))}
                </div>
            )}

            <div className="detail-section">
                <h3 className="section-title">Riwayat Aktivitas</h3>
                <div className="card">
                    <div className="activity-list">
                        {(lead.activities || []).map(a => {
                            const ic = actIcons[a.type] || actIcons.note;
                            return (
                                <div key={a.id} className="activity-item">
                                    <div className="activity-icon" style={{ background: ic.bg }}>{ic.icon}</div>
                                    <div className="activity-content">
                                        <div className="activity-title">{a.note}</div>
                                        <div className="activity-time">{getTimeAgo(a.timestamp)}</div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            <div className="detail-actions">
                <button className="btn btn-secondary btn-full" onClick={() => setShowNote(true)}>✏️ Tambah Catatan</button>
                <button className="btn btn-primary btn-full" onClick={() => setShowAppt(true)}>📅 Buat Appointment</button>
            </div>

            {showNote && (
                <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowNote(false); }}>
                    <div className="bottom-sheet">
                        <div className="sheet-handle" />
                        <h2>✏️ Tambah Catatan</h2>
                        <form onSubmit={handleAddNote} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            <div className="input-group"><label>Catatan</label>
                                <textarea className="input-field" placeholder="Tulis catatan aktivitas..." rows={4} value={note} onChange={(e) => setNote(e.target.value)} required style={{ resize: 'vertical' }} />
                            </div>
                            <button type="submit" className="btn btn-primary btn-full">Simpan</button>
                            <button type="button" className="btn btn-secondary btn-full" onClick={() => setShowNote(false)}>Batal</button>
                        </form>
                    </div>
                </div>
            )}

            {showAppt && (
                <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowAppt(false); }}>
                    <div className="bottom-sheet">
                        <div className="sheet-handle" />
                        <h2>📅 Buat Appointment</h2>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: 16 }}>Client: <strong>{lead.name}</strong></p>
                        <form onSubmit={handleAddAppt} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            <div className="input-group"><label>Tanggal</label><input type="date" className="input-field" value={appt.date} onChange={(e) => setAppt({ ...appt, date: e.target.value })} required /></div>
                            <div className="input-group"><label>Waktu</label><input type="time" className="input-field" value={appt.time} onChange={(e) => setAppt({ ...appt, time: e.target.value })} required /></div>
                            <div className="input-group"><label>Lokasi</label><input type="text" className="input-field" placeholder="Contoh: BSD City, Tangerang" value={appt.location} onChange={(e) => setAppt({ ...appt, location: e.target.value })} required /></div>
                            <div className="input-group"><label>Catatan</label><textarea className="input-field" placeholder="Catatan tambahan..." rows={3} value={appt.notes} onChange={(e) => setAppt({ ...appt, notes: e.target.value })} style={{ resize: 'vertical' }} /></div>
                            <button type="submit" className="btn btn-primary btn-full">📅 Buat Jadwal</button>
                            <button type="button" className="btn btn-secondary btn-full" onClick={() => setShowAppt(false)}>Batal</button>
                        </form>
                    </div>
                </div>
            )}

            {showReassign && (
                <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowReassign(false); }}>
                    <div className="bottom-sheet">
                        <div className="sheet-handle" />
                        <h2>👨‍💼 Assign ke Sales</h2>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {salesUsers.map(s => (
                                <button key={s.id} className={`btn ${s.id === lead.assignedTo ? 'btn-primary' : 'btn-secondary'} btn-full`}
                                    onClick={() => { updateLead(lead.id, { assignedTo: s.id }); setShowReassign(false); }}>
                                    {s.name} {s.id === lead.assignedTo && '✓'}
                                </button>
                            ))}
                            <button className="btn btn-secondary btn-full" onClick={() => setShowReassign(false)} style={{ marginTop: 8 }}>Batal</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
