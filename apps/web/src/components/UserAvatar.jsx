import { getAvatarBg, getInitials } from '../utils/avatarUtils';
import './UserAvatar.css';

export default function UserAvatar({ name, size = 'md', shape = 'rounded', src }) {
    const cls = `user-avatar user-avatar--${size} user-avatar--${shape}`;

    if (src) {
        return <img className={cls} src={src} alt={name} />;
    }

    return (
        <div className={cls} style={{ background: getAvatarBg(name) }}>
            {getInitials(name)}
        </div>
    );
}
