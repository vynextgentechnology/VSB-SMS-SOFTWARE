import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { Student, Department, User } from '../types';
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
} from 'lucide-react';

interface StudentManagementProps {
  students: Student[];
  departments?: Department[];
  currentUser?: User | null;
  onRefresh: () => void;
  onSendSmsToStudent?: (student: Student) => void;
}

const DEFAULT_DEPT_CODES = ['AIML', 'AIDS', 'CSE', 'CCE', 'ECE', 'EEE', 'MECH', 'CSBS', 'CHEMICAL', 'CIVIL'];

export const StudentManagement: React.FC<StudentManagementProps> = ({
  students,
  departments,
  currentUser,
  onRefresh,
  onSendSmsToStudent,
}) => {
  const isDepartmentRestricted = currentUser && (currentUser.role === 'hod' || currentUser.role === 'staff');
  const userDept = currentUser?.department || 'CSE';

  const DEPARTMENTS = departments && departments.length > 0 ? departments.map((d) => d.code) : DEFAULT_DEPT_CODES;
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDept, setSelectedDept] = useState<string>(isDepartmentRestricted ? userDept : 'ALL');

  // Modal states
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [deletingStudent, setDeletingStudent] = useState<{ id: string; name: string } | null>(null);

  // Form states
  const [formData, setFormData] = useState({
    name: '',
    registerNumber: '',
    department: userDept,
    phoneNumber: '',
  });

  const [batchText, setBatchText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const openAddModal = () => {
    setFormData({ name: '', registerNumber: '', department: userDept, phoneNumber: '' });
    setError(null);
    setIsAddModalOpen(true);
  };

  const openEditModal = (std: Student) => {
    setEditingStudent(std);
    setFormData({
      name: std.name,
      registerNumber: std.registerNumber,
      department: std.department,
      phoneNumber: std.phoneNumber,
    });
    setError(null);
  };

  const handleSaveStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    if (!formData.name.trim() || !formData.registerNumber.trim() || !formData.phoneNumber.trim()) {
      setError('Name, Register Number, and Phone Number are required.');
      setLoading(false);
      return;
    }

    try {
      if (editingStudent) {
        await api.updateStudent(editingStudent.id, formData);
        setSuccessMsg(`Student ${formData.name} updated successfully!`);
        setEditingStudent(null);
      } else {
        await api.addStudent(formData);
        setSuccessMsg(`Student ${formData.name} registered successfully!`);
        setIsAddModalOpen(false);
      }
      onRefresh();
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      console.log(err);
      if (err?.message) console.log(err.message);
      if (err?.response?.data) console.log(err.response?.data);
      setError(formatErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteStudent = (id: string, name: string) => {
    setDeletingStudent({ id, name });
  };

  const confirmDeleteStudent = async () => {
    if (!deletingStudent) return;
    const { id, name } = deletingStudent;
    try {
      await api.deleteStudent(id);
      setSuccessMsg(`Deleted student ${name}`);
      setDeletingStudent(null);
      onRefresh();
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      console.log(err);
      if (err?.message) console.log(err.message);
      if (err?.response?.data) console.log(err.response?.data);
      setError(formatErrorMessage(err));
    }
  };

  // Excel Preview state
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [previewRecords, setPreviewRecords] = useState<
    Array<{
      sNo: number;
      name: string;
      registerNumber: string;
      department: string;
      phoneNumber: string;
      marks?: string;
      isValid: boolean;
      reason?: string;
    }>
  >([]);
  const [excelUploadLoading, setExcelUploadLoading] = useState(false);

  const downloadSampleTemplate = () => {
    const sampleData = [
      {
        'Register Number': '921321104001',
        'Student Name': 'S. Ananya',
        'Department': 'CSE',
        'Parent Phone Number': '9876543210',
        'Marks': '88',
      },
      {
        'Register Number': '921321104002',
        'Student Name': 'K. Vignesh',
        'Department': 'AIDS',
        'Parent Phone Number': '9123456789',
        'Marks': '92',
      },
    ];

    const ws = XLSX.utils.json_to_sheet(sampleData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'StudentEnrollment');
    XLSX.writeFile(wb, 'VSBEC_Student_Enrollment_Template.xlsx');
  };

  const handleExcelFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setLoading(true);

    try {
      if (!file.name.match(/\.(xlsx|xls|csv)$/i)) {
        throw new Error('Please select a valid Excel spreadsheet file (.xlsx or .xls).');
      }

      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      if (!workbook || !workbook.SheetNames || workbook.SheetNames.length === 0) {
        throw new Error('Uploaded Excel file has no worksheets.');
      }

      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const rawRows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

      if (!rawRows || rawRows.length < 2) {
        throw new Error('Excel file contains no data rows.');
      }

      let headerRowIdx = -1;
      for (let i = 0; i < Math.min(10, rawRows.length); i++) {
        if (rawRows[i] && rawRows[i].some((cell: any) => cell !== null && cell !== undefined && String(cell).trim().length > 0)) {
          headerRowIdx = i;
          break;
        }
      }

      if (headerRowIdx === -1) {
        throw new Error('Could not locate header row in Excel file.');
      }

      const headers = rawRows[headerRowIdx].map((h: any) => (h !== null && h !== undefined ? String(h).trim() : ''));

      let nameIdx = -1;
      let regNoIdx = -1;
      let deptIdx = -1;
      let phoneIdx = -1;
      let marksIdx = -1;

      headers.forEach((h, idx) => {
        const clean = h.toUpperCase().replace(/[^A-Z0-9\s_]/g, '').trim();
        if (/^(REGISTER|REG|REGISTRATION|REGISTER NO|REG NO|REGISTER NUMBER|STUDENT ID|ROLL NO)$/.test(clean) || clean.includes('REGISTER') || clean.includes('REG NO')) {
          regNoIdx = idx;
        } else if (/^(NAME|STUDENT NAME|STUDENT_NAME|FULL NAME)$/.test(clean) || clean.includes('NAME')) {
          nameIdx = idx;
        } else if (/^(DEPARTMENT|DEPT|BRANCH|DEPT CODE)$/.test(clean) || clean.includes('DEPT') || clean.includes('BRANCH')) {
          deptIdx = idx;
        } else if (/^(MOBILE|PHONE|PHONE NUMBER|CONTACT|MOBILE NO|PARENT MOBILE|PARENT PHONE)$/.test(clean) || clean.includes('MOBILE') || clean.includes('PHONE')) {
          phoneIdx = idx;
        } else if (/^(MARKS|MARK|SCORE|RESULT|TOTAL MARKS|GRADE)$/.test(clean) || clean.includes('MARK') || clean.includes('RESULT')) {
          marksIdx = idx;
        }
      });

      if (nameIdx === -1 && headers.length > 0) nameIdx = 0;
      if (regNoIdx === -1 && headers.length > 1) regNoIdx = 1;
      if (deptIdx === -1 && headers.length > 2) deptIdx = 2;
      if (phoneIdx === -1 && headers.length > 3) phoneIdx = 3;

      const records: Array<{
        sNo: number;
        name: string;
        registerNumber: string;
        department: string;
        phoneNumber: string;
        marks?: string;
        isValid: boolean;
        reason?: string;
      }> = [];

      for (let r = headerRowIdx + 1; r < rawRows.length; r++) {
        const row = rawRows[r];
        if (!row || row.length === 0) continue;

        const name = nameIdx >= 0 && row[nameIdx] !== undefined ? String(row[nameIdx]).trim() : '';
        const registerNumber = regNoIdx >= 0 && row[regNoIdx] !== undefined ? String(row[regNoIdx]).trim() : '';
        const department = deptIdx >= 0 && row[deptIdx] !== undefined ? String(row[deptIdx]).trim().toUpperCase() : userDept;
        const phoneNumber = phoneIdx >= 0 && row[phoneIdx] !== undefined ? String(row[phoneIdx]).trim().replace(/[^0-9+]/g, '') : '';
        const marks = marksIdx >= 0 && row[marksIdx] !== undefined ? String(row[marksIdx]).trim() : '';

        if (!name && !registerNumber && !phoneNumber) continue;

        const isValid = Boolean(name && registerNumber && phoneNumber);
        const missingFields: string[] = [];
        if (!registerNumber) missingFields.push('Reg No');
        if (!name) missingFields.push('Name');
        if (!phoneNumber) missingFields.push('Phone');

        records.push({
          sNo: records.length + 1,
          name: name || 'N/A',
          registerNumber: registerNumber || 'N/A',
          department: department || userDept,
          phoneNumber: phoneNumber || 'N/A',
          marks,
          isValid,
          reason: missingFields.length > 0 ? `Missing: ${missingFields.join(', ')}` : undefined,
        });
      }

      if (records.length === 0) {
        throw new Error('No readable student records found in file. Expected headers: Register Number, Student Name, Department, Parent Phone Number.');
      }

      setExcelFile(file);
      setPreviewRecords(records);
      setIsPreviewModalOpen(true);
    } catch (err: any) {
      console.log(err);
      if (err?.message) console.log(err.message);
      if (err?.response?.data) console.log(err.response?.data);
      setError(formatErrorMessage(err));
    } finally {
      setLoading(false);
      e.target.value = '';
    }
  };

  const confirmUploadExcelToServer = async () => {
    if (!excelFile) return;
    setExcelUploadLoading(true);
    setError(null);

    try {
      const res = await api.uploadStudentsExcel(excelFile);
      setSuccessMsg(`Excel upload complete! ${res.added} new students added, ${res.updated} existing records updated.`);
      setIsPreviewModalOpen(false);
      setExcelFile(null);
      setPreviewRecords([]);
      onRefresh();
      setTimeout(() => setSuccessMsg(null), 5000);
    } catch (err: any) {
      console.log(err);
      if (err?.message) console.log(err.message);
      if (err?.response?.data) console.log(err.response?.data);
      setError(formatErrorMessage(err));
    } finally {
      setExcelUploadLoading(false);
    }
  };

  const handleBatchImport = async () => {
    setError(null);
    if (!batchText.trim()) {
      setError('Please enter or paste student data.');
      return;
    }

    setLoading(true);
    try {
      // Parse CSV or tab-separated text or JSON
      const lines = batchText.trim().split('\n');
      const parsedStudents: Omit<Student, 'id' | 'createdAt'>[] = [];

      lines.forEach((line) => {
        const parts = line.split(/,|\t/).map((p) => p.trim());
        if (parts.length >= 4) {
          parsedStudents.push({
            name: parts[0],
            registerNumber: parts[1],
            department: parts[2].toUpperCase(),
            phoneNumber: parts[3],
          });
        }
      });

      if (parsedStudents.length === 0) {
        setError('No valid rows found. Format: Name, Register Number, Department, Phone Number');
        setLoading(false);
        return;
      }

      const res = await api.batchImportStudents(parsedStudents);
      setSuccessMsg(`Successfully imported ${res.addedCount} students (${res.skippedCount} skipped as duplicates).`);
      setIsBatchModalOpen(false);
      setBatchText('');
      onRefresh();
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: any) {
      console.log(err);
      if (err?.message) console.log(err.message);
      if (err?.response?.data) console.log(err.response?.data);
      setError(formatErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  // Filter students
  const filteredStudents = students.filter((std) => {
    const matchesSearch =
      std.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      std.registerNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      std.phoneNumber.includes(searchTerm);

    const targetDept = isDepartmentRestricted ? userDept : selectedDept;
    const matchesDept = targetDept === 'ALL' || std.department.toUpperCase() === targetDept.toUpperCase();

    return matchesSearch && matchesDept;
  });

  return (
    <div id="student-management-view" className="space-y-6 animate-in fade-in duration-200">
      
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white border border-slate-200 p-6 rounded-sm shadow-sm">
        <div>
          <div className="flex items-center space-x-2 text-blue-600 font-black text-xs uppercase tracking-widest mb-1">
            <Building2 className="w-4 h-4" />
            <span>VSB ENGINEERING COLLEGE • VY NEXTGEN TECHNOLOGY</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 uppercase tracking-tight">Student Management Directory</h2>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Add, edit, delete, and import student registration records for institutional SMS notifications.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={downloadSampleTemplate}
            className="px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-sm border border-slate-300 text-xs flex items-center gap-1.5 transition-all uppercase tracking-wider"
            title="Download sample Excel template"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            <span>Sample Excel</span>
          </button>

          <label className="cursor-pointer px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-sm shadow-sm text-xs flex items-center gap-2 transition-all uppercase tracking-wider">
            <Upload className="w-4 h-4" />
            <span>Upload Excel (.xlsx)</span>
            <input
              type="file"
              accept=".xlsx, .xls, .csv"
              onChange={handleExcelFileSelected}
              className="hidden"
            />
          </label>

          <button
            id="student-batch-import-btn"
            onClick={() => setIsBatchModalOpen(true)}
            className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-sm border border-slate-300 text-xs flex items-center gap-2 transition-all uppercase tracking-wider"
          >
            <Upload className="w-4 h-4 text-blue-600" />
            <span>Batch Text/CSV</span>
          </button>

          <button
            id="student-add-new-btn"
            onClick={openAddModal}
            className="px-5 py-2.5 bg-[#0f172a] hover:bg-blue-600 text-white font-black rounded-sm shadow-md text-xs uppercase tracking-widest flex items-center gap-2 transition-all shrink-0"
          >
            <UserPlus className="w-4 h-4" />
            <span>Add New Student</span>
          </button>
        </div>
      </div>

      {/* Alert Notifications */}
      {successMsg && (
        <div className="p-4 rounded-sm bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Check className="w-4 h-4 shrink-0 text-emerald-600" />
            <span>{successMsg}</span>
          </div>
        </div>
      )}

      {/* Filter & Search Bar */}
      <div className="bg-white border border-slate-200 p-4 rounded-sm shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Search Bar */}
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          <input
            id="student-search-input"
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by Name or Register No..."
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-sm text-slate-900 placeholder-slate-400 text-xs font-medium focus:outline-none focus:border-blue-600 focus:bg-white"
          />
        </div>

        {/* Filter by Department */}
        <div className="flex items-center space-x-2 w-full md:w-auto overflow-x-auto pb-1 md:pb-0">
          <Filter className="w-4 h-4 text-slate-400 shrink-0" />
          <span className="text-xs text-slate-500 shrink-0 font-bold uppercase tracking-wider">Dept:</span>
          <button
            onClick={() => setSelectedDept('ALL')}
            className={`px-3 py-1.5 text-xs font-black rounded-sm transition-all shrink-0 uppercase tracking-wider ${
              selectedDept === 'ALL'
                ? 'bg-blue-600 text-white shadow'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            ALL
          </button>
          {DEPARTMENTS.map((dept) => (
            <button
              key={dept}
              onClick={() => setSelectedDept(dept)}
              className={`px-3 py-1.5 text-xs font-black rounded-sm transition-all shrink-0 uppercase tracking-wider ${
                selectedDept === dept
                  ? 'bg-blue-600 text-white shadow'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {dept}
            </button>
          ))}
        </div>
      </div>

      {/* Students Data Table */}
      <div className="bg-white border border-slate-200 rounded-sm overflow-hidden shadow-sm">
        <div className="p-4 bg-[#0f172a] text-white flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center space-x-2">
            <Users className="w-4 h-4 text-blue-400" />
            <h3 className="text-xs font-black uppercase tracking-widest">
              Institutional Student Directory ({filteredStudents.length} Records)
            </h3>
          </div>
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            {students.length === 0 ? 'Database Empty' : `Showing ${filteredStudents.length} of ${students.length}`}
          </span>
        </div>

        {filteredStudents.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-50 text-slate-600 uppercase text-[10px] font-black tracking-wider border-b border-slate-200">
                <tr>
                  <th className="px-6 py-3.5 font-black">Register Number</th>
                  <th className="px-6 py-3.5 font-black">Student Name</th>
                  <th className="px-6 py-3.5 font-black">Department</th>
                  <th className="px-6 py-3.5 font-black">Phone Number</th>
                  <th className="px-6 py-3.5 font-black text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredStudents.map((std) => (
                  <tr key={std.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-6 py-4 font-mono font-black text-blue-700 text-sm">
                      {std.registerNumber}
                    </td>
                    <td className="px-6 py-4 font-black text-slate-900">{std.name}</td>
                    <td className="px-6 py-4">
                      <span className="px-2.5 py-1 bg-slate-900 text-white font-black text-[11px] rounded-sm uppercase tracking-wider">
                        {std.department}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-mono font-bold text-slate-800">{std.phoneNumber}</td>
                    <td className="px-6 py-4 text-right space-x-2">
                      {onSendSmsToStudent && (
                        <button
                          onClick={() => onSendSmsToStudent(std)}
                          title="Compose SMS to student"
                          className="px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-sm transition-all font-black text-[10px] uppercase tracking-wider inline-flex items-center gap-1 shadow-sm"
                        >
                          <Send className="w-3 h-3" />
                          <span>SMS</span>
                        </button>
                      )}
                      <button
                        onClick={() => openEditModal(std)}
                        title="Edit Student"
                        className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-slate-100 rounded transition-colors inline-block"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteStudent(std.id, std.name)}
                        title="Delete Student"
                        className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-slate-100 rounded transition-colors inline-block"
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
            <h4 className="text-sm font-black text-slate-800 uppercase tracking-wider">No Students Registered</h4>
            <p className="text-xs text-slate-500 max-w-sm mx-auto font-medium">
              {students.length === 0
                ? 'The database starts empty by default. Click "Add New Student" or "Batch CSV Import" to create records.'
                : 'No student matches your search or department filter.'}
            </p>
            {students.length === 0 && (
              <button
                onClick={openAddModal}
                className="mt-2 px-5 py-2.5 bg-[#0f172a] hover:bg-blue-600 text-white font-black text-xs rounded-sm uppercase tracking-widest shadow-md"
              >
                Add First Student
              </button>
            )}
          </div>
        )}
      </div>

      {/* Add / Edit Student Modal */}
      {(isAddModalOpen || editingStudent) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-sm shadow-2xl overflow-hidden animate-in fade-in zoom-in-95">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-[#0f172a] text-white">
              <h3 className="text-xs font-black uppercase tracking-widest flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-blue-400" />
                <span>{editingStudent ? 'Edit Student Details' : 'Register New Student'}</span>
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

            <form onSubmit={handleSaveStudent} className="p-5 space-y-4">
              {error && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold rounded-sm flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
                  <span>{typeof error === 'string' ? error : formatErrorMessage(error)}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-black text-slate-700 uppercase tracking-wider mb-1">
                  Full Student Name *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. Anish Kumar"
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-sm text-slate-900 text-xs font-bold focus:outline-none focus:border-blue-600 focus:bg-white"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-black text-slate-700 uppercase tracking-wider mb-1">
                  Register Number *
                </label>
                <input
                  type="text"
                  value={formData.registerNumber}
                  onChange={(e) => setFormData({ ...formData, registerNumber: e.target.value })}
                  placeholder="e.g. 921321104001"
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-sm text-slate-900 font-mono text-xs font-bold focus:outline-none focus:border-blue-600 focus:bg-white"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-black text-slate-700 uppercase tracking-wider mb-1">
                  Department *
                </label>
                <select
                  value={formData.department}
                  onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-sm text-slate-900 text-xs font-bold focus:outline-none focus:border-blue-600 focus:bg-white"
                >
                  {DEPARTMENTS.map((dept) => (
                    <option key={dept} value={dept}>
                      {dept}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-black text-slate-700 uppercase tracking-wider mb-1">
                  Phone Number (for SMS Alerts) *
                </label>
                <input
                  type="text"
                  value={formData.phoneNumber}
                  onChange={(e) => setFormData({ ...formData, phoneNumber: e.target.value })}
                  placeholder="e.g. +919876543210"
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-sm text-slate-900 font-mono text-xs font-bold focus:outline-none focus:border-blue-600 focus:bg-white"
                  required
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsAddModalOpen(false);
                    setEditingStudent(null);
                  }}
                  className="px-4 py-2 bg-slate-100 text-slate-700 text-xs font-bold rounded-sm border border-slate-300 hover:bg-slate-200 uppercase tracking-wider"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-5 py-2 bg-[#0f172a] hover:bg-blue-600 text-white text-xs font-black rounded-sm uppercase tracking-widest shadow-md transition-all"
                >
                  {loading ? 'Saving Record...' : editingStudent ? 'Update Details' : 'Save Student'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Batch Import Modal */}
      {isBatchModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg bg-white border border-slate-200 rounded-sm shadow-2xl overflow-hidden animate-in fade-in zoom-in-95">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-[#0f172a] text-white">
              <h3 className="text-xs font-black uppercase tracking-widest flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-blue-400" />
                <span>Batch Import Students (CSV / Text)</span>
              </h3>
              <button
                onClick={() => setIsBatchModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {error && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold rounded-sm flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
                  <span>{typeof error === 'string' ? error : formatErrorMessage(error)}</span>
                </div>
              )}

              <p className="text-xs text-slate-600 font-medium">
                Paste student records below (One student per line). Required format: <br />
                <code className="text-blue-700 font-mono text-[11px] bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 font-bold">
                  Name, Register Number, Department, Phone Number
                </code>
              </p>

              <textarea
                value={batchText}
                onChange={(e) => setBatchText(e.target.value)}
                rows={7}
                placeholder={`Anish Kumar, 921321104001, CSE, +919876543210\nPriya Dharshini, 921321104002, ECE, +919876543211`}
                className="w-full p-3 bg-slate-50 border border-slate-300 rounded-sm text-slate-900 font-mono text-xs focus:outline-none focus:border-blue-600 focus:bg-white"
              />

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsBatchModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 text-slate-700 text-xs font-bold rounded-sm border border-slate-300 hover:bg-slate-200 uppercase tracking-wider"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleBatchImport}
                  disabled={loading}
                  className="px-5 py-2 bg-[#0f172a] hover:bg-blue-600 text-white text-xs font-black rounded-sm uppercase tracking-widest shadow-md transition-all"
                >
                  {loading ? 'Importing...' : 'Import Records'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Excel Import Preview Modal */}
      {isPreviewModalOpen && excelFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="bg-white border border-slate-300 w-full max-w-4xl max-h-[90vh] rounded-sm shadow-2xl flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="bg-[#0f172a] text-white p-4 flex items-center justify-between border-b border-slate-800">
              <div className="flex items-center space-x-2">
                <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
                <div>
                  <h3 className="text-xs font-black uppercase tracking-widest text-emerald-400">
                    Excel Enrollment Import Preview
                  </h3>
                  <p className="text-[11px] text-slate-400 font-mono">
                    File: <span className="text-white font-bold">{excelFile.name}</span> ({previewRecords.length} records parsed)
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={confirmUploadExcelToServer}
                  disabled={excelUploadLoading}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs uppercase tracking-wider rounded-sm flex items-center gap-1.5 transition-all shadow-sm"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>{excelUploadLoading ? 'Uploading to Server...' : 'Confirm & Save to Database'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsPreviewModalOpen(false);
                    setExcelFile(null);
                    setPreviewRecords([]);
                  }}
                  className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs uppercase tracking-wider rounded-sm transition-all"
                >
                  Cancel
                </button>
              </div>
            </div>

            {/* Error Banner inside Modal */}
            {error && (
              <div className="p-3 bg-rose-50 border-b border-rose-200 text-rose-800 text-xs font-bold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{typeof error === 'string' ? error : formatErrorMessage(error)}</span>
              </div>
            )}

            {/* Stats Summary Bar */}
            <div className="bg-slate-50 border-b border-slate-200 p-3 px-6 flex flex-wrap items-center justify-between gap-4 text-xs font-medium">
              <div className="flex items-center space-x-4">
                <div>
                  <span className="text-slate-500 font-bold uppercase text-[10px] block">Total Records</span>
                  <strong className="text-slate-900 font-black text-sm">{previewRecords.length}</strong>
                </div>
                <div>
                  <span className="text-slate-500 font-bold uppercase text-[10px] block">Valid Records</span>
                  <strong className="text-emerald-700 font-black text-sm">
                    {previewRecords.filter((r) => r.isValid).length}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-500 font-bold uppercase text-[10px] block">Incomplete / Invalid</span>
                  <strong className="text-rose-700 font-black text-sm">
                    {previewRecords.filter((r) => !r.isValid).length}
                  </strong>
                </div>
              </div>

              <div className="text-right">
                <span className="text-[11px] text-slate-500 font-bold">
                  Existing students with matching Register No will be automatically updated.
                </span>
              </div>
            </div>

            {/* Scrollable Table */}
            <div className="p-4 overflow-y-auto max-h-[60vh] space-y-4">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-[#0f172a] text-amber-400 font-black uppercase text-[10px] tracking-wider sticky top-0">
                    <th className="p-2.5 border border-slate-800 text-center">#</th>
                    <th className="p-2.5 border border-slate-800">Register Number</th>
                    <th className="p-2.5 border border-slate-800">Student Name</th>
                    <th className="p-2.5 border border-slate-800">Department</th>
                    <th className="p-2.5 border border-slate-800">Parent Phone</th>
                    <th className="p-2.5 border border-slate-800 text-center">Marks / Score</th>
                    <th className="p-2.5 border border-slate-800 text-center">Validation</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-slate-800 font-medium">
                  {previewRecords.map((r, i) => (
                    <tr key={i} className={r.isValid ? 'hover:bg-slate-50' : 'bg-rose-50/50 hover:bg-rose-100/50'}>
                      <td className="p-2 border border-slate-200 text-center font-mono font-bold text-slate-500">{r.sNo}</td>
                      <td className="p-2 border border-slate-200 font-mono font-black text-slate-900">{r.registerNumber}</td>
                      <td className="p-2 border border-slate-200 font-black text-slate-900">{r.name}</td>
                      <td className="p-2 border border-slate-200 font-bold text-blue-700">{r.department}</td>
                      <td className="p-2 border border-slate-200 font-mono font-bold">{r.phoneNumber}</td>
                      <td className="p-2 border border-slate-200 text-center font-bold text-slate-700">{r.marks || '-'}</td>
                      <td className="p-2 border border-slate-200 text-center">
                        {r.isValid ? (
                          <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded font-bold text-[10px] inline-flex items-center gap-1">
                            <Check className="w-3 h-3 text-emerald-600" /> Valid
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 bg-rose-100 text-rose-800 rounded font-bold text-[10px] inline-flex items-center gap-1" title={r.reason}>
                            <AlertCircle className="w-3 h-3 text-rose-600" /> {r.reason || 'Invalid'}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Modal Footer */}
            <div className="bg-slate-100 border-t border-slate-200 p-4 flex items-center justify-between text-xs">
              <span className="text-slate-500 font-bold">
                Target Database: Firestore & Memory Storage
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsPreviewModalOpen(false);
                    setExcelFile(null);
                    setPreviewRecords([]);
                  }}
                  className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold text-xs uppercase tracking-wider rounded-sm transition-all"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmUploadExcelToServer}
                  disabled={excelUploadLoading}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs uppercase tracking-widest rounded-sm shadow-md transition-all flex items-center gap-2"
                >
                  <Upload className="w-4 h-4" />
                  <span>{excelUploadLoading ? 'Saving...' : 'Import All Records'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
