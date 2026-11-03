import { formatTime } from '../../utils/dateTime';
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Shield, AlertTriangle, Radio, Navigation, CheckCircle2, Clock, Phone,
  MapPin, CheckCircle, XCircle, RefreshCw, Send, Compass, UserCheck
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../services/api';
import { GeolocationService } from '../../services/geolocation';
import SafetyLeafletMap from '../../components/map/SafetyLeafletMap';

export default function CommunityDashboard() {
  const navigate = useNavigate();
  const { user, responderProfile, refreshUser } = useAuth();

  const [emergencies, setEmergencies] = useState([]);
  const [selectedEmergency, setSelectedEmergency] = useState(null);
  const [responderLocation, setResponderLocation] = useState(null);
  const [gpsStatus, setGpsStatus] = useState('SEARCHING');
  const [availability, setAvailability] = useState('AVAILABLE');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [resolveNotes, setResolveNotes] = useState('');
  const [showResolveModal, setShowResolveModal] = useState(false);

  const watchIdRef = useRef(null);

  useEffect(() => {
    if (responderProfile?.availability) setAvailability(responderProfile.availability);
  }, [responderProfile]);

  useEffect(() => {
    initResponderGps();
    loadEmergencies();

    const interval = setInterval(loadEmergencies, 10000);
    return () => {
      clearInterval(interval);
      if (watchIdRef.current) GeolocationService.clearWatch(watchIdRef.current);
    };
  }, []);

  const initResponderGps = async () => {
    try {
      setGpsStatus('SEARCHING');
      const pos = await GeolocationService.getCurrentPosition();
      setResponderLocation(pos);
      setGpsStatus('ACTIVE');

      // Update location on Flask backend
      await api.updateResponderLocation({
        latitude: pos.latitude,
        longitude: pos.longitude,
        accuracy: pos.accuracy
      });

      // Start watching responder GPS for live navigation
      watchIdRef.current = GeolocationService.watchPosition(async (newPos) => {
        setResponderLocation(newPos);
        setGpsStatus('ACTIVE');
        try {
          await api.updateResponderLocation({
            latitude: newPos.latitude,
            longitude: newPos.longitude,
            accuracy: newPos.accuracy
          });
        } catch (e) {
          // ignore
        }
      });
    } catch (err) {
      console.warn('Responder GPS notice:', err.message);
      setGpsStatus('PERMISSION_REQUIRED');
      setResponderLocation(null);
    }
  };

  const loadEmergencies = async () => {
    try {
      const res = await api.getActiveEmergencies();
      if (res.success) {
        setEmergencies(res.emergencies);
        // If an emergency is currently assigned to this responder, select it
        const myActive = res.emergencies.find(e => e.is_my_response);
        setSelectedEmergency(previous => {
          if (myActive) return myActive;
          if (previous && res.emergencies.some(item => item.id === previous.id)) {
            return res.emergencies.find(item => item.id === previous.id);
          }
          return res.emergencies[0] || null;
        });
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleAvailabilityToggle = async (newVal) => {
    try {
      const res = await api.setAvailability(newVal);
      if (res.success) {
        setAvailability(newVal);
        refreshUser();
      }
    } catch (err) {
      alert(err.message);
    }
  };

  const handleAcceptEmergency = async (emergencyId) => {
    setActionLoading(true);
    try {
      const res = await api.acceptEmergency(emergencyId);
      if (res.success) {
        alert(`Response confirmed for Emergency #${emergencyId}. Navigation enabled.`);
        setAvailability('RESPONDING');
        loadEmergencies();
      }
    } catch (err) {
      alert(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleUpdateStatus = async (status) => {
    if (!selectedEmergency?.active_response) return;
    const responseId = selectedEmergency.active_response.id;

    setActionLoading(true);
    try {
      const res = await api.updateResponseStatus(responseId, {
        status,
        notes: resolveNotes || `Status updated to ${status}`
      });
      if (res.success) {
        setShowResolveModal(false);
        setResolveNotes('');
        setAvailability('AVAILABLE');
        loadEmergencies();
      }
    } catch (err) {
      alert(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="dashboard-page community-dashboard">
      <div className="dashboard-container">

        {/* Community Header Card */}
        <div className="community-header-card">
          <div className="comm-brand-left">
            <div className="comm-shield-wrap">
              <Shield size={32} />
            </div>
            <div>
              <h1 className="comm-title">SheDefender Community Safety</h1>
              <p className="comm-subtitle">EMERGENCY RESPONSE CONTROL</p>
              <span className="comm-verified-badge">
                <UserCheck size={14} /> ✓ VERIFIED COMMUNITY RESPONDER
              </span>
            </div>
          </div>

          <div className="comm-status-right">
            <div className="responder-name-box">
              <span className="text-muted text-xs">Responder:</span>
              <strong>{user?.name || 'Verified Responder'}</strong>
              <small className="badge-tag">Badge: {responderProfile?.badge_number || 'Not assigned'}</small>
            </div>

            {/* Availability Switch */}
            <div className="availability-selector">
              <span className="text-xs text-muted">Availability Status:</span>
              <div className="avail-buttons-row">
                {['AVAILABLE', 'RESPONDING', 'UNAVAILABLE'].map(st => (
                  <button
                    key={st}
                    className={`avail-btn ${availability === st ? `active active-${st.toLowerCase()}` : ''}`}
                    onClick={() => handleAvailabilityToggle(st)}
                  >
                    <span className={`status-dot dot-${st.toLowerCase()}`}></span>
                    {st}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* GPS Proximity Status Bar */}
        <div className="responder-gps-bar">
          <div className="gps-info-left">
            <Compass size={18} className="text-success" />
            <span>
              <strong>Responder GPS:</strong> {gpsStatus}
              {responderLocation && ` (±${Math.round(responderLocation.accuracy || 12)}m accuracy)`}
            </span>
          </div>
          <button className="sync-gps-btn" onClick={initResponderGps}>
            <RefreshCw size={14} /> Resync GPS
          </button>
        </div>

        {/* Live Map with Responder and Emergency Locations */}
        <div className="dashboard-card response-map-card">
          <div className="card-header-flex">
            <div className="card-title-group">
              <Navigation size={20} className="text-primary" />
              <h3>RESPONSE MAP & GEOGRAPHIC DISPATCH</h3>
            </div>
            {selectedEmergency && (
              <span className="selected-em-tag">
                Focusing: Emergency #{selectedEmergency.id} ({selectedEmergency.distance_display || 'Calculating'})
              </span>
            )}
          </div>

          <SafetyLeafletMap
            responderLocation={
              responderLocation
                ? {
                    current_lat: responderLocation.latitude,
                    current_lng: responderLocation.longitude,
                    responder_name: user?.name
                  }
                : null
            }
            emergencyLocation={
              selectedEmergency
                ? {
                    latitude: selectedEmergency.latitude,
                    longitude: selectedEmergency.longitude,
                    id: selectedEmergency.id
                  }
                : null
            }
            height="360px"
          />

          {selectedEmergency && (
            <div className="eta-banner-box">
              <div className="eta-stat-item">
                <span className="eta-label">Geographic Distance</span>
                <strong className="eta-value text-primary">{selectedEmergency.distance_display || 'Turn on GPS'}</strong>
              </div>
              <div className="eta-stat-item">
                <span className="eta-label">Estimated Arrival (ETA)</span>
                <strong className="eta-value text-danger">{selectedEmergency.eta_display || '~8 min'}</strong>
              </div>
              <div className="eta-stat-item">
                <span className="eta-label">Travel Estimation</span>
                <span className="eta-disclaimer">{selectedEmergency.disclaimer}</span>
              </div>
            </div>
          )}
        </div>

        {/* ACTIVE EMERGENCIES FEED */}
        <div className="dashboard-card emergencies-feed-card">
          <div className="card-header-flex">
            <div className="card-title-group">
              <AlertTriangle size={20} className="text-danger" />
              <h3>AUTHORIZED ACTIVE EMERGENCIES ({emergencies.length})</h3>
            </div>
            <button className="text-link-btn" onClick={loadEmergencies}>
              <RefreshCw size={14} /> Refresh Alerts
            </button>
          </div>

          {loading ? (
            <p className="empty-text">Loading authorized emergencies...</p>
          ) : emergencies.length === 0 ? (
            <div className="no-emergencies-state">
              <CheckCircle2 size={42} className="text-success" />
              <h4>No Active Emergencies in Your Sector</h4>
              <p>Keep your GPS active and status set to Available. The active emergency queue refreshes automatically while you are signed in.</p>
            </div>
          ) : (
            <div className="emergencies-grid">
              {emergencies.map(em => {
                const isSelected = selectedEmergency?.id === em.id;
                const isMyResponse = em.is_my_response;

                return (
                  <div
                    key={em.id}
                    className={`emergency-ticket ${isSelected ? 'selected-ticket' : ''} ${isMyResponse ? 'my-ticket' : ''}`}
                    onClick={() => setSelectedEmergency(em)}
                  >
                    <div className="ticket-header-row">
                      <div className="flex-align gap-2">
                        <span className="ticket-badge-danger">🚨 EMERGENCY #{em.id}</span>
                        <span className={`sev-pill sev-${em.severity.toLowerCase()}`}>{em.severity}</span>
                      </div>
                      <span className="ticket-time">
                        <Clock size={12} /> {formatTime(em.created_at)}
                      </span>
                    </div>

                    <div className="ticket-body">
                      <div className="ticket-info-line">
                        <span className="info-lbl">Victim / User:</span>
                        <strong>{em.user_name || 'Protected User'}</strong>
                        {em.user_phone && <span className="phone-tag"><Phone size={11} /> {em.user_phone}</span>}
                      </div>

                      <div className="ticket-info-line">
                        <span className="info-lbl">Coordinates:</span>
                        <span>{em.latitude.toFixed(4)}, {em.longitude.toFixed(4)}</span>
                      </div>

                      <div className="ticket-metrics-row">
                        <div className="metric-box">
                          <span className="metric-lbl">Distance</span>
                          <span className="metric-val">{em.distance_display || 'GPS required'}</span>
                        </div>
                        <div className="metric-box">
                          <span className="metric-lbl">Approx. ETA</span>
                          <span className="metric-val text-danger">{em.eta_display || 'Calculating'}</span>
                        </div>
                        <div className="metric-box">
                          <span className="metric-lbl">Status</span>
                          <span className="metric-val text-warning">{em.status}</span>
                        </div>
                      </div>

                      {em.notes && <p className="ticket-notes">"{em.notes}"</p>}
                    </div>

                    <div className="ticket-actions-row">
                      {isMyResponse ? (
                        <div className="active-response-controls">
                          <span className="responding-tag">✓ You are Responding</span>
                          <button
                            className="btn-success-solid btn-sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowResolveModal(true);
                            }}
                          >
                            <CheckCircle size={14} /> Resolve Emergency
                          </button>
                        </div>
                      ) : em.status === 'ACTIVE' && availability === 'AVAILABLE' ? (
                        <button
                          className="btn-danger-solid btn-block"
                          disabled={actionLoading}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleAcceptEmergency(em.id);
                          }}
                        >
                          <CheckCircle2 size={16} /> ACCEPT RESPONSE
                        </button>
                      ) : (
                        <span className="response-unavailable-note">
                          {em.status !== 'ACTIVE'
                            ? `Accepted by ${em.active_response?.responder_name || 'another responder'}`
                            : availability === 'RESPONDING'
                              ? 'You are already responding to another emergency'
                              : 'Set your availability to AVAILABLE to accept'}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Quick Link to Response History */}
        <div className="history-link-cta">
          <span>Review your historical emergency assists and community response metrics:</span>
          <button className="btn-secondary" onClick={() => navigate('/history')}>
            View Response History
          </button>
        </div>

      </div>

      {/* Resolve Emergency Modal */}
      {showResolveModal && (
        <div className="modal-overlay" onClick={() => setShowResolveModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Resolve Emergency #{selectedEmergency?.id}</h3>
              <button className="close-btn" onClick={() => setShowResolveModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <label>Resolution Notes (e.g. Accompanied victim to police booth, safe with family):</label>
              <textarea
                rows={3}
                required
                placeholder="Enter summary of assistance provided..."
                value={resolveNotes}
                onChange={e => setResolveNotes(e.target.value)}
              />
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setShowResolveModal(false)}>Cancel</button>
              <button
                className="btn-success-solid"
                onClick={() => handleUpdateStatus('RESOLVED')}
                disabled={actionLoading}
              >
                Mark Emergency Safely Resolved
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
