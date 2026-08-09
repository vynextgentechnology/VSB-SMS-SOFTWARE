import React, { useState } from 'react';
import { Department, Student, Staff } from '../types';
import { Building2, Plus, Search, Edit2, Trash2, CheckCircle2, AlertCircle, Users, UserCheck, RefreshCw } from 'lucide-react';

interface DepartmentManagementProps {
  departments: Department[];
  students: Student[];
  staffList: Staff[];
  onAddDepartment: (dept: { code: string; name: string; headOfDepartment?: string }) => Promise<void>;
  onUpdateDepartment: (id: string, dept: { code: string; name: string; headOfDepartment?: string }) => Promise<void>;
  onDeleteDepartment: (id: string) => Promise<void>;
  onSeedDepartments?: () => Promise<void>;
  userRole?: 'admin' | 'staff';
}

export const DepartmentManagement: React.FC<DepartmentManagementProps> = ({
  departments,
  students,
  staffList,
  onAddDepartment,
  onUpdateDepartment,
  onDeleteDepartment,
  onSeedDepartments,
  userRole = 'admin',
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDept, setEditingDept] = useState<Department | null>(null);
  const [deletingDept, setDeletingDept] = useState<{ id: string; code: string } | null>(null);
  const [seeding, setSeeding] = useState(false);

  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [headOfDepartment, setHeadOfDepartment] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openAddModal = () => {
    setEditingDept(null);
    setCode('');
    setName('');
    setHeadOfDepartment('');
    setError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (dept: Department) => {
    setEditingDept(dept);
    setCode(dept.code);
    setName(dept.name);
    setHeadOfDepartment(dept.headOfDepartment || '');
    setError(null);
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || !name.trim()) {
      setError('Department Code and Full Name are required.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      if (editingDept) {
        await onUpdateDepartment(editingDept.id, {
          code: code.trim().toUpperCase(),
          name: name.trim(),
          headOfDepartment: headOfDepartment.trim() || undefined,
        });
      } else {
        await onAddDepartment({
          code: code.trim().toUpperCase(),
          name: name.trim(),
          headOfDepartment: headOfDepartment.trim() || undefined,
        });
      }
      setIsModalOpen(false);
    } catch (err: any) {
      setError(err.message || 'Failed to save department.');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = (id: string, code: string) => {
    setDeletingDept({ id, code });
  };

  const confirmDeleteDept = async () => {
    if (!deletingDept) return;
    const { id } = deletingDept;
    try {
      await onDeleteDepartment(id);
      setDeletingDept(null);
    } catch (err: any) {
      setError(err.message || 'Failed to delete department');
    }
  };

  const handleSeed = async () => {
    if (onSeedDepartments) {
      setSeeding(true);
      try {
        await onSeedDepartments();
      } catch (err: any) {
        alert(err.message || 'Failed to seed default departments');
      } finally {
        setSeeding(false);
      }
    }
  };

  const filteredDepts = departments.filter(
    (d) =>
      d.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      d.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (d.headOfDepartment && d.headOfDepartment.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div id="department-management-view" className="space-y-6 animate-in fade-in duration-200">
      
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-sm border border-slate-200 shadow-sm">
        <div>
          <div className="text-[10px] font-black text-blue-600 uppercase tracking-widest mb-1">
            VSB ENGINEERING COLLEGE • DEPARTMENT MANAGEMENT
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 uppercase tracking-tight">
            Institutional Academic Departments
          </h2>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Create, configure, and maintain college department records for SMS broadcast routing.
          </p>
        </div>

        {userRole === 'admin' && (
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {onSeedDepartments && (
              <button
                id="dept-seed-default-btn"
                onClick={handleSeed}
                disabled={seeding}
                className="bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 px-4 py-3 rounded-sm text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2 disabled:opacity-50"
                title="Automatically populate default college departments"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-blue-600 ${seeding ? 'animate-spin' : ''}`} />
                <span>{seeding ? 'Seeding...' : 'Seed Defaults'}</span>
              </button>
            )}
            <button
              id="dept-add-new-btn"
              onClick={openAddModal}
              className="bg-[#0f172a] hover:bg-blue-600 text-white px-5 py-3 rounded-sm text-xs font-black uppercase tracking-widest transition-all shadow-md flex items-center gap-2 shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>Create Department</span>
            </button>
          </div>
        )}
      </div>

      {/* Search Bar */}
      <div className="bg-white p-4 rounded-sm border border-slate-200 shadow-sm flex items-center gap-4">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search departments by code, name, or HOD..."
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-sm text-xs font-medium focus:outline-none focus:border-blue-600 focus:bg-white"
          />
        </div>
        <div className="text-xs text-slate-500 font-bold uppercase tracking-wider shrink-0">
          Total: {filteredDepts.length} Departments
        </div>
      </div>

      {/* Department Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredDepts.map((dept) => {
          const deptStudents = students.filter(
            (s) => s.department && s.department.toUpperCase() === dept.code.toUpperCase()
          ).length;
          const deptStaff = staffList.filter(
            (st) => st.department && st.department.toUpperCase() === dept.code.toUpperCase()
          ).length;

          return (
            <div
              key={dept.id}
              className="bg-white border border-slate-200 rounded-sm p-6 shadow-sm hover:shadow-md transition-all flex flex-col justify-between border-t-4 border-t-blue-600"
            >
              <div>
                <div className="flex justify-between items-start mb-3">
                  <span className="bg-[#0f172a] text-white px-3 py-1 text-sm font-black tracking-widest rounded-sm uppercase">
                    {dept.code}
                  </span>
                  {userRole === 'admin' && (
                    <div className="flex items-center space-x-1">
                      <button
                        onClick={() => openEditModal(dept)}
                        className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-slate-100 rounded transition-colors"
                        title="Edit Department"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(dept.id, dept.code)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-slate-100 rounded transition-colors"
                        title="Delete Department"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>

                <h3 className="text-base font-black text-slate-900 uppercase tracking-tight mb-2">
                  {dept.name}
                </h3>

                {dept.headOfDepartment && (
                  <div className="text-xs font-bold text-slate-600 mb-4 bg-slate-50 p-2 rounded border border-slate-100">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-black">HOD:</span>
                    <span>{dept.headOfDepartment}</span>
                  </div>
                )}
              </div>

              <div className="pt-4 border-t border-slate-100 grid grid-cols-2 gap-2 text-center">
                <div className="bg-blue-50 p-2.5 rounded-sm border border-blue-100">
                  <div className="text-lg font-black text-blue-900">{deptStudents}</div>
                  <div className="text-[10px] font-bold text-blue-700 uppercase tracking-wider flex items-center justify-center gap-1">
                    <Users className="w-3 h-3" />
                    <span>Students</span>
                  </div>
                </div>

                <div className="bg-amber-50 p-2.5 rounded-sm border border-amber-100">
                  <div className="text-lg font-black text-amber-900">{deptStaff}</div>
                  <div className="text-[10px] font-bold text-amber-700 uppercase tracking-wider flex items-center justify-center gap-1">
                    <UserCheck className="w-3 h-3" />
                    <span>Staff</span>
                  </div>
                </div>
              </div>

            </div>
          );
        })}
      </div>

      {filteredDepts.length === 0 && (
        <div className="bg-white p-12 text-center border border-slate-200 rounded-sm">
          <Building2 className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider">No Departments Found</h3>
          <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto font-medium">
            Click "Create Department" to add CSE, EEE, ECE, MECH, CIVIL, IT, or custom college department codes.
          </p>
        </div>
      )}

      {/* Modal for Add / Edit Department */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4">
          <div className="bg-white border border-slate-200 rounded-sm shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-150">
            <div className="bg-[#0f172a] text-white p-5 flex justify-between items-center">
              <div>
                <div className="text-[10px] font-black text-blue-400 uppercase tracking-widest">
                  VSB ENGINEERING COLLEGE
                </div>
                <h3 className="text-base font-black uppercase tracking-tight">
                  {editingDept ? 'Edit Department' : 'Create New Department'}
                </h3>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-white text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {error && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold rounded-sm flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-black text-slate-700 uppercase tracking-wider mb-1">
                  Department Code *
                </label>
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="e.g. CSE, EEE, ECE, MECH"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-sm text-xs font-bold text-slate-900 uppercase focus:outline-none focus:border-blue-600 focus:bg-white"
                  required
                />
                <span className="text-[10px] text-slate-400 font-bold uppercase mt-0.5 block">
                  Short code used across register numbers and reports
                </span>
              </div>

              <div>
                <label className="block text-xs font-black text-slate-700 uppercase tracking-wider mb-1">
                  Department Full Name *
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Computer Science & Engineering"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-sm text-xs font-bold text-slate-900 focus:outline-none focus:border-blue-600 focus:bg-white"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-black text-slate-700 uppercase tracking-wider mb-1">
                  Head of Department (HOD)
                </label>
                <input
                  type="text"
                  value={headOfDepartment}
                  onChange={(e) => setHeadOfDepartment(e.target.value)}
                  placeholder="e.g. Dr. R. Sharma"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-sm text-xs font-bold text-slate-900 focus:outline-none focus:border-blue-600 focus:bg-white"
                />
              </div>

              <div className="pt-4 border-t border-slate-100 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 font-bold text-xs uppercase rounded-sm hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-black text-xs uppercase tracking-widest rounded-sm shadow-md disabled:opacity-50"
                >
                  {loading ? 'Saving...' : 'Save Department'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Department Modal Overlay */}
      {deletingDept && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-white border border-slate-200 w-full max-w-md rounded-sm shadow-xl p-6 space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-full">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">Confirm Department Deletion</h3>
                <p className="text-xs font-medium text-slate-500">This action cannot be undone.</p>
              </div>
            </div>

            <div className="text-xs text-slate-700 bg-slate-50 p-3 rounded border border-slate-200 font-medium leading-relaxed">
              Are you sure you want to delete department <strong className="text-slate-900 font-bold">{deletingDept.code}</strong>?
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDeletingDept(null)}
                className="px-4 py-2 border border-slate-300 rounded-sm text-xs font-bold uppercase tracking-wider text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDeleteDept}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-sm text-xs font-black uppercase tracking-wider shadow-sm"
              >
                Yes, Delete Department
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
