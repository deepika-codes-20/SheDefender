// SheDefender Real Smartphone Geolocation Service
// Uses HTML5 Geolocation API: navigator.geolocation

export const GeolocationService = {
  isSupported() {
    return 'geolocation' in navigator;
  },

  getCurrentPosition(options = {}) {
    return new Promise((resolve, reject) => {
      if (!this.isSupported()) {
        reject(new Error('Geolocation is not supported by your mobile browser.'));
        return;
      }

      const defaultOptions = {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 0,
        ...options
      };

      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            speed: position.coords.speed,
            heading: position.coords.heading,
            altitude: position.coords.altitude,
            timestamp: position.timestamp
          });
        },
        (error) => {
          let message = 'Unable to retrieve your location.';
          switch (error.code) {
            case error.PERMISSION_DENIED:
              message = 'Location permission denied. Please allow GPS location in your smartphone browser settings.';
              break;
            case error.POSITION_UNAVAILABLE:
              message = 'GPS location information is currently unavailable.';
              break;
            case error.TIMEOUT:
              message = 'GPS location request timed out. Please check signal.';
              break;
          }
          reject(new Error(message));
        },
        defaultOptions
      );
    });
  },

  watchPosition(onSuccess, onError, options = {}) {
    if (!this.isSupported()) {
      if (onError) onError(new Error('Geolocation is not supported by this browser.'));
      return null;
    }

    const defaultOptions = {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 5000,
      ...options
    };

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        onSuccess({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          speed: position.coords.speed,
          heading: position.coords.heading,
          altitude: position.coords.altitude,
          timestamp: position.timestamp
        });
      },
      (error) => {
        let message = 'GPS tracking update failed.';
        if (error.code === error.PERMISSION_DENIED) {
          message = 'Location permission revoked.';
        }
        if (onError) onError(new Error(message));
      },
      defaultOptions
    );

    return watchId;
  },

  clearWatch(watchId) {
    if (watchId !== null && 'geolocation' in navigator) {
      navigator.geolocation.clearWatch(watchId);
    }
  }
};
