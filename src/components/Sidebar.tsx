import React from 'react';
import { User } from '../types';
import {
  LayoutDashboard,
  Users,
  UserCheck,
  Send,
  FileCheck2,
  FileText,
  FileCode2,
  Settings,
  Building2,
  ShieldCheck,
  Sparkles,
  ClipboardList,
} from 'lucide-react';

interface SidebarProps {
  user: User | null;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  studentCount: number;
  staffCount: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  user,
  activeTab,
  setActiveTab,
  studentCount,
  staffCount,
}) => {
  const role = (user?.role || 'staff').toString().trim().toLowerCase();

  const allMenuItems = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: LayoutDashboard,
      badge: null,
      roles: ['super_admin', 'admin', 'hod', 'staff'],
    },
    {
      id: 'admin_management',
      label: 'User Mgmt & Logs',
      icon: ShieldCheck,
      badge: 'Admin',
      badgeColor: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
      roles: ['super_admin', 'admin'],
    },
    {
      id: 'departments',
      label: 'Department Mgmt',
      icon: Building2,
      badge: null,
      roles: ['super_admin', 'admin'],
    },
    {
      id: 'students',
      label: role === 'staff' ? 'Student Details & Entry' : 'Student Management',
      icon: Users,
      badge: studentCount > 0 ? studentCount : null,
      roles: ['super_admin', 'admin', 'hod', 'staff'],
    },
    {
      id: 'staff',
      label: role === 'hod' ? 'Department Staff' : 'Staff Management',
      icon: UserCheck,
      badge: staffCount > 0 ? staffCount : null,
      roles: ['super_admin', 'admin', 'hod'],
    },
    {
      id: 'sms_send',
      label: 'Assessment & SMS',
      icon: Send,
      badge: 'Send',
      badgeColor: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
      roles: ['super_admin', 'admin', 'hod', 'staff'],
    },
    {
      id: 'result_sms',
      label: 'Result Assessment',
      icon: FileCheck2,
      badge: 'Auto',
      badgeColor: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
      roles: ['super_admin', 'admin', 'hod', 'staff'],
    },
    {
      id: 'sms_reports',
      label: 'Reports & Logs',
      icon: FileText,
      badge: null,
      roles: ['super_admin', 'admin'],
    },
    {
      id: 'templates',
      label: 'Assessment Templates',
      icon: FileCode2,
      badge: null,
      roles: ['super_admin', 'admin', 'hod', 'staff'],
    },
    {
      id: 'settings',
      label: 'Gateway Settings',
      icon: Settings,
      badge: null,
      roles: ['super_admin', 'admin'],
    },
  ];

  const menuItems = allMenuItems.filter((item) =>
    item.roles.some((r) => r === role || (role === 'super_admin' && r === 'admin'))
  );

  return (
    <aside id="main-app-sidebar" className="w-72 bg-[#0f172a] text-slate-300 flex flex-col justify-between shrink-0 min-h-[calc(100vh-5rem)] border-r border-slate-800">
      
      <div>
        {/* Brand Header */}
        <div className="p-6 border-b border-slate-800">
          <div className="text-blue-400 text-xs font-black tracking-widest uppercase mb-1">
            VY NEXTGEN
          </div>
          <div className="text-white text-xl font-bold leading-tight uppercase tracking-tight">
            COLLEGE SMS
          </div>
          {user && (
            <div className="mt-2.5 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[10px]">
              <span className="text-slate-400 font-bold uppercase truncate max-w-[130px]">{user.name}</span>
              <span className={`px-2 py-0.5 font-black uppercase rounded-xs ${
                user.role === 'SUPER_ADMIN'
                  ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                  : user.role === 'admin'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                  : user.role === 'hod'
                  ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                  : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
              }`}>
                {user.role} ({user.department || 'GEN'})
              </span>
            </div>
          )}
        </div>

        {/* Navigation Links */}
        <nav className="p-4 space-y-1.5">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;

            return (
              <button
                key={item.id}
                id={`sidebar-nav-${item.id}`}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-sm font-bold text-xs uppercase tracking-wider transition-all duration-150 ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/30'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                <div className="flex items-center space-x-3">
                  <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                  <span>{item.label}</span>
                </div>

                {item.badge !== null && item.badge !== undefined && (
                  <span
                    className={`px-2 py-0.5 text-[10px] font-black rounded uppercase ${
                      item.badgeColor
                        ? item.badgeColor
                        : isActive
                        ? 'bg-white/20 text-white'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Footer Info */}
      <div className="p-4 border-t border-slate-800 text-[10px] text-slate-500 font-extrabold uppercase tracking-widest text-center">
        SYSTEM VER 3.0 • SECURE ACCESS
      </div>

    </aside>
  );
};
