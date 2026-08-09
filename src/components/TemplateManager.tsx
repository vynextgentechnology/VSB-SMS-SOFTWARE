import React, { useState } from 'react';
import { SmsTemplate, MessageType } from '../types';
import { api } from '../lib/api';
import {
  FileCode2,
  Plus,
  Trash2,
  Edit2,
  Building2,
  Check,
  AlertCircle,
  X,
  Sparkles,
} from 'lucide-react';

interface TemplateManagerProps {
  templates: SmsTemplate[];
  onRefresh: () => void;
}

export const TemplateManager: React.FC<TemplateManagerProps> = ({
  templates,
  onRefresh,
}) => {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<SmsTemplate | null>(null);
  const [deletingTemplate, setDeletingTemplate] = useState<{ id: string; title: string } | null>(null);

  const [formData, setFormData] = useState({
    title: '',
    type: 'General Notification' as MessageType,
    templateText: '',
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const openAddModal = () => {
    setEditingTemplate(null);
    setFormData({
      title: '',
      type: 'General Notification',
      templateText: '',
    });
    setError(null);
    setIsAddModalOpen(true);
  };

  const openEditModal = (tpl: SmsTemplate) => {
    setEditingTemplate(tpl);
    setFormData({
      title: tpl.title,
      type: tpl.type,
      templateText: tpl.templateText,
    });
    setError(null);
  };

  const insertVariable = (varText: string) => {
    setFormData((prev) => ({
      ...prev,
      templateText: prev.templateText + ` ${varText} `,
    }));
  };

  const handleSaveTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!formData.title.trim() || !formData.templateText.trim()) {
      setError('Title and Template Text are required.');
      return;
    }

    setLoading(true);

    try {
      if (editingTemplate) {
        await api.updateTemplate(editingTemplate.id, formData);
        setSuccessMsg(`Template "${formData.title}" updated successfully.`);
        setEditingTemplate(null);
      } else {
        await api.addTemplate(formData);
        setSuccessMsg(`Template "${formData.title}" created successfully.`);
        setIsAddModalOpen(false);
      }
      onRefresh();
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to save template');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteTemplate = (id: string, title: string) => {
    setDeletingTemplate({ id, title });
  };

  const confirmDeleteTemplate = async () => {
    if (!deletingTemplate) return;
    const { id, title } = deletingTemplate;
    try {
      await api.deleteTemplate(id);
      setSuccessMsg(`Deleted template "${title}"`);
      setDeletingTemplate(null);
      onRefresh();
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to delete template');
    }
  };

  return (
    <div id="template-manager-view" className="space-y-6 animate-in fade-in duration-200">
      
      {/* Header Banner */}
      <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2 text-cyan-400 font-bold text-xs uppercase tracking-wider mb-1">
            <Building2 className="w-4 h-4" />
            <span>VY NEXTGEN TECHNOLOGY • QUICK TEMPLATES</span>
          </div>
          <h2 className="text-xl font-black text-white">SMS Message Templates</h2>
          <p className="text-xs text-slate-400 mt-1">
            Pre-configure standardized SMS templates for quick dispatch during results, alerts, and circulars.
          </p>
        </div>

        <button
          onClick={openAddModal}
          className="px-4 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold rounded-xl shadow-lg shadow-blue-600/20 text-xs flex items-center gap-2 transition-all self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Create New Template</span>
        </button>
      </div>

      {/* Notifications */}
      {successMsg && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Check className="w-4 h-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
        </div>
      )}

      {/* Templates Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {templates.map((tpl) => (
          <div
            key={tpl.id}
            className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col justify-between space-y-4 hover:border-slate-700 transition-all shadow-lg"
          >
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="px-2.5 py-0.5 bg-blue-500/10 text-cyan-400 border border-blue-500/20 rounded-md font-bold text-[10px] uppercase">
                  {tpl.type}
                </span>
                <div className="space-x-1">
                  <button
                    onClick={() => openEditModal(tpl)}
                    className="p-1 bg-slate-800 text-slate-300 rounded hover:bg-slate-700"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDeleteTemplate(tpl.id, tpl.title)}
                    className="p-1 bg-red-500/10 text-red-400 rounded hover:bg-red-500 hover:text-white"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <h4 className="font-bold text-white text-sm">{tpl.title}</h4>

              <p className="text-xs text-slate-300 bg-slate-950 p-3 rounded-xl border border-slate-800 font-sans leading-relaxed">
                {tpl.templateText}
              </p>
            </div>

            <div className="text-[10px] text-slate-500 font-mono flex items-center gap-1 pt-2 border-t border-slate-800/80">
              <Sparkles className="w-3 h-3 text-cyan-400" />
              <span>VY NEXTGEN TECHNOLOGY Official Template</span>
            </div>
          </div>
        ))}
      </div>

      {/* Add / Edit Template Modal */}
      {(isAddModalOpen || editingTemplate) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95">
            <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <FileCode2 className="w-4 h-4 text-cyan-400" />
                <span>{editingTemplate ? 'Edit SMS Template' : 'Create New SMS Template'}</span>
              </h3>
              <button
                onClick={() => {
                  setIsAddModalOpen(false);
                  setEditingTemplate(null);
                }}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveTemplate} className="p-5 space-y-4">
              {error && (
                <div className="p-3 bg-red-500/10 border border-red-500/30 text-red-400 text-xs rounded-xl flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">
                  Template Title *
                </label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="e.g. Attendance Warning Circular"
                  className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white text-xs focus:outline-none focus:border-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">
                  Category / Type *
                </label>
                <select
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value as MessageType })}
                  className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white text-xs focus:outline-none focus:border-blue-500"
                >
                  <option value="General Notification">General Notification</option>
                  <option value="Attendance Alert">Attendance Alert</option>
                  <option value="Exam Result">Exam Result</option>
                  <option value="Custom">Custom Message</option>
                </select>
              </div>

              {/* Variable Pills */}
              <div>
                <label className="block text-[11px] font-bold text-slate-400 mb-1">Insert Dynamic Variable:</label>
                <div className="flex flex-wrap gap-1">
                  {['{name}', '{regNo}', '{department}', '{marks}', '{date}', '{status}'].map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => insertVariable(v)}
                      className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 text-[10px] font-mono rounded"
                    >
                      + {v}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">
                  Template Text Content *
                </label>
                <textarea
                  value={formData.templateText}
                  onChange={(e) => setFormData({ ...formData, templateText: e.target.value })}
                  rows={4}
                  placeholder="Type message text... e.g. Dear {name} ({regNo}), ..."
                  className="w-full p-3 bg-slate-950 border border-slate-800 rounded-xl text-white text-xs leading-relaxed focus:outline-none focus:border-blue-500"
                  required
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsAddModalOpen(false);
                    setEditingTemplate(null);
                  }}
                  className="px-4 py-2 bg-slate-800 text-slate-300 text-xs font-bold rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-blue-600/30"
                >
                  {loading ? 'Saving...' : editingTemplate ? 'Update Template' : 'Save Template'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingTemplate && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-white border border-slate-200 w-full max-w-md rounded-sm shadow-xl p-6 space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-full">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">Confirm Template Deletion</h3>
                <p className="text-xs font-medium text-slate-500">This action cannot be undone.</p>
              </div>
            </div>

            <div className="text-xs text-slate-700 bg-slate-50 p-3 rounded border border-slate-200 font-medium leading-relaxed">
              Are you sure you want to delete template <strong className="text-slate-900 font-bold">{deletingTemplate.title}</strong>?
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDeletingTemplate(null)}
                className="px-4 py-2 border border-slate-300 rounded-sm text-xs font-bold uppercase tracking-wider text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDeleteTemplate}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-sm text-xs font-black uppercase tracking-wider shadow-sm"
              >
                Yes, Delete Template
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
