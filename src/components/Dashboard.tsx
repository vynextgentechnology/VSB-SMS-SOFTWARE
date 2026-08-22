import React from 'react';
import { DashboardStats, User } from '../types';
import {
  Users,
  Send,
  AlertTriangle,
  UserCheck,
  PlusCircle,
  FileUp,
  FileText,
  Activity,
  Building2,
  CheckCircle2,
  ArrowUpRight,
  Sparkles,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  CartesianGrid,
} from 'recharts';

interface DashboardProps {
  stats: DashboardStats | null;
  user: User | null;
  onNavigate: (tab: string) => void;
  onRefresh: () => void;
}

export const Dashboard: React.FC<DashboardProps> = ({
  stats,
  user,
  onNavigate,
  onRefresh,
}) => {
  if (!stats) {
    return (
      <div className="p-8 text-center text-slate-500 font-bold uppercase tracking-wider animate-pulse flex flex-col items-center justify-center space-y-3 min-h-[300px]">
        <div className="w-8 h-8 border-3 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
        <span>Loading dashboard...</span>
      </div>
    );
  }

  const {
    totalParentsEnrolled = 0,
    totalStudents,
    totalSmsSent,
    failedSmsCount,
    totalStaff,
    unmatchedRecordsCount = 0,
    departmentBreakdown,
    monthlySmsTrend,
  } = stats;

  return (
    <div id="dashboard-view" className="space-y-8 animate-in fade-in duration-200">
      
      {/* 6 Core Metric Cards with Left Geometric Borders */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        
        {/* Total Parents Enrolled */}
        <div
          onClick={() => onNavigate('students')}
          className="bg-white border-l-4 border-indigo-600 p-5 shadow-sm rounded-sm cursor-pointer hover:shadow-md transition-all group border-y border-r border-slate-200/80"
        >
          <div className="text-[10px] font-black text-slate-400 uppercase mb-1 tracking-widest flex justify-between items-center">
            <span>Parents Enrolled</span>
            <UserCheck className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900">{totalParentsEnrolled}</div>
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-1">
            Registered Parents
          </div>
        </div>

        {/* Total Students */}
        <div
          onClick={() => onNavigate('students')}
          className="bg-white border-l-4 border-blue-500 p-5 shadow-sm rounded-sm cursor-pointer hover:shadow-md transition-all group border-y border-r border-slate-200/80"
        >
          <div className="text-[10px] font-black text-slate-400 uppercase mb-1 tracking-widest flex justify-between items-center">
            <span>Total Students</span>
            <Users className="w-4 h-4 text-blue-500" />
          </div>
          <div className="text-2xl font-bold text-slate-900">{totalStudents}</div>
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-1">
            Student Database
          </div>
        </div>

        {/* Total Staff & HOD */}
        <div
          onClick={() => {
            if (user?.role === 'admin' || user?.role === 'SUPER_ADMIN' || user?.role === 'hod') {
              onNavigate('staff');
            }
          }}
          className="bg-white border-l-4 border-amber-500 p-5 shadow-sm rounded-sm cursor-pointer hover:shadow-md transition-all group border-y border-r border-slate-200/80"
        >
          <div className="text-[10px] font-black text-slate-400 uppercase mb-1 tracking-widest flex justify-between items-center">
            <span>Staff & HOD</span>
            <UserCheck className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-bold text-slate-900">{totalStaff}</div>
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-1">
            Authorized Users
          </div>
        </div>

        {/* SMS Delivered */}
        <div
          onClick={() => {
            if (user?.role === 'admin' || user?.role === 'SUPER_ADMIN') {
              onNavigate('sms_reports');
            } else {
              onNavigate('sms_send');
            }
          }}
          className="bg-white border-l-4 border-emerald-500 p-5 shadow-sm rounded-sm cursor-pointer hover:shadow-md transition-all group border-y border-r border-slate-200/80"
        >
          <div className="text-[10px] font-black text-slate-400 uppercase mb-1 tracking-widest flex justify-between items-center">
            <span>SMS Delivered</span>
            <Send className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-bold text-slate-900">{totalSmsSent}</div>
          <div className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider mt-1 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" />
            <span>Dispatched via Gateway</span>
          </div>
        </div>

        {/* Delivery Failures */}
        <div
          onClick={() => {
            if (user?.role === 'admin' || user?.role === 'SUPER_ADMIN') {
              onNavigate('sms_reports');
            } else {
              onNavigate('sms_send');
            }
          }}
          className="bg-white border-l-4 border-rose-500 p-5 shadow-sm rounded-sm cursor-pointer hover:shadow-md transition-all group border-y border-r border-slate-200/80"
        >
          <div className="text-[10px] font-black text-slate-400 uppercase mb-1 tracking-widest flex justify-between items-center">
            <span>Failed SMS</span>
            <AlertTriangle className="w-4 h-4 text-rose-500" />
          </div>
          <div className="text-2xl font-bold text-rose-600">{failedSmsCount}</div>
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-1">
            Gateway Errors
          </div>
        </div>

        {/* Unmatched Records */}
        <div
          onClick={() => onNavigate('result_sms')}
          className="bg-white border-l-4 border-purple-600 p-5 shadow-sm rounded-sm cursor-pointer hover:shadow-md transition-all group border-y border-r border-slate-200/80"
        >
          <div className="text-[10px] font-black text-slate-400 uppercase mb-1 tracking-widest flex justify-between items-center">
            <span>Unmatched Records</span>
            <AlertTriangle className="w-4 h-4 text-purple-600" />
          </div>
          <div className="text-2xl font-bold text-purple-700">{unmatchedRecordsCount}</div>
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-1">
            Missing Parent Info
          </div>
        </div>

      </div>

      {/* Main Grid: Visual Charts + Action Box */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Column: Analytics */}
        <div className="lg:col-span-8 space-y-8">
          
          {/* SMS Delivery Analytics Chart */}
          <div className="bg-white border border-slate-200 rounded-sm p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">
                  SMS Delivery Analytics
                </h3>
                <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">
                  Daily message dispatch volume
                </p>
              </div>
              <button
                onClick={() => onNavigate('sms_send')}
                className="bg-[#0f172a] text-white px-4 py-2 rounded-sm text-[10px] font-black uppercase tracking-widest hover:bg-blue-600 transition-all"
              >
                + Dispatch SMS
              </button>
            </div>

            <div className="h-64 w-full pt-2">
              {monthlySmsTrend.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={monthlySmsTrend}>
                    <defs>
                      <linearGradient id="colorSent" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#2563eb" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="colorFailed" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#e11d48" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#e11d48" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="date" stroke="#64748b" fontSize={11} />
                    <YAxis stroke="#64748b" fontSize={11} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '4px', color: '#fff' }}
                    />
                    <Area type="monotone" dataKey="sent" stroke="#2563eb" strokeWidth={2} fillOpacity={1} fill="url(#colorSent)" name="Sent" />
                    <Area type="monotone" dataKey="failed" stroke="#e11d48" strokeWidth={2} fillOpacity={1} fill="url(#colorFailed)" name="Failed" />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-slate-400 text-xs font-bold uppercase tracking-wider">
                  No SMS activity logged yet.
                </div>
              )}
            </div>
          </div>

        </div>

        {/* Right Column: CTA Banner & Utilities */}
        <div className="lg:col-span-4 space-y-6">
          
          {/* Navy Dark Card for Attendance & Absent SMS */}
          <div className="bg-[#0f172a] p-6 text-white flex flex-col justify-between rounded-sm shadow-xl space-y-4">
            <div className="flex justify-between items-start">
              <div className="text-xs font-black text-emerald-400 uppercase tracking-widest">
                Attendance & Absent SMS
              </div>
              <div className="w-8 h-8 bg-emerald-500/20 text-emerald-300 rounded flex items-center justify-center font-bold text-xs">
                LIVE
              </div>
            </div>

            <p className="text-xs text-slate-300 font-medium">
              Record daily manual or Excel attendance & auto-dispatch Absent Parent SMS alerts via Fast2SMS gateway.
            </p>

            <button
              onClick={() => onNavigate('attendance')}
              className="w-full bg-emerald-600 py-3 text-[10px] font-black uppercase tracking-widest hover:bg-emerald-500 transition-colors rounded-sm shadow-md flex items-center justify-center space-x-2"
            >
              <span>Take Attendance & Send SMS</span>
              <span>→</span>
            </button>
          </div>

          {/* Navy Dark Card for Exam Result Upload */}
          <div className="bg-[#0f172a] p-6 text-white flex flex-col justify-between h-52 rounded-sm shadow-xl">
            <div className="flex justify-between items-start">
              <div className="text-xs font-black text-blue-400 uppercase tracking-widest">
                Batch Result Upload
              </div>
              <div className="w-8 h-8 bg-white/10 rounded flex items-center justify-center font-bold text-white">
                ↓
              </div>
            </div>

            <p className="text-xs text-slate-300 font-medium">
              Import student marks via Tabular/CSV for automated result SMS alerts.
            </p>

            <button
              onClick={() => onNavigate('result_sms')}
              className="w-full bg-blue-600 py-3 text-[10px] font-black uppercase tracking-widest hover:bg-blue-500 transition-colors rounded-sm shadow-md"
            >
              Start Result Import Process
            </button>
          </div>

          {/* Department Breakdown */}
          <div className="bg-white border border-slate-200 p-6 rounded-sm shadow-sm space-y-4">
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest border-b border-slate-100 pb-3">
              Department Distribution
            </h3>

            <div className="h-48 w-full">
              {departmentBreakdown.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={departmentBreakdown} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis type="number" stroke="#94a3b8" fontSize={10} />
                    <YAxis dataKey="department" type="category" stroke="#64748b" fontSize={10} width={50} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '4px', color: '#fff' }}
                    />
                    <Bar dataKey="studentCount" fill="#2563eb" radius={[0, 2, 2, 0]} name="Students" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-slate-400 text-xs font-bold uppercase">
                  No department metrics
                </div>
              )}
            </div>
          </div>

          {/* System Utilities Box */}
          <div className="bg-white border border-slate-200 p-6 rounded-sm shadow-sm space-y-4">
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">
              System Utilities
            </h3>

            <div className="space-y-3">
              {(user?.role === 'admin' || user?.role === 'SUPER_ADMIN') && (
                <button
                  onClick={() => onNavigate('sms_reports')}
                  className="w-full flex items-center justify-between p-3 border border-slate-100 rounded-sm hover:border-blue-500 hover:bg-blue-50/50 transition-colors text-left"
                >
                  <span className="text-xs font-bold text-slate-800">Download PDF & Excel Reports</span>
                  <span className="text-blue-600 font-bold">→</span>
                </button>
              )}

              <button
                onClick={() => onNavigate('templates')}
                className="w-full flex items-center justify-between p-3 border border-slate-100 rounded-sm hover:border-blue-500 hover:bg-blue-50/50 transition-colors text-left"
              >
                <span className="text-xs font-bold text-slate-800">Manage SMS Templates</span>
                <span className="text-blue-600 font-bold">→</span>
              </button>

              {(user?.role === 'admin' || user?.role === 'SUPER_ADMIN') && (
                <button
                  onClick={() => onNavigate('settings')}
                  className="w-full flex items-center justify-between p-3 border border-slate-100 rounded-sm hover:border-blue-500 hover:bg-blue-50/50 transition-colors text-left"
                >
                  <span className="text-xs font-bold text-slate-800">Gateway API Credentials</span>
                  <span className="text-blue-600 font-bold">→</span>
                </button>
              )}
            </div>

            <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
              <div>
                <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">
                  Gateway Status
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                  <div className="text-xs font-bold text-slate-900 uppercase">Operational</div>
                </div>
              </div>

              <Building2 className="w-6 h-6 text-slate-300" />
            </div>
          </div>

        </div>

      </div>

    </div>
  );
};
