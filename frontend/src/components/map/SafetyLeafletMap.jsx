import { formatDate } from '../../utils/dateTime';
import React, { useEffect, useRef } from 'react';
import L from 'leaflet';

const escapeHtml = (value) => String(value ?? '').replace(/[&<>\"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', "'": '&#39;'
}[character]));

// Fix default Leaflet icon paths in Vite
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Custom SVG Icons
const createUserIcon = () => L.divIcon({
  className: 'custom-user-pin',
  html: `
    <div style="
      position: relative;
      width: 24px;
      height: 24px;
      background: #2563EB;
      border: 3px solid #FFFFFF;
      border-radius: 50%;
      box-shadow: 0 0 12px rgba(37,99,235,0.6);
    ">
      <div style="
        position: absolute;
        top: -6px; left: -6px;
        width: 30px; height: 30px;
        border-radius: 50%;
        background: rgba(37,99,235,0.25);
        animation: pulseRing 2s infinite;
      "></div>
    </div>
  `,
  iconSize: [24, 24],
  iconAnchor: [12, 12]
});

const createEmergencyIcon = () => L.divIcon({
  className: 'custom-emergency-pin',
  html: `
    <div style="
      position: relative;
      width: 32px;
      height: 32px;
      background: #DC2626;
      border: 3px solid #FFFFFF;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-weight: 800;
      font-size: 16px;
      box-shadow: 0 0 20px rgba(220,38,38,0.8);
      animation: alertBounce 1s infinite alternate;
    ">
      🚨
    </div>
  `,
  iconSize: [32, 32],
  iconAnchor: [16, 16]
});

const createResponderIcon = () => L.divIcon({
  className: 'custom-responder-pin',
  html: `
    <div style="
      width: 28px;
      height: 28px;
      background: #059669;
      border: 3px solid #FFFFFF;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-size: 14px;
      box-shadow: 0 0 12px rgba(5,150,105,0.7);
    ">
      🛡️
    </div>
  `,
  iconSize: [28, 28],
  iconAnchor: [14, 14]
});

const createIncidentIcon = (severity) => {
  let bg = '#F59E0B';
  if (severity === 'CRITICAL') bg = '#EF4444';
  if (severity === 'HIGH') bg = '#F97316';
  if (severity === 'LOW') bg = '#10B981';

  return L.divIcon({
    className: 'custom-incident-pin',
    html: `
      <div style="
        width: 18px;
        height: 18px;
        background: ${bg};
        border: 2px solid #FFFFFF;
        border-radius: 50%;
        box-shadow: 0 1px 4px rgba(0,0,0,0.3);
      "></div>
    `,
    iconSize: [18, 18],
    iconAnchor: [9, 9]
  });
};

