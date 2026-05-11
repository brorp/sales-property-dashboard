'use client';

import CustomerPipelineProgress from './CustomerPipelineProgress';
import {
    getAppointmentTagLabel,
    getFlowStatusLabel,
    getResultStatusLabel,
    getSalesStatusLabel,
    getTimeAgo,
} from '../constants/crm';

function flowBadgeClass(status) {
    if (status === 'assigned') return 'lc2-badge lc2-badge-blue';
    if (status === 'accepted') return 'lc2-badge lc2-badge-amber';
    if (status === 'hold') return 'lc2-badge lc2-badge-purple';
    return 'lc2-badge lc2-badge-navy';
}

function salesBadgeClass(status) {
    if (status === 'hot') return 'lc2-badge lc2-badge-red';
    if (status === 'warm') return 'lc2-badge lc2-badge-orange';
    if (status === 'cold') return 'lc2-badge lc2-badge-sky';
    return 'lc2-badge lc2-badge-muted';
}

function resultBadgeClass(status) {
    if (status === 'full_book' || status === 'akad') return 'lc2-badge lc2-badge-green';
    if (status === 'reserve') return 'lc2-badge lc2-badge-navy';
    if (status === 'on_process') return 'lc2-badge lc2-badge-amber';
    if (status?.startsWith('cancel')) return 'lc2-badge lc2-badge-red';
    return 'lc2-badge lc2-badge-muted';
}

function apptBadgeClass(tag) {
    if (tag === 'sudah_survey') return 'lc2-badge lc2-badge-green';
    if (tag === 'dibatalkan') return 'lc2-badge lc2-badge-red';
    return 'lc2-badge lc2-badge-amber';
}

function PhoneIcon() {
    return (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.62 3.38 2 2 0 0 1 3.6 1.21h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91A16 16 0 0 0 14 15.91l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
        </svg>
    );
}

function MegaphoneIcon() {
    return (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 11l19-9-9 19-2-8-8-2z"/>
        </svg>
    );
}

function BuildingIcon() {
    return (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
            <polyline points="9 22 9 12 15 12 15 22"/>
        </svg>
    );
}

function MapPinIcon() {
    return (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
            <circle cx="12" cy="10" r="3"/>
        </svg>
    );
}

export default function LeadCardV2({ lead, onClick, salesName, showSales }) {
    const isHotValidated = lead?.salesStatus === 'hot' && Boolean(lead?.validated);

    return (
        <div
            className="lc2"
            role="button"
            tabIndex={0}
            onClick={onClick}
            onKeyDown={(e) => e.key === 'Enter' && onClick?.()}
        >
            <div className="lc2-top">
                <span className="lc2-name">{lead.name}</span>
                <span className="lc2-time">{getTimeAgo(lead.createdAt)}</span>
            </div>

            <div className="lc2-badges">
                <span className={flowBadgeClass(lead.flowStatus)}>{getFlowStatusLabel(lead.flowStatus)}</span>
                {isHotValidated ? (
                    <>
                        <span className="lc2-badge lc2-badge-red">HOT</span>
                        <span className="lc2-badge lc2-badge-green">✓ Validated</span>
                    </>
                ) : lead.salesStatus ? (
                    <span className={salesBadgeClass(lead.salesStatus)}>{getSalesStatusLabel(lead.salesStatus)}</span>
                ) : null}
                {lead.resultStatus ? (
                    <span className={resultBadgeClass(lead.resultStatus)}>{getResultStatusLabel(lead.resultStatus)}</span>
                ) : null}
                {lead.appointmentTag && lead.appointmentTag !== 'none' ? (
                    <span className={apptBadgeClass(lead.appointmentTag)}>{getAppointmentTagLabel(lead.appointmentTag)}</span>
                ) : null}
            </div>

            <div className="lc2-details">
                <span className="lc2-detail-item">
                    <span className="lc2-detail-icon"><PhoneIcon /></span>
                    {lead.phone}
                </span>
                <span className="lc2-detail-item">
                    <span className="lc2-detail-icon"><MegaphoneIcon /></span>
                    {lead.source}
                </span>
                {lead.agentOfficeName ? (
                    <span className="lc2-detail-item">
                        <span className="lc2-detail-icon"><BuildingIcon /></span>
                        {lead.agentOfficeName}
                    </span>
                ) : null}
                {lead.domicileCity ? (
                    <span className="lc2-detail-item">
                        <span className="lc2-detail-icon"><MapPinIcon /></span>
                        {lead.domicileCity}
                    </span>
                ) : null}
            </div>

            {lead.customerPipelineTotalSteps > 0 ? (
                <div className="lc2-pipeline">
                    <span className="lc2-pipeline-label">Customer Pipeline</span>
                    <CustomerPipelineProgress
                        completed={lead.customerPipelineCompletedCount}
                        total={lead.customerPipelineTotalSteps}
                        compact
                    />
                </div>
            ) : null}

            <div className="lc2-note">
                <span className="lc2-note-label">Catatan</span>
                <span className="lc2-note-text">{lead.manualNote || '-'}</span>
            </div>

            {showSales ? (
                <div className="lc2-sales">
                    Sales: <span className="lc2-sales-name">{salesName}</span>
                </div>
            ) : null}
        </div>
    );
}
