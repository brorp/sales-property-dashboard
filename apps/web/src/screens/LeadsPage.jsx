'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
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
} from '../constants/crm';
import Header from '../components/Header';
import LeadCardV2 from '../components/LeadCardV2';
import FilterBottomSheet from '../components/FilterBottomSheet';
import { usePagePolling } from '../hooks/usePagePolling';
import { apiRequest } from '../lib/api';
import { readLeadTransferWorkbook } from '../lib/lead-transfer-workbook';

const QUICK_RANGES = [
    { key: 'today', label: 'Hari Ini' },
    { key: 'last7', label: '7 Hari' },
    { key: 'last30', label: '30 Hari' },
    { key: 'thisMonth', label: 'Bulan Ini' },
];
const EMPTY_DATE_RANGE = {
    dateFrom: '',
    dateTo: '',
};
const IMPORT_REASON_LABELS = {
    missing_identifier: 'Row tidak punya leadId atau phone.',
    phone_ambiguous: 'Nomor telepon cocok ke lebih dari satu lead.',
    lead_not_found: 'Lead tidak ditemukan di client target.',
    duplicate_row_for_lead: 'Lead yang sama muncul lebih dari sekali di file.',
    already_assigned_to_target: 'Lead sudah dimiliki sales target.',
    owner_changed_since_export: 'Owner lead berubah sejak file ini diexport.',
};

function parseDateInput(value) {
    if (!value) {
        return null;
    }

    const [year, month, day] = String(value).split('-').map(Number);
    if (!year || !month || !day) {
        return null;
    }

    const next = new Date(year, month - 1, day);
    return Number.isNaN(next.getTime()) ? null : next;
}

function formatDateInput(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function isAgentSource(value) {
    return String(value || '').trim().toLowerCase() === 'agent';
}

function normalizeDateRange(range) {
    const dateFrom = range?.dateFrom || '';
    const dateTo = range?.dateTo || '';

    if (dateFrom && dateTo && dateFrom > dateTo) {
        return {
            dateFrom: dateTo,
            dateTo: dateFrom,
        };
    }

    return {
        dateFrom,
        dateTo,
    };
}

function formatRangeSummary(range) {
    if (!range.dateFrom && !range.dateTo) {
        return '';
    }

    const formatter = new Intl.DateTimeFormat('id-ID', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
    });

    const start = parseDateInput(range.dateFrom);
    const end = parseDateInput(range.dateTo || range.dateFrom);
    if (!start || !end) {
        return '';
    }

    return `Lead masuk ${formatter.format(start)} - ${formatter.format(end)}`;
}

function getPresetRange(key) {
    const today = new Date();
    const end = formatDateInput(today);

    if (key === 'today') {
        return { dateFrom: end, dateTo: end };
    }

    if (key === 'last7') {
        const start = new Date(today);
        start.setDate(today.getDate() - 6);
        return {
            dateFrom: formatDateInput(start),
            dateTo: end,
        };
    }

    if (key === 'last30') {
        const start = new Date(today);
        start.setDate(today.getDate() - 29);
        return {
            dateFrom: formatDateInput(start),
            dateTo: end,
        };
    }

    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    return {
        dateFrom: formatDateInput(start),
        dateTo: end,
    };
}

function toInitialExportSelection(value) {
    return value && value !== 'all' ? [value] : [];
}

function matchesMultiValueFilter(selectedValues, actualValue, fallbackValue = '') {
    if (!Array.isArray(selectedValues) || selectedValues.length === 0) {
        return true;
    }

    return selectedValues.includes(actualValue ?? fallbackValue);
}

function matchesResultStatusFilter(actualValue, selectedValue) {
    if (selectedValue === 'all') {
        return true;
    }
    if (selectedValue === 'cancel' || selectedValue === 'cancel_transaksi') {
        return actualValue === 'cancel_transaksi' || actualValue === 'cancel' || actualValue === 'cancel_minat';
    }
    return actualValue === selectedValue;
}

function matchesResultStatusMultiFilter(selectedValues, actualValue, fallbackValue = 'unfilled') {
    if (!Array.isArray(selectedValues) || selectedValues.length === 0) {
        return true;
    }
    if (selectedValues.includes('cancel_transaksi') && (actualValue === 'cancel' || actualValue === 'cancel_transaksi')) {
        return true;
    }
    return selectedValues.includes(actualValue ?? fallbackValue);
}

function isHotValidatedLead(lead) {
    return lead?.salesStatus === 'hot' && Boolean(lead?.validated);
}

