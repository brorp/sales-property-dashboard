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
    normalizeResultStatusKey,
} from '../constants/crm';
import Header from '../components/Header';
import CustomerPipelineProgress from '../components/CustomerPipelineProgress';
import DatePicker from '../components/DatePicker';
import FileDropZone from '../components/FileDropZone';
import DateRangePicker from '../components/DateRangePicker';
import Select from '../components/Select';
import { usePagePolling } from '../hooks/usePagePolling';
import { apiRequest } from '../lib/api';
import { readLeadTransferWorkbook } from '../lib/lead-transfer-workbook';
import { DATE_PRESET_OPTIONS, getPresetRange, parseDateInput } from '../utils/datePresets';
import UserAvatar from '../components/UserAvatar';
import VerifiedIcon from '../components/VerifiedIcon';
import './LeadsPage.css';

const EMPTY_DATE_RANGE = { dateFrom: '', dateTo: '' };
const SPECIAL_SALES_STATUS_FILTERS = [
    { key: 'hot_validated', label: 'HOT | Validated' },
];
const DISTRIBUTION_FILTER_OPTIONS = [
    { key: 'unassigned', label: 'Unassigned' },
    ...FLOW_STATUSES,
];
const IMPORT_REASON_LABELS = {
    missing_identifier: 'Row tidak punya leadId atau phone.',
    phone_ambiguous: 'Nomor telepon cocok ke lebih dari satu lead.',
    lead_not_found: 'Lead tidak ditemukan di client target.',
    duplicate_row_for_lead: 'Lead yang sama muncul lebih dari sekali di file.',
    already_assigned_to_target: 'Lead sudah dimiliki sales target.',
    owner_changed_since_export: 'Owner lead berubah sejak file ini diekspor.',
};

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

function formatAppointmentDate(appt) {
    if (!appt || !appt.date) return '-';
    const parts = String(appt.date).split('-');
    if (parts.length === 3) {
        const year = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        const day = parseInt(parts[2], 10);
        const date = new Date(year, month, day);
        if (Number.isNaN(date.getTime())) return '-';
        const dateStr = date.toLocaleDateString('id-ID', {
            day: '2-digit',
            month: 'long',
            year: 'numeric',
        });
        return `${dateStr} · ${appt.time || '00:00'}`;
    }
    return `${appt.date} · ${appt.time || '00:00'}`;
}

function isAgentSource(value) {
    return String(value || '').trim().toLowerCase() === 'agent';
}

function matchesResultStatusFilter(actualValue, selectedValue) {
    const selected = String(selectedValue || 'all').trim().toLowerCase();
    const actual = String(actualValue || '').trim().toLowerCase();
    const normalizedSelected = normalizeResultStatusKey(selected);
    const normalizedActual = normalizeResultStatusKey(actual);

    if (selected === 'all') return true;
    if (selected === 'cancel') {
        return ['cancel_full_book', 'cancel_reserve', 'cancel_minat'].includes(normalizedActual);
    }
    return normalizedActual === normalizedSelected;
}

function matchesResultStatusMultiFilter(selectedValues, actualValue, fallbackValue = 'unfilled') {
    if (!Array.isArray(selectedValues) || selectedValues.length === 0) return true;
    const normalizedValues = selectedValues.map((value) => String(value || '').trim().toLowerCase());
    const actual = String(actualValue ?? fallbackValue).trim().toLowerCase();
    const normalizedActual = normalizeResultStatusKey(actual);
    if (normalizedValues.includes('cancel') && ['cancel_full_book', 'cancel_reserve', 'cancel_minat'].includes(normalizedActual)) return true;
    return normalizedValues.map(normalizeResultStatusKey).includes(normalizedActual);
}

function matchesMultiValueFilter(selectedValues, actualValue, fallbackValue = '') {
    if (!Array.isArray(selectedValues) || selectedValues.length === 0) return true;
    return selectedValues.includes(actualValue ?? fallbackValue);
}

function isHotValidatedLead(lead) {
    return lead?.salesStatus === 'hot' && Boolean(lead?.validated);
}

