import React, { useState, useMemo } from 'react';
import { SmsLog, ExamBatch, Department } from '../types';
import { api } from '../lib/api';
import {
  FileText,
  Search,
  Filter,
  Download,
  FileSpreadsheet,
  Trash2,
  CheckCircle2,
  XCircle,
  Clock,
  Building2,
  RotateCcw,
  Calendar,
  Layers,
  GraduationCap,
  Sparkles,
  Phone,
  AlertCircle,
  Database,
  ArrowUpDown,
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

interface SmsReportSystemProps {
  logs: SmsLog[];
  batches?: ExamBatch[];
  departments?: Department[];
  onRefresh: () => void;
}

export const SmsReportSystem: React.FC<SmsReportSystemProps> = ({
  logs,
  batches = [],
  departments = [],
  onRefresh,
}) => {
  // Filter States
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBatch, setSelectedBatch] = useState<string>('ALL');
  const [selectedDepartment, setSelectedDepartment] = useState<string>('ALL');
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [selectedType, setSelectedType] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [studentSearch, setStudentSearch] = useState<string>('');
  const [regNoSearch, setRegNoSearch] = useState<string>('');

  // UI States
  const [selectedLog, setSelectedLog] = useState<SmsLog | null>(null);
  const [isConfirmClearModalOpen, setIsConfirmClearModalOpen] = useState(false);
  const [clearError, setClearError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [downloadSuccessMsg, setDownloadSuccessMsg] = useState<string | null>(null);

  // Helper date/time formatting functions
  const formatSmsDate = (sentAt: string | Date | undefined): string => {
    if (!sentAt) return '-';
    try {
      const d = new Date(sentAt);
      if (isNaN(d.getTime())) return String(sentAt);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    } catch {
      return String(sentAt);
    }
  };

  const formatSmsTime = (sentAt: string | Date | undefined): string => {
    if (!sentAt) return '-';
    try {
      const d = new Date(sentAt);
      if (isNaN(d.getTime())) return '-';
      let hours = d.getHours();
      const minutes = String(d.getMinutes()).padStart(2, '0');
      const ampm = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12;
      hours = hours ? hours : 12;
      const strHours = String(hours).padStart(2, '0');
      return `${strHours}:${minutes} ${ampm}`;
    } catch {
      return '-';
    }
  };

  // Distinct types from logs
  const availableTypes = useMemo(() => {
    const types = new Set<string>();
    logs.forEach((l) => {
      if (l.messageType) types.add(l.messageType);
    });
    return Array.from(types);
  }, [logs]);

  // Distinct departments from logs & props
  const availableDepartments = useMemo(() => {
    const depts = new Set<string>();
    departments.forEach((d) => {
      if (d.code) depts.add(d.code);
    });
    logs.forEach((l) => {
      if (l.department && l.department !== 'N/A') depts.add(l.department);
    });
    return Array.from(depts);
  }, [departments, logs]);

  // Filter logs based on active criteria
  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      // Search term filter (multi-field)
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const matchesMainSearch =
          (log.recipientName && log.recipientName.toLowerCase().includes(term)) ||
          (log.registerNumber && log.registerNumber.toLowerCase().includes(term)) ||
          (log.phoneNumber && log.phoneNumber.includes(term)) ||
          (log.messageContent && log.messageContent.toLowerCase().includes(term)) ||
          (log.department && log.department.toLowerCase().includes(term));

        if (!matchesMainSearch) return false;
      }

      // Student Name specific search
      if (studentSearch.trim()) {
        const sTerm = studentSearch.toLowerCase();
        if (!log.recipientName || !log.recipientName.toLowerCase().includes(sTerm)) {
          return false;
        }
      }

      // Register Number specific search
      if (regNoSearch.trim()) {
        const rTerm = regNoSearch.toLowerCase();
        if (!log.registerNumber || !log.registerNumber.toLowerCase().includes(rTerm)) {
          return false;
        }
      }

      // Batch filter
      if (selectedBatch !== 'ALL') {
        const batchQuery = selectedBatch.toLowerCase();
        if (!log.messageContent || !log.messageContent.toLowerCase().includes(batchQuery)) {
          return false;
        }
      }

      // Department filter
      if (selectedDepartment !== 'ALL') {
        if (!log.department || log.department.toLowerCase() !== selectedDepartment.toLowerCase()) {
          return false;
        }
      }

      // Date filter (YYYY-MM-DD)
      if (selectedDate) {
        const logDate = formatSmsDate(log.sentAt);
        if (logDate !== selectedDate) {
          return false;
        }
      }

      // Message Type filter
      if (selectedType !== 'ALL') {
        if (!log.messageType || log.messageType.toLowerCase() !== selectedType.toLowerCase()) {
          return false;
        }
      }

      // Status filter
      if (selectedStatus !== 'ALL') {
        if (selectedStatus === 'Sent') {
          if (log.status !== 'Sent' && log.status !== 'Delivered') return false;
        } else if (selectedStatus === 'Failed') {
          if (log.status !== 'Failed') return false;
        } else if (selectedStatus === 'Pending') {
          if (log.status !== 'Pending') return false;
        } else {
          if (log.status !== selectedStatus) return false;
        }
      }

      return true;
    });
  }, [
    logs,
    searchTerm,
    studentSearch,
    regNoSearch,
    selectedBatch,
    selectedDepartment,
    selectedDate,
    selectedType,
    selectedStatus,
  ]);

  // Summary Metrics
  const totalLogs = logs.length;
  const totalSent = logs.filter((l) => l.status === 'Sent' || l.status === 'Delivered').length;
  const totalFailed = logs.filter((l) => l.status === 'Failed').length;
  const totalPending = logs.filter((l) => l.status === 'Pending').length;

  const isAnyFilterActive =
    searchTerm !== '' ||
    studentSearch !== '' ||
    regNoSearch !== '' ||
    selectedBatch !== 'ALL' ||
    selectedDepartment !== 'ALL' ||
    selectedDate !== '' ||
    selectedType !== 'ALL' ||
    selectedStatus !== 'ALL';

  const handleResetFilters = () => {
    setSearchTerm('');
    setStudentSearch('');
    setRegNoSearch('');
    setSelectedBatch('ALL');
    setSelectedDepartment('ALL');
    setSelectedDate('');
    setSelectedType('ALL');
    setSelectedStatus('ALL');
  };

  // --- Official Download SMS Report (Excel) ---
  const handleDownloadSmsReportExcel = () => {
    setIsExporting(true);
    try {
      // 1. Map MongoDB logs to exact required columns in the mandatory sequential order
      const recordsToExport = filteredLogs.length > 0 ? filteredLogs : logs;

      const excelRows = recordsToExport.map((log, index) => ({
        'Serial No': index + 1,
        'Register Number': log.registerNumber || '-',
        'Student Name': log.recipientName || '-',
        'Parent Mobile Number': log.phoneNumber || '-',
        'SMS Data': log.messageContent || '',
        'SMS Date': formatSmsDate(log.sentAt),
        'SMS Time': formatSmsTime(log.sentAt),
        'SMS Status': log.status || 'Sent',
      }));

      // 2. Build workbook
      const worksheet = XLSX.utils.json_to_sheet(excelRows);

      // 3. Set custom column widths for clean presentation
      worksheet['!cols'] = [
        { wch: 12 }, // Serial No
        { wch: 18 }, // Register Number
        { wch: 26 }, // Student Name
        { wch: 22 }, // Parent Mobile Number
        { wch: 75 }, // SMS Data
        { wch: 15 }, // SMS Date
        { wch: 15 }, // SMS Time
        { wch: 15 }, // SMS Status
      ];

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'SMS Delivery Report');

      const dateStamp = new Date().toISOString().split('T')[0];
      const fileName = `VSBEC_SMS_Delivery_Report_${dateStamp}.xlsx`;

      XLSX.writeFile(workbook, fileName);

      setDownloadSuccessMsg(`Successfully generated and downloaded SMS Report (${excelRows.length} records).`);
      setTimeout(() => setDownloadSuccessMsg(null), 5000);
    } catch (err: any) {
      console.error('Excel Export Error:', err);
      alert(`Failed to download Excel report: ${err.message || 'Unknown error'}`);
    } finally {
      setIsExporting(false);
    }
  };

  // --- Official Download SMS Report (PDF) ---
  const handleDownloadSmsReportPdf = () => {
    try {
      const recordsToExport = filteredLogs.length > 0 ? filteredLogs : logs;
      if (recordsToExport.length === 0) {
        alert('No SMS records available in MongoDB to export.');
        return;
      }

      const doc = new jsPDF({
        orientation: 'p',
        unit: 'mm',
        format: 'a4',
      });

      const pageWidth = 210;
      const pageHeight = 297;
      const margin = 14;
      const contentWidth = pageWidth - margin * 2; // 182mm
      const bottomLimit = pageHeight - 20; // 277mm

      // Draw header on any page
      const drawHeader = () => {
        // Top header background
        doc.setFillColor(15, 23, 42); // slate-900
        doc.rect(0, 0, pageWidth, 24, 'F');

        // Decorative top accent bar
        doc.setFillColor(37, 99, 235); // blue-600
        doc.rect(0, 0, pageWidth, 2, 'F');

        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(13);
        doc.text('VSB ENGINEERING COLLEGE', margin, 10);

        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(203, 213, 225); // slate-300
        doc.text('OFFICIAL EDUCATIONAL SMS DISPATCH AUDIT REPORT (MONGODB LOGS)', margin, 16);

        doc.setFontSize(7.5);
        doc.setTextColor(148, 163, 184); // slate-400
        doc.text(`Generated: ${new Date().toLocaleString()}`, pageWidth - margin, 16, { align: 'right' });
      };

      let currentY = 30;
      drawHeader();

      // Initial Overview Summary Banner on Page 1
      doc.setFillColor(241, 245, 249); // slate-100
      doc.setDrawColor(203, 213, 225); // slate-300
      doc.roundedRect(margin, currentY, contentWidth, 18, 1.5, 1.5, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(15, 23, 42);
      doc.text(`SMS AUDIT SUMMARY • ${recordsToExport.length} RECORDS`, margin + 4, currentY + 6);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(71, 85, 105);
      const filterInfo = isAnyFilterActive
        ? `Filters: Batch[${selectedBatch}], Dept[${selectedDepartment}], Date[${selectedDate || 'All'}], Status[${selectedStatus}], Type[${selectedType}]`
        : 'Scope: All Available Stored MongoDB SMS Records';
      doc.text(filterInfo, margin + 4, currentY + 11);
      doc.text(
        `Total: ${recordsToExport.length} | Sent/Delivered: ${totalSent} | Failures: ${totalFailed} | Pending: ${totalPending}`,
        margin + 4,
        currentY + 15
      );

      currentY += 23;

      // Render Each SMS Record Block
      recordsToExport.forEach((log, index) => {
        const serialNo = index + 1;
        const regNo = log.registerNumber || '-';
        const studentName = log.recipientName || 'Student';
        const parentMobile = log.phoneNumber || '-';
        const smsDate = formatSmsDate(log.sentAt);
        const smsTime = formatSmsTime(log.sentAt);
        const smsStatus = log.status || 'Sent';
        const rawMessage = log.messageContent || '';

        // Prepare multi-line message content lines
        const msgWidth = contentWidth - 10;
        const rawLines = rawMessage.split(/\r?\n/);
        const wrappedLines: string[] = [];
        rawLines.forEach((line) => {
          if (line.trim() === '') {
            wrappedLines.push('');
          } else {
            const split = doc.splitTextToSize(line, msgWidth);
            wrappedLines.push(...split);
          }
        });

        const lineHeight = 3.6;
        const msgBoxHeight = Math.max(12, wrappedLines.length * lineHeight + 5);
        const metadataHeight = 24; // 4 rows of 2 columns
        const cardHeaderHeight = 6.5;
        const cardTotalHeight = cardHeaderHeight + metadataHeight + 6 + msgBoxHeight + 5; // card padding

        // Check if this record fits on current page
        if (currentY + cardTotalHeight > bottomLimit) {
          doc.addPage();
          drawHeader();
          currentY = 30;
        }

        const cardStartY = currentY;

        // Card Container Background & Border
        doc.setFillColor(248, 250, 252); // slate-50
        doc.setDrawColor(203, 213, 225); // slate-300
        doc.setLineWidth(0.3);
        doc.roundedRect(margin, cardStartY, contentWidth, cardTotalHeight, 1.5, 1.5, 'FD');

        // Card Header Strip
        doc.setFillColor(15, 23, 42); // slate-900
        doc.roundedRect(margin, cardStartY, contentWidth, cardHeaderHeight, 1.5, 1.5, 'F');
        doc.rect(margin, cardStartY + cardHeaderHeight - 1.5, contentWidth, 1.5, 'F');

        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.text(`SMS REPORT — SERIAL NO: ${serialNo}`, margin + 4, cardStartY + 4.5);

        // Status Pill on top-right of card header
        const isSent = smsStatus === 'Sent' || smsStatus === 'Delivered';
        const isFailed = smsStatus === 'Failed';
        doc.setFontSize(7.5);
        if (isSent) {
          doc.setTextColor(52, 211, 153); // emerald-400
        } else if (isFailed) {
          doc.setTextColor(248, 113, 113); // rose-400
        } else {
          doc.setTextColor(251, 191, 36); // amber-400
        }
        doc.text(`STATUS: ${smsStatus.toUpperCase()}`, pageWidth - margin - 4, cardStartY + 4.5, { align: 'right' });

        // Metadata 2-Column Grid
        let metaY = cardStartY + cardHeaderHeight + 4.5;
        doc.setFontSize(7.5);
        const col1X = margin + 4;
        const col2X = margin + (contentWidth / 2) + 2;

        // Column 1
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(71, 85, 105);
        doc.text('Serial No:', col1X, metaY);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(15, 23, 42);
        doc.text(String(serialNo), col1X + 32, metaY);

        doc.setFont('helvetica', 'bold');
        doc.setTextColor(71, 85, 105);
        doc.text('Register Number:', col1X, metaY + 4.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(29, 78, 216); // blue-700
        doc.text(regNo, col1X + 32, metaY + 4.5);

        doc.setFont('helvetica', 'bold');
        doc.setTextColor(71, 85, 105);
        doc.text('Student Name:', col1X, metaY + 9);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(15, 23, 42);
        doc.text(studentName, col1X + 32, metaY + 9);

        doc.setFont('helvetica', 'bold');
        doc.setTextColor(71, 85, 105);
        doc.text('Parent Mobile Number:', col1X, metaY + 13.5);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(15, 23, 42);
        doc.text(parentMobile, col1X + 32, metaY + 13.5);

        // Column 2
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(71, 85, 105);
        doc.text('SMS Date:', col2X, metaY);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(15, 23, 42);
        doc.text(smsDate, col2X + 24, metaY);

        doc.setFont('helvetica', 'bold');
        doc.setTextColor(71, 85, 105);
        doc.text('SMS Time:', col2X, metaY + 4.5);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(15, 23, 42);
        doc.text(smsTime, col2X + 24, metaY + 4.5);

        doc.setFont('helvetica', 'bold');
        doc.setTextColor(71, 85, 105);
        doc.text('SMS Status:', col2X, metaY + 9);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(
          isSent ? 4 : isFailed ? 185 : 180,
          isSent ? 120 : isFailed ? 28 : 83,
          isSent ? 87 : isFailed ? 28 : 9
        );
        doc.text(smsStatus, col2X + 24, metaY + 9);

        doc.setFont('helvetica', 'bold');
        doc.setTextColor(71, 85, 105);
        doc.text('Department:', col2X, metaY + 13.5);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(15, 23, 42);
        doc.text(log.department || 'General', col2X + 24, metaY + 13.5);

        // Divider Line
        const dividerY = metaY + 17;
        doc.setDrawColor(226, 232, 240); // slate-200
        doc.line(margin + 4, dividerY, margin + contentWidth - 4, dividerY);

        // SMS DATA Section Label
        const msgLabelY = dividerY + 4.5;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(15, 23, 42);
        doc.text('SMS DATA (COMPLETE ACTUAL MESSAGE SENT):', margin + 4, msgLabelY);

        // SMS DATA Inner Box
        const msgBoxY = msgLabelY + 2;
        doc.setFillColor(255, 255, 255);
        doc.setDrawColor(203, 213, 225);
        doc.roundedRect(margin + 4, msgBoxY, contentWidth - 8, msgBoxHeight, 1, 1, 'FD');

        // Multi-line Text printing with full formatting and character preservation
        doc.setFont('courier', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(15, 23, 42);

        let textY = msgBoxY + 3.8;
        wrappedLines.forEach((l) => {
          doc.text(l, margin + 7, textY);
          textY += lineHeight;
        });

        currentY = cardStartY + cardTotalHeight + 4.5;
      });

      // Add Footers with Page Numbers on all pages
      const totalPages = doc.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setDrawColor(226, 232, 240);
        doc.line(margin, 287, pageWidth - margin, 287);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(148, 163, 184);
        doc.text('VSB ENGINEERING COLLEGE • OFFICIAL SMS AUDIT REPORT (MONGODB DATA)', margin, 292);
        doc.text(`Page ${i} of ${totalPages}`, pageWidth - margin, 292, { align: 'right' });
      }

      const dateStamp = new Date().toISOString().split('T')[0];
      doc.save(`VSBEC_SMS_Audit_Report_${dateStamp}.pdf`);

      setDownloadSuccessMsg(`Successfully generated and downloaded SMS PDF Report (${recordsToExport.length} records).`);
      setTimeout(() => setDownloadSuccessMsg(null), 5000);
    } catch (err: any) {
      console.error('PDF Export Error:', err);
      alert(`Failed to generate PDF report: ${err.message || 'Unknown error'}`);
    }
  };

  // Clear logs confirmation
  const confirmClearLogs = async () => {
    try {
      await api.clearSmsReports();
      setIsConfirmClearModalOpen(false);
      onRefresh();
    } catch (err: any) {
      setClearError(err.message || 'Failed to clear logs from MongoDB');
    }
  };

  return (
    <div id="sms-report-system-view" className="space-y-6 animate-in fade-in duration-200">
      
      {/* Top Banner & Official Excel Download Action */}
      <div className="bg-white border border-slate-200 p-6 rounded-sm shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-5">
        <div>
          <div className="flex items-center space-x-2 text-blue-700 font-black text-xs uppercase tracking-widest mb-1.5">
            <Building2 className="w-4 h-4" />
            <span>VSB ENGINEERING COLLEGE • OFFICIAL SMS AUDIT SYSTEM</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 uppercase tracking-tight flex items-center gap-2">
            <span>SMS Report & Delivery Logs</span>
            <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-sm">
              <Database className="w-3 h-3 text-emerald-600" />
              <span>MongoDB Stored</span>
            </span>
          </h2>
          <p className="text-xs text-slate-500 font-medium mt-1 max-w-2xl leading-relaxed">
            Directly export permanent MongoDB SMS records with exact message content, actual sending timestamp, parent contact, register number, and delivery status.
          </p>
        </div>

        {/* Primary Action Buttons: Download SMS Report (Excel) & Download SMS Report (PDF) */}
        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            id="btn-download-sms-report-excel"
            onClick={handleDownloadSmsReportExcel}
            disabled={logs.length === 0 || isExporting}
            className="px-4 py-3 bg-emerald-700 hover:bg-emerald-800 active:bg-emerald-900 text-white font-black text-xs rounded-sm shadow-md flex items-center gap-2 transition-all uppercase tracking-wider disabled:opacity-50 cursor-pointer"
            title="Download full SMS Report in Excel format containing all 8 standardized columns"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-200" />
            <span>{isExporting ? 'Generating Excel...' : 'Download SMS Report (Excel)'}</span>
          </button>

          <button
            id="btn-download-sms-report-pdf"
            onClick={handleDownloadSmsReportPdf}
            disabled={logs.length === 0}
            className="px-4 py-3 bg-[#0f172a] hover:bg-slate-800 text-white font-black text-xs rounded-sm shadow-sm flex items-center gap-2 transition-all uppercase tracking-wider disabled:opacity-50 cursor-pointer"
            title="Download official SMS Report in PDF format with complete multi-line actual message preservation"
          >
            <Download className="w-4 h-4 text-blue-400" />
            <span>Download SMS Report (PDF)</span>
          </button>

          <button
            id="report-clear-logs-btn"
            onClick={() => setIsConfirmClearModalOpen(true)}
            disabled={logs.length === 0}
            className="p-3 bg-slate-100 hover:bg-rose-50 hover:text-rose-600 text-slate-500 rounded-sm border border-slate-300 transition-all cursor-pointer"
            title="Clear all stored logs from database"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Success Notification */}
      {downloadSuccessMsg && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold rounded-sm flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{downloadSuccessMsg}</span>
        </div>
      )}

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 p-4 rounded-sm shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Total Stored Messages</span>
            <div className="text-2xl font-black text-slate-900 mt-0.5">{totalLogs}</div>
          </div>
          <FileText className="w-8 h-8 text-blue-600 opacity-80" />
        </div>

        <div className="bg-white border border-slate-200 p-4 rounded-sm shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[10px] font-black text-emerald-700 uppercase tracking-wider">Delivered / Sent</span>
            <div className="text-2xl font-black text-emerald-700 mt-0.5">{totalSent}</div>
          </div>
          <CheckCircle2 className="w-8 h-8 text-emerald-600 opacity-80" />
        </div>

        <div className="bg-white border border-slate-200 p-4 rounded-sm shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[10px] font-black text-rose-700 uppercase tracking-wider">Delivery Failures</span>
            <div className="text-2xl font-black text-rose-700 mt-0.5">{totalFailed}</div>
          </div>
          <XCircle className="w-8 h-8 text-rose-600 opacity-80" />
        </div>

        <div className="bg-white border border-slate-200 p-4 rounded-sm shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[10px] font-black text-amber-700 uppercase tracking-wider">Filtered View Records</span>
            <div className="text-2xl font-black text-amber-700 mt-0.5">{filteredLogs.length}</div>
          </div>
          <Filter className="w-8 h-8 text-amber-600 opacity-80" />
        </div>
      </div>

      {/* Comprehensive Filter Bar */}
      <div className="bg-white border border-slate-200 p-5 rounded-sm shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-blue-700" />
            <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider">
              Filter Options Before Excel Download
            </h3>
          </div>
          {isAnyFilterActive && (
            <button
              onClick={handleResetFilters}
              className="text-xs font-bold text-blue-700 hover:text-blue-800 flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Filters</span>
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3.5">
          {/* Exam Batch Filter */}
          <div>
            <label className="block text-[10px] font-black uppercase text-slate-600 tracking-wider mb-1">
              Exam Batch:
            </label>
            <select
              value={selectedBatch}
              onChange={(e) => setSelectedBatch(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-sm text-xs font-bold text-slate-800 focus:outline-none focus:border-blue-600 focus:bg-white"
            >
              <option value="ALL">All Exam Batches</option>
              {batches.map((b) => (
                <option key={b.id} value={b.title}>
                  {b.title} ({b.department})
                </option>
              ))}
            </select>
          </div>

          {/* Department Filter */}
          <div>
            <label className="block text-[10px] font-black uppercase text-slate-600 tracking-wider mb-1">
              Department:
            </label>
            <select
              value={selectedDepartment}
              onChange={(e) => setSelectedDepartment(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-sm text-xs font-bold text-slate-800 focus:outline-none focus:border-blue-600 focus:bg-white"
            >
              <option value="ALL">All Departments</option>
              {availableDepartments.map((dept) => (
                <option key={dept} value={dept}>
                  {dept}
                </option>
              ))}
            </select>
          </div>

          {/* Date Filter */}
          <div>
            <label className="block text-[10px] font-black uppercase text-slate-600 tracking-wider mb-1">
              SMS Date:
            </label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-sm text-xs font-bold text-slate-800 focus:outline-none focus:border-blue-600 focus:bg-white"
            />
          </div>

          {/* SMS Type Filter */}
          <div>
            <label className="block text-[10px] font-black uppercase text-slate-600 tracking-wider mb-1">
              SMS Type:
            </label>
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-sm text-xs font-bold text-slate-800 focus:outline-none focus:border-blue-600 focus:bg-white"
            >
              <option value="ALL">All SMS Types</option>
              <option value="Exam Result">Exam Result</option>
              <option value="Attendance / Absent Alert">Attendance / Absent Alert</option>
              <option value="Custom SMS">Custom SMS</option>
              <option value="General Notification">General Notification</option>
              {availableTypes
                .filter(
                  (t) =>
                    ![
                      'Exam Result',
                      'Attendance / Absent Alert',
                      'Custom SMS',
                      'General Notification',
                    ].includes(t)
                )
                .map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <label className="block text-[10px] font-black uppercase text-slate-600 tracking-wider mb-1">
              SMS Status:
            </label>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-sm text-xs font-bold text-slate-800 focus:outline-none focus:border-blue-600 focus:bg-white"
            >
              <option value="ALL">All Statuses (Sent / Failed / Pending)</option>
              <option value="Sent">Sent / Delivered</option>
              <option value="Failed">Failed</option>
              <option value="Pending">Pending</option>
            </select>
          </div>

          {/* Student Name Search */}
          <div>
            <label className="block text-[10px] font-black uppercase text-slate-600 tracking-wider mb-1">
              Student Name:
            </label>
            <input
              type="text"
              value={studentSearch}
              onChange={(e) => setStudentSearch(e.target.value)}
              placeholder="Filter by Student Name..."
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-sm text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-600 focus:bg-white"
            />
          </div>

          {/* Register Number Search */}
          <div>
            <label className="block text-[10px] font-black uppercase text-slate-600 tracking-wider mb-1">
              Register Number:
            </label>
            <input
              type="text"
              value={regNoSearch}
              onChange={(e) => setRegNoSearch(e.target.value)}
              placeholder="Filter by Register No (e.g. 9225...)"
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-sm text-xs font-mono font-bold text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-600 focus:bg-white"
            />
          </div>

          {/* General Keyword Search */}
          <div>
            <label className="block text-[10px] font-black uppercase text-slate-600 tracking-wider mb-1">
              Keyword / Message Content:
            </label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search text in SMS..."
                className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-sm text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-600 focus:bg-white"
              />
            </div>
          </div>
        </div>

        {/* Filter Info Bar */}
        <div className="flex flex-wrap items-center justify-between text-[11px] text-slate-500 font-medium pt-2 border-t border-slate-100">
          <div className="flex items-center gap-2">
            <span>
              Showing <strong className="text-slate-900">{filteredLogs.length}</strong> of{' '}
              <strong className="text-slate-900">{logs.length}</strong> database SMS records
            </span>
            {isAnyFilterActive && (
              <span className="text-blue-700 font-bold bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                Filters Active (Excel download will export these {filteredLogs.length} records)
              </span>
            )}
          </div>
          <div>
            <span>Excel output format: <strong>8 Mandatory Columns (Serial No, Reg No, Student Name, Parent Mobile, SMS Data, SMS Date, SMS Time, SMS Status)</strong></span>
          </div>
        </div>
      </div>

      {/* Logs Data Table */}
      <div className="bg-white border border-slate-200 rounded-sm overflow-hidden shadow-sm">
        <div className="p-4 bg-[#0f172a] text-white flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center space-x-2">
            <Clock className="w-4 h-4 text-blue-400" />
            <h3 className="text-xs font-black uppercase tracking-widest">
              Live Database SMS Records ({filteredLogs.length} Entries)
            </h3>
          </div>
          <div className="text-[11px] text-slate-400 font-mono">
            Source: MongoDB Persistent Storage
          </div>
        </div>

        {filteredLogs.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-50 text-slate-600 uppercase text-[10px] font-black tracking-wider border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3.5 font-black text-center w-12">S.No</th>
                  <th className="px-4 py-3.5 font-black">Register Number</th>
                  <th className="px-4 py-3.5 font-black">Student Name</th>
                  <th className="px-4 py-3.5 font-black">Parent Mobile</th>
                  <th className="px-4 py-3.5 font-black">SMS Data (Exact Sent Message)</th>
                  <th className="px-4 py-3.5 font-black">SMS Date</th>
                  <th className="px-4 py-3.5 font-black">SMS Time</th>
                  <th className="px-4 py-3.5 font-black">SMS Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredLogs.map((log, idx) => (
                  <tr
                    key={log.id || `log-${idx}`}
                    onClick={() => setSelectedLog(log)}
                    className="hover:bg-slate-50/80 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3.5 text-center font-bold text-slate-500">
                      {idx + 1}
                    </td>
                    <td className="px-4 py-3.5 font-mono text-[11px] font-bold text-blue-700 whitespace-nowrap">
                      {log.registerNumber || '-'}
                    </td>
                    <td className="px-4 py-3.5 font-black text-slate-900 whitespace-nowrap">
                      {log.recipientName || 'Student'}
                      {log.department && log.department !== 'N/A' && (
                        <span className="text-[10px] font-medium text-slate-500 block">
                          Dept: {log.department}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 font-mono font-bold text-slate-800 whitespace-nowrap">
                      {log.phoneNumber || '-'}
                    </td>
                    <td className="px-4 py-3.5 max-w-md">
                      <div className="text-slate-800 font-medium text-[11px] line-clamp-2 leading-relaxed bg-slate-50/70 p-1.5 rounded border border-slate-100">
                        {log.messageContent}
                      </div>
                    </td>
                    <td className="px-4 py-3.5 font-mono text-[11px] font-bold text-slate-600 whitespace-nowrap">
                      {formatSmsDate(log.sentAt)}
                    </td>
                    <td className="px-4 py-3.5 font-mono text-[11px] font-bold text-slate-600 whitespace-nowrap">
                      {formatSmsTime(log.sentAt)}
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center gap-1 font-black text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-sm ${
                          log.status === 'Sent' || log.status === 'Delivered'
                            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                            : log.status === 'Pending'
                            ? 'bg-amber-50 text-amber-800 border border-amber-200'
                            : 'bg-rose-50 text-rose-800 border border-rose-200'
                        }`}
                      >
                        {log.status === 'Failed' ? (
                          <XCircle className="w-3 h-3 text-rose-600" />
                        ) : log.status === 'Pending' ? (
                          <Clock className="w-3 h-3 text-amber-600" />
                        ) : (
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                        )}
                        <span>{log.status || 'Sent'}</span>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-12 text-center text-slate-500 space-y-2">
            <FileText className="w-10 h-10 mx-auto text-slate-300" />
            <h4 className="text-sm font-black text-slate-800 uppercase tracking-wider">
              No SMS Records Found
            </h4>
            <p className="text-xs text-slate-500 font-medium">
              {logs.length === 0
                ? 'No SMS dispatch records found in MongoDB. Dispatched SMS will automatically appear here.'
                : 'No logs match your selected filter criteria. Try adjusting or resetting filters.'}
            </p>
            {isAnyFilterActive && (
              <button
                onClick={handleResetFilters}
                className="mt-3 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded"
              >
                Clear Filters
              </button>
            )}
          </div>
        )}
      </div>

      {/* Log Detail Modal */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg bg-white border border-slate-200 rounded-sm p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
                <FileText className="w-4 h-4 text-blue-600" />
                <span>Permanent MongoDB SMS Record</span>
              </h3>
              <button
                onClick={() => setSelectedLog(null)}
                className="text-slate-400 hover:text-slate-900 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2.5 bg-slate-50 p-3.5 rounded-sm border border-slate-200">
                <div>
                  <span className="text-slate-500 block text-[10px] font-bold uppercase">Student Name:</span>
                  <span className="font-black text-slate-900 text-sm">{selectedLog.recipientName}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px] font-bold uppercase">Register Number:</span>
                  <span className="font-mono text-blue-700 font-black text-sm">{selectedLog.registerNumber}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px] font-bold uppercase">Parent Mobile:</span>
                  <span className="font-mono text-slate-900 font-bold">{selectedLog.phoneNumber}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px] font-bold uppercase">Department:</span>
                  <span className="font-bold text-slate-900">{selectedLog.department || 'General'}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px] font-bold uppercase">SMS Date:</span>
                  <span className="font-mono text-slate-800 font-bold">{formatSmsDate(selectedLog.sentAt)}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px] font-bold uppercase">SMS Time:</span>
                  <span className="font-mono text-slate-800 font-bold">{formatSmsTime(selectedLog.sentAt)}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px] font-bold uppercase">SMS Type:</span>
                  <span className="font-bold text-slate-800">{selectedLog.messageType}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px] font-bold uppercase">Delivery Status:</span>
                  <span
                    className={`font-black uppercase text-[11px] ${
                      selectedLog.status === 'Failed' ? 'text-rose-700' : 'text-emerald-700'
                    }`}
                  >
                    {selectedLog.status}
                  </span>
                </div>
              </div>

              <div>
                <span className="text-slate-700 font-black uppercase text-[10px] tracking-wider block mb-1">
                  Complete SMS Data (Exact Sent Message):
                </span>
                <div className="p-4 bg-slate-900 text-slate-100 rounded-sm border border-slate-800 font-mono text-xs leading-relaxed whitespace-pre-wrap select-all">
                  {selectedLog.messageContent}
                </div>
              </div>

              {selectedLog.errorMessage && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-[11px] rounded">
                  <strong>Gateway Diagnostics:</strong> {selectedLog.errorMessage}
                </div>
              )}

              <div className="text-[11px] text-slate-500 font-medium flex justify-between pt-1 border-t border-slate-100">
                <span>Dispatched by: <strong className="text-slate-900">{selectedLog.sentBy || 'VSBEC Staff'}</strong></span>
                <span>Channel: {selectedLog.channel}</span>
              </div>
            </div>

            <button
              onClick={() => setSelectedLog(null)}
              className="w-full py-2.5 bg-[#0f172a] hover:bg-slate-800 text-white font-black rounded-sm text-xs uppercase tracking-widest cursor-pointer"
            >
              Close Record View
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
                <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">
                  Confirm Clear SMS Database Logs
                </h3>
                <p className="text-xs font-medium text-slate-500">
                  This action will permanently delete all SMS logs from MongoDB.
                </p>
              </div>
            </div>

            {clearError && (
              <div className="p-2.5 bg-rose-50 text-rose-700 text-xs font-bold rounded border border-rose-200">
                {clearError}
              </div>
            )}

            <div className="text-xs text-slate-700 bg-slate-50 p-3.5 rounded border border-slate-200 font-medium leading-relaxed">
              Are you sure you want to permanently clear all SMS dispatch logs from the database? This action cannot be reversed.
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setIsConfirmClearModalOpen(false)}
                className="px-4 py-2 border border-slate-300 rounded-sm text-xs font-bold uppercase tracking-wider text-slate-600 hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmClearLogs}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-sm text-xs font-black uppercase tracking-wider shadow-sm cursor-pointer"
              >
                Yes, Clear Database Logs
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
