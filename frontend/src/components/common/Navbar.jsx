import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Shield, Bell, LogOut, User as UserIcon, AlertTriangle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../services/api';
import NotificationModal from './NotificationModal';

export default function Navbar() {
  const { user, logout, responderProfile } = useAuth();
  const navigate = useNavigate();
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);

  useEffect(() => {
    if (user) {
      loadNotifications();
      const interval = setInterval(loadNotifications, 30000);
      return () => clearInterval(interval);
    }
  }, [user]);

  const loadNotifications = async () => {
    try {
      const res = await api.getNotifications();
      if (res.success) {
        const unread = res.notifications.filter(n => !n.is_read).length;
        setUnreadCount(unread);
      }
    } catch (e) {
      // ignore
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <>
      <header className="she-navbar">
        <div className="navbar-container">
          <Link to="/" className="brand-logo">
            <div className="logo-icon-wrap">
              <Shield className="logo-shield" />
            </div>
            <div className="brand-text">
              <span className="brand-title">SheDefender</span>
              <span className="brand-tagline">Your Safety. Your Circle.</span>
            </div>
          </Link>

          <div className="navbar-actions">
            {user && (
              <span className={`role-badge role-${user.role.toLowerCase()}`}>
                {user.role === 'COMMUNITY_RESPONDER' ? '✓ RESPONDER' : user.role}
              </span>
            )}

            {user && (
              <button
                className="icon-btn"
                onClick={() => setShowNotifications(true)}
                title="Safety Notifications"
              >
                <Bell size={20} />
                {unreadCount > 0 && <span className="notification-dot">{unreadCount}</span>}
              </button>
            )}

            {user && (
              <div className="user-profile-menu">
                <span className="user-greeting">Hi, <strong>{user.name.split(' ')[0]}</strong></span>
                <button className="logout-btn" onClick={handleLogout} title="Log Out">
                  <LogOut size={18} />
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {showNotifications && (
        <NotificationModal
          onClose={() => {
            setShowNotifications(false);
            loadNotifications();
          }}
        />
      )}
    </>
  );
}
