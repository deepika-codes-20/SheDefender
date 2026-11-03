import { formatTime } from '../../utils/dateTime';
import React, { useState } from 'react';
import { AlertTriangle, CheckCircle, XCircle, Shield, PhoneCall } from 'lucide-react';
import { useLocation } from '../../context/LocationContext';

export default function ActiveEmergencyBanner() {
  const { activeEmergency, resolveOrCancelEmergency } = useLocation();
  const [isUpdating, setIsUpdating] = useState(false);

  if (!activeEmergency) return null;

  const handleStatusChange = async (status) => {
    const reason = window.prompt(
      status === 'CANCELLED' ? 'Reason for cancelling SOS:' : 'Resolution notes (e.g., Safe with responder / police):',
      status === 'CANCELLED' ? 'False alarm / Accidental press' : 'Reached safe location'
    );
    if (reason === null) return;

    setIsUpdating(true);
    await resolveOrCancelEmergency(status, reason);
    setIsUpdating(false);
  };

  const activeResponse = activeEmergency.active_response;

  return (
    <div className="emergency-active-banner">
      <div className="emergency-banner-top">
        <div className="emergency-tag">
          <span className="emergency-pulse-beacon"></span>
          🚨 EMERGENCY ACTIVE #{activeEmergency.id}
        </div>
        <span className="emergency-time">
          Triggered {formatTime(activeEmergency.created_at)}
        </span>
      </div>

      <div className="emergency-banner-body">
        <div className="emergency-info-row">
          <div className="emergency-stat">
            <span className="stat-label">Status</span>
            <span className="stat-val status-highlight">{activeEmergency.status}</span>
          </div>
          <div className="emergency-stat">
            <span className="stat-label">GPS Coordinates</span>
            <span className="stat-val">
              {activeEmergency.latitude.toFixed(4)}, {activeEmergency.longitude.toFixed(4)} (±{Math.round(activeEmergency.accuracy || 10)}m)
            </span>
          </div>
          <div className="emergency-stat">
            <span className="stat-label">Community Response</span>
            <span className="stat-val">
              {activeResponse ? (
                <span className="text-success font-semibold">
                  🛡️ {activeResponse.responder_name} ({activeResponse.status})
                </span>
              ) : (
                <span className="text-warning">Awaiting responder acceptance...</span>
              )}
            </span>
          </div>
        </div>

        {activeResponse && activeResponse.responder_phone && (
          <div className="responder-callout">
            <Shield size={18} className="text-success" />
            <span>Assigned Responder: <strong>{activeResponse.responder_name}</strong></span>
            <a href={`tel:${activeResponse.responder_phone}`} className="call-responder-btn">
              <PhoneCall size={14} /> Call Responder
            </a>
          </div>
        )}
      </div>

      <div className="emergency-banner-actions">
        <button
          className="btn-danger-outline"
          onClick={() => handleStatusChange('CANCELLED')}
          disabled={isUpdating}
        >
          <XCircle size={16} /> Cancel SOS
        </button>
        <button
          className="btn-success-solid"
          onClick={() => handleStatusChange('RESOLVED')}
          disabled={isUpdating}
        >
          <CheckCircle size={16} /> I Am Safe / Resolve Emergency
        </button>
      </div>
    </div>
  );
}
