'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
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
    getStatusBadgeClass,
    getTimeAgo,
} from '../constants/crm';
import Header from '../components/Header';
import CustomerPipelineProgress from '../components/CustomerPipelineProgress';
import DatePicker from '../components/DatePicker';
import FileDropZone from '../components/FileDropZone';
import DateRangePicker from '../components/DateRangePicker';
import SelectFilter from '../components/SelectFilter';
import { usePagePolling } from '../hooks/usePagePolling';
import { apiRequest } from '../lib/api';
import { readLeadTransferWorkbook } from '../lib/lead-transfer-workbook';
import UserAvatar from '../components/UserAvatar';
import './LeadsPage.css';

const QUICK_RANGES = [
    { key: 'today', label: 'Hari Ini' },
    { key: 'last7', label: '7 Hari' },
    { key: 'last30', label: '30 Hari' },
    { key: 'thisMonth', label: 'Bulan Ini' },
];
const EMPTY_DATE_RANGE = { dateFrom: '', dateTo: '' };
const SPECIAL_SALES_STATUS_FILTERS = [
    { key: 'hot_validated', label: 'HOT | Validated' },
];
const IMPORT_REASON_LABELS = {
    missing_identifier: 'Row tidak punya leadId atau phone.',
    phone_ambiguous: 'Nomor telepon cocok ke lebih dari satu lead.',
    lead_not_found: 'Lead tidak ditemukan di client target.',
    duplicate_row_for_lead: 'Lead yang sama muncul lebih dari sekali di file.',
    already_assigned_to_target: 'Lead sudah dimiliki sales target.',
    owner_changed_since_export: 'Owner lead berubah sejak file ini diexport.',
};

function parseDateInput(value) {
    if (!value) return null;
    const [year, month, day] = String(value).split('-').map(Number);
    if (!year || !month || !day) return null;
    const next = new Date(year, month - 1, day);
    return Number.isNaN(next.getTime()) ? null : next;
}

