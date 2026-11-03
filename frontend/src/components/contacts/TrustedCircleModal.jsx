import React, { useState, useEffect } from 'react';
import { X, UserPlus, Phone, Mail, ShieldAlert, Share2, Trash2, Edit3, Check } from 'lucide-react';
import { api } from '../../services/api';

export default function TrustedCircleModal({ onClose, onStartSharing, isSharingActive, sharedUrl }) {
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    relationship: 'Mother',
    phone: '',
    email: '',
    is_emergency_contact: true,
    can_view_live_location: true
  });
  const [copied, setCopied] = useState(false);
  const [editingContactId, setEditingContactId] = useState(null);
  const [editForm, setEditForm] = useState({ name: '', relationship: '', phone: '', email: '', is_emergency_contact: true, can_view_live_location: true });

  useEffect(() => {
    loadContacts();
  }, []);

  const loadContacts = async () => {
    try {
      const res = await api.getContacts();
      if (res.success) {
        setContacts(res.contacts);
        // default select all contacts that have can_view_live_location = true
        setSelectedIds(res.contacts.filter(c => c.can_view_live_location).map(c => c.id));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleSelect = (contactId) => {
    const contact = contacts.find(item => item.id === contactId);
    if (!contact?.can_view_live_location) return;
    setSelectedIds(prev =>
      prev.includes(contactId) ? prev.filter(id => id !== contactId) : [...prev, contactId]
    );
  };

  const handleCreateContact = async (e) => {
    e.preventDefault();
    if (!formData.name || !formData.phone) {
      alert('Please provide name and phone number.');
      return;
    }
    try {
      const res = await api.addContact(formData);
      if (res.success) {
        setContacts(prev => [...prev, res.contact]);
        if (res.contact.can_view_live_location) setSelectedIds(prev => [...prev, res.contact.id]);
        setShowAddForm(false);
        setFormData({
          name: '',
          relationship: 'Mother',
          phone: '',
          email: '',
          is_emergency_contact: true,
          can_view_live_location: true
        });
      }
    } catch (err) {
      alert(err.message);
    }
  };

  const beginEdit = (contact) => {
    setEditingContactId(contact.id);
    setEditForm({
      name: contact.name, relationship: contact.relationship, phone: contact.phone, email: contact.email || '',
      is_emergency_contact: contact.is_emergency_contact, can_view_live_location: contact.can_view_live_location
    });
  };

  const handleUpdateContact = async (event, contactId) => {
    event.preventDefault();
    try {
      const result = await api.updateContact(contactId, editForm);
      setContacts(previous => previous.map(contact => contact.id === contactId ? result.contact : contact));
      if (!result.contact.can_view_live_location) setSelectedIds(previous => previous.filter(id => id !== contactId));
      setEditingContactId(null);
    } catch (error) {
      alert(error.message || 'Could not update contact.');
    }
  };

  const handleDelete = async (contactId) => {
    if (!window.confirm('Remove this trusted contact from your circle?')) return;
    try {
      await api.deleteContact(contactId);
      setContacts(prev => prev.filter(c => c.id !== contactId));
      setSelectedIds(prev => prev.filter(id => id !== contactId));
    } catch (err) {
      alert(err.message);
    }
  };

  const copyShareLink = async () => {
    if (!sharedUrl) return;
    const fullUrl = `${window.location.origin}${sharedUrl}`;
    if (!navigator.clipboard?.writeText) {
      alert('Clipboard access is unavailable. Select and copy the link from the field.');
      return;
    }
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch {
      alert('Could not copy the link. Select and copy it from the field.');
    }
  };

  const handleStartSharing = async () => {
    try {
      const result = await onStartSharing(selectedIds);
      if (result?.success) onClose();
      else alert(result?.error || 'Could not start location sharing. Check GPS permission and try again.');
    } catch (error) {
      alert(error.message || 'Could not start location sharing.');
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content circle-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h3>🛡️ Trusted Safety Circle</h3>
            <p className="modal-subtitle">Manage trusted contacts and choose who may view your live-location link</p>
          </div>
          <button className="close-btn" onClick={onClose}><X size={20} /></button>
        </div>

        <div className="modal-body">
          {/* Active Sharing Status & Link */}
          {isSharingActive && sharedUrl && (
            <div className="active-sharing-box">
              <div className="sharing-status-row">
                <span className="live-dot-green"></span>
                <strong>Live Location Sharing Active</strong>
              </div>
              <p className="sharing-desc">
                The private link is a bearer link. Share it only with the trusted contacts you selected.
              </p>
              <div className="share-link-input-group">
                <input
                  type="text"
                  readOnly
                  value={`${window.location.origin}${sharedUrl}`}
                  className="share-link-field"
                />
                <button className="copy-link-btn" onClick={copyShareLink}>
                  {copied ? <Check size={16} /> : <Share2 size={16} />}
                  {copied ? 'Copied!' : 'Copy Link'}
                </button>
              </div>
            </div>
          )}

          {/* Quick Selection for Live Sharing */}
          <div className="circle-selector-header">
            <h4>Select Contacts for Live Sharing:</h4>
            <button
              className="text-btn add-contact-toggle"
              onClick={() => setShowAddForm(!showAddForm)}
            >
              <UserPlus size={16} /> {showAddForm ? 'Cancel' : 'Add Contact'}
            </button>
          </div>

          {showAddForm && (
            <form onSubmit={handleCreateContact} className="add-contact-form">
              <div className="form-grid">
                <div className="form-group">
                  <label>Full Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g., Sunita Sharma"
                    value={formData.name}
                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Relationship *</label>
                  <select
                    value={formData.relationship}
                    onChange={e => setFormData({ ...formData, relationship: e.target.value })}
                  >
                    <option value="Mother">Mother</option>
                    <option value="Sister">Sister</option>
                    <option value="Father">Father</option>
                    <option value="Brother">Brother</option>
                    <option value="Friend">Friend</option>
                    <option value="Roommate">Roommate</option>
                    <option value="Colleague">Colleague</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>

              <div className="form-grid">
                <div className="form-group">
                  <label>Phone Number *</label>
                  <input
                    type="tel"
                    required
                    placeholder="+91 98765 43210"
                    value={formData.phone}
                    onChange={e => setFormData({ ...formData, phone: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Email {formData.is_emergency_contact ? '*' : '(optional)'}</label>
                  <input
                    type="email"
                    required={formData.is_emergency_contact}
                    placeholder="email@example.com"
                    value={formData.email}
                    onChange={e => setFormData({ ...formData, email: e.target.value })}
                  />
                </div>
              </div>

              <div className="form-checkboxes">
                <label className="checkbox-item">
                  <input
                    type="checkbox"
                    checked={formData.is_emergency_contact}
                    onChange={e => setFormData({ ...formData, is_emergency_contact: e.target.checked })}
                  />
                  <span>Send SOS email alert (email address required)</span>
                </label>
                <label className="checkbox-item">
                  <input
                    type="checkbox"
                    checked={formData.can_view_live_location}
                    onChange={e => setFormData({ ...formData, can_view_live_location: e.target.checked })}
                  />
                  <span>Allow this contact to receive your private live-location link</span>
                </label>
              </div>

              <button type="submit" className="btn-primary-solid btn-block">
                Save to Circle
              </button>
            </form>
          )}

          <div className="contacts-list">
            {loading ? (
              <p className="empty-text">Loading contacts...</p>
            ) : contacts.length === 0 ? (
              <div className="empty-contacts">
                <p>No trusted contacts added yet. Add family or close friends to build your safety circle.</p>
              </div>
            ) : (
              contacts.map(c => {
                const isSelected = selectedIds.includes(c.id);
                return (
                  <div key={c.id} className={`contact-card ${isSelected ? 'selected' : ''}`}>
                    {editingContactId === c.id ? (
                      <form className="edit-contact-form" onSubmit={event => handleUpdateContact(event, c.id)}>
                        <input required maxLength={120} value={editForm.name} onChange={event => setEditForm({ ...editForm, name: event.target.value })} placeholder="Name" />
                        <input required maxLength={60} value={editForm.relationship} onChange={event => setEditForm({ ...editForm, relationship: event.target.value })} placeholder="Relationship" />
                        <input required maxLength={30} value={editForm.phone} onChange={event => setEditForm({ ...editForm, phone: event.target.value })} placeholder="Phone" />
                        <input type="email" maxLength={160} value={editForm.email} required={editForm.is_emergency_contact} onChange={event => setEditForm({ ...editForm, email: event.target.value })} placeholder="Email (optional)" />
                        <label><input type="checkbox" checked={editForm.is_emergency_contact} onChange={event => setEditForm({ ...editForm, is_emergency_contact: event.target.checked })} /> Emergency contact</label>
                        <label><input type="checkbox" checked={editForm.can_view_live_location} onChange={event => setEditForm({ ...editForm, can_view_live_location: event.target.checked })} /> Can view live-location link</label>
                        <div><button type="submit" className="btn-primary-solid btn-sm">Save</button><button type="button" className="btn-secondary-sm" onClick={() => setEditingContactId(null)}>Cancel</button></div>
                      </form>
                    ) : (
                      <>
                        <label className="contact-checkbox-label">
                          <input type="checkbox" checked={isSelected} disabled={!c.can_view_live_location} onChange={() => handleToggleSelect(c.id)} />
                          <div className="contact-info">
                            <div className="contact-name-row">
                              <strong>{c.name}</strong>
                              <span className="relation-pill">{c.relationship}</span>
                              {c.is_emergency_contact && <span className="emergency-badge">SOS Email Contact</span>}
                            </div>
                            <div className="contact-meta">
                              <span><Phone size={12} /> {c.phone}</span>
                              {c.email && <span><Mail size={12} /> {c.email}</span>}
                              {!c.can_view_live_location && <span>Live location not permitted</span>}
                            </div>
                          </div>
                        </label>
                        <div className="contact-actions">
                          <button className="delete-contact-btn" onClick={() => beginEdit(c)} title="Edit contact"><Edit3 size={16} /></button>
                          <button className="delete-contact-btn" onClick={() => handleDelete(c.id)} title="Remove contact"><Trash2 size={16} /></button>
                        </div>
                      </>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>Close</button>
          {onStartSharing && (
            <button
              className="btn-primary-solid"
              disabled={selectedIds.length === 0}
              onClick={handleStartSharing}
            >
              <Share2 size={16} /> {isSharingActive ? 'Update Live Sharing' : `Share With Selected (${selectedIds.length})`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
