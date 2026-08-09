import React, { useState } from 'react';
import { Staff, Department, Permission, User } from '../types';
import { api } from '../lib/api';
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
} from 'lucide-react';

interface StaffManagementProps {
  staffList: Staff[];
  departments?: Department[];
  currentUser?: User | null;
  onRefresh: () => void;
}

const DEFAULT_DEPT_CODES = ['AIML', 'AIDS', 'CSE', 'CCE', 'ECE', 'EEE', 'MECH', 'CSBS', 'CHEMICAL', 'CIVIL', 'ADMIN'];

const ALL_PERMISSIONS: { key: Permission; label: string; desc: string }[] = [
  { key: 'send_sms', label: 'Send SMS Module', desc: 'Can compose and send SMS to students' },
  { key: 'upload_results', label: 'Upload Exam Results', desc: 'Can upload results & trigger result SMS' },
  { key: 'manage_students', label: 'Manage Students', desc: 'Can add, edit, and delete student records' },
  { key: 'manage_staff', label: 'Manage Staff', desc: 'Can manage other staff operator accounts' },
  { key: 'view_reports', label: 'View Reports & Logs', desc: 'Can access and export SMS delivery reports' },
  { key: 'manage_settings', label: 'Gateway Settings', desc: 'Can edit SMS Gateway & API credentials' },
];

