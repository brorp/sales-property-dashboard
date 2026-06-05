'use client';

import { useEffect, useState } from 'react';
import {
    APPOINTMENT_TAGS,
    FLOW_STATUSES,
    RESULT_STATUSES,
    SALES_STATUSES,
} from '../constants/crm';
import DateRangePicker from './DateRangePicker';
import { DATE_PRESET_OPTIONS, getPresetRange } from '../utils/datePresets';

function parseDateStr(value) {
    if (!value) return null;
    const [y, m, d] = String(value).split('-').map(Number);
    if (!y || !m || !d) return null;
    const date = new Date(y, m - 1, d);
    return Number.isNaN(date.getTime()) ? null : date;
}

function formatDateTrigger(value) {
    const fmt = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
    const d = parseDateStr(value);
    return d ? fmt.format(d) : '';
}

const SPECIAL_SALES_STATUS_FILTERS = [
    { key: 'hot_validated', label: 'HOT | Validated' },
];
const DISTRIBUTION_FILTER_OPTIONS = [
    { key: 'unassigned', label: 'Unassigned' },
    ...FLOW_STATUSES,
];

export default function FilterBottomSheet({
    open,
    onClose,
    onApply,
    // initial / applied values (read-only, used to seed draft on open)
    flowFilter,
    salesStatusFilter,
    appointmentFilter,
    resultFilter,
    sourceFilter,
    salesFilter,
    incompleteDataFilter,
    dateFrom,
    dateTo,
    availableLeadSources,
    salesUsers,
    isAdmin,
}) {
    // ── Draft state ────────────────────────────────────────────────────────────
    const [draftFlow, setDraftFlow] = useState(flowFilter);
    const [draftSalesStatus, setDraftSalesStatus] = useState(salesStatusFilter);
    const [draftAppointment, setDraftAppointment] = useState(appointmentFilter);
    const [draftResult, setDraftResult] = useState(resultFilter);
    const [draftSource, setDraftSource] = useState(sourceFilter);
    const [draftSales, setDraftSales] = useState(salesFilter);
    const [draftIncomplete, setDraftIncomplete] = useState(incompleteDataFilter);
    const [draftDateFrom, setDraftDateFrom] = useState(dateFrom);
    const [draftDateTo, setDraftDateTo] = useState(dateTo);
    const [datePickerOpen, setDatePickerOpen] = useState(false);

    // Re-seed draft from applied values every time the sheet opens
    useEffect(() => {
        if (open) {
            setDraftFlow(flowFilter);
            setDraftSalesStatus(salesStatusFilter);
            setDraftAppointment(appointmentFilter);
            setDraftResult(resultFilter);
            setDraftSource(sourceFilter);
            setDraftSales(salesFilter);
            setDraftIncomplete(incompleteDataFilter);
            setDraftDateFrom(dateFrom);
            setDraftDateTo(dateTo);
            setDatePickerOpen(false);
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        return () => { document.body.style.overflow = ''; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    if (!open) return null;

    // ── Derived ────────────────────────────────────────────────────────────────
    const draftActiveCount = [
        draftFlow !== 'all',
        draftSalesStatus !== 'all',
        draftAppointment !== 'all',
        draftResult !== 'all',
        draftSource !== 'all',
        draftSales !== 'all',
        draftIncomplete,
        Boolean(draftDateFrom || draftDateTo),
    ].filter(Boolean).length;

    // ── Handlers ───────────────────────────────────────────────────────────────
    const handleDateChange = (range) => {
        setDraftDateFrom(range.dateFrom);
        setDraftDateTo(range.dateTo);
        if (range.dateFrom && range.dateTo) setDatePickerOpen(false);
    };

    const handleReset = () => {
        setDraftFlow('all');
        setDraftSalesStatus('all');
        setDraftAppointment('all');
        setDraftResult('all');
        setDraftSource('all');
        setDraftSales('all');
        setDraftIncomplete(false);
        setDraftDateFrom('');
        setDraftDateTo('');
        setDatePickerOpen(false);
    };

    const handleApply = () => {
        onApply({
            flowFilter: draftFlow,
            salesStatusFilter: draftSalesStatus,
            appointmentFilter: draftAppointment,
            resultFilter: draftResult,
            sourceFilter: draftSource,
            salesFilter: draftSales,
            incompleteDataFilter: draftIncomplete,
            dateFrom: draftDateFrom,
            dateTo: draftDateTo,
        });
    };

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
                    {/* ── Tanggal ── */}
                    <div className="fbs-group">
                        <span className="fbs-group-label">Tanggal Masuk</span>
                        <div className="fbs-pills" style={{ marginBottom: 8 }}>
                            {DATE_PRESET_OPTIONS.map((r) => {
                                const range = getPresetRange(r.value);
                                const isActive = range.dateFrom === draftDateFrom && range.dateTo === draftDateTo;
                                return (
                                    <button
                                        key={r.value}
                                        type="button"
                                        className={`fbs-pill${isActive ? ' is-active' : ''}`}
                                        onClick={() => { setDraftDateFrom(range.dateFrom); setDraftDateTo(range.dateTo); setDatePickerOpen(false); }}
                                    >
                                        {r.label}
                                    </button>
                                );
                            })}
                        </div>
                        <div className="fbs-date-range">
                            <div className="fbs-date-field">
                                <span className="fbs-date-field-label">Dari</span>
                                <button
                                    type="button"
                                    className="fbs-date-range-input"
                                    onClick={() => setDatePickerOpen((v) => !v)}
                                >
                                    {draftDateFrom ? formatDateTrigger(draftDateFrom) : 'Pilih tanggal'}
                                </button>
                            </div>
                            <div className="fbs-date-range-arrow">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="5 12 19 12"/>
                                    <polyline points="12 5 19 12 12 19"/>
                                </svg>
                            </div>
                            <div className="fbs-date-field">
                                <span className="fbs-date-field-label">Sampai</span>
                                <button
                                    type="button"
                                    className="fbs-date-range-input"
                                    onClick={() => setDatePickerOpen((v) => !v)}
                                >
                                    {draftDateTo ? formatDateTrigger(draftDateTo) : 'Pilih tanggal'}
                                </button>
                            </div>
                        </div>
                        {datePickerOpen ? (
                            <div className="fbs-date-picker-wrap">
                                <DateRangePicker
                                    dateFrom={draftDateFrom}
                                    dateTo={draftDateTo}
                                    onChange={handleDateChange}
                                />
                            </div>
                        ) : null}
                    </div>

                    {/* ── Sales Status ── */}
                    <div className="fbs-group">
                        <span className="fbs-group-label">Sales Status</span>
                        <div className="fbs-pills">
                            <button type="button" className={`fbs-pill${draftSalesStatus === 'all' ? ' is-active' : ''}`} onClick={() => setDraftSalesStatus('all')}>Semua</button>
                            {SPECIAL_SALES_STATUS_FILTERS.map((item) => (
                                <button type="button" key={item.key} className={`fbs-pill${draftSalesStatus === item.key ? ' is-active' : ''}`} onClick={() => setDraftSalesStatus(item.key)}>{item.label}</button>
                            ))}
                            {SALES_STATUSES.map((item) => (
                                <button type="button" key={item.key} className={`fbs-pill${draftSalesStatus === item.key ? ' is-active' : ''}`} onClick={() => setDraftSalesStatus(item.key)}>{item.label}</button>
                            ))}
                        </div>
                    </div>

                    {/* ── Appointment ── */}
                    <div className="fbs-group">
                        <span className="fbs-group-label">Appointment</span>
                        <div className="fbs-pills">
                            <button type="button" className={`fbs-pill${draftAppointment === 'all' ? ' is-active' : ''}`} onClick={() => setDraftAppointment('all')}>Semua</button>
                            {APPOINTMENT_TAGS.map((item) => (
                                <button type="button" key={item.key} className={`fbs-pill${draftAppointment === item.key ? ' is-active' : ''}`} onClick={() => setDraftAppointment(item.key)}>{item.label}</button>
                            ))}
                        </div>
                    </div>

                    {/* ── Result ── */}
                    <div className="fbs-group">
                        <span className="fbs-group-label">Result</span>
                        <div className="fbs-pills">
                            <button type="button" className={`fbs-pill${draftResult === 'all' ? ' is-active' : ''}`} onClick={() => setDraftResult('all')}>Semua</button>
                            {RESULT_STATUSES.map((item) => (
                                <button type="button" key={item.key} className={`fbs-pill${draftResult === item.key ? ' is-active' : ''}`} onClick={() => setDraftResult(item.key)}>{item.label}</button>
                            ))}
                        </div>
                    </div>

                    {/* ── Source ── */}
                    <div className="fbs-group">
                        <span className="fbs-group-label">Source</span>
                        <select className="fbs-select" value={draftSource} onChange={(e) => setDraftSource(e.target.value)}>
                            <option value="all">Semua Source</option>
                            {availableLeadSources.map((value) => (
                                <option key={value} value={value}>{value}</option>
                            ))}
                        </select>
                    </div>

                    {/* ── Sales (admin only) ── */}
                    {isAdmin ? (
                        <div className="fbs-group">
                            <span className="fbs-group-label">Sales</span>
                            <div className="fbs-pills">
                                <button type="button" className={`fbs-pill${draftSales === 'all' ? ' is-active' : ''}`} onClick={() => setDraftSales('all')}>Semua</button>
                                {salesUsers.map((sales) => (
                                    <button type="button" key={sales.id} className={`fbs-pill${draftSales === sales.id ? ' is-active' : ''}`} onClick={() => setDraftSales(sales.id)}>{sales.name.split(' ')[0]}</button>
                                ))}
                            </div>
                        </div>
                    ) : null}

                    {/* ── Status Distribusi ── */}
                    <div className="fbs-group">
                        <span className="fbs-group-label">Status Distribusi</span>
                        <div className="fbs-pills">
                            <button type="button" className={`fbs-pill${draftFlow === 'all' ? ' is-active' : ''}`} onClick={() => setDraftFlow('all')}>Semua</button>
                            {DISTRIBUTION_FILTER_OPTIONS.map((item) => (
                                <button type="button" key={item.key} className={`fbs-pill${draftFlow === item.key ? ' is-active' : ''}`} onClick={() => setDraftFlow(item.key)}>{item.label}</button>
                            ))}
                        </div>
                    </div>

                    {/* ── Data ── */}
                    <div className="fbs-group">
                        <span className="fbs-group-label">Data</span>
                        <div className="fbs-pills">
                            <button type="button" className={`fbs-pill${!draftIncomplete ? ' is-active' : ''}`} onClick={() => setDraftIncomplete(false)}>Semua Data</button>
                            <button type="button" className={`fbs-pill fbs-pill-danger${draftIncomplete ? ' is-active' : ''}`} onClick={() => setDraftIncomplete(true)}>Incomplete Data</button>
                        </div>
                    </div>
                </div>

                <div className="fbs-footer">
                    <button type="button" className="fbs-btn-reset" onClick={handleReset} disabled={draftActiveCount === 0}>
                        Reset {draftActiveCount > 0 ? `(${draftActiveCount})` : ''}
                    </button>
                    <button type="button" className="fbs-btn-apply" onClick={handleApply}>
                        Terapkan
                    </button>
                </div>
            </div>
        </>
    );
}
