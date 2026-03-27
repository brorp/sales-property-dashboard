'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
    getStatusBadgeClass,
    getTimeAgo,
} from '../constants/crm';
import Header from '../components/Header';
import CustomerPipelineProgress from '../components/CustomerPipelineProgress';
import PickerTriggerField from '../components/PickerTriggerField';
import { usePagePolling } from '../hooks/usePagePolling';
import { apiRequest } from '../lib/api';
import { readLeadTransferWorkbook } from '../lib/lead-transfer-workbook';

const DAY_LABELS = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];
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
const FIXED_LEAD_SOURCES = ['Online', 'Offline', 'Walk In', 'Agent', 'Old', 'Pribadi'];

const IMPORT_REASON_LABELS = {
    missing_identifier: 'Row tidak punya leadId atau phone.',
    phone_ambiguous: 'Nomor telepon cocok ke lebih dari satu lead.',
    lead_not_found: 'Lead tidak ditemukan di client target.',
    duplicate_row_for_lead: 'Lead yang sama muncul lebih dari sekali di file.',
    already_assigned_to_target: 'Lead sudah dimiliki sales target.',
    owner_changed_since_export: 'Owner lead berubah sejak file ini diexport.',
};

function startOfMonth(date) {
    return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date, amount) {
    return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

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

function isSameDay(a, b) {
    if (!a || !b) {
        return false;
    }

    return (
        a.getFullYear() === b.getFullYear() &&
        a.getMonth() === b.getMonth() &&
        a.getDate() === b.getDate()
    );
}

function isDateBetween(date, start, end) {
    if (!date || !start || !end) {
        return false;
    }

    return date.getTime() > start.getTime() && date.getTime() < end.getTime();
}

function buildMonthDays(monthDate) {
    const firstDayOfMonth = startOfMonth(monthDate);
    const weekDayOffset = (firstDayOfMonth.getDay() + 6) % 7;
    const gridStart = new Date(firstDayOfMonth);
    gridStart.setDate(firstDayOfMonth.getDate() - weekDayOffset);

    return Array.from({ length: 42 }, (_, index) => {
        const next = new Date(gridStart);
        next.setDate(gridStart.getDate() + index);
        return next;
    });
}

function formatMonthLabel(date) {
    return new Intl.DateTimeFormat('id-ID', {
        month: 'long',
        year: 'numeric',
    }).format(date);
}

function formatRangeButtonLabel(range) {
    if (!range.dateFrom && !range.dateTo) {
        return 'Filter Tanggal';
    }

    const formatter = new Intl.DateTimeFormat('id-ID', {
        day: 'numeric',
        month: 'short',
    });

    const start = parseDateInput(range.dateFrom);
    const end = parseDateInput(range.dateTo || range.dateFrom);
    if (!start || !end) {
        return 'Filter Tanggal';
    }

    return `${formatter.format(start)} - ${formatter.format(end)}`;
}

function formatRangeSummary(range) {
    if (!range.dateFrom && !range.dateTo) {
        return 'Semua data lead masuk';
    }

    const formatter = new Intl.DateTimeFormat('id-ID', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
    });

    const start = parseDateInput(range.dateFrom);
    const end = parseDateInput(range.dateTo || range.dateFrom);
    if (!start || !end) {
        return 'Semua data lead masuk';
    }

    return `Lead masuk ${formatter.format(start)} - ${formatter.format(end)}`;
}

function formatDatePreview(value) {
    const parsed = parseDateInput(value);
    if (!parsed) {
        return 'Pilih tanggal';
    }

    return new Intl.DateTimeFormat('id-ID', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
    }).format(parsed);
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

