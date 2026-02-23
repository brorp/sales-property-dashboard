'use client';

import { useParams } from 'next/navigation';
import LeadDetailPage from '../../../src/pages/LeadDetailPage';
import { ProtectedRoute } from '../../../src/components/RouteGuards';

export default function LeadDetailRoute() {
    const params = useParams();
    const leadId = Array.isArray(params?.id) ? params.id[0] : params?.id;

    return (
        <ProtectedRoute>
            <LeadDetailPage leadId={leadId} />
        </ProtectedRoute>
    );
}
