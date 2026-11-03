// SheDefender API client. Protected requests use the Flask-issued JWT.
export const AUTH_TOKEN_KEY = 'shedefender_auth_token';
const BASE_URL = '/api';

async function request(endpoint, options = {}) {
  const token = window.localStorage.getItem(AUTH_TOKEN_KEY);
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {})
  };
  const response = await fetch(`${BASE_URL}${endpoint}`, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && !endpoint.startsWith('/auth/')) {
      window.localStorage.removeItem(AUTH_TOKEN_KEY);
      window.location.href = '/login';
    }
    throw new Error(data.message || `Request failed with status ${response.status}`);
  }
  return data;
}

const post = (endpoint, payload) => request(endpoint, {
  method: 'POST', body: JSON.stringify(payload)
});

export const api = {
  // Authentication
  login: (payload) => post('/auth/login', payload),
  requestRegistrationOtp: (payload) => post('/auth/register/request-otp', payload),
  verifyRegistrationOtp: (payload) => post('/auth/register/verify-otp', payload),
  completeResponderSetup: (payload) => post('/auth/responder/setup', payload),
  requestPasswordResetOtp: (payload) => post('/auth/forgot-password/request-otp', payload),
  resetPassword: (payload) => post('/auth/forgot-password/reset', payload),
  getCurrentUser: () => request('/auth/me'),
  logout: () => request('/auth/logout', { method: 'POST' }),

  getProfile: () => request('/user/profile'),
  updateProfile: (data) => request('/user/profile', { method: 'PUT', body: JSON.stringify(data) }),
  getNotifications: () => request('/user/notifications'),
  markNotificationRead: (id) => request(`/user/notifications/${id}/read`, { method: 'PUT' }),

  getContacts: () => request('/trusted-contacts'),
  addContact: (data) => post('/trusted-contacts', data),
  updateContact: (id, data) => request(`/trusted-contacts/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteContact: (id) => request(`/trusted-contacts/${id}`, { method: 'DELETE' }),

  startTracking: (data) => post('/location/start', data),
  updateLocation: (data) => post('/location/update', data),
  stopTracking: () => request('/location/stop', { method: 'POST' }),
  getCurrentLocation: () => request('/location/current'),
  getSharedTracking: (token) => request(`/location/track/${token}`),

  triggerSos: (data) => post('/emergency', data),
  getActiveEmergency: () => request('/emergency/active'),
  getEmergencyDetails: (id) => request(`/emergency/${id}`),
  updateEmergencyStatus: (id, data) => request(`/emergency/${id}/status`, { method: 'PUT', body: JSON.stringify(data) }),

  getResponderProfile: () => request('/community/profile'),
  setAvailability: (availability) => request('/community/availability', { method: 'PUT', body: JSON.stringify({ availability }) }),
  updateResponderLocation: (data) => post('/community/location', data),
  getActiveEmergencies: () => request('/community/emergencies'),
  acceptEmergency: (id) => request(`/community/emergencies/${id}/accept`, { method: 'POST' }),
  updateResponseStatus: (id, data) => request(`/community/response/${id}/status`, { method: 'PUT', body: JSON.stringify(data) }),

  getIncidents: (params = '') => request(`/incidents${params}`),
  getIncidentDetail: (id) => request(`/incidents/${id}`),
  reportIncident: (data) => post('/incidents', data),
  getSafetyZones: () => request('/safety/zones'),
  getSafetyMapData: () => request('/safety/map-data'),
  evaluateLocation: (data) => post('/safety/evaluate', data),

  getHistoryOverview: () => request('/history/overview'),
  getHistoryIncidents: (params = '') => request(`/history/incidents${params}`),
  getHistoryEmergencies: (params = '') => request(`/history/emergencies${params}`),
  getHistoryLocationSessions: (params = '') => request(`/history/location-sharing${params}`),
  getHistoryResponses: (params = '') => request(`/history/responses${params}`),

  // Admin APIs
  getAdminStats: () => request('/admin/statistics'),
  getAdminUsers: () => request('/admin/users'),
  getAdminResponders: () => request('/admin/responders'),
  getAdminIncidents: () => request('/admin/incidents'),
  getAdminSafetyZones: () => request('/admin/safety-zones'),
  createAdminSafetyZone: (data) => request('/admin/safety-zones', { method: 'POST', body: JSON.stringify(data) }),
  updateAdminSafetyZone: (id, data) => request(`/admin/safety-zones/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteAdminSafetyZone: (id) => request(`/admin/safety-zones/${id}`, { method: 'DELETE' }),
  updateIncidentReviewStatus: (id, status) => request(`/admin/incidents/${id}/status`, { method: 'PUT', body: JSON.stringify({ status }) }),
  createAdminResponder: (data) => post('/admin/responders', data),
  resendResponderInvitation: (id) => request(`/admin/responders/${id}/invite`, { method: 'POST' }),
  updateAdminResponder: (id, data) => request(`/admin/responders/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  setAdminResponderActive: (id, is_active) => request(`/admin/responders/${id}/active`, { method: 'PUT', body: JSON.stringify({ is_active }) }),
  deleteAdminResponder: (id) => request(`/admin/responders/${id}`, { method: 'DELETE' }),
  verifyResponder: (id, status) => post(`/admin/responders/${id}/verify`, { status })
};
