import { useNavigate } from 'react-router-dom';
import './Header.css';

export default function Header({ title, showBack = false, rightAction = null }) {
    const navigate = useNavigate();
    return (
        <header className="app-header">
            <div className="app-header-left">
                {showBack && <button className="back-btn" onClick={() => navigate(-1)}>←</button>}
                <h1 className="app-header-title">{title}</h1>
            </div>
            {rightAction && <div className="app-header-right">{rightAction}</div>}
        </header>
    );
}
