import { formatDate } from '../../utils/dateTime';
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  MapPin, ShieldAlert, Radio, Users, AlertTriangle, Play, Square,
  ExternalLink, Share2, PlusCircle, CheckCircle, Clock, ShieldCheck, Compass
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useLocation } from '../../context/LocationContext';
import { api } from '../../services/api';
import SafetyLeafletMap from '../../components/map/SafetyLeafletMap';
import SosButton from '../../components/sos/SosButton';
import ActiveEmergencyBanner from '../../components/sos/ActiveEmergencyBanner';
import TrustedCircleModal from '../../components/contacts/TrustedCircleModal';
import ReportIncidentModal from '../../components/incidents/ReportIncidentModal';

export default function UserDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const {
    currentLocation,
    gpsStatus,
    lastUpdatedTime,
    isLiveTracking,
    activeSession,
    safetyStatus,
    activeEmergency,
    startLiveTracking,
    stopLiveTracking,
    fetchInitialLocation
  } = useLocation();

  const [mapZones, setMapZones] = useState([]);
  const [mapIncidents, setMapIncidents] = useState([]);
  const [recentIncidents, setRecentIncidents] = useState([]);
  const [trustedContacts, setTrustedContacts] = useState([]);
  const [showCircleModal, setShowCircleModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [sharedTrackingUrl, setSharedTrackingUrl] = useState(null);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      // Map data (zones & incidents)
      const mapRes = await api.getSafetyMapData();
      if (mapRes.success) {
        setMapZones(mapRes.zones);
        setMapIncidents(mapRes.incidents);
        setRecentIncidents(mapRes.incidents.slice(0, 3));
      }

      // Trusted contacts
      const contactsRes = await api.getContacts();
      if (contactsRes.success) {
        setTrustedContacts(contactsRes.contacts);
      }
    } catch (err) {
      console.warn('Dashboard data load warning:', err.message);
    }
  };

  const handleStartTracking = async () => {
    const contactIds = trustedContacts.filter(c => c.can_view_live_location).map(c => c.id);
    const res = await startLiveTracking(contactIds);
    if (res && res.success) {
      setSharedTrackingUrl(res.shareUrl);
    }
  };

  const handleShareSelected = async (contactIds) => {
    const result = await startLiveTracking(contactIds);
    if (result?.success) setSharedTrackingUrl(result.shareUrl);
    return result;
  };

  const handleStopTracking = async () => {
    await stopLiveTracking();
    setSharedTrackingUrl(null);
  };

  const formatTimeAgo = (date) => {
    if (!date) return 'Just now';
    const seconds = Math.max(0, Math.floor((new Date() - new Date(date)) / 1000));
    if (seconds < 10) return 'Just now';
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    return `${minutes}m ago`;
  };

  return (
    <div className="dashboard-page user-dashboard">
      <div className="dashboard-container">
        
        {/* Welcome Header */}
        <div className="dashboard-header-card">
          <div className="user-welcome-info">
            <h1 className="welcome-heading">Welcome, {user?.name || 'User'}</h1>
            <p className="welcome-subtext">SheDefender Personal Safety & Live Emergency Console</p>
          </div>
          <div className="header-status-pill">
            <span className={`status-indicator-dot dot-${gpsStatus.toLowerCase()}`}></span>
            <span>GPS: {gpsStatus}</span>
          </div>
        </div>

        {/* Emergency Mode Banner (Appears if SOS triggered) */}
        <ActiveEmergencyBanner />

        {/* SECTION 1: EMERGENCY SOS */}
        <div className="dashboard-section sos-section-box">
          <div className="section-label-bar">
            <ShieldAlert size={18} className="text-danger" />
            <span>EMERGENCY SOS</span>
          </div>
          <SosButton />
        </div>

        {/* SECTION 2: CURRENT LOCATION & LIVE TRACKING */}
        <div className="dashboard-card location-card">
          <div className="card-header-flex">
            <div className="card-title-group">
              <Compass size={20} className="text-primary" />
              <h3>CURRENT LOCATION</h3>
            </div>
            <div className={`tracking-status-pill ${isLiveTracking ? 'active' : 'stopped'}`}>
              <span className="pulse-dot"></span>
              <span>{isLiveTracking ? 'LIVE LOCATION ● ACTIVE' : 'LIVE LOCATION ○ STOPPED'}</span>
            </div>
          </div>

          <div className="gps-readout-grid">
            <div className="readout-box">
              <span className="readout-label">GPS Status</span>
              <strong className={`readout-val text-${gpsStatus === 'ACTIVE' ? 'success' : 'warning'}`}>
                {gpsStatus}
              </strong>
            </div>

            <div className="readout-box">
              <span className="readout-label">Coordinates</span>
              <span className="readout-val font-mono">
                {currentLocation ? `${currentLocation.latitude.toFixed(4)}, ${currentLocation.longitude.toFixed(4)}` : 'Acquiring GPS...'}
              </span>
            </div>

            <div className="readout-box">
              <span className="readout-label">Accuracy</span>
              <span className="readout-val">
                {currentLocation?.accuracy ? `±${Math.round(currentLocation.accuracy)} m` : '±10 m'}
              </span>
            </div>

            <div className="readout-box">
              <span className="readout-label">Last Updated</span>
              <span className="readout-val">
                {formatTimeAgo(lastUpdatedTime)}
              </span>
            </div>
          </div>

          <div className="tracking-controls-row">
            {!isLiveTracking ? (
              <button className="btn-primary-solid flex-1" onClick={handleStartTracking}>
                <Play size={18} />
                <span>START LIVE TRACKING</span>
              </button>
            ) : (
              <button className="btn-danger-solid flex-1" onClick={handleStopTracking}>
                <Square size={18} />
                <span>STOP LIVE TRACKING</span>
              </button>
            )}

            <button
              className="btn-secondary"
              onClick={fetchInitialLocation}
              title="Refresh Smartphone GPS"
            >
              <Radio size={16} /> Sync GPS
            </button>
          </div>
        </div>

        {/* SECTION 3: LIVE LOCATION MAP */}
        <div className="dashboard-card map-card">
          <div className="card-header-flex">
            <div className="card-title-group">
              <MapPin size={20} className="text-primary" />
              <h3>LIVE LOCATION MAP</h3>
            </div>
            <button className="text-link-btn" onClick={() => navigate('/safety-map')}>
              Fullscreen Map <ExternalLink size={14} />
            </button>
          </div>

          <SafetyLeafletMap
            userLocation={currentLocation}
            zones={mapZones}
            incidents={mapIncidents}
            emergencyLocation={activeEmergency}
            height="340px"
          />

          <div className="map-legend-row">
            <span className="legend-item"><span className="legend-dot user-dot"></span> You</span>
            <span className="legend-item"><span className="legend-dot critical-dot"></span> High Critical</span>
            <span className="legend-item"><span className="legend-dot warning-dot"></span> High Warning</span>
            <span className="legend-item"><span className="legend-dot isolated-dot"></span> Isolated Area</span>
          </div>
        </div>

        {/* SECTION 4: SAFETY STATUS INTELLIGENCE */}
        <div className={`dashboard-card safety-status-card status-${safetyStatus.color || 'green'}`}>
          <div className="card-header-flex">
            <div className="card-title-group">
              <AlertTriangle size={20} />
              <h3>SAFETY STATUS</h3>
            </div>
            <span className="safety-level-badge">{safetyStatus.headline}</span>
          </div>

          <div className="safety-evaluation-body">
            <div className="safety-eval-row">
              <span className="eval-label">Current Area Risk:</span>
              <strong className="eval-val">{safetyStatus.is_isolated_area ? 'POTENTIALLY ISOLATED AREA' : safetyStatus.safety_level === 'UNKNOWN' ? 'NOT EVALUATED' : safetyStatus.safety_level?.replaceAll('_', ' ')}</strong>
            </div>

            <div className="safety-eval-row">
              <span className="eval-label">Intelligence Reason:</span>
              <p className="eval-reason">{safetyStatus.reason}</p>
            </div>

            {safetyStatus.is_isolated_area && (
              <div className="isolated-area-warning-box">
                <AlertTriangle size={18} className="text-warning" />
                <p>
                  <strong>⚠ Safety Notice:</strong> You appear to be entering a potentially isolated or low-accessibility area. Stay alert and consider sharing your live location with your trusted circle.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* SECTION 5: TRUSTED SAFETY CIRCLE */}
        <div className="dashboard-card contacts-card">
          <div className="card-header-flex">
            <div className="card-title-group">
              <Users size={20} className="text-primary" />
              <h3>TRUSTED SAFETY CIRCLE</h3>
            </div>
            <button className="btn-secondary-sm" onClick={() => setShowCircleModal(true)}>
              MANAGE CONTACTS
            </button>
          </div>

          <div className="trusted-circle-summary-list">
            {trustedContacts.length === 0 ? (
              <p className="empty-text">No trusted contacts added yet. Click Manage to add family or friends.</p>
            ) : (
              trustedContacts.map(c => (
                <div key={c.id} className="circle-contact-pill">
                  <div className="contact-avatar-initial">
                    {c.name.charAt(0)}
                  </div>
                  <div className="contact-brief">
                    <strong>{c.name}</strong>
                    <span className="brief-rel">{c.relationship}</span>
                  </div>
                  <span className="auth-check-tag">
                    <CheckCircle size={14} className="text-success" /> Authorized
                  </span>
                </div>
              ))
            )}
          </div>

          <div className="sharing-footer-cta">
            <button
              className="btn-primary-outline btn-block"
              onClick={() => setShowCircleModal(true)}
            >
              <Share2 size={16} /> Choose Contacts & Start Authorized Sharing
            </button>
          </div>
        </div>

        {/* SECTION 6: RECENT INCIDENTS & ACTION */}
        <div className="dashboard-card recent-incidents-card">
          <div className="card-header-flex">
            <div className="card-title-group">
              <ShieldAlert size={20} className="text-primary" />
              <h3>RECENT INCIDENTS</h3>
            </div>
            <button className="text-link-btn" onClick={() => navigate('/history')}>
              VIEW HISTORY
            </button>
          </div>

          <div className="recent-incidents-list">
            {recentIncidents.map(inc => (
              <div key={inc.id} className="recent-incident-item">
                <div className="inc-badge-column">
                  <span className={`inc-type-tag sev-${inc.severity.toLowerCase()}`}>
                    {inc.incident_type}
                  </span>
                  <small className="inc-id">#{inc.id}</small>
                </div>
                <div className="inc-summary-column">
                  <p className="inc-desc">{inc.description}</p>
                  <span className="inc-date">
                    <Clock size={12} /> {formatDate(inc.occurred_at)}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <button
            className="btn-danger-solid btn-block mt-3"
            onClick={() => setShowReportModal(true)}
          >
            <PlusCircle size={18} /> REPORT AN INCIDENT
          </button>
        </div>

      </div>

      {/* Modals */}
      {showCircleModal && (
        <TrustedCircleModal
          onClose={() => setShowCircleModal(false)}
          onStartSharing={handleShareSelected}
          isSharingActive={isLiveTracking}
          sharedUrl={activeSession?.session_token ? `/track/${activeSession.session_token}` : sharedTrackingUrl}
        />
      )}

      {showReportModal && (
        <ReportIncidentModal
          onClose={() => {
            setShowReportModal(false);
            loadDashboardData();
          }}
          onIncidentReported={() => loadDashboardData()}
        />
      )}
    </div>
  );
}
