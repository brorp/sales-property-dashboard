'use client';

import { useEffect } from 'react';
import {
    APPOINTMENT_TAGS,
    FLOW_STATUSES,
    RESULT_STATUSES,
    SALES_STATUSES,
} from '../constants/crm';

const SPECIAL_SALES_STATUS_FILTERS = [
    { key: 'hot_validated', label: 'HOT | Validated' },
];

export default function FilterBottomSheet({
    open,
    onClose,
    onApply,
    dateFrom, dateTo,
    onDateFromChange, onDateToChange,
    quickRanges, onQuickRange, onClearDate,
    flowFilter, setFlowFilter,
    salesStatusFilter, setSalesStatusFilter,
    appointmentFilter, setAppointmentFilter,
    resultFilter, setResultFilter,
    sourceFilter, setSourceFilter, availableLeadSources,
    salesFilter, setSalesFilter, salesUsers,
    incompleteDataFilter, setIncompleteDataFilter,
    isAdmin,
    activeFilterCount,
    onReset,
}) {
    useEffect(() => {
        if (open) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        return () => { document.body.style.overflow = ''; };
    }, [open]);

    if (!open) return null;

    return (
        <>
            <div className="fbs-backdrop" onClick={onClose} />
            <div className="fbs-sheet">
                <div className="fbs-handle-wrap">
                    <div className="fbs-handle" />
                </div>

                <div className="fbs-header">
                    <h2 className="fbs-title">Filter Leads</h2>
                    <button type="button" className="fbs-close" onClick={onClose} aria-label="Tutup">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18"/>
                            <line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                    </button>
                </div>

                <div className="fbs-body">
                    <div className="fbs-group">
                        <span className="fbs-group-label">Tanggal Masuk</span>
                        {quickRanges?.length ? (
                            <div className="fbs-pills" style={{ marginBottom: 8 }}>
                                {quickRanges.map((r) => (
                                    <button type="button" key={r.key} className="fbs-pill" onClick={() => onQuickRange(r.key)}>{r.label}</button>
                                ))}
                            </div>
                        ) : null}
                        <div className="fbs-date-range">
                            <div className="fbs-date-field">
                                <label className="fbs-date-label">Dari</label>
                                <input
                                    type="date"
                                    className="fbs-date-input"
                                    value={dateFrom || ''}
                                    onChange={(e) => onDateFromChange(e.target.value)}
                                />
                            </div>
                            <div className="fbs-date-field">
                                <label className="fbs-date-label">Sampai</label>
                                <input
                                    type="date"
                                    className="fbs-date-input"
                                    value={dateTo || ''}
                                    min={dateFrom || undefined}
                                    onChange={(e) => onDateToChange(e.target.value)}
                                />
                            </div>
                        </div>
                        {(dateFrom || dateTo) ? (
                            <button type="button" className="fbs-date-clear" onClick={onClearDate}>Hapus tanggal</button>
                        ) : null}
                    </div>

                    <div className="fbs-group">
                        <span className="fbs-group-label">Status Distribusi</span>
                        <div className="fbs-pills">
                            <button type="button" className={`fbs-pill ${flowFilter === 'all' ? 'is-active' : ''}`} onClick={() => setFlowFilter('all')}>Semua</button>
                            {FLOW_STATUSES.map((item) => (
                                <button type="button" key={item.key} className={`fbs-pill ${flowFilter === item.key ? 'is-active' : ''}`} onClick={() => setFlowFilter(item.key)}>{item.label}</button>
                            ))}
                        </div>
                    </div>

                    <div className="fbs-group">
                        <span className="fbs-group-label">Sales Status</span>
                        <div className="fbs-pills">
                            <button type="button" className={`fbs-pill ${salesStatusFilter === 'all' ? 'is-active' : ''}`} onClick={() => setSalesStatusFilter('all')}>Semua</button>
                            {SPECIAL_SALES_STATUS_FILTERS.map((item) => (
                                <button type="button" key={item.key} className={`fbs-pill ${salesStatusFilter === item.key ? 'is-active' : ''}`} onClick={() => setSalesStatusFilter(item.key)}>{item.label}</button>
                            ))}
                            {SALES_STATUSES.map((item) => (
                                <button type="button" key={item.key} className={`fbs-pill ${salesStatusFilter === item.key ? 'is-active' : ''}`} onClick={() => setSalesStatusFilter(item.key)}>{item.label}</button>
                            ))}
                        </div>
                    </div>

                    <div className="fbs-group">
                        <span className="fbs-group-label">Appointment</span>
                        <div className="fbs-pills">
                            <button type="button" className={`fbs-pill ${appointmentFilter === 'all' ? 'is-active' : ''}`} onClick={() => setAppointmentFilter('all')}>Semua</button>
                            {APPOINTMENT_TAGS.map((item) => (
                                <button type="button" key={item.key} className={`fbs-pill ${appointmentFilter === item.key ? 'is-active' : ''}`} onClick={() => setAppointmentFilter(item.key)}>{item.label}</button>
                            ))}
                        </div>
                    </div>

                    <div className="fbs-group">
                        <span className="fbs-group-label">Result</span>
                        <div className="fbs-pills">
                            <button type="button" className={`fbs-pill ${resultFilter === 'all' ? 'is-active' : ''}`} onClick={() => setResultFilter('all')}>Semua</button>
                            {RESULT_STATUSES.map((item) => (
                                <button type="button" key={item.key} className={`fbs-pill ${resultFilter === item.key ? 'is-active' : ''}`} onClick={() => setResultFilter(item.key)}>{item.label}</button>
                            ))}
                        </div>
                    </div>

                    <div className="fbs-group">
                        <span className="fbs-group-label">Source</span>
                        <select className="fbs-select" value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)}>
                            <option value="all">Semua Source</option>
                            {availableLeadSources.map((value) => (
                                <option key={value} value={value}>{value}</option>
                            ))}
                        </select>
                    </div>

                    {isAdmin ? (
                        <div className="fbs-group">
                            <span className="fbs-group-label">Sales</span>
                            <div className="fbs-pills">
                                <button type="button" className={`fbs-pill ${salesFilter === 'all' ? 'is-active' : ''}`} onClick={() => setSalesFilter('all')}>Semua</button>
                                {salesUsers.map((sales) => (
                                    <button type="button" key={sales.id} className={`fbs-pill ${salesFilter === sales.id ? 'is-active' : ''}`} onClick={() => setSalesFilter(sales.id)}>{sales.name.split(' ')[0]}</button>
                                ))}
                            </div>
                        </div>
                    ) : null}

                    <div className="fbs-group">
                        <span className="fbs-group-label">Data</span>
                        <div className="fbs-pills">
                            <button type="button" className={`fbs-pill ${!incompleteDataFilter ? 'is-active' : ''}`} onClick={() => setIncompleteDataFilter(false)}>Semua Data</button>
                            <button type="button" className={`fbs-pill fbs-pill-danger ${incompleteDataFilter ? 'is-active' : ''}`} onClick={() => setIncompleteDataFilter(true)}>Incomplete Data</button>
                        </div>
                    </div>
                </div>

                <div className="fbs-footer">
                    <button type="button" className="fbs-btn-reset" onClick={onReset} disabled={activeFilterCount === 0}>
                        Reset {activeFilterCount > 0 ? `(${activeFilterCount})` : ''}
                    </button>
                    <button type="button" className="fbs-btn-apply" onClick={onApply || onClose}>
                        Terapkan
                    </button>
                </div>
            </div>
        </>
    );
}
