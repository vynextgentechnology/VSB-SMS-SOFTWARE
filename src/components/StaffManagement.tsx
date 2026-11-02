import React, { useState } from 'react';
import { Staff, Department, Permission, User, ACADEMIC_YEARS, AcademicYear } from '../types';
import { api, formatErrorMessage } from '../lib/api';
import {
  UserCheck,
  UserPlus,
  Search,
  Trash2,
  Edit2,
  Shield,
  X,
  AlertCircle,
  Building2,
  Check,
  Lock,
  KeyRound,
  GraduationCap,
  Layers,
  Power,
  RefreshCw,
} from 'lucide-react';

interface StaffManagementProps {
  staffList: Staff[];
  departments?: Department[];
  currentUser?: User | null;
  onRefresh: () => void;
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

const ALL_PERMISSIONS: { key: Permission; label: string; desc: string }[] = [
  { key: 'send_sms', label: 'Send SMS Module', desc: 'Can compose and send SMS to assigned cohort students' },
  { key: 'upload_results', label: 'Upload Exam Results', desc: 'Can upload results & trigger result SMS' },
  { key: 'manage_students', label: 'Manage Students', desc: 'Can add, edit, and correct student phone numbers' },
  { key: 'view_reports', label: 'View Reports & Logs', desc: 'Can access and export SMS delivery logs' },
];

export const StaffManagement: React.FC<StaffManagementProps> = ({
  staffList,
  departments,
  currentUser,
  onRefresh,
}) => {
  const isHod = currentUser?.role === 'hod';
  const hodDept = currentUser?.department || 'CSE';

  const DEPARTMENTS: string[] = departments && departments.length > 0
    ? Array.from(new Set(departments.map((d) => d.code)))
    : DEFAULT_DEPT_CODES;

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDeptFilter, setSelectedDeptFilter] = useState('ALL');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<Staff | null>(null);
  const [deletingStaff, setDeletingStaff] = useState<{ id: string; name: string } | null>(null);

  // Password Reset Modal state
  const [resetStaffTarget, setResetStaffTarget] = useState<Staff | null>(null);
  const [newPasswordValue, setNewPasswordValue] = useState('');

