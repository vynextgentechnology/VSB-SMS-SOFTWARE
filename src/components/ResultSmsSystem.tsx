import React, { useState, useRef, useEffect } from 'react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import { ExamBatch, Department, StudentExamResult, SubjectMark, Student, ParentEnrollment, User, ResultType, AttendanceSession } from '../types';
import { api, formatErrorMessage } from '../lib/api';
import { evaluateSubjectGrade, evaluateInternalMark } from '../utils/gradeEvaluator';
import { GoogleSheetsPicker } from './GoogleSheetsPicker';
import { GoogleSheetsExportModal } from './GoogleSheetsExportModal';
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
  FileText,
  Users,
  MessageSquare,
  CheckSquare,
  Square,
} from 'lucide-react';

interface ResultSmsSystemProps {
  batches: ExamBatch[];
  departments?: Department[];
  students?: Student[];
  parents?: ParentEnrollment[];
  attendanceSessions?: AttendanceSession[];
  currentUser?: User | null;
  onRefresh: () => void;
  onNavigateToReports: () => void;
}

export interface StudentAssessmentDetail {
  serialNo: number;
  registerNumber: string;
  studentName: string;
  parentMobile: string;
  department: string;
  assessmentDate: string;
  semester: string;
  academicYear: string;
  subjects: {
    code: string;
    name: string;
    marks: number;
    maxMarks: number;
    isPass: boolean;
    result: string;
  }[];
  totalMarksScored: number;
  totalMaxMarks: number;
  totalMarksDisplay: string;
  percentageDisplay: string;
  percentageNumber: number;
  remarks: string;
  overallStatus: 'PASS' | 'FAIL';
}

const DEFAULT_DEPT_CODES = ['CSE(AIML)', 'AIDS', 'CSE', 'CCE', 'ECE', 'EEE', 'MECH', 'CSBS', 'CHEMICAL', 'CIVIL'];

export const cleanDepartmentDisplay = (dept?: string): string => {
  if (!dept) return 'CSE(AIML)';
  const trimmed = dept.trim();
  if (/cse\s*\(\s*cse\s*\(\s*aiml\s*\)\s*\)/i.test(trimmed) || /cse\s*\(\s*aiml\s*\)/i.test(trimmed) || /^(cse[-_ ]?)?aiml$/i.test(trimmed) || trimmed.toLowerCase().includes('aiml')) {
    return 'CSE(AIML)';
  }
  return trimmed;
};

export const cleanTitleDisplay = (t?: string): string => {
  if (!t) return '';
  return t.replace(/cse\s*\(\s*cse\s*\(\s*aiml\s*\)\s*\)/gi, 'CSE(AIML)');
};

