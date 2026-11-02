import React, { useState } from 'react';
import { DashboardStats, User, ACADEMIC_YEARS, AcademicYear } from '../types';
import {
  Users,
  Send,
  AlertTriangle,
  UserCheck,
  Building2,
  CheckCircle2,
  GraduationCap,
  Sparkles,
  ShieldCheck,
  Clock,
  Layers,
  Calendar,
  Filter,
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
  onNavigate: (tab: string, filterOptions?: { academicYear?: string; department?: string }) => void;
  onRefresh: () => void;
}

export const Dashboard: React.FC<DashboardProps> = ({
  stats,
  user,
  onNavigate,
  onRefresh,
}) => {
  const [selectedYearFilter, setSelectedYearFilter] = useState<string>('ALL');

  if (!stats) {
    return (
      <div className="p-12 text-center text-slate-500 font-bold uppercase tracking-wider animate-pulse flex flex-col items-center justify-center space-y-3 min-h-[350px]">
        <div className="w-10 h-10 border-4 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
        <span className="text-sm font-black tracking-widest text-slate-700">VSB ENGINEERING COLLEGE</span>
        <span className="text-xs text-slate-400">Loading live operational metrics...</span>
      </div>
    );
  }

  const {
    totalStudents = 0,
    totalStaff = 0,
    totalDepartments = 10,
    totalSmsSent = 0,
    successfulSmsCount = 0,
    failedSmsCount = 0,
    yearBreakdown = {
      '1st Year': 0,
      '2nd Year': 0,
      '3rd Year': 0,
      '4th Year': 0,
      'Graduated': 0,
    },
    staffAssignedScope,
    departmentBreakdown = [],
    monthlySmsTrend = [],
  } = stats;

  const isStaff = user?.role === 'staff';
  const isAdmin = user?.role === 'admin' || user?.role === 'SUPER_ADMIN';

  // Format department data for bar chart based on selected year
  const chartData = departmentBreakdown.map((d) => {
    let count = d.studentCount;
    if (selectedYearFilter !== 'ALL' && d.yearCounts) {
      count = d.yearCounts[selectedYearFilter] || 0;
    }
    return {
      department: d.department,
      studentCount: count,
      smsSentCount: d.smsSentCount,
    };
  });

  return (
    <div id="dashboard-view" className="space-y-6 animate-in fade-in duration-200">
      
      {/* Institutional Top Header Banner */}
      <div className="bg-gradient-to-r from-[#0f172a] via-[#1e293b] to-[#0f172a] border border-slate-800 rounded-lg p-6 text-white shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2 mb-1.5">
            <span className="px-2 py-0.5 rounded text-[10px] font-black tracking-widest uppercase bg-amber-500/20 text-amber-400 border border-amber-500/30">
              NAAC A++ ACCREDITED INSTITUTION
            </span>
            <span className="px-2 py-0.5 rounded text-[10px] font-black tracking-widest uppercase bg-blue-500/20 text-blue-300 border border-blue-500/30">
              KARUR, TAMIL NADU
            </span>
          </div>
          <h1 className="text-2xl lg:text-3xl font-black tracking-tight text-white flex items-center gap-2">
            <span>VSB ENGINEERING COLLEGE</span>
          </h1>
          <p className="text-xs text-slate-300 font-semibold mt-1 flex items-center gap-1.5">
            <span>Year-Wise, Department-Wise Student Management & SMS Gateway</span>
            <span className="text-slate-500">•</span>
            <span className="text-amber-400 font-bold">Powered by VY NEXTGEN TECHNOLOGY</span>
          </p>
        </div>

        <div className="flex items-center gap-3">
          {isStaff && staffAssignedScope && (
            <div className="bg-blue-950/70 border border-blue-500/40 px-3 py-2 rounded text-left">
              <div className="text-[10px] font-black text-blue-300 uppercase tracking-widest">
                Staff Operator Scope
              </div>
              <div className="text-xs font-bold text-white">
                Years: {staffAssignedScope.years.join(', ')} | Depts: {staffAssignedScope.departments.join(', ')}
              </div>
            </div>
          )}
          <div className="text-right">
            <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
              Live Session
            </div>
            <div className="text-sm font-bold text-white flex items-center justify-end gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span>{user?.name || 'Administrator'}</span>
              <span className="text-xs text-slate-400">({user?.role?.toUpperCase()})</span>
            </div>
          </div>
        </div>
      </div>

      {/* 6 Primary Operational Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        
        {/* Total Students */}
        <div
          onClick={() => onNavigate('students')}
          className="bg-white border-l-4 border-blue-600 p-4 shadow-sm rounded-lg cursor-pointer hover:shadow-md transition-all group border-y border-r border-slate-200"
        >
          <div className="text-[10px] font-black text-slate-400 uppercase mb-1 tracking-widest flex justify-between items-center">
            <span>Total Students</span>
            <Users className="w-4 h-4 text-blue-600 group-hover:scale-110 transition-transform" />
          </div>
          <div className="text-2xl font-black text-slate-900">{totalStudents}</div>
          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mt-1">
            {isStaff ? 'In Your Scope' : 'Active College Roster'}
          </div>
        </div>

        {/* Total Staff */}
        <div
          onClick={() => {
            if (isAdmin) onNavigate('staff');
          }}
          className={`bg-white border-l-4 border-indigo-600 p-4 shadow-sm rounded-lg border-y border-r border-slate-200 transition-all ${
            isAdmin ? 'cursor-pointer hover:shadow-md group' : ''
          }`}
        >
          <div className="text-[10px] font-black text-slate-400 uppercase mb-1 tracking-widest flex justify-between items-center">
            <span>Total Staff</span>
            <UserCheck className="w-4 h-4 text-indigo-600 group-hover:scale-110 transition-transform" />
          </div>
          <div className="text-2xl font-black text-slate-900">{totalStaff}</div>
          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mt-1">
            Faculty Assigned
          </div>
        </div>

        {/* Total Departments */}
        <div
          onClick={() => onNavigate('students')}
          className="bg-white border-l-4 border-amber-500 p-4 shadow-sm rounded-lg cursor-pointer hover:shadow-md transition-all group border-y border-r border-slate-200"
        >
          <div className="text-[10px] font-black text-slate-400 uppercase mb-1 tracking-widest flex justify-between items-center">
            <span>Departments</span>
            <Building2 className="w-4 h-4 text-amber-500 group-hover:scale-110 transition-transform" />
          </div>
          <div className="text-2xl font-black text-slate-900">{totalDepartments}</div>
          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mt-1">
            Engineering Branches
          </div>
        </div>

        {/* Total SMS Sent */}
        <div
          onClick={() => onNavigate('sms_reports')}
          className="bg-white border-l-4 border-slate-700 p-4 shadow-sm rounded-lg cursor-pointer hover:shadow-md transition-all group border-y border-r border-slate-200"
        >
          <div className="text-[10px] font-black text-slate-400 uppercase mb-1 tracking-widest flex justify-between items-center">
            <span>Total SMS Sent</span>
            <Send className="w-4 h-4 text-slate-700 group-hover:scale-110 transition-transform" />
          </div>
          <div className="text-2xl font-black text-slate-900">{totalSmsSent}</div>
          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mt-1">
            Total Dispatched
          </div>
        </div>

        {/* Successful SMS */}
        <div
          onClick={() => onNavigate('sms_reports')}
          className="bg-white border-l-4 border-emerald-500 p-4 shadow-sm rounded-lg cursor-pointer hover:shadow-md transition-all group border-y border-r border-slate-200"
        >
          <div className="text-[10px] font-black text-slate-400 uppercase mb-1 tracking-widest flex justify-between items-center">
            <span>Successful SMS</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-500 group-hover:scale-110 transition-transform" />
          </div>
          <div className="text-2xl font-black text-emerald-600">{successfulSmsCount}</div>
          <div className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider mt-1">
            Delivered to Parents
          </div>
        </div>

        {/* Failed SMS */}
        <div
          onClick={() => onNavigate('sms_reports')}
          className="bg-white border-l-4 border-rose-500 p-4 shadow-sm rounded-lg cursor-pointer hover:shadow-md transition-all group border-y border-r border-slate-200"
        >
          <div className="text-[10px] font-black text-slate-400 uppercase mb-1 tracking-widest flex justify-between items-center">
            <span>Failed SMS</span>
            <AlertTriangle className="w-4 h-4 text-rose-500 group-hover:scale-110 transition-transform" />
          </div>
          <div className="text-2xl font-black text-rose-600">{failedSmsCount}</div>
          <div className="text-[10px] font-bold text-rose-700 uppercase tracking-wider mt-1">
            Undelivered / Bounced
          </div>
        </div>

      </div>

      {/* Year-Wise Student Management Grid */}
      <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-3 border-b border-slate-100 gap-3">
          <div>
            <h2 className="text-base font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <GraduationCap className="w-5 h-5 text-blue-600" />
              <span>Year-Wise Student Distribution</span>
            </h2>
            <p className="text-xs text-slate-500 font-medium">
              Real-time student enrollment categorized across four academic cohorts
            </p>
          </div>

          <button
            onClick={() => onNavigate('students')}
            className="text-xs font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1 uppercase tracking-wider"
          >
            <span>Manage All Students</span>
            <span>→</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          
          {/* 1st Year */}
          <div
            onClick={() => onNavigate('students', { academicYear: '1st Year' })}
            className="border border-slate-200 rounded-lg p-4 hover:border-blue-500 hover:shadow-md transition-all cursor-pointer bg-gradient-to-br from-blue-50/50 to-white group"
          >
            <div className="flex justify-between items-start mb-2">
              <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-blue-100 text-blue-800">
                1st Year Cohort
              </span>
              <Layers className="w-4 h-4 text-blue-500 group-hover:scale-110 transition-transform" />
            </div>
            <div className="text-3xl font-black text-slate-900 mb-1">
              {yearBreakdown['1st Year'] || 0}
            </div>
            <div className="text-xs text-slate-500 font-medium flex justify-between items-center">
              <span>Freshman Enrolled</span>
              <span className="text-blue-600 font-bold group-hover:translate-x-1 transition-transform">View →</span>
            </div>
          </div>

          {/* 2nd Year */}
          <div
            onClick={() => onNavigate('students', { academicYear: '2nd Year' })}
            className="border border-slate-200 rounded-lg p-4 hover:border-emerald-500 hover:shadow-md transition-all cursor-pointer bg-gradient-to-br from-emerald-50/50 to-white group"
          >
            <div className="flex justify-between items-start mb-2">
              <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800">
                2nd Year Cohort
              </span>
              <Layers className="w-4 h-4 text-emerald-500 group-hover:scale-110 transition-transform" />
            </div>
            <div className="text-3xl font-black text-slate-900 mb-1">
              {yearBreakdown['2nd Year'] || 0}
            </div>
            <div className="text-xs text-slate-500 font-medium flex justify-between items-center">
              <span>Sophomore Enrolled</span>
              <span className="text-emerald-600 font-bold group-hover:translate-x-1 transition-transform">View →</span>
            </div>
          </div>

          {/* 3rd Year */}
          <div
            onClick={() => onNavigate('students', { academicYear: '3rd Year' })}
            className="border border-slate-200 rounded-lg p-4 hover:border-purple-500 hover:shadow-md transition-all cursor-pointer bg-gradient-to-br from-purple-50/50 to-white group"
          >
            <div className="flex justify-between items-start mb-2">
              <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-purple-100 text-purple-800">
                3rd Year Cohort
              </span>
              <Layers className="w-4 h-4 text-purple-500 group-hover:scale-110 transition-transform" />
            </div>
            <div className="text-3xl font-black text-slate-900 mb-1">
              {yearBreakdown['3rd Year'] || 0}
            </div>
            <div className="text-xs text-slate-500 font-medium flex justify-between items-center">
              <span>Junior Enrolled</span>
              <span className="text-purple-600 font-bold group-hover:translate-x-1 transition-transform">View →</span>
            </div>
          </div>

          {/* 4th Year */}
          <div
            onClick={() => onNavigate('students', { academicYear: '4th Year' })}
            className="border border-slate-200 rounded-lg p-4 hover:border-amber-500 hover:shadow-md transition-all cursor-pointer bg-gradient-to-br from-amber-50/50 to-white group"
          >
            <div className="flex justify-between items-start mb-2">
              <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-amber-100 text-amber-800">
                4th Year Cohort
              </span>
              <Layers className="w-4 h-4 text-amber-500 group-hover:scale-110 transition-transform" />
            </div>
            <div className="text-3xl font-black text-slate-900 mb-1">
              {yearBreakdown['4th Year'] || 0}
            </div>
            <div className="text-xs text-slate-500 font-medium flex justify-between items-center">
              <span>Senior Enrolled</span>
              <span className="text-amber-600 font-bold group-hover:translate-x-1 transition-transform">View →</span>
            </div>
          </div>

        </div>
      </div>

      {/* Main Grid: Visual Charts + Action Box */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: Analytics */}
        <div className="lg:col-span-8 space-y-6">
          
          {/* Department Breakdown with Year-Filter */}
          <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-slate-100 pb-4 gap-3">
              <div>
                <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">
                  Department-Wise Student Strength
                </h3>
                <p className="text-xs text-slate-500 font-medium">
                  Enrollment volume across engineering branches
                </p>
              </div>

              {/* Year Filter Buttons */}
              <div className="flex flex-wrap items-center gap-1.5">
                {['ALL', '1st Year', '2nd Year', '3rd Year', '4th Year'].map((yr) => (
                  <button
                    key={yr}
                    onClick={() => setSelectedYearFilter(yr)}
                    className={`px-2.5 py-1 text-[11px] font-bold rounded transition-colors ${
                      selectedYearFilter === yr
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {yr}
                  </button>
                ))}
              </div>
            </div>

            <div className="h-64 w-full pt-2">
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="department" stroke="#64748b" fontSize={11} />
                    <YAxis stroke="#64748b" fontSize={11} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '6px', color: '#fff' }}
                    />
                    <Bar dataKey="studentCount" fill="#2563eb" radius={[4, 4, 0, 0]} name="Students" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-slate-400 text-xs font-bold uppercase">
                  No department metrics found
                </div>
              )}
            </div>
          </div>

          {/* SMS Delivery Analytics Chart */}
          <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">
                  SMS Delivery Trend
                </h3>
                <p className="text-xs text-slate-500 font-medium">
                  Live gateway dispatch performance
                </p>
              </div>
              <button
                onClick={() => onNavigate('sms_send')}
                className="bg-[#0f172a] text-white px-3 py-1.5 rounded text-xs font-black uppercase tracking-wider hover:bg-blue-600 transition-all flex items-center gap-1.5"
              >
                <Send className="w-3.5 h-3.5" />
                <span>+ Dispatch SMS</span>
              </button>
            </div>

            <div className="h-60 w-full pt-2">
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

        {/* Right Column: Workflows & Actions */}
        <div className="lg:col-span-4 space-y-6">
          
          {/* Quick Action: Attendance & Absent SMS */}
          <div className="bg-[#0f172a] p-5 text-white flex flex-col justify-between rounded-lg shadow-xl space-y-4 border border-slate-800">
            <div className="flex justify-between items-start">
              <div>
                <div className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">
                  Attendance Module
                </div>
                <h4 className="text-base font-black text-white">Daily Attendance & Absent SMS</h4>
              </div>
              <div className="w-7 h-7 bg-emerald-500/20 text-emerald-300 rounded flex items-center justify-center font-bold text-xs">
                LIVE
              </div>
            </div>

            <p className="text-xs text-slate-300 font-medium">
              Take department/year attendance or upload Excel. Absent student parents are automatically selected for immediate SMS notification.
            </p>

            <button
              onClick={() => onNavigate('attendance')}
              className="w-full bg-emerald-600 py-2.5 text-xs font-black uppercase tracking-wider hover:bg-emerald-500 transition-colors rounded shadow-md flex items-center justify-center space-x-2"
            >
              <span>Take Attendance & Send SMS</span>
              <span>→</span>
            </button>
          </div>

          {/* Quick Action: Exam Results SMS */}
          <div className="bg-[#0f172a] p-5 text-white flex flex-col justify-between rounded-lg shadow-xl space-y-4 border border-slate-800">
            <div className="flex justify-between items-start">
              <div>
                <div className="text-[10px] font-black text-blue-400 uppercase tracking-widest">
                  Academics Module
                </div>
                <h4 className="text-base font-black text-white">Internal & Semester Exam SMS</h4>
              </div>
              <div className="w-7 h-7 bg-blue-500/20 text-blue-300 rounded flex items-center justify-center font-bold text-xs">
                EXAM
              </div>
            </div>

            <p className="text-xs text-slate-300 font-medium">
              Upload marksheets (.xlsx/.xls) with subject marks. Automatic grade calculation and customized marks SMS dispatch to parent mobile numbers.
            </p>

            <button
              onClick={() => onNavigate('result_sms')}
              className="w-full bg-blue-600 py-2.5 text-xs font-black uppercase tracking-wider hover:bg-blue-500 transition-colors rounded shadow-md flex items-center justify-center space-x-2"
            >
              <span>Upload Marks & Dispatch SMS</span>
              <span>→</span>
            </button>
          </div>

          {/* Quick Action: Student Enrollment */}
          <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-sm space-y-3">
            <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider">
              Student Records & Excel Upload
            </h4>
            <p className="text-xs text-slate-500">
              Manage student register numbers, parent mobile numbers, academic year assignments, and download updated rosters.
            </p>
            <button
              onClick={() => onNavigate('students')}
              className="w-full bg-slate-900 text-white py-2.5 rounded text-xs font-black uppercase tracking-wider hover:bg-slate-800 transition-colors flex items-center justify-center gap-1.5"
            >
              <Users className="w-3.5 h-3.5" />
              <span>Open Student Management</span>
            </button>
          </div>

          {/* System Status & Gateway Health */}
          <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  SMS Gateway
                </div>
                <div className="text-xs font-black text-slate-800">Fast2SMS Production API</div>
              </div>
              <div className="flex items-center space-x-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                <span className="text-[11px] font-bold text-emerald-700 uppercase">Operational</span>
              </div>
            </div>
            <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500 font-semibold">
              <span>College Code: 9225</span>
              <span>System: Online</span>
            </div>
          </div>

        </div>

      </div>

    </div>
  );
};
