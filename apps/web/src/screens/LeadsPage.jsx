'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../context/AuthContext';
import { useLeads } from '../context/LeadsContext';
import {
    APPOINTMENT_TAGS,
    FLOW_STATUSES,
    RESULT_STATUSES,
    SALES_STATUSES,
    getAppointmentTagLabel,
    getFlowStatusLabel,
    getResultStatusLabel,
    getSalesStatusLabel,
    getTimeAgo,
} from '../constants/crm';
import Header from '../components/Header';

function matchesLeadFilters(lead, filters) {
    if (filters.flowStatus !== 'all' && lead.flowStatus !== filters.flowStatus) {
        return false;
    }

    if (filters.salesStatus !== 'all' && lead.salesStatus !== filters.salesStatus) {
        return false;
    }

    if (filters.resultStatus !== 'all' && lead.resultStatus !== filters.resultStatus) {
        return false;
    }

    if (filters.appointmentTag !== 'all' && (lead.appointmentTag || 'none') !== filters.appointmentTag) {
        return false;
    }

    if (filters.salesId !== 'all' && lead.assignedTo !== filters.salesId) {
        return false;
    }

    return true;
}

function isLeadInDateRange(lead, dateFrom, dateTo) {
    if (!dateFrom && !dateTo) {
        return true;
    }

    const createdAt = new Date(lead.createdAt);
    if (Number.isNaN(createdAt.getTime())) {
        return false;
    }

    if (dateFrom) {
        const startDate = new Date(`${dateFrom}T00:00:00`);
        if (createdAt < startDate) {
            return false;
        }
    }

    if (dateTo) {
        const endDate = new Date(`${dateTo}T23:59:59.999`);
        if (createdAt > endDate) {
            return false;
        }
    }

    return true;
}