function matchesLeadFilters(lead, filters) {
    if (filters.flowStatus && filters.flowStatus.length > 0) {
        const matchesDistribution = filters.flowStatus.some((status) => {
            if (status === 'unassigned') {
                return !lead.assignedTo;
            }
            return lead.flowStatus === status;
        });
        if (!matchesDistribution) return false;
    }
    if (filters.salesStatus && filters.salesStatus.length > 0) {
        const matchSales = filters.salesStatus.some((status) => {
            if (status === 'hot_validated') {
                return isHotValidatedLead(lead);
            }
            return lead.salesStatus === status;
        });
        if (!matchSales) return false;
    }
    if (filters.resultStatus && filters.resultStatus.length > 0) {
        if (!matchesResultStatusMultiFilter(filters.resultStatus, lead.resultStatus, 'unfilled')) {
            return false;
        }
    }
    if (filters.appointmentTag && filters.appointmentTag.length > 0) {
        const actualTag = lead.appointmentTag || 'none';
        if (!filters.appointmentTag.includes(actualTag)) {
            return false;
        }
    }
    if (filters.salesId && filters.salesId.length > 0) {
        const actualSalesId = lead.assignedTo || 'unassigned';
        if (!filters.salesId.includes(actualSalesId)) {
            return false;
        }
    }
    return true;
}

