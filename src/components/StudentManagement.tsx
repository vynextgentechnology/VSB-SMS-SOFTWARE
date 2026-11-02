import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { Student, Department, User, ACADEMIC_YEARS, AcademicYear } from '../types';
import { api, formatErrorMessage } from '../lib/api';
import {
  Users,
  UserPlus,
  Search,
  Filter,
  Trash2,
  Edit2,
  Send,
  Upload,
  X,
  AlertCircle,
  Building2,
  Check,
  FileSpreadsheet,
  Eye,
  ExternalLink,
  GraduationCap,
  Download,
  History,
  PhoneCall,
  ArrowRight,
  RefreshCw,
  Layers,
  Calendar,
} from 'lucide-react';
import { GoogleSheetsPicker } from './GoogleSheetsPicker';
import { StudentGoogleSheetsExportModal } from './StudentGoogleSheetsExportModal';

interface StudentManagementProps {
  students: Student[];
  departments?: Department[];
  currentUser?: User | null;
  onRefresh: () => void;
  onSendSmsToStudent?: (student: Student) => void;
  initialAcademicYear?: string;
  onNavigateToPromotion?: () => void;
}

const DEFAULT_DEPT_CODES = [
  'CSE(AIML)',
  'AIDS',
  'CSE',
  'CCE',
  'ECE',
  'EEE',
  'MECH',
  'CSBS',
  'CHEMICAL',
  'CIVIL',
];

