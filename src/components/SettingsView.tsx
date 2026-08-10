import React, { useState, useEffect } from 'react';
import { GatewaySettings, ApiKey } from '../types';
import { api } from '../lib/api';
import {
  Settings,
  Shield,
  Smartphone,
  Send,
  CheckCircle2,
  AlertCircle,
  Building2,
  Wifi,
  Key,
  Zap,
  Download,
  Copy,
  Plus,
  Trash2,
  ToggleLeft,
  ToggleRight,
  Code2,
  Check,
  FileArchive,
  Layers,
} from 'lucide-react';

interface SettingsViewProps {
  onRefresh: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ onRefresh }) => {
  const [settings, setSettings] = useState<GatewaySettings>({
    provider: 'Fast2SMS',
    fast2smsApiKey: '',
    fast2smsSenderId: 'VSBEC',
    fast2smsRoute: 'dlt',
    fast2smsEnabled: true,
    twilioAccountSid: '',
    twilioAuthToken: '',
    twilioFromNumber: '+18005550199',
    whatsAppEnabled: false,
    whatsAppApiKey: '',
    autoSendResultSms: false,
    defaultSenderName: 'VSBEC VY NEXTGEN',
  });

  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyRole, setNewKeyRole] = useState<'admin' | 'hod' | 'staff' | 'system'>('staff');
  const [newKeyDept, setNewKeyDept] = useState('ALL');
  const [newKeyDesc, setNewKeyDesc] = useState('');
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [copiedKeyId, setCopiedKeyId] = useState<string | null>(null);

  const [testPhone, setTestPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [downloadingZip, setDownloadingZip] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    loadSettings();
    loadApiKeys();
  }, []);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const data = await api.getSettings();
      if (data) setSettings(data);
    } catch (err: any) {
      setError('Failed to load gateway settings');
    } finally {
      setLoading(false);
    }
  };

  const loadApiKeys = async () => {
    try {
      const keys = await api.getApiKeys();
      setApiKeys(keys);
    } catch (err) {
      console.error('Failed to fetch API keys:', err);
    }
  };

  const handleCreateKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeyName.trim()) return;
    try {
      await api.createApiKey({
        name: newKeyName.trim(),
        role: newKeyRole,
        department: newKeyDept,
        description: newKeyDesc || 'Custom API authentication key.',
      });
      setNewKeyName('');
      setNewKeyDesc('');
      setShowKeyModal(false);
      loadApiKeys();
      setSuccessMsg('New API Key generated successfully!');
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to create API key');
    }
  };

  const handleToggleKey = async (id: string) => {
    try {
      await api.toggleApiKey(id);
      loadApiKeys();
    } catch (err) {
      console.error('Failed to toggle API key:', err);
    }
  };

  const handleDeleteKey = async (id: string) => {
    if (!confirm('Are you sure you want to delete this API key?')) return;
    try {
      await api.deleteApiKey(id);
      loadApiKeys();
    } catch (err) {
      console.error('Failed to delete API key:', err);
    }
  };

  const handleCopyKey = (keyString: string, id: string) => {
    navigator.clipboard.writeText(keyString);
    setCopiedKeyId(id);
    setTimeout(() => setCopiedKeyId(null), 2000);
  };

  const handleDownloadCodeZip = async () => {
    setDownloadingZip(true);
    try {
      await api.downloadSourceCodeZip();
      setSuccessMsg('Complete project codebase ZIP package downloaded successfully!');
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: any) {
      alert('Failed to download source code ZIP: ' + err.message);
    } finally {
      setDownloadingZip(false);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccessMsg(null);

    try {
      await api.saveSettings(settings);
      setSuccessMsg('Fast2SMS & Gateway configurations saved successfully!');
      onRefresh();
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleSendTestSms = async () => {
    if (!testPhone.trim()) {
      alert('Please enter a test phone number');
      return;
    }

    setTestResult('Connecting to Fast2SMS Carrier Gateway & sending test message...');
    try {
      const res = await api.sendSms({
        recipients: [
          {
            name: 'Test Administrator',
            registerNumber: 'VSB-TEST-01',
            phoneNumber: testPhone.trim(),
            department: 'ADMIN',
          },
        ],
        messageType: 'General Notification',
        messageContent: 'Test Notification from VSB ENGINEERING COLLEGE (Powered by VY NEXTGEN TECHNOLOGY). SMS Gateway Verified!',
        channel: 'SMS',
      });

      if (res.sentCount > 0) {
        setTestResult('✅ Connection Verified! Test SMS dispatched successfully via ' + settings.provider + ' (Sender ID: ' + (settings.fast2smsSenderId || 'VSBEC') + ')');
      } else {
        setTestResult('❌ Test SMS Failed to deliver. Please verify API Key or Phone format.');
      }
    } catch (err: any) {
      setTestResult('❌ Gateway Error: ' + err.message);
    }
  };

  return (
    <div id="settings-view" className="space-y-6 animate-in fade-in duration-200">
      
      {/* Header Banner */}
      <div className="bg-white border border-slate-200 p-6 rounded-sm shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2 text-blue-600 font-black text-xs uppercase tracking-widest mb-1">
            <Building2 className="w-4 h-4" />
            <span>VSB ENGINEERING COLLEGE • VY NEXTGEN TECHNOLOGY</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 uppercase tracking-tight">
            System Settings & Security API Keys
          </h2>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Manage Fast2SMS gateway credentials, pre-attached system API keys, and download complete source code.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleDownloadCodeZip}
            disabled={downloadingZip}
            className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white text-xs font-black uppercase tracking-wider rounded-sm shadow-xs flex items-center gap-2 transition-all disabled:opacity-50"
          >
            <FileArchive className="w-4 h-4" />
            <span>{downloadingZip ? 'Zipping Codebase...' : 'Download Codebase (.ZIP)'}</span>
          </button>
        </div>
      </div>

      {/* Notifications */}
      {successMsg && (
        <div className="p-4 rounded-sm bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
            <span>{successMsg}</span>
          </div>
        </div>
      )}

      {/* API Keys Management Card */}
      <div className="bg-white border border-slate-200 p-6 rounded-sm shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
          <div>
            <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <Key className="w-4 h-4 text-blue-600" />
              <span>Pre-Attached System API Keys & Authentication</span>
            </h3>
            <p className="text-[11px] text-slate-500 font-medium mt-0.5">
              {apiKeys.length} active API keys securely attached in code for external integrations & automated result dispatchers.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowKeyModal(true)}
            className="px-3.5 py-2 bg-slate-900 hover:bg-blue-600 text-white text-xs font-black uppercase tracking-wider rounded-sm flex items-center gap-1.5 transition-all shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Generate API Key</span>
          </button>
        </div>

        {/* API Keys Table */}
        <div className="overflow-x-auto border border-slate-200 rounded-sm">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-black uppercase text-slate-500 tracking-wider">
              <tr>
                <th className="p-3">Key Name & ID</th>
                <th className="p-3">API Key Secret</th>
                <th className="p-3">Role & Dept</th>
                <th className="p-3">Status</th>
                <th className="p-3">Last Used</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {apiKeys.map((k) => (
                <tr key={k.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="p-3">
                    <div className="font-bold text-slate-900">{k.name}</div>
                    <div className="text-[10px] text-slate-400 font-mono">{k.id} • {k.description}</div>
                  </td>
                  <td className="p-3 font-mono text-[11px]">
                    <div className="flex items-center gap-1.5">
                      <span className="bg-slate-100 border border-slate-200 px-2 py-0.5 rounded text-slate-800">
                        {k.key.slice(0, 18)}...
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCopyKey(k.key, k.id)}
                        className="p-1 hover:bg-slate-200 rounded text-slate-600 transition-all"
                        title="Copy full key string"
                      >
                        {copiedKeyId === k.id ? (
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  </td>
                  <td className="p-3">
                    <span className="px-2 py-0.5 bg-blue-50 border border-blue-200 text-blue-700 text-[10px] font-black uppercase rounded mr-1">
                      {k.role}
                    </span>
                    <span className="text-[10px] text-slate-500 font-bold uppercase">{k.department}</span>
                  </td>
                  <td className="p-3">
                    <button
                      type="button"
                      onClick={() => handleToggleKey(k.id)}
                      className={`px-2 py-0.5 text-[10px] font-black uppercase rounded border transition-all ${
                        k.status === 'active'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                          : 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
                      }`}
                    >
                      {k.status}
                    </button>
                  </td>
                  <td className="p-3 text-[11px] text-slate-500 font-mono">
                    {k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Never'}
                  </td>
                  <td className="p-3 text-right">
                    <button
                      type="button"
                      onClick={() => handleDeleteKey(k.id)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-all"
                      title="Revoke & Delete Key"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <form onSubmit={handleSaveSettings} className="space-y-6">
        
        {/* Fast2SMS Configuration Card */}
        <div className="bg-white border border-slate-200 p-6 rounded-sm shadow-sm space-y-4">
          <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider border-b border-slate-200 pb-3 flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-500" />
            <span>Fast2SMS Official Gateway Configuration</span>
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-black text-slate-700 uppercase tracking-wider mb-1">
                Primary Provider Mode
              </label>
              <select
                value={settings.provider}
                onChange={(e) => setSettings({ ...settings, provider: e.target.value as any })}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-sm text-slate-900 text-xs font-bold focus:outline-none focus:border-blue-600 focus:bg-white"
              >
                <option value="Fast2SMS">Fast2SMS Bulk SMS (Recommended for India)</option>
                <option value="Twilio">Twilio SMS Gateway API</option>
                <option value="Textlocal">Textlocal India API</option>
                <option value="Simulated Gateway">Production Carrier Simulator (Instant Dispatch)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-black text-slate-700 uppercase tracking-wider mb-1">
                Sender ID / Header Name
              </label>
              <input
                type="text"
                value={settings.fast2smsSenderId || 'VSBEC'}
                onChange={(e) => setSettings({ ...settings, fast2smsSenderId: e.target.value, defaultSenderName: e.target.value })}
                placeholder="VSBEC"
                className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-sm text-slate-900 text-xs font-bold focus:outline-none focus:border-blue-600 focus:bg-white"
              />
              <span className="text-[10px] text-slate-400 font-bold uppercase mt-0.5 block">Approved DLT Sender ID (6 Characters)</span>
            </div>
          </div>

          <div className="p-4 bg-slate-50 border border-slate-200 rounded-sm space-y-3">
            <div className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center justify-between">
              <span>Fast2SMS API Credentials</span>
              <span className="text-[10px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded font-bold uppercase">Fast2SMS v2 API</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="md:col-span-2">
                <label className="block text-[11px] font-black text-slate-600 uppercase mb-1">Fast2SMS API Key (Authorization):</label>
                <input
                  type="password"
                  value={settings.fast2smsApiKey || ''}
                  onChange={(e) => setSettings({ ...settings, fast2smsApiKey: e.target.value })}
                  placeholder="Paste Fast2SMS API Key (or leave blank to use carrier simulation mode)"
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-sm text-slate-900 font-mono text-xs focus:outline-none focus:border-blue-600"
                />
              </div>

              <div>
                <label className="block text-[11px] font-black text-slate-600 uppercase mb-1">DLT / Route Mode:</label>
                <select
                  value={settings.fast2smsRoute || 'dlt'}
                  onChange={(e) => setSettings({ ...settings, fast2smsRoute: e.target.value as any })}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-sm text-slate-900 text-xs font-bold focus:outline-none focus:border-blue-600"
                >
                  <option value="dlt">DLT Manual / Template</option>
                  <option value="v3">Quick Transactional (v3)</option>
                  <option value="otp">OTP / High Priority Route</option>
                </select>
              </div>
            </div>
          </div>

        </div>

        {/* WhatsApp Options */}
        <div className="bg-white border border-slate-200 p-6 rounded-sm shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-emerald-600" />
              <span>WhatsApp Business API Dual-Broadcast</span>
            </h3>

            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.whatsAppEnabled}
                onChange={(e) => setSettings({ ...settings, whatsAppEnabled: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
            </label>
          </div>

          {settings.whatsAppEnabled && (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-black text-slate-700 uppercase mb-1">
                  WhatsApp Access Token:
                </label>
                <input
                  type="password"
                  value={settings.whatsAppApiKey}
                  onChange={(e) => setSettings({ ...settings, whatsAppApiKey: e.target.value })}
                  placeholder="EAAGxxxxxxxxxxxxxxxxxxxxxxxx"
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-sm text-slate-900 font-mono text-xs focus:outline-none focus:border-emerald-600 focus:bg-white"
                />
              </div>
            </div>
          )}
        </div>

        {/* Save Button */}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-3 bg-[#0f172a] hover:bg-blue-600 text-white font-black text-xs uppercase tracking-widest rounded-sm shadow-md flex items-center gap-2 transition-all disabled:opacity-50"
          >
            <Shield className="w-4 h-4" />
            <span>{saving ? 'Saving Configurations...' : 'Save Gateway Settings'}</span>
          </button>
        </div>

      </form>

      {/* Code Export & Download Section */}
      <div className="bg-gradient-to-br from-slate-900 to-slate-950 text-white p-6 rounded-sm shadow-md space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div>
            <div className="flex items-center gap-2 text-emerald-400 font-mono text-xs uppercase font-bold mb-1">
              <Code2 className="w-4 h-4" />
              <span>Full Standalone Project Download</span>
            </div>
            <h3 className="text-lg font-black uppercase tracking-tight text-white">
              Download Complete Source Code (.ZIP)
            </h3>
            <p className="text-xs text-slate-400 font-medium">
              Export all React frontend, Express server, database models, and API integrations in a single downloadable zip file, ready to run without extra modifications.
            </p>
          </div>

          <button
            type="button"
            onClick={handleDownloadCodeZip}
            disabled={downloadingZip}
            className="px-6 py-3 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-black text-xs uppercase tracking-widest rounded-sm shadow-md flex items-center gap-2 transition-all shrink-0 disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            <span>{downloadingZip ? 'Packaging Source Code...' : 'Download Full Codebase (.ZIP)'}</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs text-slate-300">
          <div className="p-3 bg-slate-900/60 border border-slate-800 rounded-sm">
            <span className="font-bold text-white block mb-0.5">🚀 Ready to Run</span>
            Includes package.json, TypeScript configs, and Vite build configuration.
          </div>
          <div className="p-3 bg-slate-900/60 border border-slate-800 rounded-sm">
            <span className="font-bold text-white block mb-0.5">🔑 Pre-Attached API Keys</span>
            Contains 8 pre-generated secure API keys embedded in configuration.
          </div>
          <div className="p-3 bg-slate-900/60 border border-slate-800 rounded-sm">
            <span className="font-bold text-white block mb-0.5">⚡ Complete Backend & DB</span>
            Full Express TS server and JSON/Firebase persistence engines included.
          </div>
        </div>
      </div>

      {/* Modal for Creating New Key */}
      {showKeyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4">
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-sm shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-900 flex items-center gap-2">
                <Key className="w-4 h-4 text-blue-600" />
                <span>Generate New API Key</span>
              </h3>
              <button
                onClick={() => setShowKeyModal(false)}
                className="text-slate-400 hover:text-slate-700 font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateKey} className="space-y-3">
              <div>
                <label className="block text-[11px] font-black uppercase text-slate-700 mb-1">Key Identifier Name:</label>
                <input
                  type="text"
                  required
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  placeholder="e.g. Automated Exam Cell Dispatcher"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-sm text-xs font-bold text-slate-900 focus:outline-none focus:border-blue-600"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-black uppercase text-slate-700 mb-1">Role Permission:</label>
                  <select
                    value={newKeyRole}
                    onChange={(e) => setNewKeyRole(e.target.value as any)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-sm text-xs font-bold text-slate-900"
                  >
                    <option value="staff">Staff</option>
                    <option value="hod">HOD</option>
                    <option value="admin">Admin</option>
                    <option value="system">System / Service</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-black uppercase text-slate-700 mb-1">Department:</label>
                  <select
                    value={newKeyDept}
                    onChange={(e) => setNewKeyDept(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-sm text-xs font-bold text-slate-900"
                  >
                    <option value="ALL font-bold">ALL Departments</option>
                    <option value="AIML">AIML</option>
                    <option value="AIDS">AIDS</option>
                    <option value="CSE">CSE</option>
                    <option value="ECE">ECE</option>
                    <option value="IT">IT</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-black uppercase text-slate-700 mb-1">Purpose Description:</label>
                <textarea
                  rows={2}
                  value={newKeyDesc}
                  onChange={(e) => setNewKeyDesc(e.target.value)}
                  placeholder="Describe what system or automated script will use this key..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-sm text-xs text-slate-900 focus:outline-none focus:border-blue-600"
                ></textarea>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowKeyModal(false)}
                  className="px-4 py-2 border border-slate-300 rounded-sm text-xs font-bold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-sm text-xs font-black uppercase tracking-wider"
                >
                  Generate Key
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};

