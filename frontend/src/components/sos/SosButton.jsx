import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useLocation } from '../../context/LocationContext';

export default function SosButton() {
  const { triggerSos, activeEmergency } = useLocation();
  const [isActivating, setIsActivating] = useState(false);

  const handlePress = async () => {
    setIsActivating(true);
    const res = await triggerSos('Emergency SOS triggered from User Dashboard');
    setIsActivating(false);
    if (!res.success) {
      alert(`Emergency trigger notice: ${res.error || 'Please ensure GPS is enabled.'}`);
    } else if (res.emailAlertsSent > 0) {
      alert(`SOS activated. ${res.emailAlertsSent} emergency-contact email alert(s) were sent.`);
    } else if (res.emergencyContactsCount === 0) {
      alert('SOS activated and the responder queue is active. No emergency contacts with email addresses are configured.');
    } else {
      alert('SOS activated and the responder queue is active, but trusted-contact email delivery failed. Check Gmail SMTP settings.');
    }
  };

  if (activeEmergency) {
    return (
      <div className="sos-active-badge">
        <span className="pulsing-sos-dot"></span>
        <span>EMERGENCY SOS IS CURRENTLY ACTIVE</span>
      </div>
    );
  }

  return (
    <div className="sos-button-wrapper">
      <button
        className={`sos-giant-button ${isActivating ? 'activating' : ''}`}
        onClick={handlePress}
        disabled={isActivating}
        title="Trigger Emergency SOS"
      >
        <div className="sos-outer-ring"></div>
        <div className="sos-inner-circle">
          {isActivating ? (
            <Loader2 className="spinner" size={44} />
          ) : (
            <>
              <span className="sos-symbol">🚨</span>
              <span className="sos-text">SOS</span>
              <span className="sos-subtext">PRESS FOR EMERGENCY</span>
            </>
          )}
        </div>
      </button>
      <p className="sos-instruction">
        Sends your current GPS coordinates to the SheDefender responder queue and starts live location updates. Trusted contacts can view a private link you choose to share.
      </p>
    </div>
  );
}
