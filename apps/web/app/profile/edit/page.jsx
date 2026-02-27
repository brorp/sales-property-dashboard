import { redirect } from 'next/navigation';

export default function EditProfileRouteRedirect() {
    redirect('/settings/profile');
}