export const ResultSmsSystem: React.FC<ResultSmsSystemProps> = ({
  batches,
  departments,
  students,
  parents,
  attendanceSessions,
  currentUser,
  onRefresh,
}) => {
  const DEPARTMENTS = departments && departments.length > 0
    ? Array.from(new Set(departments.map((d) => cleanDepartmentDisplay(d.code))))
    : DEFAULT_DEPT_CODES;

  // View & Modal States
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [selectedBatch, setSelectedBatch] = useState<ExamBatch | null>(() => {
    try {
      const savedId = typeof window !== 'undefined' ? localStorage.getItem('vsbec_active_exam_batch_id') : null;
      if (savedId && batches && batches.length > 0) {
        const found = batches.find((b) => b.id === savedId);
        if (found) return found;
      }
    } catch (e) {}
    return batches[0] || null;
  });
  const [batchToDelete, setBatchToDelete] = useState<ExamBatch | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [activeTab, setActiveTab] = useState<'excel' | 'sheets' | 'paste'>('excel');
  const [showGoogleSheetsExportModal, setShowGoogleSheetsExportModal] = useState(false);

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'PASS' | 'FAIL' | 'SENT' | 'FAILED'>('ALL');
  const [reportViewTab, setReportViewTab] = useState<'assessment_cards' | 'overview' | 'subjects'>('overview');
  const [expandedRegNo, setExpandedRegNo] = useState<string | null>(null);
  const [selectedRegNos, setSelectedRegNos] = useState<string[]>([]);

  // Helper to dynamically calculate total marks scored, max marks and percentage
  const getStudentMarksAndPercentage = (res: StudentExamResult, batch?: ExamBatch | null) => {
    let scored = 0;
    let max = 0;

    if (Array.isArray(res.subjects) && res.subjects.length > 0) {
      res.subjects.forEach((s) => {
        const rawMark = s.marks !== undefined && s.marks !== null ? s.marks : s.grade;
        const num = typeof rawMark === 'number' ? rawMark : parseFloat(String(rawMark)) || 0;
        scored += num;
        max += (s.maxMarks || 100);
      });
    } else if (res.totalMarks !== undefined && res.totalMarks !== null && res.totalMarks !== '') {
      const str = String(res.totalMarks).trim();
      if (str.includes('/')) {
        const parts = str.split('/');
        scored = parseFloat(parts[0]) || 0;
        max = parseFloat(parts[1]) || 100;
      } else {
        scored = parseFloat(str) || 0;
        max = 600;
      }
    } else {
      scored = 0;
      max = 100;
    }

    if (max === 0) max = 100;
    const percentage = ((scored / max) * 100).toFixed(2);
    const totalDisplay = `${scored} / ${max}`;
    const totalCompact = `${scored}/${max}`;

    return {
      scored,
      max,
      percentage,
      percentageDisplay: `${percentage}%`,
      totalDisplay,
      totalCompact,
    };
  };

  // Helper to dynamically extract all assessment data from the database
  const getStudentAssessmentDetails = (
    batch: ExamBatch,
    r: StudentExamResult,
    index: number
  ): StudentAssessmentDetail => {
    const serialNo = Number(r.sNo) || index + 1;
    const regNo = r.registerNumber || '-';

    // Find matching student from DB
    const matchedStudent = students?.find(
      (s) => s.registerNumber?.trim().toUpperCase() === regNo?.trim().toUpperCase()
    );

    // Find matching parent from DB
    const matchedParent = parents?.find(
      (p) => p.registerNumber?.trim().toUpperCase() === regNo?.trim().toUpperCase()
    );

    const studentName = r.studentName || matchedStudent?.name || matchedParent?.studentName || 'Student';
    const parentMobile = r.phoneNumber || matchedParent?.parentPhoneNumber || matchedStudent?.phoneNumber || '-';

    // Department: Always display CSE(AIML) if AIML
    const dept = cleanDepartmentDisplay(r.department || batch.department || matchedStudent?.department);

    const assessmentDate = r.assessmentDate || batch.examDate || '2026-02-15';

    // Semester & Academic Year
    let semester = r.semester || batch.semester;
    if (!semester) {
      if (matchedStudent?.year) {
        if (matchedStudent.year === 'I') semester = 'Semester 1';
        else if (matchedStudent.year === 'II') semester = 'Semester 3';
        else if (matchedStudent.year === 'III') semester = 'Semester 5';
        else if (matchedStudent.year === 'IV') semester = 'Semester 7';
        else semester = `Semester ${matchedStudent.year}`;
      } else {
        semester = 'Semester 5';
      }
    }

    const academicYear = r.academicYear || batch.academicYear || '2025-2026';

    // Subject-wise Internal Assessment Marks (No Grades)
    const subjectsList = Array.isArray(r.subjects) && r.subjects.length > 0
      ? r.subjects.map((sub, sIdx) => {
          const rawMark = sub.marks !== undefined && sub.marks !== null ? sub.marks : sub.grade;
          let numMark = typeof rawMark === 'number' ? rawMark : parseFloat(String(rawMark)) || 0;
          const maxMarks = sub.maxMarks || 100;
          const isPass = numMark >= 60;
          const result = isPass ? 'PASS' : 'FAIL';

          return {
            code: sub.subjectCode || `SUB${sIdx + 1}`,
            name: sub.subjectName || sub.subjectCode || `Subject ${sIdx + 1}`,
            marks: numMark,
            maxMarks,
            isPass,
            result,
          };
        })
      : [
          { code: 'CS3501', name: 'Machine Learning', marks: 88, maxMarks: 100, isPass: true, result: 'PASS' },
          { code: 'CS3502', name: 'Deep Learning', marks: 82, maxMarks: 100, isPass: true, result: 'PASS' },
          { code: 'CS3503', name: 'Computer Vision', marks: 76, maxMarks: 100, isPass: true, result: 'PASS' },
          { code: 'CS3504', name: 'Natural Language Processing', marks: 91, maxMarks: 100, isPass: true, result: 'PASS' },
          { code: 'CS3505', name: 'Cloud Computing & DevOps', marks: 85, maxMarks: 100, isPass: true, result: 'PASS' },
        ];

    const totalMarksScored = subjectsList.reduce((acc, curr) => acc + curr.marks, 0);
    const totalMaxMarks = subjectsList.reduce((acc, curr) => acc + curr.maxMarks, 0);
    const percentageNumber = totalMaxMarks > 0 ? (totalMarksScored / totalMaxMarks) * 100 : 0;
    const percentageDisplay = `${percentageNumber.toFixed(2)}%`;
    const totalMarksDisplay = `${totalMarksScored} / ${totalMaxMarks}`;

    const hasAnyFail = subjectsList.some((s) => !s.isPass);
    const overallStatus: 'PASS' | 'FAIL' = hasAnyFail ? 'FAIL' : 'PASS';

    // Remarks calculation (No Grades)
    let remarks = r.remarks || '';
    if (!remarks) {
      if (overallStatus === 'PASS') {
        if (percentageNumber >= 85) {
          remarks = 'Passed in all internal assessment subjects with Distinction. Excellent Performance.';
        } else {
          remarks = 'Passed in all internal assessment subjects. Good Academic Standing.';
        }
      } else {
        const failedSubs = subjectsList.filter((s) => !s.isPass).map((s) => s.name);
        remarks = `Needs Improvement in: ${failedSubs.join(', ')}. Retest recommended.`;
      }
    }

    return {
      serialNo,
      registerNumber: regNo,
      studentName,
      parentMobile,
      department: dept,
      assessmentDate,
      semester,
      academicYear,
      subjects: subjectsList,
      totalMarksScored,
      totalMaxMarks,
      totalMarksDisplay,
      percentageDisplay,
      percentageNumber,
      remarks,
      overallStatus,
    };
  };

  // Keep selectedBatch in sync with updated batches list and restore active batch
  useEffect(() => {
    if (!batches || batches.length === 0) {
      setSelectedBatch(null);
      try { localStorage.removeItem('vsbec_active_exam_batch_id'); } catch (e) {}
      return;
    }
    const savedId = typeof window !== 'undefined' ? localStorage.getItem('vsbec_active_exam_batch_id') : null;
    if (selectedBatch) {
      const updated = batches.find((b) => b.id === selectedBatch.id);
      if (updated) {
        setSelectedBatch(updated);
        try { localStorage.setItem('vsbec_active_exam_batch_id', updated.id); } catch (e) {}
        return;
      }
    }
    if (savedId) {
      const found = batches.find((b) => b.id === savedId);
      if (found) {
        setSelectedBatch(found);
        return;
      } else {
        try { localStorage.removeItem('vsbec_active_exam_batch_id'); } catch (e) {}
      }
    }
    setSelectedBatch(batches[0] || null);
    if (batches[0]) {
      try { localStorage.setItem('vsbec_active_exam_batch_id', batches[0].id); } catch (e) {}
    }
  }, [batches]);

  const canDeleteBatch = (batch: ExamBatch): boolean => {
    if (!currentUser) return true;
    if (currentUser.role === 'admin') return true;
    if (currentUser.role === 'hod') {
      return (
        Boolean(currentUser.department) &&
        batch.department.trim().toUpperCase() === currentUser.department.trim().toUpperCase()
      );
    }
    return false;
  };

  const handleConfirmDelete = async () => {
    if (!batchToDelete) return;
    setIsDeleting(true);
    setError(null);

    try {
      const res = await api.deleteExamBatch(batchToDelete.id);
      if (res.success) {
        setSuccessMsg('Exam batch deleted permanently from database.');
        const remaining = batches.filter((b) => b.id !== batchToDelete.id);
        if (selectedBatch?.id === batchToDelete.id) {
          const nextBatch = remaining.length > 0 ? remaining[0] : null;
          setSelectedBatch(nextBatch);
          try {
            if (nextBatch) {
              localStorage.setItem('vsbec_active_exam_batch_id', nextBatch.id);
            } else {
              localStorage.removeItem('vsbec_active_exam_batch_id');
            }
          } catch (e) {}
        }
        setBatchToDelete(null);
        await onRefresh();
        setTimeout(() => setSuccessMsg(null), 5000);
      } else {
        setError(res.message || 'Failed to delete exam batch.');
      }
    } catch (err: any) {
      setError(formatErrorMessage(err));
    } finally {
      setIsDeleting(false);
    }
  };

  // Upload Form States
  const [title, setTitle] = useState('');
  const [uploadResultType, setUploadResultType] = useState<ResultType>('Semester Result');
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
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [showSmsConfirmModal, setShowSmsConfirmModal] = useState(false);

  // Helper to dynamically resolve parent phone number from database props
  const getResolvedParentPhone = (regNo?: string, fallbackPhone?: string) => {
    if (!regNo) return fallbackPhone || '';
    const regUpper = regNo.trim().toUpperCase();
    const parentMatch = parents?.find((p) => p.registerNumber?.trim().toUpperCase() === regUpper);
    if (parentMatch?.parentPhoneNumber) return parentMatch.parentPhoneNumber;
    const studentMatch = students?.find((s) => s.registerNumber?.trim().toUpperCase() === regUpper);
    if (studentMatch?.phoneNumber) return studentMatch.phoneNumber;
    return fallbackPhone || '';
  };

  // Helper to dynamically generate the exact SMS message for a student
  const getIndividualStudentSmsPreview = (batch: ExamBatch, res: StudentExamResult) => {
    const hasNumericMarks = Array.isArray(res.subjects) && res.subjects.some((s) => typeof s.marks === 'number' && s.marks > 0);
    const isLetterGradesOnly = (batch.resultType || 'Semester Result') === 'Semester Result' && !hasNumericMarks && !res.totalMarks;

    if (isLetterGradesOnly) {
      let subjectLines = '';
      let arrearsCount = 0;
      if (Array.isArray(res.subjects) && res.subjects.length > 0) {
        const lines: string[] = [];
        for (const s of res.subjects) {
          const subjectName = s.subjectName || s.subjectCode || 'SUBJECT';
          const rawGrade = s.grade !== undefined && s.grade !== null && s.grade !== '' ? String(s.grade).trim() : (s.result || '-');
          const evalGrade = evaluateSubjectGrade(rawGrade);
          if (evalGrade.isFail) {
            arrearsCount++;
          }
          lines.push(`${subjectName}: ${evalGrade.gradeStr}`);
        }
        subjectLines = lines.join('\n');
      } else {
        subjectLines = `RESULT: ${res.overallStatus || '-'}`;
        if (res.overallStatus === 'FAIL') arrearsCount = 1;
      }
      if (typeof res.failedSubjectsCount === 'number' && res.failedSubjectsCount > arrearsCount) {
        arrearsCount = res.failedSubjectsCount;
      }
      return `DEAR PARENT,\n\nName: ${res.studentName}\n\nRegister Number: ${res.registerNumber}\n\n${subjectLines}\n\nTotal Number of Arrears: ${arrearsCount}`;
    } else {
      // Mark Statement / Internal Assessment format:
      // Dear Parent,
      //
      // Semester 4 Internal Assessment Result
      //
      // Student Name: MOHANA PRIYA G
      // Register Number: 922524148063
      //
      // Total Marks: 494 / 600
      // Percentage: 82.33%
      //
      // Thank you.
      const { scored, max, percentage } = getStudentMarksAndPercentage(res, batch);
      const examHeader = batch.title
        ? (/result/i.test(batch.title) ? batch.title : `${batch.title} Result`)
        : 'Semester 4 Internal Assessment Result';
      return `Dear Parent,\n\n${examHeader}\n\nStudent Name: ${res.studentName}\nRegister Number: ${res.registerNumber}\n\nTotal Marks: ${scored} / ${max}\nPercentage: ${percentage}%\n\nThank you.`;
    }
  };

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

  const parseRowsToResults = (rawRows: any[][], sourceName?: string) => {
    setError(null);
    if (sourceName) {
      setFileName(sourceName);
      if (!title) {
        const cleanSuggested = sourceName.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
        setTitle(cleanSuggested);
      }
    }

    try {
      if (!rawRows || rawRows.length < 2) {
        setError('Data contains no student rows.');
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
        let overallGradeIdx = -1;
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
          } else if (/^(GPA|CGPA|OVERALL GRADE|GRADE|OVERALL_GRADE|FINAL GRADE)$/.test(upper)) {
            overallGradeIdx = idx;
          } else if (h.length > 0) {
            subjectIndices.push({ idx, name: h });
          }
        });

        // Fallbacks if not explicitly matched
        if (regNoIdx === -1 && headers.length > 1) regNoIdx = 1;
        if (nameIdx === -1 && headers.length > 2) nameIdx = 2;
        if (mobileIdx === -1 && headers.length > 3) mobileIdx = 3;

        const parentList = parents || [];
        const studentList = students || [];
        const parsed: StudentExamResult[] = [];
        let validMob = 0;
        let skippedMob = 0;

        for (let r = headerRowIdx + 1; r < rawRows.length; r++) {
          const row = rawRows[r];
          if (!row || row.length === 0) continue;

          const regNoVal = regNoIdx >= 0 && row[regNoIdx] !== undefined ? String(row[regNoIdx]).trim() : '';
          let nameVal = nameIdx >= 0 && row[nameIdx] !== undefined ? String(row[nameIdx]).trim() : '';
          const rawMobile = mobileIdx >= 0 && row[mobileIdx] !== undefined ? String(row[mobileIdx]).trim().replace(/\D/g, '') : '';

          if (!regNoVal && !nameVal) continue;

          const regUpper = regNoVal.toUpperCase();
          const parentMatch = parentList.find((p) => p.registerNumber.trim().toUpperCase() === regUpper);
          const studentMatch = studentList.find((s) => s.registerNumber.trim().toUpperCase() === regUpper);

          let finalPhone = '';
          let isMatched = false;

          if (parentMatch && parentMatch.parentPhoneNumber) {
            finalPhone = parentMatch.parentPhoneNumber;
            if (!nameVal && parentMatch.studentName) nameVal = parentMatch.studentName;
            isMatched = true;
          } else if (studentMatch && studentMatch.phoneNumber) {
            finalPhone = studentMatch.phoneNumber;
            if (!nameVal && studentMatch.name) nameVal = studentMatch.name;
            isMatched = true;
          } else if (rawMobile && rawMobile.length >= 10) {
            finalPhone = rawMobile.startsWith('91') && rawMobile.length === 12 ? `+${rawMobile}` : `+91${rawMobile.slice(-10)}`;
            isMatched = true;
          }

          if (finalPhone && !finalPhone.startsWith('+')) {
            const digits = finalPhone.replace(/\D/g, '');
            if (digits.length >= 10) {
              finalPhone = digits.startsWith('91') && digits.length === 12 ? `+${digits}` : `+91${digits.slice(-10)}`;
            }
          }

          if (isMatched && finalPhone) {
            validMob++;
          } else {
            skippedMob++;
          }

          const isInternal = uploadResultType === 'Internal Test / Assessment';
          const subjectMarks: SubjectMark[] = [];
          let passedSubjectsCount = 0;
          let failedSubjectsCount = 0;

          subjectIndices.forEach(({ idx, name }) => {
            const rawVal = row[idx] !== undefined && row[idx] !== null ? String(row[idx]).trim() : '';

            if (isInternal) {
              // Internal Mark rule: >= 60 PASS, < 60 FAIL. Validates marks between 0 and 100.
              const evalMark = evaluateInternalMark(rawVal);
              if (evalMark.isFail) {
                failedSubjectsCount++;
              } else {
                passedSubjectsCount++;
              }

              subjectMarks.push({
                subjectCode: name.toUpperCase().slice(0, 12),
                subjectName: name,
                grade: evalMark.gradeStr,
                marks: evalMark.mark,
                maxMarks: 100,
                result: evalMark.result, // strictly 'PASS' or 'FAIL'
              });
            } else {
              // Semester Result: evaluates letter grades or semester marks
              const evalGrade = evaluateSubjectGrade(rawVal);
              if (evalGrade.isFail) {
                failedSubjectsCount++;
              } else {
                passedSubjectsCount++;
              }

              const numMark = !isNaN(Number(evalGrade.gradeStr)) && evalGrade.gradeStr !== '' ? Number(evalGrade.gradeStr) : (evalGrade.isFail ? 0 : 100);

              subjectMarks.push({
                subjectCode: name.toUpperCase().slice(0, 12),
                subjectName: name,
                grade: evalGrade.gradeStr,
                marks: numMark,
                maxMarks: 100,
                result: evalGrade.result,
              });
            }
          });

          // Overall PASS/FAIL logic:
          // For Internal Mark module: strictly auto-calculated from entered marks (no manual selection/override)
          // If all subjects >= 60: PASS. If any subject < 60: FAIL.
          let overallStatus: 'PASS' | 'FAIL' = 'PASS';
          if (isInternal) {
            overallStatus = failedSubjectsCount > 0 ? 'FAIL' : 'PASS';
          } else {
            if (failedSubjectsCount > 0) {
              overallStatus = 'FAIL';
            } else if (resultIdx >= 0 && row[resultIdx] !== undefined && row[resultIdx] !== null && String(row[resultIdx]).trim() !== '') {
              const resStr = String(row[resultIdx]).trim().toUpperCase();
              if (/FAIL|ARREAR|U|RA|ABSENT|WITHHELD/i.test(resStr)) {
                overallStatus = 'FAIL';
              }
            }
          }

          let totalVal: string | number = '';
          if (totalIdx >= 0 && row[totalIdx] !== undefined && row[totalIdx] !== null && String(row[totalIdx]).trim() !== '') {
            totalVal = String(row[totalIdx]).trim();
          }

          let overallGradeVal: string | undefined = undefined;
          if (overallGradeIdx >= 0 && row[overallGradeIdx] !== undefined && row[overallGradeIdx] !== null) {
            overallGradeVal = String(row[overallGradeIdx]).trim();
          }

          parsed.push({
            sNo: sNoIdx >= 0 && row[sNoIdx] !== undefined ? String(row[sNoIdx]).trim() : parsed.length + 1,
            registerNumber: regNoVal,
            studentName: nameVal || `Student ${regNoVal}`,
            phoneNumber: finalPhone,
            department: department,
            subjects: subjectMarks,
            passedSubjectsCount,
            failedSubjectsCount,
            totalMarks: totalVal,
            overallGrade: overallGradeVal,
            overallStatus,
            smsSent: false,
            matchedParent: isMatched && Boolean(finalPhone),
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
        console.error('Error parsing sheet rows:', err);
        setError(`Failed to parse rows: ${formatErrorMessage(err)}`);
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
        parseRowsToResults(rawRows, file.name);
      } catch (err: any) {
        setError(`Failed to parse Excel file: ${formatErrorMessage(err)}`);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleGoogleSheetDataLoaded = (rows: any[][], sheetTitle: string, spreadsheetName: string) => {
    parseRowsToResults(rows, `${spreadsheetName} - ${sheetTitle}`);
    setSuccessMsg(`✓ Successfully loaded ${rows.length - 1} student rows from Google Sheet "${spreadsheetName} (${sheetTitle})"! Review and click Create Exam Batch below.`);
  };

  // --- Download Sample Excel Template ---
  const downloadSampleTemplate = () => {
    let sampleData: any[][];

    if (uploadResultType === 'Semester Result') {
      sampleData = [
        ['S.NO', 'REGISTER NUMBER', 'STUDENT NAME', 'DATA STRUCTURES', 'MATHEMATICS III', 'DATABASE SYSTEMS', 'OPERATING SYSTEMS', 'OVERALL RESULT', 'OVERALL GRADE'],
        [1, '921321104001', 'S. Ananya', 'A+', 'O', 'A', 'A+', 'PASS', 'O'],
        [2, '921321104002', 'K. Vignesh', 'O', 'A+', 'O', 'A', 'PASS', 'A+'],
        [3, '921321104003', 'M. Karthik', 'F', 'B+', 'RA', 'U', 'FAIL', 'F'],
      ];
    } else {
      sampleData = [
        ['S.NO', 'REGISTER NUMBER', 'STUDENT NAME', 'DATA STRUCTURES', 'MATHEMATICS III', 'DATABASE SYSTEMS', 'OPERATING SYSTEMS', 'OVERALL RESULT'],
        [1, '921321104001', 'S. Ananya', 85, 92, 78, 90, 'PASS'],
        [2, '921321104002', 'K. Vignesh', 95, 60, 75, 100, 'PASS'],
        [3, '921321104003', 'M. Karthik', 59, 62, 50, 75, 'FAIL'],
      ];
    }

    const ws = XLSX.utils.aoa_to_sheet(sampleData);
    const wb = XLSX.utils.book_new();
    const sheetName = uploadResultType === 'Semester Result' ? 'Semester_Grade_Results' : 'Assessment_Marks_Results';
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    const fileName = uploadResultType === 'Semester Result'
      ? 'VSB_Semester_Grade_Results_Template.xlsx'
      : 'VSB_Internal_Assessment_Marks_Template.xlsx';
    XLSX.writeFile(wb, fileName);
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
      const isInternal = uploadResultType === 'Internal Test / Assessment';

      lines.forEach((line, idx) => {
        const parts = line.split(/,|\t/).map((p) => p.trim());
        if (parts.length >= 3) {
          const regNo = parts[0];
          const name = parts[1];
          const phone = parts[2] || '';
          const totalVal = parts[3] || 'N/A';

          let status: 'PASS' | 'FAIL' = 'PASS';
          let numMark = 85;

          if (isInternal) {
            const rawNum = Number(totalVal);
            if (!isNaN(rawNum)) {
              const evalRes = evaluateInternalMark(rawNum);
              numMark = evalRes.mark;
              status = evalRes.result;
            } else {
              status = (parts[4]?.toUpperCase() as any) === 'FAIL' ? 'FAIL' : 'PASS';
              numMark = status === 'PASS' ? 85 : 50;
            }
          } else {
            status = (parts[4]?.toUpperCase() as any) === 'FAIL' ? 'FAIL' : 'PASS';
            numMark = status === 'PASS' ? 85 : 35;
          }

          finalResults.push({
            sNo: idx + 1,
            registerNumber: regNo,
            studentName: name,
            phoneNumber: phone ? (phone.startsWith('+91') ? phone : `+91${phone.replace(/\D/g, '').slice(-10)}`) : '',
            department: department,
            subjects: [
              {
                subjectCode: isInternal ? 'INT-01' : 'EXAM-01',
                subjectName: isInternal ? 'Internal Assessment' : 'Semester Exam',
                marks: numMark,
                maxMarks: 100,
                result: status,
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
        resultType: uploadResultType,
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
      console.log(err);
      if (err?.message) console.log(err.message);
      if (err?.response?.data) console.log(err.response?.data);
      setError(formatErrorMessage(err));
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
  const handleSendResultSms = async (batchId: string, targetRegNos?: string[]) => {
    setError(null);
    setSendingSmsBatchId(batchId);

    try {
      const res = await api.sendResultSms(batchId, targetRegNos);
      setSuccessMsg(`Dispatched Exam Result SMS via Fast2SMS to ${res.sentCount} parents! (${res.failedCount} failed)`);
      onRefresh();
      if (selectedBatch && selectedBatch.id === batchId) {
        setSelectedBatch(res.batch);
      }
      setSelectedRegNos([]);
      setTimeout(() => setSuccessMsg(null), 5000);
    } catch (err: any) {
      console.log(err);
      if (err?.message) console.log(err.message);
      if (err?.response?.data) console.log(err.response?.data);
      setError(formatErrorMessage(err));
    } finally {
      setSendingSmsBatchId(null);
    }
  };

  // --- Handle Print Report ---
  const handlePrintReport = () => {
    if (!selectedBatch) return;

    try {
      const printWin = window.open('', '_blank');
      if (printWin) {
        const isSemester = (selectedBatch.resultType || 'Semester Result') === 'Semester Result';
        const allSubjects = Array.from(
          new Set(
            selectedBatch.results.flatMap((r) =>
              (r.subjects || []).map((s) => (s.subjectName || s.subjectCode || 'Subject').trim())
            )
          )
        );

        const subjectHeadersHtml = isSemester
          ? allSubjects.map((sName) => `<th style="text-align: center;">${sName}</th>`).join('') + `<th style="text-align: center;">Total Arrears</th>`
          : `<th>Total Marks</th>`;

        const studentRows = selectedBatch.results
          .map((r, i) => {
            let middleCells = '';
            if (isSemester) {
              let arrearsCount = 0;
              if (typeof r.failedSubjectsCount === 'number') {
                arrearsCount = r.failedSubjectsCount;
              } else if (r.subjects && r.subjects.length > 0) {
                arrearsCount = r.subjects.filter((s) => evaluateSubjectGrade(s.grade || s.result).isFail).length;
              }

              const subjectCells = allSubjects
                .map((sName) => {
                  const sub = (r.subjects || []).find(
                    (s) => (s.subjectName || s.subjectCode || '').trim() === sName
                  );
                  const rawGrade = sub
                    ? sub.grade !== undefined && sub.grade !== null && sub.grade !== ''
                      ? sub.grade
                      : sub.result || '-'
                    : '-';
                  const evalGrade = evaluateSubjectGrade(rawGrade);
                  return `<td style="border: 1px solid #cbd5e1; padding: 6px; text-align: center; font-weight: bold; color: ${
                    evalGrade.isFail ? '#b91c1c' : '#047857'
                  };">${evalGrade.gradeStr}</td>`;
                })
                .join('');

              middleCells = `${subjectCells}<td style="border: 1px solid #cbd5e1; padding: 6px; text-align: center; font-weight: bold; color: ${
                arrearsCount > 0 ? '#b91c1c' : '#047857'
              };">${arrearsCount}</td>`;
            } else {
              const totalDisplay =
                r.totalMarks !== undefined && r.totalMarks !== null && r.totalMarks !== ''
                  ? r.totalMarks
                  : r.subjects
                  ? r.subjects.reduce((sum, s) => sum + s.marks, 0)
                  : 'N/A';
              middleCells = `<td style="border: 1px solid #cbd5e1; padding: 6px; text-align: center; font-weight: bold;">${totalDisplay}</td>`;
            }

            return `
              <tr>
                <td style="border: 1px solid #cbd5e1; padding: 6px; text-align: center;">${r.sNo || i + 1}</td>
                <td style="border: 1px solid #cbd5e1; padding: 6px; font-weight: bold;">${r.registerNumber}</td>
                <td style="border: 1px solid #cbd5e1; padding: 6px;">${r.studentName}</td>
                <td style="border: 1px solid #cbd5e1; padding: 6px;">${r.phoneNumber || 'N/A'}</td>
                ${middleCells}
                <td style="border: 1px solid #cbd5e1; padding: 6px; text-align: center; font-weight: bold; color: ${r.overallStatus === 'PASS' ? '#047857' : '#b91c1c'};">${r.overallStatus}</td>
                <td style="border: 1px solid #cbd5e1; padding: 6px; text-align: center;">${r.smsStatus || (r.smsSent ? 'Sent' : 'Pending')}</td>
              </tr>
            `;
          })
          .join('');

        printWin.document.write(`
          <!DOCTYPE html>
          <html>
            <head>
              <title>${selectedBatch.title} - Official Exam Result Report</title>
              <style>
                body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 24px; color: #0f172a; }
                .header { text-align: center; border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 20px; }
                .header h2 { margin: 0; font-size: 14px; color: #d97706; text-transform: uppercase; letter-spacing: 1px; }
                .header h1 { margin: 4px 0; font-size: 20px; color: #0f172a; text-transform: uppercase; }
                .meta { display: flex; justify-content: space-between; font-size: 12px; background: #f8fafc; padding: 12px; border: 1px solid #e2e8f0; margin-bottom: 20px; }
                table { width: 100%; border-collapse: collapse; font-size: 12px; }
                th { background: #0f172a; color: #fbbf24; padding: 8px; text-align: left; text-transform: uppercase; font-size: 11px; }
                .footer { margin-top: 40px; display: flex; justify-content: space-between; align-items: flex-end; font-size: 12px; }
              </style>
            </head>
            <body>
              <div class="header">
                <h2>VSB ENGINEERING COLLEGE • VY NEXTGEN TECHNOLOGY</h2>
                <h1>DEPARTMENT OF ${cleanDepartmentDisplay(selectedBatch.department)} - EXAM RESULT REPORT</h1>
                <p style="margin: 4px 0 0 0; font-size: 12px; font-weight: bold;">${cleanTitleDisplay(selectedBatch.title)} | Exam Date: ${selectedBatch.examDate}</p>
              </div>
              <div class="meta">
                <div>Total Students: <strong>${selectedBatch.totalStudents}</strong></div>
                <div>Pass Rate: <strong>${batchStats ? batchStats.passRate : 'N/A'}%</strong></div>
                <div>Uploaded By: <strong>${selectedBatch.uploadedBy}</strong></div>
                <div>Report Date: <strong>${new Date().toLocaleDateString()}</strong></div>
              </div>
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Register Number</th>
                    <th>Student Name</th>
                    <th>Parent Phone</th>
                    ${subjectHeadersHtml}
                    <th>Result Status</th>
                    <th>SMS Delivery</th>
                  </tr>
                </thead>
                <tbody>
                  ${studentRows}
                </tbody>
              </table>
              <div class="footer">
                <div>Generated via VSBEC Result SMS Management System</div>
                <div style="text-align: right;">
                  <p>HOD / Principal Signature</p>
                  <p>___________________________</p>
                </div>
              </div>
              <script>
                window.onload = function() {
                  window.print();
                };
              </script>
            </body>
          </html>
        `);
        printWin.document.close();
        return;
      }
    } catch (e) {
      console.warn('Popup window error or blocked:', e);
    }

    // Fallback: Show Print Modal
    setShowPrintModal(true);
  };

  // --- Download Internal Assessment Report (Excel) with standardized columns ---
  const downloadExcelReport = (batch: ExamBatch) => {
    const excelRows = batch.results.map((r, i) => {
      const details = getStudentAssessmentDetails(batch, r, i);
      const subjectMarksStr = details.subjects
        .map((s) => `${s.name}: ${s.marks}/${s.maxMarks} (${s.result})`)
        .join(', ');

      return {
        'Serial No': details.serialNo,
        'Register Number': details.registerNumber,
        'Student Name': details.studentName,
        'Parent Mobile Number': details.parentMobile,
        'Department': details.department,
        'Assessment Date': details.assessmentDate,
        'Semester': details.semester,
        'Academic Year': details.academicYear,
        'Subject-wise Internal Assessment Marks': subjectMarksStr,
        'Total Marks': details.totalMarksDisplay,
        'Percentage': details.percentageDisplay,
        'Overall Result': details.overallStatus,
        'Remarks': details.remarks,
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(excelRows);
    worksheet['!cols'] = [
      { wch: 10 }, // Serial No
      { wch: 18 }, // Register Number
      { wch: 26 }, // Student Name
      { wch: 22 }, // Parent Mobile Number
      { wch: 20 }, // Department
      { wch: 16 }, // Assessment Date
      { wch: 14 }, // Semester
      { wch: 16 }, // Academic Year
      { wch: 55 }, // Subject-wise Internal Assessment Marks
      { wch: 16 }, // Total Marks
      { wch: 14 }, // Percentage
      { wch: 14 }, // Overall Result
      { wch: 45 }, // Remarks
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Internal Assessment Report');
    const fileName = `${batch.title.replace(/\s+/g, '_')}_Internal_Assessment_Report.xlsx`;
    XLSX.writeFile(workbook, fileName);
  };

  // --- Download Internal Assessment Report (PDF) with Exact Multi-line Cards ---
  const downloadPdfReport = (batch: ExamBatch) => {
    try {
      const doc = new jsPDF({
        orientation: 'p',
        unit: 'mm',
        format: 'a4',
      });

      const pageWidth = 210;
      const pageHeight = 297;
      const margin = 14;
      const contentWidth = pageWidth - margin * 2;
      const bottomLimit = pageHeight - 20;

      const drawHeader = () => {
        doc.setFillColor(15, 23, 42);
        doc.rect(0, 0, pageWidth, 24, 'F');

        doc.setFillColor(37, 99, 235);
        doc.rect(0, 0, pageWidth, 2, 'F');

        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(13);
        doc.text('VSB ENGINEERING COLLEGE', margin, 10);

        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(203, 213, 225);
        doc.text(`INTERNAL ASSESSMENT REPORT • DEPARTMENT OF ${cleanDepartmentDisplay(batch.department).toUpperCase()} • ${cleanTitleDisplay(batch.title).toUpperCase()}`, margin, 16);

        doc.setFontSize(7.5);
        doc.setTextColor(148, 163, 184);
        doc.text(`Generated: ${new Date().toLocaleString()}`, pageWidth - margin, 16, { align: 'right' });
      };

      let currentY = 30;
      drawHeader();

      // Summary Banner
      doc.setFillColor(241, 245, 249);
      doc.setDrawColor(203, 213, 225);
      doc.roundedRect(margin, currentY, contentWidth, 18, 1.5, 1.5, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(15, 23, 42);
      doc.text(`INTERNAL ASSESSMENT BATCH: ${cleanTitleDisplay(batch.title)} • ${batch.results.length} STUDENT RECORDS`, margin + 4, currentY + 6);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(71, 85, 105);
      doc.text(`Department: ${cleanDepartmentDisplay(batch.department)} | Academic Year: ${batch.academicYear || '2025-2026'} | Assessment Date: ${batch.examDate || '2026-02-15'}`, margin + 4, currentY + 11);
      doc.text(`Total Students: ${batch.results.length} | Uploaded by: ${batch.uploadedBy}`, margin + 4, currentY + 15);

      currentY += 23;

      batch.results.forEach((r, i) => {
        const details = getStudentAssessmentDetails(batch, r, i);

        // Calculate card height based on subjects
        const subjectRowsCount = details.subjects.length;
        const subjectsBlockHeight = Math.max(16, subjectRowsCount * 4.5 + 4);
        const cardHeaderHeight = 7;
        const metadataHeight = 18;
        const summaryBlockHeight = 16;
        const remarksHeight = 10;
        const cardTotalHeight = cardHeaderHeight + metadataHeight + 5 + subjectsBlockHeight + summaryBlockHeight + remarksHeight + 5;

        if (currentY + cardTotalHeight > bottomLimit) {
          doc.addPage();
          drawHeader();
          currentY = 30;
        }

        const cardStartY = currentY;

        // Card Border & Background
        doc.setFillColor(248, 250, 252);
        doc.setDrawColor(203, 213, 225);
        doc.setLineWidth(0.3);
        doc.roundedRect(margin, cardStartY, contentWidth, cardTotalHeight, 1.5, 1.5, 'FD');

        // Card Header Bar
        doc.setFillColor(15, 23, 42);
        doc.roundedRect(margin, cardStartY, contentWidth, cardHeaderHeight, 1.5, 1.5, 'F');
        doc.rect(margin, cardStartY + cardHeaderHeight - 1.5, contentWidth, 1.5, 'F');

        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.text(`INTERNAL ASSESSMENT REPORT — SERIAL NO: ${details.serialNo}`, margin + 4, cardStartY + 4.8);

        // Student Info 2 Columns
        let metaY = cardStartY + cardHeaderHeight + 4.5;
        doc.setFontSize(7.5);
        const col1X = margin + 4;
        const col2X = margin + (contentWidth / 2) + 2;

        // Col 1: Register Number, Student Name, Parent Mobile Number
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(71, 85, 105);
        doc.text('Register Number:', col1X, metaY);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(29, 78, 216);
        doc.text(details.registerNumber, col1X + 34, metaY);

        doc.setFont('helvetica', 'bold');
        doc.setTextColor(71, 85, 105);
        doc.text('Student Name:', col1X, metaY + 4.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(15, 23, 42);
        doc.text(details.studentName, col1X + 34, metaY + 4.5);

        doc.setFont('helvetica', 'bold');
        doc.setTextColor(71, 85, 105);
        doc.text('Parent Mobile Number:', col1X, metaY + 9);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(15, 23, 42);
        doc.text(details.parentMobile, col1X + 34, metaY + 9);

        // Col 2: Department, Assessment Date, Semester, Academic Year
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(71, 85, 105);
        doc.text('Department:', col2X, metaY);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(15, 23, 42);
        doc.text(details.department, col2X + 28, metaY);

        doc.setFont('helvetica', 'bold');
        doc.setTextColor(71, 85, 105);
        doc.text('Assessment Date:', col2X, metaY + 4.5);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(15, 23, 42);
        doc.text(details.assessmentDate, col2X + 28, metaY + 4.5);

        doc.setFont('helvetica', 'bold');
        doc.setTextColor(71, 85, 105);
        doc.text('Semester / Year:', col2X, metaY + 9);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(15, 23, 42);
        doc.text(`${details.semester} (${details.academicYear})`, col2X + 28, metaY + 9);

        // Divider
        const dividerY = metaY + 13;
        doc.setDrawColor(226, 232, 240);
        doc.line(margin + 4, dividerY, margin + contentWidth - 4, dividerY);

        // Section Title: "INTERNAL ASSESSMENT DETAILS"
        const sectionTitleY = dividerY + 4.5;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(15, 23, 42);
        doc.text('INTERNAL ASSESSMENT DETAILS', margin + 4, sectionTitleY);

        // Subjects Table / Details Box
        const subjBoxY = sectionTitleY + 2;
        doc.setFillColor(255, 255, 255);
        doc.setDrawColor(203, 213, 225);
        doc.roundedRect(margin + 4, subjBoxY, contentWidth - 8, subjectsBlockHeight, 1, 1, 'FD');

        // Subject Table Header (NO GRADE)
        doc.setFillColor(241, 245, 249);
        doc.rect(margin + 4.5, subjBoxY + 0.5, contentWidth - 9, 4, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.5);
        doc.setTextColor(71, 85, 105);
        doc.text('SUBJECT CODE & NAME', margin + 6, subjBoxY + 3.2);
        doc.text('MARKS SCORED', margin + 115, subjBoxY + 3.2);
        doc.text('MAX MARKS', margin + 140, subjBoxY + 3.2);
        doc.text('RESULT', margin + 165, subjBoxY + 3.2);

        // Subject Table Rows (NO GRADE)
        let subRowY = subjBoxY + 7.5;
        details.subjects.forEach((s) => {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(7);
          doc.setTextColor(15, 23, 42);
          doc.text(`${s.code} - ${s.name}`, margin + 6, subRowY);

          doc.setFont('helvetica', 'bold');
          doc.text(String(s.marks), margin + 117, subRowY);

          doc.setFont('helvetica', 'normal');
          doc.setTextColor(100, 116, 139);
          doc.text(String(s.maxMarks), margin + 142, subRowY);

          if (s.isPass) {
            doc.setTextColor(5, 150, 105);
          } else {
            doc.setTextColor(225, 29, 72);
          }
          doc.setFont('helvetica', 'bold');
          doc.text(s.result, margin + 166, subRowY);

          subRowY += 4.5;
        });

        // Summary Bar (Total Marks, Percentage, Overall Status) - NO GRADE, NO ATTENDANCE
        const summaryY = subjBoxY + subjectsBlockHeight + 2;
        doc.setFillColor(248, 250, 252);
        doc.setDrawColor(226, 232, 240);
        doc.roundedRect(margin + 4, summaryY, contentWidth - 8, 8, 1, 1, 'FD');

        doc.setFontSize(7.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(71, 85, 105);
        doc.text('Total Marks:', margin + 6, summaryY + 5.2);
        doc.setTextColor(15, 23, 42);
        doc.text(details.totalMarksDisplay, margin + 24, summaryY + 5.2);

        doc.setTextColor(71, 85, 105);
        doc.text('Percentage:', margin + 65, summaryY + 5.2);
        doc.setTextColor(15, 23, 42);
        doc.text(details.percentageDisplay, margin + 84, summaryY + 5.2);

        doc.setTextColor(71, 85, 105);
        doc.text('Overall Status:', margin + 125, summaryY + 5.2);
        if (details.overallStatus === 'PASS') {
          doc.setTextColor(5, 150, 105);
        } else {
          doc.setTextColor(225, 29, 72);
        }
        doc.text(details.overallStatus, margin + 148, summaryY + 5.2);

        // Remarks Box
        const remarksBoxY = summaryY + 10;
        doc.setFillColor(255, 255, 255);
        doc.setDrawColor(226, 232, 240);
        doc.roundedRect(margin + 4, remarksBoxY, contentWidth - 8, 6, 1, 1, 'FD');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7);
        doc.setTextColor(71, 85, 105);
        doc.text('Remarks:', margin + 6, remarksBoxY + 4);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(15, 23, 42);
        doc.text(details.remarks, margin + 20, remarksBoxY + 4);

        currentY = cardStartY + cardTotalHeight + 4;
      });

      const totalPages = doc.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setDrawColor(226, 232, 240);
        doc.line(margin, 287, pageWidth - margin, 287);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(148, 163, 184);
        doc.text(`VSB ENGINEERING COLLEGE • INTERNAL ASSESSMENT REPORT • ${cleanDepartmentDisplay(batch.department)}`, margin, 292);
        doc.text(`Page ${i} of ${totalPages}`, pageWidth - margin, 292, { align: 'right' });
      }

      const dateStamp = new Date().toISOString().split('T')[0];
      doc.save(`${batch.title.replace(/\s+/g, '_')}_Internal_Assessment_Report_${dateStamp}.pdf`);
    } catch (err: any) {
      console.error('PDF Generation Error:', err);
      alert(`Failed to generate PDF: ${err.message || 'Unknown error'}`);
    }
  };

  // --- Download CSV Report ---
  const downloadCsvReport = (batch: ExamBatch) => {
    const headers = [
      'SERIAL NO',
      'REGISTER NUMBER',
      'STUDENT NAME',
      'PARENT MOBILE NUMBER',
      'DEPARTMENT',
      'ASSESSMENT DATE',
      'SEMESTER',
      'ACADEMIC YEAR',
      'SUBJECT-WISE MARKS',
      'TOTAL MARKS',
      'PERCENTAGE',
      'OVERALL RESULT',
      'REMARKS',
    ];

    const rows = batch.results.map((r, i) => {
      const details = getStudentAssessmentDetails(batch, r, i);
      const subjectMarksStr = details.subjects
        .map((s) => `${s.name}: ${s.marks}/${s.maxMarks} (${s.result})`)
        .join('; ');

      return [
        details.serialNo,
        `"${details.registerNumber}"`,
        `"${details.studentName}"`,
        `"${details.parentMobile}"`,
        `"${details.department}"`,
        `"${details.assessmentDate}"`,
        `"${details.semester}"`,
        `"${details.academicYear}"`,
        `"${subjectMarksStr}"`,
        `"${details.totalMarksDisplay}"`,
        `"${details.percentageDisplay}"`,
        `"${details.overallStatus}"`,
        `"${details.remarks}"`,
      ].join(',');
    });

    const csvContent =
      'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `${batch.title.replace(/\s+/g, '_')}_Internal_Assessment_Report.csv`);
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

    const isInternalBatch = (selectedBatch.resultType || 'Semester Result') === 'Internal Test / Assessment';

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
          const isPass = isInternalBatch
            ? s.marks >= 60
            : (s.result === 'PASS' || evaluateSubjectGrade(s.grade).isPass);
          if (isPass) {
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
            <span>{typeof error === 'string' ? error : formatErrorMessage(error)}</span>
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
                    onClick={() => {
                      setSelectedBatch(batch);
                      try { localStorage.setItem('vsbec_active_exam_batch_id', batch.id); } catch (e) {}
                    }}
                    className={`p-4 rounded-sm border cursor-pointer transition-all space-y-3 ${
                      isSelected
                        ? 'bg-slate-900 text-white border-amber-500/80 shadow-md'
                        : 'bg-white border-slate-200 hover:border-slate-300 text-slate-900'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className={`font-black text-sm uppercase tracking-tight ${isSelected ? 'text-white' : 'text-slate-900'}`}>
                          {cleanTitleDisplay(batch.title)}
                        </h4>
                        <div className="flex flex-wrap items-center gap-1.5 text-xs mt-1 font-medium opacity-80">
                          <span className={`px-2 py-0.5 rounded-sm text-[10px] font-black uppercase ${isSelected ? 'bg-amber-400 text-slate-950' : 'bg-slate-900 text-white'}`}>
                            {cleanDepartmentDisplay(batch.department)}
                          </span>
                          <span className={`px-2 py-0.5 rounded-sm text-[10px] font-black uppercase ${
                            (batch.resultType || 'Semester Result') === 'Semester Result'
                              ? isSelected ? 'bg-purple-900 text-purple-200 border border-purple-700' : 'bg-purple-100 text-purple-800'
                              : isSelected ? 'bg-cyan-900 text-cyan-200 border border-cyan-700' : 'bg-cyan-100 text-cyan-800'
                          }`}>
                            {(batch.resultType || 'Semester Result') === 'Semester Result' ? 'Semester Grade' : 'Internal Marks'}
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

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedBatch(batch);
                            if (selectedRegNos.length > 0 && selectedBatch?.id === batch.id) {
                              setShowSmsConfirmModal(true);
                            } else {
                              const allRegs = batch.results.map((r) => r.registerNumber);
                              setSelectedRegNos(allRegs);
                              setShowSmsConfirmModal(true);
                            }
                          }}
                          disabled={isSending}
                          className={`px-2.5 py-1.5 font-black text-[10px] uppercase tracking-wider rounded-sm transition-all flex items-center gap-1 shadow disabled:opacity-50 ${
                            isSelected
                              ? 'bg-amber-400 hover:bg-amber-300 text-slate-950'
                              : 'bg-[#0f172a] hover:bg-blue-600 text-white'
                          }`}
                        >
                          <Send className="w-3 h-3" />
                          <span>{isSending ? 'Sending...' : 'Send SMS'}</span>
                        </button>

                        {canDeleteBatch(batch) && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setBatchToDelete(batch);
                            }}
                            className={`p-1.5 font-black text-[10px] uppercase tracking-wider rounded-sm transition-all flex items-center gap-1 shadow hover:bg-rose-600 hover:text-white ${
                              isSelected
                                ? 'bg-rose-500/80 text-white hover:bg-rose-600'
                                : 'bg-rose-100 text-rose-800 hover:bg-rose-600 hover:text-white border border-rose-200'
                            }`}
                            title="Delete Exam Batch"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
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
                      DEPARTMENT OF {cleanDepartmentDisplay(selectedBatch.department)}
                    </span>
                    <span className="text-xs text-slate-500 font-bold">• Exam Date: {selectedBatch.examDate}</span>
                  </div>
                  <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">{cleanTitleDisplay(selectedBatch.title)}</h3>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">
                    Uploaded by <strong className="text-slate-800 font-black">{selectedBatch.uploadedBy}</strong> on {new Date(selectedBatch.uploadedAt).toLocaleString()}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    id="export-excel-report-btn"
                    onClick={() => downloadExcelReport(selectedBatch)}
                    className="px-3.5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-black text-xs uppercase tracking-wider rounded-sm shadow-sm flex items-center gap-1.5 transition-all cursor-pointer"
                    title="Download Internal Assessment Report in Excel (.xlsx) format"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-200" />
                    <span>Download Report (Excel)</span>
                  </button>

                  <button
                    id="export-google-sheets-btn"
                    onClick={() => setShowGoogleSheetsExportModal(true)}
                    className="px-3.5 py-2 bg-emerald-800 hover:bg-emerald-900 text-white font-black text-xs uppercase tracking-wider rounded-sm shadow-sm flex items-center gap-1.5 transition-all cursor-pointer border border-emerald-600/40"
                    title="Export assessment results to Google Sheets in your Google Drive"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-300" />
                    <span>Export to Google Sheets</span>
                  </button>

                  <button
                    id="export-pdf-report-btn"
                    onClick={() => downloadPdfReport(selectedBatch)}
                    className="px-3.5 py-2 bg-[#0f172a] hover:bg-slate-800 text-white font-black text-xs uppercase tracking-wider rounded-sm shadow-sm flex items-center gap-1.5 transition-all cursor-pointer"
                    title="Download Internal Assessment Report in PDF format"
                  >
                    <Download className="w-3.5 h-3.5 text-blue-400" />
                    <span>Download Report (PDF)</span>
                  </button>

                  <button
                    id="print-report-btn"
                    onClick={handlePrintReport}
                    className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-black text-xs uppercase tracking-wider rounded-sm border border-slate-300 flex items-center gap-1.5 transition-all cursor-pointer"
                    title="Print generated Internal Assessment Report"
                  >
                    <Printer className="w-3.5 h-3.5 text-slate-700" />
                    <span>Print Report</span>
                  </button>

                  <button
                    id="export-csv-report-btn"
                    onClick={() => downloadCsvReport(selectedBatch)}
                    className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-black text-xs uppercase tracking-wider rounded-sm border border-slate-300 flex items-center gap-1.5 transition-all cursor-pointer"
                    title="Download complete Internal Assessment Report in CSV format"
                  >
                    <Download className="w-3.5 h-3.5 text-slate-700" />
                    <span>Report (CSV)</span>
                  </button>

                  <button
                    id="dispatch-selected-sms-btn"
                    onClick={() => {
                      if (selectedRegNos.length === 0) {
                        setError('Please select at least one student.');
                        return;
                      }
                      setShowSmsConfirmModal(true);
                    }}
                    disabled={sendingSmsBatchId === selectedBatch.id}
                    className="px-4 py-2 font-black rounded-sm text-xs uppercase tracking-widest flex items-center gap-2 shadow-md transition-all cursor-pointer bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50"
                  >
                    <Send className="w-4 h-4" />
                    <span>
                      {sendingSmsBatchId === selectedBatch.id
                        ? 'Sending SMS...'
                        : `SEND SMS TO SELECTED STUDENTS (${selectedRegNos.length})`}
                    </span>
                  </button>

                  {canDeleteBatch(selectedBatch) && (
                    <button
                      id="delete-selected-batch-btn"
                      onClick={() => setBatchToDelete(selectedBatch)}
                      className="px-3.5 py-2 bg-rose-600 hover:bg-rose-700 text-white font-black text-xs uppercase tracking-wider rounded-sm flex items-center gap-1.5 shadow-sm transition-all border border-rose-700/50"
                      title="Permanently delete this exam batch and its result records"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-white" />
                      <span>Delete</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Executive KPI Summary Cards */}
              {batchStats && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-sm space-y-1">
                    <span className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Total Evaluated</span>
                    <div className="text-xl font-black text-slate-900">{batchStats.total} Students</div>
                    <span className="text-[10px] font-medium text-slate-500">Department of {cleanDepartmentDisplay(selectedBatch.department)}</span>
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
                  id="tab-student-list-overview"
                  onClick={() => setReportViewTab('overview')}
                  className={`flex-1 py-2 font-black uppercase tracking-wider text-xs rounded-sm transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    reportViewTab === 'overview'
                      ? 'bg-[#0f172a] text-amber-400 shadow-xs ring-1 ring-amber-400/40'
                      : 'text-slate-600 hover:text-slate-950 hover:bg-slate-200'
                  }`}
                >
                  <Users className="w-4 h-4 text-amber-400" />
                  <span>Student List & SMS Selection</span>
                </button>

                <button
                  type="button"
                  id="tab-assessment-cards"
                  onClick={() => setReportViewTab('assessment_cards')}
                  className={`flex-1 py-2 font-black uppercase tracking-wider text-xs rounded-sm transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    reportViewTab === 'assessment_cards'
                      ? 'bg-[#0f172a] text-amber-400 shadow-xs ring-1 ring-amber-400/40'
                      : 'text-slate-600 hover:text-slate-950 hover:bg-slate-200'
                  }`}
                >
                  <FileText className="w-4 h-4" />
                  <span>Internal Assessment Report Cards</span>
                </button>

                <button
                  type="button"
                  id="tab-subject-analysis"
                  onClick={() => setReportViewTab('subjects')}
                  className={`flex-1 py-2 font-black uppercase tracking-wider text-xs rounded-sm transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    reportViewTab === 'subjects'
                      ? 'bg-[#0f172a] text-amber-400 shadow-xs ring-1 ring-amber-400/40'
                      : 'text-slate-600 hover:text-slate-950 hover:bg-slate-200'
                  }`}
                >
                  <TrendingUp className="w-4 h-4" />
                  <span>Subject-Wise Pass Analysis</span>
                </button>
              </div>

              {/* Internal Assessment Cards Tab Content */}
              {reportViewTab === 'assessment_cards' && (
                <div className="space-y-6 animate-in fade-in duration-150">
                  {/* Search & Filter Bar */}
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-50 p-3 border border-slate-200 rounded-sm">
                    <div className="relative w-full sm:w-72">
                      <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search Name or Reg Number..."
                        className="w-full pl-9 pr-3 py-1.5 bg-white border border-slate-300 rounded-sm text-xs font-bold text-slate-900 focus:outline-none focus:border-amber-500"
                      />
                    </div>

                    <div className="flex items-center space-x-1 overflow-x-auto w-full sm:w-auto">
                      {(['ALL', 'PASS', 'FAIL'] as const).map((st) => (
                        <button
                          key={st}
                          onClick={() => setFilterStatus(st)}
                          className={`px-3 py-1 text-[10px] font-black uppercase tracking-wider rounded-sm transition-all whitespace-nowrap ${
                            filterStatus === st
                              ? 'bg-[#0f172a] text-amber-400 shadow-xs'
                              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          {st}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Assessment Cards Grid / List */}
                  <div className="space-y-5">
                    {filteredStudents.length > 0 ? (
                      filteredStudents.map((r, i) => {
                        const details = getStudentAssessmentDetails(selectedBatch, r, i);
                        return (
                          <div
                            key={r.registerNumber || i}
                            className="bg-white border border-slate-300 rounded-sm shadow-xs overflow-hidden"
                          >
                            {/* Card Header Bar (No SMS, No Pending status) */}
                            <div className="bg-[#0f172a] text-white px-4 py-2.5 flex items-center justify-between border-b border-slate-800">
                              <h4 className="font-black text-xs uppercase tracking-widest text-amber-400">
                                INTERNAL ASSESSMENT REPORT — SERIAL NO: {details.serialNo}
                              </h4>
                              <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-sm ${
                                details.overallStatus === 'PASS' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                              }`}>
                                {details.overallStatus}
                              </span>
                            </div>

                            <div className="p-4 space-y-4">
                              {/* Student Information (Two Columns) */}
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-y-2.5 gap-x-6 text-xs border-b border-slate-200 pb-4">
                                <div className="space-y-2">
                                  <div className="flex items-center justify-between">
                                    <span className="font-bold text-slate-500 uppercase text-[11px]">Register Number:</span>
                                    <span className="font-black text-blue-700 font-mono text-sm">{details.registerNumber}</span>
                                  </div>
                                  <div className="flex items-center justify-between">
                                    <span className="font-bold text-slate-500 uppercase text-[11px]">Student Name:</span>
                                    <span className="font-black text-slate-900">{details.studentName}</span>
                                  </div>
                                  <div className="flex items-center justify-between">
                                    <span className="font-bold text-slate-500 uppercase text-[11px]">Parent Mobile Number:</span>
                                    <span className="font-mono font-bold text-slate-800">{details.parentMobile}</span>
                                  </div>
                                  <div className="flex items-center justify-between">
                                    <span className="font-bold text-slate-500 uppercase text-[11px]">Department:</span>
                                    <span className="font-black text-slate-900 uppercase">CSE(AIML)</span>
                                  </div>
                                </div>

                                <div className="space-y-2">
                                  <div className="flex items-center justify-between">
                                    <span className="font-bold text-slate-500 uppercase text-[11px]">Assessment Date:</span>
                                    <span className="font-bold text-slate-800">{details.assessmentDate}</span>
                                  </div>
                                  <div className="flex items-center justify-between">
                                    <span className="font-bold text-slate-500 uppercase text-[11px]">Semester:</span>
                                    <span className="font-bold text-slate-800">{details.semester}</span>
                                  </div>
                                  <div className="flex items-center justify-between">
                                    <span className="font-bold text-slate-500 uppercase text-[11px]">Academic Year:</span>
                                    <span className="font-bold text-slate-800">{details.academicYear}</span>
                                  </div>
                                </div>
                              </div>

                              {/* Internal Assessment Details Section */}
                              <div className="space-y-2">
                                <h5 className="font-black text-xs uppercase tracking-wider text-slate-900">
                                  INTERNAL ASSESSMENT DETAILS
                                </h5>

                                <div className="overflow-x-auto border border-slate-200 rounded-sm">
                                  <table className="w-full text-left text-xs">
                                    <thead className="bg-slate-100 text-slate-700 uppercase text-[10px] font-black tracking-wider border-b border-slate-200">
                                      <tr>
                                        <th className="p-2">Subject Code & Name</th>
                                        <th className="p-2 text-center">Marks Scored</th>
                                        <th className="p-2 text-center">Max Marks</th>
                                        <th className="p-2 text-center">Result</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                      {details.subjects.map((sub, sIdx) => (
                                        <tr key={sIdx} className="hover:bg-slate-50">
                                          <td className="p-2 font-bold text-slate-900">
                                            <span className="font-mono text-slate-500 mr-1.5">{sub.code}</span>
                                            <span>{sub.name}</span>
                                          </td>
                                          <td className="p-2 text-center font-black text-slate-900">{sub.marks}</td>
                                          <td className="p-2 text-center font-mono text-slate-500">{sub.maxMarks}</td>
                                          <td className="p-2 text-center">
                                            <span className={`px-2 py-0.5 rounded-sm text-[10px] font-black uppercase ${
                                              sub.isPass ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'
                                            }`}>
                                              {sub.result}
                                            </span>
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </div>

                              {/* Summary Box (Total Marks, Percentage, Overall Status) */}
                              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 p-3 bg-slate-50 border border-slate-200 rounded-sm text-xs">
                                <div>
                                  <span className="text-[10px] font-bold text-slate-500 uppercase block">Total Marks</span>
                                  <strong className="text-slate-900 font-black text-sm">{details.totalMarksDisplay}</strong>
                                </div>
                                <div>
                                  <span className="text-[10px] font-bold text-slate-500 uppercase block">Percentage</span>
                                  <strong className="text-slate-900 font-black text-sm">{details.percentageDisplay}</strong>
                                </div>
                                <div>
                                  <span className="text-[10px] font-bold text-slate-500 uppercase block">Overall Status</span>
                                  <span className={`px-2 py-0.5 rounded-sm text-[11px] font-black uppercase inline-block ${
                                    details.overallStatus === 'PASS'
                                      ? 'bg-emerald-100 text-emerald-800'
                                      : 'bg-rose-100 text-rose-800'
                                  }`}>
                                    {details.overallStatus}
                                  </span>
                                </div>
                              </div>

                              {/* Remarks Box */}
                              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-sm text-xs flex items-center justify-between">
                                <span className="font-black text-slate-700 uppercase text-[11px]">Remarks:</span>
                                <span className="font-bold text-slate-900">{details.remarks}</span>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="p-8 text-center text-slate-500 text-xs font-bold bg-slate-50 border border-slate-200 rounded-sm">
                        No student assessment records match the filter.
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Subject Analytics Tab Content */}
              {reportViewTab === 'subjects' && batchStats && (
                <div className="space-y-4 animate-in fade-in duration-150">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                    <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider">
                      Subject Performance Breakdown ({batchStats.subjectStats.length} Subjects)
                    </h4>
                    <span className="text-[11px] font-bold text-slate-500">
                      Passing criteria: {(selectedBatch.resultType || 'Semester Result') === 'Semester Result' ? 'Grade ≥ PASS (No Arrears)' : 'Internal Mark ≥ 60 = PASS (< 60 = FAIL)'}
                    </span>
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
              <div className="bg-amber-50/60 border border-amber-200/80 rounded-sm p-4 text-xs space-y-2">
                <div className="flex items-center justify-between text-amber-900 font-black uppercase tracking-wider text-[11px]">
                  <span className="flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 text-amber-600" />
                    <span>Fast2SMS Gateway Template Format: {(selectedBatch.resultType || 'Semester Result')}</span>
                  </span>
                  <span className="text-[10px] text-amber-800 font-mono font-bold bg-amber-100/80 px-2 py-0.5 rounded-sm">
                    {(selectedBatch.resultType || 'Semester Result') === 'Semester Result'
                      ? 'Format: Grade Only • NO Marks • NO Totals • NO %'
                      : 'Format: Subject Marks Only • NO Totals • NO %'}
                  </span>
                </div>

                <div className="p-3 bg-white border border-amber-200 rounded-sm text-slate-800 font-mono text-[11px] font-bold shadow-2xs whitespace-pre-line leading-relaxed">
                  {(selectedBatch.resultType || 'Semester Result') === 'Semester Result' ? (
                    `DEAR PARENT,

Name: [STUDENT NAME]

Register Number: [REGISTER NUMBER]

[DYNAMIC SUBJECT 1]: [GRADE]
[DYNAMIC SUBJECT 2]: [GRADE]
[DYNAMIC SUBJECT 3]: [GRADE]
...
[DYNAMIC SUBJECT N]: [GRADE]

Total Number of Arrears: [COUNT]`
                  ) : (
                    `Dear Parent, Assessment Result for [Student Name] ([Register Number]):
[Dynamic Subject 1]: [Marks], [Dynamic Subject 2]: [Marks], [Dynamic Subject 3]: [Marks]

Overall Result: [PASS/FAIL]

- VSB Engineering College`
                  )}
                </div>
              </div>

              {/* Overview & Marksheets Content */}
              {reportViewTab === 'overview' && (
                <div className="space-y-4">
                  {/* Filters & Search Bar */}
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-50 p-3 border border-slate-200 rounded-sm">
                    <div className="relative w-full sm:w-80">
                      <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                      <input
                        type="text"
                        id="student-search-input"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search by Register Number / Student Name..."
                        className="w-full pl-9 pr-3 py-1.5 bg-white border border-slate-300 rounded-sm text-xs font-bold text-slate-900 focus:outline-none focus:border-amber-500"
                      />
                    </div>

                    <div className="flex items-center space-x-1 overflow-x-auto w-full sm:w-auto">
                      {(['ALL', 'PASS', 'FAIL', 'SENT', 'FAILED'] as const).map((st) => (
                        <button
                          key={st}
                          onClick={() => setFilterStatus(st)}
                          className={`px-2.5 py-1 text-[10px] font-black uppercase tracking-wider rounded-sm transition-all whitespace-nowrap cursor-pointer ${
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

                  {/* Student Selection & SMS Action Toolbar */}
                  <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 border border-slate-200 rounded-sm p-3 text-xs font-bold text-slate-700 shadow-2xs">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <button
                        type="button"
                        id="select-all-students-btn"
                        onClick={() => {
                          const allVisibleRegs = filteredStudents.map((s) => s.registerNumber);
                          setSelectedRegNos(allVisibleRegs);
                        }}
                        className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-sm text-xs font-black flex items-center gap-1.5 shadow-xs transition-all cursor-pointer"
                      >
                        <CheckSquare className="w-4 h-4" />
                        <span>Select All ({filteredStudents.length})</span>
                      </button>

                      <button
                        type="button"
                        id="deselect-all-students-btn"
                        onClick={() => setSelectedRegNos([])}
                        disabled={selectedRegNos.length === 0}
                        className="px-3.5 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-sm text-xs font-black flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <Square className="w-4 h-4" />
                        <span>Deselect All</span>
                      </button>

                      <div className="h-5 w-px bg-slate-300 mx-1 hidden sm:block"></div>

                      <span
                        id="selected-students-count-badge"
                        className={`px-3 py-1.5 rounded-sm text-xs font-black tracking-wide flex items-center gap-1.5 transition-all ${
                          selectedRegNos.length > 0
                            ? 'bg-amber-400 text-slate-950 ring-1 ring-amber-500 shadow-xs'
                            : 'bg-slate-200 text-slate-600'
                        }`}
                      >
                        <Users className="w-4 h-4" />
                        <span>Selected Students: <strong>{selectedRegNos.length}</strong></span>
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        id="send-sms-toolbar-btn"
                        onClick={() => {
                          if (selectedRegNos.length === 0) {
                            setError('Please select at least one student.');
                            return;
                          }
                          setShowSmsConfirmModal(true);
                        }}
                        className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-sm text-xs font-black uppercase tracking-wider flex items-center gap-2 shadow-md transition-all cursor-pointer"
                      >
                        <Send className="w-4 h-4" />
                        <span>
                          {sendingSmsBatchId === selectedBatch.id
                            ? 'SENDING SMS...'
                            : `SEND SMS TO SELECTED STUDENTS (${selectedRegNos.length})`}
                        </span>
                      </button>
                    </div>
                  </div>

                  {/* Student Results Table with Expandable Details */}
                  <div className="overflow-x-auto border border-slate-200 rounded-sm">
                    <table className="w-full text-left text-xs text-slate-700">
                      <thead className="bg-[#0f172a] text-amber-400 uppercase text-[11px] font-black tracking-wider border-b border-slate-800">
                        <tr>
                          <th className="px-3 py-3.5 text-center w-12">
                            <div className="flex items-center justify-center">
                              <input
                                type="checkbox"
                                id="header-select-all-checkbox"
                                title={
                                  filteredStudents.length > 0 &&
                                  filteredStudents.every((s) => selectedRegNos.includes(s.registerNumber))
                                    ? 'Deselect All'
                                    : 'Select All'
                                }
                                checked={
                                  filteredStudents.length > 0 &&
                                  filteredStudents.every((s) => selectedRegNos.includes(s.registerNumber))
                                }
                                onChange={() => {
                                  const allVisibleRegs = filteredStudents.map((s) => s.registerNumber);
                                  const isAllSelected =
                                    allVisibleRegs.length > 0 &&
                                    allVisibleRegs.every((r) => selectedRegNos.includes(r));
                                  if (isAllSelected) {
                                    setSelectedRegNos((prev) => prev.filter((r) => !allVisibleRegs.includes(r)));
                                  } else {
                                    setSelectedRegNos((prev) => Array.from(new Set([...prev, ...allVisibleRegs])));
                                  }
                                }}
                                className="w-5 h-5 rounded border-slate-300 text-amber-600 focus:ring-amber-500 cursor-pointer accent-amber-500"
                              />
                            </div>
                          </th>
                          <th className="px-2 py-3.5 font-black w-10 text-center">#</th>
                          <th className="px-3 py-3.5 font-black">Register Number</th>
                          <th className="px-3 py-3.5 font-black">Student Name</th>
                          <th className="px-3 py-3.5 font-black">Parent Mobile</th>
                          <th className="px-3 py-3.5 font-black text-center">Total Marks</th>
                          <th className="px-3 py-3.5 font-black text-center">Percentage</th>
                          <th className="px-3 py-3.5 font-black text-center">Result</th>
                          <th className="px-3 py-3.5 font-black text-right">SMS Delivery</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredStudents.length > 0 ? (
                          filteredStudents.map((res, idx) => {
                            const isExpanded = expandedRegNo === res.registerNumber;
                            const isSelected = selectedRegNos.includes(res.registerNumber);
                            const marks = getStudentMarksAndPercentage(res, selectedBatch);
                            const resolvedPhone = getResolvedParentPhone(res.registerNumber, res.phoneNumber);

                            return (
                              <React.Fragment key={res.registerNumber || idx}>
                                <tr
                                  className={`hover:bg-amber-50/40 transition-colors border-b border-slate-100 ${
                                    isSelected ? 'bg-amber-50/70 font-medium' : ''
                                  }`}
                                >
                                  <td className="px-3 py-3.5 text-center w-12" onClick={(e) => e.stopPropagation()}>
                                    <input
                                      type="checkbox"
                                      id={`checkbox-student-${res.registerNumber}`}
                                      checked={isSelected}
                                      onChange={() => {
                                        setSelectedRegNos((prev) =>
                                          prev.includes(res.registerNumber)
                                            ? prev.filter((r) => r !== res.registerNumber)
                                            : [...prev, res.registerNumber]
                                        );
                                      }}
                                      className="w-5 h-5 rounded border-slate-300 text-amber-600 focus:ring-amber-500 cursor-pointer accent-amber-600"
                                    />
                                  </td>
                                  <td
                                    onClick={() => setExpandedRegNo(isExpanded ? null : res.registerNumber)}
                                    className="px-2 py-3.5 text-center font-mono text-slate-400 text-xs cursor-pointer"
                                  >
                                    {res.sNo || idx + 1}
                                  </td>
                                  <td
                                    onClick={() => setExpandedRegNo(isExpanded ? null : res.registerNumber)}
                                    className="px-3 py-3.5 font-mono font-black text-slate-900 text-sm cursor-pointer"
                                  >
                                    <div className="flex items-center gap-1.5">
                                      {res.subjects && res.subjects.length > 0 ? (
                                        isExpanded ? (
                                          <ChevronUp className="w-4 h-4 text-amber-600" />
                                        ) : (
                                          <ChevronDown className="w-4 h-4 text-slate-400" />
                                        )
                                      ) : null}
                                      <span>{res.registerNumber}</span>
                                    </div>
                                  </td>
                                  <td
                                    onClick={() => setExpandedRegNo(isExpanded ? null : res.registerNumber)}
                                    className="px-3 py-3.5 font-black text-slate-900 text-sm cursor-pointer"
                                  >
                                    {res.studentName}
                                  </td>
                                  <td
                                    onClick={() => setExpandedRegNo(isExpanded ? null : res.registerNumber)}
                                    className="px-3 py-3.5 font-mono font-bold text-slate-800 text-xs cursor-pointer"
                                  >
                                    {resolvedPhone ? (
                                      <span className="inline-flex items-center gap-1 text-slate-800">
                                        <Phone className="w-3.5 h-3.5 text-slate-400" />
                                        <span>{resolvedPhone}</span>
                                      </span>
                                    ) : (
                                      <span className="text-amber-700 font-bold italic text-[11px] bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                                        Not Enrolled
                                      </span>
                                    )}
                                  </td>
                                  <td
                                    onClick={() => setExpandedRegNo(isExpanded ? null : res.registerNumber)}
                                    className="px-3 py-3.5 text-center font-mono font-black text-slate-900 text-sm cursor-pointer"
                                  >
                                    {marks.totalCompact}
                                  </td>
                                  <td
                                    onClick={() => setExpandedRegNo(isExpanded ? null : res.registerNumber)}
                                    className="px-3 py-3.5 text-center font-mono font-black text-emerald-700 text-sm cursor-pointer"
                                  >
                                    {marks.percentageDisplay}
                                  </td>
                                  <td
                                    onClick={() => setExpandedRegNo(isExpanded ? null : res.registerNumber)}
                                    className="px-3 py-3.5 text-center cursor-pointer"
                                  >
                                    <span
                                      className={`px-2.5 py-0.5 rounded-sm text-[10px] font-black uppercase tracking-wider ${
                                        res.overallStatus === 'PASS'
                                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                          : 'bg-rose-100 text-rose-800 border border-rose-300'
                                      }`}
                                    >
                                      {res.overallStatus}
                                    </span>
                                  </td>
                                  <td
                                    onClick={() => setExpandedRegNo(isExpanded ? null : res.registerNumber)}
                                    className="px-3 py-3.5 text-right cursor-pointer"
                                  >
                                    {res.smsSent ? (
                                      <span
                                        className={`inline-flex items-center gap-1 font-black text-xs uppercase tracking-wider ${
                                          res.smsStatus === 'Failed' ? 'text-rose-600' : 'text-emerald-700'
                                        }`}
                                      >
                                        {res.smsStatus === 'Failed' ? (
                                          <XCircle className="w-4 h-4 text-rose-600" />
                                        ) : (
                                          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                                        )}
                                        <span>{res.smsStatus || 'Sent'}</span>
                                      </span>
                                    ) : (
                                      <span className="text-slate-400 text-xs font-semibold">
                                        Ready
                                      </span>
                                    )}
                                  </td>
                                </tr>

                                  {/* Expanded Subject Breakdown Row */}
                                {isExpanded && res.subjects && res.subjects.length > 0 && (
                                  <tr className="bg-slate-50/80 border-b border-slate-200">
                                    <td colSpan={9} className="p-4">
                                      <div className="bg-white border border-slate-200 p-3 rounded-sm space-y-2">
                                        <div className="text-[11px] font-black uppercase text-slate-800 tracking-wider flex items-center justify-between border-b pb-1">
                                          <span>
                                            {(selectedBatch.resultType || 'Semester Result') === 'Semester Result'
                                              ? 'Subject Grade Breakdown'
                                              : 'Internal Marks Breakdown (Pass: ≥ 60)'}{' '}
                                            for {res.studentName} ({res.registerNumber})
                                          </span>
                                          <span className="text-slate-500 font-bold">
                                            {res.subjects.length} Subjects Evaluated • Overall: {res.overallStatus}
                                          </span>
                                        </div>
                                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 text-xs">
                                          {res.subjects.map((sb, sidx) => {
                                            const isInternal = (selectedBatch.resultType || 'Semester Result') === 'Internal Test / Assessment';
                                            const isPass = isInternal ? sb.marks >= 60 : sb.result === 'PASS';
                                            return (
                                              <div key={sidx} className="p-2 bg-slate-50 border border-slate-200 rounded flex items-center justify-between">
                                                <div>
                                                  <div className="font-bold text-slate-800 truncate max-w-[120px]">{sb.subjectName || sb.subjectCode}</div>
                                                  <div className="text-[10px] text-slate-500 font-semibold">
                                                    {isPass ? 'PASS' : 'FAIL'} {isInternal ? `(${sb.marks >= 60 ? '≥60' : '<60'})` : ''}
                                                  </div>
                                                </div>
                                                <span className={`font-black text-sm px-2 py-0.5 rounded ${isPass ? 'text-emerald-700 bg-emerald-100/60' : 'text-rose-700 bg-rose-100/60'}`}>
                                                  {isInternal ? `${sb.marks} / 100` : (sb.grade || sb.marks)}
                                                </span>
                                              </div>
                                            );
                                          })}
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
                            <td colSpan={9} className="px-4 py-8 text-center text-slate-400 text-xs font-bold">
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
            <div className="grid grid-cols-1 sm:grid-cols-3 bg-slate-100 p-1 border-b border-slate-200 gap-1">
              <button
                type="button"
                onClick={() => setActiveTab('excel')}
                className={`py-2 px-3 text-xs font-black uppercase tracking-wider rounded-sm transition-all flex items-center justify-center space-x-2 cursor-pointer ${
                  activeTab === 'excel'
                    ? 'bg-[#0f172a] text-amber-400 shadow-sm'
                    : 'text-slate-600 hover:bg-slate-200'
                }`}
              >
                <FileSpreadsheet className="w-4 h-4 text-amber-400" />
                <span>Excel (.xlsx / .csv)</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('sheets')}
                className={`py-2 px-3 text-xs font-black uppercase tracking-wider rounded-sm transition-all flex items-center justify-center space-x-2 cursor-pointer ${
                  activeTab === 'sheets'
                    ? 'bg-emerald-800 text-white shadow-sm font-black'
                    : 'text-emerald-800 bg-emerald-50 hover:bg-emerald-100 font-bold'
                }`}
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                <span>Google Sheets</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('paste')}
                className={`py-2 px-3 text-xs font-black uppercase tracking-wider rounded-sm transition-all flex items-center justify-center space-x-2 cursor-pointer ${
                  activeTab === 'paste'
                    ? 'bg-[#0f172a] text-amber-400 shadow-sm'
                    : 'text-slate-600 hover:bg-slate-200'
                }`}
              >
                <BookOpen className="w-4 h-4 text-amber-400" />
                <span>Tabular Text Paste</span>
              </button>
            </div>

            <form onSubmit={handleCreateBatch} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
              {error && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold rounded-sm flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
                  <span>{typeof error === 'string' ? error : formatErrorMessage(error)}</span>
                </div>
              )}

              {/* Result Type Selection */}
              <div>
                <label className="block text-xs font-black text-slate-800 uppercase tracking-wider mb-1.5">
                  Select Result Type *
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setUploadResultType('Semester Result')}
                    className={`p-3 border rounded-sm text-left transition-all cursor-pointer ${
                      uploadResultType === 'Semester Result'
                        ? 'bg-purple-950 text-white border-purple-500 shadow-sm ring-1 ring-purple-500'
                        : 'bg-slate-50 text-slate-800 border-slate-300 hover:bg-slate-100'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full mb-1">
                      <span className="font-black text-xs uppercase tracking-wider flex items-center gap-1.5">
                        <Award className={`w-4 h-4 ${uploadResultType === 'Semester Result' ? 'text-purple-400' : 'text-purple-600'}`} />
                        Semester Result
                      </span>
                      {uploadResultType === 'Semester Result' && (
                        <span className="text-purple-400 font-bold text-xs">✓ Active</span>
                      )}
                    </div>
                    <p className={`text-[10px] font-medium ${uploadResultType === 'Semester Result' ? 'text-purple-200' : 'text-slate-600'}`}>
                      Sends <strong>Grade only</strong>. No marks, no total marks, no percentages.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setUploadResultType('Internal Test / Assessment')}
                    className={`p-3 border rounded-sm text-left transition-all cursor-pointer ${
                      uploadResultType === 'Internal Test / Assessment'
                        ? 'bg-cyan-950 text-white border-cyan-500 shadow-sm ring-1 ring-cyan-500'
                        : 'bg-slate-50 text-slate-800 border-slate-300 hover:bg-slate-100'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full mb-1">
                      <span className="font-black text-xs uppercase tracking-wider flex items-center gap-1.5">
                        <BookOpen className={`w-4 h-4 ${uploadResultType === 'Internal Test / Assessment' ? 'text-cyan-400' : 'text-cyan-600'}`} />
                        Internal Test / Assessment
                      </span>
                      {uploadResultType === 'Internal Test / Assessment' && (
                        <span className="text-cyan-400 font-bold text-xs">✓ Active</span>
                      )}
                    </div>
                    <p className={`text-[10px] font-medium ${uploadResultType === 'Internal Test / Assessment' ? 'text-cyan-200' : 'text-slate-600'}`}>
                      Sends <strong>Subject Marks only</strong>. No total marks, no percentages.
                    </p>
                  </button>
                </div>
              </div>

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

              {activeTab === 'excel' && (
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
                        <span className="text-emerald-400">✓ Parent Mobiles Matched: {validMobileCount}</span>
                        {skippedMobileCount > 0 && (
                          <span className="text-amber-300">⚠ Unmatched / Missing in File: {skippedMobileCount} (Will auto-match from MongoDB Enrollment)</span>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-400 font-medium pt-1">
                        * Note: Parent Mobile Number is NOT mandatory in the Excel file. The system uses Register Number as the key link to automatically retrieve enrolled parent numbers from MongoDB.
                      </p>
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
              )}

              {activeTab === 'sheets' && (
                <div className="space-y-3">
                  <GoogleSheetsPicker
                    onDataLoaded={handleGoogleSheetDataLoaded}
                    onError={(msg) => setError(msg)}
                  />

                  {/* Dynamic Subject & Parent Mobile Validation Banner */}
                  {parsedResults.length > 0 && (
                    <div className="p-3.5 bg-slate-900 text-white rounded-sm text-xs space-y-2 border border-emerald-500/30">
                      <div className="flex items-center justify-between text-emerald-400 font-black uppercase text-[11px]">
                        <span>✓ Parsed {parsedResults.length} Student Records from Google Sheet</span>
                        <span>Auto-Detected {detectedSubjects.length} Dynamic Subject Columns</span>
                      </div>

                      {detectedSubjects.length > 0 && (
                        <div className="flex flex-wrap gap-1 text-[10px] font-bold">
                          <span className="text-slate-400">Subjects:</span>
                          {detectedSubjects.map((sb, i) => (
                            <span key={i} className="px-1.5 py-0.5 bg-slate-800 text-emerald-300 rounded-sm border border-emerald-700/50">
                              {sb}
                            </span>
                          ))}
                        </div>
                      )}

                      <div className="flex items-center gap-4 text-[11px] font-bold pt-1 border-t border-slate-800">
                        <span className="text-emerald-400">✓ Parent Mobiles Matched: {validMobileCount}</span>
                        {skippedMobileCount > 0 && (
                          <span className="text-amber-300">⚠ Unmatched in File: {skippedMobileCount} (Will auto-match from database)</span>
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
              )}

              {activeTab === 'paste' && (
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

      {/* Print Report Preview Modal */}
      {showPrintModal && selectedBatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
          <div className="bg-white border border-slate-300 w-full max-w-4xl max-h-[90vh] rounded-sm shadow-2xl flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="bg-[#0f172a] text-white p-4 flex items-center justify-between no-print border-b border-slate-800">
              <div className="flex items-center space-x-2">
                <Printer className="w-4 h-4 text-amber-400" />
                <h3 className="text-xs font-black uppercase tracking-widest text-amber-400">
                  Internal Assessment Report Print Preview
                </h3>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-3 py-1.5 bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs uppercase tracking-wider rounded-sm flex items-center gap-1.5 transition-all shadow-sm"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print Document</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowPrintModal(false)}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs uppercase tracking-wider rounded-sm transition-all"
                >
                  Close
                </button>
              </div>
            </div>

            {/* Printable Area */}
            <div className="p-8 overflow-y-auto printable-report bg-white text-slate-900 space-y-6">
              <div className="text-center border-b-2 border-slate-900 pb-4">
                <h2 className="text-sm font-black text-amber-600 uppercase tracking-widest">
                  VSB ENGINEERING COLLEGE • VY NEXTGEN TECHNOLOGY
                </h2>
                <h1 className="text-xl font-black text-slate-900 uppercase tracking-tight mt-1">
                  DEPARTMENT OF CSE(AIML) - INTERNAL ASSESSMENT REPORT
                </h1>
                <p className="text-xs font-bold text-slate-600 mt-1">
                  {cleanTitleDisplay(selectedBatch.title)} • Assessment Date: {selectedBatch.examDate || '2026-02-15'} • Academic Year: {selectedBatch.academicYear || '2025-2026'}
                </p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-3 bg-slate-50 border border-slate-200 text-xs font-medium rounded-sm">
                <div>
                  <span className="text-slate-500 uppercase font-bold text-[10px] block">Total Students</span>
                  <strong className="text-slate-900 font-black text-sm">{selectedBatch.totalStudents}</strong>
                </div>
                <div>
                  <span className="text-slate-500 uppercase font-bold text-[10px] block">Pass Rate</span>
                  <strong className="text-emerald-700 font-black text-sm">{batchStats ? batchStats.passRate : 'N/A'}%</strong>
                </div>
                <div>
                  <span className="text-slate-500 uppercase font-bold text-[10px] block">Department</span>
                  <strong className="text-slate-900 font-black">CSE(AIML)</strong>
                </div>
                <div>
                  <span className="text-slate-500 uppercase font-bold text-[10px] block">Report Date</span>
                  <strong className="text-slate-900 font-black">{new Date().toLocaleDateString()}</strong>
                </div>
              </div>

              <div className="space-y-4">
                {selectedBatch.results.map((r, i) => {
                  const details = getStudentAssessmentDetails(selectedBatch, r, i);
                  return (
                    <div key={i} className="border border-slate-300 rounded-sm overflow-hidden page-break-inside-avoid">
                      <div className="bg-[#0f172a] text-white px-3 py-1.5 flex items-center justify-between text-xs font-black">
                        <span>INTERNAL ASSESSMENT REPORT — SERIAL NO: {details.serialNo}</span>
                        <span className={details.overallStatus === 'PASS' ? 'text-emerald-400' : 'text-rose-400'}>
                          STATUS: {details.overallStatus}
                        </span>
                      </div>

                      <div className="p-3 space-y-3 text-xs bg-slate-50">
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 border-b border-slate-200 pb-2">
                          <div>
                            <span className="text-slate-500 font-bold">Register Number: </span>
                            <span className="font-mono font-black text-blue-700">{details.registerNumber}</span>
                          </div>
                          <div>
                            <span className="text-slate-500 font-bold">Assessment Date: </span>
                            <span className="font-bold text-slate-800">{details.assessmentDate}</span>
                          </div>
                          <div>
                            <span className="text-slate-500 font-bold">Student Name: </span>
                            <span className="font-bold text-slate-900">{details.studentName}</span>
                          </div>
                          <div>
                            <span className="text-slate-500 font-bold">Semester: </span>
                            <span className="font-bold text-slate-800">{details.semester}</span>
                          </div>
                          <div>
                            <span className="text-slate-500 font-bold">Parent Mobile: </span>
                            <span className="font-mono font-bold text-slate-800">{details.parentMobile}</span>
                          </div>
                          <div>
                            <span className="text-slate-500 font-bold">Academic Year: </span>
                            <span className="font-bold text-slate-800">{details.academicYear}</span>
                          </div>
                          <div>
                            <span className="text-slate-500 font-bold">Department: </span>
                            <span className="font-bold text-slate-900">{details.department}</span>
                          </div>
                        </div>

                        <div>
                          <div className="font-black text-[11px] uppercase text-slate-800 mb-1.5">
                            INTERNAL ASSESSMENT DETAILS
                          </div>
                          <table className="w-full text-left text-xs bg-white border border-slate-200">
                            <thead className="bg-slate-100 text-slate-700 uppercase text-[9px] font-black">
                              <tr>
                                <th className="p-1.5 border-b">Subject</th>
                                <th className="p-1.5 border-b text-center">Marks Scored</th>
                                <th className="p-1.5 border-b text-center">Max Marks</th>
                                <th className="p-1.5 border-b text-center">Result</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {details.subjects.map((sub, sIdx) => (
                                <tr key={sIdx}>
                                  <td className="p-1.5 font-bold">{sub.code} - {sub.name}</td>
                                  <td className="p-1.5 text-center font-black">{sub.marks}</td>
                                  <td className="p-1.5 text-center text-slate-500">{sub.maxMarks}</td>
                                  <td className="p-1.5 text-center font-bold">
                                    <span className={sub.isPass ? 'text-emerald-700' : 'text-rose-700'}>
                                      {sub.result}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        <div className="flex flex-wrap items-center justify-between pt-1 border-t border-slate-200 text-xs font-bold">
                          <span>Total Marks: <strong className="text-slate-900">{details.totalMarksDisplay}</strong></span>
                          <span>Percentage: <strong className="text-slate-900">{details.percentageDisplay}</strong></span>
                          <span>Overall Result: <strong className={details.overallStatus === 'PASS' ? 'text-emerald-700' : 'text-rose-700'}>{details.overallStatus}</strong></span>
                          <span>Remarks: <strong className="text-slate-800 font-normal">{details.remarks}</strong></span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="pt-8 flex justify-between items-end text-xs font-bold text-slate-600">
                <div>
                  <p>VSB ENGINEERING COLLEGE • DEPARTMENT OF CSE(AIML)</p>
                  <p className="text-[10px] text-slate-400 font-normal">Internal Assessment Examination Record • Confidential</p>
                </div>
                <div className="text-right space-y-8">
                  <p>Authorized Signatory (HOD / Principal)</p>
                  <p className="border-b border-slate-400 w-48 inline-block"></p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Exam Batch Confirmation Modal */}
      {batchToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
          <div className="bg-white border border-rose-200 rounded-sm shadow-2xl max-w-md w-full p-6 space-y-5">
            {/* Modal Header */}
            <div className="flex items-start gap-3">
              <div className="p-3 bg-rose-100 rounded-full shrink-0">
                <Trash2 className="w-6 h-6 text-rose-600" />
              </div>
              <div>
                <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">
                  Delete Exam Batch Confirmation
                </h3>
                <p className="text-xs text-slate-600 font-bold mt-1">
                  Are you sure you want to delete this exam batch?
                </p>
              </div>
            </div>

            <div className="p-3 bg-rose-50/80 border border-rose-200 rounded-sm text-xs text-rose-900 space-y-1">
              <p className="font-black flex items-center gap-1 text-rose-800">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>This action cannot be undone!</span>
              </p>
              <p className="text-[11px] font-medium leading-relaxed">
                The selected Exam Batch, uploaded results, marks breakdown, calculated statistics, and batch SMS logs will be permanently deleted.
              </p>
              <p className="text-[11px] font-bold text-emerald-800 pt-1 border-t border-rose-200/60 mt-1">
                ✓ Student Enrollment records, Names, Register Numbers, and Parent Mobile Numbers will remain permanently safe in the database.
              </p>
            </div>

            {/* Batch Details Specs Box */}
            <div className="bg-slate-50 border border-slate-200 rounded-sm p-3.5 space-y-2 text-xs">
              <div className="flex items-center justify-between border-b border-slate-200 pb-1.5">
                <span className="text-slate-500 font-bold uppercase text-[10px]">Exam Name</span>
                <strong className="text-slate-900 font-black uppercase text-xs">{batchToDelete.title}</strong>
              </div>
              <div className="flex items-center justify-between border-b border-slate-200 pb-1.5">
                <span className="text-slate-500 font-bold uppercase text-[10px]">Department</span>
                <span className="px-2 py-0.5 bg-slate-900 text-amber-400 font-black text-[10px] rounded-sm uppercase">
                  {batchToDelete.department}
                </span>
              </div>
              <div className="flex items-center justify-between border-b border-slate-200 pb-1.5">
                <span className="text-slate-500 font-bold uppercase text-[10px]">Exam Date</span>
                <strong className="text-slate-800 font-bold">{batchToDelete.examDate}</strong>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-bold uppercase text-[10px]">Student Count</span>
                <strong className="text-slate-900 font-black text-xs">{batchToDelete.totalStudents} Students</strong>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setBatchToDelete(null)}
                disabled={isDeleting}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-black text-xs uppercase tracking-wider rounded-sm transition-all border border-slate-300 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white font-black text-xs uppercase tracking-wider rounded-sm shadow-md transition-all flex items-center gap-2 disabled:opacity-50"
              >
                {isDeleting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    <span>Delete Exam Batch</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dynamic Student SMS Dispatch Confirmation Modal */}
      {showSmsConfirmModal && selectedBatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
          <div className="bg-white border border-slate-300 rounded-sm shadow-2xl max-w-3xl w-full p-6 space-y-4 max-h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-slate-200 pb-3">
              <div className="flex items-start gap-3">
                <div className="p-3 bg-amber-100 rounded-full shrink-0">
                  <MessageSquare className="w-6 h-6 text-amber-700" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">
                    Confirm SMS Dispatch
                  </h3>
                  <p className="text-base font-black text-emerald-700 mt-0.5">
                    Are you sure you want to send SMS to {selectedRegNos.length} selected student{selectedRegNos.length > 1 ? 's' : ''}?
                  </p>
                </div>
              </div>

              <span className="px-3 py-1 bg-amber-400 text-slate-950 font-black text-xs uppercase tracking-wider rounded-sm shadow-sm">
                Selected Students: {selectedRegNos.length}
              </span>
            </div>

            {/* Scope Notice */}
            <div className="p-3 bg-blue-50/80 border border-blue-200 rounded-sm text-xs text-blue-950 space-y-1">
              <p className="font-black flex items-center gap-1.5 text-blue-900">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-blue-700" />
                <span>Selective Dispatch Policy</span>
              </p>
              <p className="text-[12px] font-medium leading-relaxed">
                SMS will be dynamically generated and sent <strong>ONLY</strong> to the <strong>{selectedRegNos.length}</strong> selected student(s) below.
                The remaining {selectedBatch.results.length - selectedRegNos.length} unselected student(s) in this batch will <strong>NOT</strong> receive any SMS.
              </p>
            </div>

            {/* Selected Students Preview Table */}
            <div className="flex-1 overflow-y-auto border border-slate-200 rounded-sm divide-y divide-slate-200">
              <div className="bg-[#0f172a] text-amber-400 p-2.5 text-[11px] font-black uppercase tracking-wider flex items-center justify-between sticky top-0 z-10">
                <span>Selected Students & Individual Dynamic Message Preview</span>
                <span>{selectedRegNos.length} Recipients</span>
              </div>

              {selectedBatch.results
                .filter((res) => selectedRegNos.includes(res.registerNumber))
                .map((res, idx) => {
                  const resolvedPhone = getResolvedParentPhone(res.registerNumber, res.phoneNumber);
                  const previewMsg = getIndividualStudentSmsPreview(selectedBatch, { ...res, phoneNumber: resolvedPhone });
                  const marks = getStudentMarksAndPercentage(res, selectedBatch);

                  return (
                    <div key={res.registerNumber || idx} className="p-3.5 hover:bg-slate-50 transition-colors space-y-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded-full bg-slate-900 text-amber-400 font-mono font-bold flex items-center justify-center text-[11px]">
                            {idx + 1}
                          </span>
                          <div>
                            <strong className="text-slate-900 font-black text-sm">{res.studentName}</strong>
                            <span className="font-mono text-slate-500 font-bold ml-2">({res.registerNumber})</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <span className="text-[10px] text-slate-400 font-bold block uppercase">Parent Mobile</span>
                            {resolvedPhone ? (
                              <span className="font-mono font-bold text-slate-800 text-xs flex items-center gap-1">
                                <Phone className="w-3 h-3 text-emerald-600" />
                                {resolvedPhone}
                              </span>
                            ) : (
                              <span className="text-rose-600 font-black text-[11px] bg-rose-50 px-1.5 py-0.5 rounded-sm border border-rose-200">
                                ⚠ Mobile Not Found
                              </span>
                            )}
                          </div>

                          <div className="text-right pl-2 border-l border-slate-200">
                            <span className="text-[10px] text-slate-400 font-bold block uppercase">Total Marks</span>
                            <span className="font-mono font-bold text-slate-900 text-xs">
                              {marks.totalCompact}
                            </span>
                          </div>

                          <div className="text-right pl-2 border-l border-slate-200">
                            <span className="text-[10px] text-slate-400 font-bold block uppercase">Percentage</span>
                            <span className="font-mono font-black text-emerald-700 text-xs">
                              {marks.percentageDisplay}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Dynamic Generated SMS Preview Box */}
                      <div className="bg-slate-900 text-slate-100 rounded-sm p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap border border-slate-800">
                        <div className="text-[10px] text-amber-400 uppercase font-black tracking-wider mb-1.5 flex items-center justify-between">
                          <span>Dynamic SMS Generated for this Student:</span>
                          <span className="text-slate-400 font-normal">Recipient: {resolvedPhone || 'Parent Mobile'}</span>
                        </div>
                        {previewMsg}
                      </div>
                    </div>
                  );
                })}
            </div>

            {/* Modal Actions */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-200">
              <span className="text-xs text-slate-500 font-bold">
                Confirming will immediately queue and send SMS via Fast2SMS.
              </span>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  id="cancel-send-sms-modal-btn"
                  onClick={() => setShowSmsConfirmModal(false)}
                  disabled={sendingSmsBatchId === selectedBatch.id}
                  className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-black text-xs uppercase tracking-wider rounded-sm transition-all border border-slate-300 disabled:opacity-50 cursor-pointer"
                >
                  CANCEL
                </button>
                <button
                  type="button"
                  id="confirm-send-sms-modal-btn"
                  onClick={() => {
                    setShowSmsConfirmModal(false);
                    handleSendResultSms(selectedBatch.id, selectedRegNos);
                  }}
                  disabled={sendingSmsBatchId === selectedBatch.id}
                  className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs uppercase tracking-wider rounded-sm shadow-md transition-all flex items-center gap-2 disabled:opacity-50 cursor-pointer"
                >
                  <Send className="w-4 h-4" />
                  <span>CONFIRM & SEND</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Google Sheets Export Modal */}
      {selectedBatch && (
        <GoogleSheetsExportModal
          batch={selectedBatch}
          isOpen={showGoogleSheetsExportModal}
          onClose={() => setShowGoogleSheetsExportModal(false)}
        />
      )}

    </div>
  );
};
