import React, { useState, useEffect } from 'react';
import { User } from '../types';
import { ShieldCheck, MessageSquare, LogOut, Clock, Wifi, Sparkles, Building2 } from 'lucide-react';

interface HeaderProps {
  user: User | null;
  onLogout: () => void;
  activeView: string;
}

export const Header: React.FC<HeaderProps> = ({ user, onLogout, activeView }) => {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const getViewTitle = () => {
    switch (activeView) {
      case 'students':
        return 'Student Directory & Records';
      case 'staff':
        return 'Staff Portal & Operators';
      case 'sms_send':
        return 'SMS Dispatch Terminal';
      case 'result_sms':
        return 'Automated Result Alerts';
      case 'sms_reports':
        return 'SMS Audit & Delivery Reports';
      case 'templates':
        return 'Message Templates Library';
      case 'settings':
        return 'Gateway & API Integration';
      default:
        return 'System Overview';
    }
  };

  return (
    <header id="main-app-header" className="bg-white border-b border-slate-200 text-slate-900 sticky top-0 z-40 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-20">
          
          {/* Institutional Main Heading & Branding Subtitle */}
          <div className="flex flex-col justify-center">
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 uppercase tracking-tight flex items-center gap-2">
              <span className="bg-[#0f172a] text-white px-2 py-0.5 rounded text-xs font-black tracking-widest uppercase">
                VSBEC
              </span>
              <span>VSB ENGINEERING COLLEGE</span>
            </h1>
            <div className="flex items-center space-x-2 mt-0.5">
              <span className="text-blue-600 font-extrabold text-[11px] uppercase tracking-wider">
                Powered by VY NEXTGEN TECHNOLOGY
              </span>
              <span className="text-slate-300">•</span>
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                {getViewTitle()}
              </span>
            </div>
          </div>

          {/* Right Info & CTA Section */}
          <div className="flex items-center space-x-4">
            
            {/* Live Gateway Status Indicator */}
            <div className="hidden md:flex items-center space-x-2 px-3 py-1.5 bg-slate-100 border border-slate-200 text-slate-800 rounded text-xs font-bold uppercase tracking-wide">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <Wifi className="w-3.5 h-3.5 text-slate-600 ml-0.5" />
              <span>Gateway Active</span>
            </div>

            {/* Live Clock */}
            <div className="hidden lg:flex items-center space-x-1.5 text-xs text-slate-600 bg-slate-50 px-3 py-1.5 rounded border border-slate-200 font-mono font-bold">
              <Clock className="w-3.5 h-3.5 text-blue-600" />
              <span>
                {time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            </div>

            {/* User Profile Badge */}
            {user ? (
              <div className="flex items-center space-x-3 pl-3 border-l border-slate-200">
                <div className="flex items-center space-x-2">
                  <div className="w-9 h-9 rounded-sm bg-[#0f172a] text-white flex items-center justify-center font-black text-xs uppercase tracking-wider">
                    {user.userId.substring(0, 2)}
                  </div>
                  <div className="text-left hidden sm:block">
                    <div className="text-xs font-black text-slate-900 uppercase tracking-tight flex items-center gap-1">
                      {user.name}
                      {user.role === 'admin' && (
                        <ShieldCheck className="w-3.5 h-3.5 text-amber-500 inline" title="Superuser Status" />
                      )}
                    </div>
                    <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                      {user.role} ({user.userId})
                    </div>
                  </div>
                </div>

                <button
                  id="header-logout-btn"
                  onClick={onLogout}
                  title="Logout Session"
                  className="p-2 text-slate-400 hover:text-rose-600 hover:bg-slate-100 rounded transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1 text-xs text-amber-700 bg-amber-50 px-3 py-1.5 rounded border border-amber-200 font-bold uppercase tracking-wider">
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                <span>Admin Login</span>
              </div>
            )}

          </div>

        </div>
      </div>
    </header>
  );
};