export default function LeadsPage() {
    const { user, isAdmin } = useAuth();
    const { getLeadsForUser, addLead, getSalesUsers, refreshLeads } = useLeads();
    const router = useRouter();
    const [refreshing, setRefreshing] = useState(false);
    const [search, setSearch] = useState('');
    const [flowFilter, setFlowFilter] = useState('all');
    const [salesStatusFilter, setSalesStatusFilter] = useState('all');
    const [resultFilter, setResultFilter] = useState('all');
    const [appointmentFilter, setAppointmentFilter] = useState('all');
    const [salesFilter, setSalesFilter] = useState('all');
    const [showAddModal, setShowAddModal] = useState(false);
    const [showExportModal, setShowExportModal] = useState(false);
    const [newLead, setNewLead] = useState({ name: '', phone: '', source: 'Manual Input', assignedTo: '' });
    const [submitLoading, setSubmitLoading] = useState(false);
    const [submitError, setSubmitError] = useState('');
    const [exporting, setExporting] = useState(false);
    const [exportError, setExportError] = useState('');
    const [exportFilters, setExportFilters] = useState({
        dateFrom: '',
        dateTo: '',
        flowStatus: 'all',
        salesStatus: 'all',
        appointmentTag: 'all',
        resultStatus: 'all',
        salesId: 'all',
    });

    const allLeads = getLeadsForUser(user.id, user.role);
    const salesUsers = getSalesUsers();
    const getSalesNameById = (salesId) => salesUsers.find((item) => item.id === salesId)?.name || 'Unassigned';

    const filteredLeads = useMemo(() => {
        return allLeads.filter((lead) => {
            if (search) {
                const q = search.toLowerCase();
                if (!lead.name.toLowerCase().includes(q) && !lead.phone.includes(q)) return false;
            }

            return matchesLeadFilters(lead, {
                flowStatus: flowFilter,
                salesStatus: salesStatusFilter,
                resultStatus: resultFilter,
                appointmentTag: appointmentFilter,
                salesId: salesFilter,
            });
        }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }, [allLeads, appointmentFilter, flowFilter, resultFilter, salesFilter, salesStatusFilter, search]);

    const exportLeads = useMemo(() => {
        return allLeads.filter((lead) => {
            if (!matchesLeadFilters(lead, exportFilters)) {
                return false;
            }

            return isLeadInDateRange(lead, exportFilters.dateFrom, exportFilters.dateTo);
        }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }, [allLeads, exportFilters]);

    const handleAddLead = async (e) => {
        e.preventDefault();
        if (!newLead.name || !newLead.phone) return;
        setSubmitLoading(true);
        setSubmitError('');
        try {
            await addLead({
                name: newLead.name,
                phone: newLead.phone,
                source: newLead.source || 'Manual Input',
                assignedTo: newLead.assignedTo || null,
            });
            setNewLead({ name: '', phone: '', source: 'Manual Input', assignedTo: '' });
            setShowAddModal(false);
        } catch (err) {
            setSubmitError(err instanceof Error ? err.message : 'Failed adding lead');
        } finally {
            setSubmitLoading(false);
        }
    };

    const handleRefresh = async () => {
        setRefreshing(true);
        try {
            await refreshLeads();
        } finally {
            setRefreshing(false);
        }
    };

    const openExportModal = () => {
        setExportError('');
        setExportFilters({
            dateFrom: '',
            dateTo: '',
            flowStatus: flowFilter,
            salesStatus: salesStatusFilter,
            appointmentTag: appointmentFilter,
            resultStatus: resultFilter,
            salesId: salesFilter,
        });
        setShowExportModal(true);
    };

    const handleExportLeads = async (event) => {
        event.preventDefault();

        if (exportLeads.length === 0) {
            setExportError('Tidak ada data leads untuk filter export yang dipilih.');
            return;
        }

        setExporting(true);
        setExportError('');
        try {
            const ExcelJS = await import('exceljs');
            const workbook = new ExcelJS.Workbook();
            workbook.creator = 'Property Lounge CRM';
            workbook.created = new Date();
            const worksheet = workbook.addWorksheet('Leads');

            worksheet.columns = [
                { header: 'No', key: 'no', width: 6 },
                { header: 'Lead ID', key: 'id', width: 34 },
                { header: 'Nama', key: 'name', width: 28 },
                { header: 'Nomor WhatsApp', key: 'phone', width: 20 },
                { header: 'Sumber', key: 'source', width: 24 },
                { header: 'Flow Status', key: 'flowStatus', width: 14 },
                { header: 'Sales Status', key: 'salesStatus', width: 16 },
                { header: 'Appointment', key: 'appointmentTag', width: 16 },
                { header: 'Result', key: 'resultStatus', width: 14 },
                { header: 'Domisili', key: 'domicileCity', width: 20 },
                { header: 'Assigned Sales', key: 'salesName', width: 24 },
                { header: 'Tanggal Masuk', key: 'createdAt', width: 22 },
            ];

            worksheet.getRow(1).font = { bold: true };

            exportLeads.forEach((lead, index) => {
                const createdAt = new Date(lead.createdAt);
                worksheet.addRow({
                    no: index + 1,
                    id: lead.id,
                    name: lead.name || '-',
                    phone: lead.phone || '-',
                    source: lead.source || '-',
                    flowStatus: getFlowStatusLabel(lead.flowStatus),
                    salesStatus: lead.salesStatus ? getSalesStatusLabel(lead.salesStatus) : '-',
                    appointmentTag: lead.appointmentTag && lead.appointmentTag !== 'none'
                        ? getAppointmentTagLabel(lead.appointmentTag)
                        : '-',
                    resultStatus: lead.resultStatus ? getResultStatusLabel(lead.resultStatus) : '-',
                    domicileCity: lead.domicileCity || '-',
                    salesName: getSalesNameById(lead.assignedTo),
                    createdAt: Number.isNaN(createdAt.getTime())
                        ? String(lead.createdAt || '-')
                        : createdAt.toLocaleString('id-ID'),
                });
            });

            const buffer = await workbook.xlsx.writeBuffer();
            const blob = new Blob(
                [buffer],
                { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }
            );
            const url = window.URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            const dateTag = new Date().toISOString().slice(0, 10);
            anchor.href = url;
            anchor.download = `leads-export-${dateTag}.xlsx`;
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
            window.URL.revokeObjectURL(url);
            setShowExportModal(false);
        } catch (err) {
            setExportError(err instanceof Error ? err.message : 'Gagal export XLSX');
        } finally {
            setExporting(false);
        }
    };

    return (
        <div className="page-container">
            <Header
                title="Leads"
                rightAction={(
                    <>
                        <button className="btn btn-sm btn-secondary" onClick={() => void handleRefresh()} disabled={refreshing}>
                            {refreshing ? 'Loading...' : 'Refresh'}
                        </button>
                        <button className="btn btn-sm btn-primary" onClick={openExportModal}>
                            Export
                        </button>
                    </>
                )}
            />
            <div className="input-icon-wrapper" style={{ marginBottom: 12 }}>
                <span className="input-icon">🔍</span>
                <input type="text" className="input-field" placeholder="Cari nama atau no. WA..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>

            <div className="filter-pills" style={{ marginBottom: 8 }}>
                <button className={`filter-pill ${flowFilter === 'all' ? 'active' : ''}`} onClick={() => setFlowFilter('all')}>Distribusi: Semua</button>
                {FLOW_STATUSES.map((item) => (
                    <button key={item.key} className={`filter-pill ${flowFilter === item.key ? 'active' : ''}`} onClick={() => setFlowFilter(item.key)}>{item.label}</button>
                ))}
            </div>

            <div className="filter-pills" style={{ marginBottom: 8 }}>
                <button className={`filter-pill ${salesStatusFilter === 'all' ? 'active' : ''}`} onClick={() => setSalesStatusFilter('all')}>Sales Status: All</button>
                {SALES_STATUSES.map((item) => (
                    <button key={item.key} className={`filter-pill ${salesStatusFilter === item.key ? 'active' : ''}`} onClick={() => setSalesStatusFilter(item.key)}>{item.label}</button>
                ))}
            </div>

            <div className="filter-pills" style={{ marginBottom: 8 }}>
                <button className={`filter-pill ${appointmentFilter === 'all' ? 'active' : ''}`} onClick={() => setAppointmentFilter('all')}>Appointment: All</button>
                {APPOINTMENT_TAGS.map((item) => (
                    <button key={item.key} className={`filter-pill ${appointmentFilter === item.key ? 'active' : ''}`} onClick={() => setAppointmentFilter(item.key)}>{item.label}</button>
                ))}
            </div>

            <div className="filter-pills" style={{ marginBottom: 12 }}>
                <button className={`filter-pill ${resultFilter === 'all' ? 'active' : ''}`} onClick={() => setResultFilter('all')}>Result: All</button>
                {RESULT_STATUSES.map((item) => (
                    <button key={item.key} className={`filter-pill ${resultFilter === item.key ? 'active' : ''}`} onClick={() => setResultFilter(item.key)}>{item.label}</button>
                ))}
            </div>

            {isAdmin && (
                <div className="filter-pills" style={{ marginBottom: 16 }}>
                    <button className={`filter-pill ${salesFilter === 'all' ? 'active' : ''}`} onClick={() => setSalesFilter('all')}>Semua Sales</button>
                    {salesUsers.map((sales) => (
                        <button key={sales.id} className={`filter-pill ${salesFilter === sales.id ? 'active' : ''}`} onClick={() => setSalesFilter(sales.id)}>{sales.name.split(' ')[0]}</button>
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
                ) : filteredLeads.map((lead) => (
                    <div key={lead.id} className="card card-clickable leads-card" onClick={() => router.push(`/leads/${lead.id}`)}>
                        <div className="leads-card-header">
                            <div className="leads-card-info" style={{ flexWrap: 'wrap' }}>
                                <span className={`badge ${lead.flowStatus === 'assigned' ? 'badge-success' : 'badge-purple'}`}>{getFlowStatusLabel(lead.flowStatus)}</span>
                                {lead.salesStatus ? <span className="badge badge-neutral">{getSalesStatusLabel(lead.salesStatus)}</span> : null}
                                {lead.resultStatus ? <span className="badge badge-neutral">{getResultStatusLabel(lead.resultStatus)}</span> : null}
                                {lead.appointmentTag && lead.appointmentTag !== 'none' ? <span className="badge badge-warm">{getAppointmentTagLabel(lead.appointmentTag)}</span> : null}
                                <span className="leads-card-name">{lead.name}</span>
                            </div>
                            <span className="leads-card-time">{getTimeAgo(lead.createdAt)}</span>
                        </div>
                        <div className="leads-card-details">
                            <span>📱 {lead.phone}</span>
                            <span>📣 {lead.source}</span>
                            {lead.domicileCity ? <span>🏙️ {lead.domicileCity}</span> : null}
                        </div>
                        {isAdmin ? <div className="leads-card-sales">Sales: {getSalesNameById(lead.assignedTo)}</div> : null}
                    </div>
                ))}
            </div>

            <button className="fab" onClick={() => setShowAddModal(true)}>＋</button>

            {showAddModal && (
                <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowAddModal(false); }}>
                    <div className="bottom-sheet">
                        <div className="sheet-handle" />
                        <h2>Tambah Lead Baru</h2>
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
                                <input type="text" className="input-field" placeholder="Meta Ads - Kampanye" value={newLead.source} onChange={(e) => setNewLead({ ...newLead, source: e.target.value })} />
                            </div>
                            {isAdmin && (
                                <div className="input-group">
                                    <label>Assign ke Sales (opsional)</label>
                                    <select className="input-field" value={newLead.assignedTo} onChange={(e) => setNewLead({ ...newLead, assignedTo: e.target.value })}>
                                        <option value="">Biarkan Open</option>
                                        {salesUsers.map((sales) => <option key={sales.id} value={sales.id}>{sales.name}</option>)}
                                    </select>
                                </div>
                            )}
                            {submitError ? <div className="login-error">{submitError}</div> : null}
                            <button type="submit" className="btn btn-primary btn-full" disabled={submitLoading}>
                                {submitLoading ? 'Menyimpan...' : 'Tambah Lead'}
                            </button>
                            <button type="button" className="btn btn-secondary btn-full" onClick={() => setShowAddModal(false)}>Batal</button>
                        </form>
                    </div>
                </div>
            )}

            {showExportModal && (
                <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowExportModal(false); }}>
                    <div className="bottom-sheet">
                        <div className="sheet-handle" />
                        <h2>Export Leads (XLSX)</h2>
                        <form onSubmit={handleExportLeads} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                            <div className="input-group">
                                <label>Tanggal Masuk (Dari - Sampai)</label>
                                <div style={{ display: 'grid', gap: 8, gridTemplateColumns: '1fr 1fr' }}>
                                    <input
                                        type="date"
                                        className="input-field"
                                        value={exportFilters.dateFrom}
                                        onChange={(e) => setExportFilters((prev) => ({ ...prev, dateFrom: e.target.value }))}
                                    />
                                    <input
                                        type="date"
                                        className="input-field"
                                        value={exportFilters.dateTo}
                                        onChange={(e) => setExportFilters((prev) => ({ ...prev, dateTo: e.target.value }))}
                                    />
                                </div>
                            </div>

                            <div className="input-group">
                                <label>Status Distribusi</label>
                                <select
                                    className="input-field"
                                    value={exportFilters.flowStatus}
                                    onChange={(e) => setExportFilters((prev) => ({ ...prev, flowStatus: e.target.value }))}
                                >
                                    <option value="all">Semua</option>
                                    {FLOW_STATUSES.map((item) => (
                                        <option key={item.key} value={item.key}>{item.label}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="input-group">
                                <label>Sales Status</label>
                                <select
                                    className="input-field"
                                    value={exportFilters.salesStatus}
                                    onChange={(e) => setExportFilters((prev) => ({ ...prev, salesStatus: e.target.value }))}
                                >
                                    <option value="all">Semua</option>
                                    {SALES_STATUSES.map((item) => (
                                        <option key={item.key} value={item.key}>{item.label}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="input-group">
                                <label>Status Appointment</label>
                                <select
                                    className="input-field"
                                    value={exportFilters.appointmentTag}
                                    onChange={(e) => setExportFilters((prev) => ({ ...prev, appointmentTag: e.target.value }))}
                                >
                                    <option value="all">Semua</option>
                                    <option value="none">Belum Ada</option>
                                    {APPOINTMENT_TAGS.map((item) => (
                                        <option key={item.key} value={item.key}>{item.label}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="input-group">
                                <label>Result Status</label>
                                <select
                                    className="input-field"
                                    value={exportFilters.resultStatus}
                                    onChange={(e) => setExportFilters((prev) => ({ ...prev, resultStatus: e.target.value }))}
                                >
                                    <option value="all">Semua</option>
                                    {RESULT_STATUSES.map((item) => (
                                        <option key={item.key} value={item.key}>{item.label}</option>
                                    ))}
                                </select>
                            </div>

                            {isAdmin ? (
                                <div className="input-group">
                                    <label>Sales</label>
                                    <select
                                        className="input-field"
                                        value={exportFilters.salesId}
                                        onChange={(e) => setExportFilters((prev) => ({ ...prev, salesId: e.target.value }))}
                                    >
                                        <option value="all">Semua Sales</option>
                                        {salesUsers.map((sales) => (
                                            <option key={sales.id} value={sales.id}>{sales.name}</option>
                                        ))}
                                    </select>
                                </div>
                            ) : null}

                            <p className="leads-result-count" style={{ marginBottom: 0 }}>
                                {exportLeads.length} leads akan diexport
                            </p>

                            {exportError ? <div className="login-error">{exportError}</div> : null}

                            <button type="submit" className="btn btn-primary btn-full" disabled={exporting}>
                                {exporting ? 'Exporting...' : 'Export XLSX'}
                            </button>
                            <button type="button" className="btn btn-secondary btn-full" onClick={() => setShowExportModal(false)}>
                                Batal
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
