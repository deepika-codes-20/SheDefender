import React, { useState, useEffect } from 'react';
import { Map, Layers, Navigation, AlertTriangle, ShieldCheck, RefreshCw } from 'lucide-react';
import { api } from '../../services/api';
import { useLocation } from '../../context/LocationContext';
import SafetyLeafletMap from '../../components/map/SafetyLeafletMap';

export default function SafetyMapPage() {
  const { currentLocation, fetchInitialLocation } = useLocation();
  const [zones, setZones] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [showZones, setShowZones] = useState(true);
  const [showIncidents, setShowIncidents] = useState(true);
  const [loading, setLoading] = useState(true);
  const [thresholds, setThresholds] = useState({ high_critical: 10, high_warning: 6, moderate: 3, analysis_days: 7, radius_meters: 750 });

  useEffect(() => {
    loadMapData();
  }, []);

  const loadMapData = async () => {
    setLoading(true);
    try {
      const res = await api.getSafetyMapData();
      if (res.success) {
        setZones(res.zones);
        setIncidents(res.incidents);
        if (res.thresholds) setThresholds(res.thresholds);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="dashboard-page safety-map-page">
      <div className="dashboard-container">
        
        <div className="map-page-header">
          <div className="flex-align gap-2">
            <Map size={24} className="text-primary" />
            <div>
              <h1 className="history-title">SheDefender Safety Map</h1>
              <p className="history-subtitle">
                Spatial safety intelligence from verified community incident reports in the configured analysis window.
              </p>
            </div>
          </div>

          <div className="map-control-actions">
            <button className="btn-secondary-sm" onClick={fetchInitialLocation}>
              <Navigation size={14} /> My Location
            </button>
            <button className="btn-secondary-sm" onClick={loadMapData}>
              <RefreshCw size={14} /> Refresh Map
            </button>
          </div>
        </div>

        {/* Layer Filters */}
        <div className="map-layer-toggles">
          <label className="toggle-chip">
            <input
              type="checkbox"
              checked={showZones}
              onChange={e => setShowZones(e.target.checked)}
            />
            <span>Safety Risk Zones ({zones.length})</span>
          </label>
          <label className="toggle-chip">
            <input
              type="checkbox"
              checked={showIncidents}
              onChange={e => setShowIncidents(e.target.checked)}
            />
            <span>Incident Markers ({incidents.length})</span>
          </label>
        </div>

        {/* Full Interactive Map */}
        <div className="dashboard-card fullscreen-map-card">
          <SafetyLeafletMap
            userLocation={currentLocation}
            zones={showZones ? zones : []}
            incidents={showIncidents ? incidents : []}
            height="580px"
          />
        </div>

        {/* Risk Level Explanation Legend */}
        <div className="map-legend-explainer">
          <h4>Risk Classification Legend</h4>
          <p>Based on reports within {thresholds.analysis_days} days and approximately {thresholds.radius_meters} m. Thresholds are read from the backend configuration.</p>
          <div className="legend-grid">
            <div className="legend-box normal">
              <span className="legend-color-tag green"></span>
              <div>
                <strong>NORMAL (0–{thresholds.moderate - 1} reports)</strong>
                <p>No elevated cluster of recent reports was detected within the configured analysis area.</p>
              </div>
            </div>
            <div className="legend-box critical">
              <span className="legend-color-tag red"></span>
              <div>
                <strong>HIGH CRITICAL ({thresholds.high_critical}+ reports)</strong>
                <p>Severe concentration of repeated threats or harassment. Immediate caution advised.</p>
              </div>
            </div>

            <div className="legend-box warning">
              <span className="legend-color-tag orange"></span>
              <div>
                <strong>HIGH WARNING ({thresholds.high_warning}–{thresholds.high_critical - 1} reports)</strong>
                <p>Frequent safety reports in this sector. Consider sharing live location with circle.</p>
              </div>
            </div>

            <div className="legend-box moderate">
              <span className="legend-color-tag yellow"></span>
              <div>
                <strong>MODERATE CAUTION ({thresholds.moderate}–{thresholds.high_warning - 1} reports)</strong>
                <p>Intermittent incident activity or poorly illuminated pedestrian pathways.</p>
              </div>
            </div>

            <div className="legend-box isolated">
              <span className="legend-color-tag purple"></span>
              <div>
                <strong>POTENTIALLY ISOLATED AREA</strong>
                <p>Low road density, dense peripheral vegetation, or distant emergency facilities.</p>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
