import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLeads } from '../context/LeadsContext';
import { getSalesName, getTimeAgo } from '../data/mockData';
import Header from '../components/Header';
import './LeadsPage.css';

export default function LeadsPage() {
    const { user, isAdmin } = useAuth();
    const { getLeadsForUser, addLead, getSalesUsers } = useLeads();
    const navigate = useNavigate();
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [progressFilter, setProgressFilter] = useState('all');
    const [salesFilter, setSalesFilter] = useState('all');
    const [showAddModal, setShowAddModal] = useState(false);
    const [newLead, setNewLead] = useState({ name: '', phone: '', source: 'Meta Ads', assignedTo: '' });

    const allLeads = getLeadsForUser(user.id, user.role);
    const salesUsers = getSalesUsers();

    const filteredLeads = useMemo(() => {
        return allLeads.filter(l => {
            if (search) { const q = search.toLowerCase(); if (!l.name.toLowerCase().includes(q) && !l.phone.includes(q)) return false; }
            if (statusFilter !== 'all' && l.clientStatus !== statusFilter) return false;
            if (progressFilter !== 'all' && l.progress !== progressFilter) return false;
            if (salesFilter !== 'all' && l.assignedTo !== salesFilter) return false;
            return true;
        }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }, [allLeads, search, statusFilter, progressFilter, salesFilter]);

    const statusIcon = { hot: '🔥', warm: '🌡️', cold: '🧊', lost: '❌', deal: '✅' };
    const statusClass = { hot: 'badge-hot', warm: 'badge-warm', cold: 'badge-cold', lost: 'badge-danger', deal: 'badge-success' };
    const progressLabel = { new: '📥 Baru', 'follow-up': '📞 Follow-up', pending: '⏳ Pending', appointment: '📅 Appointment', rejected: '❌ Rejected', closed: '✅ Closed' };

    const handleAddLead = (e) => {
        e.preventDefault();
        if (!newLead.name || !newLead.phone) return;
        addLead({ name: newLead.name, phone: newLead.phone, source: newLead.source || 'Manual Input', assignedTo: newLead.assignedTo || user.id });
        setNewLead({ name: '', phone: '', source: 'Meta Ads', assignedTo: '' });
        setShowAddModal(false);
    };

    return (
        <div className="page-container">
            <Header title="Leads" />
            <div className="input-icon-wrapper" style={{ marginBottom: 12 }}>
                <span className="input-icon">🔍</span>
                <input type="text" className="input-field" placeholder="Cari nama atau no. WA..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>

            <div className="filter-pills" style={{ marginBottom: 8 }}>
                {[{ key: 'all', label: 'Semua' }, { key: 'hot', label: '🔥 Hot' }, { key: 'warm', label: '🌡️ Warm' }, { key: 'cold', label: '🧊 Cold' }].map(f => (
                    <button key={f.key} className={`filter-pill ${statusFilter === f.key ? 'active' : ''}`} onClick={() => setStatusFilter(f.key)}>{f.label}</button>
                ))}
            </div>

            <div className="filter-pills" style={{ marginBottom: 12 }}>
                {[{ key: 'all', label: 'All Progress' }, { key: 'new', label: '📥 New' }, { key: 'follow-up', label: '📞 Follow-up' }, { key: 'pending', label: '⏳ Pending' }, { key: 'appointment', label: '📅 Appt' }, { key: 'closed', label: '✅ Closed' }, { key: 'rejected', label: '❌ Rejected' }].map(f => (
                    <button key={f.key} className={`filter-pill ${progressFilter === f.key ? 'active' : ''}`} onClick={() => setProgressFilter(f.key)}>{f.label}</button>
                ))}
            </div>

            {isAdmin && (
                <div className="filter-pills" style={{ marginBottom: 16 }}>
                    <button className={`filter-pill ${salesFilter === 'all' ? 'active' : ''}`} onClick={() => setSalesFilter('all')}>Semua Sales</button>
                    {salesUsers.map(s => (
                        <button key={s.id} className={`filter-pill ${salesFilter === s.id ? 'active' : ''}`} onClick={() => setSalesFilter(s.id)}>👤 {s.name.split(' ')[0]}</button>
                    ))}
                </div>
            )}

            <p className="leads-result-count">{filteredLeads.length} leads ditemukan</p>

            <div className="leads-list">
                {filteredLeads.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-icon">📋</div>
                        <div className="empty-title">Tidak ada leads</div>
                        <div className="empty-desc">Coba ubah filter pencarian</div>
                    </div>
                ) : filteredLeads.map(lead => (
                    <div key={lead.id} className="card card-clickable leads-card" onClick={() => navigate(`/leads/${lead.id}`)}>
                        <div className="leads-card-header">
                            <div className="leads-card-info">
                                <span className={`badge ${statusClass[lead.clientStatus]}`}>{statusIcon[lead.clientStatus]} {lead.clientStatus}</span>
                                <span className="leads-card-name">{lead.name}</span>
                            </div>
                            <span className="leads-card-time">{getTimeAgo(lead.createdAt)}</span>
                        </div>
                        <div className="leads-card-details">
                            <span>📱 {lead.phone}</span>
                            <span>{progressLabel[lead.progress]}</span>
                        </div>
                        {isAdmin && <div className="leads-card-sales">👨‍💼 {getSalesName(lead.assignedTo)}</div>}
                    </div>
                ))}
            </div>

            <button className="fab" onClick={() => setShowAddModal(true)}>＋</button>

            {showAddModal && (
                <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowAddModal(false); }}>
                    <div className="bottom-sheet">
                        <div className="sheet-handle" />
                        <h2>➕ Tambah Lead Baru</h2>
                        <form onSubmit={handleAddLead} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            <div className="input-group">
                                <label>Nama Client</label>
                                <input type="text" className="input-field" placeholder="Nama lengkap" value={newLead.name} onChange={(e) => setNewLead({ ...newLead, name: e.target.value })} required />
                            </div>
                            <div className="input-group">
                                <label>Nomor WhatsApp</label>
                                <input type="tel" className="input-field" placeholder="08xxxxxxxxxx" value={newLead.phone} onChange={(e) => setNewLead({ ...newLead, phone: e.target.value })} required />
                            </div>
                            <div className="input-group">
                                <label>Sumber</label>
                                <input type="text" className="input-field" placeholder="Meta Ads - Kampanye..." value={newLead.source} onChange={(e) => setNewLead({ ...newLead, source: e.target.value })} />
                            </div>
                            {isAdmin && (
                                <div className="input-group">
                                    <label>Assign ke Sales</label>
                                    <select className="input-field" value={newLead.assignedTo} onChange={(e) => setNewLead({ ...newLead, assignedTo: e.target.value })}>
                                        <option value="">Pilih sales...</option>
                                        {salesUsers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                    </select>
                                </div>
                            )}
                            <button type="submit" className="btn btn-primary btn-full">Tambah Lead</button>
                            <button type="button" className="btn btn-secondary btn-full" onClick={() => setShowAddModal(false)}>Batal</button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