  // Form data for staff creation / editing
  const [formData, setFormData] = useState<{
    name: string;
    staffId: string;
    email: string;
    password?: string;
    department: string;
    assignedDepartments: string[];
    assignedYears: AcademicYear[];
    phoneNumber: string;
    status: 'active' | 'inactive';
    permissions: Permission[];
  }>({
    name: '',
    staffId: '',
    email: '',
    password: '',
    department: hodDept,
    assignedDepartments: [hodDept],
    assignedYears: ['1st Year'],
    phoneNumber: '',
    status: 'active',
    permissions: ['send_sms', 'view_reports'],
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const openAddModal = () => {
    setEditingStaff(null);
    setFormData({
      name: '',
      staffId: '',
      email: '',
      password: '',
      department: hodDept,
      assignedDepartments: [hodDept],
      assignedYears: ['1st Year'],
      phoneNumber: '',
      status: 'active',
      permissions: ['send_sms', 'view_reports'],
    });
    setError(null);
    setIsAddModalOpen(true);
  };

  const openEditModal = (stf: Staff) => {
    setEditingStaff(stf);
    const assignedY = Array.isArray(stf.assignedYears) && stf.assignedYears.length > 0
      ? (stf.assignedYears as AcademicYear[])
      : ['1st Year' as AcademicYear];
    const assignedD = Array.isArray(stf.assignedDepartments) && stf.assignedDepartments.length > 0
      ? stf.assignedDepartments
      : [stf.department || hodDept];

    setFormData({
      name: stf.name,
      staffId: stf.staffId,
      email: stf.email || '',
      password: '',
      department: stf.department || hodDept,
      assignedDepartments: assignedD,
      assignedYears: assignedY,
      phoneNumber: stf.phoneNumber,
      status: stf.status || 'active',
      permissions: stf.permissions || ['send_sms', 'view_reports'],
    });
    setError(null);
  };

  const toggleYearAssignment = (yr: AcademicYear) => {
    const current = formData.assignedYears;
    if (current.includes(yr)) {
      if (current.length === 1) return; // Keep at least one
      setFormData({ ...formData, assignedYears: current.filter((y) => y !== yr) });
    } else {
      setFormData({ ...formData, assignedYears: [...current, yr] });
    }
  };

  const toggleDeptAssignment = (deptCode: string) => {
    const current = formData.assignedDepartments;
    if (current.includes(deptCode)) {
      if (current.length === 1) return; // Keep at least one
      setFormData({ ...formData, assignedDepartments: current.filter((d) => d !== deptCode) });
    } else {
      setFormData({ ...formData, assignedDepartments: [...current, deptCode] });
    }
  };

  const togglePermission = (perm: Permission) => {
    if (formData.permissions.includes(perm)) {
      setFormData({
        ...formData,
        permissions: formData.permissions.filter((p) => p !== perm),
      });
    } else {
      setFormData({
        ...formData,
        permissions: [...formData.permissions, perm],
      });
    }
  };

  const handleSaveStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!formData.name.trim() || !formData.staffId.trim() || !formData.phoneNumber.trim()) {
      setError('Staff Name, Staff ID, and Phone Number are required.');
      return;
    }

    setLoading(true);
    try {
      if (editingStaff) {
        await api.updateStaff(editingStaff.id, formData);
        setSuccessMsg(`Staff ${formData.name} updated successfully.`);
        setEditingStaff(null);
      } else {
        await api.addStaff(formData);
        const passInfo = formData.password ? formData.password : 'VSB123';
        setSuccessMsg(`Staff account created for ${formData.name}! Staff ID: ${formData.staffId} (Initial Password: ${passInfo})`);
        setIsAddModalOpen(false);
      }
      onRefresh();
      setTimeout(() => setSuccessMsg(null), 5000);
    } catch (err: any) {
      setError(formatErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  // Toggle Staff Status (Active / Inactive)
  const handleToggleStatus = async (stf: Staff) => {
    try {
      const res = await api.toggleStaffStatus(stf.id);
      setSuccessMsg(`Staff ${stf.name} status changed to ${res.staff.status.toUpperCase()}.`);
      onRefresh();
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setError(formatErrorMessage(err));
    }
  };

  // Reset Staff Password
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetStaffTarget) return;
    if (!newPasswordValue.trim() || newPasswordValue.trim().length < 4) {
      setError('Password must be at least 4 characters long');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await api.resetStaffPassword(resetStaffTarget.id, newPasswordValue.trim());
      setSuccessMsg(`Password for ${resetStaffTarget.name} (${resetStaffTarget.staffId}) successfully reset to "${newPasswordValue.trim()}".`);
      setResetStaffTarget(null);
      setNewPasswordValue('');
      onRefresh();
      setTimeout(() => setSuccessMsg(null), 5000);
    } catch (err: any) {
      setError(formatErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteStaff = (id: string, name: string) => {
    setDeletingStaff({ id, name });
  };

  const confirmDeleteStaff = async () => {
    if (!deletingStaff) return;
    const { id, name } = deletingStaff;
    try {
      await api.deleteStaff(id);
      setSuccessMsg(`Staff account ${name} permanently removed from database.`);
      setDeletingStaff(null);
      onRefresh();
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setError(formatErrorMessage(err));
    }
  };

  const filteredStaff = staffList.filter((stf) => {
    const q = searchTerm.toLowerCase().trim();
    const matchesSearch =
      !q ||
      stf.name.toLowerCase().includes(q) ||
      stf.staffId.toLowerCase().includes(q) ||
      (stf.department || '').toLowerCase().includes(q) ||
      (stf.email && stf.email.toLowerCase().includes(q));

    const matchesDept = selectedDeptFilter === 'ALL' || (stf.department || '').toUpperCase() === selectedDeptFilter.toUpperCase();

    return matchesSearch && matchesDept;
  });

  return (
    <div id="staff-management-view" className="space-y-6 animate-in fade-in duration-200">
      
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white border border-slate-200 p-6 rounded-lg shadow-sm">
        <div>
          <div className="flex items-center space-x-2 text-blue-600 font-black text-xs uppercase tracking-widest mb-1">
            <Building2 className="w-4 h-4" />
            <span>VSB ENGINEERING COLLEGE • VY NEXTGEN TECHNOLOGY</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 uppercase tracking-tight">
            Staff Assignment & Faculty Access Control
          </h2>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Assign staff to specific academic years and departments. Staff members can access only their assigned cohorts.
          </p>
        </div>

        <button
          id="staff-add-new-btn"
          onClick={openAddModal}
          className="px-5 py-2.5 bg-[#0f172a] hover:bg-blue-600 text-white font-black rounded shadow-md text-xs uppercase tracking-wider flex items-center gap-2 transition-all self-start sm:self-auto shrink-0"
        >
          <UserPlus className="w-4 h-4 text-blue-400" />
          <span>+ Add Staff Account</span>
        </button>
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

      {/* Search & Department Filter Bar */}
      <div className="bg-white border border-slate-200 p-4 rounded-lg shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search staff by Name or Staff ID..."
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded text-slate-900 placeholder-slate-400 text-xs font-medium focus:outline-none focus:border-blue-600 focus:bg-white"
          />
        </div>

        <div className="flex items-center space-x-2">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Department:</span>
          <select
            value={selectedDeptFilter}
            onChange={(e) => setSelectedDeptFilter(e.target.value)}
            className="px-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded font-bold text-slate-700"
          >
            <option value="ALL">All Departments</option>
            {DEPARTMENTS.map((dept) => (
              <option key={dept} value={dept}>{dept}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Staff Table */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-sm">
        <div className="p-4 bg-[#0f172a] text-white flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center space-x-2">
            <UserCheck className="w-4 h-4 text-blue-400" />
            <h3 className="text-xs font-black uppercase tracking-widest">
              Faculty Staff Directory ({filteredStaff.length} Members)
            </h3>
          </div>
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            Total Staff: {staffList.length}
          </span>
        </div>

        {filteredStaff.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-50 text-slate-600 uppercase text-[10px] font-black tracking-wider border-b border-slate-200">
                <tr>
                  <th className="px-5 py-3 font-black">Staff ID</th>
                  <th className="px-5 py-3 font-black">Staff Name</th>
                  <th className="px-5 py-3 font-black">Primary Dept</th>
                  <th className="px-5 py-3 font-black">Assigned Academic Years</th>
                  <th className="px-5 py-3 font-black">Assigned Departments</th>
                  <th className="px-5 py-3 font-black">Contact Mobile</th>
                  <th className="px-5 py-3 font-black text-center">Status</th>
                  <th className="px-5 py-3 font-black text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredStaff.map((stf) => {
                  const years = Array.isArray(stf.assignedYears) && stf.assignedYears.length > 0
                    ? stf.assignedYears
                    : ['1st Year'];
                  const depts = Array.isArray(stf.assignedDepartments) && stf.assignedDepartments.length > 0
                    ? stf.assignedDepartments
                    : [stf.department || 'CSE'];
                  const isActive = (stf.status || 'active') === 'active';

                  return (
                    <tr key={stf.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-5 py-3.5 font-mono font-black text-blue-700 text-xs">
                        {stf.staffId}
                      </td>
                      <td className="px-5 py-3.5 font-black text-slate-900">
                        {stf.name}
                        {stf.email && (
                          <div className="text-[10px] text-slate-400 font-normal font-mono">{stf.email}</div>
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="px-2 py-0.5 bg-slate-900 text-white font-bold text-[10px] rounded uppercase tracking-wider">
                          {stf.department}
                        </span>
                      </td>

                      {/* Assigned Academic Years */}
                      <td className="px-5 py-3.5">
                        <div className="flex flex-wrap gap-1">
                          {years.map((y) => (
                            <span
                              key={y}
                              className="px-2 py-0.5 bg-blue-50 text-blue-800 border border-blue-200 rounded text-[10px] font-bold"
                            >
                              {y}
                            </span>
                          ))}
                        </div>
                      </td>

                      {/* Assigned Departments */}
                      <td className="px-5 py-3.5">
                        <div className="flex flex-wrap gap-1">
                          {depts.map((d) => (
                            <span
                              key={d}
                              className="px-2 py-0.5 bg-slate-100 text-slate-800 border border-slate-200 rounded text-[10px] font-bold"
                            >
                              {d}
                            </span>
                          ))}
                        </div>
                      </td>

                      <td className="px-5 py-3.5 font-mono text-slate-800 font-bold">
                        {stf.phoneNumber}
                      </td>

                      {/* Account Status */}
                      <td className="px-5 py-3.5 text-center">
                        <button
                          onClick={() => handleToggleStatus(stf)}
                          title={`Click to ${isActive ? 'deactivate' : 'activate'} staff account`}
                          className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider inline-flex items-center gap-1 ${
                            isActive
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                              : 'bg-rose-100 text-rose-800 border border-rose-300'
                          }`}
                        >
                          <Power className="w-2.5 h-2.5" />
                          <span>{isActive ? 'Active' : 'Inactive'}</span>
                        </button>
                      </td>

                      {/* Actions */}
                      <td className="px-5 py-3.5 text-right space-x-1.5 whitespace-nowrap">
                        <button
                          onClick={() => {
                            setResetStaffTarget(stf);
                            setNewPasswordValue('');
                            setError(null);
                          }}
                          title="Reset Password"
                          className="px-2 py-1 bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-300 rounded font-bold text-[10px] uppercase inline-flex items-center gap-1"
                        >
                          <KeyRound className="w-3 h-3 text-amber-700" />
                          <span>Reset Pass</span>
                        </button>

                        <button
                          onClick={() => openEditModal(stf)}
                          title="Reassign Years, Departments, and Permissions"
                          className="p-1 text-slate-500 hover:text-blue-600 hover:bg-slate-100 rounded transition-colors inline-block"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>

                        <button
                          onClick={() => handleDeleteStaff(stf.id, stf.name)}
                          title="Delete Staff Account"
                          className="p-1 text-slate-500 hover:text-rose-600 hover:bg-slate-100 rounded transition-colors inline-block"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-12 text-center space-y-3">
            <UserCheck className="w-10 h-10 mx-auto text-slate-300" />
            <h4 className="text-sm font-black text-slate-800 uppercase tracking-wider">No Staff Accounts Found</h4>
            <p className="text-xs text-slate-500 max-w-sm mx-auto font-medium">
              Create individual staff accounts and assign academic years & departments to delegate student and SMS operations.
            </p>
            <button
              onClick={openAddModal}
              className="mt-2 px-4 py-2 bg-[#0f172a] hover:bg-blue-600 text-white font-black text-xs rounded uppercase tracking-wider shadow-md"
            >
              Add First Staff Account
            </button>
          </div>
        )}
      </div>

      {/* RESET PASSWORD MODAL */}
      {resetStaffTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in-95">
            <div className="p-4 bg-[#0f172a] text-white flex items-center justify-between">
              <h3 className="text-xs font-black uppercase tracking-wider flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-amber-400" />
                <span>Reset Staff Password</span>
              </h3>
              <button onClick={() => setResetStaffTarget(null)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleResetPassword} className="p-5 space-y-4">
              <div className="bg-slate-50 p-3 rounded border border-slate-200 text-xs space-y-1">
                <div>
                  <span className="text-slate-500 font-bold uppercase text-[10px]">Staff Member: </span>
                  <strong className="text-slate-900">{resetStaffTarget.name}</strong>
                </div>
                <div>
                  <span className="text-slate-500 font-bold uppercase text-[10px]">Staff ID / Login: </span>
                  <span className="font-mono font-bold text-blue-700">{resetStaffTarget.staffId}</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-black text-slate-700 uppercase tracking-wider mb-1">
                  Enter New Password *
                </label>
                <input
                  type="text"
                  value={newPasswordValue}
                  onChange={(e) => setNewPasswordValue(e.target.value)}
                  placeholder="e.g. Vsb@2026 or SecurePass123"
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded text-slate-900 font-mono text-xs font-bold focus:outline-none focus:border-blue-600 focus:bg-white"
                  required
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  The staff member can log in immediately with this new password.
                </p>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setResetStaffTarget(null)}
                  className="px-3 py-1.5 bg-slate-100 text-slate-700 text-xs font-bold rounded border border-slate-300 hover:bg-slate-200 uppercase"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-xs rounded uppercase shadow transition-all"
                >
                  {loading ? 'Resetting...' : 'Set New Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ADD / EDIT STAFF MODAL */}
      {(isAddModalOpen || editingStaff) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-xl bg-white border border-slate-200 rounded-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in-95">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-[#0f172a] text-white">
              <h3 className="text-xs font-black uppercase tracking-wider flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-blue-400" />
                <span>{editingStaff ? 'Edit Staff Account & Cohort Assignment' : 'Create Individual Staff Account'}</span>
              </h3>
              <button
                onClick={() => {
                  setIsAddModalOpen(false);
                  setEditingStaff(null);
                }}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveStaff} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
              {error && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold rounded flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
                  <span>{error}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                
                {/* Staff Name */}
                <div>
                  <label className="block text-xs font-black text-slate-700 uppercase tracking-wider mb-1">
                    Staff Name *
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g. Dr. K. Ramesh"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded text-slate-900 text-xs font-bold focus:outline-none focus:border-blue-600 focus:bg-white"
                    required
                  />
                </div>

                {/* Staff ID */}
                <div>
                  <label className="block text-xs font-black text-slate-700 uppercase tracking-wider mb-1">
                    Staff ID / Login Username *
                  </label>
                  <input
                    type="text"
                    value={formData.staffId}
                    onChange={(e) => setFormData({ ...formData, staffId: e.target.value.toUpperCase() })}
                    placeholder="e.g. STAFF001"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded text-slate-900 font-mono text-xs font-bold focus:outline-none focus:border-blue-600 focus:bg-white"
                    required
                  />
                </div>

                {/* Email */}
                <div>
                  <label className="block text-xs font-black text-slate-700 uppercase tracking-wider mb-1">
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="staff@vsbec.ac.in"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded text-slate-900 text-xs focus:outline-none focus:border-blue-600 focus:bg-white"
                  />
                </div>

                {/* Contact Mobile */}
                <div>
                  <label className="block text-xs font-black text-slate-700 uppercase tracking-wider mb-1">
                    Contact Mobile Number *
                  </label>
                  <input
                    type="tel"
                    maxLength={10}
                    value={formData.phoneNumber}
                    onChange={(e) => setFormData({ ...formData, phoneNumber: e.target.value })}
                    placeholder="10-digit mobile"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded text-slate-900 font-mono text-xs font-bold focus:outline-none focus:border-blue-600 focus:bg-white"
                    required
                  />
                </div>

                {/* Primary Department */}
                <div>
                  <label className="block text-xs font-black text-slate-700 uppercase tracking-wider mb-1">
                    Primary Department *
                  </label>
                  <select
                    value={formData.department}
                    onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded text-slate-900 text-xs font-bold focus:outline-none focus:border-blue-600 focus:bg-white"
                  >
                    {DEPARTMENTS.map((dept) => (
                      <option key={dept} value={dept}>{dept}</option>
                    ))}
                  </select>
                </div>

                {/* Initial Password (Add Mode Only) */}
                {!editingStaff && (
                  <div>
                    <label className="block text-xs font-black text-slate-700 uppercase tracking-wider mb-1">
                      Initial Password
                    </label>
                    <input
                      type="text"
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      placeholder="Leave blank for VSB123"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded text-slate-900 font-mono text-xs focus:outline-none focus:border-blue-600 focus:bg-white"
                    />
                  </div>
                )}

              </div>

              {/* Multi-Year Cohort Assignment */}
              <div className="border border-slate-200 rounded p-3 bg-slate-50 space-y-2">
                <label className="block text-xs font-black text-slate-800 uppercase tracking-wider">
                  Assigned Academic Years (Select one or multiple cohorts)
                </label>
                <div className="flex flex-wrap gap-2">
                  {ACADEMIC_YEARS.slice(0, 4).map((yr) => {
                    const isSelected = formData.assignedYears.includes(yr);
                    return (
                      <button
                        type="button"
                        key={yr}
                        onClick={() => toggleYearAssignment(yr)}
                        className={`px-3 py-1.5 rounded text-xs font-black uppercase transition-all flex items-center gap-1.5 ${
                          isSelected
                            ? 'bg-blue-600 text-white shadow'
                            : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-100'
                        }`}
                      >
                        {isSelected && <Check className="w-3.5 h-3.5" />}
                        <span>{yr}</span>
                      </button>
                    );
                  })}
                </div>
                <p className="text-[11px] text-slate-500">
                  Staff will be restricted to managing students from the selected academic years only.
                </p>
              </div>

              {/* Multi-Department Assignment */}
              <div className="border border-slate-200 rounded p-3 bg-slate-50 space-y-2">
                <label className="block text-xs font-black text-slate-800 uppercase tracking-wider">
                  Assigned Engineering Departments
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {DEPARTMENTS.map((dept) => {
                    const isSelected = formData.assignedDepartments.includes(dept);
                    return (
                      <button
                        type="button"
                        key={dept}
                        onClick={() => toggleDeptAssignment(dept)}
                        className={`px-2.5 py-1 rounded text-xs font-bold uppercase transition-all flex items-center gap-1 ${
                          isSelected
                            ? 'bg-slate-900 text-white shadow'
                            : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-100'
                        }`}
                      >
                        {isSelected && <Check className="w-3 h-3 text-emerald-400" />}
                        <span>{dept}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Permissions */}
              <div className="space-y-2">
                <label className="block text-xs font-black text-slate-800 uppercase tracking-wider">
                  Authorization Privileges
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {ALL_PERMISSIONS.map((perm) => (
                    <label
                      key={perm.key}
                      onClick={() => togglePermission(perm.key)}
                      className={`p-2.5 border rounded cursor-pointer transition-all flex items-start gap-2 ${
                        formData.permissions.includes(perm.key)
                          ? 'border-blue-600 bg-blue-50/50'
                          : 'border-slate-200 bg-white hover:bg-slate-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={formData.permissions.includes(perm.key)}
                        onChange={() => {}}
                        className="mt-0.5 rounded text-blue-600"
                      />
                      <div>
                        <div className="text-xs font-black text-slate-900">{perm.label}</div>
                        <div className="text-[10px] text-slate-500 font-medium">{perm.desc}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsAddModalOpen(false);
                    setEditingStaff(null);
                  }}
                  className="px-4 py-2 bg-slate-100 text-slate-700 text-xs font-bold rounded border border-slate-300 hover:bg-slate-200 uppercase"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-5 py-2 bg-[#0f172a] hover:bg-blue-600 text-white text-xs font-black rounded uppercase shadow transition-all"
                >
                  {loading ? 'Saving...' : editingStaff ? 'Update Staff Member' : 'Create Staff Member'}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {deletingStaff && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-2xl max-w-md w-full border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95">
            <div className="bg-rose-600 p-4 text-white flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Trash2 className="w-5 h-5 text-rose-100" />
                <h3 className="font-black text-sm uppercase tracking-wider">Confirm Delete Staff</h3>
              </div>
              <button onClick={() => setDeletingStaff(null)} className="text-rose-200 hover:text-white">✕</button>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-sm text-slate-700">
                Are you sure you want to permanently delete the staff account for <strong>{deletingStaff.name}</strong>?
              </p>
              <div className="bg-rose-50 border border-rose-200 rounded p-3 text-xs text-rose-800 font-medium">
                Their login access and cohort assignments will be revoked immediately.
              </div>
            </div>

            <div className="bg-slate-100 p-4 flex justify-end space-x-2">
              <button
                onClick={() => setDeletingStaff(null)}
                className="px-4 py-2 bg-white border border-slate-300 text-slate-700 font-bold text-xs uppercase rounded hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteStaff}
                className="px-5 py-2 bg-rose-600 text-white font-black text-xs uppercase rounded hover:bg-rose-700 shadow"
              >
                Permanently Delete
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
