import React, { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { User, UserRole } from '../types';
import { signInWithGoogle } from '../lib/firebase';
import { Building2, ShieldCheck, Lock, User as UserIcon, AlertCircle, ArrowRight, UserCheck, GraduationCap, UserPlus, Sparkles } from 'lucide-react';

interface LoginModalProps {
  onLoginSuccess: (user: User) => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({ onLoginSuccess }) => {
  const [loginRole, setLoginRole] = useState<UserRole>('admin');
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // First-Time Setup Mode state
  const [isSetupMode, setIsSetupMode] = useState(false);
  const [hasAdmin, setHasAdmin] = useState(true);
  const [setupName, setSetupName] = useState('');
  const [setupUserId, setSetupUserId] = useState('');
  const [setupPassword, setSetupPassword] = useState('');
  const [setupDept, setSetupDept] = useState('General');

  useEffect(() => {
    checkSetupStatus();
  }, []);

  const checkSetupStatus = async () => {
    try {
      const res = await api.getSetupStatus();
      setHasAdmin(res.hasAdmin);
      if (!res.hasAdmin) {
        setIsSetupMode(true);
      }
    } catch (e) {
      // ignore
    }
  };

  const handleRoleSelect = (role: UserRole) => {
    setLoginRole(role);
    setError(null);
    setSuccessMsg(null);
    setUserId('');
    setPassword('');
  };

  const handleSetupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    if (!setupName.trim() || !setupUserId.trim() || !setupPassword.trim()) {
      setError('Please fill in all required fields to create the initial Admin account.');
      return;
    }

    setLoading(true);
    try {
      const res = await api.setupAdmin(setupName, setupUserId, setupPassword, setupDept);
      if (res.user) {
        onLoginSuccess(res.user);
      } else {
        setSuccessMsg('Admin account created! You can now log in.');
        setIsSetupMode(false);
        setHasAdmin(true);
        setUserId(setupUserId);
        setPassword('');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to setup admin account.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    const cleanUserId = userId.trim();
    const cleanPassword = password.trim();

    if (!cleanUserId || !cleanPassword) {
      setError('Please enter both User ID and Password');
      return;
    }

    setLoading(true);
    try {
      const res = await api.login(cleanUserId, cleanPassword, loginRole);
      if (res.user) {
        onLoginSuccess(res.user);
      } else {
        setError('Invalid credentials or wrong role');
      }
    } catch (err: any) {
      setError(err.message || 'Invalid credentials or wrong role');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setLoading(true);
    try {
      const fbUser = await signInWithGoogle();
      if (fbUser) {
        // Construct user session from Firebase Google Account
        const googleUser: User = {
          id: fbUser.uid,
          userId: fbUser.email?.split('@')[0].toUpperCase() || fbUser.uid.slice(0, 8),
          name: fbUser.displayName || fbUser.email || 'Google User',
          role: loginRole,
          department: 'General',
          phoneNumber: fbUser.phoneNumber || '',
          permissions: ['send_sms', 'upload_results', 'manage_students', 'view_reports', 'manage_parents'],
          createdAt: new Date().toISOString(),
        };
        onLoginSuccess(googleUser);
      }
    } catch (err: any) {
      setError(err.message || 'Google Sign-In failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div id="login-modal-overlay" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-md p-4">
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-sm shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header with Branding */}
        <div className="bg-[#0f172a] p-8 text-center text-white relative border-b border-amber-500/30">
          <div className="mx-auto w-14 h-14 bg-gradient-to-br from-amber-400 to-amber-600 rounded-sm flex items-center justify-center mb-3 shadow-lg shadow-amber-500/20">
            <Building2 className="w-7 h-7 text-slate-950" />
          </div>

          <h1 className="text-xl sm:text-2xl font-black text-white uppercase tracking-tight">
            VSB ENGINEERING COLLEGE
          </h1>
          <p className="text-[11px] text-amber-400 font-extrabold uppercase tracking-widest mt-1">
            Powered by VY NEXTGEN TECHNOLOGY
          </p>
        </div>

        {/* Mode Switch or Portal Tabs */}
        {!isSetupMode ? (
          <div className="grid grid-cols-3 bg-slate-100 p-1.5 border-b border-slate-200 gap-1">
            <button
              type="button"
              id="login-tab-admin"
              onClick={() => handleRoleSelect('admin')}
              className={`py-2 px-1.5 text-[11px] font-black uppercase tracking-wider rounded-sm transition-all flex items-center justify-center space-x-1.5 ${
                loginRole === 'admin'
                  ? 'bg-[#0f172a] text-amber-400 shadow-sm border border-amber-500/30'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>Admin</span>
            </button>
            
            <button
              type="button"
              id="login-tab-hod"
              onClick={() => handleRoleSelect('hod')}
              className={`py-2 px-1.5 text-[11px] font-black uppercase tracking-wider rounded-sm transition-all flex items-center justify-center space-x-1.5 ${
                loginRole === 'hod'
                  ? 'bg-[#0f172a] text-amber-400 shadow-sm border border-amber-500/30'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              <GraduationCap className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>HOD Portal</span>
            </button>

            <button
              type="button"
              id="login-tab-staff"
              onClick={() => handleRoleSelect('staff')}
              className={`py-2 px-1.5 text-[11px] font-black uppercase tracking-wider rounded-sm transition-all flex items-center justify-center space-x-1.5 ${
                loginRole === 'staff'
                  ? 'bg-[#0f172a] text-amber-400 shadow-sm border border-amber-500/30'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              <UserCheck className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>Staff Portal</span>
            </button>
          </div>
        ) : (
          <div className="bg-amber-500 text-slate-950 px-4 py-2 text-center text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2">
            <Sparkles className="w-4 h-4" />
            <span>First-Time Setup: Create Initial Admin Account</span>
          </div>
        )}

        {/* First-Time Setup Admin Form */}
        {isSetupMode ? (
          <form onSubmit={handleSetupSubmit} className="p-6 space-y-4">
            <div className="p-3 bg-blue-50 border border-blue-200 text-blue-900 rounded-sm text-xs font-bold leading-relaxed">
              No administrator accounts found. Register the initial system administrator account below.
            </div>

            {error && (
              <div className="p-3.5 rounded-sm bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold flex items-start space-x-2.5">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
                <span>{error}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-black text-slate-800 uppercase tracking-wider mb-1">
                Admin Full Name *
              </label>
              <input
                type="text"
                value={setupName}
                onChange={(e) => setSetupName(e.target.value)}
                placeholder="e.g. System Administrator"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-sm text-slate-900 font-bold text-sm focus:outline-none focus:border-amber-500 focus:bg-white"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-black text-slate-800 uppercase tracking-wider mb-1">
                Admin User ID *
              </label>
              <input
                type="text"
                value={setupUserId}
                onChange={(e) => setSetupUserId(e.target.value)}
                placeholder="e.g. ADMIN_01"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-sm text-slate-900 font-bold text-sm focus:outline-none focus:border-amber-500 focus:bg-white"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-black text-slate-800 uppercase tracking-wider mb-1">
                Password *
              </label>
              <input
                type="password"
                value={setupPassword}
                onChange={(e) => setSetupPassword(e.target.value)}
                placeholder="Create password"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-sm text-slate-900 font-bold text-sm focus:outline-none focus:border-amber-500 focus:bg-white"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 bg-[#0f172a] hover:bg-slate-800 text-amber-400 font-black uppercase tracking-widest rounded-sm text-xs shadow-md disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <UserPlus className="w-4 h-4" />
              <span>{loading ? 'Creating Account...' : 'Register Admin & Continue'}</span>
            </button>

            {hasAdmin && (
              <button
                type="button"
                onClick={() => setIsSetupMode(false)}
                className="w-full text-center text-xs text-slate-600 hover:text-slate-900 font-bold underline uppercase"
              >
                Back to Normal Login
              </button>
            )}
          </form>
        ) : (
          /* Normal Empty Login Form */
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {successMsg && (
              <div className="p-3.5 rounded-sm bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold">
                {successMsg}
              </div>
            )}

            {error && (
              <div className="p-3.5 rounded-sm bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold flex items-start space-x-2.5">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
                <span>{error}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-black text-slate-800 uppercase tracking-wider mb-1.5">
                {loginRole === 'admin' ? 'Admin User ID' : loginRole === 'hod' ? 'HOD User ID' : 'Staff User ID'}
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <UserIcon className="w-4 h-4" />
                </div>
                <input
                  id="login-user-id-input"
                  type="text"
                  value={userId}
                  onChange={(e) => setUserId(e.target.value)}
                  placeholder={
                    loginRole === 'admin'
                      ? 'Enter Admin User ID'
                      : loginRole === 'hod'
                      ? 'Enter HOD User ID'
                      : 'Enter Staff User ID'
                  }
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-300 rounded-sm text-slate-900 font-bold placeholder-slate-400 text-sm focus:outline-none focus:border-amber-500 focus:bg-white transition-all"
                  required
                  autoFocus
                  autoComplete="off"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-black text-slate-800 uppercase tracking-wider mb-1.5">
                Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  id="login-password-input"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter Password"
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-300 rounded-sm text-slate-900 font-bold placeholder-slate-400 text-sm focus:outline-none focus:border-amber-500 focus:bg-white transition-all"
                  required
                  autoComplete="off"
                />
              </div>
            </div>

            <button
              id="login-submit-btn"
              type="submit"
              disabled={loading}
              className="w-full mt-2 py-3 px-4 bg-[#0f172a] hover:bg-slate-800 text-white font-black uppercase tracking-widest rounded-sm transition-all flex items-center justify-center space-x-2 text-xs shadow-md disabled:opacity-50 border border-slate-700"
            >
              {loading ? (
                <span>Authenticating...</span>
              ) : (
                <>
                  <span className="text-amber-400">
                    {loginRole === 'admin'
                      ? 'Sign In as Admin'
                      : loginRole === 'hod'
                      ? 'Sign In as HOD'
                      : 'Sign In as Staff'}
                  </span>
                  <ArrowRight className="w-4 h-4 text-amber-400" />
                </>
              )}
            </button>

            <div className="relative flex py-1 items-center">
              <div className="flex-grow border-t border-slate-200"></div>
              <span className="flex-shrink mx-3 text-[10px] font-black uppercase tracking-wider text-slate-400">Or Continue With</span>
              <div className="flex-grow border-t border-slate-200"></div>
            </div>

            <button
              id="google-signin-btn"
              type="button"
              onClick={handleGoogleSignIn}
              disabled={loading}
              className="w-full py-2.5 px-4 bg-white hover:bg-slate-50 text-slate-800 font-bold border border-slate-300 rounded-sm text-xs shadow-xs transition-all flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
              </svg>
              <span>Sign in with Google (Firebase Auth)</span>
            </button>

            <div className="text-center pt-2">
              <button
                type="button"
                onClick={() => setIsSetupMode(true)}
                className="text-[11px] text-slate-500 hover:text-slate-800 font-bold underline uppercase tracking-wider"
              >
                First-Time Setup: Register Admin Account
              </button>
            </div>
          </form>
        )}

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 text-center text-slate-500 text-[11px] font-extrabold uppercase tracking-wider">
          VSB ENGINEERING COLLEGE • Powered by <strong className="text-slate-900">VY NEXTGEN TECHNOLOGY</strong>
        </div>

      </div>
    </div>
  );
};
