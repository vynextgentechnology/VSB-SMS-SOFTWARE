import React, { useState, useEffect } from 'react';
import { User, UserRole, Department } from '../types';
import { api } from '../lib/api';
import {
  ShieldCheck,
  UserPlus,
  Search,
  Trash2,
  Users,
  GraduationCap,
  UserCheck,
  Lock,
  KeyRound,
  CheckCircle2,
  AlertCircle,
  Building2,
  ShieldAlert,
  Edit3,
  X,
} from 'lucide-react';

interface AdminManagementProps {
  departments: Department[];
  currentUser?: User | null;
  onRefresh: () => void;
}

export const AdminManagement: React.FC<AdminManagementProps> = ({
  departments,
  currentUser,
  onRefresh,
}) => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeRoleFilter, setActiveRoleFilter] = useState<'all' | 'admin' | 'hod' | 'staff'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Delete Modal State
  const [deletingUserItem, setDeletingUserItem] = useState<{ id: string; userId: string; name: string } | null>(null);

  // Edit Modal State
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editFormData, setEditFormData] = useState({
    name: '',
    role: 'staff' as UserRole,
    department: 'General',
    phoneNumber: '',
    rawPassword: '',
  });

  // Create Form State
  const [formData, setFormData] = useState({
    userId: '',
    name: '',
    role: 'staff' as UserRole,
    department: 'General',
    phoneNumber: '',
    rawPassword: '',
  });

  const loadUsers = async () => {
    setLoading(true);
    try {
      const data = await api.getUsers();
      setUsers(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load user accounts.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    if (!formData.userId.trim() || !formData.name.trim() || !formData.rawPassword.trim()) {
      setError('User ID, Full Name, and Password are required.');
      return;
    }

    setIsSubmitting(true);
    try {
      const cleanUserId = formData.userId.trim().toUpperCase();
      await api.addUser({
        userId: cleanUserId,
        name: formData.name.trim(),
        role: formData.role,
        department: formData.department,
        phoneNumber: formData.phoneNumber.trim(),
        rawPassword: formData.rawPassword.trim(),
      });

      setSuccessMsg(`User account '${cleanUserId}' (${formData.role.toUpperCase()}) created successfully!`);
      setFormData({
        userId: '',
        name: '',
        role: 'staff',
        department: 'General',
        phoneNumber: '',
        rawPassword: '',
      });
      await loadUsers();
      onRefresh();
    } catch (err: any) {
      setError(err.message || 'Failed to create user account.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const openEditUserModal = (user: User) => {
    setEditingUser(user);
    setEditFormData({
      name: user.name,
      role: user.role,
      department: user.department || 'General',
      phoneNumber: user.phoneNumber || '',
      rawPassword: '',
    });
    setError(null);
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setError(null);
    setSuccessMsg(null);
    setIsSubmitting(true);

    try {
      await api.updateUser(editingUser.id, {
        name: editFormData.name.trim(),
        role: editFormData.role,
        department: editFormData.department,
        phoneNumber: editFormData.phoneNumber.trim(),
        rawPassword: editFormData.rawPassword.trim() || undefined,
      });

      setSuccessMsg(`User account '${editingUser.userId}' updated successfully!`);
      setEditingUser(null);
      await loadUsers();
      onRefresh();
    } catch (err: any) {
      setError(err.message || 'Failed to update user account.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteUser = (user: User) => {
    if (user.userId === 'VSBEC' || user.userId === currentUser?.userId) {
      setError('Cannot delete the primary System Admin account or your current active session account.');
      return;
    }
    setError(null);
    setDeletingUserItem({ id: user.id, userId: user.userId, name: user.name });
  };

  const confirmDeleteUser = async () => {
    if (!deletingUserItem) return;
    const { id, userId } = deletingUserItem;
    setIsSubmitting(true);
    setError(null);
    try {
      await api.deleteUser(id);
      setSuccessMsg(`Deleted user account '${userId}'`);
      setDeletingUserItem(null);
      await loadUsers();
      onRefresh();
    } catch (err: any) {
      setError(err.message || 'Failed to delete user.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredUsers = users.filter((u) => {
    const matchesRole = activeRoleFilter === 'all' || u.role === activeRoleFilter;
    const q = searchTerm.toLowerCase();
    const matchesQuery =
      u.userId.toLowerCase().includes(q) ||
      u.name.toLowerCase().includes(q) ||
      (u.department && u.department.toLowerCase().includes(q)) ||
      (u.phoneNumber && u.phoneNumber.includes(q));

    return matchesRole && matchesQuery;
  });

  const adminCount = users.filter((u) => u.role === 'admin').length;
  const hodCount = users.filter((u) => u.role === 'hod').length;
  const staffCount = users.filter((u) => u.role === 'staff').length;

  return (
    <div id="admin-management-view" className="space-y-8 animate-in fade-in duration-200">
      
      {/* Top Banner */}
      <div className="bg-[#0f172a] text-white p-6 rounded-sm shadow-md border-l-4 border-amber-500 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-amber-400" />
            <span className="text-xs font-black uppercase tracking-widest text-amber-300">
              Admin Portal & Role Management
            </span>
          </div>
          <h2 className="text-xl font-black uppercase tracking-tight text-white">
            System User Accounts & Credentials
          </h2>
          <p className="text-xs text-slate-300 max-w-2xl font-medium">
            Strict role-based account control for <strong className="text-amber-300">Admin</strong>, <strong className="text-amber-300">HOD</strong>, and <strong className="text-amber-300">Staff</strong> credentials. Users are strictly authenticated against their specific role portal.
          </p>
        </div>

        {/* User Stats Badges */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="bg-amber-500/10 border border-amber-500/30 px-3 py-2 rounded-sm text-center">
            <div className="text-amber-400 text-lg font-black">{adminCount}</div>
            <div className="text-[10px] text-amber-200 uppercase font-black tracking-wider">Admins</div>
          </div>
          <div className="bg-indigo-500/10 border border-indigo-500/30 px-3 py-2 rounded-sm text-center">
            <div className="text-indigo-400 text-lg font-black">{hodCount}</div>
            <div className="text-[10px] text-indigo-200 uppercase font-black tracking-wider">HODs</div>
          </div>
          <div className="bg-slate-700/50 border border-slate-600 px-3 py-2 rounded-sm text-center">
            <div className="text-slate-200 text-lg font-black">{staffCount}</div>
            <div className="text-[10px] text-slate-300 uppercase font-black tracking-wider">Staff</div>
          </div>
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <div className="bg-rose-50 border-l-4 border-rose-500 p-4 text-rose-800 text-xs font-bold flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
            <span>{error}</span>
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

      {/* Grid: Create User Form + Users Table */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left: Create Account Form */}
        <div className="lg:col-span-5 bg-white border border-slate-200 p-6 rounded-sm shadow-sm space-y-6">
          <div className="border-b border-slate-100 pb-4">
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-amber-500" />
              <span>Create New User Account</span>
            </h3>
            <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mt-1">
              Grant Admin, HOD, or Staff login credentials
            </p>
          </div>

          <form onSubmit={handleCreateUser} className="space-y-4">
            <div>
              <label className="block text-[11px] font-black text-slate-700 uppercase tracking-wider mb-1">
                Role Authorization <span className="text-rose-500">*</span>
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, role: 'admin' })}
                  className={`py-2 px-2 text-xs font-black uppercase tracking-wider rounded-sm border transition-all flex items-center justify-center gap-1 ${
                    formData.role === 'admin'
                      ? 'bg-[#0f172a] text-amber-400 border-amber-500 shadow-sm'
                      : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Admin</span>
                </button>

                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, role: 'hod' })}
                  className={`py-2 px-2 text-xs font-black uppercase tracking-wider rounded-sm border transition-all flex items-center justify-center gap-1 ${
                    formData.role === 'hod'
                      ? 'bg-[#0f172a] text-indigo-400 border-indigo-500 shadow-sm'
                      : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <GraduationCap className="w-3.5 h-3.5" />
                  <span>HOD</span>
                </button>

                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, role: 'staff' })}
                  className={`py-2 px-2 text-xs font-black uppercase tracking-wider rounded-sm border transition-all flex items-center justify-center gap-1 ${
                    formData.role === 'staff'
                      ? 'bg-[#0f172a] text-sky-400 border-sky-500 shadow-sm'
                      : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <UserCheck className="w-3.5 h-3.5" />
                  <span>Staff</span>
                </button>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-black text-slate-700 uppercase tracking-wider mb-1">
                User ID (Login Username) <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                placeholder="e.g. VSBEC / HOD_CSE / STAFF101"
                value={formData.userId}
                onChange={(e) => setFormData({ ...formData, userId: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-sm text-xs font-bold uppercase font-mono focus:outline-none focus:ring-2 focus:ring-amber-500"
                required
              />
            </div>

            <div>
              <label className="block text-[11px] font-black text-slate-700 uppercase tracking-wider mb-1">
                Full Name <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                placeholder="e.g. Dr. R. Ramesh"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-sm text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-amber-500"
                required
              />
            </div>

            <div>
              <label className="block text-[11px] font-black text-slate-700 uppercase tracking-wider mb-1">
                Department
              </label>
              <select
                value={formData.department}
                onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-sm text-xs font-bold focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                <option value="General">General / All Departments</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.code}>
                    {d.code} - {d.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-black text-slate-700 uppercase tracking-wider mb-1">
                Mobile Number
              </label>
              <input
                type="tel"
                placeholder="e.g. 9876543210"
                value={formData.phoneNumber}
                onChange={(e) => setFormData({ ...formData, phoneNumber: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-sm text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-black text-slate-700 uppercase tracking-wider mb-1">
                Initial Password <span className="text-rose-500">*</span>
              </label>
              <input
                type="password"
                placeholder="Set password (e.g. VSBSMS)"
                value={formData.rawPassword}
                onChange={(e) => setFormData({ ...formData, rawPassword: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-sm text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-amber-500"
                required
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-[#0f172a] hover:bg-slate-900 text-amber-400 border border-amber-500/50 py-3 rounded-sm text-xs font-black uppercase tracking-widest transition-all shadow-md"
            >
              {isSubmitting ? 'Creating Account...' : '+ Add User Account'}
            </button>
          </form>
        </div>

        {/* Right: Active Users List */}
        <div className="lg:col-span-7 bg-white border border-slate-200 p-6 rounded-sm shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-100 pb-4">
            <div>
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
                <Users className="w-4 h-4 text-amber-500" />
                <span>Authorized Accounts ({filteredUsers.length})</span>
              </h3>
              <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mt-1">
                All registered login accounts across portals
              </p>
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search User ID, Name, Dept..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 border border-slate-300 rounded-sm text-xs font-medium focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
          </div>

          {/* Role Filter Tabs */}
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3 overflow-x-auto">
            {(['all', 'admin', 'hod', 'staff'] as const).map((r) => (
              <button
                key={r}
                onClick={() => setActiveRoleFilter(r)}
                className={`px-3 py-1.5 text-[11px] font-black uppercase tracking-wider rounded-sm transition-all ${
                  activeRoleFilter === r
                    ? 'bg-[#0f172a] text-amber-400 border border-amber-500/40 shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {r === 'all' ? 'All Roles' : r.toUpperCase()}
              </button>
            ))}
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-black uppercase text-slate-500">
                <tr>
                  <th className="p-3">User ID</th>
                  <th className="p-3">Name</th>
                  <th className="p-3">Role</th>
                  <th className="p-3">Department</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs font-medium text-slate-700">
                {filteredUsers.length > 0 ? (
                  filteredUsers.map((u) => (
                    <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                      <td className="p-3 font-mono font-bold text-slate-900 uppercase flex items-center gap-1.5">
                        <KeyRound className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                        <span>{u.userId}</span>
                      </td>
                      <td className="p-3 font-bold text-slate-900">{u.name}</td>
                      <td className="p-3">
                        {u.role === 'admin' && (
                          <span className="px-2 py-0.5 text-[10px] font-black rounded uppercase bg-amber-500/10 text-amber-700 border border-amber-500/30 flex items-center w-fit gap-1">
                            <ShieldCheck className="w-3 h-3" />
                            ADMIN
                          </span>
                        )}
                        {u.role === 'hod' && (
                          <span className="px-2 py-0.5 text-[10px] font-black rounded uppercase bg-indigo-500/10 text-indigo-700 border border-indigo-500/30 flex items-center w-fit gap-1">
                            <GraduationCap className="w-3 h-3" />
                            HOD
                          </span>
                        )}
                        {u.role === 'staff' && (
                          <span className="px-2 py-0.5 text-[10px] font-black rounded uppercase bg-sky-500/10 text-sky-700 border border-sky-500/30 flex items-center w-fit gap-1">
                            <UserCheck className="w-3 h-3" />
                            STAFF
                          </span>
                        )}
                      </td>
                      <td className="p-3 font-semibold text-slate-600">{u.department || 'General'}</td>
                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => openEditUserModal(u)}
                            className="p-1.5 text-slate-400 hover:text-amber-600 transition-colors"
                            title="Edit User Details"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteUser(u)}
                            disabled={u.userId === 'VSBEC' || u.userId === currentUser?.userId}
                            className="p-1.5 text-slate-400 hover:text-rose-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                            title={u.userId === 'VSBEC' ? 'Primary Admin cannot be deleted' : 'Delete User'}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-slate-400 font-bold uppercase text-xs">
                      No user accounts found matching your filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>

      {/* Edit User Modal Overlay */}
      {editingUser && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white border border-slate-200 w-full max-w-lg rounded-sm shadow-xl p-6 space-y-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2">
                <Edit3 className="w-5 h-5 text-amber-500" />
                <div>
                  <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">
                    Edit User Account Details
                  </h3>
                  <span className="text-[10px] font-mono font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                    User ID: {editingUser.userId}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setEditingUser(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-sm"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUpdateUser} className="space-y-4">
              <div>
                <label className="block text-[11px] font-black text-slate-700 uppercase tracking-wider mb-1">
                  Role Authorization <span className="text-rose-500">*</span>
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setEditFormData({ ...editFormData, role: 'admin' })}
                    className={`py-2 px-2 text-xs font-black uppercase tracking-wider rounded-sm border transition-all flex items-center justify-center gap-1 ${
                      editFormData.role === 'admin'
                        ? 'bg-[#0f172a] text-amber-400 border-amber-500 shadow-sm'
                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Admin</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setEditFormData({ ...editFormData, role: 'hod' })}
                    className={`py-2 px-2 text-xs font-black uppercase tracking-wider rounded-sm border transition-all flex items-center justify-center gap-1 ${
                      editFormData.role === 'hod'
                        ? 'bg-[#0f172a] text-indigo-400 border-indigo-500 shadow-sm'
                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <GraduationCap className="w-3.5 h-3.5" />
                    <span>HOD</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setEditFormData({ ...editFormData, role: 'staff' })}
                    className={`py-2 px-2 text-xs font-black uppercase tracking-wider rounded-sm border transition-all flex items-center justify-center gap-1 ${
                      editFormData.role === 'staff'
                        ? 'bg-[#0f172a] text-sky-400 border-sky-500 shadow-sm'
                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <UserCheck className="w-3.5 h-3.5" />
                    <span>Staff</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-black text-slate-700 uppercase tracking-wider mb-1">
                  Full Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={editFormData.name}
                  onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-sm text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-amber-500"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-black text-slate-700 uppercase tracking-wider mb-1">
                  Department
                </label>
                <select
                  value={editFormData.department}
                  onChange={(e) => setEditFormData({ ...editFormData, department: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-sm text-xs font-bold focus:outline-none focus:ring-2 focus:ring-amber-500"
                >
                  <option value="General">General / All Departments</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.code}>
                      {d.code} - {d.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-black text-slate-700 uppercase tracking-wider mb-1">
                  Mobile Number
                </label>
                <input
                  type="tel"
                  value={editFormData.phoneNumber}
                  onChange={(e) => setEditFormData({ ...editFormData, phoneNumber: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-sm text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-black text-slate-700 uppercase tracking-wider mb-1">
                  Reset Password (Optional)
                </label>
                <input
                  type="password"
                  placeholder="Leave blank to keep existing password"
                  value={editFormData.rawPassword}
                  onChange={(e) => setEditFormData({ ...editFormData, rawPassword: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-sm text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="px-4 py-2 border border-slate-300 rounded-sm text-xs font-bold uppercase tracking-wider text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 bg-[#0f172a] hover:bg-slate-900 text-amber-400 border border-amber-500/50 rounded-sm text-xs font-black uppercase tracking-wider shadow-md"
                >
                  {isSubmitting ? 'Saving Changes...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete User Modal Overlay */}
      {deletingUserItem && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-white border border-slate-200 w-full max-w-md rounded-sm shadow-xl p-6 space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-full">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">Confirm User Deletion</h3>
                <p className="text-xs font-medium text-slate-500">This action cannot be undone.</p>
              </div>
            </div>

            <div className="text-xs text-slate-700 bg-slate-50 p-3 rounded border border-slate-200 font-medium leading-relaxed">
              Are you sure you want to delete user account <strong className="text-slate-900 font-bold font-mono">{deletingUserItem.userId}</strong> ({deletingUserItem.name})? They will immediately lose access to the portal.
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDeletingUserItem(null)}
                className="px-4 py-2 border border-slate-300 rounded-sm text-xs font-bold uppercase tracking-wider text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDeleteUser}
                disabled={isSubmitting}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-sm text-xs font-black uppercase tracking-wider shadow-sm flex items-center gap-1.5"
              >
                {isSubmitting ? 'Deleting...' : 'Yes, Delete User'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
