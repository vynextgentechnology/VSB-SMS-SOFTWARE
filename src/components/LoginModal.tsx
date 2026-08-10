import React, { useState } from 'react';
import { api } from '../lib/api';
import { User, UserRole } from '../types';
import { Building2, ShieldCheck, Lock, User as UserIcon, AlertCircle, ArrowRight, UserCheck, GraduationCap } from 'lucide-react';

interface LoginModalProps {
  onLoginSuccess: (user: User) => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({ onLoginSuccess }) => {
  const [loginRole, setLoginRole] = useState<UserRole>('admin');
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRoleSelect = (role: UserRole) => {
    setLoginRole(role);
    setError(null);
    setUserId('');
    setPassword('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

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

  return (
    <div id="login-modal-overlay" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-md p-4">
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-sm shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header with Institutional Branding */}
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

        {/* Portal Role Tabs */}
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

        {/* Clean Manual Username & Password Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
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
        </form>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 text-center text-slate-500 text-[11px] font-extrabold uppercase tracking-wider">
          VSB ENGINEERING COLLEGE • Powered by <strong className="text-slate-900">VY NEXTGEN TECHNOLOGY</strong>
        </div>

      </div>
    </div>
  );
};