export const StudentManagement: React.FC<StudentManagementProps> = ({
  students,
  departments,
  currentUser,
  onRefresh,
  onSendSmsToStudent,
  initialAcademicYear,
  onNavigateToPromotion,
}) => {
  const isStaff = currentUser?.role === 'staff';
  const isHod = currentUser?.role === 'hod';
  const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'SUPER_ADMIN';

  // Determine allowed departments & years based on user role and assignments
  const userDept = currentUser?.department || 'CSE';
  const assignedDepts = isStaff && Array.isArray((currentUser as any)?.assignedDepartments) && (currentUser as any).assignedDepartments.length > 0
    ? (currentUser as any).assignedDepartments
    : [userDept];
  const assignedYears = isStaff && Array.isArray((currentUser as any)?.assignedYears) && (currentUser as any).assignedYears.length > 0
    ? (currentUser as any).assignedYears
    : ['1st Year'];

  const DEPARTMENTS = departments && departments.length > 0 ? departments.map((d) => d.code) : DEFAULT_DEPT_CODES;

  // Filter states
  const [selectedYear, setSelectedYear] = useState<string>(initialAcademicYear || (isStaff ? assignedYears[0] : 'ALL'));
  const [selectedDept, setSelectedDept] = useState<string>(isHod ? userDept : isStaff ? assignedDepts[0] : 'ALL');
  const [searchTerm, setSearchTerm] = useState('');

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [deletingStudent, setDeletingStudent] = useState<Student | null>(null);
  const [isClearAllModalOpen, setIsClearAllModalOpen] = useState(false);
  const [viewingStudent, setViewingStudent] = useState<Student | null>(null);
  const [quickPhoneStudent, setQuickPhoneStudent] = useState<Student | null>(null);
  const [quickPhoneValue, setQuickPhoneValue] = useState('');

  // Audit History Modal
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);
  const [auditHistories, setAuditHistories] = useState<any[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditSearchReg, setAuditSearchReg] = useState('');

  // Academic Promotion Modal (Admin only)
  const [isPromotionModalOpen, setIsPromotionModalOpen] = useState(false);
  const [promotionPreview, setPromotionPreview] = useState<any>(null);
  const [promotionLoading, setPromotionLoading] = useState(false);
  const [promotionSession, setPromotionSession] = useState('2026-2027');
  const [promotionHistory, setPromotionHistory] = useState<any[]>([]);
  const [showPromotionHistory, setShowPromotionHistory] = useState(false);
  const [confirmPromotionStep, setConfirmPromotionStep] = useState(false);

  // Form states for Add / Edit
  const [formData, setFormData] = useState({
    name: '',
    registerNumber: '',
    department: isStaff ? assignedDepts[0] : userDept,
    academicYear: isStaff ? assignedYears[0] : '1st Year',
    section: '',
    parentMobile: '',
    studentMobile: '',
    email: '',
    gender: 'Male',
  });

  const [batchText, setBatchText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Excel Upload & Preview state
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [previewSourceName, setPreviewSourceName] = useState<string>('');
  const [isGoogleSheetsImportOpen, setIsGoogleSheetsImportOpen] = useState(false);
  const [isGoogleSheetsExportOpen, setIsGoogleSheetsExportOpen] = useState(false);
  const [previewTargetYear, setPreviewTargetYear] = useState<string>(selectedYear === 'ALL' ? '1st Year' : selectedYear);
  const [previewTargetDept, setPreviewTargetDept] = useState<string>(selectedDept === 'ALL' ? 'CSE' : selectedDept);
  const [previewData, setPreviewData] = useState<{
    headers: string[];
    totalCount: number;
    validCount: number;
    invalidCount: number;
    duplicateCountInFile: number;
    duplicateCountInDb: number;
    rows: any[];
    validRows: any[];
    invalidRows: any[];
    duplicatesInDb: string[];
  } | null>(null);
  const [excelUploadLoading, setExcelUploadLoading] = useState(false);

  // Sync selectedYear if initialAcademicYear changes
  useEffect(() => {
    if (initialAcademicYear) {
      setSelectedYear(initialAcademicYear);
    }
  }, [initialAcademicYear]);

  // Open Add Student Modal
  const openAddModal = () => {
    setFormData({
      name: '',
      registerNumber: '',
      department: isStaff ? assignedDepts[0] : (selectedDept === 'ALL' ? 'CSE' : selectedDept),
      academicYear: isStaff ? assignedYears[0] : (selectedYear === 'ALL' ? '1st Year' : selectedYear),
      section: '',
      parentMobile: '',
      studentMobile: '',
      email: '',
      gender: 'Male',
    });
    setError(null);
    setIsAddModalOpen(true);
  };

  // Open Edit Student Modal
  const openEditModal = (std: Student) => {
    setEditingStudent(std);
    setFormData({
      name: std.name,
      registerNumber: std.registerNumber,
      department: std.department,
      academicYear: std.academicYear || std.year || '1st Year',
      section: std.section || '',
      parentMobile: std.parentMobile || std.phoneNumber || '',
      studentMobile: std.studentMobile || '',
      email: std.email || '',
      gender: std.gender || 'Male',
    });
    setError(null);
  };

  // Quick Parent Mobile Correction
  const openQuickPhoneCorrection = (std: Student) => {
    setQuickPhoneStudent(std);
    setQuickPhoneValue(std.parentMobile || std.phoneNumber || '');
    setError(null);
  };

  const handleSaveQuickPhone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickPhoneStudent) return;
    const cleanPhone = quickPhoneValue.replace(/\D/g, '').slice(-10);
    if (cleanPhone.length !== 10) {
      setError('Parent Mobile Number must be exactly 10 digits');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await api.updateStudent(quickPhoneStudent.id, {
        parentMobile: cleanPhone,
        phoneNumber: cleanPhone,
      });
      setSuccessMsg(`Parent mobile for ${quickPhoneStudent.name} (${quickPhoneStudent.registerNumber}) corrected to ${cleanPhone}. Change logged in audit trail.`);
      setQuickPhoneStudent(null);
      onRefresh();
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: any) {
      setError(formatErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  // Handle Save Student (Add / Edit)
  const handleSaveStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const cleanParentPhone = formData.parentMobile.replace(/\D/g, '').slice(-10);
    if (!formData.name.trim() || !formData.registerNumber.trim()) {
      setError('Student Name and Register Number are required.');
      setLoading(false);
      return;
    }

    if (cleanParentPhone.length !== 10) {
      setError('Valid 10-digit Parent Mobile Number is required.');
      setLoading(false);
      return;
    }

    const payload = {
      ...formData,
      registerNumber: formData.registerNumber.trim().toUpperCase(),
      phoneNumber: cleanParentPhone,
      parentMobile: cleanParentPhone,
      studentMobile: formData.studentMobile ? formData.studentMobile.replace(/\D/g, '').slice(-10) : '',
    };

    try {
      if (editingStudent) {
        await api.updateStudent(editingStudent.id, payload);
        setSuccessMsg(`Student ${payload.name} updated successfully! Audit history updated.`);
        setEditingStudent(null);
      } else {
        await api.addStudent(payload);
        setSuccessMsg(`Student ${payload.name} (${payload.registerNumber}) enrolled successfully!`);
        setIsAddModalOpen(false);
      }
      onRefresh();
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: any) {
      setError(formatErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  // Handle Delete Student
  const handleDeleteStudent = (std: Student) => {
    setError(null);
    setDeletingStudent(std);
  };

  const confirmDeleteStudent = async () => {
    if (!deletingStudent) return;
    const { id, name, registerNumber } = deletingStudent;
    setError(null);
    setLoading(true);
    try {
      const deleteIdentifier = registerNumber || id;
      await api.deleteStudent(deleteIdentifier);
      setSuccessMsg(`Student ${name} (${registerNumber}) permanently deleted from college database.`);
      setDeletingStudent(null);
      onRefresh();
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: any) {
      setError(formatErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const confirmClearAllStudents = async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await api.deleteAllStudents();
      setSuccessMsg(res.message || 'All student records have been permanently cleared from the database.');
      setIsClearAllModalOpen(false);
      onRefresh();
      setTimeout(() => setSuccessMsg(null), 5000);
    } catch (err: any) {
      setError(formatErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  // Download Sample Excel Template
  const downloadSampleTemplate = () => {
    const sampleData = [
      {
        'Register Number': '921321104001',
        'Student Name': 'S. Ananya',
        'Department': 'CSE',
        'Academic Year': '1st Year',
        'Student Mobile Number': '9876543210',
        'Parent Mobile Number': '9876543210',
        'Email': 'ananya@vsbec.ac.in',
        'Gender': 'Female',
        'Section': 'A',
      },
      {
        'Register Number': '921321104002',
        'Student Name': 'K. Vignesh',
        'Department': 'AIML',
        'Academic Year': '1st Year',
        'Student Mobile Number': '9123456789',
        'Parent Mobile Number': '9123456789',
        'Email': 'vignesh@vsbec.ac.in',
        'Gender': 'Male',
        'Section': 'A',
      },
    ];

    const ws = XLSX.utils.json_to_sheet(sampleData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'StudentEnrollment');
    XLSX.writeFile(wb, 'VSBEC_Year_Dept_Student_Template.xlsx');
  };

  // Download Filtered Student List to Excel
  const downloadStudentList = () => {
    if (filteredStudents.length === 0) return;
    const exportData = filteredStudents.map((s, idx) => ({
      'S.No': idx + 1,
      'Register Number': s.registerNumber,
      'Student Name': s.name,
      'Department': s.department,
      'Academic Year': s.academicYear || s.year || '1st Year',
      'Parent Mobile': s.parentMobile || s.phoneNumber || '',
      'Student Mobile': s.studentMobile || '',
      'Email': s.email || '',
      'Gender': s.gender || '',
      'Section': s.section || '',
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Students');
    const filename = `VSBEC_Students_${selectedYear.replace(/\s+/g, '_')}_${selectedDept}.xlsx`;
    XLSX.writeFile(wb, filename);
  };

  // Download Failed Records from Excel Preview
  const downloadFailedRecords = () => {
    if (!previewData || previewData.invalidRows.length === 0) return;
    const failedData = previewData.invalidRows.map((r) => ({
      'Row In File': r.rowNumber,
      'Register Number': r.registerNumber,
      'Student Name': r.name,
      'Department': r.department,
      'Academic Year': r.academicYear,
      'Parent Mobile': r.parentMobile,
      'Student Mobile': r.studentMobile,
      'Email': r.email,
      'Failure Reasons': r.errors ? r.errors.join('; ') : 'Invalid',
    }));

    const ws = XLSX.utils.json_to_sheet(failedData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'FailedRecords');
    XLSX.writeFile(wb, 'VSBEC_Student_Upload_Failed_Records.xlsx');
  };

  // Handle Excel File Selected for Preview
  const handleExcelFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setLoading(true);

    try {
      if (!file.name.match(/\.(xlsx|xls|csv)$/i)) {
        throw new Error('Please select a valid Excel spreadsheet (.xlsx, .xls) or CSV file.');
      }

      setExcelFile(file);
      setPreviewSourceName(file.name);

      const targetYearParam = selectedYear === 'ALL' ? '1st Year' : selectedYear;
      const targetDeptParam = selectedDept === 'ALL' ? (isStaff ? assignedDepts[0] : 'CSE') : selectedDept;

      const previewRes = await api.previewStudentsExcel(file, {
        academicYear: targetYearParam,
        department: targetDeptParam,
      });

      setPreviewData(previewRes);
      setIsPreviewModalOpen(true);
    } catch (err: any) {
      setError(formatErrorMessage(err));
    } finally {
      setLoading(false);
      e.target.value = '';
    }
  };

  // Confirm and Commit Excel Upload to Database
  const confirmUploadExcelToServer = async () => {
    if (!excelFile) return;
    setExcelUploadLoading(true);
    setError(null);

    try {
      const res = await api.uploadStudentsExcel(excelFile);
      setSuccessMsg(`Excel import completed successfully! Added ${res.added} students, updated ${res.updated} existing records.`);
      setIsPreviewModalOpen(false);
      setExcelFile(null);
      setPreviewData(null);
      onRefresh();
      setTimeout(() => setSuccessMsg(null), 5000);
    } catch (err: any) {
      setError(formatErrorMessage(err));
    } finally {
      setExcelUploadLoading(false);
    }
  };

  // Open Audit History Modal
  const openAuditHistoryModal = async () => {
    setIsAuditModalOpen(true);
    setAuditLoading(true);
    try {
      const histories = await api.getStudentAuditHistory();
      setAuditHistories(histories);
    } catch (err: any) {
      console.error('Failed to load audit history:', err);
    } finally {
      setAuditLoading(false);
    }
  };

  // Open Annual Promotion Modal
  const openPromotionModal = async () => {
    if (onNavigateToPromotion) {
      onNavigateToPromotion();
      return;
    }
    setIsPromotionModalOpen(true);
    setPromotionLoading(true);
    setConfirmPromotionStep(false);
    try {
      const preview = await api.getPromotionPreview();
      setPromotionPreview(preview);
      const history = await api.getPromotionHistory();
      setPromotionHistory(history);
    } catch (err: any) {
      setError(formatErrorMessage(err));
    } finally {
      setPromotionLoading(false);
    }
  };

  // Execute Academic Promotion
  const handleExecutePromotion = async () => {
    setPromotionLoading(true);
    setError(null);
    try {
      const res = await api.executePromotion({
        academicSession: promotionSession,
        notes: `Annual Academic Promotion executed by Administrator`,
      });
      const count = res.totalPromoted ?? res.successfulCount ?? res.result?.totalPromoted ?? 0;
      setSuccessMsg(`Academic Promotion executed successfully! ${count} students updated in MongoDB.`);
      setIsPromotionModalOpen(false);
      setConfirmPromotionStep(false);
      onRefresh();
      setTimeout(() => setSuccessMsg(null), 5000);
    } catch (err: any) {
      setError(formatErrorMessage(err));
    } finally {
      setPromotionLoading(false);
    }
  };

  // Filter students based on Year, Department, and Search
  const filteredStudents = students.filter((std) => {
    const stdYear = std.academicYear || std.year || '1st Year';
    const matchesYear = selectedYear === 'ALL' || stdYear === selectedYear;

    const matchesDept = selectedDept === 'ALL' || (std.department || '').toUpperCase() === selectedDept.toUpperCase();

    const q = searchTerm.toLowerCase().trim();
    const matchesSearch =
      !q ||
      std.name.toLowerCase().includes(q) ||
      std.registerNumber.toLowerCase().includes(q) ||
      (std.parentMobile && std.parentMobile.includes(q)) ||
      (std.phoneNumber && std.phoneNumber.includes(q)) ||
      (std.studentMobile && std.studentMobile.includes(q));

    // Staff access scope restriction
    if (isStaff) {
      const normY = stdYear;
      const normD = (std.department || '').toUpperCase();
      const inScope = (assignedYears.includes('ALL') || assignedYears.includes(normY)) &&
                      (assignedDepts.includes('ALL') || assignedDepts.includes(normD));
      return matchesYear && matchesDept && matchesSearch && inScope;
    }

    // HOD access scope restriction
    if (isHod && userDept !== 'ALL') {
      const inDept = (std.department || '').toUpperCase() === userDept.toUpperCase();
      return matchesYear && matchesDept && matchesSearch && inDept;
    }

    return matchesYear && matchesDept && matchesSearch;
  });

  return (
    <div id="student-management-view" className="space-y-6 animate-in fade-in duration-200">
      
      {/* Top Institutional Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white border border-slate-200 p-6 rounded-lg shadow-sm">
        <div>
          <div className="flex items-center space-x-2 text-blue-600 font-black text-xs uppercase tracking-widest mb-1">
            <Building2 className="w-4 h-4" />
            <span>VSB ENGINEERING COLLEGE • VY NEXTGEN TECHNOLOGY</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 uppercase tracking-tight">
            Year-Wise & Department-Wise Student Management
          </h2>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Independent cohorts, verified register numbers, parent mobile audit history, and direct Fast2SMS dispatch.
          </p>
        </div>

        {/* Action Buttons Toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          
          {/* Download Student List (.xlsx) */}
          <button
            type="button"
            onClick={downloadStudentList}
            disabled={filteredStudents.length === 0}
            className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded text-xs flex items-center gap-1.5 transition-all uppercase tracking-wider border border-slate-300 disabled:opacity-40"
            title="Download current filtered student list (.xlsx)"
          >
            <Download className="w-4 h-4 text-blue-600" />
            <span>Download Roster</span>
          </button>

          {/* Sample Excel */}
          <button
            type="button"
            onClick={downloadSampleTemplate}
            className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded text-xs flex items-center gap-1.5 transition-all uppercase tracking-wider border border-slate-300"
            title="Download formatted sample spreadsheet template"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            <span>Sample Excel</span>
          </button>

          {/* Upload Excel with Live Preview */}
          <label className="cursor-pointer px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded shadow-sm text-xs flex items-center gap-1.5 transition-all uppercase tracking-wider">
            <Upload className="w-4 h-4" />
            <span>Upload Excel</span>
            <input
              type="file"
              accept=".xlsx, .xls, .csv"
              onChange={handleExcelFileSelected}
              className="hidden"
            />
          </label>

          {/* Audit History (Admin / Staff) */}
          <button
            type="button"
            onClick={openAuditHistoryModal}
            className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded text-xs flex items-center gap-1.5 transition-all uppercase tracking-wider border border-slate-300"
            title="View student modification audit history log"
          >
            <History className="w-4 h-4 text-indigo-600" />
            <span>Audit Trail</span>
          </button>

          {/* Academic Promotion (Admin Only) */}
          {isAdmin && (
            <button
              type="button"
              onClick={openPromotionModal}
              className="px-3 py-2 bg-amber-500 hover:bg-amber-600 text-slate-900 font-black rounded text-xs flex items-center gap-1.5 transition-all uppercase tracking-wider shadow-sm"
              title="Promote students annually (1st->2nd, 2nd->3rd, 3rd->4th, 4th->Graduated)"
            >
              <GraduationCap className="w-4 h-4 text-slate-950" />
              <span>Year Promotion</span>
            </button>
          )}

          {/* Add New Student */}
          <button
            id="student-add-new-btn"
            onClick={openAddModal}
            className="px-4 py-2 bg-[#0f172a] hover:bg-blue-600 text-white font-black rounded shadow-md text-xs uppercase tracking-wider flex items-center gap-1.5 transition-all shrink-0"
          >
            <UserPlus className="w-4 h-4 text-blue-400" />
            <span>+ Add Student</span>
          </button>

          {/* Clear All Students (Admin Only) */}
          {isAdmin && students.length > 0 && (
            <button
              type="button"
              onClick={() => setIsClearAllModalOpen(true)}
              className="px-3.5 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 hover:text-rose-900 border border-rose-300 font-bold rounded shadow-xs text-xs uppercase tracking-wider flex items-center gap-1.5 transition-all shrink-0"
              title="Permanently delete all students from database"
            >
              <Trash2 className="w-4 h-4 text-rose-600" />
              <span>Clear All Students</span>
            </button>
          )}
        </div>
      </div>

      {/* Alert Notifications */}
      {successMsg && (
        <div className="p-4 rounded bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Check className="w-4 h-4 shrink-0 text-emerald-600" />
            <span>{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg(null)} className="text-emerald-700 hover:text-emerald-900 font-bold">✕</button>
        </div>
      )}

      {error && (
        <div className="p-4 rounded bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-rose-700 hover:text-rose-900 font-bold">✕</button>
        </div>
      )}

      {/* Academic Year Tabs (1st Year, 2nd Year, 3rd Year, 4th Year, Graduated) */}
      <div className="bg-white border border-slate-200 rounded-lg p-2 shadow-sm flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1">
          <span className="px-3 py-1.5 text-xs font-black text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
            <GraduationCap className="w-4 h-4 text-blue-600" />
            <span>Academic Year:</span>
          </span>

          {!isStaff && (
            <button
              onClick={() => setSelectedYear('ALL')}
              className={`px-3 py-1.5 text-xs font-black rounded transition-all uppercase tracking-wider ${
                selectedYear === 'ALL'
                  ? 'bg-blue-600 text-white shadow'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              All Years ({students.length})
            </button>
          )}

          {ACADEMIC_YEARS.map((yr) => {
            const count = students.filter(s => (s.academicYear || s.year || '1st Year') === yr).length;
            const isAssigned = !isStaff || assignedYears.includes('ALL') || assignedYears.includes(yr);
            if (!isAssigned) return null;

            return (
              <button
                key={yr}
                onClick={() => setSelectedYear(yr)}
                className={`px-3.5 py-1.5 text-xs font-black rounded transition-all uppercase tracking-wider flex items-center gap-1.5 ${
                  selectedYear === yr
                    ? 'bg-blue-600 text-white shadow'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                <span>{yr}</span>
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                  selectedYear === yr ? 'bg-blue-700 text-white' : 'bg-slate-200 text-slate-800'
                }`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {isStaff && (
          <div className="text-[11px] font-bold text-blue-700 bg-blue-50 px-2.5 py-1 rounded border border-blue-200">
            Assigned Scope: {assignedYears.join(', ')} • {assignedDepts.join(', ')}
          </div>
        )}
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-white border border-slate-200 p-4 rounded-lg shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
        
        {/* Search Input */}
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          <input
            id="student-search-input"
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search Name, Reg No, or Mobile..."
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded text-slate-900 placeholder-slate-400 text-xs font-medium focus:outline-none focus:border-blue-600 focus:bg-white"
          />
        </div>

        {/* Filter by Department */}
        <div className="flex items-center space-x-1.5 w-full md:w-auto overflow-x-auto pb-1 md:pb-0">
          <Filter className="w-4 h-4 text-slate-400 shrink-0" />
          <span className="text-xs text-slate-500 shrink-0 font-bold uppercase tracking-wider">Dept:</span>
          
          {!isHod && !isStaff && (
            <button
              onClick={() => setSelectedDept('ALL')}
              className={`px-2.5 py-1 text-xs font-bold rounded transition-all shrink-0 uppercase tracking-wider ${
                selectedDept === 'ALL'
                  ? 'bg-blue-600 text-white shadow'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              ALL
            </button>
          )}

          {DEPARTMENTS.map((dept) => {
            if (isStaff && !assignedDepts.includes('ALL') && !assignedDepts.includes(dept)) {
              return null;
            }
            if (isHod && userDept !== 'ALL' && dept !== userDept) {
              return null;
            }

            return (
              <button
                key={dept}
                onClick={() => setSelectedDept(dept)}
                className={`px-2.5 py-1 text-xs font-bold rounded transition-all shrink-0 uppercase tracking-wider ${
                  selectedDept === dept
                    ? 'bg-blue-600 text-white shadow'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {dept}
              </button>
            );
          })}
        </div>
      </div>

      {/* Students Data Table */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-sm">
        <div className="p-4 bg-[#0f172a] text-white flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center space-x-2">
            <Users className="w-4 h-4 text-blue-400" />
            <h3 className="text-xs font-black uppercase tracking-widest">
              Student Records ({filteredStudents.length} Records In Scope)
            </h3>
          </div>
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            {students.length === 0 ? 'Database Empty' : `Showing ${filteredStudents.length} of ${students.length} Total`}
          </span>
        </div>

        {filteredStudents.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-50 text-slate-600 uppercase text-[10px] font-black tracking-wider border-b border-slate-200">
                <tr>
                  <th className="px-5 py-3 font-black">Register Number</th>
                  <th className="px-5 py-3 font-black">Student Name</th>
                  <th className="px-5 py-3 font-black">Department</th>
                  <th className="px-5 py-3 font-black">Academic Year</th>
                  <th className="px-5 py-3 font-black">Parent Mobile</th>
                  <th className="px-5 py-3 font-black">Student Mobile</th>
                  <th className="px-5 py-3 font-black text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredStudents.map((std) => (
                  <tr key={std.id} className="hover:bg-slate-50/80 transition-colors">
                    
                    {/* Register Number */}
                    <td className="px-5 py-3.5 font-mono font-black text-blue-700 text-xs">
                      {std.registerNumber}
                    </td>

                    {/* Student Name */}
                    <td className="px-5 py-3.5 font-black text-slate-900">
                      {std.name}
                      {std.section && (
                        <span className="ml-1.5 px-1.5 py-0.2 bg-slate-100 text-slate-600 text-[10px] rounded font-bold">
                          Sec {std.section}
                        </span>
                      )}
                    </td>

                    {/* Department */}
                    <td className="px-5 py-3.5">
                      <span className="px-2 py-0.5 bg-slate-900 text-white font-bold text-[10px] rounded uppercase tracking-wider">
                        {std.department}
                      </span>
                    </td>

                    {/* Academic Year */}
                    <td className="px-5 py-3.5">
                      <span className="px-2 py-0.5 bg-blue-50 text-blue-800 font-bold text-[10px] rounded border border-blue-200">
                        {std.academicYear || std.year || '1st Year'}
                      </span>
                    </td>

                    {/* Parent Mobile with Quick Edit Button */}
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono font-bold text-slate-900">
                          {std.parentMobile || std.phoneNumber || '-'}
                        </span>
                        <button
                          onClick={() => openQuickPhoneCorrection(std)}
                          title="Quick Correct Parent Mobile Number"
                          className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                        >
                          <PhoneCall className="w-3 h-3" />
                        </button>
                      </div>
                    </td>

                    {/* Student Mobile */}
                    <td className="px-5 py-3.5 font-mono text-slate-600 font-medium">
                      {std.studentMobile || '-'}
                    </td>

                    {/* Actions */}
                    <td className="px-5 py-3.5 text-right space-x-1.5 whitespace-nowrap">
                      {onSendSmsToStudent && (
                        <button
                          onClick={() => onSendSmsToStudent(std)}
                          title="Send SMS notification to parent"
                          className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded transition-all font-black text-[10px] uppercase tracking-wider inline-flex items-center gap-1 shadow-sm"
                        >
                          <Send className="w-3 h-3" />
                          <span>SMS</span>
                        </button>
                      )}
                      
                      <button
                        onClick={() => setViewingStudent(std)}
                        title="View Full Profile"
                        className="p-1 text-slate-500 hover:text-blue-600 hover:bg-slate-100 rounded transition-colors inline-block"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>

                      <button
                        onClick={() => openEditModal(std)}
                        title="Edit Student Information"
                        className="p-1 text-slate-500 hover:text-amber-600 hover:bg-slate-100 rounded transition-colors inline-block"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>

                      <button
                        onClick={() => handleDeleteStudent(std)}
                        title="Delete Student"
                        className="p-1 text-slate-500 hover:text-rose-600 hover:bg-slate-100 rounded transition-colors inline-block"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>

                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-12 text-center space-y-3">
            <Users className="w-10 h-10 mx-auto text-slate-300" />
            <h4 className="text-sm font-black text-slate-800 uppercase tracking-wider">No Students Found</h4>
            <p className="text-xs text-slate-500 max-w-sm mx-auto font-medium">
              No students match academic year "{selectedYear}" and department "{selectedDept}". Upload an Excel spreadsheet or click "Add Student" to create records.
            </p>
            <button
              onClick={openAddModal}
              className="mt-2 px-4 py-2 bg-[#0f172a] hover:bg-blue-600 text-white font-black text-xs rounded uppercase tracking-wider shadow-md"
            >
              Add Student to {selectedYear === 'ALL' ? '1st Year' : selectedYear}
            </button>
          </div>
        )}
      </div>

      {/* QUICK PARENT MOBILE CORRECTION MODAL */}
      {quickPhoneStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-sm bg-white border border-slate-200 rounded-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in-95">
            <div className="p-4 bg-[#0f172a] text-white flex items-center justify-between">
              <h3 className="text-xs font-black uppercase tracking-wider flex items-center gap-2">
                <PhoneCall className="w-4 h-4 text-emerald-400" />
                <span>Parent Mobile Correction</span>
              </h3>
              <button onClick={() => setQuickPhoneStudent(null)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveQuickPhone} className="p-5 space-y-4">
              <div className="bg-slate-50 p-3 rounded border border-slate-200 text-xs space-y-1">
                <div>
                  <span className="text-slate-500 font-bold uppercase text-[10px]">Student: </span>
                  <strong className="text-slate-900">{quickPhoneStudent.name}</strong>
                </div>
                <div>
                  <span className="text-slate-500 font-bold uppercase text-[10px]">Register No: </span>
                  <span className="font-mono font-bold text-blue-700">{quickPhoneStudent.registerNumber}</span>
                </div>
                <div>
                  <span className="text-slate-500 font-bold uppercase text-[10px]">Year / Dept: </span>
                  <span className="font-medium text-slate-700">{quickPhoneStudent.academicYear || '1st Year'} • {quickPhoneStudent.department}</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-black text-slate-700 uppercase tracking-wider mb-1">
                  Correct 10-Digit Parent Mobile Number *
                </label>
                <input
                  type="tel"
                  maxLength={10}
                  value={quickPhoneValue}
                  onChange={(e) => setQuickPhoneValue(e.target.value)}
                  placeholder="e.g. 9876543210"
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded text-slate-900 font-mono text-sm font-bold focus:outline-none focus:border-blue-600 focus:bg-white"
                  required
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  All corrections are logged to the MongoDB audit trail with your timestamp and staff ID.
                </p>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setQuickPhoneStudent(null)}
                  className="px-3 py-1.5 bg-slate-100 text-slate-700 text-xs font-bold rounded border border-slate-300 hover:bg-slate-200 uppercase"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-black rounded uppercase shadow transition-all"
                >
                  {loading ? 'Saving...' : 'Save & Log Audit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ADD / EDIT STUDENT MODAL */}
      {(isAddModalOpen || editingStudent) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg bg-white border border-slate-200 rounded-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in-95">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-[#0f172a] text-white">
              <h3 className="text-xs font-black uppercase tracking-wider flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-blue-400" />
                <span>{editingStudent ? 'Edit Student Details & Update Record' : 'Register New Student'}</span>
              </h3>
              <button
                onClick={() => {
                  setIsAddModalOpen(false);
                  setEditingStudent(null);
                }}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveStudent} className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
              {error && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold rounded flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
                  <span>{error}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                
                {/* Full Student Name */}
                <div>
                  <label className="block text-xs font-black text-slate-700 uppercase tracking-wider mb-1">
                    Student Name *
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g. S. Ananya"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded text-slate-900 text-xs font-bold focus:outline-none focus:border-blue-600 focus:bg-white"
                    required
                  />
                </div>

                {/* Register Number */}
                <div>
                  <label className="block text-xs font-black text-slate-700 uppercase tracking-wider mb-1">
                    Register Number *
                  </label>
                  <input
                    type="text"
                    value={formData.registerNumber}
                    onChange={(e) => setFormData({ ...formData, registerNumber: e.target.value.toUpperCase() })}
                    placeholder="e.g. 921321104001"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded text-slate-900 font-mono text-xs font-bold focus:outline-none focus:border-blue-600 focus:bg-white"
                    required
                  />
                </div>

                {/* Academic Year */}
                <div>
                  <label className="block text-xs font-black text-slate-700 uppercase tracking-wider mb-1">
                    Academic Year *
                  </label>
                  <select
                    value={formData.academicYear}
                    onChange={(e) => setFormData({ ...formData, academicYear: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded text-slate-900 text-xs font-bold focus:outline-none focus:border-blue-600 focus:bg-white"
                  >
                    {ACADEMIC_YEARS.map((yr) => {
                      if (isStaff && !assignedYears.includes('ALL') && !assignedYears.includes(yr)) return null;
                      return (
                        <option key={yr} value={yr}>
                          {yr}
                        </option>
                      );
                    })}
                  </select>
                </div>

                {/* Department */}
                <div>
                  <label className="block text-xs font-black text-slate-700 uppercase tracking-wider mb-1">
                    Department *
                  </label>
                  <select
                    value={formData.department}
                    onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded text-slate-900 text-xs font-bold focus:outline-none focus:border-blue-600 focus:bg-white"
                  >
                    {DEPARTMENTS.map((dept) => {
                      if (isStaff && !assignedDepts.includes('ALL') && !assignedDepts.includes(dept)) return null;
                      return (
                        <option key={dept} value={dept}>
                          {dept}
                        </option>
                      );
                    })}
                  </select>
                </div>

                {/* Parent Mobile Number */}
                <div>
                  <label className="block text-xs font-black text-slate-700 uppercase tracking-wider mb-1">
                    Parent Mobile Number *
                  </label>
                  <input
                    type="tel"
                    maxLength={10}
                    value={formData.parentMobile}
                    onChange={(e) => setFormData({ ...formData, parentMobile: e.target.value })}
                    placeholder="10-digit mobile"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded text-slate-900 font-mono text-xs font-bold focus:outline-none focus:border-blue-600 focus:bg-white"
                    required
                  />
                </div>

                {/* Student Mobile Number */}
                <div>
                  <label className="block text-xs font-black text-slate-700 uppercase tracking-wider mb-1">
                    Student Mobile (Optional)
                  </label>
                  <input
                    type="tel"
                    maxLength={10}
                    value={formData.studentMobile}
                    onChange={(e) => setFormData({ ...formData, studentMobile: e.target.value })}
                    placeholder="10-digit mobile"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded text-slate-900 font-mono text-xs focus:outline-none focus:border-blue-600 focus:bg-white"
                  />
                </div>

                {/* Email */}
                <div>
                  <label className="block text-xs font-black text-slate-700 uppercase tracking-wider mb-1">
                    Student Email (Optional)
                  </label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="student@vsbec.ac.in"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded text-slate-900 text-xs focus:outline-none focus:border-blue-600 focus:bg-white"
                  />
                </div>

                {/* Gender & Section */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-black text-slate-700 uppercase tracking-wider mb-1">
                      Gender
                    </label>
                    <select
                      value={formData.gender}
                      onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded text-slate-900 text-xs font-bold focus:outline-none focus:border-blue-600 focus:bg-white"
                    >
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-black text-slate-700 uppercase tracking-wider mb-1">
                      Section
                    </label>
                    <input
                      type="text"
                      value={formData.section}
                      onChange={(e) => setFormData({ ...formData, section: e.target.value.toUpperCase() })}
                      placeholder="e.g. A"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded text-slate-900 text-xs font-bold uppercase focus:outline-none focus:border-blue-600 focus:bg-white"
                    />
                  </div>
                </div>

              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsAddModalOpen(false);
                    setEditingStudent(null);
                  }}
                  className="px-4 py-2 bg-slate-100 text-slate-700 text-xs font-bold rounded border border-slate-300 hover:bg-slate-200 uppercase tracking-wider"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-5 py-2 bg-[#0f172a] hover:bg-blue-600 text-white text-xs font-black rounded uppercase tracking-wider shadow-md transition-all"
                >
                  {loading ? 'Saving...' : editingStudent ? 'Update Details' : 'Save Student Record'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EXCEL PREVIEW & VALIDATION MODAL */}
      {isPreviewModalOpen && previewData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="bg-white border border-slate-300 w-full max-w-5xl max-h-[90vh] rounded-lg shadow-2xl flex flex-col overflow-hidden">
            
            {/* Modal Header */}
            <div className="bg-[#0f172a] text-white p-4 flex items-center justify-between border-b border-slate-800">
              <div className="flex items-center space-x-2">
                <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
                <div>
                  <h3 className="text-xs font-black uppercase tracking-wider text-emerald-400">
                    Excel Student Upload • Validation & Preview
                  </h3>
                  <p className="text-[11px] text-slate-400 font-mono">
                    File: <span className="text-white font-bold">{previewSourceName}</span> ({previewData.totalCount} records parsed)
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                {previewData.invalidCount > 0 && (
                  <button
                    type="button"
                    onClick={downloadFailedRecords}
                    className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs uppercase tracking-wider rounded transition-all"
                  >
                    Download Failed ({previewData.invalidCount})
                  </button>
                )}

                <button
                  type="button"
                  onClick={confirmUploadExcelToServer}
                  disabled={excelUploadLoading}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs uppercase tracking-wider rounded flex items-center gap-1.5 transition-all shadow"
                >
                  <Upload className="w-4 h-4" />
                  <span>{excelUploadLoading ? 'Importing...' : `Import ${previewData.validCount} Valid Students`}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setIsPreviewModalOpen(false);
                    setExcelFile(null);
                    setPreviewData(null);
                  }}
                  className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs uppercase rounded transition-all"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Validation Metrics Bar */}
            <div className="bg-slate-50 border-b border-slate-200 p-3 px-6 flex flex-wrap items-center justify-between gap-4 text-xs">
              <div className="flex items-center space-x-4">
                <div>
                  <span className="text-slate-500 font-bold uppercase text-[10px] block">Total Rows</span>
                  <strong className="text-slate-900 font-black text-sm">{previewData.totalCount}</strong>
                </div>
                <div>
                  <span className="text-slate-500 font-bold uppercase text-[10px] block">Ready to Import</span>
                  <strong className="text-emerald-700 font-black text-sm">{previewData.validCount}</strong>
                </div>
                <div>
                  <span className="text-slate-500 font-bold uppercase text-[10px] block">Invalid / Errors</span>
                  <strong className="text-rose-700 font-black text-sm">{previewData.invalidCount}</strong>
                </div>
                <div>
                  <span className="text-slate-500 font-bold uppercase text-[10px] block">Duplicates in File</span>
                  <strong className="text-amber-700 font-black text-sm">{previewData.duplicateCountInFile}</strong>
                </div>
                <div>
                  <span className="text-slate-500 font-bold uppercase text-[10px] block">Updates in DB</span>
                  <strong className="text-blue-700 font-black text-sm">{previewData.duplicateCountInDb}</strong>
                </div>
              </div>

              <div className="text-right text-[11px] text-slate-500 font-medium">
                Unique Register Number guaranteed. Existing records will be updated automatically.
              </div>
            </div>

            {/* Preview Table */}
            <div className="p-4 overflow-y-auto max-h-[60vh]">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-[#0f172a] text-amber-400 font-black uppercase text-[10px] tracking-wider sticky top-0">
                    <th className="p-2 border border-slate-800 text-center">Row</th>
                    <th className="p-2 border border-slate-800">Register Number</th>
                    <th className="p-2 border border-slate-800">Student Name</th>
                    <th className="p-2 border border-slate-800">Department</th>
                    <th className="p-2 border border-slate-800">Academic Year</th>
                    <th className="p-2 border border-slate-800">Parent Mobile</th>
                    <th className="p-2 border border-slate-800 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {previewData.rows.map((r, i) => (
                    <tr key={i} className={r.isValid ? 'hover:bg-slate-50' : 'bg-rose-50/60 hover:bg-rose-100/60'}>
                      <td className="p-2 border border-slate-200 text-center font-mono font-bold text-slate-500">{r.rowNumber}</td>
                      <td className="p-2 border border-slate-200 font-mono font-black text-slate-900">{r.registerNumber || '-'}</td>
                      <td className="p-2 border border-slate-200 font-black text-slate-900">{r.name || '-'}</td>
                      <td className="p-2 border border-slate-200 font-bold text-blue-700">{r.department}</td>
                      <td className="p-2 border border-slate-200 font-bold text-slate-700">{r.academicYear}</td>
                      <td className="p-2 border border-slate-200 font-mono font-bold">{r.parentMobile || '-'}</td>
                      <td className="p-2 border border-slate-200 text-center">
                        {r.isValid ? (
                          <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded font-bold text-[10px] inline-flex items-center gap-1">
                            <Check className="w-3 h-3 text-emerald-600" />
                            {r.existsInDb ? 'Will Update' : 'Valid New'}
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 bg-rose-100 text-rose-800 rounded font-bold text-[10px] inline-flex items-center gap-1" title={r.errors?.join('; ')}>
                            <AlertCircle className="w-3 h-3 text-rose-600" />
                            {r.errors?.[0] || 'Invalid'}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Modal Footer */}
            <div className="bg-slate-100 border-t border-slate-200 p-4 flex items-center justify-between">
              <span className="text-xs text-slate-500 font-bold">
                Target Platform: VSB Engineering College MongoDB Database
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsPreviewModalOpen(false);
                    setExcelFile(null);
                    setPreviewData(null);
                  }}
                  className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold text-xs uppercase rounded"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmUploadExcelToServer}
                  disabled={excelUploadLoading}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs uppercase rounded shadow flex items-center gap-1.5"
                >
                  <Upload className="w-4 h-4" />
                  <span>{excelUploadLoading ? 'Importing...' : 'Save Valid Students'}</span>
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* AUDIT HISTORY MODAL */}
      {isAuditModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-4xl bg-white border border-slate-200 rounded-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in-95">
            <div className="p-4 bg-[#0f172a] text-white flex items-center justify-between border-b border-slate-800">
              <div className="flex items-center space-x-2">
                <History className="w-5 h-5 text-indigo-400" />
                <div>
                  <h3 className="text-xs font-black uppercase tracking-wider text-indigo-300">
                    Student Modification Audit Trail
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    All staff and admin edits logged permanently in MongoDB
                  </p>
                </div>
              </div>
              <button onClick={() => setIsAuditModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between gap-4">
              <div className="relative w-72">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={auditSearchReg}
                  onChange={(e) => setAuditSearchReg(e.target.value)}
                  placeholder="Filter by Register Number..."
                  className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded font-mono"
                />
              </div>

              <button
                onClick={openAuditHistoryModal}
                className="text-xs text-blue-600 hover:text-blue-800 font-bold flex items-center gap-1"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Refresh Log</span>
              </button>
            </div>

            <div className="p-4 max-h-[60vh] overflow-y-auto">
              {auditLoading ? (
                <div className="p-8 text-center text-slate-500 font-bold text-xs uppercase animate-pulse">
                  Loading Audit Logs from MongoDB...
                </div>
              ) : auditHistories.length === 0 ? (
                <div className="p-8 text-center text-slate-400 font-bold text-xs uppercase">
                  No modification history logged yet. Edits made to student records will be recorded here.
                </div>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#0f172a] text-amber-400 uppercase text-[10px] font-black">
                    <tr>
                      <th className="p-2.5">Date & Time</th>
                      <th className="p-2.5">Register No</th>
                      <th className="p-2.5">Modified By</th>
                      <th className="p-2.5">Field</th>
                      <th className="p-2.5">Previous Value</th>
                      <th className="p-2.5">Updated Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {auditHistories
                      .filter((h) => !auditSearchReg || h.registerNumber.includes(auditSearchReg.toUpperCase()))
                      .map((h, i) => (
                        <tr key={i} className="hover:bg-slate-50">
                          <td className="p-2.5 text-slate-500 font-mono text-[11px]">
                            {new Date(h.timestamp).toLocaleString()}
                          </td>
                          <td className="p-2.5 font-mono font-black text-blue-700">
                            {h.registerNumber}
                          </td>
                          <td className="p-2.5 font-bold text-slate-800">
                            {h.modifiedByName || h.modifiedBy} ({h.modifiedByRole})
                          </td>
                          <td className="p-2.5 font-bold text-purple-700 uppercase text-[10px]">
                            {h.fieldName}
                          </td>
                          <td className="p-2.5 font-mono text-slate-500 line-through text-[11px]">
                            {h.previousValue || '(empty)'}
                          </td>
                          <td className="p-2.5 font-mono text-emerald-700 font-bold text-[11px]">
                            {h.updatedValue}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="bg-slate-100 p-3 text-right">
              <button
                type="button"
                onClick={() => setIsAuditModalOpen(false)}
                className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs uppercase rounded"
              >
                Close Audit Log
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ANNUAL PROMOTION MODAL (ADMIN ONLY) */}
      {isPromotionModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-2xl bg-white border border-slate-200 rounded-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in-95">
            <div className="p-4 bg-[#0f172a] text-white flex items-center justify-between border-b border-slate-800">
              <div className="flex items-center space-x-2">
                <GraduationCap className="w-5 h-5 text-amber-400" />
                <div>
                  <h3 className="text-xs font-black uppercase tracking-wider text-amber-400">
                    Annual Academic Year Promotion
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Automated progression across 1st, 2nd, 3rd, and 4th Year cohorts
                  </p>
                </div>
              </div>
              <button onClick={() => setIsPromotionModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
              
              <div className="bg-amber-50 border border-amber-200 p-4 rounded text-xs space-y-2">
                <h4 className="font-black text-amber-900 uppercase">Promotion Progression Sequence:</h4>
                <ul className="space-y-1 text-amber-800 list-disc list-inside">
                  <li><strong>4th Year</strong> → <strong>Graduated (Alumni Archive)</strong></li>
                  <li><strong>3rd Year</strong> → <strong>4th Year</strong></li>
                  <li><strong>2nd Year</strong> → <strong>3rd Year</strong></li>
                  <li><strong>1st Year</strong> → <strong>2nd Year</strong></li>
                </ul>
              </div>

              <div>
                <label className="block text-xs font-black text-slate-700 uppercase tracking-wider mb-1">
                  Academic Session Name *
                </label>
                <input
                  type="text"
                  value={promotionSession}
                  onChange={(e) => setPromotionSession(e.target.value)}
                  placeholder="e.g. 2026-2027"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded font-bold text-xs"
                />
              </div>

              {promotionPreview && (
                <div className="border border-slate-200 rounded p-4 bg-slate-50 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-black text-slate-900 uppercase">
                      Eligible Students Preview ({promotionPreview.eligibleTotal ?? promotionPreview.totalEligible ?? 0} Students)
                    </h4>
                    {onNavigateToPromotion && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsPromotionModalOpen(false);
                          onNavigateToPromotion();
                        }}
                        className="text-[11px] font-black text-blue-700 hover:text-blue-900 uppercase underline cursor-pointer"
                      >
                        Open Full Student Selection Console →
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-4 gap-2 text-center">
                    <div className="bg-white p-2.5 rounded border border-slate-200">
                      <div className="text-[10px] text-slate-500 font-bold uppercase">1st → 2nd</div>
                      <div className="text-lg font-black text-blue-700">
                        {promotionPreview.yearBreakdown?.['1st Year'] ?? promotionPreview.breakdown?.['1st Year'] ?? 0}
                      </div>
                    </div>
                    <div className="bg-white p-2.5 rounded border border-slate-200">
                      <div className="text-[10px] text-slate-500 font-bold uppercase">2nd → 3rd</div>
                      <div className="text-lg font-black text-emerald-700">
                        {promotionPreview.yearBreakdown?.['2nd Year'] ?? promotionPreview.breakdown?.['2nd Year'] ?? 0}
                      </div>
                    </div>
                    <div className="bg-white p-2.5 rounded border border-slate-200">
                      <div className="text-[10px] text-slate-500 font-bold uppercase">3rd → 4th</div>
                      <div className="text-lg font-black text-purple-700">
                        {promotionPreview.yearBreakdown?.['3rd Year'] ?? promotionPreview.breakdown?.['3rd Year'] ?? 0}
                      </div>
                    </div>
                    <div className="bg-white p-2.5 rounded border border-slate-200">
                      <div className="text-[10px] text-slate-500 font-bold uppercase">4th → Graduated</div>
                      <div className="text-lg font-black text-amber-700">
                        {promotionPreview.yearBreakdown?.['4th Year'] ?? promotionPreview.breakdown?.['4th Year'] ?? 0}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {confirmPromotionStep ? (
                <div className="p-3 bg-red-50 border border-red-200 rounded text-red-900 space-y-2">
                  <p className="font-bold">
                    Are you sure you want to promote all eligible students for session <strong>{promotionSession}</strong>?
                    Students in 4th Year will be transitioned to 'Graduated' status. All register numbers, historical SMS, and exam records are permanently preserved.
                  </p>
                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setConfirmPromotionStep(false)}
                      className="px-3 py-1.5 bg-white border border-slate-300 text-slate-700 rounded text-xs font-bold uppercase"
                    >
                      Back
                    </button>
                    <button
                      type="button"
                      onClick={handleExecutePromotion}
                      disabled={promotionLoading}
                      className="px-4 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded text-xs font-black uppercase shadow cursor-pointer"
                    >
                      {promotionLoading ? 'Promoting...' : 'Confirm & Promote'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="pt-2 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsPromotionModalOpen(false)}
                    className="px-4 py-2 bg-slate-100 text-slate-700 text-xs font-bold rounded border border-slate-300 hover:bg-slate-200 uppercase"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmPromotionStep(true)}
                    disabled={promotionLoading}
                    className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-xs rounded uppercase shadow transition-all cursor-pointer"
                  >
                    {`Execute ${promotionSession} Promotion`}
                  </button>
                </div>
              )}

            </div>
          </div>
        </div>
      )}

      {/* VIEW STUDENT PROFILE MODAL */}
      {viewingStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in-95">
            <div className="p-4 bg-[#0f172a] text-white flex items-center justify-between">
              <h3 className="text-xs font-black uppercase tracking-wider flex items-center gap-2">
                <Users className="w-4 h-4 text-blue-400" />
                <span>Student Record Profile</span>
              </h3>
              <button onClick={() => setViewingStudent(null)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-3 text-xs">
              <div className="flex justify-between border-b border-slate-100 pb-2">
                <span className="text-slate-500 font-bold uppercase">Student Name:</span>
                <span className="font-black text-slate-900">{viewingStudent.name}</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 pb-2">
                <span className="text-slate-500 font-bold uppercase">Register Number:</span>
                <span className="font-mono font-black text-blue-700">{viewingStudent.registerNumber}</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 pb-2">
                <span className="text-slate-500 font-bold uppercase">Department:</span>
                <span className="font-bold text-slate-900">{viewingStudent.department}</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 pb-2">
                <span className="text-slate-500 font-bold uppercase">Academic Year:</span>
                <span className="font-bold text-blue-700">{viewingStudent.academicYear || viewingStudent.year || '1st Year'}</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 pb-2">
                <span className="text-slate-500 font-bold uppercase">Parent Mobile:</span>
                <span className="font-mono font-bold text-slate-900">{viewingStudent.parentMobile || viewingStudent.phoneNumber || '-'}</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 pb-2">
                <span className="text-slate-500 font-bold uppercase">Student Mobile:</span>
                <span className="font-mono text-slate-700">{viewingStudent.studentMobile || '-'}</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 pb-2">
                <span className="text-slate-500 font-bold uppercase">Email:</span>
                <span className="text-slate-700">{viewingStudent.email || '-'}</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 pb-2">
                <span className="text-slate-500 font-bold uppercase">Gender / Section:</span>
                <span className="text-slate-700">{viewingStudent.gender || 'Not specified'} • Sec {viewingStudent.section || 'A'}</span>
              </div>
              <div className="flex justify-between pt-1">
                <span className="text-slate-500 font-bold uppercase">Enrollment Date:</span>
                <span className="text-slate-500 font-mono text-[11px]">{new Date(viewingStudent.createdAt).toLocaleDateString()}</span>
              </div>
            </div>

            <div className="bg-slate-100 p-3 flex justify-end gap-2">
              <button
                onClick={() => {
                  const s = viewingStudent;
                  setViewingStudent(null);
                  openEditModal(s);
                }}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs uppercase rounded"
              >
                Edit Student
              </button>
              <button
                onClick={() => setViewingStudent(null)}
                className="px-3 py-1.5 bg-slate-200 text-slate-800 font-bold text-xs uppercase rounded"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {deletingStudent && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-2xl max-w-md w-full border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95">
            <div className="bg-rose-600 p-4 text-white flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Trash2 className="w-5 h-5 text-rose-100" />
                <h3 className="font-black text-sm uppercase tracking-wider">Confirm Delete Student</h3>
              </div>
              <button onClick={() => setDeletingStudent(null)} className="text-rose-200 hover:text-white">✕</button>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-sm text-slate-700">
                Are you sure you want to permanently delete <strong>{deletingStudent.name}</strong> (Register No: <span className="font-mono text-blue-700 font-black">{deletingStudent.registerNumber}</span>) from the college database?
              </p>
              <div className="bg-rose-50 border border-rose-200 rounded p-3 text-xs text-rose-800 font-medium">
                This will delete the student and remove them from future attendance and SMS dispatches.
              </div>
            </div>

            <div className="bg-slate-100 p-4 flex justify-end space-x-2">
              <button
                onClick={() => setDeletingStudent(null)}
                className="px-4 py-2 bg-white border border-slate-300 text-slate-700 font-bold text-xs uppercase rounded hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteStudent}
                disabled={loading}
                className="px-5 py-2 bg-rose-600 text-white font-black text-xs uppercase rounded hover:bg-rose-700 shadow"
              >
                {loading ? 'Deleting...' : 'Permanently Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CLEAR ALL STUDENTS CONFIRMATION MODAL */}
      {isClearAllModalOpen && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-2xl max-w-md w-full border border-rose-300 overflow-hidden animate-in fade-in zoom-in-95">
            <div className="bg-rose-700 p-4 text-white flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Trash2 className="w-5 h-5 text-rose-200" />
                <h3 className="font-black text-sm uppercase tracking-wider">Permanently Delete All Students</h3>
              </div>
              <button onClick={() => setIsClearAllModalOpen(false)} className="text-rose-200 hover:text-white">✕</button>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-sm text-slate-800 font-medium">
                Are you sure you want to permanently delete <strong>ALL {students.length} student records</strong> from the college database?
              </p>
              <div className="bg-rose-50 border border-rose-200 rounded p-3 text-xs text-rose-900 space-y-1">
                <p className="font-bold">⚠️ Warning: Permanent Action</p>
                <p>This will erase all active student records from both the local store and MongoDB. All students added after this operation will be permanently saved.</p>
              </div>
            </div>

            <div className="bg-slate-100 p-4 flex justify-end space-x-2">
              <button
                type="button"
                onClick={() => setIsClearAllModalOpen(false)}
                className="px-4 py-2 bg-white border border-slate-300 text-slate-700 font-bold text-xs uppercase rounded hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmClearAllStudents}
                disabled={loading}
                className="px-5 py-2 bg-rose-600 text-white font-black text-xs uppercase rounded hover:bg-rose-700 shadow disabled:opacity-50"
              >
                {loading ? 'Deleting All...' : 'Yes, Permanently Delete All'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
