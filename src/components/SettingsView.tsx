import React, { useState, useEffect } from 'react';
import { GatewaySettings } from '../types';
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

  const [testPhone, setTestPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    loadSettings();
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
            Fast2SMS & Carrier Gateway Settings
          </h2>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Configure Fast2SMS API Authorization Keys, DLT Sender ID (VSBEC), and automated result dispatch rules.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="px-3 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-black uppercase tracking-wider rounded-sm flex items-center gap-1.5">
            <Wifi className="w-3.5 h-3.5" />
            <span>Active: {settings.provider}</span>
          </span>
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

        {/* WhatsApp & Auto-Result Options */}
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

      {/* Test Connection Box */}
      <div className="bg-white border border-slate-200 p-6 rounded-sm shadow-sm space-y-4">
        <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider border-b border-slate-200 pb-3 flex items-center gap-2">
          <Wifi className="w-4 h-4 text-blue-600" />
          <span>Test Fast2SMS Gateway Connection</span>
        </h3>

        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={testPhone}
            onChange={(e) => setTestPhone(e.target.value)}
            placeholder="Enter test phone number (e.g. 9876543210)"
            className="flex-1 px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-sm text-slate-900 font-mono text-xs focus:outline-none focus:border-blue-600 focus:bg-white"
          />

          <button
            type="button"
            onClick={handleSendTestSms}
            className="px-5 py-2.5 bg-[#0f172a] hover:bg-blue-600 text-white font-black text-xs uppercase tracking-widest rounded-sm border border-slate-800 flex items-center gap-2 transition-all shrink-0"
          >
            <Send className="w-4 h-4" />
            <span>Send Test SMS</span>
          </button>
        </div>

        {testResult && (
          <div className="p-3 bg-slate-50 rounded-sm border border-slate-200 text-xs text-slate-800 font-mono">
            {testResult}
          </div>
        )}
      </div>

    </div>
  );
};
