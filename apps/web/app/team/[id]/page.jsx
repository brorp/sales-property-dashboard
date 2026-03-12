'use client';

import { useParams } from 'next/navigation';
import { AdminRoute } from '../../../src/components/RouteGuards';
import TeamMemberDetailPage from '../../../src/screens/TeamMemberDetailPage';

export default function TeamMemberDetailRoute() {
    const params = useParams();
    const memberId = Array.isArray(params?.id) ? params.id[0] : params?.id;

    return (
        <AdminRoute>
            <TeamMemberDetailPage memberId={memberId} />
        </AdminRoute>
    );
}