function matchesLeadFilters(lead, filters) {
    if (filters.flowStatus !== 'all' && lead.flowStatus !== filters.flowStatus) {
        return false;
    }

    if (filters.salesStatus === 'hot_validated') {
        if (!isHotValidatedLead(lead)) {
            return false;
        }
    } else if (filters.salesStatus !== 'all' && lead.salesStatus !== filters.salesStatus) {
        return false;
    }

    if (!matchesResultStatusFilter(lead.resultStatus, filters.resultStatus)) {
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

function matchesLeadExportFilters(lead, filters) {
    if (filters.hotValidatedOnly && !isHotValidatedLead(lead)) {
        return false;
    }

    if (!matchesMultiValueFilter(filters.flowStatuses, lead.flowStatus)) {
        return false;
    }

    if (!matchesMultiValueFilter(filters.salesStatuses, lead.salesStatus, 'unfilled')) {
        return false;
    }

    if (!matchesResultStatusMultiFilter(filters.resultStatuses, lead.resultStatus, 'unfilled')) {
        return false;
    }

    if (!matchesMultiValueFilter(filters.appointmentTags, lead.appointmentTag || 'none')) {
        return false;
    }

    if (!matchesMultiValueFilter(filters.salesIds, lead.assignedTo, 'unassigned')) {
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
    const {
        getLeadsForUser,
        addLead,
        getSalesUsers,
        getLeadSources,
        refreshLeads,
        refreshSalesUsers,
        refreshLeadSources,
        refreshTeamStats,
        refreshDashboardAnalytics,
    } = useLeads();
    const router = useRouter();
    const [refreshing, setRefreshing] = useState(false);
    const [search, setSearch] = useState('');
    const [flowFilter, setFlowFilter] = useState('all');
    const [salesStatusFilter, setSalesStatusFilter] = useState('all');
    const searchParams = useSearchParams();
    const [resultFilter, setResultFilter] = useState(searchParams?.get('resultFilter') || 'all');
    const [appointmentFilter, setAppointmentFilter] = useState('all');
    const [salesFilter, setSalesFilter] = useState('all');
    const [sourceFilter, setSourceFilter] = useState('all');
    const [incompleteDataFilter, setIncompleteDataFilter] = useState(false);
    const [showAddModal, setShowAddModal] = useState(false);
    const [showExportModal, setShowExportModal] = useState(false);
    const [appliedDateRange, setAppliedDateRange] = useState(EMPTY_DATE_RANGE);
    const [draftDateRange, setDraftDateRange] = useState(EMPTY_DATE_RANGE);
    const [newLead, setNewLead] = useState({ name: '', phone: '', source: '', agentOfficeName: '', assignedTo: '', createdAt: '' });
    const [agentOfficeOptions, setAgentOfficeOptions] = useState([]);
    const [addModalTab, setAddModalTab] = useState('manual');
    const [submitLoading, setSubmitLoading] = useState(false);
    const [submitError, setSubmitError] = useState('');
    const [importFileName, setImportFileName] = useState('');
    const [importRows, setImportRows] = useState([]);
    const [importTargetSalesId, setImportTargetSalesId] = useState('');
    const [importResult, setImportResult] = useState(null);
    const [importLoading, setImportLoading] = useState(false);
    const [importCommitLoading, setImportCommitLoading] = useState(false);
    const [importError, setImportError] = useState('');
    const [importSuccess, setImportSuccess] = useState('');
    const [filterSheetOpen, setFilterSheetOpen] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [exportError, setExportError] = useState('');
    const [exportAccessCode, setExportAccessCode] = useState('');
    const [exportFilters, setExportFilters] = useState({
        dateFrom: '',
        dateTo: '',
        flowStatuses: [],
        salesStatuses: [],
        hotValidatedOnly: false,
        appointmentTags: [],
        resultStatuses: [],
        salesIds: [],
    });

    const allLeads = getLeadsForUser(user.id, user.role);
    const salesUsers = getSalesUsers();
    const leadSources = getLeadSources();
    const getSalesNameById = (salesId) => salesUsers.find((item) => item.id === salesId)?.name || 'Unassigned';
    const canExportLeads = user?.role === 'root_admin' || user?.role === 'client_admin' || user?.role === 'admin';
    const hasActiveDateFilter = Boolean(appliedDateRange.dateFrom || appliedDateRange.dateTo);
    const activeFilterCount = [
        flowFilter !== 'all',
        salesStatusFilter !== 'all',
        resultFilter !== 'all',
        appointmentFilter !== 'all',
        sourceFilter !== 'all',
        salesFilter !== 'all',
        incompleteDataFilter,
        hasActiveDateFilter,
    ].filter(Boolean).length;

    const handleResetFilters = () => {
        setFlowFilter('all');
        setSalesStatusFilter('all');
        setResultFilter('all');
        setAppointmentFilter('all');
        setSourceFilter('all');
        setSalesFilter('all');
        setIncompleteDataFilter(false);
        setDraftDateRange({ ...EMPTY_DATE_RANGE });
        setAppliedDateRange({ ...EMPTY_DATE_RANGE });
    };
    const availableLeadSources = useMemo(() => {
        const values = new Set();

        leadSources.forEach((item) => {
            if (item?.value) {
                values.add(item.value);
            }
        });

        allLeads.forEach((item) => {
            if (item?.source) {
                values.add(item.source);
            }
        });

        return Array.from(values).sort((a, b) => a.localeCompare(b));
    }, [allLeads, leadSources]);

    const availableAgentOffices = useMemo(() => {
        const values = new Set();

        agentOfficeOptions.forEach((item) => {
            if (item) {
                values.add(item);
            }
        });

        allLeads.forEach((item) => {
            if (item?.agentOfficeName) {
                values.add(item.agentOfficeName);
            }
        });

        return Array.from(values).sort((a, b) => a.localeCompare(b));
    }, [agentOfficeOptions, allLeads]);

    const filteredLeads = useMemo(() => {
        return allLeads.filter((lead) => {
            if (search) {
                const q = search.toLowerCase();
                if (!lead.name.toLowerCase().includes(q) && !lead.phone.includes(q)) return false;
            }

            if (sourceFilter !== 'all' && lead.source !== sourceFilter) {
                return false;
            }

            if (!isLeadInDateRange(lead, appliedDateRange.dateFrom, appliedDateRange.dateTo)) {
                return false;
            }

            if (incompleteDataFilter) {
                const hasDomisili = Boolean(lead.domicileCity);
                const hasTipeUnit = Boolean(lead.interestUnitId || lead.interestUnitName);
                if (hasDomisili && hasTipeUnit) {
                    return false;
                }
            }

            return matchesLeadFilters(lead, {
                flowStatus: flowFilter,
                salesStatus: salesStatusFilter,
                resultStatus: resultFilter,
                appointmentTag: appointmentFilter,
                salesId: salesFilter,
            });
        }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }, [allLeads, appliedDateRange.dateFrom, appliedDateRange.dateTo, appointmentFilter, flowFilter, resultFilter, salesFilter, salesStatusFilter, search, sourceFilter, incompleteDataFilter]);

    const exportLeads = useMemo(() => {
        return allLeads.filter((lead) => {
            if (!matchesLeadExportFilters(lead, exportFilters)) {
                return false;
            }

            return isLeadInDateRange(lead, exportFilters.dateFrom, exportFilters.dateTo);
        }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }, [allLeads, exportFilters]);

    const refreshLeadsPage = useCallback(async () => {
        await Promise.all([
            refreshLeads(),
            refreshSalesUsers(),
            refreshLeadSources(),
        ]);
    }, [refreshLeadSources, refreshLeads, refreshSalesUsers]);

    const loadAgentOfficeOptions = useCallback(async () => {
        if (!user) {
            setAgentOfficeOptions([]);
            return [];
        }

        const rows = await apiRequest('/api/lead-sources/agent-offices', { user });
        const normalized = Array.isArray(rows) ? rows : [];
        setAgentOfficeOptions(normalized);
        return normalized;
    }, [user]);

    usePagePolling({
        enabled: Boolean(user),
        intervalMs: 3000,
        run: refreshLeadsPage,
    });

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
            await addLead({
                name: newLead.name,
                phone: newLead.phone,
                source: newLead.source,
                agentOfficeName: isAgentSource(newLead.source) ? newLead.agentOfficeName : null,
                assignedTo: newLead.assignedTo || null,
                createdAt: newLead.createdAt || null,
            });
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
        try {
            await refreshLeadsPage();
        } finally {
            setRefreshing(false);
        }
    };

    const resetImportState = () => {
        setImportFileName('');
        setImportRows([]);
        setImportTargetSalesId('');
        setImportResult(null);
        setImportError('');
        setImportSuccess('');
        setImportLoading(false);
        setImportCommitLoading(false);
    };

    const openAddLeadModal = (tab = 'manual') => {
        setSubmitError('');
        setImportError('');
        setImportSuccess('');
        setAddModalTab(tab);
        setNewLead((prev) => ({
            ...prev,
            source: prev.source || leadSources[0]?.value || '',
        }));
        void loadAgentOfficeOptions();
        setShowAddModal(true);
    };

    const closeAddLeadModal = () => {
        setShowAddModal(false);
        setAddModalTab('manual');
        setSubmitLoading(false);
        setSubmitError('');
        resetImportState();
    };

    const handleImportFileChange = async (event) => {
        const file = event.target.files?.[0];
        if (!file) {
            resetImportState();
            return;
        }

        try {
            setImportLoading(true);
            const parsed = await readLeadTransferWorkbook(file);
            setImportFileName(parsed.fileName || 'leads-import.xlsx');
            setImportRows(Array.isArray(parsed.rows) ? parsed.rows : []);
            setImportResult(null);
            setImportError('');
            setImportSuccess('');
        } catch (err) {
            setImportError(err instanceof Error ? err.message : 'Gagal membaca file import');
        } finally {
            setImportLoading(false);
        }
    };

    const handleCommitImport = async () => {
        if (!importRows.length || !importTargetSalesId) {
            setImportError('Pilih file XLSX export dan target sales terlebih dahulu.');
            return;
        }

        setImportCommitLoading(true);
        setImportError('');
        setImportSuccess('');

        try {
            const result = await apiRequest('/api/leads/import-reassign/commit', {
                method: 'POST',
                user,
                body: {
                    rows: importRows,
                    targetSalesId: importTargetSalesId,
                    fileName: importFileName || null,
                },
            });

            await Promise.all([
                refreshLeads(),
                refreshSalesUsers(),
                refreshTeamStats(),
                refreshDashboardAnalytics(),
            ]);

            setImportResult(result);
            setImportSuccess(`${result.summary?.updated || 0} lead berhasil dipindahkan ke sales target.`);
        } catch (err) {
            setImportError(err instanceof Error ? err.message : 'Gagal menjalankan import reassign');
        } finally {
            setImportCommitLoading(false);
        }
    };

    const openFilterSheet = () => {
        setDraftDateRange(normalizeDateRange(appliedDateRange));
        setFilterSheetOpen(true);
    };

    const handleApplySheet = () => {
        const nextRange = normalizeDateRange({
            dateFrom: draftDateRange.dateFrom,
            dateTo: draftDateRange.dateTo || draftDateRange.dateFrom,
        });
        setAppliedDateRange(nextRange);
        setDraftDateRange(nextRange);
        setFilterSheetOpen(false);
    };

    const handleCloseFilterSheet = () => {
        setDraftDateRange(normalizeDateRange(appliedDateRange));
        setFilterSheetOpen(false);
    };

    const openExportModal = () => {
        setExportError('');
        setExportAccessCode('');
        setExportFilters({
            dateFrom: '',
            dateTo: '',
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
            return {
                ...prev,
                [field]: hasValue
                    ? currentValues.filter((item) => item !== value)
                    : [...currentValues, value],
            };
        });
    };

    const setExportSelectionGroup = (field, values) => {
        setExportFilters((prev) => ({
            ...prev,
            [field]: values,
        }));
    };

    const handleExportLeads = async (event) => {
        event.preventDefault();

        if (!canExportLeads) {
            setExportError('Hanya admin yang bisa export leads.');
            return;
        }

        if (exportLeads.length === 0) {
            setExportError('Tidak ada data leads untuk filter export yang dipilih.');
            return;
        }

        if (!exportAccessCode.trim()) {
            setExportError('Access code export wajib diisi.');
            return;
        }

        setExporting(true);
        setExportError('');
        try {
            await apiRequest('/api/leads/export/authorize', {
                method: 'POST',
                user,
                body: {
                    accessCode: exportAccessCode.trim(),
                },
            });

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
                    salesStatus: isHotValidatedLead(lead)
                        ? 'HOT | Validated'
                        : lead.salesStatus
                            ? getSalesStatusLabel(lead.salesStatus)
                            : '-',
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
            setExportAccessCode('');
        } catch (err) {
            setExportError(err instanceof Error ? err.message : 'Gagal export XLSX');
        } finally {
            setExporting(false);
        }
    };

    useEffect(() => {
        document.body.classList.add('lp2-body');
        return () => document.body.classList.remove('lp2-body');
    }, []);

    return (
        <div className="page-container lp2-page">
            <Header
                title="Leads"
                rightAction={(
                    <>
                        <button className="btn btn-sm btn-secondary" onClick={() => void handleRefresh()} disabled={refreshing}>
                            {refreshing ? 'Loading...' : 'Refresh'}
                        </button>
                        {canExportLeads ? (
                            <button className="btn btn-sm btn-primary" onClick={openExportModal}>
                                Export
                            </button>
                        ) : null}
                    </>
                )}
            />
            {/* Search + Filter row */}
            <div className="lp2-search-row">
                <div className="lp2-search">
                    <span className="lp2-search-icon">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="11" cy="11" r="8"/>
                            <path d="m21 21-4.35-4.35"/>
                        </svg>
                    </span>
                    <input
                        type="text"
                        className="lp2-search-input"
                        placeholder="Cari nama atau no. WA..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
                <button
                    type="button"
                    className={`lp2-filter-toggle${activeFilterCount > 0 ? ' has-active' : ''}`}
                    onClick={openFilterSheet}
                >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M22 3H2l8 9.46V19l4 2V12.46L22 3z"/>
                    </svg>
                    Filter
                    {activeFilterCount > 0 ? <span className="lp2-filter-badge">{activeFilterCount}</span> : null}
                </button>
            </div>

            {hasActiveDateFilter ? (
                <p className="lp2-date-summary">{formatRangeSummary(appliedDateRange)}</p>
            ) : null}


            {/* Count */}
            <div className="lp2-count-bar">
                <span className="lp2-count">{filteredLeads.length} leads ditemukan</span>
            </div>

            {/* Lead list */}
            <div className="lp2-list">
                {filteredLeads.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-icon">📋</div>
                        <div className="empty-title">Tidak ada leads</div>
                        <div className="empty-desc">Coba ubah filter pencarian</div>
                    </div>
                ) : filteredLeads.map((lead) => (
                    <LeadCardV2
                        key={lead.id}
                        lead={lead}
                        onClick={() => router.push(`/leads/${lead.id}`)}
                        salesName={getSalesNameById(lead.assignedTo)}
                        showSales={isAdmin}
                    />
                ))}
            </div>

            <button type="button" className="lp2-fab" onClick={() => openAddLeadModal('manual')}>＋</button>

            <FilterBottomSheet
                open={filterSheetOpen}
                onClose={handleCloseFilterSheet}
                onApply={handleApplySheet}
                dateFrom={draftDateRange.dateFrom}
                dateTo={draftDateRange.dateTo}
                onDateFromChange={(v) => setDraftDateRange((prev) => ({ ...prev, dateFrom: v }))}
                onDateToChange={(v) => setDraftDateRange((prev) => ({ ...prev, dateTo: v }))}
                quickRanges={QUICK_RANGES}
                onQuickRange={(key) => setDraftDateRange(getPresetRange(key))}
                onClearDate={() => setDraftDateRange({ ...EMPTY_DATE_RANGE })}
                flowFilter={flowFilter} setFlowFilter={setFlowFilter}
                salesStatusFilter={salesStatusFilter} setSalesStatusFilter={setSalesStatusFilter}
                appointmentFilter={appointmentFilter} setAppointmentFilter={setAppointmentFilter}
                resultFilter={resultFilter} setResultFilter={setResultFilter}
                sourceFilter={sourceFilter} setSourceFilter={setSourceFilter} availableLeadSources={availableLeadSources}
                salesFilter={salesFilter} setSalesFilter={setSalesFilter} salesUsers={salesUsers}
                incompleteDataFilter={incompleteDataFilter} setIncompleteDataFilter={setIncompleteDataFilter}
                isAdmin={isAdmin}
                activeFilterCount={activeFilterCount}
                onReset={handleResetFilters}
            />

            {showAddModal && (
                <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) closeAddLeadModal(); }}>
                    <div className="bottom-sheet">
                        <div className="sheet-handle" />
                        <h2>{addModalTab === 'manual' ? 'Tambah Lead Baru' : 'Import & Reassign Leads'}</h2>

                        <div className="lead-modal-tabs">
                            <button
                                type="button"
                                className={`lead-modal-tab ${addModalTab === 'manual' ? 'is-active' : ''}`}
                                onClick={() => setAddModalTab('manual')}
                            >
                                Manual
                            </button>
                            <button
                                type="button"
                                className={`lead-modal-tab ${addModalTab === 'import' ? 'is-active' : ''}`}
                                onClick={() => setAddModalTab('import')}
                            >
                                Import Leads
                            </button>
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
                                    <select
                                        className="input-field"
                                        value={newLead.source}
                                        onChange={(e) => {
                                            const nextSource = e.target.value;
                                            setNewLead({
                                                ...newLead,
                                                source: nextSource,
                                                agentOfficeName: isAgentSource(nextSource) ? newLead.agentOfficeName : '',
                                            });
                                        }}
                                        required
                                    >
                                        <option value="">Pilih source lead</option>
                                        {availableLeadSources.map((source) => (
                                            <option key={source} value={source}>{source}</option>
                                        ))}
                                    </select>
                                </div>
                                {isAgentSource(newLead.source) ? (
                                    <div className="input-group">
                                        <label>Nama Kantor</label>
                                        <input
                                            className="input-field"
                                            value={newLead.agentOfficeName}
                                            onChange={(e) => setNewLead({ ...newLead, agentOfficeName: e.target.value })}
                                            placeholder="Ketik atau pilih history kantor agent"
                                            list="agent-office-history"
                                            required
                                        />
                                        <datalist id="agent-office-history">
                                            {availableAgentOffices.map((office) => (
                                                <option key={office} value={office} />
                                            ))}
                                        </datalist>
                                    </div>
                                ) : null}
                                {isAdmin && (
                                    <div className="input-group">
                                        <label>Assign ke Sales (opsional)</label>
                                        <select className="input-field" value={newLead.assignedTo} onChange={(e) => setNewLead({ ...newLead, assignedTo: e.target.value })}>
                                            <option value="">Biarkan Open</option>
                                            {salesUsers.map((sales) => <option key={sales.id} value={sales.id}>{sales.name}</option>)}
                                        </select>
                                    </div>
                                )}
                                <div className="input-group">
                                    <label>Tanggal Masuk <span style={{ fontWeight: 400, opacity: 0.6 }}>(opsional, default: sekarang)</span></label>
                                    <input
                                        type="datetime-local"
                                        className="input-field"
                                        value={newLead.createdAt}
                                        onChange={(e) => setNewLead({ ...newLead, createdAt: e.target.value })}
                                    />
                                </div>
                                {submitError ? <div className="login-error">{submitError}</div> : null}
                                <button type="submit" className="btn btn-primary btn-full" disabled={submitLoading}>
                                    {submitLoading ? 'Menyimpan...' : 'Tambah Lead'}
                                </button>
                                <button type="button" className="btn btn-secondary btn-full" onClick={closeAddLeadModal}>Batal</button>
                            </form>
                        ) : (
                            <div className="lead-import-stack">
                                <div className="settings-help">
                                    Upload file XLSX hasil export sales lama, pilih sales target, lalu jalankan import.
                                </div>

                                <div className="input-group">
                                    <label>File XLSX Export</label>
                                    <input
                                        type="file"
                                        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                                        className="input-field"
                                        onChange={(event) => void handleImportFileChange(event)}
                                    />
                                    {importFileName ? <div className="team-modal-helper">File dipilih: {importFileName}</div> : null}
                                    {importRows.length > 0 ? <div className="team-modal-helper">{importRows.length} rows siap diproses.</div> : null}
                                </div>

                                <div className="input-group">
                                    <label>Target Sales Baru</label>
                                    <select
                                        className="input-field"
                                        value={importTargetSalesId}
                                        onChange={(event) => setImportTargetSalesId(event.target.value)}
                                    >
                                        <option value="">Pilih sales target</option>
                                        {salesUsers.map((sales) => (
                                            <option key={sales.id} value={sales.id}>{sales.name}</option>
                                        ))}
                                    </select>
                                </div>

                                <div className="lead-import-actions">
                                    <button
                                        type="button"
                                        className="btn btn-primary"
                                        onClick={() => void handleCommitImport()}
                                        disabled={
                                            importCommitLoading ||
                                            importLoading ||
                                            !importRows.length ||
                                            !importTargetSalesId
                                        }
                                    >
                                        {importCommitLoading ? 'Memproses...' : 'Import XLSX'}
                                    </button>
                                </div>

                                {importError ? <div className="login-error">{importError}</div> : null}
                                {importSuccess ? <div className="settings-success">{importSuccess}</div> : null}

                                {importResult ? (
                                    <div className="lead-import-preview">
                                        <div className="lead-import-summary-grid">
                                            <div className="team-summary-card team-summary-default">
                                                <span className="team-summary-label">Total Rows</span>
                                                <strong className="team-summary-value">{importResult.summary?.totalRows || 0}</strong>
                                            </div>
                                            <div className="team-summary-card team-summary-success">
                                                <span className="team-summary-label">Updated</span>
                                                <strong className="team-summary-value">{importResult.summary?.updated || 0}</strong>
                                            </div>
                                            <div className="team-summary-card team-summary-warm">
                                                <span className="team-summary-label">Skipped</span>
                                                <strong className="team-summary-value">{importResult.summary?.skipped || 0}</strong>
                                            </div>
                                            <div className="team-summary-card team-summary-hot">
                                                <span className="team-summary-label">Errors</span>
                                                <strong className="team-summary-value">{importResult.summary?.errors || 0}</strong>
                                            </div>
                                        </div>

                                        <div className="team-modal-helper">
                                            Target sales: <strong>{importResult.targetSales?.name || '-'}</strong>
                                        </div>

                                        <div className="lead-import-preview-list">
                                            {(importResult.rows || []).slice(0, 12).map((row) => (
                                                <div
                                                    key={`${row.rowNumber}-${row.matchedLeadId || row.sourceLeadId || row.sourcePhone}`}
                                                    className="lead-import-preview-row"
                                                >
                                                    <div className="lead-import-preview-main">
                                                        <div className="lead-import-preview-head">
                                                            <strong>Row {row.rowNumber}</strong>
                                                            <span className={`badge ${
                                                                row.status === 'ready' || row.status === 'updated'
                                                                    ? 'badge-success'
                                                                    : row.status === 'skip'
                                                                        ? 'badge-warm'
                                                                        : 'badge-danger'
                                                            }`}>
                                                                {row.status.toUpperCase()}
                                                            </span>
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

                                <button type="button" className="btn btn-secondary btn-full" onClick={closeAddLeadModal}>
                                    Tutup
                                </button>
                            </div>
                        )}
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
                                <label>Access Code Export</label>
                                <input
                                    type="password"
                                    className="input-field"
                                    value={exportAccessCode}
                                    onChange={(event) => setExportAccessCode(event.target.value)}
                                    placeholder="Masukkan access code export"
                                    required
                                />
                            </div>

                            <div className="input-group">
                                <label>Tanggal Masuk (Dari - Sampai)</label>
                                <div style={{ display: 'grid', gap: 8, gridTemplateColumns: '1fr 1fr' }}>
                                    <div className="input-group" style={{ margin: 0 }}>
                                        <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Dari</label>
                                        <input
                                            type="date"
                                            className="input-field"
                                            value={exportFilters.dateFrom}
                                            onChange={(e) => setExportFilters((prev) => ({ ...prev, dateFrom: e.target.value }))}
                                        />
                                    </div>
                                    <div className="input-group" style={{ margin: 0 }}>
                                        <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Sampai</label>
                                        <input
                                            type="date"
                                            className="input-field"
                                            value={exportFilters.dateTo}
                                            onChange={(e) => setExportFilters((prev) => ({ ...prev, dateTo: e.target.value }))}
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="input-group">
                                <label>Status Distribusi</label>
                                <div className="export-filter-actions">
                                    <button type="button" className="btn btn-sm btn-secondary" onClick={() => setExportSelectionGroup('flowStatuses', [])}>
                                        Semua
                                    </button>
                                    <button type="button" className="btn btn-sm btn-secondary" onClick={() => setExportSelectionGroup('flowStatuses', FLOW_STATUSES.map((item) => item.key))}>
                                        Pilih Semua
                                    </button>
                                </div>
                                <div className="export-checklist">
                                    {FLOW_STATUSES.map((item) => (
                                        <label key={item.key} className="export-checklist-item">
                                            <input
                                                type="checkbox"
                                                checked={exportFilters.flowStatuses.includes(item.key)}
                                                onChange={() => toggleExportSelection('flowStatuses', item.key)}
                                            />
                                            <span>{item.label}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>

                            <div className="input-group">
                                <label>Sales Status</label>
                                <div className="export-filter-actions">
                                    <button
                                        type="button"
                                        className="btn btn-sm btn-secondary"
                                        onClick={() => {
                                            setExportFilters((prev) => ({ ...prev, hotValidatedOnly: false }));
                                            setExportSelectionGroup('salesStatuses', []);
                                        }}
                                    >
                                        Semua
                                    </button>
                                    <button type="button" className="btn btn-sm btn-secondary" onClick={() => {
                                        setExportFilters((prev) => ({ ...prev, hotValidatedOnly: false }));
                                        setExportSelectionGroup('salesStatuses', ['unfilled', ...SALES_STATUSES.map((item) => item.key)]);
                                    }}>
                                        Pilih Semua
                                    </button>
                                </div>
                                <div className="export-checklist" style={{ marginBottom: 10 }}>
                                    <label className="export-checklist-item">
                                        <input
                                            type="checkbox"
                                            checked={Boolean(exportFilters.hotValidatedOnly)}
                                            onChange={(event) => setExportFilters((prev) => ({
                                                ...prev,
                                                hotValidatedOnly: event.target.checked,
                                                salesStatuses: event.target.checked
                                                    ? Array.from(new Set(['hot', ...prev.salesStatuses.filter((item) => item !== 'unfilled')]))
                                                    : prev.salesStatuses,
                                            }))}
                                        />
                                        <span>Hanya HOT | Validated</span>
                                    </label>
                                </div>
                                <div className="export-checklist">
                                    <label className="export-checklist-item">
                                        <input
                                            type="checkbox"
                                            checked={exportFilters.salesStatuses.includes('unfilled')}
                                            onChange={() => toggleExportSelection('salesStatuses', 'unfilled')}
                                        />
                                        <span>Belum Diisi</span>
                                    </label>
                                    {SALES_STATUSES.map((item) => (
                                        <label key={item.key} className="export-checklist-item">
                                            <input
                                                type="checkbox"
                                                checked={exportFilters.salesStatuses.includes(item.key)}
                                                onChange={() => toggleExportSelection('salesStatuses', item.key)}
                                            />
                                            <span>{item.label}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>

                            <div className="input-group">
                                <label>Status Appointment</label>
                                <div className="export-filter-actions">
                                    <button type="button" className="btn btn-sm btn-secondary" onClick={() => setExportSelectionGroup('appointmentTags', [])}>
                                        Semua
                                    </button>
                                    <button type="button" className="btn btn-sm btn-secondary" onClick={() => setExportSelectionGroup('appointmentTags', ['none', ...APPOINTMENT_TAGS.map((item) => item.key)])}>
                                        Pilih Semua
                                    </button>
                                </div>
                                <div className="export-checklist">
                                    <label className="export-checklist-item">
                                        <input
                                            type="checkbox"
                                            checked={exportFilters.appointmentTags.includes('none')}
                                            onChange={() => toggleExportSelection('appointmentTags', 'none')}
                                        />
                                        <span>Belum Ada</span>
                                    </label>
                                    {APPOINTMENT_TAGS.map((item) => (
                                        <label key={item.key} className="export-checklist-item">
                                            <input
                                                type="checkbox"
                                                checked={exportFilters.appointmentTags.includes(item.key)}
                                                onChange={() => toggleExportSelection('appointmentTags', item.key)}
                                            />
                                            <span>{item.label}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>

                            <div className="input-group">
                                <label>Result Status</label>
                                <div className="export-filter-actions">
                                    <button type="button" className="btn btn-sm btn-secondary" onClick={() => setExportSelectionGroup('resultStatuses', [])}>
                                        Semua
                                    </button>
                                    <button type="button" className="btn btn-sm btn-secondary" onClick={() => setExportSelectionGroup('resultStatuses', ['unfilled', ...RESULT_STATUSES.map((item) => item.key)])}>
                                        Pilih Semua
                                    </button>
                                </div>
                                <div className="export-checklist">
                                    <label className="export-checklist-item">
                                        <input
                                            type="checkbox"
                                            checked={exportFilters.resultStatuses.includes('unfilled')}
                                            onChange={() => toggleExportSelection('resultStatuses', 'unfilled')}
                                        />
                                        <span>Belum Diisi</span>
                                    </label>
                                    {RESULT_STATUSES.map((item) => (
                                        <label key={item.key} className="export-checklist-item">
                                            <input
                                                type="checkbox"
                                                checked={exportFilters.resultStatuses.includes(item.key)}
                                                onChange={() => toggleExportSelection('resultStatuses', item.key)}
                                            />
                                            <span>{item.label}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>

                            {isAdmin ? (
                                <div className="input-group">
                                    <label>Sales</label>
                                    <div className="export-filter-actions">
                                        <button type="button" className="btn btn-sm btn-secondary" onClick={() => setExportSelectionGroup('salesIds', [])}>
                                            Semua
                                        </button>
                                        <button type="button" className="btn btn-sm btn-secondary" onClick={() => setExportSelectionGroup('salesIds', ['unassigned', ...salesUsers.map((sales) => sales.id)])}>
                                            Pilih Semua
                                        </button>
                                    </div>
                                    <div className="export-checklist">
                                        <label className="export-checklist-item">
                                            <input
                                                type="checkbox"
                                                checked={exportFilters.salesIds.includes('unassigned')}
                                                onChange={() => toggleExportSelection('salesIds', 'unassigned')}
                                            />
                                            <span>Belum Assigned</span>
                                        </label>
                                        {salesUsers.map((sales) => (
                                            <label key={sales.id} className="export-checklist-item">
                                                <input
                                                    type="checkbox"
                                                    checked={exportFilters.salesIds.includes(sales.id)}
                                                    onChange={() => toggleExportSelection('salesIds', sales.id)}
                                                />
                                                <span>{sales.name}</span>
                                            </label>
                                        ))}
                                    </div>
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
