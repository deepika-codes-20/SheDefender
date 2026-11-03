
import { formatDateTime } from '../../utils/dateTime';
import React, { useState, useEffect } from 'react';
import {
  Shield,
  Users,
  MapPin,
  Edit3,
  Trash2,
  CheckCircle,
  XCircle,
  UserCheck
} from 'lucide-react';

import { api } from '../../services/api';

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [responders, setResponders] = useState([]);
  const [users, setUsers] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [safetyZones, setSafetyZones] = useState([]);
  const [savingZone, setSavingZone] = useState(false);
  const [zoneForm, setZoneForm] = useState({ name: '', center_lat: '', center_lng: '', radius_meters: 750, is_isolated_area: false, safety_level: 'NORMAL', reason: '' });
  const [loading, setLoading] = useState(true);
  const [registering, setRegistering] = useState(false);
  const [resendingId, setResendingId] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    badge_number: ''
  });

  useEffect(() => {
    loadAdminData();
  }, []);

  const loadAdminData = async () => {
    setLoading(true);

    try {
      const [statsRes, respRes, usersRes, incidentRes, zonesRes] = await Promise.all([
        api.getAdminStats(),
        api.getAdminResponders(),
        api.getAdminUsers(),
        api.getAdminIncidents(),
        api.getAdminSafetyZones()
      ]);

      if (statsRes.success) setStats(statsRes.statistics);
      if (respRes.success) setResponders(respRes.responders);
      if (usersRes.success) setUsers(usersRes.users);
      if (incidentRes.success) setIncidents(incidentRes.incidents);
      if (zonesRes.success) setSafetyZones(zonesRes.zones);

    } catch (e) {
      console.error(e);
      setError(e.message || 'Unable to load admin data.');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    setForm({
      ...form,
      [e.target.name]: e.target.value
    });
  };

  const handleRegister = async (e) => {
    e.preventDefault();

    setMessage('');
    setError('');

    if (!form.name.trim() || !form.email.trim()) {
      setError('Name and email are required.');
      return;
    }

    setRegistering(true);

    try {
      const res = await api.createAdminResponder({
        name: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        phone: form.phone.trim(),
        badge_number: form.badge_number.trim()
      });

      if (res.success) {
        setMessage(res.message || 'Invitation sent. The responder must verify their email, create a password and receive Admin approval.');
        setForm({
          name: '',
          email: '',
          phone: '',
          badge_number: ''
        });

        await loadAdminData();
      }

    } catch (err) {
      setError(err.message || 'Registration failed.');
    } finally {
      setRegistering(false);
    }
  };

  const handleZoneInput = (event) => {
    const { name, value, type, checked } = event.target;
    setZoneForm(previous => ({ ...previous, [name]: type === 'checkbox' ? checked : value }));
  };

  const handleCreateZone = async (event) => {
    event.preventDefault();
    setSavingZone(true);
    setError('');
    setMessage('');
    try {
      const result = await api.createAdminSafetyZone({
        ...zoneForm, center_lat: Number(zoneForm.center_lat), center_lng: Number(zoneForm.center_lng), radius_meters: Number(zoneForm.radius_meters)
      });
      setMessage(result.message || 'Safety zone created.');
      setZoneForm({ name: '', center_lat: '', center_lng: '', radius_meters: 750, is_isolated_area: false, safety_level: 'NORMAL', reason: '' });
      await loadAdminData();
    } catch (err) {
      setError(err.message || 'Could not create safety zone.');
    } finally {
      setSavingZone(false);
    }
  };

  const handleEditZone = async (zone) => {
    const name = window.prompt('Zone name', zone.name);
    if (name === null) return;
    const reason = window.prompt('Zone reason / guidance', zone.reason || '');
    if (reason === null) return;
    try {
      const result = await api.updateAdminSafetyZone(zone.id, { name: name.trim(), reason });
      setMessage(result.message || 'Safety zone updated.');
      await loadAdminData();
    } catch (err) {
      setError(err.message || 'Could not update safety zone.');
    }
  };

  const handleDeleteZone = async (id) => {
    if (!window.confirm('Delete this safety zone?')) return;
    try {
      const result = await api.deleteAdminSafetyZone(id);
      setMessage(result.message || 'Safety zone deleted.');
      await loadAdminData();
    } catch (err) {
      setError(err.message || 'Could not delete safety zone.');
    }
  };

  const handleReviewIncident = async (id, status) => {
    setError('');
    setMessage('');
    try {
      const res = await api.updateIncidentReviewStatus(id, status);
      if (res.success) {
        setMessage(res.message || `Incident marked ${status}.`);
        await loadAdminData();
      }
    } catch (err) {
      setError(err.message || 'Could not update incident review status.');
    }
  };

  const handleResendInvite = async (id) => {
    setError('');
    setMessage('');
    setResendingId(id);
    try {
      const res = await api.resendResponderInvitation(id);
      setMessage(res.message || 'Invitation resent.');
    } catch (err) {
      setError(err.message || 'Could not resend invitation.');
    } finally {
      setResendingId(null);
    }
  };

  const handleEditResponder = async (responder) => {
    const name = window.prompt('Responder full name', responder.responder_name || '');
    if (name === null) return;
    const email = window.prompt('Responder email address', responder.responder_email || '');
    if (email === null) return;
    const phone = window.prompt('Responder phone number (leave blank to clear)', responder.responder_phone || '');
    if (phone === null) return;
    const badge_number = window.prompt('Badge number (leave blank to clear)', responder.badge_number || '');
    if (badge_number === null) return;

    const emailChanged = email.trim().toLowerCase() !== (responder.responder_email || '').toLowerCase();
    if (emailChanged && !window.confirm('Changing the email will require the responder to verify the new address and set a password again. Continue?')) return;

    setError('');
    setMessage('');
    try {
      const result = await api.updateAdminResponder(responder.id, { name, email, phone, badge_number });
      if (result.email_changed) {
        try {
          const invite = await api.resendResponderInvitation(responder.id);
          setMessage(`${result.message} ${invite.message || 'A new verification code has been sent.'}`);
        } catch (inviteError) {
          setMessage(result.message || 'Responder details updated.');
          setError(`The new email is saved, but the invitation could not be sent: ${inviteError.message}. Use Resend invitation after checking the address.`);
        }
      } else {
        setMessage(result.message || 'Responder details updated.');
      }
      await loadAdminData();
    } catch (err) {
      setError(err.message || 'Could not update responder details.');
    }
  };

  const handleToggleResponder = async (responder) => {
    const nextActive = !responder.is_active;
    const action = nextActive ? 'activate' : 'deactivate';
    if (!window.confirm(`Are you sure you want to ${action} ${responder.responder_name}?`)) return;
    setError('');
    setMessage('');
    try {
      const result = await api.setAdminResponderActive(responder.id, nextActive);
      setMessage(result.message || `Responder ${action}d.`);
      await loadAdminData();
    } catch (err) {
      setError(err.message || `Could not ${action} responder.`);
    }
  };

  const handleDeleteResponder = async (responder) => {
    if (!window.confirm(`Permanently delete ${responder.responder_name} (${responder.responder_email})? This cannot be undone. If this responder has response history, the system will block deletion and you should deactivate the account instead.`)) return;
    setError('');
    setMessage('');
    try {
      const result = await api.deleteAdminResponder(responder.id);
      setMessage(result.message || 'Responder deleted.');
      await loadAdminData();
    } catch (err) {
      setError(err.message || 'Could not delete responder.');
    }
  };

  const handleVerify = async (id, status) => {
    try {
      const res = await api.verifyResponder(id, status);

      if (res.success) {
        await loadAdminData();
      }
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="dashboard-page admin-dashboard">
      <div className="dashboard-container">

        <div className="admin-header-card">
          <div className="flex-align gap-2">
            <Shield size={28} className="text-primary" />
            <div>
              <h1 className="history-title">
                SheDefender Administration & Moderation
              </h1>
              <p className="history-subtitle">
                User account oversight, incident moderation, responder approvals and safety-zone monitoring.
              </p>
            </div>
          </div>
        </div>

        {stats && (
          <div className="history-kpis-grid mt-4">
            <div className="kpi-card">
              <span className="kpi-number text-primary">
                {stats.total_users}
              </span>
              <span className="kpi-label">Registered Users</span>
            </div>

            <div className="kpi-card">
              <span className="kpi-number text-success">
                {stats.verified_responders}
              </span>
              <span className="kpi-label">Verified Responders</span>
            </div>

            <div className="kpi-card">
              <span className="kpi-number text-warning">
                {stats.total_incidents}
              </span>
              <span className="kpi-label">Logged Incidents</span>
            </div>

            <div className="kpi-card">
              <span className="kpi-number text-danger">
                {stats.high_critical_zones}
              </span>
              <span className="kpi-label">High Critical Zones</span>
            </div>
          </div>
        )}

        <div className="dashboard-card mt-4">
          <div className="card-header-flex">
            <div className="card-title-group">
              <Users size={20} className="text-primary" />
              <h3>User & Account Directory</h3>
            </div>
            <span className="text-muted text-xs">{users.length} account(s)</span>
          </div>
          <div className="table-responsive">
            <table className="history-table">
              <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Role</th><th>Email status</th><th>Account</th><th>Created (IST)</th></tr></thead>
              <tbody>
                {users.map(account => (
                  <tr key={account.id}>
                    <td>{account.name}</td>
                    <td>{account.email || '—'}</td>
                    <td>{account.phone || '—'}</td>
                    <td>{account.role.replaceAll('_', ' ')}</td>
                    <td><span className={`status-pill ${account.email_verified ? 'status-verified' : 'status-pending'}`}>{account.email_verified ? 'VERIFIED' : 'UNVERIFIED'}</span></td>
                    <td><span className={`status-pill ${account.is_active ? 'status-verified' : 'status-rejected'}`}>{account.is_active ? 'ACTIVE' : 'INACTIVE'}</span></td>
                    <td>{formatDateTime(account.created_at)}</td>
                  </tr>
                ))}
                {users.length === 0 && !loading && <tr><td colSpan="7">No accounts have been created yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        <div className="dashboard-card mt-4">
          <div className="card-header-flex">
            <div className="card-title-group"><MapPin size={20} className="text-primary" /><h3>Safety-Zone & Isolated-Area Management</h3></div>
            <span className="text-muted text-xs">{safetyZones.length} zone(s)</span>
          </div>
          <form className="admin-zone-form" onSubmit={handleCreateZone}>
            <div className="form-group"><label>Zone name *</label><input name="name" value={zoneForm.name} onChange={handleZoneInput} required maxLength={120} placeholder="e.g. Poorly lit pedestrian route" /></div>
            <div className="form-grid admin-zone-coordinates">
              <div className="form-group"><label>Latitude *</label><input name="center_lat" type="number" step="any" min="-90" max="90" value={zoneForm.center_lat} onChange={handleZoneInput} required /></div>
              <div className="form-group"><label>Longitude *</label><input name="center_lng" type="number" step="any" min="-180" max="180" value={zoneForm.center_lng} onChange={handleZoneInput} required /></div>
              <div className="form-group"><label>Radius (metres)</label><input name="radius_meters" type="number" min="50" max="100000" value={zoneForm.radius_meters} onChange={handleZoneInput} required /></div>
            </div>
            <div className="form-grid admin-zone-coordinates">
              <div className="form-group"><label>Risk level</label><select name="safety_level" value={zoneForm.safety_level} onChange={handleZoneInput} disabled={zoneForm.is_isolated_area}><option value="NORMAL">NORMAL</option><option value="MODERATE">MODERATE</option><option value="HIGH_WARNING">HIGH_WARNING</option><option value="HIGH_CRITICAL">HIGH_CRITICAL</option></select></div>
              <label className="admin-zone-checkbox"><input type="checkbox" name="is_isolated_area" checked={zoneForm.is_isolated_area} onChange={handleZoneInput} /> Mark as potentially isolated area (purple map key)</label>
            </div>
            <div className="form-group"><label>Reason / guidance</label><textarea name="reason" rows="2" maxLength={2000} value={zoneForm.reason} onChange={handleZoneInput} placeholder="Explain the reported risk or isolation factors" /></div>
            <button type="submit" className="btn-primary-solid" disabled={savingZone}>{savingZone ? 'Saving zone...' : 'Create safety zone'}</button>
          </form>
          <div className="table-responsive mt-3">
            <table className="history-table">
              <thead><tr><th>Zone</th><th>Key</th><th>Radius</th><th>Reports</th><th>Updated (IST)</th><th>Action</th></tr></thead>
              <tbody>
                {safetyZones.map(zone => <tr key={zone.id}><td><strong>{zone.name}</strong><div className="text-xs text-muted">{zone.reason || 'No additional guidance'}</div></td><td><span className={`status-pill level-${zone.safety_level.toLowerCase()}`}>{zone.safety_level}</span><div className="text-xs text-muted">{zone.is_manual ? 'MANUAL' : 'AUTO CLUSTER'}</div></td><td>{Math.round(zone.radius_meters)} m</td><td>{zone.incident_count}</td><td>{formatDateTime(zone.updated_at)}</td><td className="admin-review-actions"><button type="button" className="btn-secondary-sm" onClick={() => handleEditZone(zone)}><Edit3 size={14} /> Edit</button><button type="button" className="btn-danger-sm" onClick={() => handleDeleteZone(zone.id)}><Trash2 size={14} /> Delete</button></td></tr>)}
                {safetyZones.length === 0 && !loading && <tr><td colSpan="6">No safety zones configured. Verified incident clusters can also create zones automatically.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        {/* Incident moderation queue: only verified reports are used for public map markers and safety-zone analytics. */}
        <div className="dashboard-card mt-4">
          <div className="card-header-flex">
            <div className="card-title-group">
              <Shield size={20} className="text-primary" />
              <h3>Incident Review & Safety-Zone Verification</h3>
            </div>
            <span className="text-muted text-xs">{incidents.filter(item => item.status === 'REPORTED' || item.status === 'UNDER_REVIEW').length} awaiting review</span>
          </div>
          <div className="table-responsive">
            <table className="history-table">
              <thead><tr><th>Report</th><th>Reporter</th><th>Severity</th><th>Submitted</th><th>Status</th><th>Review action</th></tr></thead>
              <tbody>
                {incidents.map(incident => (
                  <tr key={incident.id}>
                    <td><strong>#{incident.id} · {incident.incident_type}</strong><div className="text-xs text-muted">{incident.description}</div></td>
                    <td>{incident.reporter_name || 'User'}</td>
                    <td>{incident.severity}</td>
                    <td>{formatDateTime(incident.created_at)}</td>
                    <td><span className={`status-pill status-${incident.status.toLowerCase()}`}>{incident.status}</span></td>
                    <td className="admin-review-actions">
                      {incident.status === 'REPORTED' && <button className="btn-secondary-sm" onClick={() => handleReviewIncident(incident.id, 'UNDER_REVIEW')}>Review</button>}
                      {incident.status !== 'VERIFIED' && incident.status !== 'REJECTED' && <button className="btn-success-solid btn-sm" onClick={() => handleReviewIncident(incident.id, 'VERIFIED')}><CheckCircle size={14} /> Verify</button>}
                      {incident.status !== 'REJECTED' && <button className="btn-danger-outline btn-sm" onClick={() => handleReviewIncident(incident.id, 'REJECTED')}><XCircle size={14} /> Reject</button>}
                    </td>
                  </tr>
                ))}
                {incidents.length === 0 && !loading && <tr><td colSpan="6">No incident reports have been submitted yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        {/* Add Community Responder */}
        <div className="dashboard-card mt-4">
          <div className="card-header-flex">
            <div className="card-title-group">
              <UserCheck size={20} className="text-primary" />
              <h3>Register Community Responder</h3>
            </div>
          </div>

          <form onSubmit={handleRegister} className="p-3">

            <div className="form-group mb-3">
              <label>Full Name *</label>
              <input
                type="text"
                name="name"
                value={form.name}
                onChange={handleInputChange}
                placeholder="Enter responder name"
                required
              />
            </div>

            <div className="form-group mb-3">
              <label>Email Address *</label>
              <input
                type="email"
                name="email"
                value={form.email}
                onChange={handleInputChange}
                placeholder="Enter responder email"
                required
              />
            </div>

            <div className="form-group mb-3">
              <label>Phone Number</label>
              <input
                type="tel"
                name="phone"
                value={form.phone}
                onChange={handleInputChange}
                placeholder="Enter phone number"
              />
            </div>

            <div className="form-group mb-3">
              <label>Badge Number</label>
              <input
                type="text"
                name="badge_number"
                value={form.badge_number}
                onChange={handleInputChange}
                placeholder="Enter badge number"
              />
            </div>

            {message && (
              <p className="text-success">{message}</p>
            )}

            {error && (
              <p className="text-danger">{error}</p>
            )}

            <button
              type="submit"
              className="btn-primary-solid"
              disabled={registering}
            >
              {registering ? 'Registering...' : 'Register Responder'}
            </button>

          </form>
        </div>

        {message && <p className="text-success mt-3" role="status">{message}</p>}
        {error && <p className="text-danger mt-3" role="alert">{error}</p>}

        {/* Responder Verification Management */}
        <div className="dashboard-card mt-4">
          <div className="card-header-flex">
            <div className="card-title-group">
              <UserCheck size={20} className="text-primary" />
              <h3>Community Responder Verification Queue</h3>
            </div>
          </div>

          <div className="table-responsive">
            <table className="history-table">
              <thead>
                <tr>
                  <th>Badge</th>
                  <th>Name</th>
                  <th>Email / Phone</th>
                  <th>Verification Mode</th>
                  <th>Approval</th>
                  <th>Account</th>
                  <th>Action</th>
                </tr>
              </thead>

              <tbody>
                {responders.map(r => (
                  <tr key={r.id}>
                    <td>
                      <strong>{r.badge_number || `CR-${r.id}`}</strong>
                    </td>

                    <td>{r.responder_name}</td>
                    <td><div>{r.responder_email || '—'}</div><small>{r.responder_phone || 'No phone'}</small></td>
                    <td><small>{r.verification_mode}</small></td>

                    <td>
                      <span className={`status-pill status-${r.verification_status.toLowerCase()}`}>
                        {r.verification_status}
                      </span>
                    </td>
                    <td>
                      <span className={`status-pill ${r.is_active ? 'status-verified' : 'status-pending'}`}>
                        {r.is_active ? 'ACTIVE' : 'INACTIVE'}
                      </span>
                      <small>{r.email_verified ? 'Email verified' : 'Email not verified'}</small>
                    </td>

                    <td className="admin-review-actions">
                      <button className="btn-secondary-sm" onClick={() => handleEditResponder(r)}>
                        <Edit3 size={14} /> Edit
                      </button>
                      {!r.email_verified && (
                        <button className="btn-secondary-sm" disabled={resendingId === r.id} onClick={() => handleResendInvite(r.id)}>
                          {resendingId === r.id ? 'Sending...' : 'Resend invitation'}
                        </button>
                      )}
                      {r.verification_status !== 'VERIFIED' ? (
                        <button className="btn-success-solid btn-sm" onClick={() => handleVerify(r.id, 'VERIFIED')}>
                          <CheckCircle size={14} /> Approve
                        </button>
                      ) : (
                        <button className="btn-danger-outline btn-sm" onClick={() => handleVerify(r.id, 'REJECTED')}>
                          <XCircle size={14} /> Revoke
                        </button>
                      )}
                      {r.verification_status === 'VERIFIED' && r.email_verified && (
                        <button className="btn-secondary-sm" onClick={() => handleToggleResponder(r)}>
                          {r.is_active ? 'Deactivate' : 'Activate'}
                        </button>
                      )}
                      <button className="btn-danger-outline btn-sm" onClick={() => handleDeleteResponder(r)}>
                        <Trash2 size={14} /> Delete
                      </button>
                    </td>
                  </tr>
                ))}

                {responders.length === 0 && !loading && (
                  <tr>
                    <td colSpan="7">No community responders have been invited yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}
