import { formatDateTime, formatTime } from '../../utils/dateTime';
import React, { useState, useEffect } from 'react';
import {
  History, ShieldAlert, Radio, Users, Search, Filter, Calendar,
  Clock, MapPin, Eye, CheckCircle2, AlertTriangle, TrendingUp, X
} from 'lucide-react';
import { api } from '../../services/api';
import SafetyLeafletMap from '../../components/map/SafetyLeafletMap';

export default function HistoryDashboard() {
  const [activeTab, setActiveTab] = useState('incidents'); // 'incidents' | 'sos' | 'location' | 'responses' | 'trends'
  const [overview, setOverview] = useState(null);
  const [incidents, setIncidents] = useState([]);
  const [emergencies, setEmergencies] = useState([]);
  const [locationSessions, setLocationSessions] = useState([]);
  const [responses, setResponses] = useState([]);
  const [safetyZones, setSafetyZones] = useState([]);
  const [loading, setLoading] = useState(true);
  const highRiskZoneCount =
  (Number(overview?.high_warning_zones) || 0) +
  (Number(overview?.high_critical_zones) || 0);

  // Filters & Search
  const [searchTerm, setSearchTerm] = useState('');
  const [severityFilter, setSeverityFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Selected item modal
  const [selectedItem, setSelectedItem] = useState(null);

  useEffect(() => {
    loadAllHistory();
  }, []);

  const loadAllHistory = async () => {
    setLoading(true);
    try {
      const [overRes, incRes, emRes, locRes, respRes, zonesRes] = await Promise.all([
        api.getHistoryOverview(),
        api.getHistoryIncidents(),
        api.getHistoryEmergencies(),
        api.getHistoryLocationSessions(),
        api.getHistoryResponses(),
        api.getSafetyZones()
      ]);

      if (overRes.success) setOverview(overRes.summary);
      if (incRes.success) setIncidents(incRes.incidents);
      if (emRes.success) setEmergencies(emRes.emergencies);
      if (locRes.success) setLocationSessions(locRes.sessions);
      if (respRes.success) setResponses(respRes.responses);
      if (zonesRes.success) setSafetyZones(zonesRes.zones);
    } catch (e) {
      console.error('History load error:', e);
    } finally {
      setLoading(false);
    }
  };

  // Filtered lists
  const filteredIncidents = incidents.filter(i => {
    const matchSearch = !searchTerm || i.description.toLowerCase().includes(searchTerm.toLowerCase()) || i.incident_type.toLowerCase().includes(searchTerm.toLowerCase());
    const matchSev = severityFilter === 'ALL' || i.severity === severityFilter;
    const matchStatus = statusFilter === 'ALL' || i.status === statusFilter;
    return matchSearch && matchSev && matchStatus;
  });

  const filteredEmergencies = emergencies.filter(e => {
    const matchStatus = statusFilter === 'ALL' || e.status === statusFilter;
    const matchSev = severityFilter === 'ALL' || e.severity === severityFilter;
    return matchStatus && matchSev;
  });

  return (
    <div className="dashboard-page history-dashboard">
      <div className="dashboard-container">

        {/* History Header & Summary Metrics */}
        <div className="history-header-card">
          <div className="header-titles">
            <div className="flex-align gap-2">
              <History size={28} className="text-primary" />
              <h1 className="history-title">SheDefender Safety History</h1>
            </div>
            <p className="history-subtitle">
              Comprehensive historical record of incident reports, SOS events, authorized location sharing, and safety intelligence trends.
            </p>
          </div>

          {/* Metric KPI cards */}
          {overview && (
            <div className="history-kpis-grid">
              <div className="kpi-card" onClick={() => setActiveTab('incidents')}>
                <span className="kpi-number text-primary">{overview.total_incidents}</span>
                <span className="kpi-label">Reported Incidents</span>
              </div>
              <div className="kpi-card" onClick={() => setActiveTab('sos')}>
                <span className="kpi-number text-danger">{overview.total_emergencies}</span>
                <span className="kpi-label">SOS Events</span>
              </div>
              <div className="kpi-card" onClick={() => setActiveTab('location')}>
                <span className="kpi-number text-success">{overview.total_location_sessions}</span>
                <span className="kpi-label">Location Sessions</span>
              </div>
              <div className="kpi-card" onClick={() => setActiveTab('trends')}>
                <span className="kpi-number text-warning">{highRiskZoneCount}</span>
                <span className="kpi-label">High-Risk Zones</span>
              </div>
            </div>
          )}
        </div>

        {/* Tab Navigation */}
        <div className="history-tabs-bar">
          <button
            className={`hist-tab-btn ${activeTab === 'incidents' ? 'active' : ''}`}
            onClick={() => setActiveTab('incidents')}
          >
            📋 INCIDENT HISTORY ({incidents.length})
          </button>
          <button
            className={`hist-tab-btn ${activeTab === 'sos' ? 'active' : ''}`}
            onClick={() => setActiveTab('sos')}
          >
            🚨 SOS HISTORY ({emergencies.length})
          </button>
          <button
            className={`hist-tab-btn ${activeTab === 'location' ? 'active' : ''}`}
            onClick={() => setActiveTab('location')}
          >
            📍 LOCATION SHARING ({locationSessions.length})
          </button>
          <button
            className={`hist-tab-btn ${activeTab === 'responses' ? 'active' : ''}`}
            onClick={() => setActiveTab('responses')}
          >
            🛡️ COMMUNITY RESPONSES ({responses.length})
          </button>
          <button
            className={`hist-tab-btn ${activeTab === 'trends' ? 'active' : ''}`}
            onClick={() => setActiveTab('trends')}
          >
            📈 SAFETY TRENDS & HOTSPOTS
          </button>
        </div>

        {/* Search & Filter Bar */}
        {activeTab !== 'trends' && (
          <div className="history-filters-bar">
            <div className="search-field-wrap">
              <Search size={16} className="search-icon" />
              <input
                type="text"
                placeholder="Search description, type, or notes..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>

            <div className="filter-selects-row">
              <div className="filter-item">
                <label>Severity:</label>
                <select value={severityFilter} onChange={e => setSeverityFilter(e.target.value)}>
                  <option value="ALL">All Severities</option>
                  <option value="CRITICAL">Critical</option>
                  <option value="HIGH">High</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="LOW">Low</option>
                </select>
              </div>

              <div className="filter-item">
                <label>Status:</label>
                <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                  <option value="ALL">All Statuses</option>
                  <option value="ACTIVE">Active</option>
                  <option value="ACCEPTED">Accepted</option>
                  <option value="RESPONDING">Responding</option>
                  <option value="REPORTED">Reported</option>
                  <option value="UNDER_REVIEW">Under review</option>
                  <option value="VERIFIED">Verified</option>
                  <option value="REJECTED">Rejected</option>
                  <option value="RESOLVED">Resolved</option>
                  <option value="CANCELLED">Cancelled</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* TAB 1: INCIDENT HISTORY */}
        {activeTab === 'incidents' && (
          <div className="history-tab-content">
            <div className="table-responsive">
              <table className="history-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Type</th>
                    <th>Description</th>
                    <th>Coordinates</th>
                    <th>Date & Time</th>
                    <th>Severity</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredIncidents.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="empty-table-cell">No matching incidents found.</td>
                    </tr>
                  ) : (
                    filteredIncidents.map(inc => (
                      <tr key={inc.id} onClick={() => setSelectedItem({ type: 'incident', data: inc })}>
                        <td><strong>#{inc.id}</strong></td>
                        <td><span className="incident-type-tag">{inc.incident_type}</span></td>
                        <td className="desc-cell">{inc.description}</td>
                        <td className="coords-cell font-mono">{inc.latitude.toFixed(4)}, {inc.longitude.toFixed(4)}</td>
                        <td>{formatDateTime(inc.occurred_at)}</td>
                        <td><span className={`sev-pill sev-${inc.severity.toLowerCase()}`}>{inc.severity}</span></td>
                        <td><span className={`status-pill status-${inc.status.toLowerCase()}`}>{inc.status}</span></td>
                        <td>
                          <button className="view-detail-btn" title="View details">
                            <Eye size={16} />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 2: SOS HISTORY */}
        {activeTab === 'sos' && (
          <div className="history-tab-content">
            <div className="table-responsive">
              <table className="history-table">
                <thead>
                  <tr>
                    <th>Emergency ID</th>
                    <th>User</th>
                    <th>GPS Location</th>
                    <th>Triggered At</th>
                    <th>Resolved At</th>
                    <th>Severity</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEmergencies.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="empty-table-cell">No matching emergency events found.</td>
                    </tr>
                  ) : (
                    filteredEmergencies.map(em => (
                      <tr key={em.id} onClick={() => setSelectedItem({ type: 'emergency', data: em })}>
                        <td><strong>🚨 #{em.id}</strong></td>
                        <td>{em.user_name || 'Protected User'}</td>
                        <td className="coords-cell font-mono">{em.latitude.toFixed(4)}, {em.longitude.toFixed(4)}</td>
                        <td>{formatDateTime(em.created_at)}</td>
                        <td>{em.resolved_at ? formatTime(em.resolved_at) : '—'}</td>
                        <td><span className="sev-pill sev-critical">{em.severity}</span></td>
                        <td><span className={`status-pill status-${em.status.toLowerCase()}`}>{em.status}</span></td>
                        <td>
                          <button className="view-detail-btn" title="View Details">
                            <Eye size={16} />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 3: LOCATION SHARING SESSIONS */}
        {activeTab === 'location' && (
          <div className="history-tab-content">
            <div className="table-responsive">
              <table className="history-table">
                <thead>
                  <tr>
                    <th>Session ID</th>
                    <th>Started At</th>
                    <th>Ended At</th>
                    <th>Duration</th>
                    <th>Authorized Contacts</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {locationSessions.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="empty-table-cell">No location tracking sessions recorded.</td>
                    </tr>
                  ) : (
                    locationSessions.map(sess => (
                      <tr key={sess.id}>
                        <td><strong>Session #{sess.id}</strong></td>
                        <td>{formatDateTime(sess.started_at)}</td>
                        <td>{sess.ended_at ? formatTime(sess.ended_at) : 'Active Now'}</td>
                        <td><strong>{sess.duration_minutes} min</strong></td>
                        <td>
                          <span className="contacts-count-tag">
                            {sess.authorized_contacts ? `${sess.authorized_contacts.length} Contact(s)` : 'All Authorized'}
                          </span>
                        </td>
                        <td>
                          <span className={`status-pill status-${sess.status.toLowerCase()}`}>
                            {sess.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 4: COMMUNITY RESPONSES */}
        {activeTab === 'responses' && (
          <div className="history-tab-content">
            <div className="table-responsive">
              <table className="history-table">
                <thead>
                  <tr>
                    <th>Response ID</th>
                    <th>Emergency</th>
                    <th>Responder</th>
                    <th>Accepted At</th>
                    <th>Resolved At</th>
                    <th>Status</th>
                    <th>Resolution Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {responses.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="empty-table-cell">No community responses recorded yet.</td>
                    </tr>
                  ) : (
                    responses.map(resp => (
                      <tr key={resp.id}>
                        <td><strong>#{resp.id}</strong></td>
                        <td>🚨 Emergency #{resp.emergency_id}</td>
                        <td>{resp.responder_name} ({resp.responder_badge || 'Verified'})</td>
                        <td>{formatTime(resp.accepted_at)}</td>
                        <td>{resp.resolved_at ? formatTime(resp.resolved_at) : 'In Progress'}</td>
                        <td><span className={`status-pill status-${resp.status.toLowerCase()}`}>{resp.status}</span></td>
                        <td className="desc-cell">{resp.notes || '—'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 5: SAFETY TRENDS & HISTORICAL ZONES */}
        {activeTab === 'trends' && (
          <div className="history-tab-content trends-container">
            <div className="trends-grid">
              {safetyZones.map(zone => (
                <div key={zone.id} className={`trend-zone-card level-${zone.safety_level.toLowerCase()}`}>
                  <div className="trend-header">
                    <span className={`trend-level-badge level-${zone.safety_level.toLowerCase()}`}>
                      {zone.safety_level.replace('_', ' ')}
                    </span>
                    <span className="incident-count-bubble">{zone.incident_count} Incidents</span>
                  </div>

                  <h3 className="zone-name">{zone.name}</h3>
                  <p className="zone-reason">{zone.reason}</p>

                  <div className="zone-meta-grid">
                    <div>
                      <span className="meta-lbl">Center Coordinates</span>
                      <span className="meta-val font-mono">{zone.center_lat.toFixed(4)}, {zone.center_lng.toFixed(4)}</span>
                    </div>
                    <div>
                      <span className="meta-lbl">Radius</span>
                      <span className="meta-val">{zone.radius_meters} meters</span>
                    </div>
                    <div>
                      <span className="meta-lbl">Classification</span>
                      <span className="meta-val">{zone.is_isolated_area ? '⚠ Potentially Isolated Area' : 'Spatial Hotspot'}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>

      {/* Detail Inspector Modal */}
      {selectedItem && (
        <div className="modal-overlay" onClick={() => setSelectedItem(null)}>
          <div className="modal-content history-detail-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>
                {selectedItem.type === 'incident' ? `Incident Report #${selectedItem.data.id}` : `Emergency SOS #${selectedItem.data.id}`}
              </h3>
              <button className="close-btn" onClick={() => setSelectedItem(null)}><X size={20} /></button>
            </div>

            <div className="modal-body">
              <div className="detail-meta-grid">
                <div>
                  <span className="meta-lbl">Type</span>
                  <strong>{selectedItem.data.incident_type || 'Emergency SOS'}</strong>
                </div>
                <div>
                  <span className="meta-lbl">Severity</span>
                  <span className={`sev-pill sev-${String(selectedItem.data.severity || 'medium').toLowerCase()}`}>{selectedItem.data.severity || '—'}</span>
                </div>
                <div>
                  <span className="meta-lbl">Status</span>
                  <span className={`status-pill status-${String(selectedItem.data.status || 'unknown').toLowerCase()}`}>{selectedItem.data.status || '—'}</span>
                </div>
                <div>
                  <span className="meta-lbl">Timestamp</span>
                  <span>{formatDateTime(selectedItem.data.occurred_at || selectedItem.data.created_at)}</span>
                </div>
              </div>

              <div className="detail-description-box">
                <span className="meta-lbl">Description / Notes:</span>
                <p>{selectedItem.data.description || selectedItem.data.notes || 'No additional notes provided.'}</p>
              </div>

              {/* Map Preview */}
              <div className="detail-map-box">
                <span className="meta-lbl">Geographic Coordinate Location:</span>
                <SafetyLeafletMap
                  userLocation={{ latitude: selectedItem.data.latitude, longitude: selectedItem.data.longitude, accuracy: 10 }}
                  center={[selectedItem.data.latitude, selectedItem.data.longitude]}
                  zoom={16}
                  height="220px"
                />
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setSelectedItem(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