function matchesLeadExportFilters(lead, filters) {
    if (filters.hotValidatedOnly && !isHotValidatedLead(lead)) return false;
    if (Array.isArray(filters.flowStatuses) && filters.flowStatuses.length > 0) {
        const matchesDistribution = filters.flowStatuses.some((status) => {
            if (status === 'unassigned') {
                return !lead.assignedTo;
            }
            return lead.flowStatus === status;
        });
        if (!matchesDistribution) return false;
    }
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
        leadsFilters,
        updateLeadsFilters,
        resetLeadsFilters
    } = useLeads();
    const router = useRouter();
    const searchParams = useSearchParams();

    const [refreshing, setRefreshing] = useState(false);
    const [showMobileFilter, setShowMobileFilter] = useState(false);

    const {
        search,
        flowFilter,
        salesStatusFilter,
        resultFilter,
        appointmentFilter,
        salesFilter,
        sourceFilter,
        incompleteDataFilter,
        appliedDateRange
    } = leadsFilters;

    const setSearch = (val) => updateLeadsFilters((prev) => ({ ...prev, search: typeof val === 'function' ? val(prev.search) : val }));
    const setFlowFilter = (val) => updateLeadsFilters((prev) => ({ ...prev, flowFilter: typeof val === 'function' ? val(prev.flowFilter) : val }));
    const setSalesStatusFilter = (val) => updateLeadsFilters((prev) => ({ ...prev, salesStatusFilter: typeof val === 'function' ? val(prev.salesStatusFilter) : val }));
    const setResultFilter = (val) => updateLeadsFilters((prev) => ({ ...prev, resultFilter: typeof val === 'function' ? val(prev.resultFilter) : val }));
    const setAppointmentFilter = (val) => updateLeadsFilters((prev) => ({ ...prev, appointmentFilter: typeof val === 'function' ? val(prev.appointmentFilter) : val }));
    const setSalesFilter = (val) => updateLeadsFilters((prev) => ({ ...prev, salesFilter: typeof val === 'function' ? val(prev.salesFilter) : val }));
    const setSourceFilter = (val) => updateLeadsFilters((prev) => ({ ...prev, sourceFilter: typeof val === 'function' ? val(prev.sourceFilter) : val }));
    const setIncompleteDataFilter = (val) => updateLeadsFilters((prev) => ({ ...prev, incompleteDataFilter: typeof val === 'function' ? val(prev.incompleteDataFilter) : val }));
    const setAppliedDateRange = (val) => updateLeadsFilters((prev) => ({ ...prev, appliedDateRange: typeof val === 'function' ? val(prev.appliedDateRange) : val }));

    useEffect(() => {
        const initialResultParam = searchParams?.get('resultFilter');
        if (initialResultParam) {
            updateLeadsFilters((prev) => {
                if (prev.resultFilter.length === 1 && prev.resultFilter[0] === initialResultParam) {
                    return prev;
                }
                return {
                    ...prev,
                    resultFilter: [initialResultParam]
                };
            });
        }
    }, [searchParams, updateLeadsFilters]);

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

    const [selectionMode, setSelectionMode] = useState(false);
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [showBulkEditSheet, setShowBulkEditSheet] = useState(false);
    const [showBulkDeleteSheet, setShowBulkDeleteSheet] = useState(false);
    const [bulkEditForm, setBulkEditForm] = useState({ salesStatus: '' });
    const [bulkEditLoading, setBulkEditLoading] = useState(false);
    const [bulkEditError, setBulkEditError] = useState('');
    const [bulkDeletePassword] = useState('');
    const [bulkDeleteLoading, setBulkDeleteLoading] = useState(false);
    const [bulkDeleteError, setBulkDeleteError] = useState('');

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
    const isCustomActive = hasActiveDateFilter && !DATE_PRESET_OPTIONS.some((r) => isPresetActive(r.value));

    const openDatePickerRef = useRef(null);
    const activePreset = DATE_PRESET_OPTIONS.find((r) => isPresetActive(r.value));
    const currentDateSelectValue = hasActiveDateFilter ? (activePreset?.value ?? 'custom') : '';
    const dateSelectOptions = [
        ...DATE_PRESET_OPTIONS.map((r) => ({ value: r.value, label: r.label })),
        { value: 'custom', label: isCustomActive ? formatRangeButtonLabel(appliedDateRange) : 'Custom' },
    ];
    const handleDateSelectChange = (v) => {
        if (!v) { setAppliedDateRange(EMPTY_DATE_RANGE); return; }
        if (v === 'custom') { openDatePickerRef.current?.(); return; }
        setAppliedDateRange(getPresetRange(v));
    };

    const hasAnyFilter = Boolean(
        search || hasActiveDateFilter ||
        flowFilter.length > 0 || salesStatusFilter.length > 0 ||
        resultFilter.length > 0 || appointmentFilter.length > 0 ||
        salesFilter.length > 0 || sourceFilter.length > 0 || incompleteDataFilter
    );

    const activeFilterCount = [
        hasActiveDateFilter,
        flowFilter.length > 0,
        salesStatusFilter.length > 0,
        resultFilter.length > 0,
        appointmentFilter.length > 0,
        salesFilter.length > 0,
        sourceFilter.length > 0,
        incompleteDataFilter,
    ].filter(Boolean).length;

    const resetAllFilters = () => {
        resetLeadsFilters();
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
            if (sourceFilter && sourceFilter.length > 0 && !sourceFilter.includes(lead.source)) return false;
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
        const now = new Date();
        const y = now.getFullYear();
        const mo = String(now.getMonth() + 1).padStart(2, '0');
        const d = String(now.getDate()).padStart(2, '0');
        const h = String(now.getHours()).padStart(2, '0');
        const min = String(now.getMinutes()).padStart(2, '0');
        const nowDateTimeLocal = `${y}-${mo}-${d}T${h}:${min}`;
        setSubmitError(''); setImportError(''); setImportSuccess('');
        setAddModalTab(tab);
        setNewLead((prev) => ({ ...prev, source: prev.source || leadSources[0]?.value || '', createdAt: nowDateTimeLocal }));
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
            flowStatuses: [...flowFilter],
            salesStatuses: salesStatusFilter.includes('hot_validated')
                ? ['hot', ...salesStatusFilter.filter((item) => item !== 'hot_validated')]
                : [...salesStatusFilter],
            hotValidatedOnly: salesStatusFilter.includes('hot_validated'),
            appointmentTags: [...appointmentFilter],
            resultStatuses: [...resultFilter],
            salesIds: [...salesFilter],
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
                { header: 'Sales Status', key: 'salesStatus', width: 16 }, { header: 'Janji Temu', key: 'appointmentTag', width: 16 },
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

    const exitSelectionMode = () => {
        setSelectionMode(false);
        setSelectedIds(new Set());
    };

    const toggleLeadSelection = (id) => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    const handleBulkEdit = async () => {
        if (!bulkEditForm.salesStatus) { setBulkEditError('Pilih Status L2 untuk diubah.'); return; }
        setBulkEditLoading(true);
        setBulkEditError('');
        try {
            const ids = Array.from(selectedIds);
            const result = await apiRequest('/api/leads/bulk-update', {
                method: 'POST',
                user,
                body: {
                    ids,
                    salesStatus: bulkEditForm.salesStatus,
                },
            });
            await refreshLeadsPage();
            if (result?.failed > 0) {
                setBulkEditError(`${result.updated || 0} lead berhasil, ${result.failed} gagal. Cek lead yang belum Accepted atau belum eligible status tersebut.`);
                return;
            }
            setShowBulkEditSheet(false);
            setSelectionMode(false);
            setSelectedIds(new Set());
            setBulkEditForm({ salesStatus: '' });
        } catch (err) {
            setBulkEditError(err instanceof Error ? err.message : 'Gagal memperbarui leads');
        } finally {
            setBulkEditLoading(false);
        }
    };

    const handleBulkDelete = async () => {
        setBulkDeleteLoading(true);
        setBulkDeleteError('');
        try {
            const ids = Array.from(selectedIds);
            // TODO: ganti dengan bulk API endpoint — DELETE /api/leads/bulk
            // const results = await Promise.allSettled(ids.map((id) => apiRequest(`/api/leads/${id}`, { method: 'DELETE', user, body: {} })));
            // const failed = results.filter((r) => r.status === 'rejected').length;
            // await refreshLeadsPage();
            // if (failed > 0) {
            //     setBulkDeleteError(`${ids.length - failed} berhasil dihapus, ${failed} gagal.`);
            // } else {
            //     setShowBulkDeleteSheet(false);
            //     exitSelectionMode();
            // }
            void ids;
            setBulkDeleteError('Bulk delete API belum tersedia.');
        } catch (err) {
            setBulkDeleteError(err instanceof Error ? err.message : 'Gagal menghapus leads');
        } finally {
            setBulkDeleteLoading(false);
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
                        {isAdmin ? (
                            <button
                                type="button"
                                className={`btn btn-sm btn-secondary${selectionMode ? ' is-active' : ''}`}
                                style={selectionMode ? { borderColor: 'var(--primary)', color: 'var(--primary)' } : undefined}
                                onClick={() => selectionMode ? exitSelectionMode() : setSelectionMode(true)}
                                title={selectionMode ? 'Keluar mode kelola' : 'Kelola leads'}
                            >
                                {selectionMode ? (
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                                ) : (
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="3" /><polyline points="9 12 11 14 15 10" /></svg>
                                )}
                                <span style={{ marginLeft: 6 }}>{selectionMode ? 'Batal' : 'Kelola'}</span>
                            </button>
                        ) : null}
                        {canExportLeads ? (
                            <button className="btn btn-sm btn-primary" onClick={openExportModal} title="Export">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 5 }}>
                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                    <polyline points="7 10 12 15 17 10" />
                                    <line x1="12" y1="15" x2="12" y2="3" />
                                </svg>
                                Ekspor
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
                    {isAdmin ? (
                        <button
                            type="button"
                            className={`leads-select-mob-btn${selectionMode ? ' is-active' : ''}`}
                            onClick={() => selectionMode ? exitSelectionMode() : setSelectionMode(true)}
                            title={selectionMode ? 'Keluar mode kelola' : 'Kelola leads'}
                        >
                            {selectionMode ? (
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                            ) : (
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="3" /><polyline points="9 12 11 14 15 10" /></svg>
                            )}
                        </button>
                    ) : null}
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
                    <Select
                        placeholder="Tanggal"
                        value={currentDateSelectValue}
                        onChange={handleDateSelectChange}
                        options={dateSelectOptions}
                    />
                    {availableLeadSources.length > 0 ? (
                        <Select
                            placeholder="Sumber"
                            value={sourceFilter}
                            onChange={setSourceFilter}
                            options={availableLeadSources.map((s) => ({ value: s, label: s }))}
                            multiple
                        />
                    ) : null}
                    <Select
                        placeholder="Status Prospek"
                        value={salesStatusFilter}
                        onChange={setSalesStatusFilter}
                        options={[...SPECIAL_SALES_STATUS_FILTERS, ...SALES_STATUSES].map((item) => ({ value: item.key, label: item.label }))}
                        multiple
                    />
                    <Select
                        placeholder="Janji Temu"
                        value={appointmentFilter}
                        onChange={setAppointmentFilter}
                        options={APPOINTMENT_TAGS.map((item) => ({ value: item.key, label: item.label }))}
                        multiple
                    />
                    <Select
                        placeholder="Hasil"
                        value={resultFilter}
                        onChange={setResultFilter}
                        options={RESULT_STATUSES.map((item) => ({ value: item.key, label: item.label }))}
                        multiple
                    />
                    {isAdmin ? (
                        <Select
                            placeholder="Sales"
                            value={salesFilter}
                            onChange={setSalesFilter}
                            options={salesUsers.map((s) => ({ value: s.id, label: s.isActive === false ? `${s.name} (Nonaktif)` : s.name }))}
                            multiple
                        />
                    ) : null}
                    <Select
                        placeholder="Distribusi"
                        value={flowFilter}
                        onChange={setFlowFilter}
                        options={DISTRIBUTION_FILTER_OPTIONS.map((item) => ({ value: item.key, label: item.label }))}
                        multiple
                    />
                    <Select
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
                    <div
                        key={lead.id}
                        className={`lc${selectionMode && selectedIds.has(lead.id) ? ' lc--selected' : ''}`}
                        onClick={() => { if (selectionMode) { toggleLeadSelection(lead.id); } else { router.push(`/leads/${lead.id}`); } }}
                    >
                        {selectionMode ? (
                            <div className={`lc-check-circle${selectedIds.has(lead.id) ? ' is-checked' : ''}`}>
                                {selectedIds.has(lead.id) ? (
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                                ) : null}
                            </div>
                        ) : (
                            <UserAvatar name={lead.name} src={lead.avatarUrl} size="xs" shape="circle" />
                        )}
                        <div className="lc-body">
                            <div className="lc-row1">
                                <span className="lc-name-wrap">
                                    <span className="lc-name">{lead.name}</span>
                                    {isHotValidatedLead(lead) && <VerifiedIcon size={14} className="lc-verified-badge" />}
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
                            <div className="lc-appointment-date">
                                Janji Temu: {lead.latestAppointment ? formatAppointmentDate(lead.latestAppointment) : '-'}
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

            {selectionMode ? (
                <div className="bulk-action-bar">
                    <div className="bulk-action-left">
                        <span className="bulk-action-count">
                            {selectedIds.size > 0 ? `${selectedIds.size} dipilih` : 'Pilih leads'}
                        </span>
                        <button
                            type="button"
                            className="bulk-action-select-all"
                            onClick={() => {
                                const allSelected = selectedIds.size === filteredLeads.length;
                                setSelectedIds(allSelected ? new Set() : new Set(filteredLeads.map((l) => l.id)));
                            }}
                        >
                            {selectedIds.size === filteredLeads.length ? 'Batal Semua' : 'Pilih Semua'}
                        </button>
                    </div>
                    <div className="bulk-action-icons">
                        <button
                            type="button"
                            className="bulk-action-icon-btn"
                            disabled={!selectedIds.size}
                            onClick={() => { setShowBulkEditSheet(true); setBulkEditError(''); }}
                            title="Edit leads terpilih"
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                            </svg>
                        </button>
                        <button
                            type="button"
                            className="bulk-action-icon-btn bulk-action-icon-btn--danger"
                            disabled={!selectedIds.size}
                            onClick={() => { setShowBulkDeleteSheet(true); setBulkDeleteError(''); }}
                            title="Hapus leads terpilih"
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="3 6 5 6 21 6" />
                                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                                <path d="M10 11v6" /><path d="M14 11v6" />
                                <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                            </svg>
                        </button>
                    </div>
                </div>
            ) : null}

            <div className={`fab-group${selectionMode ? ' fab-group--hidden' : ''}`}>
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
                                    <Select
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
                                        <Select
                                            placeholder="Biarkan Open"
                                            value={newLead.assignedTo}
                                            onChange={(v) => setNewLead({ ...newLead, assignedTo: v })}
                                            options={salesUsers.filter((s) => s.isActive !== false).map((s) => ({ value: s.id, label: s.name }))}
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
                                    <Select
                                        placeholder="Pilih sales target"
                                        value={importTargetSalesId}
                                        onChange={(v) => setImportTargetSalesId(v)}
                                        options={salesUsers.filter((s) => s.isActive !== false).map((s) => ({ value: s.id, label: s.name }))}
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
                                            <div className="team-summary-card team-summary-default"><span className="team-summary-label">Total Baris</span><strong className="team-summary-value">{importResult.summary?.totalRows || 0}</strong></div>
                                            <div className="team-summary-card team-summary-success"><span className="team-summary-label">Diperbarui</span><strong className="team-summary-value">{importResult.summary?.updated || 0}</strong></div>
                                            <div className="team-summary-card team-summary-warm"><span className="team-summary-label">Dilewati</span><strong className="team-summary-value">{importResult.summary?.skipped || 0}</strong></div>
                                            <div className="team-summary-card team-summary-hot"><span className="team-summary-label">Error</span><strong className="team-summary-value">{importResult.summary?.errors || 0}</strong></div>
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
                            <div className="leads-filter-sheet-group">
                                <span className="leads-filter-sheet-label">Data Masuk</span>
                                <Select
                                    placeholder="Tanggal"
                                    value={currentDateSelectValue}
                                    onChange={handleDateSelectChange}
                                    options={dateSelectOptions}
                                />
                                {availableLeadSources.length > 0 ? (
                                    <Select
                                        placeholder="Sumber"
                                        value={sourceFilter}
                                        onChange={setSourceFilter}
                                        options={availableLeadSources.map((s) => ({ value: s, label: s }))}
                                        multiple
                                    />
                                ) : null}
                            </div>

                            <div className="leads-filter-sheet-group">
                                <span className="leads-filter-sheet-label">Status & Hasil</span>
                                <Select
                                    placeholder="Status Prospek"
                                    value={salesStatusFilter}
                                    onChange={setSalesStatusFilter}
                                    options={[...SPECIAL_SALES_STATUS_FILTERS, ...SALES_STATUSES].map((item) => ({ value: item.key, label: item.label }))}
                                    multiple
                                />
                                <Select
                                    placeholder="Janji Temu"
                                    value={appointmentFilter}
                                    onChange={setAppointmentFilter}
                                    options={APPOINTMENT_TAGS.map((item) => ({ value: item.key, label: item.label }))}
                                    multiple
                                />
                                <Select
                                    placeholder="Hasil"
                                    value={resultFilter}
                                    onChange={setResultFilter}
                                    options={RESULT_STATUSES.map((item) => ({ value: item.key, label: item.label }))}
                                    multiple
                                />
                            </div>

                            <div className="leads-filter-sheet-group">
                                <span className="leads-filter-sheet-label">Owner & Distribusi</span>
                                {isAdmin ? (
                                    <Select
                                        placeholder="Sales"
                                        value={salesFilter}
                                        onChange={setSalesFilter}
                                        options={salesUsers.map((s) => ({ value: s.id, label: s.isActive === false ? `${s.name} (Nonaktif)` : s.name }))}
                                        multiple
                                    />
                                ) : null}
                                <Select
                                    placeholder="Distribusi"
                                    value={flowFilter}
                                    onChange={setFlowFilter}
                                    options={DISTRIBUTION_FILTER_OPTIONS.map((item) => ({ value: item.key, label: item.label }))}
                                    multiple
                                />
                            </div>

                            <div className="leads-filter-sheet-group">
                                <span className="leads-filter-sheet-label">Kualitas Data</span>
                                <Select
                                    placeholder="Kelengkapan Data"
                                    value={incompleteDataFilter ? 'incomplete' : ''}
                                    onChange={(v) => setIncompleteDataFilter(v === 'incomplete')}
                                    options={[{ value: 'incomplete', label: 'Data Tidak Lengkap' }]}
                                />
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                            <button type="button" className="btn btn-ghost" style={{ flex: 1 }} onClick={() => { resetAllFilters(); setShowMobileFilter(false); }}>Reset Semua</button>
                            <button type="button" className="btn btn-primary" style={{ flex: 1 }} onClick={() => setShowMobileFilter(false)}>Tutup</button>
                        </div>
                    </div>
                </div>
            ) : null}

            {/* ── Bulk edit sheet ────────────────────────────── */}
            {showBulkEditSheet ? (
                <div className="sheet-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowBulkEditSheet(false); }}>
                    <div className="bottom-sheet">
                        <div className="sheet-handle" />
                        <h2>Edit {selectedIds.size} Leads</h2>
                        <p className="settings-help">Bulk edit saat ini mendukung update Status L2.</p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            <div className="input-group">
                                <label>Status L2</label>
                                <Select
                                    placeholder="Biarkan tidak berubah"
                                    value={bulkEditForm.salesStatus}
                                    onChange={(v) => setBulkEditForm((prev) => ({ ...prev, salesStatus: v }))}
                                    options={SALES_STATUSES.map((s) => ({ value: s.key, label: s.label }))}
                                    variant="white"
                                />
                            </div>
                            {bulkEditError ? <div className="login-error">{bulkEditError}</div> : null}
                            <div style={{ display: 'flex', gap: 10 }}>
                                <button type="button" className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setShowBulkEditSheet(false)}>Batal</button>
                                <button type="button" className="btn btn-primary" style={{ flex: 1 }} onClick={() => void handleBulkEdit()} disabled={bulkEditLoading}>
                                    {bulkEditLoading ? 'Menyimpan...' : 'Simpan Perubahan'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            ) : null}

            {/* ── Bulk delete sheet ──────────────────────────── */}
            {showBulkDeleteSheet ? (
                <div className="sheet-overlay" onClick={(e) => { if (e.target === e.currentTarget) { setShowBulkDeleteSheet(false); setBulkDeleteError(''); } }}>
                    <div className="bottom-sheet">
                        <div className="sheet-handle" />
                        <h2>Hapus {selectedIds.size} Leads?</h2>
                        <p className="settings-help">
                            <strong>{selectedIds.size} leads</strong> yang dipilih akan dihapus secara permanen. Tindakan ini tidak dapat dibatalkan.
                        </p>
                        {bulkDeleteError ? <div className="login-error" style={{ marginBottom: 4 }}>{bulkDeleteError}</div> : null}
                        <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                            <button type="button" className="btn btn-ghost" style={{ flex: 1 }} onClick={() => { setShowBulkDeleteSheet(false); setBulkDeleteError(''); }}>Batal</button>
                            <button type="button" className="btn btn-danger" style={{ flex: 1 }} onClick={() => void handleBulkDelete()} disabled={bulkDeleteLoading}>
                                {bulkDeleteLoading ? 'Menghapus...' : `Hapus ${selectedIds.size} Leads`}
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}

            {/* ── Export modal ───────────────────────────────── */}
            {showExportModal ? (
                <div className="sheet-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowExportModal(false); }}>
                    <div className="bottom-sheet">
                        <div className="sheet-handle" />
                        <h2>Ekspor Leads (XLSX)</h2>
                        <form onSubmit={handleExportLeads} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                            <div className="input-group">
                                <label>Kode Akses Ekspor</label>
                                <input type="password" className="input-field" value={exportAccessCode} onChange={(event) => setExportAccessCode(event.target.value)} placeholder="Masukkan kode akses ekspor" required />
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
                                        <input type="checkbox" checked={isAllSelected('flowStatuses', DISTRIBUTION_FILTER_OPTIONS.map((i) => i.key))} ref={(el) => { if (el) el.indeterminate = isSomeSelected('flowStatuses', DISTRIBUTION_FILTER_OPTIONS.map((i) => i.key)); }} onChange={() => toggleSelectAll('flowStatuses', DISTRIBUTION_FILTER_OPTIONS.map((i) => i.key))} />
                                        <span>Pilih Semua</span>
                                    </label>
                                    {DISTRIBUTION_FILTER_OPTIONS.map((item) => (
                                        <label key={item.key} className="export-checklist-item">
                                            <input type="checkbox" checked={exportFilters.flowStatuses.includes(item.key)} onChange={() => toggleExportSelection('flowStatuses', item.key)} />
                                            <span>{item.label}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                            <div className="input-group">
                                <label>Status Prospek</label>
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
                                <label>Status Janji Temu</label>
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
                                <label>Status Hasil</label>
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
                                                <span>{sales.isActive === false ? `${sales.name} (Nonaktif)` : sales.name}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            ) : null}
                            <p className="leads-result-count" style={{ marginBottom: 0 }}>{exportLeads.length} leads akan diekspor</p>
                            {exportError ? <div className="login-error">{exportError}</div> : null}
                            <button type="submit" className="btn btn-primary btn-full" disabled={exporting}>{exporting ? 'Mengekspor...' : 'Ekspor XLSX'}</button>
                            <button type="button" className="btn btn-secondary btn-full" onClick={() => setShowExportModal(false)}>Batal</button>
                        </form>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