export default function SafetyLeafletMap({
  center = [20.5937, 78.9629],
  zoom = 5,
  userLocation,
  zones = [],
  incidents = [],
  responderLocation,
  emergencyLocation,
  height = '320px',
  showAccuracyRing = true
}) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const layerGroupRef = useRef(null);

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        center: center,
        zoom: zoom,
        zoomControl: true,
        attributionControl: true
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      }).addTo(map);

      layerGroupRef.current = L.layerGroup().addTo(map);
      mapInstanceRef.current = map;
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Update Layers and Markers dynamically
  useEffect(() => {
    const map = mapInstanceRef.current;
    const layers = layerGroupRef.current;
    if (!map || !layers) return;

    layers.clearLayers();

    // 1. Render Safety Zones (Circles)
    zones.forEach((zone) => {
      let color = zone.color || '#10B981';
      let fillColor = color;
      let fillOpacity = 0.18;

      if (zone.is_isolated_area || zone.safety_level === 'ISOLATED_AREA') {
        color = '#8B5CF6';
        fillColor = '#8B5CF6';
        fillOpacity = 0.22;
      } else if (zone.safety_level === 'HIGH_CRITICAL') {
        color = '#EF4444';
        fillColor = '#EF4444';
        fillOpacity = 0.28;
      } else if (zone.safety_level === 'HIGH_WARNING') {
        color = '#F97316';
        fillColor = '#F97316';
        fillOpacity = 0.22;
      } else if (zone.safety_level === 'MODERATE') {
        color = '#F59E0B';
        fillColor = '#F59E0B';
        fillOpacity = 0.18;
      }

      const circle = L.circle([zone.center_lat, zone.center_lng], {
        color: color,
        fillColor: fillColor,
        fillOpacity: fillOpacity,
        weight: 2,
        radius: zone.radius_meters || 500
      });

      circle.bindPopup(`
        <div style="font-family: inherit; font-size: 13px; line-height: 1.4;">
          <strong style="color: ${color}; font-size: 14px;">${escapeHtml(zone.name)}</strong><br/>
          <strong>Level:</strong> ${escapeHtml((zone.safety_level || 'NORMAL').replaceAll('_', ' '))}<br/>
          ${zone.is_isolated_area ? '<span style="color:#8B5CF6; font-weight:600;">⚠ Potentially Isolated Area</span><br/>' : ''}
          <strong>Incident Count:</strong> ${escapeHtml(zone.incident_count)}<br/>
          <small style="color: #64748B;">${escapeHtml(zone.reason || '')}</small>
        </div>
      `);
      layers.addLayer(circle);
    });

    // 2. Render Historical Incidents
    incidents.forEach((inc) => {
      const marker = L.marker([inc.latitude, inc.longitude], {
        icon: createIncidentIcon(inc.severity)
      });
      marker.bindPopup(`
        <div style="font-family: inherit; font-size: 13px;">
          <strong style="color: #0F172A;">${escapeHtml(inc.incident_type)}</strong>
          <span style="font-size: 11px; padding: 2px 6px; background: #F1F5F9; border-radius: 4px; margin-left: 6px;">${escapeHtml(inc.severity)}</span>
          <p style="margin: 4px 0 2px 0; color: #475569;">${escapeHtml(inc.description)}</p>
          <small style="color: #94A3B8;">${escapeHtml(formatDate(inc.occurred_at))}</small>
        </div>
      `);
      layers.addLayer(marker);
    });

    // 3. Render Emergency Location (if active)
    if (emergencyLocation && emergencyLocation.latitude != null && emergencyLocation.longitude != null) {
      const emMarker = L.marker([emergencyLocation.latitude, emergencyLocation.longitude], {
        icon: createEmergencyIcon()
      });
      emMarker.bindPopup(`
        <div style="font-size: 13px;">
          <strong style="color: #DC2626;">🚨 ACTIVE EMERGENCY #${emergencyLocation.id || ''}</strong><br/>
          <span>Assistance Required Immediately</span>
        </div>
      `);
      layers.addLayer(emMarker);
    }

    // 4. Render Responder Location (if active)
    if (responderLocation && responderLocation.current_lat != null && responderLocation.current_lng != null) {
      const respMarker = L.marker([responderLocation.current_lat, responderLocation.current_lng], {
        icon: createResponderIcon()
      });
      respMarker.bindPopup(`
        <div style="font-size: 13px;">
          <strong style="color: #059669;">🛡️ Verified Responder</strong><br/>
          <span>${escapeHtml(responderLocation.responder_name || 'Active Responder')}</span>
        </div>
      `);
      layers.addLayer(respMarker);

      // If both emergency and responder exist, draw connecting line
      if (emergencyLocation && emergencyLocation.latitude != null && emergencyLocation.longitude != null) {
        const line = L.polyline(
          [
            [responderLocation.current_lat, responderLocation.current_lng],
            [emergencyLocation.latitude, emergencyLocation.longitude]
          ],
          { color: '#2563EB', weight: 3, dashArray: '6, 8' }
        );
        layers.addLayer(line);
      }
    }

    // 5. Render Current User Location
    if (userLocation && userLocation.latitude != null && userLocation.longitude != null) {
      const userMarker = L.marker([userLocation.latitude, userLocation.longitude], {
        icon: createUserIcon(),
        zIndexOffset: 1000
      });
      userMarker.bindPopup(`
        <div style="font-size: 13px;">
          <strong style="color: #2563EB;">📍 You Are Here</strong><br/>
          <span>Accuracy: ±${Math.round(userLocation.accuracy || 10)}m</span>
        </div>
      `);
      layers.addLayer(userMarker);

      if (showAccuracyRing && userLocation.accuracy) {
        const accCircle = L.circle([userLocation.latitude, userLocation.longitude], {
          radius: Math.min(userLocation.accuracy, 120),
          color: '#3B82F6',
          weight: 1,
          fillColor: '#93C5FD',
          fillOpacity: 0.15
        });
        layers.addLayer(accCircle);
      }

      // Pan to the actual GPS fix; do not use a fabricated default user coordinate.
      map.setView([userLocation.latitude, userLocation.longitude], Math.max(map.getZoom(), 15));
    } else if (emergencyLocation && emergencyLocation.latitude != null && emergencyLocation.longitude != null) {
      map.setView([emergencyLocation.latitude, emergencyLocation.longitude], 16);
    } else if (responderLocation && responderLocation.current_lat != null && responderLocation.current_lng != null) {
      map.setView([responderLocation.current_lat, responderLocation.current_lng], 15);
    } else {
      const coordinates = [
        ...zones.map(zone => [zone.center_lat, zone.center_lng]),
        ...incidents.map(incident => [incident.latitude, incident.longitude])
      ].filter(point => Number.isFinite(point[0]) && Number.isFinite(point[1]));
      if (coordinates.length === 1) map.setView(coordinates[0], 14);
      else if (coordinates.length > 1) map.fitBounds(L.latLngBounds(coordinates), { padding: [24, 24], maxZoom: 13 });
    }
  }, [userLocation, zones, incidents, responderLocation, emergencyLocation]);

  return (
    <div style={{ position: 'relative', width: '100%', height: height, borderRadius: '16px', overflow: 'hidden' }}>
      <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }} />
      <style>{`
        @keyframes pulseRing {
          0% { transform: scale(0.9); opacity: 0.8; }
          100% { transform: scale(1.8); opacity: 0; }
        }
        @keyframes alertBounce {
          0% { transform: translateY(0); }
          100% { transform: translateY(-6px); }
        }
      `}</style>
    </div>
  );
}