function matchesLeadExportFilters(lead, filters) {
    if (!matchesMultiValueFilter(filters.flowStatuses, lead.flowStatus)) {
        return false;
    }

    if (!matchesMultiValueFilter(filters.salesStatuses, lead.salesStatus, 'unfilled')) {
        return false;
    }

    if (!matchesMultiValueFilter(filters.resultStatuses, lead.resultStatus, 'unfilled')) {
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
        refreshTeamStats,
        refreshDashboardAnalytics,
    } = useLeads();
    const router = useRouter();
    const filterRef = useRef(null);
    const [refreshing, setRefreshing] = useState(false);
    const [search, setSearch] = useState('');
    const [flowFilter, setFlowFilter] = useState('all');
    const [salesStatusFilter, setSalesStatusFilter] = useState('all');
    const [resultFilter, setResultFilter] = useState('all');
    const [appointmentFilter, setAppointmentFilter] = useState('all');
    const [salesFilter, setSalesFilter] = useState('all');
    const [sourceFilter, setSourceFilter] = useState('all');
    const [showAddModal, setShowAddModal] = useState(false);
    const [showExportModal, setShowExportModal] = useState(false);
    const [filterOpen, setFilterOpen] = useState(false);
    const [appliedDateRange, setAppliedDateRange] = useState(EMPTY_DATE_RANGE);
    const [draftDateRange, setDraftDateRange] = useState(EMPTY_DATE_RANGE);
    const [calendarMonth, setCalendarMonth] = useState(() => startOfMonth(new Date()));
    const [newLead, setNewLead] = useState({ name: '', phone: '', source: '', assignedTo: '' });
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
    const [exporting, setExporting] = useState(false);
    const [exportError, setExportError] = useState('');
    const [exportAccessCode, setExportAccessCode] = useState('');
    const [exportFilters, setExportFilters] = useState({
        dateFrom: '',
        dateTo: '',
        flowStatuses: [],
        salesStatuses: [],
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
    const draftStartDate = parseDateInput(draftDateRange.dateFrom);
    const draftEndDate = parseDateInput(draftDateRange.dateTo);
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

        FIXED_LEAD_SOURCES.forEach((value) => {
            values.add(value);
        });

        return Array.from(values).sort((a, b) => a.localeCompare(b));
    }, [allLeads, leadSources]);

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

            return matchesLeadFilters(lead, {
                flowStatus: flowFilter,
                salesStatus: salesStatusFilter,
                resultStatus: resultFilter,
                appointmentTag: appointmentFilter,
                salesId: salesFilter,
            });
        }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }, [allLeads, appliedDateRange.dateFrom, appliedDateRange.dateTo, appointmentFilter, flowFilter, resultFilter, salesFilter, salesStatusFilter, search, sourceFilter]);

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
        ]);
    }, [refreshLeads, refreshSalesUsers]);

    usePagePolling({
        enabled: Boolean(user),
        intervalMs: 3000,
        run: refreshLeadsPage,
    });

    const handleAddLead = async (e) => {
        e.preventDefault();
        if (!newLead.name || !newLead.phone || !newLead.source) return;

        setSubmitLoading(true);
        setSubmitError('');
        try {
            await addLead({
                name: newLead.name,
                phone: newLead.phone,
                source: newLead.source,
                assignedTo: newLead.assignedTo || null,
            });
            setNewLead({ name: '', phone: '', source: '', assignedTo: '' });
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

    const openDateFilter = () => {
        const nextDraft = normalizeDateRange(appliedDateRange);
        setDraftDateRange(nextDraft);
        setCalendarMonth(startOfMonth(parseDateInput(nextDraft.dateFrom) || new Date()));
        setFilterOpen(true);
    };

    const handleDateSelection = (date) => {
        const pickedDate = formatDateInput(date);

        setDraftDateRange((prev) => {
            const start = parseDateInput(prev.dateFrom);
            const end = parseDateInput(prev.dateTo);

            if (!start || (start && end)) {
                return {
                    dateFrom: pickedDate,
                    dateTo: '',
                };
            }

            if (date.getTime() < start.getTime()) {
                return {
                    dateFrom: pickedDate,
                    dateTo: prev.dateFrom,
                };
            }

            return {
                dateFrom: prev.dateFrom,
                dateTo: pickedDate,
            };
        });
    };

    const handleQuickRange = (key) => {
        const nextRange = getPresetRange(key);
        setDraftDateRange(nextRange);
        setCalendarMonth(startOfMonth(parseDateInput(nextRange.dateFrom) || new Date()));
    };

    const handleApplyDateFilter = () => {
        const nextRange = normalizeDateRange({
            dateFrom: draftDateRange.dateFrom,
            dateTo: draftDateRange.dateTo || draftDateRange.dateFrom,
        });

        setAppliedDateRange(nextRange);
        setDraftDateRange(nextRange);
        setFilterOpen(false);
    };

    const handleClearDateFilter = () => {
        setAppliedDateRange({ ...EMPTY_DATE_RANGE });
        setDraftDateRange({ ...EMPTY_DATE_RANGE });
        setFilterOpen(false);
    };

    const openExportModal = () => {
        setExportError('');
        setExportAccessCode('');
        setExportFilters({
            dateFrom: '',
            dateTo: '',
            flowStatuses: toInitialExportSelection(flowFilter),
            salesStatuses: toInitialExportSelection(salesStatusFilter),
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
            setExportAccessCode('');
        } catch (err) {
            setExportError(err instanceof Error ? err.message : 'Gagal export XLSX');
        } finally {
            setExporting(false);
        }
    };

    useEffect(() => {
        if (!filterOpen) {
            return undefined;
        }

        const handlePointerDown = (event) => {
            if (filterRef.current && !filterRef.current.contains(event.target)) {
                setFilterOpen(false);
            }
        };

        document.addEventListener('mousedown', handlePointerDown);
        return () => document.removeEventListener('mousedown', handlePointerDown);
    }, [filterOpen]);

    return (
        <div className="page-container">
            <Header
                title="Leads"
                rightAction={(
                    <>
                        <div className="dashboard-filter-shell" ref={filterRef}>
                            <button
                                type="button"
                                className={`btn btn-sm ${hasActiveDateFilter ? 'btn-primary' : 'btn-secondary'} dashboard-filter-trigger`}
                                onClick={() => {
                                    if (filterOpen) {
                                        setFilterOpen(false);
                                        return;
                                    }
                                    openDateFilter();
                                }}
                            >
                                {formatRangeButtonLabel(appliedDateRange)}
                            </button>

                            {filterOpen ? (
                                <div className="dashboard-filter-popover">
                                    <div className="dashboard-filter-popover-head">
                                        <div>
                                            <h3>Pilih Rentang Tanggal</h3>
                                            <p>Filter semua data leads berdasarkan tanggal masuk.</p>
                                        </div>
                                        <button
                                            type="button"
                                            className="dashboard-filter-close"
                                            onClick={() => setFilterOpen(false)}
                                            aria-label="Tutup filter"
                                        >
                                            ×
                                        </button>
                                    </div>

                                    <div className="dashboard-filter-preview">
                                        <div className="dashboard-filter-preview-card">
                                            <span>Mulai</span>
                                            <strong>{formatDatePreview(draftDateRange.dateFrom)}</strong>
                                        </div>
                                        <div className="dashboard-filter-preview-card">
                                            <span>Sampai</span>
                                            <strong>{formatDatePreview(draftDateRange.dateTo || draftDateRange.dateFrom)}</strong>
                                        </div>
                                    </div>

                                    <div className="dashboard-filter-quick">
                                        {QUICK_RANGES.map((preset) => (
                                            <button
                                                key={preset.key}
                                                type="button"
                                                className="dashboard-quick-pill"
                                                onClick={() => handleQuickRange(preset.key)}
                                            >
                                                {preset.label}
                                            </button>
                                        ))}
                                    </div>

                                    <div className="dashboard-calendar-head">
                                        <button
                                            type="button"
                                            className="dashboard-calendar-nav"
                                            onClick={() => setCalendarMonth((prev) => addMonths(prev, -1))}
                                            aria-label="Bulan sebelumnya"
                                        >
                                            ←
                                        </button>
                                        <div className="dashboard-calendar-head-label">Calendar Range</div>
                                        <button
                                            type="button"
                                            className="dashboard-calendar-nav"
                                            onClick={() => setCalendarMonth((prev) => addMonths(prev, 1))}
                                            aria-label="Bulan berikutnya"
                                        >
                                            →
                                        </button>
                                    </div>

                                    <div className="dashboard-calendar-grid">
                                        {[0, 1].map((offset) => {
                                            const monthDate = addMonths(calendarMonth, offset);
                                            const days = buildMonthDays(monthDate);

                                            return (
                                                <div key={formatMonthLabel(monthDate)} className="dashboard-calendar-month">
                                                    <div className="dashboard-calendar-month-title">{formatMonthLabel(monthDate)}</div>
                                                    <div className="dashboard-calendar-weekdays">
                                                        {DAY_LABELS.map((dayLabel) => (
                                                            <span key={dayLabel}>{dayLabel}</span>
                                                        ))}
                                                    </div>
                                                    <div className="dashboard-calendar-days">
                                                        {days.map((day) => {
                                                            const isOutsideMonth = day.getMonth() !== monthDate.getMonth();
                                                            const isStart = isSameDay(day, draftStartDate);
                                                            const isEnd = isSameDay(day, draftEndDate);
                                                            const isInRange = isDateBetween(day, draftStartDate, draftEndDate);
                                                            const isToday = isSameDay(day, new Date());

                                                            return (
                                                                <button
                                                                    key={`${formatMonthLabel(monthDate)}-${formatDateInput(day)}`}
                                                                    type="button"
                                                                    className={[
                                                                        'dashboard-calendar-day',
                                                                        isOutsideMonth ? 'is-outside' : '',
                                                                        isToday ? 'is-today' : '',
                                                                        isInRange ? 'is-in-range' : '',
                                                                        isStart ? 'is-start' : '',
                                                                        isEnd ? 'is-end' : '',
                                                                    ].filter(Boolean).join(' ')}
                                                                    onClick={() => handleDateSelection(day)}
                                                                >
                                                                    {day.getDate()}
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>

                                    <div className="dashboard-filter-actions">
                                        <button
                                            type="button"
                                            className="btn btn-sm btn-secondary"
                                            onClick={handleClearDateFilter}
                                        >
                                            Reset
                                        </button>
                                        <button
                                            type="button"
                                            className="btn btn-sm btn-primary"
                                            onClick={handleApplyDateFilter}
                                            disabled={!draftDateRange.dateFrom}
                                        >
                                            Apply
                                        </button>
                                    </div>
                                </div>
                            ) : null}
                        </div>
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
            <div className="dashboard-filter-summary" style={{ marginBottom: 12 }}>
                <span className="badge badge-purple">{hasActiveDateFilter ? 'Range Active' : 'All Data'}</span>
                <span>{formatRangeSummary(appliedDateRange)}</span>
            </div>
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

            <div className="input-group" style={{ marginBottom: 16 }}>
                <label>Filter Source</label>
                <select className="input-field" value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)}>
                    <option value="all">Semua Source</option>
                    {availableLeadSources.map((value) => (
                        <option key={value} value={value}>{value}</option>
                    ))}
                </select>
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
                                <span className={`badge ${getStatusBadgeClass('flow', lead.flowStatus)}`}>{getFlowStatusLabel(lead.flowStatus)}</span>
                                {lead.salesStatus ? <span className={`badge ${getStatusBadgeClass('sales', lead.salesStatus)}`}>{getSalesStatusLabel(lead.salesStatus)}</span> : null}
                                {lead.resultStatus ? <span className={`badge ${getStatusBadgeClass('result', lead.resultStatus)}`}>{getResultStatusLabel(lead.resultStatus)}</span> : null}
                                {lead.appointmentTag && lead.appointmentTag !== 'none' ? <span className={`badge ${getStatusBadgeClass('appointment', lead.appointmentTag)}`}>{getAppointmentTagLabel(lead.appointmentTag)}</span> : null}
                                <span className="leads-card-name">{lead.name}</span>
                            </div>
                            <span className="leads-card-time">{getTimeAgo(lead.createdAt)}</span>
                        </div>
                        <div className="leads-card-details">
                            <span>📱 {lead.phone}</span>
                            <span>📣 {lead.source}</span>
                            {lead.domicileCity ? <span>🏙️ {lead.domicileCity}</span> : null}
                        </div>
                        {lead.customerPipelineTotalSteps > 0 ? (
                            <div className="leads-card-pipeline">
                                <span className="leads-card-pipeline-label">Customer Pipeline</span>
                                <CustomerPipelineProgress
                                    completed={lead.customerPipelineCompletedCount}
                                    total={lead.customerPipelineTotalSteps}
                                    compact
                                />
                            </div>
                        ) : null}
                        {isAdmin ? <div className="leads-card-sales">Sales: {getSalesNameById(lead.assignedTo)}</div> : null}
                    </div>
                ))}
            </div>

            <button className="fab" onClick={() => openAddLeadModal('manual')}>＋</button>

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
                                    <select className="input-field" value={newLead.source} onChange={(e) => setNewLead({ ...newLead, source: e.target.value })} required>
                                        <option value="">Pilih source lead</option>
                                        {availableLeadSources.map((source) => (
                                            <option key={source} value={source}>{source}</option>
                                        ))}
                                    </select>
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
                                    <PickerTriggerField
                                        type="date"
                                        label="Dari"
                                        value={exportFilters.dateFrom}
                                        onChange={(e) => setExportFilters((prev) => ({ ...prev, dateFrom: e.target.value }))}
                                    />
                                    <PickerTriggerField
                                        type="date"
                                        label="Sampai"
                                        value={exportFilters.dateTo}
                                        onChange={(e) => setExportFilters((prev) => ({ ...prev, dateTo: e.target.value }))}
                                    />
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
                                    <button type="button" className="btn btn-sm btn-secondary" onClick={() => setExportSelectionGroup('salesStatuses', [])}>
                                        Semua
                                    </button>
                                    <button type="button" className="btn btn-sm btn-secondary" onClick={() => setExportSelectionGroup('salesStatuses', ['unfilled', ...SALES_STATUSES.map((item) => item.key)])}>
                                        Pilih Semua
                                    </button>
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
