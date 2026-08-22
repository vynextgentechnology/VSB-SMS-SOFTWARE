import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { Student, Department, SmsTemplate, MessageType, DeliveryChannel, User } from '../types';
import { api, formatErrorMessage } from '../lib/api';
import {
  Send,
  Users,
  User as UserIcon,
  Building,
  FileCode2,
  CheckCircle2,
  AlertCircle,
  MessageSquare,
  Sparkles,
  Building2,
  Smartphone,
  Eye,
  FileSpreadsheet,
  Upload,
  Key,
  RefreshCw,
  Download,
  Check,
  ShieldCheck,
  Radio,
} from 'lucide-react';

interface SmsSendingModuleProps {
  students: Student[];
  templates: SmsTemplate[];
  departments?: Department[];
  preSelectedStudent?: Student | null;
  currentUser?: User | null;
  onRefresh: () => void;
  onNavigateToReports: () => void;
}

const DEFAULT_DEPT_CODES = ['AIML', 'AIDS', 'CSE', 'CCE', 'ECE', 'EEE', 'MECH', 'CSBS', 'CHEMICAL', 'CIVIL', 'ALL'];

export const SmsSendingModule: React.FC<SmsSendingModuleProps> = ({
  students,
  templates,
  departments,
  preSelectedStudent,
  currentUser,
  onRefresh,
  onNavigateToReports,
}) => {
  const isDeptRestricted = currentUser && (currentUser.role === 'hod' || currentUser.role === 'staff');
  const userDept = currentUser?.department || 'CSE';

  const DEPARTMENTS =
    departments && departments.length > 0
      ? Array.from(new Set([...departments.map((d) => d.code), 'ALL']))
      : DEFAULT_DEPT_CODES;

  // Active Dispatch View Mode: 'standard' | 'excel' | 'keys'
  const [activeDispatchTab, setActiveDispatchTab] = useState<'standard' | 'excel' | 'keys'>('standard');

  // Standard Target mode: 'individual' | 'multiple' | 'department'
  const [targetMode, setTargetMode] = useState<'individual' | 'multiple' | 'department'>('individual');
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [selectedDept, setSelectedDept] = useState<string>(isDeptRestricted ? userDept : 'CSE');

  // Manual single phone input
  const [manualPhone, setManualPhone] = useState('');
  const [manualName, setManualName] = useState('');

  // Standard Message state
  const [messageType, setMessageType] = useState<MessageType>('General Notification');
  const [channel, setChannel] = useState<DeliveryChannel>('SMS');
  const [messageContent, setMessageContent] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');

  // Excel SMS Upload State
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [excelTemplateText, setExcelTemplateText] = useState(
    'Dear Parent, your child {name} scored {marks} marks in recent exams.'
  );
  const [parsedExcelRecords, setParsedExcelRecords] = useState<
    Array<{
      sNo: number;
      studentName: string;
      phoneNumber: string;
      marks: string;
      isValid: boolean;
    }>
  >([]);
  const [excelParseLoading, setExcelParseLoading] = useState(false);
  const [excelSendLoading, setExcelSendLoading] = useState(false);

  // SMS API Key Pool State
  const [keyPoolStatus, setKeyPoolStatus] = useState<{
    totalKeys: number;
    activeKeyIndex: number;
    activeKeyMasked: string;
    keys: Array<{
      id: number;
      keyMasked: string;
      status: string;
      sendCount: number;
      failCount: number;
      lastUsed?: string;
      lastError?: string;
    }>;
  } | null>(null);
  const [keyRotating, setKeyRotating] = useState(false);

  // Execution result state
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{
    sentCount: number;
    failedCount: number;
    totalCount: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    if (preSelectedStudent) {
      setActiveDispatchTab('standard');
      setTargetMode('individual');
      setSelectedStudentId(preSelectedStudent.id);
    }
  }, [preSelectedStudent]);

  useEffect(() => {
    loadKeyPoolStatus();
  }, []);

  const loadKeyPoolStatus = async () => {
    try {
      const res = await api.getSmsKeyPoolStatus();
      setKeyPoolStatus(res);
    } catch (err) {
      console.warn('Could not load SMS API key pool status:', err);
    }
  };

  const handleManualKeyRotate = async () => {
    setKeyRotating(true);
    try {
      const res = await api.rotateSmsApiKey();
      setSuccessMsg(res.message || 'Rotated active SMS API Key successfully!');
      await loadKeyPoolStatus();
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      console.log(err);
      if (err?.message) console.log(err.message);
      if (err?.response?.data) console.log(err.response?.data);
      setError(formatErrorMessage(err));
    } finally {
      setKeyRotating(false);
    }
  };

  const handleSelectTemplate = (templateId: string) => {
    setSelectedTemplateId(templateId);
    const found = templates.find((t) => t.id === templateId);
    if (found) {
      setMessageContent(found.templateText);
      setMessageType(found.type);
    }
  };

  const insertVariable = (variable: string) => {
    setMessageContent((prev) => prev + ` ${variable} `);
  };

  const insertExcelVariable = (variable: string) => {
    setExcelTemplateText((prev) => prev + ` ${variable} `);
  };

  const availableStudents = students.filter(
    (s) => !isDeptRestricted || s.department.toUpperCase() === userDept.toUpperCase()
  );

  const getTargetRecipients = () => {
    if (targetMode === 'individual') {
      if (selectedStudentId) {
        const std = availableStudents.find((s) => s.id === selectedStudentId);
        if (std) return [std];
      } else if (manualPhone.trim()) {
        return [
          {
            id: 'manual-1',
            name: manualName.trim() || 'Parent/Student',
            registerNumber: 'N/A',
            department: isDeptRestricted ? userDept : 'General',
            phoneNumber: manualPhone.trim(),
            createdAt: '',
          },
        ];
      }
      return [];
    } else if (targetMode === 'multiple') {
      return availableStudents.filter((s) => selectedStudentIds.includes(s.id));
    } else if (targetMode === 'department') {
      const activeDept = isDeptRestricted ? userDept : selectedDept;
      if (activeDept === 'ALL') return availableStudents;
      return availableStudents.filter((s) => s.department.toUpperCase() === activeDept.toUpperCase());
    }
    return [];
  };

  const targetRecipients = getTargetRecipients();

  const handleSendSms = async () => {
    setError(null);
    setSendResult(null);

    if (targetRecipients.length === 0) {
      setError('No valid recipients selected. Please choose a student or enter mobile number.');
      return;
    }

    if (!messageContent.trim()) {
      setError('Please enter message content or choose a template.');
      return;
    }

    setSending(true);

    try {
      const payload = {
        recipients: targetRecipients.map((r) => ({
          name: r.name,
          registerNumber: r.registerNumber,
          phoneNumber: r.phoneNumber,
          department: r.department,
        })),
        messageType,
        messageContent,
        channel,
      };

      const res = await api.sendSms(payload);
      setSendResult({
        sentCount: res.sentCount,
        failedCount: res.failedCount,
        totalCount: res.totalCount,
      });

      await loadKeyPoolStatus();
      onRefresh();
    } catch (err: any) {
      console.log(err);
      if (err?.message) console.log(err.message);
      if (err?.response?.data) console.log(err.response?.data);
      setError(formatErrorMessage(err));
    } finally {
      setSending(false);
    }
  };

  // Excel File Upload & Parse
  const handleExcelFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setExcelFile(file);
    setExcelParseLoading(true);

    try {
      const parsed = await api.parseSmsExcel(file);
      setParsedExcelRecords(parsed.records);
    } catch (err: any) {
      console.log(err);
      if (err?.message) console.log(err.message);
      if (err?.response?.data) console.log(err.response?.data);
      setError(formatErrorMessage(err));
      setParsedExcelRecords([]);
    } finally {
      setExcelParseLoading(false);
      e.target.value = '';
    }
  };

  const handleSendSmsFromExcel = async () => {
    if (!excelFile) {
      setError('Please select an Excel file (.xlsx) first.');
      return;
    }

    if (!excelTemplateText.trim()) {
      setError('Please enter message template content.');
      return;
    }

    setError(null);
    setExcelSendLoading(true);

    try {
      const res = await api.sendSmsFromExcel(excelFile, excelTemplateText, 'Exam Result SMS');
      setSendResult({
        sentCount: res.sentCount,
        failedCount: res.failedCount,
        totalCount: res.totalDispatched,
      });
      setSuccessMsg(res.message);
      await loadKeyPoolStatus();
      onRefresh();
      setTimeout(() => setSuccessMsg(null), 5000);
    } catch (err: any) {
      console.log(err);
      if (err?.message) console.log(err.message);
      if (err?.response?.data) console.log(err.response?.data);
      setError(formatErrorMessage(err));
    } finally {
      setExcelSendLoading(false);
    }
  };

  const downloadSampleExcel = () => {
    const sampleData = [
      {
        'Phone Number': '9876543210',
        'Student Name': 'S. Ananya',
        'Marks': '88',
      },
      {
        'Phone Number': '9123456789',
        'Student Name': 'K. Vignesh',
        'Marks': '92',
      },
      {
        'Phone Number': '9988776655',
        'Student Name': 'M. Karthik',
        'Marks': '76',
      },
    ];

    const ws = XLSX.utils.json_to_sheet(sampleData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'SMS_Recipients');
    XLSX.writeFile(wb, 'Staff_SMS_Upload_Template.xlsx');
  };

  const toggleSelectMultipleStudent = (id: string) => {
    if (selectedStudentIds.includes(id)) {
      setSelectedStudentIds(selectedStudentIds.filter((s) => s !== id));
    } else {
      setSelectedStudentIds([...selectedStudentIds, id]);
    }
  };

  // Preview interpolation
  const sampleRecipient =
    activeDispatchTab === 'excel' && parsedExcelRecords.length > 0
      ? {
          name: parsedExcelRecords[0].studentName,
          registerNumber: 'Excel Upload',
          department: 'Exam Marks',
          phoneNumber: parsedExcelRecords[0].phoneNumber,
          marks: parsedExcelRecords[0].marks,
        }
      : targetRecipients[0] || {
          name: 'Student Name',
          registerNumber: 'REG123456',
          department: 'CSE',
          phoneNumber: '+919876543210',
          marks: '92%',
        };

  const activeTemplateText = activeDispatchTab === 'excel' ? excelTemplateText : messageContent;

  const previewMessage = activeTemplateText
    .replace(/\{name\}/g, sampleRecipient.name)
    .replace(/\{regNo\}/g, sampleRecipient.registerNumber)
    .replace(/\{department\}/g, sampleRecipient.department)
    .replace(/\{date\}/g, new Date().toLocaleDateString())
    .replace(/\{status\}/g, 'PASS')
    .replace(/\{marks\}/g, sampleRecipient.marks || '92%')
    .replace(/\{phone\}/g, sampleRecipient.phoneNumber);

  return (
    <div id="sms-sending-module-view" className="space-y-6 animate-in fade-in duration-200">
      
      {/* Header Banner */}
      <div className="bg-white border border-slate-200 p-4 sm:p-6 rounded-sm shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2 text-blue-600 font-black text-[11px] uppercase tracking-widest mb-1">
            <Building2 className="w-4 h-4 shrink-0" />
            <span>VSB ENGINEERING COLLEGE • STAFF MOBILE SMS DISPATCH</span>
          </div>
          <h2 className="text-lg sm:text-2xl font-black text-slate-900 uppercase tracking-tight">
            Mobile Staff SMS Dispatcher & Gateway
          </h2>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Send single SMS, bulk group SMS, or upload Excel (.xlsx) files with auto-rotating SMS API keys.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto shrink-0">
          <button
            onClick={onNavigateToReports}
            className="px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-sm border border-slate-300 flex items-center gap-2 transition-all uppercase tracking-wider min-h-[44px]"
          >
            <MessageSquare className="w-4 h-4 text-blue-600" />
            <span>SMS Delivery Logs</span>
          </button>
        </div>
      </div>

      {/* Main Mode Selector Bar (Mobile Friendly Tabs) */}
      <div className="bg-[#0f172a] text-white p-2 rounded-sm shadow-md flex flex-wrap items-center justify-between gap-2 text-xs font-bold uppercase tracking-wider">
        <div className="flex flex-wrap items-center gap-1.5 w-full sm:w-auto">
          <button
            type="button"
            onClick={() => setActiveDispatchTab('standard')}
            className={`px-4 py-2.5 rounded-sm flex items-center gap-2 transition-all min-h-[44px] text-xs ${
              activeDispatchTab === 'standard'
                ? 'bg-blue-600 text-white shadow font-black'
                : 'bg-slate-800/80 text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <Smartphone className="w-4 h-4" />
            <span>Single / Directory SMS</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveDispatchTab('excel')}
            className={`px-4 py-2.5 rounded-sm flex items-center gap-2 transition-all min-h-[44px] text-xs ${
              activeDispatchTab === 'excel'
                ? 'bg-emerald-600 text-white shadow font-black'
                : 'bg-slate-800/80 text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
            <span>Excel (.xlsx) SMS Upload</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveDispatchTab('keys')}
            className={`px-4 py-2.5 rounded-sm flex items-center gap-2 transition-all min-h-[44px] text-xs ${
              activeDispatchTab === 'keys'
                ? 'bg-amber-600 text-white shadow font-black'
                : 'bg-slate-800/80 text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <Key className="w-4 h-4 text-amber-300" />
            <span>API Key Rotation ({keyPoolStatus?.totalKeys || 3} Keys)</span>
          </button>
        </div>

        {keyPoolStatus && (
          <div className="hidden lg:flex items-center space-x-2 text-[11px] text-slate-300 px-2 font-mono">
            <Radio className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
            <span>Active Key: <strong className="text-amber-400">{keyPoolStatus.activeKeyMasked}</strong></span>
          </div>
        )}
      </div>

      {/* Global Banners */}
      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold rounded-sm flex items-start gap-2 animate-in fade-in">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
          <span>{typeof error === 'string' ? error : formatErrorMessage(error)}</span>
        </div>
      )}

      {successMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold rounded-sm flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Mode 1: Standard / Directory SMS Dispatch */}
      {activeDispatchTab === 'standard' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            
            {/* Step 1: Target Recipient Selector */}
            <div className="bg-white border border-slate-200 p-4 sm:p-5 rounded-sm shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-200 pb-3 gap-2">
                <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                  <Users className="w-4 h-4 text-blue-600" />
                  <span>1. Select Target Recipient ({targetRecipients.length} Selected)</span>
                </h3>

                <div className="flex bg-slate-100 p-1 rounded-sm border border-slate-200 text-xs font-bold uppercase tracking-wider">
                  <button
                    type="button"
                    onClick={() => setTargetMode('individual')}
                    className={`px-3 py-1.5 font-black rounded-sm transition-all min-h-[36px] flex items-center gap-1.5 ${
                      targetMode === 'individual' ? 'bg-[#0f172a] text-white shadow' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <UserIcon className="w-3.5 h-3.5" />
                    <span>Single SMS</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setTargetMode('multiple')}
                    className={`px-3 py-1.5 font-black rounded-sm transition-all min-h-[36px] flex items-center gap-1.5 ${
                      targetMode === 'multiple' ? 'bg-[#0f172a] text-white shadow' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Users className="w-3.5 h-3.5" />
                    <span>Bulk List</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setTargetMode('department')}
                    className={`px-3 py-1.5 font-black rounded-sm transition-all min-h-[36px] flex items-center gap-1.5 ${
                      targetMode === 'department' ? 'bg-[#0f172a] text-white shadow' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Building className="w-3.5 h-3.5" />
                    <span>Class / Dept</span>
                  </button>
                </div>
              </div>

              {/* Single SMS Selector */}
              {targetMode === 'individual' && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-black text-slate-700 uppercase tracking-wider mb-1">
                      Choose Registered Student from Directory:
                    </label>
                    <select
                      value={selectedStudentId}
                      onChange={(e) => setSelectedStudentId(e.target.value)}
                      className="w-full px-3.5 py-3 bg-slate-50 border border-slate-300 rounded-sm text-slate-900 text-xs font-bold focus:outline-none focus:border-blue-600 min-h-[44px]"
                    >
                      <option value="">-- Or enter manual phone number below --</option>
                      {students.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.registerNumber}) - {s.department} [{s.phoneNumber}]
                        </option>
                      ))}
                    </select>
                  </div>

                  {!selectedStudentId && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Name (Optional)</label>
                        <input
                          type="text"
                          value={manualName}
                          onChange={(e) => setManualName(e.target.value)}
                          placeholder="Parent / Student Name"
                          className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-sm text-slate-900 text-xs font-bold focus:outline-none focus:border-blue-600 min-h-[44px]"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Mobile Phone Number *</label>
                        <input
                          type="text"
                          value={manualPhone}
                          onChange={(e) => setManualPhone(e.target.value)}
                          placeholder="e.g. 9876543210"
                          className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-sm text-slate-900 font-mono text-xs font-bold focus:outline-none focus:border-blue-600 min-h-[44px]"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Bulk Directory Checkboxes */}
              {targetMode === 'multiple' && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-600 font-bold">
                    <span>Select students to receive SMS:</span>
                    <div className="space-x-3">
                      <button
                        type="button"
                        onClick={() => setSelectedStudentIds(students.map((s) => s.id))}
                        className="text-blue-600 hover:underline uppercase tracking-wider"
                      >
                        Select All
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedStudentIds([])}
                        className="text-slate-500 hover:underline uppercase tracking-wider"
                      >
                        Clear All
                      </button>
                    </div>
                  </div>

                  <div className="max-h-48 overflow-y-auto divide-y divide-slate-100 bg-slate-50 p-2 rounded-sm border border-slate-200">
                    {students.map((s) => {
                      const isChecked = selectedStudentIds.includes(s.id);
                      return (
                        <label
                          key={s.id}
                          className="flex items-center justify-between p-2 hover:bg-slate-100 rounded-xs cursor-pointer text-xs"
                        >
                          <div className="flex items-center space-x-2.5">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => toggleSelectMultipleStudent(s.id)}
                              className="rounded-xs border-slate-300 text-blue-600 focus:ring-0 w-4 h-4"
                            />
                            <div>
                              <span className="font-black text-slate-900">{s.name}</span>
                              <span className="text-slate-500 ml-2 font-mono font-bold">({s.registerNumber})</span>
                            </div>
                          </div>
                          <span className="px-2 py-0.5 bg-slate-900 text-white rounded-xs text-[10px] font-black uppercase tracking-wider">
                            {s.department}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Department Selector */}
              {targetMode === 'department' && (
                <div className="space-y-3">
                  <label className="block text-xs font-black text-slate-700 uppercase tracking-wider">Select Class / Department:</label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {DEPARTMENTS.map((dept) => (
                      <button
                        key={dept}
                        type="button"
                        onClick={() => setSelectedDept(dept)}
                        className={`py-2.5 px-3 text-xs font-black rounded-sm border transition-all uppercase tracking-wider min-h-[44px] ${
                          selectedDept === dept
                            ? 'bg-blue-600 text-white border-blue-600 shadow'
                            : 'bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100'
                        }`}
                      >
                        {dept}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Step 2: Message Content */}
            <div className="bg-white border border-slate-200 p-4 sm:p-5 rounded-sm shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-200 pb-3 gap-2">
                <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-blue-600" />
                  <span>2. Message Configuration & Dynamic Text</span>
                </h3>

                <select
                  value={channel}
                  onChange={(e) => setChannel(e.target.value as DeliveryChannel)}
                  className="bg-slate-100 border border-slate-300 text-blue-900 font-black px-2.5 py-1.5 rounded-sm text-xs focus:outline-none min-h-[36px]"
                >
                  <option value="SMS">Fast2SMS Multi-Key Gateway</option>
                  <option value="WhatsApp">WhatsApp API</option>
                  <option value="Both">Both (SMS + WhatsApp)</option>
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-black text-slate-700 uppercase mb-1">Message Type:</label>
                  <select
                    value={messageType}
                    onChange={(e) => setMessageType(e.target.value as MessageType)}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-sm text-slate-900 text-xs font-bold focus:outline-none focus:border-blue-600 min-h-[44px]"
                  >
                    <option value="General Notification">General Notification</option>
                    <option value="Attendance Alert">Attendance Alert</option>
                    <option value="Exam Result">Exam Result</option>
                    <option value="Custom">Custom Message</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-black text-slate-700 uppercase mb-1">Load Template:</label>
                  <select
                    value={selectedTemplateId}
                    onChange={(e) => handleSelectTemplate(e.target.value)}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-sm text-blue-800 text-xs font-bold focus:outline-none focus:border-blue-600 min-h-[44px]"
                  >
                    <option value="">-- Choose Quick Template --</option>
                    {templates.map((tpl) => (
                      <option key={tpl.id} value={tpl.id}>
                        {tpl.title} ({tpl.type})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Dynamic Variables */}
              <div>
                <span className="text-xs font-black text-slate-700 uppercase block mb-1">Insert Placeholders:</span>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { label: '{name}', desc: 'Student Name' },
                    { label: '{regNo}', desc: 'Register No' },
                    { label: '{department}', desc: 'Department' },
                    { label: '{marks}', desc: 'Exam Marks' },
                    { label: '{date}', desc: 'Today Date' },
                  ].map((v) => (
                    <button
                      key={v.label}
                      type="button"
                      onClick={() => insertVariable(v.label)}
                      className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-blue-900 border border-slate-300 text-[11px] font-mono font-black rounded-sm transition-all min-h-[36px]"
                    >
                      + {v.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Text Area */}
              <div>
                <textarea
                  value={messageContent}
                  onChange={(e) => setMessageContent(e.target.value)}
                  rows={4}
                  placeholder="Type official SMS content... e.g. Dear Parent, your child {name} has scored {marks} in mid-term exams."
                  className="w-full p-3.5 bg-slate-50 border border-slate-300 rounded-sm text-slate-900 text-xs font-medium leading-relaxed focus:outline-none focus:border-blue-600 focus:bg-white"
                />

                <div className="flex items-center justify-between text-[11px] text-slate-500 font-bold mt-1.5">
                  <span>Characters: {messageContent.length}</span>
                  <span>Recipients: {targetRecipients.length}</span>
                </div>
              </div>

              {/* Results */}
              {sendResult && (
                <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs rounded-sm space-y-2">
                  <div className="flex items-center justify-between font-black uppercase tracking-wider">
                    <span className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span>SMS Batch Dispatched!</span>
                    </span>
                    <button onClick={onNavigateToReports} className="text-blue-700 hover:underline font-bold text-[11px]">
                      View Reports →
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center text-[11px]">
                    <div className="bg-white p-2 rounded-sm border border-emerald-200">
                      <span className="text-slate-500 font-bold uppercase">Total</span>
                      <div className="font-black text-slate-900 text-sm">{sendResult.totalCount}</div>
                    </div>
                    <div className="bg-white p-2 rounded-sm border border-emerald-200">
                      <span className="text-emerald-700 font-bold uppercase">Delivered</span>
                      <div className="font-black text-emerald-700 text-sm">{sendResult.sentCount}</div>
                    </div>
                    <div className="bg-white p-2 rounded-sm border border-emerald-200">
                      <span className="text-rose-700 font-bold uppercase">Failed</span>
                      <div className="font-black text-rose-700 text-sm">{sendResult.failedCount}</div>
                    </div>
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={handleSendSms}
                disabled={sending || targetRecipients.length === 0}
                className="w-full py-3.5 px-6 bg-[#0f172a] hover:bg-blue-600 text-white font-black rounded-sm shadow-md transition-all flex items-center justify-center space-x-2 text-xs uppercase tracking-widest disabled:opacity-50 min-h-[48px]"
              >
                {sending ? (
                  <span>Dispatching SMS with Auto Key Rotation...</span>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span>Dispatch SMS Now ({targetRecipients.length} Recipients)</span>
                  </>
                )}
              </button>

            </div>
          </div>

          {/* Right Column: Live Mobile Handset Preview */}
          <div className="space-y-4">
            <div className="bg-white border border-slate-200 p-5 rounded-sm shadow-sm sticky top-20">
              <div className="flex items-center space-x-2 text-xs font-black text-slate-900 uppercase tracking-widest mb-4">
                <Eye className="w-4 h-4 text-blue-600" />
                <span>Live Mobile Screen Preview</span>
              </div>

              <div className="w-full max-w-[280px] mx-auto bg-slate-900 rounded-[32px] p-3 border-4 border-slate-800 shadow-2xl relative">
                <div className="w-20 h-3 bg-slate-800 rounded-full mx-auto mb-3" />
                <div className="bg-slate-800 p-2.5 rounded-t-xl border-b border-slate-700 text-center text-xs font-black text-white flex items-center justify-between">
                  <span className="text-[10px] text-blue-400 font-mono font-bold">VSBEC SMS</span>
                  <span className="text-[9px] text-slate-400 font-bold">OFFICIAL</span>
                </div>

                <div className="bg-slate-950 p-3 min-h-[220px] rounded-b-xl flex flex-col justify-end space-y-2">
                  <div className="bg-blue-600 text-white p-3 rounded-2xl rounded-bl-xs text-[11px] leading-relaxed shadow-md font-medium">
                    <p className="whitespace-pre-wrap font-sans">
                      {previewMessage || 'Your interpolated message preview will appear here in real time...'}
                    </p>
                    <div className="text-[9px] text-blue-200 text-right mt-1 font-mono font-bold">
                      {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • Delivered
                    </div>
                  </div>

                  <div className="text-[10px] text-slate-400 text-center font-mono font-bold pt-2 uppercase">
                    Header: VSBEC VY NEXTGEN
                  </div>
                </div>
              </div>

              <div className="mt-4 p-3 bg-slate-50 rounded-sm border border-slate-200 text-[11px] text-slate-600 space-y-1">
                <div className="font-black text-slate-900 uppercase tracking-wider">Sample Recipient:</div>
                <div>Name: <strong className="text-slate-900">{sampleRecipient.name}</strong></div>
                <div>Phone: <strong className="text-blue-700 font-mono">{sampleRecipient.phoneNumber}</strong></div>
                <div>Marks: <strong className="text-slate-900">{sampleRecipient.marks || '92'}</strong></div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Mode 2: Excel (.xlsx) SMS Upload & Dispatch */}
      {activeDispatchTab === 'excel' && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 p-5 rounded-sm shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-200 pb-3 gap-3">
              <div>
                <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                  <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
                  <span>Excel Spreadsheet SMS Upload & Dispatch</span>
                </h3>
                <p className="text-xs text-slate-500 font-medium mt-0.5">
                  Upload .xlsx spreadsheet containing Phone Number, Student Name, and Marks for instant bulk SMS delivery.
                </p>
              </div>

              <button
                type="button"
                onClick={downloadSampleExcel}
                className="px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-sm border border-slate-300 flex items-center gap-1.5 transition-all uppercase tracking-wider min-h-[44px]"
              >
                <Download className="w-4 h-4 text-emerald-600" />
                <span>Sample Excel Template</span>
              </button>
            </div>

            {/* File Upload Control */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
              <div className="md:col-span-2">
                <label className="block text-xs font-black text-slate-700 uppercase mb-1">
                  Select Microsoft Excel Spreadsheet (.xlsx or .xls):
                </label>
                <div className="flex items-center space-x-2">
                  <label className="flex-1 cursor-pointer px-4 py-3 bg-slate-50 border-2 border-dashed border-slate-300 hover:border-emerald-600 rounded-sm text-xs font-bold flex items-center justify-center gap-2 transition-all min-h-[48px]">
                    <Upload className="w-4 h-4 text-emerald-600" />
                    <span className="text-slate-700">
                      {excelFile ? `Selected: ${excelFile.name}` : 'Click to Upload .xlsx File'}
                    </span>
                    <input type="file" accept=".xlsx, .xls" onChange={handleExcelFileSelect} className="hidden" />
                  </label>
                </div>
              </div>

              <div>
                <span className="text-[10px] text-slate-500 font-bold uppercase block mb-1">Supported Excel Headers:</span>
                <div className="flex flex-wrap gap-1 text-[11px] font-mono font-bold">
                  <span className="bg-slate-100 px-2 py-1 rounded border">Phone Number</span>
                  <span className="bg-slate-100 px-2 py-1 rounded border">Student Name</span>
                  <span className="bg-slate-100 px-2 py-1 rounded border">Marks</span>
                </div>
              </div>
            </div>

            {/* Excel Preview Table */}
            {excelParseLoading && (
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-sm text-center text-xs font-bold text-slate-600">
                Parsing Excel worksheet rows...
              </div>
            )}

            {parsedExcelRecords.length > 0 && (
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between text-xs font-black uppercase text-slate-900 border-b pb-2">
                  <span>Excel Preview ({parsedExcelRecords.length} Records Parsed)</span>
                  <span className="text-emerald-700">
                    {parsedExcelRecords.filter((r) => r.isValid).length} Valid Phone Numbers
                  </span>
                </div>

                <div className="max-h-60 overflow-y-auto border border-slate-200 rounded-sm">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-[#0f172a] text-amber-400 font-black uppercase text-[10px] sticky top-0">
                        <th className="p-2 border border-slate-800 text-center">#</th>
                        <th className="p-2 border border-slate-800">Student Name</th>
                        <th className="p-2 border border-slate-800">Phone Number</th>
                        <th className="p-2 border border-slate-800 text-center">Marks</th>
                        <th className="p-2 border border-slate-800 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 text-slate-800 font-medium">
                      {parsedExcelRecords.map((r) => (
                        <tr key={r.sNo} className={r.isValid ? 'hover:bg-slate-50' : 'bg-rose-50'}>
                          <td className="p-2 border text-center font-mono font-bold">{r.sNo}</td>
                          <td className="p-2 border font-bold">{r.studentName}</td>
                          <td className="p-2 border font-mono font-bold text-blue-700">{r.phoneNumber}</td>
                          <td className="p-2 border text-center font-bold">{r.marks}</td>
                          <td className="p-2 border text-center">
                            {r.isValid ? (
                              <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded font-bold text-[10px]">Valid</span>
                            ) : (
                              <span className="px-2 py-0.5 bg-rose-100 text-rose-800 rounded font-bold text-[10px]">Invalid Phone</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Dynamic Template Configuration */}
            <div className="space-y-3 pt-3 border-t border-slate-200">
              <div className="flex items-center justify-between">
                <label className="text-xs font-black text-slate-900 uppercase">
                  Dynamic SMS Template for Excel Data:
                </label>
                <div className="flex gap-1.5">
                  {['{name}', '{marks}', '{phone}', '{date}'].map((varTag) => (
                    <button
                      key={varTag}
                      type="button"
                      onClick={() => insertExcelVariable(varTag)}
                      className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-blue-900 text-[10px] font-mono font-black rounded border"
                    >
                      + {varTag}
                    </button>
                  ))}
                </div>
              </div>

              <textarea
                value={excelTemplateText}
                onChange={(e) => setExcelTemplateText(e.target.value)}
                rows={3}
                className="w-full p-3 bg-slate-50 border border-slate-300 rounded-sm text-slate-900 text-xs font-medium focus:outline-none focus:border-emerald-600"
                placeholder="Dear Parent, your child {name} scored {marks} marks."
              />

              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-sm text-xs font-medium text-emerald-900">
                <span className="font-black uppercase block mb-1">Live Sample Output for First Record:</span>
                <p className="font-sans italic">{previewMessage}</p>
              </div>

              <button
                type="button"
                onClick={handleSendSmsFromExcel}
                disabled={excelSendLoading || parsedExcelRecords.length === 0}
                className="w-full py-3.5 px-6 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-sm shadow-md transition-all flex items-center justify-center space-x-2 text-xs uppercase tracking-widest disabled:opacity-50 min-h-[48px]"
              >
                {excelSendLoading ? (
                  <span>Sending Bulk SMS from Excel File...</span>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span>Send SMS to All {parsedExcelRecords.filter((r) => r.isValid).length} Excel Records</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mode 3: API Key Rotation Pool Inspector */}
      {activeDispatchTab === 'keys' && (
        <div className="bg-white border border-slate-200 p-5 rounded-sm shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-200 pb-3 gap-3">
            <div>
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-amber-600" />
                <span>SMS API Key Pool & Automatic Failover Rotation</span>
              </h3>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                Multi-key failover system. Automatically rotates to the next API key when rate limits or balance errors occur.
              </p>
            </div>

            <button
              type="button"
              onClick={handleManualKeyRotate}
              disabled={keyRotating}
              className="px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-black rounded-sm shadow flex items-center gap-2 transition-all uppercase tracking-wider min-h-[44px]"
            >
              <RefreshCw className={`w-4 h-4 ${keyRotating ? 'animate-spin' : ''}`} />
              <span>Rotate Active Key Now</span>
            </button>
          </div>

          {/* Active Key Stats Summary */}
          {keyPoolStatus && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-sm">
                <span className="text-slate-500 font-bold uppercase text-[10px] block">Total Configured Keys</span>
                <strong className="text-slate-900 font-black text-xl">{keyPoolStatus.totalKeys} API Keys</strong>
              </div>

              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-sm">
                <span className="text-emerald-800 font-bold uppercase text-[10px] block">Current Active Key Index</span>
                <strong className="text-emerald-900 font-black text-xl font-mono">
                  Key #{keyPoolStatus.activeKeyIndex + 1} ({keyPoolStatus.activeKeyMasked})
                </strong>
              </div>

              <div className="p-4 bg-blue-50 border border-blue-200 rounded-sm">
                <span className="text-blue-800 font-bold uppercase text-[10px] block">Rotation Mode</span>
                <strong className="text-blue-900 font-black text-xl">Auto Round-Robin & Fallback</strong>
              </div>
            </div>
          )}

          {/* Key Pool Table */}
          {keyPoolStatus && keyPoolStatus.keys.length > 0 && (
            <div className="space-y-3">
              <span className="text-xs font-black uppercase text-slate-900 block">Configured API Key Pool Status:</span>
              <div className="overflow-x-auto border border-slate-200 rounded-sm">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-[#0f172a] text-amber-400 font-black uppercase text-[10px]">
                      <th className="p-2.5 border border-slate-800 text-center">Slot #</th>
                      <th className="p-2.5 border border-slate-800">Key Mask</th>
                      <th className="p-2.5 border border-slate-800 text-center">Health Status</th>
                      <th className="p-2.5 border border-slate-800 text-center">Sent Count</th>
                      <th className="p-2.5 border border-slate-800 text-center">Fail Count</th>
                      <th className="p-2.5 border border-slate-800">Last Error / Note</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-slate-800 font-medium">
                    {keyPoolStatus.keys.map((k, idx) => {
                      const isActive = idx === keyPoolStatus.activeKeyIndex;
                      return (
                        <tr key={k.id} className={isActive ? 'bg-amber-50/80 font-bold' : 'hover:bg-slate-50'}>
                          <td className="p-2.5 border text-center font-mono font-bold">
                            #{k.id} {isActive && <span className="ml-1 text-amber-600 font-black">(Active)</span>}
                          </td>
                          <td className="p-2.5 border font-mono font-black text-slate-900">{k.keyMasked}</td>
                          <td className="p-2.5 border text-center">
                            {k.status === 'exhausted' ? (
                              <span className="px-2 py-0.5 bg-rose-100 text-rose-800 rounded font-bold text-[10px]">Limit / Exhausted</span>
                            ) : (
                              <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded font-bold text-[10px]">Active</span>
                            )}
                          </td>
                          <td className="p-2.5 border text-center font-mono font-bold text-emerald-700">{k.sendCount}</td>
                          <td className="p-2.5 border text-center font-mono font-bold text-rose-700">{k.failCount}</td>
                          <td className="p-2.5 border text-[11px] text-slate-500 font-mono">
                            {k.lastError || 'Operating normally'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

    </div>
  );
};
