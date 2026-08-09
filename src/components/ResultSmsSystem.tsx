import React, { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { ExamBatch, Department, StudentExamResult, SubjectMark } from '../types';
import { api } from '../lib/api';
import {
  FileCheck2,
  Upload,
  Send,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Building2,
  FileSpreadsheet,
  Download,
  Search,
  Check,
  RefreshCw,
  Phone,
  BookOpen,
  Award,
  ChevronRight,
  Info,
  Trash2,
  Printer,
  BarChart3,
  PieChart,
  TrendingUp,
  ChevronDown,
  ChevronUp,
  Layers,
} from 'lucide-react';

interface ResultSmsSystemProps {
  batches: ExamBatch[];
  departments?: Department[];
  onRefresh: () => void;
  onNavigateToReports: () => void;
}

const DEFAULT_DEPT_CODES = ['AIML', 'AIDS', 'CSE', 'CCE', 'ECE', 'EEE', 'MECH', 'CSBS', 'CHEMICAL', 'CIVIL'];

export const ResultSmsSystem: React.FC<ResultSmsSystemProps> = ({
  batches,
  departments,
  onRefresh,
}) => {
  const DEPARTMENTS = departments && departments.length > 0 ? departments.map((d) => d.code) : DEFAULT_DEPT_CODES;

  // View & Modal States
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [selectedBatch, setSelectedBatch] = useState<ExamBatch | null>(batches[0] || null);
  const [activeTab, setActiveTab] = useState<'excel' | 'paste'>('excel');

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'PASS' | 'FAIL' | 'SENT' | 'FAILED'>('ALL');
  const [reportViewTab, setReportViewTab] = useState<'overview' | 'subjects' | 'students'>('overview');
  const [expandedRegNo, setExpandedRegNo] = useState<string | null>(null);

  // Upload Form States
  const [title, setTitle] = useState('');
  const [department, setDepartment] = useState('CSE');
  const [examDate, setExamDate] = useState(new Date().toISOString().split('T')[0]);

  // Excel Upload States
  const [dragActive, setDragActive] = useState(false);
  const [parsedResults, setParsedResults] = useState<StudentExamResult[]>([]);
  const [detectedSubjects, setDetectedSubjects] = useState<string[]>([]);
  const [validMobileCount, setValidMobileCount] = useState(0);
  const [skippedMobileCount, setSkippedMobileCount] = useState(0);
  const [fileName, setFileName] = useState<string | null>(null);

  // Paste Fallback State
  const [rawText, setRawText] = useState('');

  // Execution States
  const [sendingSmsBatchId, setSendingSmsBatchId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- Parse Excel File ---
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processExcelFile(e.target.files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processExcelFile(e.dataTransfer.files[0]);
    }
  };

  const processExcelFile = (file: File) => {
    setError(null);
    setFileName(file.name);

    if (!title) {
      const suggestedTitle = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
      setTitle(suggestedTitle);
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];

        const rawRows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        if (!rawRows || rawRows.length < 2) {
          setError('Excel file contains no data rows.');
          return;
        }

        // Find header row
        let headerRowIdx = 0;
        while (headerRowIdx < rawRows.length && (!rawRows[headerRowIdx] || rawRows[headerRowIdx].length === 0)) {
          headerRowIdx++;
        }

        if (headerRowIdx >= rawRows.length) {
          setError('Could not locate header row in Excel file.');
          return;
        }

        const headers = rawRows[headerRowIdx].map((h: any) => (h !== null && h !== undefined ? String(h).trim() : ''));

        let regNoIdx = -1;
        let nameIdx = -1;
        let mobileIdx = -1;
        let totalIdx = -1;
        let resultIdx = -1;
        let sNoIdx = -1;
        const subjectIndices: { idx: number; name: string }[] = [];

        headers.forEach((h, idx) => {
          const upper = h.toUpperCase().replace(/[^A-Z0-9\s_]/g, '');
          if (/^(S\.?NO|SNO|SL\.?NO|SERIAL|ID)$/.test(upper)) {
            sNoIdx = idx;
          } else if (/^(REGISTER|REG|REGISTRATION|REGISTER NO|REG NO|REGISTER NUMBER|STUDENT ID|REGISTRATION NO)$/.test(upper) || upper.includes('REGISTER') || upper.includes('REG NO')) {
            regNoIdx = idx;
          } else if (/^(NAME|STUDENT NAME|STUDENT_NAME|FULL NAME)$/.test(upper) || (upper.includes('NAME') && !upper.includes('SUBJECT'))) {
            nameIdx = idx;
          } else if (/^(PARENT MOBILE|PARENT PHONE|MOBILE|PHONE|CONTACT|PARENT MOBILE NO|MOBILE NO|PARENT_MOBILE|PARENT_PHONE)$/.test(upper) || upper.includes('MOBILE') || upper.includes('PHONE') || upper.includes('PARENT')) {
            mobileIdx = idx;
          } else if (/^(TOTAL|TOTAL MARKS|TOTAL MARK|OVERALL TOTAL|MARKS TOTAL)$/.test(upper) || upper.includes('TOTAL')) {
            totalIdx = idx;
          } else if (/^(RESULT|RESULT STATUS|STATUS|PASS\/FAIL|OVERALL RESULT)$/.test(upper) || upper.includes('RESULT') || upper.includes('STATUS')) {
            resultIdx = idx;
          } else if (h.length > 0) {
            subjectIndices.push({ idx, name: h });
          }
        });

        // Fallbacks if not explicitly matched
        if (regNoIdx === -1 && headers.length > 1) regNoIdx = 1;
        if (nameIdx === -1 && headers.length > 2) nameIdx = 2;
        if (mobileIdx === -1 && headers.length > 3) mobileIdx = 3;

        const parsed: StudentExamResult[] = [];
        let validMob = 0;
        let skippedMob = 0;

        for (let r = headerRowIdx + 1; r < rawRows.length; r++) {
          const row = rawRows[r];
          if (!row || row.length === 0) continue;

          const regNoVal = regNoIdx >= 0 && row[regNoIdx] !== undefined ? String(row[regNoIdx]).trim() : '';
          const nameVal = nameIdx >= 0 && row[nameIdx] !== undefined ? String(row[nameIdx]).trim() : '';
          const rawMobile = mobileIdx >= 0 && row[mobileIdx] !== undefined ? String(row[mobileIdx]).trim().replace(/\D/g, '') : '';

          if (!regNoVal && !nameVal) continue;

          const subjectMarks: SubjectMark[] = [];
          let computedTotal = 0;
          let hasFail = false;

          subjectIndices.forEach(({ idx, name }) => {
            const rawVal = row[idx] !== undefined && row[idx] !== null ? String(row[idx]).trim() : '0';
            const numVal = parseFloat(rawVal) || 0;
            computedTotal += numVal;
            const isPass = numVal >= 50;
            if (!isPass) hasFail = true;

            subjectMarks.push({
              subjectCode: name.toUpperCase().slice(0, 12),
              subjectName: name,
              marks: numVal,
              maxMarks: 100,
              result: isPass ? 'PASS' : 'FAIL',
            });
          });

          let totalVal: string | number = '';
          if (totalIdx >= 0 && row[totalIdx] !== undefined && row[totalIdx] !== null && String(row[totalIdx]).trim() !== '') {
            totalVal = String(row[totalIdx]).trim();
          } else {
            totalVal = computedTotal;
          }

          let overallStatus: 'PASS' | 'FAIL' = 'PASS';
          if (resultIdx >= 0 && row[resultIdx] !== undefined && row[resultIdx] !== null && String(row[resultIdx]).trim() !== '') {
            const resStr = String(row[resultIdx]).trim().toUpperCase();
            overallStatus = resStr.includes('FAIL') ? 'FAIL' : 'PASS';
          } else {
            overallStatus = hasFail ? 'FAIL' : 'PASS';
          }

          const isValidPhone = rawMobile.length >= 10;
          if (isValidPhone) {
            validMob++;
          } else {
            skippedMob++;
          }

          parsed.push({
            sNo: sNoIdx >= 0 && row[sNoIdx] !== undefined ? String(row[sNoIdx]).trim() : parsed.length + 1,
            registerNumber: regNoVal,
            studentName: nameVal || `Student ${regNoVal}`,
            phoneNumber: rawMobile ? (rawMobile.startsWith('91') && rawMobile.length === 12 ? `+${rawMobile}` : `+91${rawMobile.slice(-10)}`) : '',
            department: department,
            subjects: subjectMarks,
            totalMarks: totalVal,
            overallStatus,
            smsSent: false,
          });
        }

        if (parsed.length === 0) {
          setError('No valid student result rows parsed from Excel file.');
          return;
        }

        setParsedResults(parsed);
        setDetectedSubjects(subjectIndices.map((s) => s.name));
        setValidMobileCount(validMob);
        setSkippedMobileCount(skippedMob);
      } catch (err: any) {
        setError(`Failed to parse Excel file: ${err.message}`);
      }
    };

    reader.readAsArrayBuffer(file);
  };

  // --- Download Sample Excel Template ---
  const downloadSampleTemplate = () => {
    const sampleData = [
      ['S.NO', 'REGISTER NUMBER', 'STUDENT NAME', 'MATHS', 'PHYSICS', 'CHEMISTRY', 'C PROGRAMMING', 'ENGLISH', 'RESULT'],
      [1, '921321104001', 'S. Ananya', 85, 90, 78, 88, 92, 'PASS'],
      [2, '921321104002', 'K. Vignesh', 92, 88, 95, 91, 89, 'PASS'],
      [3, '921321104003', 'M. Karthik', 42, 65, 55, 38, 50, 'FAIL'],
    ];

    const ws = XLSX.utils.aoa_to_sheet(sampleData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Result_Format');
    XLSX.writeFile(wb, 'VSB_College_Result_Upload_Template.xlsx');
  };

  // --- Create Batch ---
  const handleCreateBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    let finalResults: StudentExamResult[] = [];

    if (activeTab === 'excel') {
      if (parsedResults.length === 0) {
        setError('Please upload a valid Excel file containing student results.');
        return;
      }
      finalResults = parsedResults.map((r) => ({ ...r, department }));
    } else {
      // Raw Text parsing fallback
      if (!rawText.trim()) {
        setError('Please provide student results data.');
        return;
      }

      const lines = rawText.trim().split('\n');
      lines.forEach((line, idx) => {
        const parts = line.split(/,|\t/).map((p) => p.trim());
        if (parts.length >= 3) {
          const regNo = parts[0];
          const name = parts[1];
          const phone = parts[2] || '';
          const totalVal = parts[3] || 'N/A';
          const status = (parts[4]?.toUpperCase() as any) === 'FAIL' ? 'FAIL' : 'PASS';

          finalResults.push({
            sNo: idx + 1,
            registerNumber: regNo,
            studentName: name,
            phoneNumber: phone ? (phone.startsWith('+91') ? phone : `+91${phone.replace(/\D/g, '').slice(-10)}`) : '',
            department: department,
            subjects: [
              {
                subjectCode: 'EXAM-01',
                subjectName: 'Semester Exam',
                marks: status === 'PASS' ? 85 : 35,
                maxMarks: 100,
                result: status === 'PASS' ? 'PASS' : 'FAIL',
              },
            ],
            totalMarks: totalVal,
            overallStatus: status,
            smsSent: false,
          });
        }
      });
    }

    if (!title.trim()) {
      setError('Please provide an Exam Title/Semester name.');
      return;
    }

    if (finalResults.length === 0) {
      setError('No student results parsed. Please check the data format.');
      return;
    }

    setLoading(true);

    try {
      const created = await api.uploadExamBatch({
        title,
        department,
        examDate,
        results: finalResults,
      });

      setSuccessMsg(`Successfully uploaded exam batch "${title}" with ${finalResults.length} student records! Parent mobile numbers enrolled.`);
      setIsUploadModalOpen(false);
      resetForm();
      onRefresh();
      setSelectedBatch(created);
      setTimeout(() => setSuccessMsg(null), 5000);
    } catch (err: any) {
      setError(err.message || 'Failed to upload result batch');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setTitle('');
    setRawText('');
    setParsedResults([]);
    setDetectedSubjects([]);
    setFileName(null);
    setValidMobileCount(0);
    setSkippedMobileCount(0);
  };

  // --- Send Result SMS ---
  const handleSendResultSms = async (batchId: string) => {
    setError(null);
    setSendingSmsBatchId(batchId);

    try {
      const res = await api.sendResultSms(batchId);
      setSuccessMsg(`Dispatched Exam Result SMS via Fast2SMS to ${res.sentCount} parents! (${res.failedCount} failed)`);
      onRefresh();
      if (selectedBatch && selectedBatch.id === batchId) {
        setSelectedBatch(res.batch);
      }
      setTimeout(() => setSuccessMsg(null), 5000);
    } catch (err: any) {
      setError(err.message || 'Failed to dispatch result SMS');
    } finally {
      setSendingSmsBatchId(null);
    }
  };

  // --- Download CSV Report ---
  const downloadCsvReport = (batch: ExamBatch) => {
    const headers = [
      'S.NO',
      'REGISTER NUMBER',
      'STUDENT NAME',
      'PARENT MOBILE',
      'DEPARTMENT',
      'TOTAL MARKS',
      'RESULT STATUS',
      'SMS SENT STATUS',
      'DELIVERY STATUS',
      'ERROR DETAILS',
    ];

    const rows = batch.results.map((r, i) => {
      const totalDisplay =
        r.totalMarks !== undefined && r.totalMarks !== null && r.totalMarks !== ''
          ? r.totalMarks
          : r.subjects
          ? r.subjects.reduce((sum, s) => sum + s.marks, 0)
          : 'N/A';

      return [
        r.sNo || i + 1,
        `"${r.registerNumber}"`,
        `"${r.studentName}"`,
        `"${r.phoneNumber || 'MISSING'}"`,
        `"${r.department || batch.department}"`,
        totalDisplay,
        r.overallStatus,
        r.smsSent ? 'YES' : 'NO',
        r.smsStatus || 'Pending',
        `"${r.smsErrorMessage || ''}"`,
      ];
    });

    const csvContent =
      'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `${batch.title.replace(/\s+/g, '_')}_SMS_Report.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // --- Compute Batch Statistics for Organized Report View ---
  const batchStats = React.useMemo(() => {
    if (!selectedBatch || !selectedBatch.results || selectedBatch.results.length === 0) return null;

    const total = selectedBatch.results.length;
    const passed = selectedBatch.results.filter((r) => r.overallStatus === 'PASS').length;
    const failed = total - passed;
    const passRate = ((passed / total) * 100).toFixed(1);

    let sumTotals = 0;
    let topMark = 0;
    let topStudent = 'N/A';

    const subjectMap: Record<string, { totalMarks: number; count: number; passCount: number }> = {};

    selectedBatch.results.forEach((r) => {
      const totNum = typeof r.totalMarks === 'number' ? r.totalMarks : parseFloat(String(r.totalMarks)) || 0;
      sumTotals += totNum;
      if (totNum > topMark) {
        topMark = totNum;
        topStudent = r.studentName;
      }

      if (r.subjects && r.subjects.length > 0) {
        r.subjects.forEach((s) => {
          const key = s.subjectName || s.subjectCode;
          if (!subjectMap[key]) {
            subjectMap[key] = { totalMarks: 0, count: 0, passCount: 0 };
          }
          subjectMap[key].totalMarks += s.marks;
          subjectMap[key].count += 1;
          if (s.result === 'PASS' || s.marks >= 50) {
            subjectMap[key].passCount += 1;
          }
        });
      }
    });

    const avgTotal = (sumTotals / total).toFixed(1);

    const subjectStats = Object.entries(subjectMap).map(([name, data]) => ({
      name,
      avgMarks: (data.totalMarks / data.count).toFixed(1),
      passCount: data.passCount,
      failCount: data.count - data.passCount,
      passRate: ((data.passCount / data.count) * 100).toFixed(1),
      totalEvaluated: data.count,
    }));

    return {
      total,
      passed,
      failed,
      passRate,
      avgTotal,
      topMark,
      topStudent,
      subjectStats,
    };
  }, [selectedBatch]);

  // Filtered Students in Selected Batch
  const filteredStudents = selectedBatch
    ? selectedBatch.results.filter((res) => {
        const query = searchQuery.toLowerCase();
        const matchesQuery =
          res.studentName.toLowerCase().includes(query) ||
          res.registerNumber.toLowerCase().includes(query) ||
          res.phoneNumber.includes(query);

        if (!matchesQuery) return false;

        if (filterStatus === 'PASS') return res.overallStatus === 'PASS';
        if (filterStatus === 'FAIL') return res.overallStatus === 'FAIL';
        if (filterStatus === 'SENT') return res.smsStatus === 'Sent';
        if (filterStatus === 'FAILED') return res.smsStatus === 'Failed' || !res.phoneNumber;

        return true;
      })
    : [];

  return (
    <div id="result-sms-system-view" className="space-y-6 animate-in fade-in duration-200">
      
      {/* Top Banner with Branding & Fast2SMS Status */}
      <div className="bg-white border border-slate-200 p-6 rounded-sm shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2 text-amber-600 font-black text-xs uppercase tracking-widest mb-1">
            <Building2 className="w-4 h-4 text-amber-500" />
            <span>VSB ENGINEERING COLLEGE • Powered by VY NEXTGEN TECHNOLOGY</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 uppercase tracking-tight">
            College Result SMS Management System
          </h2>
          <p className="text-xs text-slate-500 font-medium mt-0.5 max-w-2xl">
            Upload Excel mark sheets with dynamic subject columns. Automatically enroll students, store parent mobile numbers, and trigger instant result SMS via Fast2SMS.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start md:self-auto shrink-0">
          <button
            id="download-sample-template-btn"
            onClick={downloadSampleTemplate}
            className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-black rounded-sm border border-slate-300 text-xs uppercase tracking-wider flex items-center gap-2 transition-all"
          >
            <Download className="w-4 h-4 text-slate-600" />
            <span>Sample Excel Format</span>
          </button>

          <button
            id="result-upload-new-batch-btn"
            onClick={() => {
              setIsUploadModalOpen(true);
              setError(null);
            }}
            className="px-5 py-2.5 bg-[#0f172a] hover:bg-amber-500 hover:text-slate-950 text-amber-400 font-black rounded-sm shadow-md text-xs uppercase tracking-widest flex items-center gap-2 transition-all border border-amber-500/30"
          >
            <Upload className="w-4 h-4" />
            <span>Upload Excel Marksheet</span>
          </button>
        </div>
      </div>

      {/* Notifications */}
      {successMsg && (
        <div className="p-4 rounded-sm bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs font-bold flex items-center justify-between shadow-xs">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
            <span>{successMsg}</span>
          </div>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-sm bg-rose-50 border border-rose-300 text-rose-900 text-xs font-bold flex items-center justify-between shadow-xs">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{error}</span>
          </div>
        </div>
      )}

      {/* Main Grid Layout: Batches Drawer + Active Batch Detail Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Drawer: List of Uploaded Exam Batches */}
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
              <FileCheck2 className="w-4 h-4 text-amber-500" />
              <span>Exam Batches ({batches.length})</span>
            </h3>
          </div>

          <div className="space-y-2">
            {batches.length > 0 ? (
              batches.map((batch) => {
                const isSelected = selectedBatch?.id === batch.id;
                const isSending = sendingSmsBatchId === batch.id;

                return (
                  <div
                    key={batch.id}
                    onClick={() => setSelectedBatch(batch)}
                    className={`p-4 rounded-sm border cursor-pointer transition-all space-y-3 ${
                      isSelected
                        ? 'bg-slate-900 text-white border-amber-500/80 shadow-md'
                        : 'bg-white border-slate-200 hover:border-slate-300 text-slate-900'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className={`font-black text-sm uppercase tracking-tight ${isSelected ? 'text-white' : 'text-slate-900'}`}>
                          {batch.title}
                        </h4>
                        <div className="flex items-center gap-2 text-xs mt-1 font-medium opacity-80">
                          <span className={`px-2 py-0.5 rounded-sm text-[10px] font-black uppercase ${isSelected ? 'bg-amber-400 text-slate-950' : 'bg-slate-900 text-white'}`}>
                            {batch.department}
                          </span>
                          <span>• {batch.examDate}</span>
                        </div>
                      </div>
                      <span className={`text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded-sm border ${isSelected ? 'bg-slate-800 border-slate-700 text-amber-300' : 'bg-slate-100 border-slate-200 text-slate-700'}`}>
                        {batch.totalStudents} Students
                      </span>
                    </div>

                    <div className={`flex items-center justify-between pt-2 border-t text-xs font-bold ${isSelected ? 'border-slate-800' : 'border-slate-200'}`}>
                      <span className="text-[11px] opacity-90">
                        SMS Sent: <strong className={isSelected ? 'text-amber-400' : 'text-blue-700'}>{batch.smsSentCount} / {batch.totalStudents}</strong>
                      </span>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSendResultSms(batch.id);
                        }}
                        disabled={isSending}
                        className={`px-3 py-1.5 font-black text-[10px] uppercase tracking-wider rounded-sm transition-all flex items-center gap-1 shadow disabled:opacity-50 ${
                          isSelected
                            ? 'bg-amber-400 hover:bg-amber-300 text-slate-950'
                            : 'bg-[#0f172a] hover:bg-blue-600 text-white'
                        }`}
                      >
                        <Send className="w-3 h-3" />
                        <span>{isSending ? 'Sending...' : 'Send SMS'}</span>
                      </button>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="p-8 text-center bg-white border border-slate-200 rounded-sm text-slate-500 space-y-3">
                <FileSpreadsheet className="w-10 h-10 mx-auto text-amber-500 opacity-60" />
                <p className="text-xs font-black text-slate-800 uppercase tracking-wider">No Exam Marksheets Uploaded</p>
                <p className="text-[11px] text-slate-500 font-medium">
                  Upload an Excel file with student register numbers, marks, and parent mobile numbers to start sending automatic result SMS.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Right Workspace: Selected Batch Details & Report */}
        <div className="lg:col-span-2">
          {selectedBatch ? (
            <div className="bg-white border border-slate-200 rounded-sm p-6 shadow-sm space-y-6">
              
              {/* Batch Header & Action Bar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-200 pb-4 gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="px-2.5 py-0.5 bg-[#0f172a] text-amber-400 rounded-sm text-[10px] font-black uppercase tracking-wider border border-amber-500/30">
                      DEPARTMENT OF {selectedBatch.department}
                    </span>
                    <span className="text-xs text-slate-500 font-bold">• Exam Date: {selectedBatch.examDate}</span>
                  </div>
                  <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">{selectedBatch.title}</h3>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">
                    Uploaded by <strong className="text-slate-800 font-black">{selectedBatch.uploadedBy}</strong> on {new Date(selectedBatch.uploadedAt).toLocaleString()}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    id="print-report-btn"
                    onClick={() => window.print()}
                    className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-black text-xs uppercase tracking-wider rounded-sm border border-slate-300 flex items-center gap-1.5 transition-all"
                    title="Print generated report"
                  >
                    <Printer className="w-3.5 h-3.5 text-slate-700" />
                    <span>Print Report</span>
                  </button>

                  <button
                    id="export-csv-report-btn"
                    onClick={() => downloadCsvReport(selectedBatch)}
                    className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-black text-xs uppercase tracking-wider rounded-sm border border-slate-300 flex items-center gap-1.5 transition-all"
                    title="Download complete SMS delivery report in CSV format"
                  >
                    <Download className="w-3.5 h-3.5 text-slate-700" />
                    <span>Download Report (CSV)</span>
                  </button>

                  <button
                    id="dispatch-result-sms-btn"
                    onClick={() => handleSendResultSms(selectedBatch.id)}
                    disabled={sendingSmsBatchId === selectedBatch.id}
                    className="px-4 py-2 bg-[#0f172a] hover:bg-amber-500 hover:text-slate-950 text-amber-400 font-black rounded-sm text-xs uppercase tracking-widest flex items-center gap-2 shadow-md transition-all disabled:opacity-50 border border-amber-500/30"
                  >
                    <Send className="w-4 h-4" />
                    <span>
                      {sendingSmsBatchId === selectedBatch.id ? 'Dispatching Fast2SMS...' : 'Send SMS to All Parents'}
                    </span>
                  </button>
                </div>
              </div>

              {/* Executive KPI Summary Cards */}
              {batchStats && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-sm space-y-1">
                    <span className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Total Evaluated</span>
                    <div className="text-xl font-black text-slate-900">{batchStats.total} Students</div>
                    <span className="text-[10px] font-medium text-slate-500">Department of {selectedBatch.department}</span>
                  </div>

                  <div className="p-3 bg-emerald-50/60 border border-emerald-200 rounded-sm space-y-1">
                    <span className="text-[10px] font-black uppercase text-emerald-800 tracking-wider">Overall Pass Rate</span>
                    <div className="text-xl font-black text-emerald-700">{batchStats.passRate}%</div>
                    <span className="text-[10px] font-bold text-emerald-800">{batchStats.passed} Passed • {batchStats.failed} Failed</span>
                  </div>

                  <div className="p-3 bg-blue-50/60 border border-blue-200 rounded-sm space-y-1">
                    <span className="text-[10px] font-black uppercase text-blue-800 tracking-wider">Class Average Score</span>
                    <div className="text-xl font-black text-blue-900">{batchStats.avgTotal}</div>
                    <span className="text-[10px] font-medium text-blue-700">Calculated across all subjects</span>
                  </div>

                  <div className="p-3 bg-amber-50/60 border border-amber-200 rounded-sm space-y-1">
                    <span className="text-[10px] font-black uppercase text-amber-800 tracking-wider">Highest Marks Score</span>
                    <div className="text-xl font-black text-amber-900">{batchStats.topMark}</div>
                    <span className="text-[10px] font-bold text-amber-800 truncate block">{batchStats.topStudent}</span>
                  </div>
                </div>
              )}

              {/* Report View Mode Switcher Tabs */}
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-sm border border-slate-200 text-xs">
                <button
                  type="button"
                  onClick={() => setReportViewTab('overview')}
                  className={`flex-1 py-1.5 font-black uppercase tracking-wider text-[11px] rounded-sm transition-all flex items-center justify-center gap-1.5 ${
                    reportViewTab === 'overview'
                      ? 'bg-[#0f172a] text-amber-400 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <BarChart3 className="w-3.5 h-3.5" />
                  <span>Student Marksheets & Delivery</span>
                </button>

                <button
                  type="button"
                  onClick={() => setReportViewTab('subjects')}
                  className={`flex-1 py-1.5 font-black uppercase tracking-wider text-[11px] rounded-sm transition-all flex items-center justify-center gap-1.5 ${
                    reportViewTab === 'subjects'
                      ? 'bg-[#0f172a] text-amber-400 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <TrendingUp className="w-3.5 h-3.5" />
                  <span>Subject-Wise Pass Analysis</span>
                </button>
              </div>

              {/* Subject Analytics Tab Content */}
              {reportViewTab === 'subjects' && batchStats && (
                <div className="space-y-4 animate-in fade-in duration-150">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                    <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider">
                      Subject Performance Breakdown ({batchStats.subjectStats.length} Subjects)
                    </h4>
                    <span className="text-[11px] font-bold text-slate-500">Passing criteria: ≥ 50 marks</span>
                  </div>

                  {batchStats.subjectStats.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {batchStats.subjectStats.map((sb, idx) => (
                        <div key={idx} className="p-4 bg-slate-50 border border-slate-200 rounded-sm space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="font-black text-xs text-slate-900 uppercase">{sb.name}</span>
                            <span className={`px-2 py-0.5 rounded-sm text-[10px] font-black uppercase ${
                              parseFloat(sb.passRate) >= 80 ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'
                            }`}>
                              {sb.passRate}% Pass Rate
                            </span>
                          </div>

                          <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden flex">
                            <div
                              className="bg-emerald-500 h-full transition-all"
                              style={{ width: `${sb.passRate}%` }}
                            />
                            <div
                              className="bg-rose-500 h-full transition-all"
                              style={{ width: `${100 - parseFloat(sb.passRate)}%` }}
                            />
                          </div>

                          <div className="flex items-center justify-between text-[11px] font-bold text-slate-600 pt-1">
                            <span>Average Score: <strong className="text-slate-900">{sb.avgMarks}</strong></span>
                            <span>{sb.passCount} Passed / {sb.failCount} Failed</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-6 text-center text-slate-500 text-xs font-medium">
                      No individual subject breakdown columns detected in this batch.
                    </div>
                  )}
                </div>
              )}

              {/* SMS Delivery Format Preview Box */}
              <div className="bg-amber-50/60 border border-amber-200/80 rounded-sm p-4 text-xs space-y-1.5">
                <div className="flex items-center justify-between text-amber-900 font-black uppercase tracking-wider text-[11px]">
                  <span className="flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 text-amber-600" />
                    <span>Fast2SMS Message Template Format</span>
                  </span>
                  <span className="text-[10px] text-amber-700 font-mono">Gateway: Fast2SMS (DLT / Real SMS)</span>
                </div>
                <div className="p-3 bg-white border border-amber-200 rounded-sm text-slate-800 font-mono text-[11px] font-bold shadow-2xs whitespace-pre-line leading-relaxed">
                  {`Dear [Student Name],

Your Semester Results:

Reg No: [Reg No]

Maths: [Mark]
Physics: [Mark]
Chemistry: [Mark]
C Programming: [Mark]
English: [Mark]

Result: [Pass/Fail]

- VSB Engineering College`}
                </div>
              </div>

              {/* Overview & Marksheets Content */}
              {reportViewTab === 'overview' && (
                <div className="space-y-4">
                  {/* Filters & Search Bar */}
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-50 p-3 border border-slate-200 rounded-sm">
                    <div className="relative w-full sm:w-64">
                      <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search Name or Reg No..."
                        className="w-full pl-9 pr-3 py-1.5 bg-white border border-slate-300 rounded-sm text-xs font-bold text-slate-900 focus:outline-none focus:border-amber-500"
                      />
                    </div>

                    <div className="flex items-center space-x-1 overflow-x-auto w-full sm:w-auto">
                      {(['ALL', 'PASS', 'FAIL', 'SENT', 'FAILED'] as const).map((st) => (
                        <button
                          key={st}
                          onClick={() => setFilterStatus(st)}
                          className={`px-2.5 py-1 text-[10px] font-black uppercase tracking-wider rounded-sm transition-all whitespace-nowrap ${
                            filterStatus === st
                              ? 'bg-[#0f172a] text-amber-400'
                              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          {st}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Student Results Table with Expandable Details */}
                  <div className="overflow-x-auto border border-slate-200 rounded-sm">
                    <table className="w-full text-left text-xs text-slate-700">
                      <thead className="bg-[#0f172a] text-amber-400 uppercase text-[10px] font-black tracking-wider border-b border-slate-800">
                        <tr>
                          <th className="px-3 py-3 font-black w-10 text-center">#</th>
                          <th className="px-3 py-3 font-black">Register No</th>
                          <th className="px-3 py-3 font-black">Student Name</th>
                          <th className="px-3 py-3 font-black">Parent Mobile</th>
                          <th className="px-3 py-3 font-black text-center">Total Marks</th>
                          <th className="px-3 py-3 font-black text-center">Result</th>
                          <th className="px-3 py-3 font-black text-right">Fast2SMS Delivery</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredStudents.length > 0 ? (
                          filteredStudents.map((res, idx) => {
                            const isExpanded = expandedRegNo === res.registerNumber;
                            const totalDisplay =
                              res.totalMarks !== undefined && res.totalMarks !== null && res.totalMarks !== ''
                                ? res.totalMarks
                                : res.subjects
                                ? res.subjects.reduce((sum, s) => sum + s.marks, 0)
                                : 'N/A';

                            return (
                              <React.Fragment key={idx}>
                                <tr
                                  onClick={() => setExpandedRegNo(isExpanded ? null : res.registerNumber)}
                                  className="hover:bg-slate-50 transition-colors cursor-pointer"
                                >
                                  <td className="px-3 py-3 text-center font-mono text-slate-400 text-[11px]">
                                    {res.sNo || idx + 1}
                                  </td>
                                  <td className="px-3 py-3 font-mono font-black text-slate-900">
                                    <div className="flex items-center gap-1">
                                      {res.subjects && res.subjects.length > 0 ? (
                                        isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-amber-600" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                                      ) : null}
                                      <span>{res.registerNumber}</span>
                                    </div>
                                  </td>
                                  <td className="px-3 py-3 font-black text-slate-900">{res.studentName}</td>
                                  <td className="px-3 py-3 font-mono font-bold text-slate-700">
                                    {res.phoneNumber ? (
                                      <span className="inline-flex items-center gap-1">
                                        <Phone className="w-3 h-3 text-slate-400" />
                                        <span>{res.phoneNumber}</span>
                                      </span>
                                    ) : (
                                      <span className="text-rose-600 font-bold italic text-[11px]">Missing Mobile</span>
                                    )}
                                  </td>
                                  <td className="px-3 py-3 text-center font-black text-slate-900 text-sm">
                                    {totalDisplay}
                                  </td>
                                  <td className="px-3 py-3 text-center">
                                    <span
                                      className={`px-2 py-0.5 rounded-sm text-[10px] font-black uppercase tracking-wider ${
                                        res.overallStatus === 'PASS'
                                          ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                          : 'bg-rose-50 text-rose-800 border border-rose-200'
                                      }`}
                                    >
                                      {res.overallStatus}
                                    </span>
                                  </td>
                                  <td className="px-3 py-3 text-right">
                                    {res.smsSent ? (
                                      <span
                                        className={`inline-flex items-center gap-1 font-black text-[11px] uppercase tracking-wider ${
                                          res.smsStatus === 'Failed' ? 'text-rose-600' : 'text-emerald-700'
                                        }`}
                                      >
                                        {res.smsStatus === 'Failed' ? (
                                          <XCircle className="w-3.5 h-3.5 text-rose-600" />
                                        ) : (
                                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                        )}
                                        <span>{res.smsStatus || 'Sent'}</span>
                                      </span>
                                    ) : (
                                      <span className="text-slate-400 text-[11px] font-bold uppercase tracking-wider italic">
                                        Ready to Send
                                      </span>
                                    )}
                                  </td>
                                </tr>

                                {/* Expanded Subject Breakdown Row */}
                                {isExpanded && res.subjects && res.subjects.length > 0 && (
                                  <tr className="bg-slate-50/80 border-b border-slate-200">
                                    <td colSpan={7} className="p-4">
                                      <div className="bg-white border border-slate-200 p-3 rounded-sm space-y-2">
                                        <div className="text-[11px] font-black uppercase text-slate-800 tracking-wider flex items-center justify-between border-b pb-1">
                                          <span>Subject Marks Breakdown for {res.studentName} ({res.registerNumber})</span>
                                          <span className="text-slate-500 font-bold">{res.subjects.length} Subjects Evaluated</span>
                                        </div>
                                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 text-xs">
                                          {res.subjects.map((sb, sidx) => (
                                            <div key={sidx} className="p-2 bg-slate-50 border border-slate-200 rounded flex items-center justify-between">
                                              <div>
                                                <div className="font-bold text-slate-800 truncate max-w-[120px]">{sb.subjectName || sb.subjectCode}</div>
                                                <div className="text-[10px] text-slate-500 font-semibold">{sb.result}</div>
                                              </div>
                                              <span className={`font-black text-sm ${sb.result === 'PASS' || sb.marks >= 50 ? 'text-emerald-700' : 'text-rose-600'}`}>
                                                {sb.marks}
                                              </span>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    </td>
                                  </tr>
                                )}
                              </React.Fragment>
                            );
                          })
                        ) : (
                          <tr>
                            <td colSpan={7} className="px-4 py-8 text-center text-slate-400 text-xs font-bold">
                              No student result records match search filter.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-sm p-12 text-center text-slate-500 space-y-3">
              <Building2 className="w-12 h-12 mx-auto text-amber-500/50" />
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider">
                Select an Exam Batch to View Student Results
              </h3>
              <p className="text-xs text-slate-500 font-medium max-w-md mx-auto">
                Click on any uploaded exam batch on the left panel or click "Upload Excel Marksheet" above to add new student results.
              </p>
            </div>
          )}
        </div>

      </div>

      {/* Upload Exam Results Modal */}
      {isUploadModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-xs p-4">
          <div className="w-full max-w-2xl bg-white border border-slate-200 rounded-sm shadow-2xl overflow-hidden animate-in fade-in zoom-in-95">
            
            {/* Modal Header */}
            <div className="p-4 border-b border-amber-500/30 flex items-center justify-between bg-[#0f172a] text-white">
              <div className="flex items-center space-x-2">
                <FileSpreadsheet className="w-5 h-5 text-amber-400" />
                <h3 className="text-xs font-black uppercase tracking-widest text-amber-400">
                  Upload College Result Excel File
                </h3>
              </div>
              <button
                onClick={() => {
                  setIsUploadModalOpen(false);
                  resetForm();
                }}
                className="text-slate-400 hover:text-white text-lg font-bold px-2"
              >
                ✕
              </button>
            </div>

            {/* Mode Switcher Tabs */}
            <div className="grid grid-cols-2 bg-slate-100 p-1 border-b border-slate-200 gap-1">
              <button
                type="button"
                onClick={() => setActiveTab('excel')}
                className={`py-2 px-3 text-xs font-black uppercase tracking-wider rounded-sm transition-all flex items-center justify-center space-x-2 ${
                  activeTab === 'excel'
                    ? 'bg-[#0f172a] text-amber-400 shadow-sm'
                    : 'text-slate-600 hover:bg-slate-200'
                }`}
              >
                <FileSpreadsheet className="w-4 h-4 text-amber-400" />
                <span>Excel File Upload (.xlsx / .csv)</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('paste')}
                className={`py-2 px-3 text-xs font-black uppercase tracking-wider rounded-sm transition-all flex items-center justify-center space-x-2 ${
                  activeTab === 'paste'
                    ? 'bg-[#0f172a] text-amber-400 shadow-sm'
                    : 'text-slate-600 hover:bg-slate-200'
                }`}
              >
                <BookOpen className="w-4 h-4 text-amber-400" />
                <span>Text / Tabular Data Paste</span>
              </button>
            </div>

            <form onSubmit={handleCreateBatch} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
              {error && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold rounded-sm flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
                  <span>{error}</span>
                </div>
              )}

              {/* Title & Department Selection */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-black text-slate-800 uppercase tracking-wider mb-1">
                    Exam Title / Semester *
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Semester 5 End Exam Results"
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-sm text-slate-900 text-xs font-bold focus:outline-none focus:border-amber-500 focus:bg-white"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-black text-slate-800 uppercase tracking-wider mb-1">
                    Department *
                  </label>
                  <select
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-sm text-slate-900 text-xs font-bold focus:outline-none focus:border-amber-500 focus:bg-white"
                  >
                    {DEPARTMENTS.map((dept) => (
                      <option key={dept} value={dept}>
                        {dept}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {activeTab === 'excel' ? (
                <div className="space-y-3">
                  {/* Drag & Drop File Zone */}
                  <div
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`border-2 border-dashed p-6 text-center rounded-sm cursor-pointer transition-all ${
                      dragActive
                        ? 'border-amber-500 bg-amber-50/50'
                        : parsedResults.length > 0
                        ? 'border-emerald-500 bg-emerald-50/30'
                        : 'border-slate-300 hover:border-slate-400 bg-slate-50'
                    }`}
                  >
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleFileChange}
                      accept=".xlsx, .xls, .csv"
                      className="hidden"
                    />

                    <Upload className="w-8 h-8 mx-auto text-amber-500 mb-2" />
                    {fileName ? (
                      <div className="space-y-1">
                        <p className="text-xs font-black text-slate-900 uppercase">{fileName}</p>
                        <p className="text-[11px] text-emerald-700 font-bold">
                          ✓ File Loaded Successfully! Click or drag to replace.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <p className="text-xs font-black text-slate-800 uppercase">
                          Click to select or drag & drop Excel / CSV File
                        </p>
                        <p className="text-[11px] text-slate-500 font-medium">
                          Supports columns: S.NO, REGISTER NUMBER, NAME, PARENT MOBILE, Dynamic Subjects, TOTAL, RESULT STATUS
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Dynamic Subject & Parent Mobile Validation Banner */}
                  {parsedResults.length > 0 && (
                    <div className="p-3.5 bg-slate-900 text-white rounded-sm text-xs space-y-2 border border-amber-500/30">
                      <div className="flex items-center justify-between text-amber-400 font-black uppercase text-[11px]">
                        <span>✓ Parsed {parsedResults.length} Student Records</span>
                        <span>Auto-Detected {detectedSubjects.length} Dynamic Subject Columns</span>
                      </div>

                      {detectedSubjects.length > 0 && (
                        <div className="flex flex-wrap gap-1 text-[10px] font-bold">
                          <span className="text-slate-400">Subjects:</span>
                          {detectedSubjects.map((sb, i) => (
                            <span key={i} className="px-1.5 py-0.5 bg-slate-800 text-amber-300 rounded-sm border border-slate-700">
                              {sb}
                            </span>
                          ))}
                        </div>
                      )}

                      <div className="flex items-center gap-4 text-[11px] font-bold pt-1 border-t border-slate-800">
                        <span className="text-emerald-400">✓ Valid Parent Mobiles: {validMobileCount}</span>
                        {skippedMobileCount > 0 && (
                          <span className="text-rose-400">⚠ Missing/Invalid Mobiles: {skippedMobileCount}</span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Parsed Data Preview Table */}
                  {parsedResults.length > 0 && (
                    <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-sm">
                      <table className="w-full text-left text-[11px] text-slate-700">
                        <thead className="bg-slate-100 text-slate-700 uppercase font-black sticky top-0">
                          <tr>
                            <th className="p-2 font-black">Reg No</th>
                            <th className="p-2 font-black">Student Name</th>
                            <th className="p-2 font-black">Parent Mobile</th>
                            <th className="p-2 font-black text-center">Total</th>
                            <th className="p-2 font-black text-center">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {parsedResults.slice(0, 10).map((r, i) => (
                            <tr key={i} className="hover:bg-slate-50">
                              <td className="p-2 font-mono font-bold text-slate-900">{r.registerNumber}</td>
                              <td className="p-2 font-bold text-slate-800">{r.studentName}</td>
                              <td className="p-2 font-mono text-slate-600">{r.phoneNumber || 'MISSING'}</td>
                              <td className="p-2 text-center font-bold text-slate-900">{r.totalMarks}</td>
                              <td className="p-2 text-center font-bold">
                                <span className={r.overallStatus === 'PASS' ? 'text-emerald-700' : 'text-rose-600'}>
                                  {r.overallStatus}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {parsedResults.length > 10 && (
                        <div className="p-2 text-center text-[10px] text-slate-500 bg-slate-50 font-bold border-t border-slate-200">
                          ...and {parsedResults.length - 10} more students
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                /* Tabular Text Paste Area */
                <div className="space-y-2">
                  <p className="text-xs text-slate-600 font-medium">
                    Paste student results below (One student per line). Format: <br />
                    <code className="text-blue-700 font-mono text-[11px] bg-slate-100 font-bold px-1.5 py-0.5 rounded-sm border border-slate-200">
                      Register Number, Student Name, Parent Mobile, Total Marks, Status (PASS/FAIL)
                    </code>
                  </p>

                  <textarea
                    value={rawText}
                    onChange={(e) => setRawText(e.target.value)}
                    rows={6}
                    placeholder={`921321104001, Anish Kumar, 9876543210, 341, PASS\n921321104002, Priya Dharshini, 9876543211, 366, PASS\n921321104003, Karthik Raja, 9876543212, 232, FAIL`}
                    className="w-full p-3 bg-slate-50 border border-slate-300 rounded-sm text-slate-900 font-mono text-xs font-medium focus:outline-none focus:border-amber-500 focus:bg-white"
                  />
                </div>
              )}

              {/* Action Buttons */}
              <div className="pt-2 flex justify-end gap-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => {
                    setIsUploadModalOpen(false);
                    resetForm();
                  }}
                  className="px-4 py-2 bg-slate-100 text-slate-700 text-xs font-bold rounded-sm border border-slate-300 hover:bg-slate-200 uppercase tracking-wider"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-5 py-2 bg-[#0f172a] hover:bg-amber-500 hover:text-slate-950 text-amber-400 font-black text-xs rounded-sm uppercase tracking-widest shadow-md transition-all border border-amber-500/30"
                >
                  {loading ? 'Uploading & Enrolling...' : 'Upload & Enroll Students'}
                </button>
              </div>
            </form>

          </div>
        </div>
      )}

    </div>
  );
};
