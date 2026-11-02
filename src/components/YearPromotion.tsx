import React, { useState, useEffect, useMemo } from 'react';
import {
  GraduationCap,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Filter,
  Search,
  CheckSquare,
  Square,
  RefreshCw,
  Download,
  Calendar,
  Building2,
  Users,
  ShieldAlert,
  X,
  History,
  Info,
} from 'lucide-react';
import { api } from '../lib/api';
import { User, Department, AcademicYear } from '../types';

interface YearPromotionProps {
  currentUser: User | null;
  departments: Department[];
  onRefresh: () => void;
  onNavigateToStudents?: (year?: string) => void;
}

export const YearPromotion: React.FC<YearPromotionProps> = ({
  currentUser,
  departments,
  onRefresh,
  onNavigateToStudents,
}) => {
  const currentYearNum = new Date().getFullYear();
  const defaultSession = `${currentYearNum}-${currentYearNum + 1}`;

  // State
  const [selectedYear, setSelectedYear] = useState<string>('All');
  const [selectedDept, setSelectedDept] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [academicSession, setAcademicSession] = useState<string>(defaultSession);
  const [promotionNotes, setPromotionNotes] = useState<string>('');

  // Loaded preview data
  const [loadingPreview, setLoadingPreview] = useState<boolean>(true);
  const [students, setStudents] = useState<any[]>([]);
  const [yearBreakdown, setYearBreakdown] = useState<Record<string, number>>({});
  const [transitions, setTransitions] = useState<any[]>([]);
  const [eligibleTotal, setEligibleTotal] = useState<number>(0);

  // Selected students (set of register numbers)
  const [selectedRegNumbers, setSelectedRegNumbers] = useState<Set<string>>(new Set());

  // Modal & execution state
  const [showConfirmModal, setShowConfirmModal] = useState<boolean>(false);
  const [isExecuting, setIsExecuting] = useState<boolean>(false);
  const [executionResult, setExecutionResult] = useState<any>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // History tab state
  const [activeView, setActiveView] = useState<'promote' | 'history'>('promote');
  const [promotionHistories, setPromotionHistories] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState<boolean>(false);
  const [historySearch, setHistorySearch] = useState<string>('');

  // Fetch preview whenever filters change
  const fetchPreview = async () => {
    setLoadingPreview(true);
    setErrorMessage(null);
    try {
      const data = await api.getPromotionPreview({
        year: selectedYear !== 'All' ? selectedYear : undefined,
        department: selectedDept !== 'All' ? selectedDept : undefined,
      });

      setStudents(data.students || []);
      setYearBreakdown(data.yearBreakdown || {});
      setTransitions(data.transitions || []);
      setEligibleTotal(data.eligibleTotal || 0);

      // By default, select all currently eligible students in the view
      const eligibleRegs = new Set<string>();
      (data.students || []).forEach((s: any) => {
        if (s.isEligible) {
          eligibleRegs.add(s.registerNumber);
        }
      });
      setSelectedRegNumbers(eligibleRegs);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to load eligible students for promotion preview.');
    } finally {
      setLoadingPreview(false);
    }
  };

  // Fetch history
  const fetchHistory = async () => {
    setLoadingHistory(true);
    try {
      const list = await api.getPromotionHistory();
      setPromotionHistories(list || []);
    } catch (err: any) {
      console.error('Failed to load promotion history:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    fetchPreview();
  }, [selectedYear, selectedDept]);

  useEffect(() => {
    if (activeView === 'history') {
      fetchHistory();
    }
  }, [activeView]);

  // Filter students by local search query
  const filteredStudents = useMemo(() => {
    if (!searchQuery.trim()) return students;
    const q = searchQuery.toLowerCase().trim();
    return students.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.registerNumber.toLowerCase().includes(q) ||
        s.department.toLowerCase().includes(q)
    );
  }, [students, searchQuery]);

  // Checkbox toggle helpers
  const toggleSelectStudent = (reg: string) => {
    setSelectedRegNumbers((prev) => {
      const next = new Set(prev);
      if (next.has(reg)) {
        next.delete(reg);
      } else {
        next.add(reg);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    const eligibleInView = filteredStudents.filter((s) => s.isEligible).map((s) => s.registerNumber);
    const allSelected = eligibleInView.length > 0 && eligibleInView.every((r) => selectedRegNumbers.has(r));

    setSelectedRegNumbers((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        eligibleInView.forEach((r) => next.delete(r));
      } else {
        eligibleInView.forEach((r) => next.add(r));
      }
      return next;
    });
  };

  // Selected count calculation
  const selectedCount = useMemo(() => {
    let count = 0;
    filteredStudents.forEach((s) => {
      if (s.isEligible && selectedRegNumbers.has(s.registerNumber)) {
        count++;
      }
    });
    return count;
  }, [filteredStudents, selectedRegNumbers]);

  // Execute promotion
  const handleExecutePromotion = async () => {
    if (selectedCount === 0) {
      setErrorMessage('Please select at least one eligible student to promote.');
      return;
    }

    setIsExecuting(true);
    setErrorMessage(null);
    setExecutionResult(null);

    try {
      const selectedRegsArray: string[] = Array.from(selectedRegNumbers);
      const res = await api.executePromotion({
        studentRegisterNumbers: selectedRegsArray,
        academicSession: academicSession.trim() || defaultSession,
        notes: promotionNotes.trim() || `Year promotion executed by ${currentUser?.name || 'Administrator'}`,
      });

      setExecutionResult(res);
      setShowConfirmModal(false);
      onRefresh();
      // Reload preview to show updated student years
      await fetchPreview();
    } catch (err: any) {
      setErrorMessage(err.message || 'Error occurred while executing academic year promotion.');
    } finally {
      setIsExecuting(false);
    }
  };

  // Download Promotion History CSV
  const handleDownloadHistory = () => {
    window.location.href = '/api/promotion/history/export';
  };

  return (
    <div className="space-y-6">
      {/* Institutional Top Header */}
      <div className="bg-[#0f172a] text-white p-6 rounded-xl shadow-lg border border-slate-800">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-amber-400 font-black text-xs uppercase tracking-widest mb-1">
              <span>VSB ENGINEERING COLLEGE</span>
              <span>•</span>
              <span className="text-slate-400">POWERED BY VY NEXTGEN TECHNOLOGY</span>
            </div>
            <h1 className="text-2xl font-black text-white flex items-center gap-3">
              <GraduationCap className="w-7 h-7 text-amber-400" />
              <span>Annual Academic Year Promotion System</span>
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              Progress enrolled cohorts to the next academic year with permanent MongoDB persistence and field audit logs.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveView('promote')}
              className={`px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 ${
                activeView === 'promote'
                  ? 'bg-amber-500 text-slate-950 shadow-md'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              <GraduationCap className="w-4 h-4" />
              <span>Promote Cohorts</span>
            </button>
            <button
              onClick={() => setActiveView('history')}
              className={`px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 ${
                activeView === 'history'
                  ? 'bg-amber-500 text-slate-950 shadow-md'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              <History className="w-4 h-4" />
              <span>Promotion History</span>
            </button>
          </div>
        </div>

        {/* Academic Progression Visualizer */}
        <div className="mt-6 pt-5 border-t border-slate-800/80 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-slate-800/50 p-3 rounded-lg border border-slate-700/60 flex items-center justify-between">
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Step 1</span>
              <div className="text-sm font-black text-blue-400">1st Year → 2nd Year</div>
            </div>
            <span className="px-2 py-1 bg-blue-500/20 text-blue-300 font-mono font-bold text-xs rounded">
              {yearBreakdown['1st Year'] || 0}
            </span>
          </div>

          <div className="bg-slate-800/50 p-3 rounded-lg border border-slate-700/60 flex items-center justify-between">
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Step 2</span>
              <div className="text-sm font-black text-emerald-400">2nd Year → 3rd Year</div>
            </div>
            <span className="px-2 py-1 bg-emerald-500/20 text-emerald-300 font-mono font-bold text-xs rounded">
              {yearBreakdown['2nd Year'] || 0}
            </span>
          </div>

          <div className="bg-slate-800/50 p-3 rounded-lg border border-slate-700/60 flex items-center justify-between">
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Step 3</span>
              <div className="text-sm font-black text-purple-400">3rd Year → 4th Year</div>
            </div>
            <span className="px-2 py-1 bg-purple-500/20 text-purple-300 font-mono font-bold text-xs rounded">
              {yearBreakdown['3rd Year'] || 0}
            </span>
          </div>

          <div className="bg-slate-800/50 p-3 rounded-lg border border-slate-700/60 flex items-center justify-between">
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Step 4</span>
              <div className="text-sm font-black text-amber-400">4th Year → Graduated</div>
            </div>
            <span className="px-2 py-1 bg-amber-500/20 text-amber-300 font-mono font-bold text-xs rounded">
              {yearBreakdown['4th Year'] || 0}
            </span>
          </div>
        </div>
      </div>

      {/* Error Banner */}
      {errorMessage && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg text-xs flex items-center justify-between animate-in fade-in">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
            <span className="font-bold">{errorMessage}</span>
          </div>
          <button onClick={() => setErrorMessage(null)} className="text-red-500 hover:text-red-800">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Success Notification Banner */}
      {executionResult && (
        <div className="p-5 bg-emerald-50 border border-emerald-300 text-emerald-900 rounded-xl shadow-sm space-y-3 animate-in fade-in">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0" />
              <div>
                <h3 className="font-black text-sm uppercase tracking-wide text-emerald-950">
                  {executionResult.message || 'Promotion Executed Successfully'}
                </h3>
                <p className="text-xs text-emerald-800">
                  {executionResult.successfulCount} students successfully updated in MongoDB.
                </p>
              </div>
            </div>
            <button onClick={() => setExecutionResult(null)} className="text-emerald-700 hover:text-emerald-950">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Details breakdown */}
          {executionResult.details && executionResult.details.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-emerald-200">
              {executionResult.details.map((d: any, idx: number) => (
                <div key={idx} className="bg-white p-2.5 rounded border border-emerald-200 text-center">
                  <div className="text-[10px] font-bold text-slate-500 uppercase">{d.department}</div>
                  <div className="text-xs font-black text-emerald-900">
                    {d.fromYear} → {d.toYear}
                  </div>
                  <div className="text-sm font-black text-emerald-600">{d.count} Students</div>
                </div>
              ))}
            </div>
          )}

          {/* Failed students warning if any */}
          {executionResult.failedCount > 0 && (
            <div className="p-3 bg-amber-50 border border-amber-300 rounded text-amber-900 text-xs">
              <span className="font-black uppercase">Skipped / Failed:</span> {executionResult.failedCount} students could not be promoted.
            </div>
          )}
        </div>
      )}

      {/* PROMOTION WORKFLOW VIEW */}
      {activeView === 'promote' && (
        <div className="space-y-6">
          {/* Controls Bar: Filters & Batch Execution */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Academic Year Filter */}
              <div>
                <label className="block text-[11px] font-black text-slate-600 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                  <GraduationCap className="w-3.5 h-3.5 text-blue-600" />
                  <span>Academic Year Filter</span>
                </label>
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="All">All Eligible Years (1st, 2nd, 3rd, 4th)</option>
                  <option value="1st Year">1st Year (Promote to 2nd Year)</option>
                  <option value="2nd Year">2nd Year (Promote to 3rd Year)</option>
                  <option value="3rd Year">3rd Year (Promote to 4th Year)</option>
                  <option value="4th Year">4th Year (Promote to Graduated)</option>
                </select>
              </div>

              {/* Department Filter */}
              <div>
                <label className="block text-[11px] font-black text-slate-600 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Department Filter</span>
                </label>
                <select
                  value={selectedDept}
                  onChange={(e) => setSelectedDept(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="All">All Departments</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.code}>
                      {d.code} - {d.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Academic Session */}
              <div>
                <label className="block text-[11px] font-black text-slate-600 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-amber-600" />
                  <span>Target Academic Session *</span>
                </label>
                <input
                  type="text"
                  value={academicSession}
                  onChange={(e) => setAcademicSession(e.target.value)}
                  placeholder="e.g. 2026-2027"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              {/* Search */}
              <div>
                <label className="block text-[11px] font-black text-slate-600 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                  <Search className="w-3.5 h-3.5 text-slate-600" />
                  <span>Search Eligible Students</span>
                </label>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search name or reg no..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Selection Status & Action Buttons */}
            <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={toggleSelectAll}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded text-xs font-black uppercase tracking-wider flex items-center gap-1.5 transition-all border border-slate-300"
                >
                  {selectedCount === filteredStudents.filter((s) => s.isEligible).length && selectedCount > 0 ? (
                    <>
                      <CheckSquare className="w-4 h-4 text-blue-600" />
                      <span>Deselect All</span>
                    </>
                  ) : (
                    <>
                      <Square className="w-4 h-4 text-slate-600" />
                      <span>Select All Eligible</span>
                    </>
                  )}
                </button>

                <span className="text-xs font-bold text-slate-600">
                  <strong className="text-slate-900 font-black">{selectedCount}</strong> of{' '}
                  <strong className="text-slate-900 font-black">{filteredStudents.filter((s) => s.isEligible).length}</strong> eligible students selected
                </span>
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={fetchPreview}
                  disabled={loadingPreview}
                  className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all"
                  title="Reload eligible student roster"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingPreview ? 'animate-spin' : ''}`} />
                  <span>Refresh</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowConfirmModal(true)}
                  disabled={selectedCount === 0 || loadingPreview}
                  className={`px-5 py-2.5 rounded-lg text-xs font-black uppercase tracking-wider shadow-md transition-all flex items-center gap-2 ${
                    selectedCount > 0
                      ? 'bg-amber-500 hover:bg-amber-600 text-slate-950 hover:shadow-lg cursor-pointer'
                      : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                  }`}
                >
                  <GraduationCap className="w-4 h-4 text-slate-950" />
                  <span>Promote Selected Students ({selectedCount})</span>
                </button>
              </div>
            </div>
          </div>

          {/* Eligible Students List */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-slate-700" />
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-900">
                  Eligible Student Cohort Roster ({filteredStudents.length} Students Listed)
                </h3>
              </div>
              <span className="text-[11px] text-slate-500 font-bold">
                Showing candidates eligible for the {academicSession} academic promotion
              </span>
            </div>

            {loadingPreview ? (
              <div className="p-12 text-center text-slate-500 text-xs font-bold flex flex-col items-center justify-center space-y-2">
                <RefreshCw className="w-6 h-6 animate-spin text-amber-500" />
                <span>Loading eligible student records...</span>
              </div>
            ) : filteredStudents.length === 0 ? (
              <div className="p-12 text-center text-slate-500 text-xs font-bold space-y-2">
                <Info className="w-8 h-8 text-slate-400 mx-auto" />
                <p>No eligible student records found matching the selected filters.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#0f172a] text-white uppercase text-[10px] tracking-wider font-black">
                    <tr>
                      <th className="p-3 w-10 text-center">
                        <input
                          type="checkbox"
                          checked={
                            selectedCount > 0 &&
                            selectedCount === filteredStudents.filter((s) => s.isEligible).length
                          }
                          onChange={toggleSelectAll}
                          className="rounded text-blue-600 focus:ring-0 cursor-pointer"
                        />
                      </th>
                      <th className="p-3">Student Name</th>
                      <th className="p-3">Register No</th>
                      <th className="p-3">Department</th>
                      <th className="p-3">Current Year</th>
                      <th className="p-3 text-center">Progression</th>
                      <th className="p-3">Target Year</th>
                      <th className="p-3">Parent Mobile</th>
                      <th className="p-3">Student Mobile</th>
                      <th className="p-3 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {filteredStudents.map((student) => {
                      const isSelected = selectedRegNumbers.has(student.registerNumber);
                      return (
                        <tr
                          key={student.id}
                          className={`hover:bg-blue-50/50 transition-colors ${
                            isSelected ? 'bg-amber-50/40' : ''
                          }`}
                        >
                          <td className="p-3 text-center">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              disabled={!student.isEligible}
                              onChange={() => toggleSelectStudent(student.registerNumber)}
                              className="rounded text-amber-500 focus:ring-0 cursor-pointer disabled:opacity-30"
                            />
                          </td>
                          <td className="p-3 font-bold text-slate-900">{student.name}</td>
                          <td className="p-3 font-mono font-black text-blue-700">{student.registerNumber}</td>
                          <td className="p-3 font-bold text-slate-700">{student.department}</td>
                          <td className="p-3">
                            <span className="px-2 py-0.5 rounded font-bold text-[10px] uppercase bg-slate-100 text-slate-800 border border-slate-200">
                              {student.currentYear}
                            </span>
                          </td>
                          <td className="p-3 text-center text-slate-400">
                            <ArrowRight className="w-3.5 h-3.5 mx-auto text-amber-600" />
                          </td>
                          <td className="p-3">
                            {student.nextYear === 'Graduated' ? (
                              <span className="px-2 py-0.5 rounded font-black text-[10px] uppercase bg-amber-100 text-amber-900 border border-amber-300">
                                Graduated (Alumni)
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded font-black text-[10px] uppercase bg-emerald-100 text-emerald-800 border border-emerald-300">
                                {student.nextYear}
                              </span>
                            )}
                          </td>
                          <td className="p-3 font-mono text-slate-700">{student.parentMobile || '—'}</td>
                          <td className="p-3 font-mono text-slate-500">{student.studentMobile || '—'}</td>
                          <td className="p-3 text-center">
                            {student.isEligible ? (
                              <span className="px-2 py-0.5 rounded-full font-bold text-[10px] uppercase bg-emerald-50 text-emerald-700 border border-emerald-200">
                                Eligible
                              </span>
                            ) : (
                              <span
                                className="px-2 py-0.5 rounded-full font-bold text-[10px] uppercase bg-slate-100 text-slate-500 border border-slate-300"
                                title={student.ineligibleReason}
                              >
                                {student.ineligibleReason || 'Ineligible'}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* PROMOTION HISTORY VIEW */}
      {activeView === 'history' && (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <History className="w-5 h-5 text-indigo-600" />
              <div>
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-900">
                  College Academic Promotion History Log
                </h3>
                <p className="text-[11px] text-slate-500">
                  Audit records of all previous year transitions saved in MongoDB.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <input
                type="text"
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                placeholder="Search history by session or admin..."
                className="px-3 py-1.5 bg-slate-50 border border-slate-300 rounded text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 w-full sm:w-64"
              />
              <button
                type="button"
                onClick={handleDownloadHistory}
                className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-xs font-black uppercase tracking-wider flex items-center gap-1.5 transition-all shadow-sm shrink-0"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download History (CSV)</span>
              </button>
            </div>
          </div>

          {loadingHistory ? (
            <div className="p-12 text-center text-slate-500 text-xs font-bold flex flex-col items-center justify-center space-y-2">
              <RefreshCw className="w-6 h-6 animate-spin text-indigo-600" />
              <span>Loading promotion history records...</span>
            </div>
          ) : promotionHistories.length === 0 ? (
            <div className="bg-white p-12 text-center text-slate-500 text-xs font-bold rounded-xl border border-slate-200">
              No historical promotion sessions recorded yet.
            </div>
          ) : (
            <div className="space-y-4">
              {promotionHistories.map((hist) => (
                <div key={hist.id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="px-2.5 py-0.5 bg-blue-100 text-blue-900 font-black text-xs rounded uppercase border border-blue-200">
                          Session: {hist.academicSession}
                        </span>
                        <span className="text-xs font-bold text-slate-700">
                          Promoted By: <strong className="text-slate-900">{hist.promotedByName || hist.promotedBy}</strong>
                        </span>
                      </div>
                      <span className="text-[11px] text-slate-400 mt-1 block">
                        Executed On: {new Date(hist.timestamp).toLocaleString()}
                      </span>
                    </div>

                    <div className="text-right">
                      <span className="text-xs font-bold text-slate-500 uppercase">Total Students Promoted:</span>{' '}
                      <span className="text-base font-black text-emerald-600">{hist.totalStudentsPromoted}</span>
                    </div>
                  </div>

                  {/* Cohort Transitions */}
                  {hist.promotions && hist.promotions.length > 0 && (
                    <div className="p-4 bg-white border-b border-slate-100 grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {hist.promotions.map((p: any, pIdx: number) => (
                        <div key={pIdx} className="p-2 bg-slate-50 rounded border border-slate-200 text-center">
                          <span className="text-[10px] font-bold text-slate-500 uppercase">{p.department}</span>
                          <div className="text-xs font-black text-slate-900">
                            {p.fromYear} → {p.toYear}
                          </div>
                          <span className="text-xs font-black text-blue-600">{p.count} Students</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Individual Student Records Table */}
                  {hist.studentRecords && hist.studentRecords.length > 0 && (
                    <div className="max-h-60 overflow-y-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-100 text-slate-600 font-bold uppercase text-[10px] tracking-wider">
                          <tr>
                            <th className="p-2.5">Student Name</th>
                            <th className="p-2.5">Register No</th>
                            <th className="p-2.5">Department</th>
                            <th className="p-2.5">From Year</th>
                            <th className="p-2.5">To Year</th>
                            <th className="p-2.5 text-center">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {hist.studentRecords.map((rec: any, rIdx: number) => (
                            <tr key={rIdx} className="hover:bg-slate-50/60">
                              <td className="p-2.5 font-bold text-slate-900">{rec.studentName}</td>
                              <td className="p-2.5 font-mono font-bold text-blue-700">{rec.registerNumber}</td>
                              <td className="p-2.5 text-slate-700 font-medium">{rec.department}</td>
                              <td className="p-2.5 text-slate-500">{rec.fromYear}</td>
                              <td className="p-2.5 font-bold text-emerald-700">{rec.toYear}</td>
                              <td className="p-2.5 text-center">
                                <span className="px-2 py-0.5 rounded font-bold text-[9px] uppercase bg-emerald-100 text-emerald-800">
                                  {rec.status}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* IN-APP CONFIRMATION MODAL POPUP (Replaces window.confirm which fails in sandboxed iframes) */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="w-full max-w-lg bg-white border border-slate-200 rounded-xl shadow-2xl overflow-hidden animate-in zoom-in-95">
            <div className="p-5 bg-[#0f172a] text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-amber-400" />
                <h3 className="text-sm font-black uppercase tracking-wider">
                  Confirm Annual Year Promotion
                </h3>
              </div>
              <button
                onClick={() => setShowConfirmModal(false)}
                className="text-slate-400 hover:text-white"
                disabled={isExecuting}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              <div className="bg-amber-50 border border-amber-200 p-4 rounded-lg space-y-2 text-amber-900">
                <h4 className="font-black uppercase flex items-center gap-1.5 text-amber-950">
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                  <span>Important Academic Progression Notice:</span>
                </h4>
                <p>
                  You are about to promote <strong>{selectedCount} selected students</strong> for academic session{' '}
                  <strong>{academicSession}</strong>.
                </p>
                <ul className="list-disc list-inside space-y-1 text-amber-800">
                  <li>1st Year students become 2nd Year.</li>
                  <li>2nd Year students become 3rd Year.</li>
                  <li>3rd Year students become 4th Year.</li>
                  <li>4th Year students transition to <strong>Graduated (Alumni)</strong>.</li>
                </ul>
                <p className="text-[11px] font-bold text-amber-900 mt-2">
                  All Register Numbers, Student Mobile, Parent Mobile, Exam Records, and SMS history will be permanently preserved.
                </p>
              </div>

              <div>
                <label className="block text-xs font-black text-slate-700 uppercase tracking-wider mb-1">
                  Optional Execution Notes
                </label>
                <textarea
                  value={promotionNotes}
                  onChange={(e) => setPromotionNotes(e.target.value)}
                  placeholder="e.g. Annual academic council approval date..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs"
                  rows={2}
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowConfirmModal(false)}
                  disabled={isExecuting}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg uppercase tracking-wider text-xs"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleExecutePromotion}
                  disabled={isExecuting}
                  className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black rounded-lg uppercase tracking-wider text-xs shadow-md transition-all flex items-center gap-2"
                >
                  {isExecuting ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Updating Database...</span>
                    </>
                  ) : (
                    <>
                      <GraduationCap className="w-4 h-4" />
                      <span>Execute {selectedCount} Promotions</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
