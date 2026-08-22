import React, { useState, useEffect, useMemo } from 'react';
import {
  User,
  Department,
  AttendanceSession,
  AttendanceRecord,
  AttendanceStatus,
  SmsTemplate,
} from '../types';
import { api, formatErrorMessage } from '../lib/api';
import * as XLSX from 'xlsx';
import {
  Calendar,
  CheckCircle2,
  XCircle,
  UploadCloud,
  FileSpreadsheet,
  Send,
  Users,
  Search,
  Filter,
  Trash2,
  Edit3,
  AlertTriangle,
  Check,
  RotateCcw,
  FileText,
  Download,
  ChevronDown,
  ChevronUp,
  Clock,
  Phone,
  ShieldCheck,
  Eye,
  RefreshCw,
  Plus,
  Sparkles,
  ArrowRight,
  Info,
} from 'lucide-react';

interface AttendanceManagementProps {
  currentUser: User | null;
  departments: Department[];
  templates?: SmsTemplate[];
  onRefresh?: () => void;
  onNavigateToReports?: () => void;
}

export const AttendanceManagement: React.FC<AttendanceManagementProps> = ({
  currentUser,
  departments,
  templates = [],
  onRefresh,
  onNavigateToReports,
}) => {
  const role = (currentUser?.role || 'staff').toString().trim().toLowerCase();
  const userDept = currentUser?.department || '';
  const isHod = role === 'hod';
  const isStaff = role === 'staff';
  const isAdmin = role === 'admin' || role === 'super_admin';

  // Active view tab: 'manual' | 'excel' | 'history'
  const [activeTab, setActiveTab] = useState<'manual' | 'excel' | 'history'>('manual');

  // Loading & notification states
  const [loading, setLoading] = useState(false);
  const [fetchingSessions, setFetchingSessions] = useState(false);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // Manual Attendance Form State
  const defaultDept = (isHod || isStaff) && userDept && userDept !== 'ALL' ? userDept : (departments[0]?.code || 'CSE');
  const [selectedDept, setSelectedDept] = useState<string>(defaultDept);
  const [attendanceDate, setAttendanceDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [academicGroup, setAcademicGroup] = useState<string>('CSE-A (3rd Year)');
  const [section, setSection] = useState<string>('Section A');
  const [sessionType, setSessionType] = useState<string>('Full Day');

  // Student records for manual entry
  const [manualRecords, setManualRecords] = useState<Array<{
    studentId?: string;
    registerNumber: string;
    studentName: string;
    department: string;
    status: AttendanceStatus;
    parentMobile: string;
    parentName?: string;
    parentMatched: boolean;
  }>>([]);
  const [manualSearchQuery, setManualSearchQuery] = useState('');

  // Excel Upload State
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [excelDept, setExcelDept] = useState<string>(defaultDept);
  const [excelDate, setExcelDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [excelGroup, setExcelGroup] = useState<string>('CSE - Final Year');
  const [excelSection, setExcelSection] = useState<string>('A');
  const [excelSessionType, setExcelSessionType] = useState<string>('Full Day');
  const [excelPreviewRecords, setExcelPreviewRecords] = useState<AttendanceRecord[]>([]);
  const [excelStats, setExcelStats] = useState<{
    totalRows: number;
    presentCount: number;
    absentCount: number;
    parentMatchedCount: number;
    parentMissingCount: number;
  } | null>(null);

  // History State
  const [sessions, setSessions] = useState<AttendanceSession[]>([]);
  const [historyDeptFilter, setHistoryDeptFilter] = useState<string>(isAdmin ? 'ALL' : defaultDept);
  const [historyDateFilter, setHistoryDateFilter] = useState<string>('');
  const [historySearchQuery, setHistorySearchQuery] = useState<string>('');
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);
  const [historyRecordStatusFilter, setHistoryRecordStatusFilter] = useState<'ALL' | 'ABSENT' | 'PRESENT'>('ALL');

  // SMS Dispatch Modal / Action State
  const [smsModalSession, setSmsModalSession] = useState<AttendanceSession | null>(null);
  const [selectedAbsentRegNos, setSelectedAbsentRegNos] = useState<string[]>([]);
  const [customSmsTemplate, setCustomSmsTemplate] = useState<string>(
    'DEAR PARENT,\n\nYour ward {studentName}\nRegister Number: {registerNumber}\n\nwas ABSENT for {academicGroup} on {date}.\n\nPlease take the necessary action.\n\nRegards,\nVSB Engineering College'
  );
  const [forceResend, setForceResend] = useState(false);
  const [sendingSms, setSendingSms] = useState(false);
  const [dispatchResult, setDispatchResult] = useState<{
    totalAbsent: number;
    sentCount: number;
    failedCount: number;
    skippedCount: number;
    logs: any[];
  } | null>(null);

  const showToast = (type: 'success' | 'error' | 'info', text: string) => {
    setToastMessage({ type, text });
    setTimeout(() => setToastMessage(null), 5000);
  };

  // Load sessions on mount or when switching to history
  useEffect(() => {
    loadSessions();
  }, [historyDeptFilter, historyDateFilter]);

  const loadSessions = async () => {
    try {
      setFetchingSessions(true);
      const data = await api.getAttendanceSessions(
        historyDeptFilter !== 'ALL' ? historyDeptFilter : undefined,
        historyDateFilter || undefined
      );
      setSessions(data);
    } catch (err: any) {
      console.error('Failed to load attendance sessions:', err);
      showToast('error', formatErrorMessage(err));
    } finally {
      setFetchingSessions(false);
    }
  };

  // Load enrolled students from MongoDB for Manual Attendance
  const handleLoadEnrolledStudents = async () => {
    try {
      setLoadingStudents(true);
      const enrolled = await api.getEnrolledStudentsForAttendance(selectedDept);
      if (!enrolled || enrolled.length === 0) {
        showToast('info', `No enrolled students found in permanent database for department ${selectedDept}.`);
        setManualRecords([]);
        return;
      }

      const formatted = enrolled.map((s) => ({
        studentId: s.id,
        registerNumber: s.registerNumber,
        studentName: s.name,
        department: s.department || selectedDept,
        status: 'PRESENT' as AttendanceStatus,
        parentMobile: s.parentMobile || '',
        parentName: s.parentName || 'Parent',
        parentMatched: s.parentMatched,
      }));

      setManualRecords(formatted);
      showToast('success', `Loaded ${formatted.length} enrolled students from MongoDB permanent database.`);
    } catch (err: any) {
      showToast('error', formatErrorMessage(err));
    } finally {
      setLoadingStudents(false);
    }
  };

  // Manual marking toggles
  const handleToggleManualStatus = (regNo: string) => {
    setManualRecords((prev) =>
      prev.map((r) =>
        r.registerNumber === regNo
          ? { ...r, status: r.status === 'PRESENT' ? 'ABSENT' : 'PRESENT' }
          : r
      )
    );
  };

  const handleMarkAllManual = (status: AttendanceStatus) => {
    setManualRecords((prev) => prev.map((r) => ({ ...r, status })));
  };

  // Save manual attendance to MongoDB
  const handleSaveManualAttendance = async () => {
    if (manualRecords.length === 0) {
      showToast('error', 'Please load enrolled students before saving attendance.');
      return;
    }

    try {
      setLoading(true);
      const saved = await api.saveAttendanceSession({
        department: selectedDept,
        date: attendanceDate,
        academicGroup,
        section,
        sessionType,
        records: manualRecords,
      });

      showToast(
        'success',
        `Attendance permanently saved to MongoDB! (${saved.presentCount} Present, ${saved.absentCount} Absent)`
      );

      await loadSessions();
      if (onRefresh) onRefresh();

      // If absent students exist, prompt to trigger Absent SMS
      if (saved.absentCount > 0) {
        openSmsModal(saved);
      }
    } catch (err: any) {
      showToast('error', formatErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  // Handle Excel File Selection & Parse
  const handleExcelFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setExcelFile(file);

    try {
      setLoading(true);
      const result = await api.uploadAttendanceExcel(file);
      setExcelPreviewRecords(result.records);
      setExcelStats({
        totalRows: result.totalRows,
        presentCount: result.presentCount,
        absentCount: result.absentCount,
        parentMatchedCount: result.parentMatchedCount,
        parentMissingCount: result.parentMissingCount,
      });

      // Auto detect dept if all records share one
      const depts = Array.from(new Set(result.records.map((r) => r.department).filter(Boolean)));
      if (depts.length === 1 && depts[0]) {
        setExcelDept(depts[0]);
      }

      showToast(
        'success',
        `Parsed ${result.totalRows} student rows (${result.presentCount} Present, ${result.absentCount} Absent, ${result.parentMatchedCount} Parent Mobiles matched).`
      );
    } catch (err: any) {
      showToast('error', formatErrorMessage(err));
      setExcelPreviewRecords([]);
      setExcelStats(null);
    } finally {
      setLoading(false);
    }
  };

  // Toggle status in Excel preview
  const handleToggleExcelStatus = (regNo: string) => {
    setExcelPreviewRecords((prev) => {
      const updated = prev.map((r) =>
        r.registerNumber === regNo
          ? { ...r, status: (r.status === 'PRESENT' ? 'ABSENT' : 'PRESENT') as AttendanceStatus }
          : r
      );
      // recalculate stats
      const pCount = updated.filter((r) => r.status === 'PRESENT').length;
      const aCount = updated.filter((r) => r.status === 'ABSENT').length;
      setExcelStats((prevStats) =>
        prevStats
          ? { ...prevStats, presentCount: pCount, absentCount: aCount }
          : null
      );
      return updated;
    });
  };

  // Save Excel Attendance to MongoDB
  const handleSaveExcelAttendance = async () => {
    if (excelPreviewRecords.length === 0) {
      showToast('error', 'No parsed attendance records to save.');
      return;
    }

    try {
      setLoading(true);
      const saved = await api.saveAttendanceSession({
        department: excelDept,
        date: excelDate,
        academicGroup: excelGroup,
        section: excelSection,
        sessionType: excelSessionType,
        records: excelPreviewRecords,
      });

      showToast(
        'success',
        `Excel Attendance permanently saved to MongoDB! (${saved.presentCount} Present, ${saved.absentCount} Absent)`
      );

      setExcelFile(null);
      setExcelPreviewRecords([]);
      setExcelStats(null);
      await loadSessions();
      if (onRefresh) onRefresh();

      if (saved.absentCount > 0) {
        openSmsModal(saved);
      }
    } catch (err: any) {
      showToast('error', formatErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  // Delete attendance session
  const handleDeleteSession = async (sessionId: string) => {
    if (!window.confirm('Are you sure you want to permanently delete this attendance session and its records from MongoDB?')) {
      return;
    }

    try {
      setLoading(true);
      await api.deleteAttendanceSession(sessionId);
      showToast('success', 'Attendance record permanently deleted.');
      await loadSessions();
      if (onRefresh) onRefresh();
    } catch (err: any) {
      showToast('error', formatErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  // Open SMS modal for absent students
  const openSmsModal = (session: AttendanceSession) => {
    setSmsModalSession(session);
    const absentRegs = session.records
      .filter((r) => r.status === 'ABSENT')
      .map((r) => r.registerNumber);
    setSelectedAbsentRegNos(absentRegs);
    setDispatchResult(null);
  };

  // Send Absent SMS
  const handleSendAbsentSms = async () => {
    if (!smsModalSession) return;
    if (selectedAbsentRegNos.length === 0) {
      showToast('error', 'Please select at least one absent student to send SMS.');
      return;
    }

    try {
      setSendingSms(true);
      const res = await api.sendAbsentParentSms(
        smsModalSession.id,
        selectedAbsentRegNos,
        customSmsTemplate,
        forceResend
      );

      setDispatchResult(res);
      showToast(
        'success',
        `SMS Dispatch Completed: ${res.sentCount} Sent, ${res.failedCount} Failed, ${res.skippedCount} Skipped.`
      );

      // Update sessions list with latest SMS status
      if (res.session) {
        setSessions((prev) =>
          prev.map((s) => (s.id === res.session.id ? res.session : s))
        );
        setSmsModalSession(res.session);
      }
      if (onRefresh) onRefresh();
    } catch (err: any) {
      showToast('error', formatErrorMessage(err));
    } finally {
      setSendingSms(false);
    }
  };

  // Download Sample Excel Template
  const handleDownloadSampleExcel = () => {
    const sampleData = [
      { 'Register Number': '927621BCSE001', 'Student Name': 'Aakash K', 'Attendance Status': 'PRESENT', 'Department': 'CSE' },
      { 'Register Number': '927621BCSE002', 'Student Name': 'Ananya R', 'Attendance Status': 'ABSENT', 'Department': 'CSE' },
      { 'Register Number': '927621BCSE003', 'Student Name': 'Bharath V', 'Attendance Status': 'PRESENT', 'Department': 'CSE' },
      { 'Register Number': '927621BCSE004', 'Student Name': 'Divya S', 'Attendance Status': 'ABSENT', 'Department': 'CSE' },
      { 'Register Number': '927621BCSE005', 'Student Name': 'Gokul M', 'Attendance Status': 'PRESENT', 'Department': 'CSE' },
    ];

    const ws = XLSX.utils.json_to_sheet(sampleData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Attendance');
    XLSX.writeFile(wb, 'VSBEC_Attendance_Template.xlsx');
  };

  // Export session attendance to Excel
  const handleExportSessionToExcel = (session: AttendanceSession) => {
    const exportData = session.records.map((r, idx) => ({
      'S.No': idx + 1,
      'Register Number': r.registerNumber,
      'Student Name': r.studentName,
      'Department': r.department,
      'Attendance Status': r.status,
      'Parent Mobile': r.parentMobile || 'Not Available',
      'Parent Enrolled': r.parentMatched ? 'YES' : 'NO',
      'SMS Sent': r.smsSent ? 'YES' : 'NO',
      'SMS Status': r.smsStatus || 'N/A',
      'SMS Sent At': r.smsSentAt ? new Date(r.smsSentAt).toLocaleString() : 'N/A',
      'Error Message': r.smsErrorMessage || '',
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Attendance_Export');
    XLSX.writeFile(
      wb,
      `Attendance_${session.department}_${session.academicGroup.replace(/[^a-zA-Z0-9]/g, '_')}_${session.date}.xlsx`
    );
  };

  // Manual list filtering
  const filteredManualRecords = useMemo(() => {
    if (!manualSearchQuery.trim()) return manualRecords;
    const q = manualSearchQuery.trim().toLowerCase();
    return manualRecords.filter(
      (r) =>
        r.registerNumber.toLowerCase().includes(q) ||
        r.studentName.toLowerCase().includes(q)
    );
  }, [manualRecords, manualSearchQuery]);

  const manualPresentCount = manualRecords.filter((r) => r.status === 'PRESENT').length;
  const manualAbsentCount = manualRecords.filter((r) => r.status === 'ABSENT').length;
  const manualMatchedCount = manualRecords.filter((r) => r.parentMatched).length;

  // History list filtering
  const filteredSessions = useMemo(() => {
    return sessions.filter((s) => {
      if (historySearchQuery.trim()) {
        const q = historySearchQuery.trim().toLowerCase();
        const matchTitle = (s.title || '').toLowerCase().includes(q);
        const matchGroup = s.academicGroup.toLowerCase().includes(q);
        const matchDept = s.department.toLowerCase().includes(q);
        const matchStudent = s.records.some(
          (r) =>
            r.registerNumber.toLowerCase().includes(q) ||
            r.studentName.toLowerCase().includes(q)
        );
        if (!matchTitle && !matchGroup && !matchDept && !matchStudent) return false;
      }
      return true;
    });
  }, [sessions, historySearchQuery]);

  return (
    <div id="attendance-module-container" className="space-y-6">
      {/* Toast Notification */}
      {toastMessage && (
        <div
          id="attendance-toast-alert"
          className={`p-4 rounded-md flex items-center justify-between text-sm font-semibold shadow-lg transition-all animate-fade-in ${
            toastMessage.type === 'success'
              ? 'bg-emerald-950/90 text-emerald-200 border border-emerald-500/30'
              : toastMessage.type === 'error'
              ? 'bg-rose-950/90 text-rose-200 border border-rose-500/30'
              : 'bg-blue-950/90 text-blue-200 border border-blue-500/30'
          }`}
        >
          <div className="flex items-center space-x-3">
            {toastMessage.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            ) : toastMessage.type === 'error' ? (
              <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
            ) : (
              <Info className="w-5 h-5 text-blue-400 shrink-0" />
            )}
            <span>{toastMessage.text}</span>
          </div>
          <button
            onClick={() => setToastMessage(null)}
            className="text-slate-400 hover:text-white text-xs uppercase font-bold ml-4"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Header Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-blue-600/10 border border-blue-500/20 rounded-md text-blue-400">
              <Calendar className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-black uppercase text-white tracking-wider flex items-center gap-2">
                Attendance & Absent Parent SMS
                <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-extrabold">
                  MongoDB Permanent
                </span>
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">
                Record manual or Excel attendance, match permanent enrolled parent contacts, and dispatch Absent SMS via Fast2SMS.
              </p>
            </div>
          </div>
        </div>

        {/* Tab Controls */}
        <div className="flex items-center bg-slate-950 border border-slate-800 rounded-md p-1">
          <button
            id="tab-btn-manual-attendance"
            onClick={() => setActiveTab('manual')}
            className={`px-4 py-2 text-xs font-bold uppercase rounded-sm flex items-center space-x-2 transition-all ${
              activeTab === 'manual'
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Manual Entry</span>
          </button>

          <button
            id="tab-btn-excel-attendance"
            onClick={() => setActiveTab('excel')}
            className={`px-4 py-2 text-xs font-bold uppercase rounded-sm flex items-center space-x-2 transition-all ${
              activeTab === 'excel'
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
            }`}
          >
            <UploadCloud className="w-3.5 h-3.5" />
            <span>Excel Upload</span>
          </button>

          <button
            id="tab-btn-history-attendance"
            onClick={() => {
              setActiveTab('history');
              loadSessions();
            }}
            className={`px-4 py-2 text-xs font-bold uppercase rounded-sm flex items-center space-x-2 transition-all ${
              activeTab === 'history'
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Attendance History ({sessions.length})</span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 1. MANUAL ATTENDANCE TAB */}
      {/* ========================================================================= */}
      {activeTab === 'manual' && (
        <div className="space-y-6">
          {/* Configuration Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-5">
            <h2 className="text-sm font-bold uppercase text-slate-200 tracking-wider mb-4 flex items-center gap-2">
              <Filter className="w-4 h-4 text-blue-400" />
              1. Attendance Parameters
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              {/* Department */}
              <div>
                <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1">
                  Department
                </label>
                <select
                  id="manual-dept-select"
                  value={selectedDept}
                  onChange={(e) => setSelectedDept(e.target.value)}
                  disabled={(isHod || isStaff) && userDept && userDept !== 'ALL'}
                  className="w-full bg-slate-950 border border-slate-700 text-white text-xs font-semibold rounded px-3 py-2.5 focus:border-blue-500 focus:outline-none disabled:opacity-60"
                >
                  {departments.map((d) => (
                    <option key={d.id || d.code} value={d.code}>
                      {d.code} - {d.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Date */}
              <div>
                <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1">
                  Attendance Date
                </label>
                <input
                  id="manual-date-input"
                  type="date"
                  value={attendanceDate}
                  onChange={(e) => setAttendanceDate(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 text-white text-xs font-semibold rounded px-3 py-2 focus:border-blue-500 focus:outline-none"
                />
              </div>

              {/* Academic Group / Class */}
              <div>
                <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1">
                  Class / Subject / Section
                </label>
                <input
                  id="manual-group-input"
                  type="text"
                  placeholder="e.g. CSE-A (3rd Year) or Data Structures"
                  value={academicGroup}
                  onChange={(e) => setAcademicGroup(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 text-white text-xs font-semibold rounded px-3 py-2 focus:border-blue-500 focus:outline-none"
                />
              </div>

              {/* Session Type */}
              <div>
                <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1">
                  Session Type
                </label>
                <select
                  id="manual-session-type-select"
                  value={sessionType}
                  onChange={(e) => setSessionType(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 text-white text-xs font-semibold rounded px-3 py-2.5 focus:border-blue-500 focus:outline-none"
                >
                  <option value="Full Day">Full Day</option>
                  <option value="FN Session">FN (Forenoon)</option>
                  <option value="AN Session">AN (Afternoon)</option>
                  <option value="Lecture">Lecture Period</option>
                  <option value="Lab">Practical / Lab</option>
                  <option value="Assessment">Internal Assessment</option>
                </select>
              </div>

              {/* Load Button */}
              <div className="flex items-end">
                <button
                  id="btn-load-enrolled-students"
                  onClick={handleLoadEnrolledStudents}
                  disabled={loadingStudents}
                  className="w-full bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold uppercase py-2.5 px-4 rounded flex items-center justify-center space-x-2 transition-all shadow-md disabled:opacity-50"
                >
                  {loadingStudents ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Users className="w-4 h-4" />
                  )}
                  <span>{loadingStudents ? 'Loading DB...' : 'Load Enrolled Students'}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Student Marking List */}
          {manualRecords.length > 0 ? (
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 space-y-4">
              {/* Summary Stats & Bulk Actions */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="px-3 py-1.5 bg-slate-950 border border-slate-800 rounded text-xs">
                    <span className="text-slate-400 font-bold uppercase">Total Students:</span>{' '}
                    <span className="text-white font-black">{manualRecords.length}</span>
                  </div>
                  <div className="px-3 py-1.5 bg-emerald-950/60 border border-emerald-500/30 rounded text-xs">
                    <span className="text-emerald-400 font-bold uppercase">Present:</span>{' '}
                    <span className="text-emerald-300 font-black">
                      {manualPresentCount} ({manualRecords.length ? Math.round((manualPresentCount / manualRecords.length) * 100) : 0}%)
                    </span>
                  </div>
                  <div className="px-3 py-1.5 bg-rose-950/60 border border-rose-500/30 rounded text-xs">
                    <span className="text-rose-400 font-bold uppercase">Absent:</span>{' '}
                    <span className="text-rose-300 font-black">{manualAbsentCount}</span>
                  </div>
                  <div className="px-3 py-1.5 bg-blue-950/60 border border-blue-500/30 rounded text-xs">
                    <span className="text-blue-400 font-bold uppercase">Parent Mobile Matched:</span>{' '}
                    <span className="text-blue-300 font-black">{manualMatchedCount} / {manualRecords.length}</span>
                  </div>
                </div>

                {/* Quick Marking Buttons */}
                <div className="flex items-center space-x-2">
                  <button
                    id="btn-mark-all-present"
                    onClick={() => handleMarkAllManual('PRESENT')}
                    className="px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600 text-emerald-300 hover:text-white border border-emerald-500/30 text-xs font-bold uppercase rounded transition-all flex items-center space-x-1.5"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Mark All Present</span>
                  </button>

                  <button
                    id="btn-mark-all-absent"
                    onClick={() => handleMarkAllManual('ABSENT')}
                    className="px-3 py-1.5 bg-rose-600/20 hover:bg-rose-600 text-rose-300 hover:text-white border border-rose-500/30 text-xs font-bold uppercase rounded transition-all flex items-center space-x-1.5"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    <span>Mark All Absent</span>
                  </button>
                </div>
              </div>

              {/* Search filter */}
              <div className="relative">
                <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Filter students by register number or name..."
                  value={manualSearchQuery}
                  onChange={(e) => setManualSearchQuery(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 text-white text-xs pl-9 pr-4 py-2 rounded focus:border-blue-500 focus:outline-none"
                />
              </div>

              {/* Student Table */}
              <div className="overflow-x-auto border border-slate-800 rounded-md">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950 text-slate-400 font-bold uppercase text-[10px] tracking-wider border-b border-slate-800">
                    <tr>
                      <th className="px-4 py-3">S.No</th>
                      <th className="px-4 py-3">Register Number</th>
                      <th className="px-4 py-3">Student Name</th>
                      <th className="px-4 py-3">Department</th>
                      <th className="px-4 py-3">Parent Mobile (Enrollment DB)</th>
                      <th className="px-4 py-3 text-center">Attendance Status</th>
                      <th className="px-4 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-medium">
                    {filteredManualRecords.map((rec, index) => {
                      const isAbsent = rec.status === 'ABSENT';
                      return (
                        <tr
                          key={rec.registerNumber}
                          className={`hover:bg-slate-800/40 transition-colors ${
                            isAbsent ? 'bg-rose-950/20' : ''
                          }`}
                        >
                          <td className="px-4 py-3 text-slate-500">{index + 1}</td>
                          <td className="px-4 py-3 font-mono font-bold text-white tracking-wider">
                            {rec.registerNumber}
                          </td>
                          <td className="px-4 py-3 text-slate-200 font-semibold">{rec.studentName}</td>
                          <td className="px-4 py-3">
                            <span className="px-2 py-0.5 bg-slate-800 text-slate-300 rounded text-[10px] font-bold uppercase">
                              {rec.department}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            {rec.parentMatched ? (
                              <div className="flex items-center space-x-1.5 text-emerald-400">
                                <Phone className="w-3.5 h-3.5" />
                                <span className="font-mono text-xs">{rec.parentMobile}</span>
                                <span className="text-[9px] px-1.5 py-0.2 bg-emerald-500/20 text-emerald-300 rounded font-bold">
                                  Matched
                                </span>
                              </div>
                            ) : (
                              <span className="text-amber-400/80 text-[11px] flex items-center space-x-1">
                                <AlertTriangle className="w-3.5 h-3.5" />
                                <span>Parent Mobile Not Found</span>
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span
                              className={`inline-block px-3 py-1 text-[11px] font-black uppercase rounded-full tracking-wider ${
                                isAbsent
                                  ? 'bg-rose-600 text-white shadow-sm shadow-rose-900/50'
                                  : 'bg-emerald-600 text-white shadow-sm shadow-emerald-900/50'
                              }`}
                            >
                              {rec.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              id={`toggle-status-${rec.registerNumber}`}
                              onClick={() => handleToggleManualStatus(rec.registerNumber)}
                              className={`px-3 py-1 text-[11px] font-bold uppercase rounded border transition-all ${
                                isAbsent
                                  ? 'bg-emerald-900/30 text-emerald-300 hover:bg-emerald-600 hover:text-white border-emerald-500/30'
                                  : 'bg-rose-900/30 text-rose-300 hover:bg-rose-600 hover:text-white border-rose-500/30'
                              }`}
                            >
                              Mark as {isAbsent ? 'PRESENT' : 'ABSENT'}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Bottom Action Footer */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-4 border-t border-slate-800">
                <div className="text-xs text-slate-400">
                  Total of <span className="text-white font-bold">{manualRecords.length}</span> students ready to be saved permanently in MongoDB.
                </div>

                <div className="flex items-center space-x-3">
                  <button
                    id="btn-reset-manual-records"
                    onClick={() => {
                      if (window.confirm('Reset all marked attendance?')) {
                        handleMarkAllManual('PRESENT');
                      }
                    }}
                    className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold uppercase rounded transition-all"
                  >
                    Reset All
                  </button>

                  <button
                    id="btn-save-manual-attendance"
                    onClick={handleSaveManualAttendance}
                    disabled={loading}
                    className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-black uppercase rounded shadow-lg shadow-blue-900/40 flex items-center space-x-2 transition-all disabled:opacity-50"
                  >
                    {loading ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <Check className="w-4 h-4" />
                    )}
                    <span>{loading ? 'Saving to MongoDB...' : 'Save Attendance to MongoDB'}</span>
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-slate-900/50 border border-dashed border-slate-800 rounded-lg p-12 text-center">
              <Users className="w-12 h-12 text-slate-600 mx-auto mb-3" />
              <h3 className="text-sm font-bold uppercase text-slate-300">No Enrolled Students Loaded Yet</h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto mt-1 mb-5">
                Select your Department and parameters above, then click <strong>"Load Enrolled Students"</strong> to pull enrolled students directly from the permanent MongoDB database.
              </p>
              <button
                onClick={handleLoadEnrolledStudents}
                disabled={loadingStudents}
                className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold uppercase px-5 py-2.5 rounded transition-all shadow-md inline-flex items-center space-x-2"
              >
                <Users className="w-4 h-4" />
                <span>Load Enrolled Students</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. EXCEL ATTENDANCE UPLOAD TAB */}
      {/* ========================================================================= */}
      {activeTab === 'excel' && (
        <div className="space-y-6">
          {/* Upload Configuration & Drag/Drop Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold uppercase text-slate-200 tracking-wider flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                Upload Spreadsheet (.xlsx / .xls)
              </h2>

              <button
                id="btn-download-sample-excel"
                onClick={handleDownloadSampleExcel}
                className="text-blue-400 hover:text-blue-300 text-xs font-bold uppercase flex items-center space-x-1.5 bg-blue-950/40 border border-blue-500/20 px-3 py-1.5 rounded transition-all"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download Sample Excel</span>
              </button>
            </div>

            {/* Attendance Session Details */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1">
                  Department
                </label>
                <select
                  id="excel-dept-select"
                  value={excelDept}
                  onChange={(e) => setExcelDept(e.target.value)}
                  disabled={(isHod || isStaff) && userDept && userDept !== 'ALL'}
                  className="w-full bg-slate-950 border border-slate-700 text-white text-xs font-semibold rounded px-3 py-2.5 focus:border-blue-500 focus:outline-none disabled:opacity-60"
                >
                  {departments.map((d) => (
                    <option key={d.id || d.code} value={d.code}>
                      {d.code} - {d.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1">
                  Attendance Date
                </label>
                <input
                  id="excel-date-input"
                  type="date"
                  value={excelDate}
                  onChange={(e) => setExcelDate(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 text-white text-xs font-semibold rounded px-3 py-2 focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1">
                  Class / Academic Group
                </label>
                <input
                  id="excel-group-input"
                  type="text"
                  placeholder="e.g. CSE-B (2nd Year)"
                  value={excelGroup}
                  onChange={(e) => setExcelGroup(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 text-white text-xs font-semibold rounded px-3 py-2 focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1">
                  Session Type
                </label>
                <select
                  id="excel-session-type-select"
                  value={excelSessionType}
                  onChange={(e) => setExcelSessionType(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 text-white text-xs font-semibold rounded px-3 py-2.5 focus:border-blue-500 focus:outline-none"
                >
                  <option value="Full Day">Full Day</option>
                  <option value="FN Session">FN (Forenoon)</option>
                  <option value="AN Session">AN (Afternoon)</option>
                  <option value="Lecture">Lecture Period</option>
                  <option value="Lab">Practical / Lab</option>
                  <option value="Assessment">Internal Assessment</option>
                </select>
              </div>
            </div>

            {/* Drag and Drop Zone */}
            <div className="border-2 border-dashed border-slate-700 hover:border-blue-500 rounded-lg p-8 text-center bg-slate-950/50 transition-all">
              <input
                id="excel-file-upload-input"
                type="file"
                accept=".xlsx, .xls, .csv"
                onChange={handleExcelFileChange}
                className="hidden"
              />
              <label htmlFor="excel-file-upload-input" className="cursor-pointer block">
                <UploadCloud className="w-12 h-12 text-blue-400 mx-auto mb-3" />
                <span className="text-sm font-bold uppercase text-white block">
                  {excelFile ? excelFile.name : 'Click to Browse or Drag & Drop Excel File'}
                </span>
                <span className="text-xs text-slate-500 block mt-1">
                  Required columns: <strong>Register Number</strong>, <strong>Attendance Status</strong> (PRESENT/ABSENT). Student names & Parent phones are auto-resolved from MongoDB!
                </span>
              </label>
            </div>
          </div>

          {/* Excel Preview Table */}
          {excelPreviewRecords.length > 0 && excelStats && (
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="px-3 py-1.5 bg-slate-950 border border-slate-800 rounded text-xs">
                    <span className="text-slate-400 font-bold uppercase">Total Parsed:</span>{' '}
                    <span className="text-white font-black">{excelStats.totalRows}</span>
                  </div>
                  <div className="px-3 py-1.5 bg-emerald-950/60 border border-emerald-500/30 rounded text-xs">
                    <span className="text-emerald-400 font-bold uppercase">Present:</span>{' '}
                    <span className="text-emerald-300 font-black">{excelStats.presentCount}</span>
                  </div>
                  <div className="px-3 py-1.5 bg-rose-950/60 border border-rose-500/30 rounded text-xs">
                    <span className="text-rose-400 font-bold uppercase">Absent:</span>{' '}
                    <span className="text-rose-300 font-black">{excelStats.absentCount}</span>
                  </div>
                  <div className="px-3 py-1.5 bg-blue-950/60 border border-blue-500/30 rounded text-xs">
                    <span className="text-blue-400 font-bold uppercase">Parent Matched:</span>{' '}
                    <span className="text-blue-300 font-black">{excelStats.parentMatchedCount} / {excelStats.totalRows}</span>
                  </div>
                </div>

                <div className="flex items-center space-x-3">
                  <button
                    id="btn-save-excel-attendance"
                    onClick={handleSaveExcelAttendance}
                    disabled={loading}
                    className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black uppercase rounded shadow-lg shadow-emerald-900/40 flex items-center space-x-2 transition-all disabled:opacity-50"
                  >
                    {loading ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <Check className="w-4 h-4" />
                    )}
                    <span>{loading ? 'Saving...' : 'Save Excel Attendance to MongoDB'}</span>
                  </button>
                </div>
              </div>

              {/* Table */}
              <div className="overflow-x-auto border border-slate-800 rounded-md">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950 text-slate-400 font-bold uppercase text-[10px] tracking-wider border-b border-slate-800">
                    <tr>
                      <th className="px-4 py-3">S.No</th>
                      <th className="px-4 py-3">Register Number</th>
                      <th className="px-4 py-3">Student Name</th>
                      <th className="px-4 py-3">Parent Mobile (Enrollment Match)</th>
                      <th className="px-4 py-3 text-center">Status</th>
                      <th className="px-4 py-3 text-right">Quick Edit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-medium">
                    {excelPreviewRecords.map((rec, index) => {
                      const isAbsent = rec.status === 'ABSENT';
                      return (
                        <tr
                          key={rec.registerNumber}
                          className={`hover:bg-slate-800/40 transition-colors ${
                            isAbsent ? 'bg-rose-950/20' : ''
                          }`}
                        >
                          <td className="px-4 py-3 text-slate-500">{index + 1}</td>
                          <td className="px-4 py-3 font-mono font-bold text-white tracking-wider">
                            {rec.registerNumber}
                          </td>
                          <td className="px-4 py-3 text-slate-200 font-semibold">{rec.studentName}</td>
                          <td className="px-4 py-3">
                            {rec.parentMatched ? (
                              <div className="flex items-center space-x-1.5 text-emerald-400">
                                <Phone className="w-3.5 h-3.5" />
                                <span className="font-mono text-xs">{rec.parentMobile}</span>
                                <span className="text-[9px] px-1.5 py-0.2 bg-emerald-500/20 text-emerald-300 rounded font-bold">
                                  Matched
                                </span>
                              </div>
                            ) : (
                              <span className="text-amber-400/80 text-[11px] flex items-center space-x-1">
                                <AlertTriangle className="w-3.5 h-3.5" />
                                <span>Parent Mobile Not Found</span>
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span
                              className={`inline-block px-3 py-1 text-[11px] font-black uppercase rounded-full tracking-wider ${
                                isAbsent
                                  ? 'bg-rose-600 text-white shadow-sm shadow-rose-900/50'
                                  : 'bg-emerald-600 text-white shadow-sm shadow-emerald-900/50'
                              }`}
                            >
                              {rec.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              onClick={() => handleToggleExcelStatus(rec.registerNumber)}
                              className={`px-3 py-1 text-[11px] font-bold uppercase rounded border transition-all ${
                                isAbsent
                                  ? 'bg-emerald-900/30 text-emerald-300 hover:bg-emerald-600 hover:text-white border-emerald-500/30'
                                  : 'bg-rose-900/30 text-rose-300 hover:bg-rose-600 hover:text-white border-rose-500/30'
                              }`}
                            >
                              Toggle to {isAbsent ? 'PRESENT' : 'ABSENT'}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. ATTENDANCE HISTORY & ABSENT SMS DISPATCH TAB */}
      {/* ========================================================================= */}
      {activeTab === 'history' && (
        <div className="space-y-6">
          {/* History Filters */}
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-4">
              {/* Department Filter */}
              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                  Department
                </label>
                <select
                  id="history-dept-filter-select"
                  value={historyDeptFilter}
                  onChange={(e) => setHistoryDeptFilter(e.target.value)}
                  disabled={(isHod || isStaff) && userDept && userDept !== 'ALL'}
                  className="bg-slate-950 border border-slate-700 text-white text-xs font-semibold rounded px-3 py-2 focus:border-blue-500 focus:outline-none"
                >
                  {isAdmin && <option value="ALL">ALL DEPARTMENTS</option>}
                  {departments.map((d) => (
                    <option key={d.id || d.code} value={d.code}>
                      {d.code} - {d.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Date Filter */}
              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                  Filter by Date
                </label>
                <input
                  id="history-date-filter-input"
                  type="date"
                  value={historyDateFilter}
                  onChange={(e) => setHistoryDateFilter(e.target.value)}
                  className="bg-slate-950 border border-slate-700 text-white text-xs font-semibold rounded px-3 py-1.5 focus:border-blue-500 focus:outline-none"
                />
              </div>

              {historyDateFilter && (
                <button
                  onClick={() => setHistoryDateFilter('')}
                  className="text-xs text-rose-400 hover:text-rose-300 font-bold uppercase mt-4"
                >
                  Clear Date
                </button>
              )}
            </div>

            {/* Search Input */}
            <div className="relative w-full md:w-72">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                id="history-search-input"
                type="text"
                placeholder="Search history by class or student..."
                value={historySearchQuery}
                onChange={(e) => setHistorySearchQuery(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 text-white text-xs pl-9 pr-4 py-2 rounded focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Sessions List */}
          {fetchingSessions ? (
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-12 text-center">
              <RefreshCw className="w-8 h-8 text-blue-400 animate-spin mx-auto mb-3" />
              <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">
                Loading Attendance History from MongoDB...
              </p>
            </div>
          ) : filteredSessions.length === 0 ? (
            <div className="bg-slate-900/50 border border-dashed border-slate-800 rounded-lg p-12 text-center">
              <Clock className="w-12 h-12 text-slate-600 mx-auto mb-3" />
              <h3 className="text-sm font-bold uppercase text-slate-300">No Attendance Records Found</h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto mt-1 mb-4">
                No attendance sessions have been saved yet for the selected filters. Use Manual Entry or Excel Upload to save new records.
              </p>
              <button
                onClick={() => setActiveTab('manual')}
                className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold uppercase px-4 py-2 rounded transition-all"
              >
                Take New Attendance
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredSessions.map((session) => {
                const isExpanded = expandedSessionId === session.id;
                const totalStudents = session.totalStudents || session.records.length;
                const presentCount = session.presentCount || session.records.filter((r) => r.status === 'PRESENT').length;
                const absentCount = session.absentCount || session.records.filter((r) => r.status === 'ABSENT').length;
                const attendancePct = totalStudents ? Math.round((presentCount / totalStudents) * 100) : 0;
                const smsSentCount = session.records.filter((r) => r.smsSent && r.smsStatus === 'Sent').length;

                // Filter records if expanded
                const displayedRecords = session.records.filter((r) => {
                  if (historyRecordStatusFilter === 'ABSENT') return r.status === 'ABSENT';
                  if (historyRecordStatusFilter === 'PRESENT') return r.status === 'PRESENT';
                  return true;
                });

                return (
                  <div
                    key={session.id}
                    className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden transition-all shadow-md"
                  >
                    {/* Session Summary Card */}
                    <div className="p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                      <div className="space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="px-2.5 py-0.5 bg-blue-600/20 text-blue-300 border border-blue-500/30 text-xs font-black uppercase rounded">
                            {session.department}
                          </span>
                          <span className="text-white font-bold text-sm tracking-wide">
                            {session.academicGroup}
                          </span>
                          <span className="px-2 py-0.5 bg-slate-800 text-slate-300 text-[10px] font-bold uppercase rounded">
                            {session.sessionType || 'Full Day'}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400">
                          <div className="flex items-center space-x-1.5">
                            <Calendar className="w-3.5 h-3.5 text-slate-500" />
                            <span className="font-semibold text-slate-300">{session.date}</span>
                          </div>
                          <div>•</div>
                          <div>
                            Recorded by: <span className="text-slate-300 font-semibold">{session.takenByName || session.takenBy}</span> ({session.takenByRole})
                          </div>
                        </div>
                      </div>

                      {/* Metrics & Action Buttons */}
                      <div className="flex flex-wrap items-center gap-4">
                        {/* Metrics Pills */}
                        <div className="flex items-center space-x-2 text-xs">
                          <div className="px-2.5 py-1 bg-slate-950 border border-slate-800 rounded">
                            <span className="text-slate-500 uppercase font-bold text-[10px]">Total:</span>{' '}
                            <span className="text-white font-bold">{totalStudents}</span>
                          </div>
                          <div className="px-2.5 py-1 bg-emerald-950/60 border border-emerald-500/30 rounded">
                            <span className="text-emerald-500 uppercase font-bold text-[10px]">Present:</span>{' '}
                            <span className="text-emerald-300 font-black">{presentCount} ({attendancePct}%)</span>
                          </div>
                          <div className="px-2.5 py-1 bg-rose-950/60 border border-rose-500/30 rounded">
                            <span className="text-rose-500 uppercase font-bold text-[10px]">Absent:</span>{' '}
                            <span className="text-rose-300 font-black">{absentCount}</span>
                          </div>
                          {absentCount > 0 && (
                            <div className="px-2.5 py-1 bg-blue-950/60 border border-blue-500/30 rounded">
                              <span className="text-blue-500 uppercase font-bold text-[10px]">SMS Sent:</span>{' '}
                              <span className="text-blue-300 font-black">{smsSentCount} / {absentCount}</span>
                            </div>
                          )}
                        </div>

                        {/* Action Buttons */}
                        <div className="flex items-center space-x-2">
                          {absentCount > 0 && (
                            <button
                              id={`btn-send-absent-sms-${session.id}`}
                              onClick={() => openSmsModal(session)}
                              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold uppercase rounded flex items-center space-x-1.5 transition-all shadow"
                            >
                              <Send className="w-3.5 h-3.5" />
                              <span>Dispatch Absent SMS</span>
                            </button>
                          )}

                          <button
                            id={`btn-export-excel-${session.id}`}
                            onClick={() => handleExportSessionToExcel(session)}
                            title="Export to Excel"
                            className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded transition-all"
                          >
                            <Download className="w-4 h-4" />
                          </button>

                          {(isAdmin || (isHod && session.department === userDept)) && (
                            <button
                              id={`btn-delete-session-${session.id}`}
                              onClick={() => handleDeleteSession(session.id)}
                              title="Delete from MongoDB"
                              className="p-1.5 bg-rose-950/40 hover:bg-rose-900 text-rose-300 border border-rose-500/30 rounded transition-all"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}

                          <button
                            id={`btn-toggle-expand-${session.id}`}
                            onClick={() => setExpandedSessionId(isExpanded ? null : session.id)}
                            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold uppercase rounded flex items-center space-x-1 transition-all"
                          >
                            <span>{isExpanded ? 'Hide Details' : 'View Records'}</span>
                            {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Expanded Records Table */}
                    {isExpanded && (
                      <div className="border-t border-slate-800 bg-slate-950/70 p-5 space-y-4 animate-fade-in">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <span className="text-xs font-bold uppercase text-slate-400">Filter View:</span>
                            <div className="flex bg-slate-900 border border-slate-800 rounded p-0.5 text-[10px] font-bold uppercase">
                              <button
                                onClick={() => setHistoryRecordStatusFilter('ALL')}
                                className={`px-2.5 py-1 rounded ${
                                  historyRecordStatusFilter === 'ALL'
                                    ? 'bg-blue-600 text-white'
                                    : 'text-slate-400 hover:text-white'
                                }`}
                              >
                                All ({session.records.length})
                              </button>
                              <button
                                onClick={() => setHistoryRecordStatusFilter('ABSENT')}
                                className={`px-2.5 py-1 rounded ${
                                  historyRecordStatusFilter === 'ABSENT'
                                    ? 'bg-rose-600 text-white'
                                    : 'text-slate-400 hover:text-white'
                                }`}
                              >
                                Absent Only ({absentCount})
                              </button>
                              <button
                                onClick={() => setHistoryRecordStatusFilter('PRESENT')}
                                className={`px-2.5 py-1 rounded ${
                                  historyRecordStatusFilter === 'PRESENT'
                                    ? 'bg-emerald-600 text-white'
                                    : 'text-slate-400 hover:text-white'
                                }`}
                              >
                                Present Only ({presentCount})
                              </button>
                            </div>
                          </div>

                          <div className="text-[11px] text-slate-400">
                            MongoDB ID: <span className="font-mono text-slate-500">{session.id}</span>
                          </div>
                        </div>

                        <div className="overflow-x-auto border border-slate-800 rounded-md">
                          <table className="w-full text-left text-xs">
                            <thead className="bg-slate-950 text-slate-400 font-bold uppercase text-[10px] tracking-wider border-b border-slate-800">
                              <tr>
                                <th className="px-4 py-2.5">S.No</th>
                                <th className="px-4 py-2.5">Register Number</th>
                                <th className="px-4 py-2.5">Student Name</th>
                                <th className="px-4 py-2.5">Parent Mobile</th>
                                <th className="px-4 py-2.5 text-center">Status</th>
                                <th className="px-4 py-2.5 text-center">Absent SMS Status</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/60 font-medium">
                              {displayedRecords.map((rec, idx) => {
                                const isAbsent = rec.status === 'ABSENT';
                                return (
                                  <tr
                                    key={rec.registerNumber}
                                    className={`hover:bg-slate-900/60 transition-colors ${
                                      isAbsent ? 'bg-rose-950/20' : ''
                                    }`}
                                  >
                                    <td className="px-4 py-2.5 text-slate-500">{idx + 1}</td>
                                    <td className="px-4 py-2.5 font-mono font-bold text-white">{rec.registerNumber}</td>
                                    <td className="px-4 py-2.5 text-slate-200">{rec.studentName}</td>
                                    <td className="px-4 py-2.5">
                                      {rec.parentMatched ? (
                                        <span className="text-emerald-400 font-mono text-xs flex items-center space-x-1">
                                          <Phone className="w-3 h-3" />
                                          <span>{rec.parentMobile}</span>
                                        </span>
                                      ) : (
                                        <span className="text-amber-400/80 text-[10px]">Parent Mobile Missing</span>
                                      )}
                                    </td>
                                    <td className="px-4 py-2.5 text-center">
                                      <span
                                        className={`inline-block px-2.5 py-0.5 text-[10px] font-black uppercase rounded-full ${
                                          isAbsent ? 'bg-rose-600 text-white' : 'bg-emerald-600 text-white'
                                        }`}
                                      >
                                        {rec.status}
                                      </span>
                                    </td>
                                    <td className="px-4 py-2.5 text-center">
                                      {isAbsent ? (
                                        rec.smsSent && rec.smsStatus === 'Sent' ? (
                                          <span className="inline-flex items-center space-x-1 px-2 py-0.5 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold rounded">
                                            <CheckCircle2 className="w-3 h-3" />
                                            <span>Sent ({rec.smsSentAt ? new Date(rec.smsSentAt).toLocaleTimeString() : 'Yes'})</span>
                                          </span>
                                        ) : rec.smsStatus === 'Failed' ? (
                                          <span
                                            title={rec.smsErrorMessage || 'Failed'}
                                            className="inline-flex items-center space-x-1 px-2 py-0.5 bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[10px] font-bold rounded cursor-help"
                                          >
                                            <AlertTriangle className="w-3 h-3" />
                                            <span>Failed ({rec.smsErrorMessage || 'Error'})</span>
                                          </span>
                                        ) : (
                                          <span className="text-slate-500 text-[10px] font-bold uppercase">
                                            Not Dispatched
                                          </span>
                                        )
                                      ) : (
                                        <span className="text-slate-600 text-[10px]">—</span>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. ABSENT PARENT SMS DISPATCH MODAL */}
      {/* ========================================================================= */}
      {smsModalSession && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-2xl w-full p-6 space-y-5 shadow-2xl max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-blue-600/20 border border-blue-500/30 text-blue-400 rounded-lg">
                  <Send className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold uppercase text-white tracking-wider">
                    Dispatch Absent Parent SMS
                  </h3>
                  <p className="text-xs text-slate-400">
                    {smsModalSession.academicGroup} • {smsModalSession.department} • {smsModalSession.date}
                  </p>
                </div>
              </div>

              <button
                onClick={() => {
                  setSmsModalSession(null);
                  setDispatchResult(null);
                }}
                className="text-slate-400 hover:text-white text-xs uppercase font-bold px-2 py-1 bg-slate-800 rounded"
              >
                Close
              </button>
            </div>

            {/* Absent Summary Banner */}
            <div className="bg-slate-950 border border-slate-800 rounded-lg p-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs text-center">
              <div>
                <span className="text-slate-400 block text-[10px] font-bold uppercase">Total Absent</span>
                <span className="text-rose-400 font-black text-lg">
                  {smsModalSession.records.filter((r) => r.status === 'ABSENT').length}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] font-bold uppercase">Selected</span>
                <span className="text-blue-400 font-black text-lg">{selectedAbsentRegNos.length}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] font-bold uppercase">Mobiles Found</span>
                <span className="text-emerald-400 font-black text-lg">
                  {
                    smsModalSession.records.filter(
                      (r) => r.status === 'ABSENT' && selectedAbsentRegNos.includes(r.registerNumber) && r.parentMatched
                    ).length
                  }
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] font-bold uppercase">Mobiles Missing</span>
                <span className="text-amber-400 font-black text-lg">
                  {
                    smsModalSession.records.filter(
                      (r) => r.status === 'ABSENT' && selectedAbsentRegNos.includes(r.registerNumber) && !r.parentMatched
                    ).length
                  }
                </span>
              </div>
            </div>

            {/* Dispatch Result Card if dispatched */}
            {dispatchResult && (
              <div className="bg-blue-950/50 border border-blue-500/30 rounded-lg p-4 space-y-2 animate-fade-in text-xs">
                <div className="font-bold text-white uppercase flex items-center justify-between">
                  <span>Dispatch Results</span>
                  <span className="text-emerald-400">Completed</span>
                </div>
                <div className="flex items-center space-x-4 text-xs font-semibold">
                  <span className="text-emerald-300">✓ {dispatchResult.sentCount} Sent</span>
                  <span className="text-rose-300">✗ {dispatchResult.failedCount} Failed</span>
                  <span className="text-slate-400">⊘ {dispatchResult.skippedCount} Skipped</span>
                </div>
              </div>
            )}

            {/* Absent Students Checkbox Selector */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold uppercase text-slate-300">Select Absent Students to Receive SMS:</span>
                <div className="space-x-2">
                  <button
                    onClick={() => {
                      const allAbsent = smsModalSession.records
                        .filter((r) => r.status === 'ABSENT')
                        .map((r) => r.registerNumber);
                      setSelectedAbsentRegNos(allAbsent);
                    }}
                    className="text-blue-400 hover:text-blue-300 font-bold uppercase text-[10px]"
                  >
                    Select All
                  </button>
                  <span>•</span>
                  <button
                    onClick={() => setSelectedAbsentRegNos([])}
                    className="text-slate-400 hover:text-slate-300 font-bold uppercase text-[10px]"
                  >
                    Deselect All
                  </button>
                </div>
              </div>

              <div className="max-h-48 overflow-y-auto border border-slate-800 rounded-md bg-slate-950 p-2 space-y-1.5">
                {smsModalSession.records
                  .filter((r) => r.status === 'ABSENT')
                  .map((rec) => {
                    const isSelected = selectedAbsentRegNos.includes(rec.registerNumber);
                    return (
                      <label
                        key={rec.registerNumber}
                        className={`flex items-center justify-between p-2 rounded cursor-pointer text-xs transition-colors ${
                          isSelected ? 'bg-blue-950/40 border border-blue-500/30' : 'hover:bg-slate-900 border border-transparent'
                        }`}
                      >
                        <div className="flex items-center space-x-3">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedAbsentRegNos((prev) => [...prev, rec.registerNumber]);
                              } else {
                                setSelectedAbsentRegNos((prev) =>
                                  prev.filter((r) => r !== rec.registerNumber)
                                );
                              }
                            }}
                            className="rounded bg-slate-900 border-slate-700 text-blue-600 focus:ring-0"
                          />
                          <div>
                            <span className="font-mono font-bold text-white">{rec.registerNumber}</span>
                            <span className="text-slate-300 ml-2 font-medium">{rec.studentName}</span>
                          </div>
                        </div>

                        <div>
                          {rec.parentMatched ? (
                            <span className="text-emerald-400 font-mono text-[11px]">
                              {rec.parentMobile}
                            </span>
                          ) : (
                            <span className="text-amber-400 text-[10px] font-bold">
                              No Parent Mobile
                            </span>
                          )}
                        </div>
                      </label>
                    );
                  })}
              </div>
            </div>

            {/* SMS Message Template Preview & Customizer */}
            <div className="space-y-2">
              <label className="block text-xs font-bold uppercase text-slate-300">
                SMS Content Format (Fast2SMS Gateway)
              </label>
              <textarea
                value={customSmsTemplate}
                onChange={(e) => setCustomSmsTemplate(e.target.value)}
                rows={6}
                className="w-full bg-slate-950 border border-slate-700 text-white font-mono text-xs p-3 rounded focus:border-blue-500 focus:outline-none"
              />
              <p className="text-[10px] text-slate-500">
                Tokens like <code className="text-blue-400">&#123;studentName&#125;</code>, <code className="text-blue-400">&#123;registerNumber&#125;</code>, <code className="text-blue-400">&#123;academicGroup&#125;</code>, and <code className="text-blue-400">&#123;date&#125;</code> are dynamically populated for each absent student.
              </p>
            </div>

            {/* Resend Guard */}
            <div className="flex items-center space-x-2 pt-2">
              <input
                id="force-resend-checkbox"
                type="checkbox"
                checked={forceResend}
                onChange={(e) => setForceResend(e.target.checked)}
                className="rounded bg-slate-900 border-slate-700 text-blue-600 focus:ring-0"
              />
              <label htmlFor="force-resend-checkbox" className="text-xs text-slate-300 font-semibold cursor-pointer">
                Resend to students who already received an SMS for this session
              </label>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end space-x-3 pt-4 border-t border-slate-800">
              <button
                onClick={() => {
                  setSmsModalSession(null);
                  setDispatchResult(null);
                }}
                className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold uppercase rounded transition-all"
              >
                Cancel
              </button>

              <button
                id="btn-confirm-send-absent-sms"
                onClick={handleSendAbsentSms}
                disabled={sendingSms || selectedAbsentRegNos.length === 0}
                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-black uppercase rounded shadow-lg shadow-blue-900/40 flex items-center space-x-2 transition-all disabled:opacity-50"
              >
                {sendingSms ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                <span>{sendingSms ? 'Sending SMS via Gateway...' : `Send Absent SMS (${selectedAbsentRegNos.length})`}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AttendanceManagement;
