import { formatTime } from '../../utils/dateTime';
import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Shield, MapPin, Clock, AlertTriangle, CheckCircle2, Lock } from 'lucide-react';
import { api } from '../../services/api';
import SafetyLeafletMap from '../../components/map/SafetyLeafletMap';

export default function AuthorizedTrackingPage() {
  const { token } = useParams();
  const [sessionData, setSessionData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadTracking();
    const interval = setInterval(loadTracking, 8000);
    return () => clearInterval(interval);
  }, [token]);

  const loadTracking = async () => {
    try {
      const res = await api.getSharedTracking(token);
      if (res.success) {
        setSessionData(res);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="track-page-loading">
        <Shield size={44} className="text-primary spinner" />
        <p>Connecting to secure authorized location stream...</p>
      </div>
    );
  }

  if (error || !sessionData) {
    return (
      <div className="track-page-error">
        <Lock size={44} className="text-danger" />
        <h2>Private Location Link Inactive</h2>
        <p>{error || 'This live tracking session has concluded or the authorization link has expired.'}</p>
        <Link to="/login" className="btn-primary-solid mt-4">Go to SheDefender Login</Link>
      </div>
    );
  }

  const isStopped = sessionData.session_status === 'STOPPED';
  const latestLoc = sessionData.latest_location;

  return (
    <div className="authorized-track-page">
      <div className="track-container">
        <header className="track-header">
          <div className="flex-align gap-2">
            <Shield size={24} className="text-primary" />
            <div>
              <h2>{sessionData.user_name}'s Live Location</h2>
              <p className="track-tagline">Authorized Trusted Circle View</p>
            </div>
          </div>

          <div className={`track-status-pill ${isStopped ? 'stopped' : 'active'}`}>
            <span className="pulse-dot"></span>
            <span>{isStopped ? 'SHARING STOPPED' : 'LIVE TRACKING ACTIVE'}</span>
          </div>
        </header>

        {sessionData.emergency_active && (
          <div className="emergency-alert-card">
            <AlertTriangle size={24} className="text-danger" />
            <div>
              <strong className="text-danger">🚨 EMERGENCY SOS IN PROGRESS</strong>
              <p>An emergency alert was triggered by {sessionData.user_name}. Responders are notified.</p>
            </div>
          </div>
        )}

        <div className="track-map-card">
          {latestLoc ? (
            <SafetyLeafletMap
              userLocation={{
                latitude: latestLoc.latitude,
                longitude: latestLoc.longitude,
                accuracy: latestLoc.accuracy
              }}
              height="420px"
            />
          ) : (
            <div className="empty-location-box">
              <p>Waiting for GPS coordinates from device...</p>
            </div>
          )}
        </div>

        <div className="track-details-card">
          <div className="detail-row">
            <span className="detail-lbl">User</span>
            <strong>{sessionData.user_name}</strong>
          </div>
          <div className="detail-row">
            <span className="detail-lbl">Status</span>
            <span className={`status-pill ${isStopped ? 'status-cancelled' : 'status-verified'}`}>
              {sessionData.session_status}
            </span>
          </div>
          {latestLoc && (
            <>
              <div className="detail-row">
                <span className="detail-lbl">Last GPS Timestamp</span>
                <span>{formatTime(latestLoc.timestamp)}</span>
              </div>
              <div className="detail-row">
                <span className="detail-lbl">Accuracy</span>
                <span>±{Math.round(latestLoc.accuracy || 10)} meters</span>
              </div>
            </>
          )}
        </div>

        {isStopped && (
          <div className="session-ended-notice">
            <CheckCircle2 size={18} className="text-muted" />
            <span>The user has stopped live location sharing for this session.</span>
          </div>
        )}
      </div>
    </div>
  );
}
