import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Shield, ShieldAlert, Users, Mail, KeyRound, ArrowRight,
  CheckCircle2, AlertCircle, Info, LockKeyhole, Phone, UserRound, Lock
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { api, AUTH_TOKEN_KEY } from '../../services/api';

export default function LoginPage() {
  const navigate = useNavigate();
  const { refreshUser } = useAuth();
  const [activeRole, setActiveRole] = useState('USER');
  const [mode, setMode] = useState('login');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState({ type: '', message: '' });

  const showFeedback = (type, message) => setFeedback({ type, message });
  const resetMode = (nextMode) => {
    setMode(nextMode);
    setOtp('');
    setPassword('');
    setNewPassword('');
    showFeedback('', '');
  };

  const goToDashboard = (user) => {
    if (user.role === 'ADMIN') navigate('/admin', { replace: true });
    else if (user.role === 'COMMUNITY_RESPONDER') navigate('/community/dashboard', { replace: true });
    else navigate('/dashboard', { replace: true });
  };

  const acceptLogin = async (result) => {
    window.localStorage.setItem(AUTH_TOKEN_KEY, result.token);
    try {
      const user = await refreshUser();
      goToDashboard(user);
    } catch (error) {
      window.localStorage.removeItem(AUTH_TOKEN_KEY);
      throw error;
    }
  };

  const handleLogin = async (event) => {
    event.preventDefault();
    setLoading(true);
    showFeedback('', '');
    try {
      const result = await api.login({ email: email.trim().toLowerCase(), password, role: activeRole });
      await acceptLogin(result);
    } catch (error) {
      showFeedback('error', error.message || 'Login failed. Check your credentials and account status.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegistrationRequest = async (event) => {
    event.preventDefault();
    setLoading(true);
    showFeedback('', '');
    try {
      const result = await api.requestRegistrationOtp({
        name: name.trim(), email: email.trim().toLowerCase(), phone: phone.trim(), password
      });
      setMode('register-verify');
      setOtp('');
      showFeedback('success', result.message || 'Verification code sent.');
    } catch (error) {
      showFeedback('error', error.message || 'Could not send the verification code.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegistrationVerify = async (event) => {
    event.preventDefault();
    if (!/^\d{6}$/.test(otp)) return showFeedback('error', 'Enter the six-digit code from your email.');
    setLoading(true);
    showFeedback('', '');
    try {
      const result = await api.verifyRegistrationOtp({ email: email.trim().toLowerCase(), otp_code: otp });
      await acceptLogin(result);
    } catch (error) {
      showFeedback('error', error.message || 'Email verification failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleResponderSetup = async (event) => {
    event.preventDefault();
    if (!/^\d{6}$/.test(otp)) return showFeedback('error', 'Enter the six-digit invitation code.');
    setLoading(true);
    showFeedback('', '');
    try {
      const result = await api.completeResponderSetup({
        email: email.trim().toLowerCase(), otp_code: otp, password
      });
      setMode('login');
      setPassword('');
      setOtp('');
      showFeedback('success', result.message || 'Responder account setup completed.');
    } catch (error) {
      showFeedback('error', error.message || 'Responder account setup failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotRequest = async (event) => {
    event.preventDefault();
    setLoading(true);
    showFeedback('', '');
    try {
      const result = await api.requestPasswordResetOtp({ email: email.trim().toLowerCase() });
      setMode('forgot-reset');
      setOtp('');
      showFeedback('success', result.message || 'If your account exists, a reset code has been sent.');
    } catch (error) {
      showFeedback('error', error.message || 'Could not request a password reset.');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotReset = async (event) => {
    event.preventDefault();
    if (!/^\d{6}$/.test(otp)) return showFeedback('error', 'Enter the six-digit reset code.');
    setLoading(true);
    showFeedback('', '');
    try {
      const result = await api.resetPassword({
        email: email.trim().toLowerCase(), otp_code: otp, new_password: newPassword
      });
      setMode('login');
      setPassword('');
      setNewPassword('');
      setOtp('');
      showFeedback('success', result.message || 'Password reset successfully.');
    } catch (error) {
      showFeedback('error', error.message || 'Password reset failed.');
    } finally {
      setLoading(false);
    }
  };

  const selectRole = (role) => {
    setActiveRole(role);
    setMode('login');
    setPassword('');
    setOtp('');
    showFeedback('', '');
  };

  const title = mode === 'register' ? 'Create your User account'
    : mode === 'responder-setup' ? 'Complete responder setup'
      : mode.startsWith('forgot') ? 'Reset your password'
        : mode === 'register-verify' ? 'Verify your email' : 'Sign in to SheDefender';

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-header">
          <div className="auth-shield-logo"><Shield size={38} /></div>
          <h1 className="auth-title">SheDefender</h1>
          <p className="auth-tagline">“Your Safety. Your Circle. Your Voice.”</p>
          <span className="auth-academic-badge">Secure role-based access</span>
        </div>

        <div className="role-tabs">
          <button type="button" className={`role-tab-btn ${activeRole === 'USER' ? 'active' : ''}`} onClick={() => selectRole('USER')}>
            <ShieldAlert size={18} /><span>USER</span>
          </button>
          <button type="button" className={`role-tab-btn ${activeRole === 'COMMUNITY_RESPONDER' ? 'active' : ''}`} onClick={() => selectRole('COMMUNITY_RESPONDER')}>
            <Users size={18} /><span>RESPONDER</span>
          </button>
          <button type="button" className={`role-tab-btn ${activeRole === 'ADMIN' ? 'active' : ''}`} onClick={() => selectRole('ADMIN')}>
            <LockKeyhole size={18} /><span>ADMIN</span>
          </button>
        </div>

        {activeRole === 'COMMUNITY_RESPONDER' && mode === 'login' && (
          <div className="verification-notice-banner"><Info size={16} /><div><strong>Responder access</strong><p>Only invited responders who have verified their email and received Admin approval can sign in.</p></div></div>
        )}
        {activeRole === 'ADMIN' && mode === 'login' && (
          <div className="verification-notice-banner"><Info size={16} /><div><strong>Administrator access</strong><p>Admin accounts are created through the secure one-time setup process. Public Admin registration is disabled.</p></div></div>
        )}

        <h2 className="auth-form-title">{title}</h2>
        {feedback.message && (
          <div className={`feedback-alert ${feedback.type}`}>
            {feedback.type === 'error' ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}
            <span>{feedback.message}</span>
          </div>
        )}

        {mode === 'login' && (
          <form onSubmit={handleLogin} className="auth-form">
            <div className="form-group"><label>Email address</label><div className="input-with-icon"><Mail size={18} className="input-icon" /><input type="email" required autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" /></div></div>
            <div className="form-group"><label>Password</label><div className="input-with-icon"><Lock size={18} className="input-icon" /><input type="password" required autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Enter your password" /></div></div>
            <button type="submit" className="btn-primary-solid btn-block btn-lg" disabled={loading}>{loading ? 'Signing in...' : <><span>Sign in</span><ArrowRight size={18} /></>}</button>
            <div className="resend-row"><button type="button" className="text-link-btn" onClick={() => resetMode('forgot-request')}>Forgot password?</button></div>
            {activeRole === 'USER' && <div className="resend-row"><span>New to SheDefender?</span><button type="button" className="text-link-btn" onClick={() => resetMode('register')}>Create an account</button></div>}
            {activeRole === 'COMMUNITY_RESPONDER' && <div className="resend-row"><span>Have an Admin invitation?</span><button type="button" className="text-link-btn" onClick={() => resetMode('responder-setup')}>Set up account</button></div>}
          </form>
        )}

        {mode === 'register' && (
          <form onSubmit={handleRegistrationRequest} className="auth-form">
            <div className="form-group"><label>Full name</label><div className="input-with-icon"><UserRound size={18} className="input-icon" /><input required maxLength={120} autoComplete="name" value={name} onChange={e => setName(e.target.value)} placeholder="Enter your full name" /></div></div>
            <div className="form-group"><label>Email address</label><div className="input-with-icon"><Mail size={18} className="input-icon" /><input type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" /></div></div>
            <div className="form-group"><label>Phone number</label><div className="input-with-icon"><Phone size={18} className="input-icon" /><input type="tel" required maxLength={30} value={phone} onChange={e => setPhone(e.target.value)} placeholder="Enter phone number" /></div></div>
            <div className="form-group"><label>Password (minimum 8 characters)</label><div className="input-with-icon"><Lock size={18} className="input-icon" /><input type="password" minLength={8} maxLength={128} required autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Create a password" /></div></div>
            <button type="submit" className="btn-primary-solid btn-block btn-lg" disabled={loading}>{loading ? 'Sending verification code...' : <><span>Verify email to register</span><ArrowRight size={18} /></>}</button>
            <div className="resend-row"><button type="button" className="text-link-btn" onClick={() => resetMode('login')}>Back to login</button></div>
          </form>
        )}

        {mode === 'register-verify' && (
          <form onSubmit={handleRegistrationVerify} className="auth-form">
            <p className="field-hint">Enter the six-digit code sent to <strong>{email}</strong>. You only need to verify your email once.</p>
            <div className="form-group"><label>Email verification code</label><div className="input-with-icon"><KeyRound size={18} className="input-icon" /><input inputMode="numeric" maxLength={6} required value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, ''))} placeholder="••••••" /></div></div>
            <button type="submit" className="btn-primary-solid btn-block btn-lg" disabled={loading}>{loading ? 'Verifying...' : 'Verify and create account'}</button>
            <div className="resend-row"><button type="button" className="text-link-btn" onClick={() => resetMode('register')}>Back</button><button type="button" className="text-link-btn" disabled={loading} onClick={handleRegistrationRequest}>Resend code</button></div>
          </form>
        )}

        {mode === 'responder-setup' && (
          <form onSubmit={handleResponderSetup} className="auth-form">
            <p className="field-hint">Enter the invitation code sent by SheDefender Admin to your registered email, then create your password.</p>
            <div className="form-group"><label>Invited email address</label><div className="input-with-icon"><Mail size={18} className="input-icon" /><input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="invited@example.com" /></div></div>
            <div className="form-group"><label>Six-digit invitation code</label><div className="input-with-icon"><KeyRound size={18} className="input-icon" /><input inputMode="numeric" maxLength={6} required value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, ''))} placeholder="••••••" /></div></div>
            <div className="form-group"><label>Create password (minimum 8 characters)</label><div className="input-with-icon"><Lock size={18} className="input-icon" /><input type="password" minLength={8} maxLength={128} required value={password} onChange={e => setPassword(e.target.value)} placeholder="Create a password" /></div></div>
            <button type="submit" className="btn-primary-solid btn-block btn-lg" disabled={loading}>{loading ? 'Verifying invitation...' : 'Verify email and set password'}</button>
            <div className="resend-row"><button type="button" className="text-link-btn" onClick={() => resetMode('login')}>Back to responder login</button></div>
          </form>
        )}

        {mode === 'forgot-request' && (
          <form onSubmit={handleForgotRequest} className="auth-form">
            <p className="field-hint">We will send a one-time code only when you request a password reset.</p>
            <div className="form-group"><label>Email address</label><div className="input-with-icon"><Mail size={18} className="input-icon" /><input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" /></div></div>
            <button type="submit" className="btn-primary-solid btn-block btn-lg" disabled={loading}>{loading ? 'Requesting code...' : 'Send password reset code'}</button>
            <div className="resend-row"><button type="button" className="text-link-btn" onClick={() => resetMode('login')}>Back to login</button></div>
          </form>
        )}

        {mode === 'forgot-reset' && (
          <form onSubmit={handleForgotReset} className="auth-form">
            <p className="field-hint">Enter the reset code sent to <strong>{email}</strong> and choose a new password.</p>
            <div className="form-group"><label>Six-digit reset code</label><div className="input-with-icon"><KeyRound size={18} className="input-icon" /><input inputMode="numeric" maxLength={6} required value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, ''))} placeholder="••••••" /></div></div>
            <div className="form-group"><label>New password</label><div className="input-with-icon"><Lock size={18} className="input-icon" /><input type="password" minLength={8} maxLength={128} required value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Enter new password" /></div></div>
            <button type="submit" className="btn-primary-solid btn-block btn-lg" disabled={loading}>{loading ? 'Resetting password...' : 'Reset password'}</button>
            <div className="resend-row"><button type="button" className="text-link-btn" disabled={loading} onClick={handleForgotRequest}>Resend code</button><button type="button" className="text-link-btn" onClick={() => resetMode('login')}>Back to login</button></div>
          </form>
        )}

        <p className="field-hint" style={{ textAlign: 'center', marginTop: 16 }}>
          {activeRole === 'ADMIN' ? 'Administrator accounts are provisioned securely by the system owner.' : 'Your password is stored as a secure hash. Email OTP is used only for account verification and password resets.'}
        </p>
      </div>
    </div>
  );
}
