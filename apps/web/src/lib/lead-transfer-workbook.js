'use client';

const WORKBOOK_COLUMNS = [
    { key: 'leadId', header: 'Lead ID', width: 30 },
    { key: 'name', header: 'Nama Lead', width: 24 },
    { key: 'phone', header: 'Nomor WhatsApp', width: 20 },
    { key: 'source', header: 'Source', width: 18 },
    { key: 'entryChannel', header: 'Entry Channel', width: 18 },
    { key: 'metaLeadId', header: 'Meta Lead ID', width: 24 },
    { key: 'clientId', header: 'Client ID', width: 22 },
    { key: 'currentSalesId', header: 'Current Sales ID', width: 24 },
    { key: 'currentSalesName', header: 'Current Sales Name', width: 24 },
    { key: 'currentSalesEmail', header: 'Current Sales Email', width: 28 },
    { key: 'currentSalesPhone', header: 'Current Sales Phone', width: 20 },
    { key: 'flowStatus', header: 'Flow Status', width: 16 },
    { key: 'salesStatus', header: 'Sales Status', width: 16 },
    { key: 'resultStatus', header: 'Result Status', width: 16 },
    { key: 'clientStatus', header: 'Client Status', width: 16 },
    { key: 'layer2Status', header: 'Layer 2 Status', width: 18 },
    { key: 'progress', header: 'Progress', width: 16 },
    { key: 'domicileCity', header: 'Domisili', width: 18 },
    { key: 'interestProjectType', header: 'Interest Project Type', width: 22 },
    { key: 'interestUnitName', header: 'Interest Unit Name', width: 22 },
    { key: 'rejectedReason', header: 'Rejected Reason', width: 22 },
    { key: 'rejectedNote', header: 'Rejected Note', width: 28 },
    { key: 'receivedAt', header: 'Received At', width: 22 },
    { key: 'createdAt', header: 'Created At', width: 22 },
    { key: 'updatedAt', header: 'Updated At', width: 22 },
];

async function loadExcelJs() {
    return import('exceljs');
}

function triggerDownload(blob, fileName) {
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.URL.revokeObjectURL(url);
}

export async function downloadLeadTransferWorkbook({ fileName, rows }) {
    const ExcelJS = await loadExcelJs();
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Property Lounge CRM';
    workbook.created = new Date();
    const worksheet = workbook.addWorksheet('Leads Export');

    worksheet.columns = WORKBOOK_COLUMNS;
    worksheet.getRow(1).font = { bold: true };

    (rows || []).forEach((row) => {
        const item = row && typeof row === 'object' ? row : {};
        worksheet.addRow(
            WORKBOOK_COLUMNS.reduce((acc, column) => ({
                ...acc,
                [column.key]: item[column.key] ?? '',
            }), {})
        );
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob(
        [buffer],
        { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }
    );

    triggerDownload(blob, fileName || `leads-export-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

function toCellValue(cellValue) {
    if (cellValue === null || cellValue === undefined) {
        return '';
    }

    if (typeof cellValue === 'object' && cellValue !== null && 'text' in cellValue) {
        return String(cellValue.text || '').trim();
    }

    return String(cellValue).trim();
}

export async function readLeadTransferWorkbook(file) {
    const ExcelJS = await loadExcelJs();
    const workbook = new ExcelJS.Workbook();
    const buffer = await file.arrayBuffer();
    await workbook.xlsx.load(buffer);

    const worksheet = workbook.worksheets[0];
    if (!worksheet) {
        throw new Error('Worksheet export tidak ditemukan.');
    }

    const headerValues = worksheet.getRow(1).values;
    const headers = Array.isArray(headerValues)
        ? headerValues.slice(1).map(toCellValue)
        : [];

    const headerMap = new Map();
    WORKBOOK_COLUMNS.forEach((column) => {
        headerMap.set(column.header, column.key);
        headerMap.set(column.key, column.key);
    });

    const normalizedKeys = headers.map((header) => headerMap.get(header) || header);
    const rows = [];

    for (let rowIndex = 2; rowIndex <= worksheet.rowCount; rowIndex += 1) {
        const row = worksheet.getRow(rowIndex);
        const values = Array.isArray(row.values) ? row.values.slice(1) : [];
        const item = {};
        let hasData = false;

        normalizedKeys.forEach((key, index) => {
            const value = toCellValue(values[index]);
            item[key] = value;
            if (value) {
                hasData = true;
            }
        });

        if (hasData) {
            rows.push(item);
        }
    }

    return {
        fileName: file?.name || 'leads-import.xlsx',
        rows,
    };
}
