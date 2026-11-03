import React from 'react';
import { NavLink } from 'react-router-dom';
import { ShieldAlert, Map, History, Users, PlusCircle, Radio, LockKeyhole } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export default function BottomNav({ onOpenReport, onOpenContacts }) {
  const { user } = useAuth();
  if (!user) return null;

  const isResponder = user.role === 'COMMUNITY_RESPONDER';
  const isAdmin = user.role === 'ADMIN';

  return (
    <nav className="bottom-nav">
      <div className="bottom-nav-inner">
        {isAdmin ? (
          <NavLink to="/admin" className={({ isActive }) => `bottom-nav-item ${isActive ? 'active' : ''}`}><LockKeyhole size={20} /><span>Admin</span></NavLink>
        ) : isResponder ? (
          <NavLink
            to="/community/dashboard"
            className={({ isActive }) => `bottom-nav-item ${isActive ? 'active' : ''}`}
          >
            <Radio size={20} />
            <span>Response</span>
          </NavLink>
        ) : (
          <NavLink
            to="/dashboard"
            className={({ isActive }) => `bottom-nav-item ${isActive ? 'active' : ''}`}
          >
            <ShieldAlert size={20} />
            <span>Safety</span>
          </NavLink>
        )}

        <NavLink
          to="/safety-map"
          className={({ isActive }) => `bottom-nav-item ${isActive ? 'active' : ''}`}
        >
          <Map size={20} />
          <span>Safety Map</span>
        </NavLink>

        {!isResponder && !isAdmin && (
          <button className="bottom-nav-item action-btn" onClick={onOpenReport}>
            <div className="report-icon-circle">
              <PlusCircle size={22} />
            </div>
            <span>Report</span>
          </button>
        )}

        {!isResponder && !isAdmin && (
          <button className="bottom-nav-item" onClick={onOpenContacts}>
            <Users size={20} />
            <span>Circle</span>
          </button>
        )}

        <NavLink
          to="/history"
          className={({ isActive }) => `bottom-nav-item ${isActive ? 'active' : ''}`}
        >
          <History size={20} />
          <span>History</span>
        </NavLink>
      </div>
    </nav>
  );
}
