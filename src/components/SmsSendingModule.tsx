import React, { useState, useEffect } from 'react';
import { Student, Department, SmsTemplate, MessageType, DeliveryChannel, User } from '../types';
import { api } from '../lib/api';
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

  const DEPARTMENTS = departments && departments.length > 0 ? Array.from(new Set([...departments.map((d) => d.code), 'ALL'])) : DEFAULT_DEPT_CODES;
  // Target mode: 'individual' | 'multiple' | 'department'
  const [targetMode, setTargetMode] = useState<'individual' | 'multiple' | 'department'>('individual');
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [selectedDept, setSelectedDept] = useState<string>(isDeptRestricted ? userDept : 'CSE');

  // Manual fallback recipient
  const [manualPhone, setManualPhone] = useState('');
  const [manualName, setManualName] = useState('');

  // Message details
  const [messageType, setMessageType] = useState<MessageType>('General Notification');
  const [channel, setChannel] = useState<DeliveryChannel>('SMS');
  const [messageContent, setMessageContent] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');

  // Execution state
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{
    sentCount: number;
    failedCount: number;
    totalCount: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (preSelectedStudent) {
      setTargetMode('individual');
      setSelectedStudentId(preSelectedStudent.id);
    }
  }, [preSelectedStudent]);

  // Handle template selection
  const handleSelectTemplate = (templateId: string) => {
    setSelectedTemplateId(templateId);
    const found = templates.find((t) => t.id === templateId);
    if (found) {
      setMessageContent(found.templateText);
      setMessageType(found.type);
    }
  };

  // Insert variable into message content
  const insertVariable = (variable: string) => {
    setMessageContent((prev) => prev + ` ${variable} `);
  };

  const availableStudents = students.filter(
    (s) => !isDeptRestricted || s.department.toUpperCase() === userDept.toUpperCase()
  );

  // Calculate target recipients
  const getTargetRecipients = () => {
    if (targetMode === 'individual') {
      if (selectedStudentId) {
        const std = availableStudents.find((s) => s.id === selectedStudentId);
        if (std) return [std];
      } else if (manualPhone.trim()) {
        return [
          {
            id: 'manual-1',
            name: manualName.trim() || 'Valued Parent/Student',
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
      setError('No valid recipients selected. Please add or select students.');
      return;
    }

    if (!messageContent.trim()) {
      setError('Please enter message content or select a template.');
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

      onRefresh();
    } catch (err: any) {
      setError(err.message || 'Failed to dispatch SMS batch');
    } finally {
      setSending(false);
    }
  };

  const toggleSelectMultipleStudent = (id: string) => {
    if (selectedStudentIds.includes(id)) {
      setSelectedStudentIds(selectedStudentIds.filter((s) => s !== id));
    } else {
      setSelectedStudentIds([...selectedStudentIds, id]);
    }
  };

  // Live preview interpolation with sample recipient
  const sampleRecipient = targetRecipients[0] || {
    name: 'Anish Kumar',
    registerNumber: '921321104001',
    department: 'CSE',
    phoneNumber: '+919876543210',
  };

  const previewMessage = messageContent
    .replace(/\{name\}/g, sampleRecipient.name)
    .replace(/\{regNo\}/g, sampleRecipient.registerNumber)
    .replace(/\{department\}/g, sampleRecipient.department)
    .replace(/\{date\}/g, new Date().toLocaleDateString())
    .replace(/\{status\}/g, 'PASS')
    .replace(/\{marks\}/g, '92%');

  return (
    <div id="sms-sending-module-view" className="space-y-6 animate-in fade-in duration-200">
      
      {/* Header Banner */}
      <div className="bg-white border border-slate-200 p-6 rounded-sm shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2 text-blue-600 font-black text-xs uppercase tracking-widest mb-1">
            <Building2 className="w-4 h-4" />
            <span>VSB ENGINEERING COLLEGE • VY NEXTGEN TECHNOLOGY</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 uppercase tracking-tight">SMS Broadcast & Dispatch Engine</h2>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Send targeted SMS notifications to individual students, selected groups, or entire college departments.
          </p>
        </div>

        <button
          onClick={onNavigateToReports}
          className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-sm border border-slate-300 flex items-center gap-2 transition-all uppercase tracking-wider self-start sm:self-auto shrink-0"
        >
          <MessageSquare className="w-4 h-4 text-blue-600" />
          <span>View SMS Delivery Reports</span>
        </button>
      </div>

      {/* Main Grid Layout: Controls + Live Phone Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column: Recipient Selection & Message Composer (2 cols) */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Step 1: Select Target Recipients */}
          <div className="bg-white border border-slate-200 p-5 rounded-sm shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-200 pb-3 gap-2">
              <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                <Users className="w-4 h-4 text-blue-600" />
                <span>1. Select Target Recipients ({targetRecipients.length} Selected)</span>
              </h3>

              {/* Mode Tabs */}
              <div className="flex bg-slate-100 p-1 rounded-sm border border-slate-200 text-xs font-bold uppercase tracking-wider">
                <button
                  type="button"
                  onClick={() => setTargetMode('individual')}
                  className={`px-3 py-1.5 font-black rounded-sm transition-all flex items-center gap-1.5 ${
                    targetMode === 'individual'
                      ? 'bg-[#0f172a] text-white shadow'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <UserIcon className="w-3.5 h-3.5" />
                  <span>Individual</span>
                </button>
                <button
                  type="button"
                  onClick={() => setTargetMode('multiple')}
                  className={`px-3 py-1.5 font-black rounded-sm transition-all flex items-center gap-1.5 ${
                    targetMode === 'multiple'
                      ? 'bg-[#0f172a] text-white shadow'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>Multiple</span>
                </button>
                <button
                  type="button"
                  onClick={() => setTargetMode('department')}
                  className={`px-3 py-1.5 font-black rounded-sm transition-all flex items-center gap-1.5 ${
                    targetMode === 'department'
                      ? 'bg-[#0f172a] text-white shadow'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Building className="w-3.5 h-3.5" />
                  <span>Class / Dept</span>
                </button>
              </div>
            </div>

            {/* Mode 1: Individual Student */}
            {targetMode === 'individual' && (
              <div className="space-y-3">
                {students.length > 0 ? (
                  <div>
                    <label className="block text-xs font-black text-slate-700 uppercase tracking-wider mb-1">
                      Select Registered Student:
                    </label>
                    <select
                      value={selectedStudentId}
                      onChange={(e) => setSelectedStudentId(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-sm text-slate-900 text-xs font-bold focus:outline-none focus:border-blue-600 focus:bg-white"
                    >
                      <option value="">-- Choose Student from Directory --</option>
                      {students.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.registerNumber}) - {s.department} [{s.phoneNumber}]
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <p className="text-xs text-amber-800 bg-amber-50 p-3 rounded-sm border border-amber-200 font-bold">
                    No students registered in database. Enter manual phone number below:
                  </p>
                )}

                {/* Fallback Manual Entry */}
                {!selectedStudentId && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <input
                      type="text"
                      value={manualName}
                      onChange={(e) => setManualName(e.target.value)}
                      placeholder="Student/Parent Name"
                      className="px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-sm text-slate-900 text-xs font-bold focus:outline-none focus:border-blue-600 focus:bg-white"
                    />
                    <input
                      type="text"
                      value={manualPhone}
                      onChange={(e) => setManualPhone(e.target.value)}
                      placeholder="Phone Number (+91...)"
                      className="px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-sm text-slate-900 font-mono text-xs font-bold focus:outline-none focus:border-blue-600 focus:bg-white"
                    />
                  </div>
                )}
              </div>
            )}

            {/* Mode 2: Multiple Students Checkbox List */}
            {targetMode === 'multiple' && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-600 font-bold">
                  <span>Select target students:</span>
                  <div className="space-x-2">
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
                      Deselect All
                    </button>
                  </div>
                </div>

                {students.length > 0 ? (
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
                              className="rounded-xs border-slate-300 text-blue-600 focus:ring-0"
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
                ) : (
                  <p className="text-xs text-slate-500 italic">No registered students to select.</p>
                )}
              </div>
            )}

            {/* Mode 3: Department / Whole Class */}
            {targetMode === 'department' && (
              <div className="space-y-3">
                <label className="block text-xs font-black text-slate-700 uppercase tracking-wider">Select Department / Class:</label>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  {DEPARTMENTS.map((dept) => (
                    <button
                      key={dept}
                      type="button"
                      onClick={() => setSelectedDept(dept)}
                      className={`py-2 px-3 text-xs font-black rounded-sm border transition-all uppercase tracking-wider ${
                        selectedDept === dept
                          ? 'bg-blue-600 text-white border-blue-600 shadow'
                          : 'bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100'
                      }`}
                    >
                      {dept}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-slate-600 font-medium">
                  Targeting all students registered under <strong className="text-slate-900 font-bold">{selectedDept}</strong> department ({targetRecipients.length} students match).
                </p>
              </div>
            )}

          </div>

          {/* Step 2: Message Type, Channel & Composer */}
          <div className="bg-white border border-slate-200 p-5 rounded-sm shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-200 pb-3 gap-2">
              <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-blue-600" />
                <span>2. Message Configuration & Content</span>
              </h3>

              {/* Delivery Channel */}
              <div className="flex items-center space-x-2 text-xs font-bold uppercase tracking-wider">
                <span className="text-slate-500">Channel:</span>
                <select
                  value={channel}
                  onChange={(e) => setChannel(e.target.value as DeliveryChannel)}
                  className="bg-slate-100 border border-slate-300 text-blue-900 font-black px-2.5 py-1 rounded-sm focus:outline-none"
                >
                  <option value="SMS">Fast2SMS Gateway</option>
                  <option value="WhatsApp">WhatsApp API</option>
                  <option value="Both">Both (SMS + WhatsApp)</option>
                </select>
              </div>
            </div>

            {/* Category & Template Selector */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-black text-slate-700 uppercase tracking-wider mb-1">Message Type:</label>
                <select
                  value={messageType}
                  onChange={(e) => setMessageType(e.target.value as MessageType)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-sm text-slate-900 text-xs font-bold focus:outline-none focus:border-blue-600 focus:bg-white"
                >
                  <option value="General Notification">General Notification</option>
                  <option value="Attendance Alert">Attendance Alert</option>
                  <option value="Exam Result">Exam Result</option>
                  <option value="Custom">Custom Message</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-black text-slate-700 uppercase tracking-wider mb-1">Load Quick Template:</label>
                <select
                  value={selectedTemplateId}
                  onChange={(e) => handleSelectTemplate(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-sm text-blue-800 text-xs font-bold focus:outline-none focus:border-blue-600 focus:bg-white"
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

            {/* Dynamic Placeholder Insertion Buttons */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-black text-slate-700 uppercase tracking-wider">Insert Dynamic Variables:</span>
                <span className="text-[10px] text-slate-400 font-bold uppercase">Auto-interpolates per student</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { label: '{name}', desc: 'Student Name' },
                  { label: '{regNo}', desc: 'Register No' },
                  { label: '{department}', desc: 'Department' },
                  { label: '{marks}', desc: 'Exam Marks' },
                  { label: '{date}', desc: 'Today Date' },
                ].map((varItem) => (
                  <button
                    key={varItem.label}
                    type="button"
                    onClick={() => insertVariable(varItem.label)}
                    className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-blue-900 border border-slate-300 text-[11px] font-mono font-black rounded-sm transition-all"
                  >
                    + {varItem.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Message Body Input */}
            <div>
              <textarea
                value={messageContent}
                onChange={(e) => setMessageContent(e.target.value)}
                rows={4}
                placeholder="Type your official SMS message content here... Use {name}, {regNo}, {department} for personalized text."
                className="w-full p-3.5 bg-slate-50 border border-slate-300 rounded-sm text-slate-900 text-xs font-medium leading-relaxed focus:outline-none focus:border-blue-600 focus:bg-white"
              />

              <div className="flex items-center justify-between text-[11px] text-slate-500 font-bold mt-1.5">
                <span>
                  Characters: <strong className="text-slate-900">{messageContent.length}</strong> | Credits per recipient: <strong className="text-blue-700">{Math.ceil((messageContent.length || 1) / 160)} SMS</strong>
                </span>
                <span>
                  Total SMS Count: <strong className="text-blue-700">{targetRecipients.length * Math.ceil((messageContent.length || 1) / 160)}</strong>
                </span>
              </div>
            </div>

            {/* Error Notification */}
            {error && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold rounded-sm flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
                <span>{error}</span>
              </div>
            )}

            {/* Dispatch Result Summary */}
            {sendResult && (
              <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs rounded-sm space-y-2">
                <div className="flex items-center justify-between font-black uppercase tracking-wider">
                  <span className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>SMS Batch Dispatched Successfully!</span>
                  </span>
                  <button
                    onClick={onNavigateToReports}
                    className="text-blue-700 hover:underline font-bold text-[11px]"
                  >
                    View Delivery Logs →
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center text-[11px] pt-1">
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

            {/* Send Action Button */}
            <button
              id="sms-dispatch-now-btn"
              type="button"
              onClick={handleSendSms}
              disabled={sending || targetRecipients.length === 0}
              className="w-full py-3.5 px-6 bg-[#0f172a] hover:bg-blue-600 text-white font-black rounded-sm shadow-md transition-all flex items-center justify-center space-x-2 text-xs uppercase tracking-widest disabled:opacity-50"
            >
              {sending ? (
                <span>Dispatching SMS to Carrier Gateway...</span>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  <span>
                    Dispatch SMS Now ({targetRecipients.length} Recipient{targetRecipients.length !== 1 ? 's' : ''})
                  </span>
                </>
              )}
            </button>

          </div>

        </div>

        {/* Right Column: Live Mobile Preview Card */}
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 p-5 rounded-sm shadow-sm sticky top-20">
            <div className="flex items-center space-x-2 text-xs font-black text-slate-900 uppercase tracking-widest mb-4">
              <Eye className="w-4 h-4 text-blue-600" />
              <span>Live Mobile handset Preview</span>
            </div>

            {/* Mock Smartphone Frame */}
            <div className="w-full max-w-[280px] mx-auto bg-slate-900 rounded-[32px] p-3 border-4 border-slate-800 shadow-2xl relative">
              
              {/* Speaker notch */}
              <div className="w-20 h-3 bg-slate-800 rounded-full mx-auto mb-3" />

              {/* Screen Header */}
              <div className="bg-slate-800 p-2.5 rounded-t-xl border-b border-slate-700 text-center text-xs font-black text-white flex items-center justify-between">
                <span className="text-[10px] text-blue-400 font-mono font-bold">VSBEC SMS</span>
                <span className="text-[9px] text-slate-400 font-bold">OFFICIAL</span>
              </div>

              {/* Message Bubble Container */}
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
              <div className="font-black text-slate-900 uppercase tracking-wider">Sample Recipient Data:</div>
              <div>Student: <strong className="text-slate-900">{sampleRecipient.name}</strong></div>
              <div>Reg No: <strong className="text-blue-700 font-mono">{sampleRecipient.registerNumber}</strong></div>
              <div>Dept: <strong className="text-slate-900">{sampleRecipient.department}</strong></div>
            </div>

          </div>
        </div>

      </div>

    </div>
  );
};
