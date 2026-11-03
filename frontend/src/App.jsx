import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LocationProvider } from './context/LocationContext';
import Navbar from './components/common/Navbar';
import BottomNav from './components/common/BottomNav';
import LoginPage from './pages/auth/LoginPage';
import UserDashboard from './pages/user/UserDashboard';
import CommunityDashboard from './pages/community/CommunityDashboard';
import HistoryDashboard from './pages/history/HistoryDashboard';
import SafetyMapPage from './pages/map/SafetyMapPage';
import AuthorizedTrackingPage from './pages/track/AuthorizedTrackingPage';
import AdminDashboard from './pages/admin/AdminDashboard';
import ReportIncidentModal from './components/incidents/ReportIncidentModal';
import TrustedCircleModal from './components/contacts/TrustedCircleModal';
import './index.css';

// Guard for protected routes with role verification
function ProtectedRoute({ children, allowedRoles }) {
  const { user, isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="app-loading-screen">
        <div className="loading-spinner"></div>
        <p>Loading SheDefender Safety System...</p>
      </div>
    );
  }

  // Not logged in -> strict redirect to login
  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />;
  }

  // Role check
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    // If user is responder trying to access normal dashboard, redirect to community
    if (user.role === 'COMMUNITY_RESPONDER') {
      return <Navigate to="/community/dashboard" replace />;
    }
    if (user.role === 'ADMIN') {
      return <Navigate to="/admin" replace />;
    }
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}

// Root entry redirector (Section 4 requirement)
function RootRedirect() {
  const { user, isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="app-loading-screen">
        <div className="loading-spinner"></div>
        <p>Loading SheDefender...</p>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return <LoginPage />;
  }

  if (user.role === 'COMMUNITY_RESPONDER') {
    return <Navigate to="/community/dashboard" replace />;
  } else if (user.role === 'ADMIN') {
    return <Navigate to="/admin" replace />;
  } else {
    return <Navigate to="/dashboard" replace />;
  }
}

function MainLayout() {
  const { user } = useAuth();
  const [showQuickReport, setShowQuickReport] = useState(false);
  const [showQuickContacts, setShowQuickContacts] = useState(false);

  return (
    <div className="app-shell">
      <Navbar />

      <main className="app-main-content">
        <Routes>
          {/* First screen must always be Login / Sign-in */}
          <Route path="/" element={<RootRedirect />} />
          <Route path="/login" element={<LoginPage />} />

          {/* DASHBOARD 1: User Dashboard */}
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute allowedRoles={['USER']}>
                <UserDashboard />
              </ProtectedRoute>
            }
          />

          {/* DASHBOARD 2: Community Dashboard */}
          <Route
            path="/community/dashboard"
            element={
              <ProtectedRoute allowedRoles={['COMMUNITY_RESPONDER']}>
                <CommunityDashboard />
              </ProtectedRoute>
            }
          />

          {/* DASHBOARD 3: History Dashboard */}
          <Route
            path="/history"
            element={
              <ProtectedRoute allowedRoles={['USER', 'COMMUNITY_RESPONDER', 'ADMIN']}>
                <HistoryDashboard />
              </ProtectedRoute>
            }
          />

          {/* Full Safety Map */}
          <Route
            path="/safety-map"
            element={
              <ProtectedRoute allowedRoles={['USER', 'COMMUNITY_RESPONDER', 'ADMIN']}>
                <SafetyMapPage />
              </ProtectedRoute>
            }
          />

          {/* Authorized Trusted Contact Shared Tracking */}
          <Route path="/track/:token" element={<AuthorizedTrackingPage />} />

          {/* Optional Admin Portal */}
          <Route
            path="/admin"
            element={
              <ProtectedRoute allowedRoles={['ADMIN']}>
                <AdminDashboard />
              </ProtectedRoute>
            }
          />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      {/* Mobile Bottom Navigation bar */}
      {user && (
        <BottomNav
          onOpenReport={() => setShowQuickReport(true)}
          onOpenContacts={() => setShowQuickContacts(true)}
        />
      )}

      {showQuickReport && (
        <ReportIncidentModal onClose={() => setShowQuickReport(false)} />
      )}

      {showQuickContacts && (
        <TrustedCircleModal onClose={() => setShowQuickContacts(false)} />
      )}
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <LocationProvider>
          <MainLayout />
        </LocationProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
