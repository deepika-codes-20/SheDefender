import React, { useState } from 'react';
import { X, MapPin, AlertTriangle, Send, Loader2, CheckCircle2 } from 'lucide-react';
import { api } from '../../services/api';
import { GeolocationService } from '../../services/geolocation';
import { getISTDateTimeLocalInput } from '../../utils/dateTime';

export default function ReportIncidentModal({ onClose, onIncidentReported }) {
  const [incidentType, setIncidentType] = useState('Harassment');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState('HIGH');
  const [occurredAt, setOccurredAt] = useState(getISTDateTimeLocalInput());
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [accuracy, setAccuracy] = useState(10);
  const [locLoading, setLocLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState(null);

  const fetchCurrentGps = async () => {
    setLocLoading(true);
    try {
      const pos = await GeolocationService.getCurrentPosition();
      setLatitude(pos.latitude.toFixed(6));
      setLongitude(pos.longitude.toFixed(6));
      setAccuracy(Math.round(pos.accuracy || 10));
    } catch (err) {
      alert(`GPS Notice: ${err.message}. Enter coordinates manually or retry in an open area.`);
    } finally {
      setLocLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!description.trim()) {
      alert('Please provide a brief description of the incident.');
      return;
    }
    if (!latitude || !longitude) {
      alert('Please click "USE MY CURRENT LOCATION" or enter valid coordinates.');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        incident_type: incidentType,
        description: description.trim(),
        severity,
        occurred_at: occurredAt,
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        accuracy: parseFloat(accuracy) || 10
      };

      const res = await api.reportIncident(payload);
      if (res.success) {
        setSuccessMsg(res.message);
        if (onIncidentReported) onIncidentReported(res.incident);
        setTimeout(() => {
          onClose();
        }, 1800);
      }
    } catch (err) {
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content incident-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="flex-align gap-2">
            <AlertTriangle className="text-danger" size={22} />
            <div>
              <h3>Report Safety Incident</h3>
              <p className="modal-subtitle">Contribute to community safety awareness & hotspot detection</p>
            </div>
          </div>
          <button className="close-btn" onClick={onClose}><X size={20} /></button>
        </div>

        {successMsg ? (
          <div className="report-success-state">
            <CheckCircle2 size={48} className="text-success" />
            <h4>Report Submitted Successfully</h4>
            <p>{successMsg}</p>
            <small>Thank you for contributing to community protection intelligence.</small>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="modal-body report-form">
            <div className="form-group">
              <label>Incident Type *</label>
              <select
                value={incidentType}
                onChange={e => setIncidentType(e.target.value)}
                className="select-input"
              >
                <option value="Harassment">Harassment</option>
                <option value="Stalking">Stalking</option>
                <option value="Threat">Threat</option>
                <option value="Suspicious Activity">Suspicious Activity</option>
                <option value="Unsafe Area">Unsafe Area (Poor Lighting / Isolated)</option>
                <option value="Physical Incident">Physical Incident</option>
                <option value="Other">Other</option>
              </select>
            </div>

            <div className="form-group">
              <label>Severity Level *</label>
              <div className="severity-toggle-group">
                {['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map(sev => (
                  <button
                    key={sev}
                    type="button"
                    className={`sev-btn ${severity === sev ? `active active-${sev.toLowerCase()}` : ''}`}
                    onClick={() => setSeverity(sev)}
                  >
                    {sev}
                  </button>
                ))}
              </div>
            </div>

            <div className="form-group">
              <label>When did the incident occur? (IST) *</label>
              <input type="datetime-local" required max={getISTDateTimeLocalInput()} value={occurredAt} onChange={event => setOccurredAt(event.target.value)} />
              <small className="gps-hint">The entered time is interpreted as Indian Standard Time and stored in UTC.</small>
            </div>

            <div className="form-group">
              <label>Incident Description *</label>
              <textarea
                required
                rows={3}
                placeholder="Describe what occurred, circumstances, or specific safety concern..."
                value={description}
                onChange={e => setDescription(e.target.value)}
              />
            </div>

            {/* GPS Location Section */}
            <div className="gps-capture-box">
              <div className="gps-capture-header">
                <span className="gps-label"><MapPin size={16} /> Incident Location</span>
                <button
                  type="button"
                  className="gps-btn"
                  onClick={fetchCurrentGps}
                  disabled={locLoading}
                >
                  {locLoading ? <Loader2 className="spinner" size={14} /> : <MapPin size={14} />}
                  USE MY CURRENT LOCATION
                </button>
              </div>

              <div className="coords-inputs-row">
                <div className="coord-field">
                  <label>Latitude</label>
                  <input
                    type="number"
                    step="any"
                    required
                    placeholder="12.9355"
                    value={latitude}
                    onChange={e => setLatitude(e.target.value)}
                  />
                </div>
                <div className="coord-field">
                  <label>Longitude</label>
                  <input
                    type="number"
                    step="any"
                    required
                    placeholder="77.6246"
                    value={longitude}
                    onChange={e => setLongitude(e.target.value)}
                  />
                </div>
                <div className="coord-field">
                  <label>Accuracy</label>
                  <input
                    type="text"
                    readOnly
                    value={`±${accuracy} m`}
                    className="readonly-input"
                  />
                </div>
              </div>
              <small className="gps-hint">
                Real smartphone GPS coordinates are attached to calculate spatial hotspot density.
              </small>
            </div>

            <div className="modal-footer">
              <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
              <button type="submit" className="btn-danger-solid" disabled={submitting}>
                {submitting ? <Loader2 className="spinner" size={16} /> : <Send size={16} />}
                Submit Incident Report
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
