import { formatTime } from '../../utils/dateTime';
import React, { useEffect, useState } from 'react';
import { X, Bell, AlertTriangle, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { api } from '../../services/api';

export default function NotificationModal({ onClose }) {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchNotifications();
  }, []);

  const fetchNotifications = async () => {
    try {
      const res = await api.getNotifications();
      if (res.success) {
        setNotifications(res.notifications);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleMarkRead = async (id) => {
    try {
      await api.markNotificationRead(id);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content notification-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="flex-align gap-2">
            <Bell size={20} className="text-primary" />
            <h3>Safety Notifications</h3>
          </div>
          <button className="close-btn" onClick={onClose}><X size={20} /></button>
        </div>

        <div className="modal-body notification-list">
          {loading ? (
            <p className="empty-text">Loading notifications...</p>
          ) : notifications.length === 0 ? (
            <div className="empty-state">
              <ShieldCheck size={40} className="text-muted" />
              <p>No safety notifications at this time. All clear!</p>
            </div>
          ) : (
            notifications.map(notif => (
              <div key={notif.id} className={`notification-card ${notif.is_read ? 'read' : 'unread'}`}>
                <div className="notif-indicator">
                  {notif.type.includes('EMERGENCY') || notif.type.includes('WARNING') ? (
                    <AlertTriangle size={18} className="text-danger" />
                  ) : (
                    <ShieldCheck size={18} className="text-primary" />
                  )}
                </div>
                <div className="notif-details">
                  <div className="notif-title-row">
                    <strong>{notif.title}</strong>
                    <span className="notif-time">{formatTime(notif.created_at)}</span>
                  </div>
                  <p className="notif-msg">{notif.message}</p>
                  {!notif.is_read && (
                    <button className="mark-read-btn" onClick={() => handleMarkRead(notif.id)}>
                      <CheckCircle2 size={14} /> Mark as read
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
