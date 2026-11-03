import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { GeolocationService } from '../services/geolocation';
import { api } from '../services/api';
import { useAuth } from './AuthContext';

const LocationContext = createContext(null);

export function LocationProvider({ children }) {
  const { user, isAuthenticated } = useAuth();

  const [currentLocation, setCurrentLocation] = useState(null);
  const [gpsStatus, setGpsStatus] = useState('SEARCHING'); // 'ACTIVE', 'SEARCHING', 'PERMISSION_REQUIRED', 'ERROR'
  const [lastUpdatedTime, setLastUpdatedTime] = useState(null);
  const [isLiveTracking, setIsLiveTracking] = useState(false);
  const [activeSession, setActiveSession] = useState(null);
  const [safetyStatus, setSafetyStatus] = useState({
    safety_level: 'UNKNOWN',
    color: 'gray',
    headline: 'Location safety not checked',
    reason: 'Allow GPS access to evaluate the current area. No safety rating is available until a real location is checked.',
    is_isolated_area: false,
    nearby_incidents_count: 0
  });
  const [activeEmergency, setActiveEmergency] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);

  const watchIdRef = useRef(null);
  const syncIntervalRef = useRef(null);
  const emergencyPollRef = useRef(null);
  const autoStopTrackingAfterSosRef = useRef(false);
  const isLiveTrackingRef = useRef(false);

  useEffect(() => {
    isLiveTrackingRef.current = isLiveTracking;
  }, [isLiveTracking]);

  // Initial location fetch when authenticated
  useEffect(() => {
    if (isAuthenticated && user?.role === 'USER') {
      const initializeUserLocation = async () => {
        await fetchInitialLocation();
        await restoreLocationSession();
        await checkActiveEmergency();
      };
      initializeUserLocation();
      if (emergencyPollRef.current) clearInterval(emergencyPollRef.current);
      emergencyPollRef.current = setInterval(checkActiveEmergency, 15000);
    } else {
      if (watchIdRef.current !== null) GeolocationService.clearWatch(watchIdRef.current);
      if (syncIntervalRef.current) clearInterval(syncIntervalRef.current);
      if (emergencyPollRef.current) clearInterval(emergencyPollRef.current);
      emergencyPollRef.current = null;
      watchIdRef.current = null;
      syncIntervalRef.current = null;
      setIsLiveTracking(false);
      setActiveSession(null);
      setCurrentLocation(null);
    }

    return () => {
      if (watchIdRef.current !== null) GeolocationService.clearWatch(watchIdRef.current);
      if (syncIntervalRef.current) clearInterval(syncIntervalRef.current);
      if (emergencyPollRef.current) clearInterval(emergencyPollRef.current);
    };
  }, [isAuthenticated, user?.role]);

  const fetchInitialLocation = async () => {
    try {
      setGpsStatus('SEARCHING');
      const coords = await GeolocationService.getCurrentPosition();
      await handleLocationSuccess(coords);
    } catch (err) {
      console.warn('Smartphone Geolocation notice:', err.message);
      setGpsStatus('PERMISSION_REQUIRED');
      setErrorMessage(err.message);
    }
  };

  const checkActiveEmergency = async () => {
    try {
      const res = await api.getActiveEmergency();
      if (res.success && res.has_active_emergency) {
        setActiveEmergency(res.emergency);
        if (!isLiveTrackingRef.current) {
          autoStopTrackingAfterSosRef.current = true;
          await startLiveTracking([]);
        }
      } else {
        setActiveEmergency(null);
        if (autoStopTrackingAfterSosRef.current) {
          autoStopTrackingAfterSosRef.current = false;
          await stopLiveTracking();
        }
      }
    } catch (err) {
      console.error('Error checking active emergency:', err);
    }
  };

  const handleLocationSuccess = async (coords) => {
    setCurrentLocation(coords);
    setGpsStatus('ACTIVE');
    setLastUpdatedTime(new Date());
    setErrorMessage(null);

    // Evaluate location safety
    try {
      const evalRes = await api.evaluateLocation({
        latitude: coords.latitude,
        longitude: coords.longitude
      });
      if (evalRes.success) {
        setSafetyStatus(evalRes.safety_evaluation);
      }
    } catch (e) {
      console.warn('Safety eval warning:', e);
    }
  };

  const beginGpsWatch = () => {
    if (watchIdRef.current !== null) GeolocationService.clearWatch(watchIdRef.current);
    watchIdRef.current = GeolocationService.watchPosition(
      async (position) => {
        await handleLocationSuccess(position);
        try {
          await api.updateLocation({
            latitude: position.latitude,
            longitude: position.longitude,
            accuracy: position.accuracy,
            speed: position.speed,
            heading: position.heading
          });
        } catch (error) {
          console.error('Failed to sync location update to server:', error);
        }
      },
      (error) => {
        console.warn('Watch GPS error:', error.message);
        setGpsStatus('PERMISSION_REQUIRED');
        setErrorMessage(error.message);
      }
    );
  };

  const restoreLocationSession = async () => {
    try {
      const result = await api.getCurrentLocation();
      if (!result.success) return;
      if (result.is_tracking_active && result.session) {
        if (result.location) {
          setCurrentLocation({
            latitude: result.location.latitude,
            longitude: result.location.longitude,
            accuracy: result.location.accuracy,
            timestamp: result.location.timestamp
          });
          setLastUpdatedTime(result.location.timestamp ? new Date(result.location.timestamp) : new Date());
        }
        if (result.safety_status) setSafetyStatus(result.safety_status);
        setActiveSession(result.session);
        setIsLiveTracking(true);
        isLiveTrackingRef.current = true;
        setGpsStatus('ACTIVE');
        beginGpsWatch();
      }
    } catch (error) {
      console.warn('Could not restore the previous location session:', error.message);
    }
  };

  // Start continuous smartphone GPS tracking and backend sync
  const startLiveTracking = async (authorizedContactIds = [], initialCoordinates = null) => {
    try {
      let coords = initialCoordinates || currentLocation;
      const lastFixTime = coords?.timestamp ? new Date(coords.timestamp).getTime() : 0;
      const fixAge = Date.now() - lastFixTime;
      const fixIsFresh = Number.isFinite(lastFixTime) && fixAge >= 0 && fixAge <= 60000;
      if (!coords || !fixIsFresh) {
        coords = await GeolocationService.getCurrentPosition();
        await handleLocationSuccess(coords);
      }

      const res = await api.startTracking({
        authorized_contact_ids: authorizedContactIds,
        initial_lat: coords.latitude,
        initial_lng: coords.longitude,
        accuracy: coords.accuracy
      });

      if (res.success) {
        setIsLiveTracking(true);
        setActiveSession(res.session);

        isLiveTrackingRef.current = true;
        beginGpsWatch();

        return { success: true, shareUrl: res.share_url };
      }
    } catch (err) {
      console.error('Failed to start tracking:', err);
      setErrorMessage(err.message);
      return { success: false, error: err.message };
    }
  };

  const stopLiveTracking = async () => {
    if (watchIdRef.current) {
      GeolocationService.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setIsLiveTracking(false);
    isLiveTrackingRef.current = false;
    setActiveSession(null);

    if (isAuthenticated) {
      try {
        await api.stopTracking();
      } catch (err) {
        console.warn('Stop tracking server call:', err.message);
      }
    }
  };

  // Trigger Emergency SOS
  const triggerSos = async (notes = 'Emergency SOS signal triggered') => {
    try {
      let coords = currentLocation;
      const lastFixTime = coords?.timestamp ? new Date(coords.timestamp).getTime() : 0;
      const fixAge = Date.now() - lastFixTime;
      const fixIsFresh = Number.isFinite(lastFixTime) && fixAge >= 0 && fixAge <= 60000;
      if (!coords || !fixIsFresh) {
        coords = await GeolocationService.getCurrentPosition();
        await handleLocationSuccess(coords);
      }

      const payload = {
        latitude: coords.latitude,
        longitude: coords.longitude,
        accuracy: coords.accuracy || 10.0,
        notes
      };

      const res = await api.triggerSos(payload);
      if (res.success) {
        setActiveEmergency(res.emergency);
        // Preserve an existing user-started tracking session after SOS resolution.
        autoStopTrackingAfterSosRef.current = !isLiveTracking;
        // Automatically start live tracking to stream updates to responders.
        await startLiveTracking([], coords);
        return { success: true, emergency: res.emergency, emailAlertsSent: res.email_alerts_sent || 0, emergencyContactsCount: res.emergency_contacts_count || 0 };
      }
      return { success: false, error: res.message || 'Emergency SOS could not be activated.' };
    } catch (err) {
      console.error('Error triggering SOS:', err);
      return { success: false, error: err.message };
    }
  };

  // Cancel or resolve emergency
  const resolveOrCancelEmergency = async (status, notes = '') => {
    if (!activeEmergency) return;
    try {
      const res = await api.updateEmergencyStatus(activeEmergency.id, { status, notes });
      if (res.success) {
        setActiveEmergency(null);
        if (autoStopTrackingAfterSosRef.current) {
          autoStopTrackingAfterSosRef.current = false;
          await stopLiveTracking();
        }
        return { success: true };
      }
    } catch (err) {
      console.error('Error updating emergency status:', err);
      return { success: false, error: err.message };
    }
  };

  return (
    <LocationContext.Provider
      value={{
        currentLocation,
        gpsStatus,
        lastUpdatedTime,
        isLiveTracking,
        activeSession,
        safetyStatus,
        activeEmergency,
        errorMessage,
        fetchInitialLocation,
        startLiveTracking,
        stopLiveTracking,
        triggerSos,
        resolveOrCancelEmergency,
        checkActiveEmergency
      }}
    >
      {children}
    </LocationContext.Provider>
  );
}

export function useLocation() {
  const context = useContext(LocationContext);
  if (!context) {
    throw new Error('useLocation must be used within a LocationProvider');
  }
  return context;
}
