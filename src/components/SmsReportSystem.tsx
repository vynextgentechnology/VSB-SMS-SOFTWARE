import React, { useState } from 'react';
import { SmsLog } from '../types';
import { api } from '../lib/api';
import {
  FileText,
  Search,
  Filter,
  Download,
  FileSpreadsheet,
  FileCheck2,
  Trash2,
  CheckCircle2,
  XCircle,
  Building2,
  Clock,
  Send,
  AlertTriangle,
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

interface SmsReportSystemProps {
  logs: SmsLog[];
  onRefresh: () => void;
}

export const SmsReportSystem: React.FC<SmsReportSystemProps> = ({
  logs,
  onRefresh,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'Sent' | 'Failed'>('ALL');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');

  const [selectedLog, setSelectedLog] = useState<SmsLog | null>(null);
  const [isConfirmClearModalOpen, setIsConfirmClearModalOpen] = useState(false);
  const [clearError, setClearError] = useState<string | null>(null);

  // Clear logs state
  const handleClearLogs = () => {
    setIsConfirmClearModalOpen(true);
  };

  const confirmClearLogs = async () => {
    try {
      await api.clearSmsReports();
      setIsConfirmClearModalOpen(false);
      onRefresh();
    } catch (err: any) {
      setClearError(err.message || 'Failed to clear logs');
    }
  };

  // Filter logs
  const filteredLogs = logs.filter((l) => {
    const matchesSearch =
      l.recipientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      l.registerNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      l.phoneNumber.includes(searchTerm) ||
      l.messageContent.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = statusFilter === 'ALL' || l.status === statusFilter;
    const matchesType = typeFilter === 'ALL' || l.messageType === typeFilter;

    return matchesSearch && matchesStatus && matchesType;
  });

  // Calculate summary metrics
  const totalSent = logs.filter((l) => l.status === 'Sent' || l.status === 'Delivered').length;
  const totalFailed = logs.filter((l) => l.status === 'Failed').length;

  // --- Export PDF Report ---
  const exportPdfReport = () => {
    const doc = new jsPDF('p', 'mm', 'a4');

    // Branding Header
    doc.setFillColor(15, 23, 42); // slate-900
    doc.rect(0, 0, 210, 28, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text('VY NEXTGEN TECHNOLOGY', 14, 14);

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(148, 163, 184);
    doc.text('Educational SMS Management System • Official Audit Report', 14, 20);

    // Summary Box
    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('SMS Delivery Summary', 14, 38);

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(`Report Date: ${new Date().toLocaleString()}`, 14, 44);
    doc.text(`Total Messages: ${logs.length} | Sent: ${totalSent} | Failed: ${totalFailed}`, 14, 49);

    // Table
    const tableRows = filteredLogs.map((l) => [
      new Date(l.sentAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }),
      l.recipientName,
      l.registerNumber,
      l.phoneNumber,
      l.messageType,
      l.status,
      l.messageContent.substring(0, 45) + (l.messageContent.length > 45 ? '...' : ''),
    ]);

    autoTable(doc, {
      startY: 55,
      head: [['Time & Date', 'Recipient Name', 'Reg No', 'Phone', 'Type', 'Status', 'Message Content']],
      body: tableRows,
      headStyles: {
        fillColor: [15, 23, 42],
        textColor: [255, 255, 255],
        fontSize: 8,
        fontStyle: 'bold',
      },
      bodyStyles: {
        fontSize: 8,
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252],
      },
    });

    doc.save(`VY_NEXTGEN_SMS_Report_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  // --- Export Excel / CSV Report ---
  const exportExcelReport = () => {
    const dataToExport = filteredLogs.map((l) => ({
      'Date & Time': new Date(l.sentAt).toLocaleString(),
      'Recipient Name': l.recipientName,
      'Register Number': l.registerNumber,
      'Department': l.department,
      'Phone Number': l.phoneNumber,
      'Message Type': l.messageType,
      'Channel': l.channel,
      'Status': l.status,
      'Sent By': l.sentBy,
      'Message Content': l.messageContent,
      'Error Details': l.errorMessage || 'N/A',
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'SMS Logs');

    XLSX.writeFile(workbook, `VY_NEXTGEN_SMS_Logs_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  return (
    <div id="sms-report-system-view" className="space-y-6 animate-in fade-in duration-200">
      
      {/* Header Banner */}
      <div className="bg-white border border-slate-200 p-6 rounded-sm shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2 text-blue-600 font-black text-xs uppercase tracking-widest mb-1">
            <Building2 className="w-4 h-4" />
            <span>VSB ENGINEERING COLLEGE • VY NEXTGEN TECHNOLOGY</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 uppercase tracking-tight">SMS Audit & Delivery Reports</h2>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Comprehensive timestamped logs, delivery audit records, error diagnosis, and official PDF/Excel report export.
          </p>
        </div>

        {/* Export Buttons */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <a
            href="/api/reports/login-history"
            download
            className="px-3 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs rounded-sm border border-slate-300 flex items-center gap-1.5 transition-all uppercase tracking-wider"
            title="Download Login & Logout History CSV"
          >
            <Download className="w-3.5 h-3.5 text-indigo-600" />
            <span>Login Logs</span>
          </a>

          <a
            href="/api/reports/students"
            download
            className="px-3 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs rounded-sm border border-slate-300 flex items-center gap-1.5 transition-all uppercase tracking-wider"
            title="Download Student Directory CSV"
          >
            <Download className="w-3.5 h-3.5 text-blue-600" />
            <span>Students CSV</span>
          </a>

          <button
            id="report-export-pdf-btn"
            onClick={exportPdfReport}
            disabled={logs.length === 0}
            className="px-4 py-2.5 bg-[#0f172a] hover:bg-blue-600 text-white font-black text-xs rounded-sm shadow-md flex items-center gap-2 transition-all uppercase tracking-widest disabled:opacity-50"
          >
            <Download className="w-4 h-4 text-blue-400" />
            <span>PDF Report</span>
          </button>

          <button
            id="report-export-excel-btn"
            onClick={exportExcelReport}
            disabled={logs.length === 0}
            className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs rounded-sm border border-slate-300 flex items-center gap-2 transition-all uppercase tracking-wider disabled:opacity-50"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            <span>Export Excel</span>
          </button>

          <button
            id="report-clear-logs-btn"
            onClick={handleClearLogs}
            disabled={logs.length === 0}
            className="p-2.5 bg-slate-100 hover:bg-rose-50 hover:text-rose-600 text-slate-500 rounded-sm border border-slate-300 transition-all"
            title="Clear All Logs"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Stats Summary Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 p-4 rounded-sm shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Total Dispatched SMS</span>
            <div className="text-2xl font-black text-slate-900 mt-0.5">{logs.length}</div>
          </div>
          <FileText className="w-8 h-8 text-blue-600 opacity-80" />
        </div>

        <div className="bg-white border border-slate-200 p-4 rounded-sm shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[10px] font-black text-emerald-700 uppercase tracking-wider">Delivered Messages</span>
            <div className="text-2xl font-black text-emerald-700 mt-0.5">{totalSent}</div>
          </div>
          <CheckCircle2 className="w-8 h-8 text-emerald-600 opacity-80" />
        </div>

        <div className="bg-white border border-slate-200 p-4 rounded-sm shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[10px] font-black text-rose-700 uppercase tracking-wider">Failed Deliveries</span>
            <div className="text-2xl font-black text-rose-700 mt-0.5">{totalFailed}</div>
          </div>
          <AlertTriangle className="w-8 h-8 text-rose-600 opacity-80" />
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-white border border-slate-200 p-4 rounded-sm shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search logs by Name, Reg No, or Message..."
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-sm text-slate-900 placeholder-slate-400 text-xs font-medium focus:outline-none focus:border-blue-600 focus:bg-white"
          />
        </div>

        {/* Filter Pills */}
        <div className="flex items-center space-x-2 overflow-x-auto pb-1 md:pb-0">
          <Filter className="w-4 h-4 text-slate-400 shrink-0" />
          <span className="text-xs font-bold text-slate-600 shrink-0 uppercase tracking-wider">Status:</span>
          {(['ALL', 'Sent', 'Failed'] as const).map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 text-xs font-black rounded-sm transition-all uppercase tracking-wider ${
                statusFilter === st
                  ? 'bg-[#0f172a] text-white'
                  : 'bg-slate-100 text-slate-600 hover:text-slate-900'
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {/* Logs Data Table */}
      <div className="bg-white border border-slate-200 rounded-sm overflow-hidden shadow-sm">
        <div className="p-4 bg-[#0f172a] text-white flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center space-x-2">
            <Clock className="w-4 h-4 text-blue-400" />
            <h3 className="text-xs font-black uppercase tracking-widest">
              Live SMS Activity Audit Trail ({filteredLogs.length} Entries)
            </h3>
          </div>
        </div>

        {filteredLogs.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-50 text-slate-600 uppercase text-[10px] font-black tracking-wider border-b border-slate-200">
                <tr>
                  <th className="px-5 py-3.5 font-black">Time & Date</th>
                  <th className="px-5 py-3.5 font-black">Recipient</th>
                  <th className="px-5 py-3.5 font-black">Phone Number</th>
                  <th className="px-5 py-3.5 font-black">Type & Channel</th>
                  <th className="px-5 py-3.5 font-black">Status</th>
                  <th className="px-5 py-3.5 font-black">Message Content</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredLogs.map((log) => (
                  <tr
                    key={log.id}
                    onClick={() => setSelectedLog(log)}
                    className="hover:bg-slate-50/80 cursor-pointer transition-colors"
                  >
                    <td className="px-5 py-3.5 font-mono text-[11px] font-bold text-slate-500 whitespace-nowrap">
                      {new Date(log.sentAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'medium' })}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="font-black text-slate-900">{log.recipientName}</div>
                      <div className="text-[10px] text-blue-700 font-mono font-bold">{log.registerNumber} ({log.department})</div>
                    </td>
                    <td className="px-5 py-3.5 font-mono font-bold text-slate-800">{log.phoneNumber}</td>
                    <td className="px-5 py-3.5">
                      <span className="px-2 py-0.5 bg-slate-100 border border-slate-200 text-slate-800 rounded-sm font-bold text-[10px] block w-max uppercase tracking-wider">
                        {log.messageType}
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono font-bold mt-0.5 block">
                        via {log.channel}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span
                        className={`inline-flex items-center gap-1 font-black text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-sm ${
                          log.status === 'Sent' || log.status === 'Delivered'
                            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                            : 'bg-rose-50 text-rose-800 border border-rose-200'
                        }`}
                      >
                        {log.status === 'Failed' ? <XCircle className="w-3 h-3 text-rose-600" /> : <CheckCircle2 className="w-3 h-3 text-emerald-600" />}
                        <span>{log.status}</span>
                      </span>
                    </td>
                    <td className="px-5 py-3.5 max-w-xs truncate text-slate-600 font-medium text-[11px]">
                      {log.messageContent}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-12 text-center text-slate-500 space-y-2">
            <FileText className="w-10 h-10 mx-auto text-slate-300" />
            <h4 className="text-sm font-black text-slate-800 uppercase tracking-wider">No SMS Logs Recorded</h4>
            <p className="text-xs text-slate-500 font-medium">
              {logs.length === 0
                ? 'System starts empty by default. Send your first SMS to view live delivery logs here.'
                : 'No logs match your filter criteria.'}
            </p>
          </div>
        )}
      </div>

      {/* Log Detail Modal */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-sm p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
                <FileText className="w-4 h-4 text-blue-600" />
                <span>SMS Log Audit Details</span>
              </h3>
              <button
                onClick={() => setSelectedLog(null)}
                className="text-slate-400 hover:text-slate-900"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2 bg-slate-50 p-3 rounded-sm border border-slate-200">
                <div>
                  <span className="text-slate-500 block text-[10px] font-bold uppercase">Recipient:</span>
                  <span className="font-black text-slate-900">{selectedLog.recipientName}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px] font-bold uppercase">Reg No:</span>
                  <span className="font-mono text-blue-700 font-bold">{selectedLog.registerNumber}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px] font-bold uppercase">Phone Number:</span>
                  <span className="font-mono text-slate-900 font-bold">{selectedLog.phoneNumber}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px] font-bold uppercase">Status:</span>
                  <span className={`font-black uppercase ${selectedLog.status === 'Failed' ? 'text-rose-700' : 'text-emerald-700'}`}>
                    {selectedLog.status}
                  </span>
                </div>
              </div>

              <div>
                <span className="text-slate-700 font-black uppercase text-[10px] tracking-wider block mb-1">Message Content Sent:</span>
                <div className="p-3 bg-slate-50 rounded-sm border border-slate-200 text-slate-900 font-sans font-medium text-xs leading-relaxed">
                  {selectedLog.messageContent}
                </div>
              </div>

              <div className="text-[11px] text-slate-500 font-medium flex justify-between pt-1">
                <span>Dispatched by: <strong className="text-slate-900">{selectedLog.sentBy}</strong></span>
                <span>Time: {new Date(selectedLog.sentAt).toLocaleString()}</span>
              </div>
            </div>

            <button
              onClick={() => setSelectedLog(null)}
              className="w-full py-2.5 bg-[#0f172a] hover:bg-blue-600 text-white font-black rounded-sm text-xs uppercase tracking-widest"
            >
              Close Details
            </button>
          </div>
        </div>
      )}

      {/* Clear Logs Confirmation Modal */}
      {isConfirmClearModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-white border border-slate-200 w-full max-w-md rounded-sm shadow-xl p-6 space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-full">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">Confirm Clear SMS Logs</h3>
                <p className="text-xs font-medium text-slate-500">This action cannot be undone.</p>
              </div>
            </div>

            {clearError && (
              <div className="p-2.5 bg-rose-50 text-rose-700 text-xs font-bold rounded border border-rose-200">
                {clearError}
              </div>
            )}

            <div className="text-xs text-slate-700 bg-slate-50 p-3 rounded border border-slate-200 font-medium leading-relaxed">
              Are you sure you want to clear all dispatch logs? All historic SMS logs will be removed from system reports.
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setIsConfirmClearModalOpen(false)}
                className="px-4 py-2 border border-slate-300 rounded-sm text-xs font-bold uppercase tracking-wider text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmClearLogs}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-sm text-xs font-black uppercase tracking-wider shadow-sm"
              >
                Yes, Clear All Logs
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
