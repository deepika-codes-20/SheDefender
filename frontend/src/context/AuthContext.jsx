import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, AUTH_TOKEN_KEY } from '../services/api';
const AuthContext = createContext(null);
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [responderProfile, setResponderProfile] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const refreshUser = useCallback(async () => {
    if (!window.localStorage.getItem(AUTH_TOKEN_KEY)) { setUser(null); setResponderProfile(null); return null; }
    try {
      const response = await api.getCurrentUser();
      if (!response.success) throw new Error(response.message || 'Unable to load profile.');
      setUser(response.user); setResponderProfile(response.responder_profile || null); return response.user;
    } catch (error) {
      window.localStorage.removeItem(AUTH_TOKEN_KEY); setUser(null); setResponderProfile(null); throw error;
    }
  }, []);
  useEffect(() => {
    let active = true;
    (async () => { try { await refreshUser(); } catch (error) { console.warn('Could not restore SheDefender session:', error.message); }
      finally { if (active) setIsLoading(false); } })();
    return () => { active = false; };
  }, [refreshUser]);
  const logout = useCallback(async () => {
    if (user?.role === 'USER') {
      try { await api.stopTracking(); } catch (error) { console.warn('Could not stop live tracking during logout:', error.message); }
    }
    try { await api.logout(); } catch (error) { console.warn('Logout request failed:', error.message); }
    window.localStorage.removeItem(AUTH_TOKEN_KEY); setUser(null); setResponderProfile(null);
  }, [user]);
  const token = window.localStorage.getItem(AUTH_TOKEN_KEY);
  return <AuthContext.Provider value={{ user, token, responderProfile, isAuthenticated: !!token && !!user, isLoading, refreshUser, logout }}>{children}</AuthContext.Provider>;
}
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}
