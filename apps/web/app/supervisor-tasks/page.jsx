import SupervisorTasksPage from '../../src/screens/SupervisorTasksPage';
import { RoleRoute } from '../../src/components/RouteGuards';

export default function SupervisorTasksRoutePage() {
    return (
        <RoleRoute allowedRoles={['supervisor']}>
            <SupervisorTasksPage />
        </RoleRoute>
    );
}