function formatDateInput(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function normalizeDateRange(range) {
    const dateFrom = range?.dateFrom || '';
    const dateTo = range?.dateTo || '';
    if (dateFrom && dateTo && dateFrom > dateTo) return { dateFrom: dateTo, dateTo: dateFrom };
    return { dateFrom, dateTo };
}

function formatRangeButtonLabel(range) {
    if (!range.dateFrom && !range.dateTo) return 'Custom';
    const formatter = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short' });
    const start = parseDateInput(range.dateFrom);
    const end = parseDateInput(range.dateTo || range.dateFrom);
    if (!start || !end) return 'Custom';
    return `${formatter.format(start)} – ${formatter.format(end)}`;
}

function formatRangeSummary(range) {
    if (!range.dateFrom && !range.dateTo) return '';
    const formatter = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
    const start = parseDateInput(range.dateFrom);
    const end = parseDateInput(range.dateTo || range.dateFrom);
    if (!start || !end) return '';
    return `${formatter.format(start)} – ${formatter.format(end)}`;
}

function getPresetRange(key) {
    const today = new Date();
    const end = formatDateInput(today);
    if (key === 'today') return { dateFrom: end, dateTo: end };
    if (key === 'last7') {
        const start = new Date(today);
        start.setDate(today.getDate() - 6);
        return { dateFrom: formatDateInput(start), dateTo: end };
    }
    if (key === 'last30') {
        const start = new Date(today);
        start.setDate(today.getDate() - 29);
        return { dateFrom: formatDateInput(start), dateTo: end };
    }
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    return { dateFrom: formatDateInput(start), dateTo: end };
}


function isAgentSource(value) {
    return String(value || '').trim().toLowerCase() === 'agent';
}

function matchesResultStatusFilter(actualValue, selectedValue) {
    if (selectedValue === 'all') return true;
    if (selectedValue === 'cancel' || selectedValue === 'cancel_transaksi') {
        return actualValue === 'cancel_transaksi' || actualValue === 'cancel' || actualValue === 'cancel_minat';
    }
    return actualValue === selectedValue;
}

function matchesResultStatusMultiFilter(selectedValues, actualValue, fallbackValue = 'unfilled') {
    if (!Array.isArray(selectedValues) || selectedValues.length === 0) return true;
    if (selectedValues.includes('cancel_transaksi') && (actualValue === 'cancel' || actualValue === 'cancel_transaksi')) return true;
    return selectedValues.includes(actualValue ?? fallbackValue);
}

function matchesMultiValueFilter(selectedValues, actualValue, fallbackValue = '') {
    if (!Array.isArray(selectedValues) || selectedValues.length === 0) return true;
    return selectedValues.includes(actualValue ?? fallbackValue);
}

function isHotValidatedLead(lead) {
    return lead?.salesStatus === 'hot' && Boolean(lead?.validated);
}

function matchesLeadFilters(lead, filters) {
    if (filters.flowStatus !== 'all' && lead.flowStatus !== filters.flowStatus) return false;
    if (filters.salesStatus === 'hot_validated') {
        if (!isHotValidatedLead(lead)) return false;
    } else if (filters.salesStatus !== 'all' && lead.salesStatus !== filters.salesStatus) return false;
    if (!matchesResultStatusFilter(lead.resultStatus, filters.resultStatus)) return false;
    if (filters.appointmentTag !== 'all' && (lead.appointmentTag || 'none') !== filters.appointmentTag) return false;
    if (filters.salesId !== 'all' && lead.assignedTo !== filters.salesId) return false;
    return true;
}

function matchesLeadExportFilters(lead, filters) {
    if (filters.hotValidatedOnly && !isHotValidatedLead(lead)) return false;
    if (!matchesMultiValueFilter(filters.flowStatuses, lead.flowStatus)) return false;
    if (!matchesMultiValueFilter(filters.salesStatuses, lead.salesStatus, 'unfilled')) return false;
    if (!matchesResultStatusMultiFilter(filters.resultStatuses, lead.resultStatus, 'unfilled')) return false;
    if (!matchesMultiValueFilter(filters.appointmentTags, lead.appointmentTag || 'none')) return false;
    if (!matchesMultiValueFilter(filters.salesIds, lead.assignedTo, 'unassigned')) return false;
    return true;
}

function isLeadInDateRange(lead, dateFrom, dateTo) {
    if (!dateFrom && !dateTo) return true;
    const createdAt = new Date(lead.createdAt);
    if (Number.isNaN(createdAt.getTime())) return false;
    if (dateFrom && createdAt < new Date(`${dateFrom}T00:00:00`)) return false;
    if (dateTo && createdAt > new Date(`${dateTo}T23:59:59.999`)) return false;
    return true;
}

function toInitialExportSelection(value) {
    return value && value !== 'all' ? [value] : [];
}

export default function LeadsPage() {
    const { user, isAdmin } = useAuth();
    const { getLeadsForUser, addLead, getSalesUsers, getLeadSources, refreshLeads, refreshSalesUsers, refreshLeadSources, refreshTeamStats, refreshDashboardAnalytics } = useLeads();
    const router = useRouter();
    const searchParams = useSearchParams();

    const [refreshing, setRefreshing] = useState(false);
    const [search, setSearch] = useState('');
    const [flowFilter, setFlowFilter] = useState('all');
    const [salesStatusFilter, setSalesStatusFilter] = useState('all');
    const [resultFilter, setResultFilter] = useState(searchParams?.get('resultFilter') || 'all');
    const [appointmentFilter, setAppointmentFilter] = useState('all');
    const [salesFilter, setSalesFilter] = useState('all');
    const [sourceFilter, setSourceFilter] = useState('all');
    const [incompleteDataFilter, setIncompleteDataFilter] = useState(false);
    const [appliedDateRange, setAppliedDateRange] = useState(EMPTY_DATE_RANGE);
    const [showMobileFilter, setShowMobileFilter] = useState(false);

    const [showAddModal, setShowAddModal] = useState(false);
    const [showExportModal, setShowExportModal] = useState(false);
    const [newLead, setNewLead] = useState({ name: '', phone: '', source: '', agentOfficeName: '', assignedTo: '', createdAt: '' });
    const [agentOfficeOptions, setAgentOfficeOptions] = useState([]);
    const [addModalTab, setAddModalTab] = useState('manual');
    const [submitLoading, setSubmitLoading] = useState(false);
    const [submitError, setSubmitError] = useState('');
    const [importFileName, setImportFileName] = useState('');
    const [importFileSize, setImportFileSize] = useState(0);
    const [importRows, setImportRows] = useState([]);
    const [importTargetSalesId, setImportTargetSalesId] = useState('');
    const [importResult, setImportResult] = useState(null);
    const [importLoading, setImportLoading] = useState(false);
    const [importCommitLoading, setImportCommitLoading] = useState(false);
    const [importError, setImportError] = useState('');
    const [importSuccess, setImportSuccess] = useState('');
    const [exporting, setExporting] = useState(false);
    const [exportError, setExportError] = useState('');
    const [exportAccessCode, setExportAccessCode] = useState('');
    const [exportFilters, setExportFilters] = useState({ dateFrom: '', dateTo: '', flowStatuses: [], salesStatuses: [], hotValidatedOnly: false, appointmentTags: [], resultStatuses: [], salesIds: [] });

    useEffect(() => {
        document.body.classList.add('light-page');
        return () => document.body.classList.remove('light-page');
    }, []);

    const allLeads = getLeadsForUser(user.id, user.role);
    const salesUsers = getSalesUsers();
    const leadSources = getLeadSources();
    const getSalesNameById = (salesId) => salesUsers.find((item) => item.id === salesId)?.name || 'Unassigned';
    const canExportLeads = user?.role === 'root_admin' || user?.role === 'client_admin' || user?.role === 'admin';
    const hasActiveDateFilter = Boolean(appliedDateRange.dateFrom || appliedDateRange.dateTo);

    const isPresetActive = (key) => {
        if (!appliedDateRange.dateFrom) return false;
        const preset = getPresetRange(key);
        return appliedDateRange.dateFrom === preset.dateFrom && appliedDateRange.dateTo === preset.dateTo;
    };
    const isCustomActive = hasActiveDateFilter && !QUICK_RANGES.some((r) => isPresetActive(r.key));

    const openDatePickerRef = useRef(null);
    const activePreset = QUICK_RANGES.find((r) => isPresetActive(r.key));
    const currentDateSelectValue = hasActiveDateFilter ? (activePreset?.key ?? 'custom') : '';
    const dateSelectOptions = [
        ...QUICK_RANGES.map((r) => ({ value: r.key, label: r.label })),
        { value: 'custom', label: isCustomActive ? formatRangeButtonLabel(appliedDateRange) : 'Custom' },
    ];
    const handleDateSelectChange = (v) => {
        if (!v) { setAppliedDateRange(EMPTY_DATE_RANGE); return; }
        if (v === 'custom') { openDatePickerRef.current?.(); return; }
        setAppliedDateRange(getPresetRange(v));
    };

    const hasAnyFilter = Boolean(
        search || hasActiveDateFilter ||
        flowFilter !== 'all' || salesStatusFilter !== 'all' ||
        resultFilter !== 'all' || appointmentFilter !== 'all' ||
        salesFilter !== 'all' || sourceFilter !== 'all' || incompleteDataFilter
    );

    const activeFilterCount = [
        hasActiveDateFilter,
        flowFilter !== 'all',
        salesStatusFilter !== 'all',
        resultFilter !== 'all',
        appointmentFilter !== 'all',
        salesFilter !== 'all',
        sourceFilter !== 'all',
        incompleteDataFilter,
    ].filter(Boolean).length;

    const resetAllFilters = () => {
        setSearch('');
        setAppliedDateRange(EMPTY_DATE_RANGE);
        setFlowFilter('all');
        setSalesStatusFilter('all');
        setResultFilter('all');
        setAppointmentFilter('all');
        setSalesFilter('all');
        setSourceFilter('all');
        setIncompleteDataFilter(false);
    };

    const availableLeadSources = useMemo(() => {
        const values = new Set();
        leadSources.forEach((item) => { if (item?.value) values.add(item.value); });
        allLeads.forEach((item) => { if (item?.source) values.add(item.source); });
        return Array.from(values).sort((a, b) => a.localeCompare(b));
    }, [allLeads, leadSources]);

    const availableAgentOffices = useMemo(() => {
        const values = new Set();
        agentOfficeOptions.forEach((item) => { if (item) values.add(item); });
        allLeads.forEach((item) => { if (item?.agentOfficeName) values.add(item.agentOfficeName); });
        return Array.from(values).sort((a, b) => a.localeCompare(b));
    }, [agentOfficeOptions, allLeads]);

    const filteredLeads = useMemo(() => {
        return allLeads.filter((lead) => {
            if (search) {
                const q = search.toLowerCase();
                if (!lead.name.toLowerCase().includes(q) && !lead.phone.includes(q)) return false;
            }
            if (sourceFilter !== 'all' && lead.source !== sourceFilter) return false;
            if (!isLeadInDateRange(lead, appliedDateRange.dateFrom, appliedDateRange.dateTo)) return false;
            if (incompleteDataFilter) {
                const hasDomisili = Boolean(lead.domicileCity);
                const hasTipeUnit = Boolean(lead.interestUnitId || lead.interestUnitName);
                if (hasDomisili && hasTipeUnit) return false;
            }
            return matchesLeadFilters(lead, { flowStatus: flowFilter, salesStatus: salesStatusFilter, resultStatus: resultFilter, appointmentTag: appointmentFilter, salesId: salesFilter });
        }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }, [allLeads, appliedDateRange, appointmentFilter, flowFilter, resultFilter, salesFilter, salesStatusFilter, search, sourceFilter, incompleteDataFilter]);

    const exportLeads = useMemo(() => {
        return allLeads.filter((lead) => {
            if (!matchesLeadExportFilters(lead, exportFilters)) return false;
            return isLeadInDateRange(lead, exportFilters.dateFrom, exportFilters.dateTo);
        }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }, [allLeads, exportFilters]);

    const refreshLeadsPage = useCallback(async () => {
        await Promise.all([refreshLeads(), refreshSalesUsers(), refreshLeadSources()]);
    }, [refreshLeadSources, refreshLeads, refreshSalesUsers]);

    const loadAgentOfficeOptions = useCallback(async () => {
        if (!user) { setAgentOfficeOptions([]); return []; }
        const rows = await apiRequest('/api/lead-sources/agent-offices', { user });
        const normalized = Array.isArray(rows) ? rows : [];
        setAgentOfficeOptions(normalized);
        return normalized;
    }, [user]);

    usePagePolling({ enabled: Boolean(user), intervalMs: 3000, run: refreshLeadsPage });

    const handleAddLead = async (e) => {
        e.preventDefault();
        if (!newLead.name || !newLead.phone || !newLead.source) return;
        if (isAgentSource(newLead.source) && !newLead.agentOfficeName.trim()) {
            setSubmitError('Nama Kantor wajib diisi untuk source Agent.');
            return;
        }
        setSubmitLoading(true);
        setSubmitError('');
        try {
            await addLead({ name: newLead.name, phone: newLead.phone, source: newLead.source, agentOfficeName: isAgentSource(newLead.source) ? newLead.agentOfficeName : null, assignedTo: newLead.assignedTo || null, createdAt: newLead.createdAt || null });
            setNewLead({ name: '', phone: '', source: '', agentOfficeName: '', assignedTo: '', createdAt: '' });
            await loadAgentOfficeOptions();
            setShowAddModal(false);
            setAddModalTab('manual');
        } catch (err) {
            setSubmitError(err instanceof Error ? err.message : 'Failed adding lead');
        } finally {
            setSubmitLoading(false);
        }
    };

    const handleRefresh = async () => {
        setRefreshing(true);
        try { await refreshLeadsPage(); } finally { setRefreshing(false); }
    };

    const resetImportState = () => {
        setImportFileName(''); setImportFileSize(0); setImportRows([]); setImportTargetSalesId('');
        setImportResult(null); setImportError(''); setImportSuccess('');
        setImportLoading(false); setImportCommitLoading(false);
    };

    const openAddLeadModal = (tab = 'manual') => {
        setSubmitError(''); setImportError(''); setImportSuccess('');
        setAddModalTab(tab);
        setNewLead((prev) => ({ ...prev, source: prev.source || leadSources[0]?.value || '' }));
        void loadAgentOfficeOptions();
        setShowAddModal(true);
    };

    const closeAddLeadModal = () => {
        setShowAddModal(false); setAddModalTab('manual');
        setSubmitLoading(false); setSubmitError('');
        resetImportState();
    };

    const handleImportFile = async (file) => {
        if (!file) { resetImportState(); return; }
        try {
            setImportLoading(true);
            setImportResult(null); setImportError(''); setImportSuccess('');
            const parsed = await readLeadTransferWorkbook(file);
            setImportFileName(parsed.fileName || file.name || 'leads-import.xlsx');
            setImportFileSize(file.size || 0);
            setImportRows(Array.isArray(parsed.rows) ? parsed.rows : []);
        } catch (err) {
            setImportError(err instanceof Error ? err.message : 'Gagal membaca file import');
            setImportFileName(''); setImportFileSize(0);
        } finally {
            setImportLoading(false);
        }
    };

    const handleCommitImport = async () => {
        if (!importRows.length || !importTargetSalesId) {
            setImportError('Pilih file XLSX export dan target sales terlebih dahulu.');
            return;
        }
        setImportCommitLoading(true); setImportError(''); setImportSuccess('');
        try {
            const result = await apiRequest('/api/leads/import-reassign/commit', { method: 'POST', user, body: { rows: importRows, targetSalesId: importTargetSalesId, fileName: importFileName || null } });
            await Promise.all([refreshLeads(), refreshSalesUsers(), refreshTeamStats(), refreshDashboardAnalytics()]);
            setImportResult(result);
            setImportSuccess(`${result.summary?.updated || 0} lead berhasil dipindahkan ke sales target.`);
        } catch (err) {
            setImportError(err instanceof Error ? err.message : 'Gagal menjalankan import reassign');
        } finally {
            setImportCommitLoading(false);
        }
    };

    const openExportModal = () => {
        setExportError(''); setExportAccessCode('');
        setExportFilters({
            dateFrom: '', dateTo: '',
            flowStatuses: toInitialExportSelection(flowFilter),
            salesStatuses: salesStatusFilter === 'hot_validated' ? ['hot'] : toInitialExportSelection(salesStatusFilter),
            hotValidatedOnly: salesStatusFilter === 'hot_validated',
            appointmentTags: toInitialExportSelection(appointmentFilter),
            resultStatuses: toInitialExportSelection(resultFilter),
            salesIds: toInitialExportSelection(salesFilter),
        });
        setShowExportModal(true);
    };

    const toggleExportSelection = (field, value) => {
        setExportFilters((prev) => {
            const currentValues = Array.isArray(prev[field]) ? prev[field] : [];
            const hasValue = currentValues.includes(value);
            return { ...prev, [field]: hasValue ? currentValues.filter((item) => item !== value) : [...currentValues, value] };
        });
    };

    const setExportSelectionGroup = (field, values) => {
        setExportFilters((prev) => ({ ...prev, [field]: values }));
    };

    const toggleSelectAll = (field, allKeys) => {
        const current = exportFilters[field];
        const allSelected = allKeys.every((k) => current.includes(k));
        setExportSelectionGroup(field, allSelected ? [] : allKeys);
    };

    const isAllSelected = (field, allKeys) => allKeys.length > 0 && allKeys.every((k) => exportFilters[field].includes(k));
    const isSomeSelected = (field, allKeys) => exportFilters[field].some((k) => allKeys.includes(k)) && !isAllSelected(field, allKeys);

    const handleExportLeads = async (event) => {
        event.preventDefault();
        if (!canExportLeads) { setExportError('Hanya admin yang bisa export leads.'); return; }
        if (exportLeads.length === 0) { setExportError('Tidak ada data leads untuk filter export yang dipilih.'); return; }
        if (!exportAccessCode.trim()) { setExportError('Access code export wajib diisi.'); return; }
        setExporting(true); setExportError('');
        try {
            await apiRequest('/api/leads/export/authorize', { method: 'POST', user, body: { accessCode: exportAccessCode.trim() } });
            const ExcelJS = await import('exceljs');
            const workbook = new ExcelJS.Workbook();
            workbook.creator = 'Property Lounge CRM';
            workbook.created = new Date();
            const worksheet = workbook.addWorksheet('Leads');
            worksheet.columns = [
                { header: 'No', key: 'no', width: 6 }, { header: 'Lead ID', key: 'id', width: 34 },
                { header: 'Nama', key: 'name', width: 28 }, { header: 'Nomor WhatsApp', key: 'phone', width: 20 },
                { header: 'Sumber', key: 'source', width: 24 }, { header: 'Flow Status', key: 'flowStatus', width: 14 },
                { header: 'Sales Status', key: 'salesStatus', width: 16 }, { header: 'Appointment', key: 'appointmentTag', width: 16 },
                { header: 'Result', key: 'resultStatus', width: 14 }, { header: 'Domisili', key: 'domicileCity', width: 20 },
                { header: 'Assigned Sales', key: 'salesName', width: 24 }, { header: 'Tanggal Masuk', key: 'createdAt', width: 22 },
            ];
            worksheet.getRow(1).font = { bold: true };
            exportLeads.forEach((lead, index) => {
                const createdAt = new Date(lead.createdAt);
                worksheet.addRow({
                    no: index + 1, id: lead.id, name: lead.name || '-', phone: lead.phone || '-',
                    source: lead.source || '-', flowStatus: getFlowStatusLabel(lead.flowStatus),
                    salesStatus: isHotValidatedLead(lead) ? 'HOT | Validated' : lead.salesStatus ? getSalesStatusLabel(lead.salesStatus) : '-',
                    appointmentTag: lead.appointmentTag && lead.appointmentTag !== 'none' ? getAppointmentTagLabel(lead.appointmentTag) : '-',
                    resultStatus: lead.resultStatus ? getResultStatusLabel(lead.resultStatus) : '-',
                    domicileCity: lead.domicileCity || '-', salesName: getSalesNameById(lead.assignedTo),
                    createdAt: Number.isNaN(createdAt.getTime()) ? String(lead.createdAt || '-') : createdAt.toLocaleString('id-ID'),
                });
            });
            const buffer = await workbook.xlsx.writeBuffer();
            const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            const url = window.URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            const dateTag = new Date().toISOString().slice(0, 10);
            anchor.href = url; anchor.download = `leads-export-${dateTag}.xlsx`;
            document.body.appendChild(anchor); anchor.click(); anchor.remove();
            window.URL.revokeObjectURL(url);
            setShowExportModal(false); setExportAccessCode('');
        } catch (err) {
            setExportError(err instanceof Error ? err.message : 'Gagal export XLSX');
        } finally {
            setExporting(false);
        }
    };

    return (
        <div className="page-container dash-page leads-page">
            <Header
                title="Leads"
                rightAction={(
                    <>
                        <button className="btn btn-sm btn-secondary btn-icon-refresh" onClick={() => void handleRefresh()} disabled={refreshing} title="Refresh">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /></svg>
                        </button>
                        {canExportLeads ? (
                            <button className="btn btn-sm btn-primary" onClick={openExportModal} title="Export">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 5 }}>
                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                    <polyline points="7 10 12 15 17 10" />
                                    <line x1="12" y1="15" x2="12" y2="3" />
                                </svg>
                                Export
                            </button>
                        ) : null}
                    </>
                )}
            />

            {/* ── Filter bar ──────────────────────────────────── */}
            <div className="leads-filter-bar">
                {/* Search row */}
                <div className="leads-search-row">
                    <div className="leads-search-wrap">
                        <svg className="leads-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                        </svg>
                        <input
                            type="text"
                            className="leads-search-input"
                            placeholder="Cari nama atau no. WA..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                        {hasAnyFilter ? (
                            <button type="button" className="leads-reset-all leads-reset-desktop-only" onClick={resetAllFilters}>
                                Reset
                            </button>
                        ) : null}
                    </div>
                    <button
                        type="button"
                        className={`leads-mobile-filter-btn${activeFilterCount > 0 ? ' is-active' : ''}`}
                        onClick={() => setShowMobileFilter(true)}
                        title="Filter"
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                        </svg>
                        {activeFilterCount > 0 ? (
                            <button
                                type="button"
                                className="leads-filter-reset-badge"
                                onClick={(e) => { e.stopPropagation(); resetAllFilters(); }}
                                title="Reset filter"
                            >
                                <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                                </svg>
                            </button>
                        ) : null}
                    </button>
                </div>

                <DateRangePicker
                    value={appliedDateRange}
                    onApply={(range) => setAppliedDateRange(normalizeDateRange(range))}
                    onReset={() => setAppliedDateRange(EMPTY_DATE_RANGE)}
                    trigger={({ open }) => { openDatePickerRef.current = open; return null; }}
                />

                {/* Filters */}
                <div className="leads-selects-row">
                    <SelectFilter
                        placeholder="Tanggal"
                        value={currentDateSelectValue}
                        onChange={handleDateSelectChange}
                        options={dateSelectOptions}
                    />
                    <SelectFilter
                        placeholder="Distribusi"
                        value={flowFilter === 'all' ? '' : flowFilter}
                        onChange={(v) => setFlowFilter(v || 'all')}
                        options={FLOW_STATUSES.map((item) => ({ value: item.key, label: item.label }))}
                    />
                    <SelectFilter
                        placeholder="Sales Status"
                        value={salesStatusFilter === 'all' ? '' : salesStatusFilter}
                        onChange={(v) => setSalesStatusFilter(v || 'all')}
                        options={[...SPECIAL_SALES_STATUS_FILTERS, ...SALES_STATUSES].map((item) => ({ value: item.key, label: item.label }))}
                    />
                    <SelectFilter
                        placeholder="Result"
                        value={resultFilter === 'all' ? '' : resultFilter}
                        onChange={(v) => setResultFilter(v || 'all')}
                        options={RESULT_STATUSES.map((item) => ({ value: item.key, label: item.label }))}
                    />
                    <SelectFilter
                        placeholder="Appointment"
                        value={appointmentFilter === 'all' ? '' : appointmentFilter}
                        onChange={(v) => setAppointmentFilter(v || 'all')}
                        options={APPOINTMENT_TAGS.map((item) => ({ value: item.key, label: item.label }))}
                    />
                    {availableLeadSources.length > 0 ? (
                        <SelectFilter
                            placeholder="Source"
                            value={sourceFilter === 'all' ? '' : sourceFilter}
                            onChange={(v) => setSourceFilter(v || 'all')}
                            options={availableLeadSources.map((s) => ({ value: s, label: s }))}
                        />
                    ) : null}
                    {isAdmin ? (
                        <SelectFilter
                            placeholder="Sales"
                            value={salesFilter === 'all' ? '' : salesFilter}
                            onChange={(v) => setSalesFilter(v || 'all')}
                            options={salesUsers.map((s) => ({ value: s.id, label: s.name }))}
                        />
                    ) : null}
                    <SelectFilter
                        placeholder="Kelengkapan Data"
                        value={incompleteDataFilter ? 'incomplete' : ''}
                        onChange={(v) => setIncompleteDataFilter(v === 'incomplete')}
                        options={[{ value: 'incomplete', label: 'Data Tidak Lengkap' }]}
                    />
                </div>
            </div>

            {/* Result count */}
            <p className="leads-result-count">{filteredLeads.length} leads ditemukan</p>

            {/* ── Lead list ──────────────────────────────────── */}
            {filteredLeads.length === 0 ? (
                <div className="lc-empty">
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#CBD5E1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
                    </svg>
                    <span className="lc-empty-title">Tidak ada leads</span>
                    <span className="lc-empty-desc">Coba ubah filter pencarian</span>
                </div>
            ) : null}
            <div className="leads-list" style={filteredLeads.length === 0 ? { display: 'none' } : undefined}>
                {filteredLeads.map((lead) => (
                    <div key={lead.id} className="lc" onClick={() => router.push(`/leads/${lead.id}`)}>
                        <UserAvatar name={lead.name} src={lead.avatarUrl} size="xs" shape="circle" />
                        <div className="lc-body">
                            <div className="lc-row1">
                                <span className="lc-name-wrap">
                                    <span className="lc-name">{lead.name}</span>
                                    {isHotValidatedLead(lead) && <span className="lc-verified-badge" title="Validated">✓</span>}
                                </span>
                                <span className="lc-time">{getTimeAgo(lead.createdAt)}</span>
                            </div>
                            <div className="lc-badges">
                                <span className={`badge ${getStatusBadgeClass('flow', lead.flowStatus)}`}>{getFlowStatusLabel(lead.flowStatus)}</span>
                                {isHotValidatedLead(lead) ? (
                                    <span className="badge badge-hot">HOT</span>
                                ) : lead.salesStatus ? (
                                    <span className={`badge ${getStatusBadgeClass('sales', lead.salesStatus)}`}>{getSalesStatusLabel(lead.salesStatus)}</span>
                                ) : null}
                                {lead.appointmentTag && lead.appointmentTag !== 'none' ? <span className={`badge ${getStatusBadgeClass('appointment', lead.appointmentTag)}`}>{getAppointmentTagLabel(lead.appointmentTag)}</span> : null}
                                {lead.resultStatus ? <span className={`badge ${getStatusBadgeClass('result', lead.resultStatus)}`}>{getResultStatusLabel(lead.resultStatus)}</span> : null}
                            </div>
                            <div className="lc-sub">
                                {lead.phone}
                                {lead.source ? <><span className="lc-dot"> · </span>{lead.source}</> : null}
                                {lead.agentOfficeName ? <><span className="lc-dot"> · </span>{lead.agentOfficeName}</> : null}
                                {isAdmin ? <><span className="lc-dot"> · </span><span className="lc-sales-inline">{getSalesNameById(lead.assignedTo)}</span></> : null}
                            </div>
                            {lead.manualNote ? <div className="lc-note">{lead.manualNote}</div> : null}
                            {lead.customerPipelineTotalSteps > 0 ? (
                                <div className="lc-pipeline">
                                    <CustomerPipelineProgress completed={lead.customerPipelineCompletedCount} total={lead.customerPipelineTotalSteps} compact />
                                </div>
                            ) : null}
                        </div>
                    </div>
                ))}
            </div>

            <div className="fab-group">
                <button
                    type="button"
                    className="fab-main"
                    onClick={() => openAddLeadModal()}
                    title="Tambah lead"
                >
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="12" y1="5" x2="12" y2="19" />
                        <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                </button>
            </div>

            {/* ── Add lead modal ─────────────────────────────── */}
            {showAddModal ? (
                <div className="sheet-overlay" onClick={(e) => { if (e.target === e.currentTarget) closeAddLeadModal(); }}>
                    <div className="bottom-sheet">
                        <div className="sheet-handle" />
                        <h2>{addModalTab === 'manual' ? 'Tambah Lead Baru' : 'Import & Reassign Leads'}</h2>
                        <div className="lead-modal-tabs">
                            <button type="button" className={`lead-modal-tab ${addModalTab === 'manual' ? 'is-active' : ''}`} onClick={() => setAddModalTab('manual')}>Manual</button>
                            <button type="button" className={`lead-modal-tab ${addModalTab === 'import' ? 'is-active' : ''}`} onClick={() => setAddModalTab('import')}>Import Leads</button>
                        </div>
                        {addModalTab === 'manual' ? (
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
                                    <SelectFilter
                                        placeholder="Pilih source lead"
                                        value={newLead.source}
                                        onChange={(v) => setNewLead({ ...newLead, source: v, agentOfficeName: isAgentSource(v) ? newLead.agentOfficeName : '' })}
                                        options={availableLeadSources.map((s) => ({ value: s, label: s }))}
                                        variant="white"
                                        clearable={false}
                                    />
                                </div>
                                {isAgentSource(newLead.source) ? (
                                    <div className="input-group">
                                        <label>Nama Kantor</label>
                                        <input className="input-field" value={newLead.agentOfficeName} onChange={(e) => setNewLead({ ...newLead, agentOfficeName: e.target.value })} placeholder="Ketik atau pilih history kantor agent" list="agent-office-history" required />
                                        <datalist id="agent-office-history">
                                            {availableAgentOffices.map((office) => <option key={office} value={office} />)}
                                        </datalist>
                                    </div>
                                ) : null}
                                {isAdmin ? (
                                    <div className="input-group">
                                        <label>Assign ke Sales <span style={{ fontWeight: 400, opacity: 0.6 }}>(opsional)</span></label>
                                        <SelectFilter
                                            placeholder="Biarkan Open"
                                            value={newLead.assignedTo}
                                            onChange={(v) => setNewLead({ ...newLead, assignedTo: v })}
                                            options={salesUsers.map((s) => ({ value: s.id, label: s.name }))}
                                            variant="white"
                                        />
                                    </div>
                                ) : null}
                                <div className="input-group">
                                    <label>Tanggal Masuk <span style={{ fontWeight: 400, opacity: 0.6 }}>(opsional)</span></label>
                                    <DatePicker
                                        value={newLead.createdAt}
                                        onChange={(v) => setNewLead({ ...newLead, createdAt: v })}
                                        placeholder="Pilih tanggal & waktu"
                                        showTime
                                    />
                                </div>
                                {submitError ? <div className="login-error">{submitError}</div> : null}
                                <div style={{ display: 'flex', gap: 10 }}>
                                    <button type="button" className="btn btn-ghost" style={{ flex: 1 }} onClick={closeAddLeadModal}>Batal</button>
                                    <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={submitLoading}>{submitLoading ? 'Menyimpan...' : 'Tambah Lead'}</button>
                                </div>
                            </form>
                        ) : (
                            <div className="lead-import-stack">
                                <div className="settings-help">Upload file XLSX hasil export sales lama, pilih sales target, lalu jalankan import.</div>
                                <div className="input-group">
                                    <label>File XLSX Export</label>
                                    <FileDropZone
                                        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                                        fileName={importFileName}
                                        fileSize={importFileSize}
                                        onChange={(file) => void handleImportFile(file)}
                                        onClear={resetImportState}
                                        label="Pilih file XLSX"
                                        hint="File hasil export leads"
                                        loading={importLoading}
                                    />
                                    {importRows.length > 0 ? <div className="team-modal-helper">{importRows.length} rows siap diproses.</div> : null}
                                </div>
                                <div className="input-group">
                                    <label>Target Sales Baru</label>
                                    <SelectFilter
                                        placeholder="Pilih sales target"
                                        value={importTargetSalesId}
                                        onChange={(v) => setImportTargetSalesId(v)}
                                        options={salesUsers.map((s) => ({ value: s.id, label: s.name }))}
                                        variant="white"
                                        clearable={false}
                                    />
                                </div>
                                <div className="lead-import-actions">
                                    <button type="button" className="btn btn-ghost" style={{ flex: 1 }} onClick={closeAddLeadModal}>Batal</button>
                                    <button type="button" className="btn btn-primary" style={{ flex: 1 }} onClick={() => void handleCommitImport()} disabled={importCommitLoading || importLoading || !importRows.length || !importTargetSalesId}>
                                        {importCommitLoading ? 'Memproses...' : 'Import XLSX'}
                                    </button>
                                </div>
                                {importError ? <div className="login-error">{importError}</div> : null}
                                {importSuccess ? <div className="settings-success">{importSuccess}</div> : null}
                                {importResult ? (
                                    <div className="lead-import-preview">
                                        <div className="lead-import-summary-grid">
                                            <div className="team-summary-card team-summary-default"><span className="team-summary-label">Total Rows</span><strong className="team-summary-value">{importResult.summary?.totalRows || 0}</strong></div>
                                            <div className="team-summary-card team-summary-success"><span className="team-summary-label">Updated</span><strong className="team-summary-value">{importResult.summary?.updated || 0}</strong></div>
                                            <div className="team-summary-card team-summary-warm"><span className="team-summary-label">Skipped</span><strong className="team-summary-value">{importResult.summary?.skipped || 0}</strong></div>
                                            <div className="team-summary-card team-summary-hot"><span className="team-summary-label">Errors</span><strong className="team-summary-value">{importResult.summary?.errors || 0}</strong></div>
                                        </div>
                                        <div className="team-modal-helper">Target sales: <strong>{importResult.targetSales?.name || '-'}</strong></div>
                                        <div className="lead-import-preview-list">
                                            {(importResult.rows || []).slice(0, 12).map((row) => (
                                                <div key={`${row.rowNumber}-${row.matchedLeadId || row.sourceLeadId || row.sourcePhone}`} className="lead-import-preview-row">
                                                    <div className="lead-import-preview-main">
                                                        <div className="lead-import-preview-head">
                                                            <strong>Row {row.rowNumber}</strong>
                                                            <span className={`badge ${row.status === 'ready' || row.status === 'updated' ? 'badge-success' : row.status === 'skip' ? 'badge-warm' : 'badge-danger'}`}>{row.status.toUpperCase()}</span>
                                                        </div>
                                                        <div className="lead-import-preview-copy">
                                                            <span>{row.matchedLeadName || row.sourceLeadId || row.sourcePhone || '-'}</span>
                                                            <span>{row.currentSalesName ? `Owner saat ini: ${row.currentSalesName}` : 'Belum punya owner'}</span>
                                                            {row.reason ? <span>{IMPORT_REASON_LABELS[row.reason] || row.reason}</span> : null}
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ) : null}

                            </div>
                        )}
                    </div>
                </div>
            ) : null}

            {/* ── Mobile filter sheet ────────────────────────── */}
            {showMobileFilter ? (
                <div className="sheet-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowMobileFilter(false); }}>
                    <div className="bottom-sheet">
                        <div className="sheet-handle" />
                        <h2>Filter Leads</h2>
                        <div className="leads-filter-sheet-body">
                            <SelectFilter
                                placeholder="Tanggal"
                                value={currentDateSelectValue}
                                onChange={handleDateSelectChange}
                                options={dateSelectOptions}
                            />
                            <SelectFilter
                                placeholder="Distribusi"
                                value={flowFilter === 'all' ? '' : flowFilter}
                                onChange={(v) => setFlowFilter(v || 'all')}
                                options={FLOW_STATUSES.map((item) => ({ value: item.key, label: item.label }))}
                            />
                            <SelectFilter
                                placeholder="Sales Status"
                                value={salesStatusFilter === 'all' ? '' : salesStatusFilter}
                                onChange={(v) => setSalesStatusFilter(v || 'all')}
                                options={[...SPECIAL_SALES_STATUS_FILTERS, ...SALES_STATUSES].map((item) => ({ value: item.key, label: item.label }))}
                            />
                            <SelectFilter
                                placeholder="Result"
                                value={resultFilter === 'all' ? '' : resultFilter}
                                onChange={(v) => setResultFilter(v || 'all')}
                                options={RESULT_STATUSES.map((item) => ({ value: item.key, label: item.label }))}
                            />
                            <SelectFilter
                                placeholder="Appointment"
                                value={appointmentFilter === 'all' ? '' : appointmentFilter}
                                onChange={(v) => setAppointmentFilter(v || 'all')}
                                options={APPOINTMENT_TAGS.map((item) => ({ value: item.key, label: item.label }))}
                            />
                            {availableLeadSources.length > 0 ? (
                                <SelectFilter
                                    placeholder="Source"
                                    value={sourceFilter === 'all' ? '' : sourceFilter}
                                    onChange={(v) => setSourceFilter(v || 'all')}
                                    options={availableLeadSources.map((s) => ({ value: s, label: s }))}
                                />
                            ) : null}
                            {isAdmin ? (
                                <SelectFilter
                                    placeholder="Sales"
                                    value={salesFilter === 'all' ? '' : salesFilter}
                                    onChange={(v) => setSalesFilter(v || 'all')}
                                    options={salesUsers.map((s) => ({ value: s.id, label: s.name }))}
                                />
                            ) : null}
                            <SelectFilter
                                placeholder="Kelengkapan Data"
                                value={incompleteDataFilter ? 'incomplete' : ''}
                                onChange={(v) => setIncompleteDataFilter(v === 'incomplete')}
                                options={[{ value: 'incomplete', label: 'Data Tidak Lengkap' }]}
                            />
                        </div>
                        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                            <button type="button" className="btn btn-ghost" style={{ flex: 1 }} onClick={() => { resetAllFilters(); setShowMobileFilter(false); }}>Reset Semua</button>
                            <button type="button" className="btn btn-primary" style={{ flex: 1 }} onClick={() => setShowMobileFilter(false)}>Tutup</button>
                        </div>
                    </div>
                </div>
            ) : null}

            {/* ── Export modal ───────────────────────────────── */}
            {showExportModal ? (
                <div className="sheet-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowExportModal(false); }}>
                    <div className="bottom-sheet">
                        <div className="sheet-handle" />
                        <h2>Export Leads (XLSX)</h2>
                        <form onSubmit={handleExportLeads} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                            <div className="input-group">
                                <label>Access Code Export</label>
                                <input type="password" className="input-field" value={exportAccessCode} onChange={(event) => setExportAccessCode(event.target.value)} placeholder="Masukkan access code export" required />
                            </div>
                            <div className="input-group">
                                <label>Tanggal Masuk (Dari - Sampai)</label>
                                <div style={{ display: 'grid', gap: 8, gridTemplateColumns: '1fr 1fr' }}>
                                    <DatePicker
                                        label="Dari"
                                        value={exportFilters.dateFrom}
                                        onChange={(val) => setExportFilters((prev) => ({ ...prev, dateFrom: val }))}
                                        placeholder="Pilih tanggal"
                                    />
                                    <DatePicker
                                        label="Sampai"
                                        value={exportFilters.dateTo}
                                        onChange={(val) => setExportFilters((prev) => ({ ...prev, dateTo: val }))}
                                        placeholder="Pilih tanggal"
                                        align="right"
                                    />
                                </div>
                            </div>
                            <div className="input-group">
                                <label>Status Distribusi</label>
                                <div className="export-checklist">
                                    <label className="export-checklist-item export-checklist-all">
                                        <input type="checkbox" checked={isAllSelected('flowStatuses', FLOW_STATUSES.map((i) => i.key))} ref={(el) => { if (el) el.indeterminate = isSomeSelected('flowStatuses', FLOW_STATUSES.map((i) => i.key)); }} onChange={() => toggleSelectAll('flowStatuses', FLOW_STATUSES.map((i) => i.key))} />
                                        <span>Pilih Semua</span>
                                    </label>
                                    {FLOW_STATUSES.map((item) => (
                                        <label key={item.key} className="export-checklist-item">
                                            <input type="checkbox" checked={exportFilters.flowStatuses.includes(item.key)} onChange={() => toggleExportSelection('flowStatuses', item.key)} />
                                            <span>{item.label}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                            <div className="input-group">
                                <label>Sales Status</label>
                                <div className="export-checklist" style={{ marginBottom: 10 }}>
                                    <label className="export-checklist-item">
                                        <input type="checkbox" checked={Boolean(exportFilters.hotValidatedOnly)} onChange={(event) => setExportFilters((prev) => ({ ...prev, hotValidatedOnly: event.target.checked, salesStatuses: event.target.checked ? Array.from(new Set(['hot', ...prev.salesStatuses.filter((item) => item !== 'unfilled')])) : prev.salesStatuses }))} />
                                        <span>Hanya HOT | Validated</span>
                                    </label>
                                </div>
                                <div className="export-checklist">
                                    <label className="export-checklist-item export-checklist-all">
                                        <input type="checkbox" checked={isAllSelected('salesStatuses', ['unfilled', ...SALES_STATUSES.map((i) => i.key)])} ref={(el) => { if (el) el.indeterminate = isSomeSelected('salesStatuses', ['unfilled', ...SALES_STATUSES.map((i) => i.key)]); }} onChange={() => { setExportFilters((prev) => ({ ...prev, hotValidatedOnly: false })); toggleSelectAll('salesStatuses', ['unfilled', ...SALES_STATUSES.map((i) => i.key)]); }} />
                                        <span>Pilih Semua</span>
                                    </label>
                                    <label className="export-checklist-item">
                                        <input type="checkbox" checked={exportFilters.salesStatuses.includes('unfilled')} onChange={() => toggleExportSelection('salesStatuses', 'unfilled')} />
                                        <span>Belum Diisi</span>
                                    </label>
                                    {SALES_STATUSES.map((item) => (
                                        <label key={item.key} className="export-checklist-item">
                                            <input type="checkbox" checked={exportFilters.salesStatuses.includes(item.key)} onChange={() => toggleExportSelection('salesStatuses', item.key)} />
                                            <span>{item.label}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                            <div className="input-group">
                                <label>Status Appointment</label>
                                <div className="export-checklist">
                                    <label className="export-checklist-item export-checklist-all">
                                        <input type="checkbox" checked={isAllSelected('appointmentTags', ['none', ...APPOINTMENT_TAGS.map((i) => i.key)])} ref={(el) => { if (el) el.indeterminate = isSomeSelected('appointmentTags', ['none', ...APPOINTMENT_TAGS.map((i) => i.key)]); }} onChange={() => toggleSelectAll('appointmentTags', ['none', ...APPOINTMENT_TAGS.map((i) => i.key)])} />
                                        <span>Pilih Semua</span>
                                    </label>
                                    <label className="export-checklist-item">
                                        <input type="checkbox" checked={exportFilters.appointmentTags.includes('none')} onChange={() => toggleExportSelection('appointmentTags', 'none')} />
                                        <span>Belum Ada</span>
                                    </label>
                                    {APPOINTMENT_TAGS.map((item) => (
                                        <label key={item.key} className="export-checklist-item">
                                            <input type="checkbox" checked={exportFilters.appointmentTags.includes(item.key)} onChange={() => toggleExportSelection('appointmentTags', item.key)} />
                                            <span>{item.label}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                            <div className="input-group">
                                <label>Result Status</label>
                                <div className="export-checklist">
                                    <label className="export-checklist-item export-checklist-all">
                                        <input type="checkbox" checked={isAllSelected('resultStatuses', ['unfilled', ...RESULT_STATUSES.map((i) => i.key)])} ref={(el) => { if (el) el.indeterminate = isSomeSelected('resultStatuses', ['unfilled', ...RESULT_STATUSES.map((i) => i.key)]); }} onChange={() => toggleSelectAll('resultStatuses', ['unfilled', ...RESULT_STATUSES.map((i) => i.key)])} />
                                        <span>Pilih Semua</span>
                                    </label>
                                    <label className="export-checklist-item">
                                        <input type="checkbox" checked={exportFilters.resultStatuses.includes('unfilled')} onChange={() => toggleExportSelection('resultStatuses', 'unfilled')} />
                                        <span>Belum Diisi</span>
                                    </label>
                                    {RESULT_STATUSES.map((item) => (
                                        <label key={item.key} className="export-checklist-item">
                                            <input type="checkbox" checked={exportFilters.resultStatuses.includes(item.key)} onChange={() => toggleExportSelection('resultStatuses', item.key)} />
                                            <span>{item.label}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                            {isAdmin ? (
                                <div className="input-group">
                                    <label>Sales</label>
                                    <div className="export-checklist">
                                        <label className="export-checklist-item export-checklist-all">
                                            <input type="checkbox" checked={isAllSelected('salesIds', ['unassigned', ...salesUsers.map((s) => s.id)])} ref={(el) => { if (el) el.indeterminate = isSomeSelected('salesIds', ['unassigned', ...salesUsers.map((s) => s.id)]); }} onChange={() => toggleSelectAll('salesIds', ['unassigned', ...salesUsers.map((s) => s.id)])} />
                                            <span>Pilih Semua</span>
                                        </label>
                                        <label className="export-checklist-item">
                                            <input type="checkbox" checked={exportFilters.salesIds.includes('unassigned')} onChange={() => toggleExportSelection('salesIds', 'unassigned')} />
                                            <span>Belum Assigned</span>
                                        </label>
                                        {salesUsers.map((sales) => (
                                            <label key={sales.id} className="export-checklist-item">
                                                <input type="checkbox" checked={exportFilters.salesIds.includes(sales.id)} onChange={() => toggleExportSelection('salesIds', sales.id)} />
                                                <span>{sales.name}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            ) : null}
                            <p className="leads-result-count" style={{ marginBottom: 0 }}>{exportLeads.length} leads akan diexport</p>
                            {exportError ? <div className="login-error">{exportError}</div> : null}
                            <button type="submit" className="btn btn-primary btn-full" disabled={exporting}>{exporting ? 'Exporting...' : 'Export XLSX'}</button>
                            <button type="button" className="btn btn-secondary btn-full" onClick={() => setShowExportModal(false)}>Batal</button>
                        </form>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
