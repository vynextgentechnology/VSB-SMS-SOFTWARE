import React, { useState } from 'react';
import { ParentEnrollment } from '../types';
import { api, formatErrorMessage } from '../lib/api';
import {
  UserPlus,
  Upload,
  Search,
  Trash2,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  Download,
  Users,
  ShieldCheck,
} from 'lucide-react';
import * as XLSX from 'xlsx';

interface ParentEnrollmentSystemProps {
  parents: ParentEnrollment[];
  onRefresh: () => void;
}

export const ParentEnrollmentSystem: React.FC<ParentEnrollmentSystemProps> = ({
  parents,
  onRefresh,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [deletingParent, setDeletingParent] = useState<{ id: string; regNo: string } | null>(null);

  // Single form state
  const [formData, setFormData] = useState({
    parentName: '',
    parentPhoneNumber: '',
    studentName: '',
    registerNumber: '',
  });

  // Batch import state
  const [isBatchImporting, setIsBatchImporting] = useState(false);

  const handleSingleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    if (!formData.parentPhoneNumber.trim() || !formData.studentName.trim() || !formData.registerNumber.trim()) {
      setError('Parent Mobile Number, Student Name, and Register Number are required.');
      return;
    }

    const cleanPhone = formData.parentPhoneNumber.replace(/\D/g, '');
    if (cleanPhone.length < 10) {
      setError('Please enter a valid 10-digit mobile number.');
      return;
    }

    setIsSubmitting(true);
    try {
      await api.addParent({
        parentName: formData.parentName.trim() || 'Parent',
        parentPhoneNumber: cleanPhone,
        studentName: formData.studentName.trim(),
        registerNumber: formData.registerNumber.trim().toUpperCase(),
      });
      setSuccessMsg(`Successfully enrolled parent for Register No: ${formData.registerNumber.trim().toUpperCase()}`);
      setFormData({
        parentName: '',
        parentPhoneNumber: '',
        studentName: '',
        registerNumber: '',
      });
      onRefresh();
    } catch (err: any) {
      setError(err.message || 'Failed to enroll parent record.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = (id: string, regNo: string) => {
    setDeletingParent({ id, regNo });
  };

  const confirmDeleteParent = async () => {
    if (!deletingParent) return;
    const { id, regNo } = deletingParent;
    try {
      await api.deleteParent(id);
      setSuccessMsg(`Deleted enrollment for Reg No: ${regNo}`);
      setDeletingParent(null);
      onRefresh();
    } catch (err: any) {
      console.log(err);
      if (err?.message) console.log(err.message);
      if (err?.response?.data) console.log(err.response?.data);
      setError(formatErrorMessage(err));
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setSuccessMsg(null);
    setIsBatchImporting(true);

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsName = wb.SheetNames[0];
        const ws = wb.Sheets[wsName];
        const data = XLSX.utils.sheet_to_json<any>(ws);

        if (data.length === 0) {
          setError('Uploaded file is empty.');
          setIsBatchImporting(false);
          return;
        }

        const parsedParents: Omit<ParentEnrollment, 'id' | 'createdAt'>[] = [];

        data.forEach((row: any) => {
          const regNo = (row['Register Number'] || row['RegisterNo'] || row['Reg No'] || row['RegNo'] || row['regNo'] || '').toString().trim();
          const parentPhone = (row['Parent Mobile Number'] || row['Parent Phone'] || row['Mobile'] || row['parentPhoneNumber'] || '').toString().trim().replace(/\D/g, '');
          const studentName = (row['Student Name'] || row['StudentName'] || row['studentName'] || row['Student'] || '').toString().trim();
          const parentName = (row['Parent Name'] || row['ParentName'] || row['parentName'] || '').toString().trim() || 'Parent';

          if (regNo && parentPhone) {
            parsedParents.push({
              parentName,
              parentPhoneNumber: parentPhone,
              studentName: studentName || 'Student',
              registerNumber: regNo.toUpperCase(),
            });
          }
        });

        if (parsedParents.length === 0) {
          setError('No valid parent records found in Excel. Ensure columns include: "Register Number", "Parent Mobile Number", "Student Name".');
          setIsBatchImporting(false);
          return;
        }

        const res = await api.batchImportParents(parsedParents);
        setSuccessMsg(`Batch import complete: ${res.addedCount} added, ${res.skippedCount} duplicates skipped out of ${res.total} records.`);
        onRefresh();
      } catch (err: any) {
        console.log(err);
        if (err?.message) console.log(err.message);
        if (err?.response?.data) console.log(err.response?.data);
        setError('Error processing file: ' + formatErrorMessage(err));
      } finally {
        setIsBatchImporting(false);
        e.target.value = '';
      }
    };
    reader.readAsBinaryString(file);
  };

  const downloadSampleTemplate = () => {
    const sampleData = [
      {
        'Register Number': '921321104001',
        'Student Name': 'S. Ananya',
        'Parent Mobile Number': '9876543210',
      },
      {
        'Register Number': '921321104002',
        'Student Name': 'K. Vignesh',
        'Parent Mobile Number': '9123456789',
      },
    ];

    const ws = XLSX.utils.json_to_sheet(sampleData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'ParentEnrollment');
    XLSX.writeFile(wb, 'VSBEC_Parent_Enrollment_Template.xlsx');
  };

  const filteredParents = parents.filter((p) => {
    const q = searchTerm.toLowerCase();
    return (
      p.registerNumber.toLowerCase().includes(q) ||
      p.parentName.toLowerCase().includes(q) ||
      p.studentName.toLowerCase().includes(q) ||
      p.parentPhoneNumber.includes(q)
    );
  });

  return (
    <div id="parent-enrollment-view" className="space-y-8 animate-in fade-in duration-200">
      
      {/* Header Banner explaining step 1 requirement */}
      <div className="bg-[#0f172a] text-white p-6 rounded-sm shadow-md border-l-4 border-indigo-500 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-indigo-400" />
            <span className="text-xs font-black uppercase tracking-widest text-indigo-300">
              Core Workflow — Step 1
            </span>
          </div>
          <h2 className="text-xl font-black uppercase tracking-tight text-white">
            Parent Enrollment Database
          </h2>
          <p className="text-xs text-slate-300 max-w-2xl font-medium">
            Admin and HODs must enroll parent details first. The <strong className="text-indigo-300">Register Number</strong> is the primary key used to match parents with uploaded semester exam results and automatically dispatch SMS notifications.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={downloadSampleTemplate}
            className="flex items-center gap-2 bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-200 border border-indigo-500/50 px-4 py-2.5 rounded-sm text-xs font-bold uppercase tracking-wider transition-all"
          >
            <Download className="w-4 h-4" />
            <span>Sample Template</span>
          </button>

          <label className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2.5 rounded-sm text-xs font-bold uppercase tracking-wider cursor-pointer shadow-md transition-all">
            <Upload className="w-4 h-4" />
            <span>{isBatchImporting ? 'Processing...' : 'Excel Import'}</span>
            <input
              type="file"
              accept=".xlsx, .xls, .csv"
              onChange={handleFileUpload}
              disabled={isBatchImporting}
              className="hidden"
            />
          </label>
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <div className="bg-rose-50 border-l-4 border-rose-500 p-4 text-rose-800 text-xs font-bold flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
            <span>{typeof error === 'string' ? error : formatErrorMessage(error)}</span>
          </div>
          <button onClick={() => setError(null)} className="text-rose-500 hover:text-rose-700">✕</button>
        </div>
      )}

      {successMsg && (
        <div className="bg-emerald-50 border-l-4 border-emerald-500 p-4 text-emerald-800 text-xs font-bold flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg(null)} className="text-emerald-500 hover:text-emerald-700">✕</button>
        </div>
      )}

      {/* Main Grid: Add Single Form + Summary Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Form: Single Parent Enrollment */}
        <div className="lg:col-span-5 bg-white border border-slate-200 p-6 rounded-sm shadow-sm space-y-6">
          <div className="border-b border-slate-100 pb-4">
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-indigo-600" />
              <span>Enroll Parent Record</span>
            </h3>
            <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mt-1">
              Add individual parent detail
            </p>
          </div>

          <form onSubmit={handleSingleSubmit} className="space-y-4">
            <div>
              <label className="block text-[11px] font-black text-slate-700 uppercase tracking-wider mb-1">
                Register Number (UNIQUE) <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                placeholder="e.g. 921321104001"
                value={formData.registerNumber}
                onChange={(e) => setFormData({ ...formData, registerNumber: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-sm text-xs font-semibold uppercase font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                required
              />
              <p className="text-[10px] text-slate-400 font-bold uppercase mt-1">
                Must match student's official register number
              </p>
            </div>

            <div>
              <label className="block text-[11px] font-black text-slate-700 uppercase tracking-wider mb-1">
                Student Name <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                placeholder="e.g. S. Ananya"
                value={formData.studentName}
                onChange={(e) => setFormData({ ...formData, studentName: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-sm text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500"
                required
              />
            </div>

            <div>
              <label className="block text-[11px] font-black text-slate-700 uppercase tracking-wider mb-1">
                Parent Mobile Number <span className="text-rose-500">*</span>
              </label>
              <input
                type="tel"
                placeholder="e.g. 9876543210 (10 digits)"
                value={formData.parentPhoneNumber}
                onChange={(e) => setFormData({ ...formData, parentPhoneNumber: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-sm text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500"
                required
              />
            </div>

            <div>
              <label className="block text-[11px] font-black text-slate-500 uppercase tracking-wider mb-1">
                Parent Name <span className="text-slate-400 font-normal">(Optional)</span>
              </label>
              <input
                type="text"
                placeholder="e.g. R. Sundaram (Optional)"
                value={formData.parentName}
                onChange={(e) => setFormData({ ...formData, parentName: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-sm text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-sm text-xs font-black uppercase tracking-widest transition-all shadow-sm"
            >
              {isSubmitting ? 'Saving Record...' : '+ Save Parent Enrollment'}
            </button>
          </form>
        </div>

        {/* Right List: Search & Table */}
        <div className="lg:col-span-7 bg-white border border-slate-200 p-6 rounded-sm shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-100 pb-4">
            <div>
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
                <Users className="w-4 h-4 text-indigo-600" />
                <span>Enrolled Parents ({parents.length})</span>
              </h3>
              <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mt-1">
                Primary contact directory for SMS dispatches
              </p>
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search Reg No, Name, Mobile..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 border border-slate-300 rounded-sm text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-black uppercase text-slate-500">
                <tr>
                  <th className="p-3">Register No</th>
                  <th className="p-3">Parent Name</th>
                  <th className="p-3">Parent Mobile</th>
                  <th className="p-3">Student Name</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs font-medium text-slate-700">
                {filteredParents.length > 0 ? (
                  filteredParents.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                      <td className="p-3 font-mono font-bold text-indigo-700 uppercase">
                        {p.registerNumber}
                      </td>
                      <td className="p-3 font-bold text-slate-900">{p.parentName}</td>
                      <td className="p-3 font-mono text-slate-600">{p.parentPhoneNumber}</td>
                      <td className="p-3 text-slate-800">{p.studentName}</td>
                      <td className="p-3 text-right">
                        <button
                          onClick={() => handleDelete(p.id, p.registerNumber)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 transition-colors"
                          title="Delete Enrollment"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-slate-400 font-bold uppercase text-xs">
                      {searchTerm ? 'No matching parent enrollments found.' : 'No parents enrolled yet. Add a record or upload an Excel file.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>

      {/* Delete Confirmation Modal */}
      {deletingParent && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-white border border-slate-200 w-full max-w-md rounded-sm shadow-xl p-6 space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-full">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">Confirm Enrollment Deletion</h3>
                <p className="text-xs font-medium text-slate-500">This action cannot be undone.</p>
              </div>
            </div>

            <div className="text-xs text-slate-700 bg-slate-50 p-3 rounded border border-slate-200 font-medium leading-relaxed">
              Are you sure you want to delete enrollment for Register No <strong className="text-slate-900 font-bold font-mono">{deletingParent.regNo}</strong>?
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDeletingParent(null)}
                className="px-4 py-2 border border-slate-300 rounded-sm text-xs font-bold uppercase tracking-wider text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDeleteParent}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-sm text-xs font-black uppercase tracking-wider shadow-sm"
              >
                Yes, Delete Record
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