export const StaffManagement: React.FC<StaffManagementProps> = ({
  staffList,
  departments,
  currentUser,
  onRefresh,
}) => {
  const isHod = currentUser?.role === 'hod';
  const hodDept = currentUser?.department || 'CSE';

  const DEPARTMENTS = departments && departments.length > 0 ? Array.from(new Set([...departments.map((d) => d.code), 'ADMIN'])) : DEFAULT_DEPT_CODES;
  const [searchTerm, setSearchTerm] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<Staff | null>(null);
  const [deletingStaff, setDeletingStaff] = useState<{ id: string; name: string } | null>(null);

  const [formData, setFormData] = useState<{
    name: string;
    staffId: string;
    department: string;
    phoneNumber: string;
    permissions: Permission[];
  }>({
    name: '',
    staffId: '',
    department: hodDept,
    phoneNumber: '',
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
      department: hodDept,
      phoneNumber: '',
      permissions: ['send_sms', 'view_reports'],
    });
    setError(null);
    setIsAddModalOpen(true);
  };

  const openEditModal = (stf: Staff) => {
    setEditingStaff(stf);
    setFormData({
      name: stf.name,
      staffId: stf.staffId,
      department: stf.department,
      phoneNumber: stf.phoneNumber,
      permissions: stf.permissions,
    });
    setError(null);
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
      setError('Name, Staff ID, and Phone Number are required.');
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
        setSuccessMsg(`Staff account created for ${formData.name} (Default Login: ${formData.staffId} / VSB${formData.staffId})`);
        setIsAddModalOpen(false);
      }
      onRefresh();
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: any) {
      setError(err.message || 'Failed to save staff record');
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
      setSuccessMsg(`Staff account ${name} removed`);
      setDeletingStaff(null);
      onRefresh();
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to delete staff');
    }
  };

  const filteredStaff = staffList.filter((stf) => {
    const matchesSearch =
      stf.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      stf.staffId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      stf.department.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesDept = !isHod || stf.department.toUpperCase() === hodDept.toUpperCase();

    return matchesSearch && matchesDept;
  });

  return (
    <div id="staff-management-view" className="space-y-6 animate-in fade-in duration-200">
      
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white border border-slate-200 p-6 rounded-sm shadow-sm">
        <div>
          <div className="flex items-center space-x-2 text-blue-600 font-black text-xs uppercase tracking-widest mb-1">
            <Building2 className="w-4 h-4" />
            <span>VSB ENGINEERING COLLEGE • VY NEXTGEN TECHNOLOGY</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 uppercase tracking-tight">Staff & Faculty Account Management</h2>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Configure staff login accounts, department assignments, and system authorization privileges.
          </p>
        </div>

        <button
          id="staff-add-new-btn"
          onClick={openAddModal}
          className="px-5 py-2.5 bg-[#0f172a] hover:bg-blue-600 text-white font-black rounded-sm shadow-md text-xs uppercase tracking-widest flex items-center gap-2 transition-all self-start sm:self-auto shrink-0"
        >
          <UserPlus className="w-4 h-4" />
          <span>Add Staff Account</span>
        </button>
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

      {/* Search & Stats Bar */}
      <div className="bg-white border border-slate-200 p-4 rounded-sm shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search staff by Name or Staff ID..."
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-sm text-slate-900 placeholder-slate-400 text-xs font-medium focus:outline-none focus:border-blue-600 focus:bg-white"
          />
        </div>

        <div className="text-xs text-slate-600 flex items-center gap-3">
          <span className="flex items-center gap-1.5 text-blue-900 bg-blue-50 px-3 py-1.5 rounded-sm border border-blue-200 font-black uppercase tracking-wider text-[11px]">
            <Shield className="w-3.5 h-3.5 text-blue-600" />
            Admin Account: <strong className="text-blue-700">VSBEC</strong> (Full Access)
          </span>
          <span className="text-slate-500 font-bold uppercase tracking-wider text-[11px]">
            Total Staff: <strong>{staffList.length}</strong>
          </span>
        </div>
      </div>

      {/* Staff Table */}
      <div className="bg-white border border-slate-200 rounded-sm overflow-hidden shadow-sm">
        <div className="p-4 bg-[#0f172a] text-white flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center space-x-2">
            <UserCheck className="w-4 h-4 text-blue-400" />
            <h3 className="text-xs font-black uppercase tracking-widest">
              Staff Operator Directory
            </h3>
          </div>
        </div>

        {filteredStaff.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-50 text-slate-600 uppercase text-[10px] font-black tracking-wider border-b border-slate-200">
                <tr>
                  <th className="px-6 py-3.5 font-black">Staff ID</th>
                  <th className="px-6 py-3.5 font-black">Name</th>
                  <th className="px-6 py-3.5 font-black">Department</th>
                  <th className="px-6 py-3.5 font-black">Phone</th>
                  <th className="px-6 py-3.5 font-black">Assigned Permissions</th>
                  <th className="px-6 py-3.5 font-black text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredStaff.map((stf) => (
                  <tr key={stf.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-6 py-4 font-mono font-black text-blue-700 text-sm">
                      {stf.staffId}
                    </td>
                    <td className="px-6 py-4 font-black text-slate-900">{stf.name}</td>
                    <td className="px-6 py-4">
                      <span className="px-2.5 py-1 bg-slate-900 text-white font-black text-[11px] rounded-sm uppercase tracking-wider">
                        {stf.department}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-mono font-bold text-slate-800">{stf.phoneNumber}</td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-1">
                        {stf.permissions.map((p) => (
                          <span
                            key={p}
                            className="px-2 py-0.5 text-[10px] font-bold bg-blue-50 text-blue-800 border border-blue-200 rounded-sm uppercase tracking-wider"
                          >
                            {p.replace('_', ' ')}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right space-x-2">
                      <button
                        onClick={() => openEditModal(stf)}
                        title="Edit Staff & Permissions"
                        className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-slate-100 rounded transition-colors inline-block"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteStaff(stf.id, stf.name)}
                        title="Delete Staff Account"
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
            <UserCheck className="w-10 h-10 mx-auto text-slate-300" />
            <h4 className="text-sm font-black text-slate-800 uppercase tracking-wider">No Staff Accounts Configured</h4>
            <p className="text-xs text-slate-500 max-w-sm mx-auto font-medium">
              Only default administrator <strong>VSBEC</strong> exists. Click below to add staff operator accounts.
            </p>
            <button
              onClick={openAddModal}
              className="mt-2 px-5 py-2.5 bg-[#0f172a] hover:bg-blue-600 text-white font-black text-xs rounded-sm uppercase tracking-widest shadow-md"
            >
              Add Staff Member
            </button>
          </div>
        )}
      </div>

      {/* Add / Edit Staff Modal */}
      {(isAddModalOpen || editingStaff) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg bg-white border border-slate-200 rounded-sm shadow-2xl overflow-hidden animate-in fade-in zoom-in-95">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-[#0f172a] text-white">
              <h3 className="text-xs font-black uppercase tracking-widest flex items-center gap-2">
                <Shield className="w-4 h-4 text-blue-400" />
                <span>{editingStaff ? 'Edit Staff Account & Permissions' : 'Create Staff Operator Account'}</span>
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

            <form onSubmit={handleSaveStaff} className="p-5 space-y-4">
              {error && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold rounded-sm flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
                  <span>{error}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-black text-slate-700 uppercase tracking-wider mb-1">
                    Staff Name *
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g. Dr. K. Ramesh"
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-sm text-slate-900 text-xs font-bold focus:outline-none focus:border-blue-600 focus:bg-white"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-black text-slate-700 uppercase tracking-wider mb-1">
                    Staff ID / User ID *
                  </label>
                  <input
                    type="text"
                    value={formData.staffId}
                    onChange={(e) => setFormData({ ...formData, staffId: e.target.value })}
                    placeholder="e.g. STF001"
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-sm text-slate-900 font-mono text-xs font-bold focus:outline-none focus:border-blue-600 focus:bg-white"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                    Phone Number *
                  </label>
                  <input
                    type="text"
                    value={formData.phoneNumber}
                    onChange={(e) => setFormData({ ...formData, phoneNumber: e.target.value })}
                    placeholder="+919876543210"
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-sm text-slate-900 font-mono text-xs font-bold focus:outline-none focus:border-blue-600 focus:bg-white"
                    required
                  />
                </div>
              </div>

              {/* Permissions checkboxes */}
              <div>
                <label className="block text-xs font-black text-slate-700 uppercase tracking-wider mb-2">
                  Assign Module Permissions
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-slate-50 p-3 rounded-sm border border-slate-200 max-h-48 overflow-y-auto">
                  {ALL_PERMISSIONS.map((p) => {
                    const isChecked = formData.permissions.includes(p.key);
                    return (
                      <div
                        key={p.key}
                        onClick={() => togglePermission(p.key)}
                        className={`p-2.5 rounded-sm border text-xs cursor-pointer transition-all flex items-start space-x-2.5 ${
                          isChecked
                            ? 'bg-blue-50 border-blue-300 text-slate-900'
                            : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                        }`}
                      >
                        <div
                          className={`w-4 h-4 rounded-xs mt-0.5 flex items-center justify-center shrink-0 border ${
                            isChecked
                              ? 'bg-blue-600 border-blue-600 text-white'
                              : 'border-slate-300 bg-white'
                          }`}
                        >
                          {isChecked && <Check className="w-3 h-3" />}
                        </div>
                        <div>
                          <div className="font-bold">{p.label}</div>
                          <p className="text-[10px] text-slate-500 leading-tight">{p.desc}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="p-3 bg-slate-50 rounded-sm border border-slate-200 text-[11px] text-slate-600 font-medium flex items-center gap-2">
                <Lock className="w-4 h-4 text-blue-600 shrink-0" />
                <span>
                  Default Password for staff login: <strong className="text-slate-900 font-mono">VSB{formData.staffId || 'ID'}</strong>
                </span>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsAddModalOpen(false);
                    setEditingStaff(null);
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
                  {loading ? 'Saving...' : editingStaff ? 'Update Permissions' : 'Create Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingStaff && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-white border border-slate-200 w-full max-w-md rounded-sm shadow-xl p-6 space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-full">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">Confirm Staff Deletion</h3>
                <p className="text-xs font-medium text-slate-500">This action cannot be undone.</p>
              </div>
            </div>

            <div className="text-xs text-slate-700 bg-slate-50 p-3 rounded border border-slate-200 font-medium leading-relaxed">
              Are you sure you want to delete staff account for <strong className="text-slate-900 font-bold">{deletingStaff.name}</strong>?
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDeletingStaff(null)}
                className="px-4 py-2 border border-slate-300 rounded-sm text-xs font-bold uppercase tracking-wider text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDeleteStaff}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-sm text-xs font-black uppercase tracking-wider shadow-sm"
              >
                Yes, Delete Staff
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
