import React, { useState } from 'react';
import {
  FileSpreadsheet,
  X,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  FolderPlus,
  ShieldCheck,
} from 'lucide-react';
import { ExamBatch } from '../types';
import { createGoogleSpreadsheetWithData } from '../services/googleSheetsService';
import { googleSignIn, getAccessToken, getGoogleUser } from '../lib/googleAuth';

interface GoogleSheetsExportModalProps {
  batch: ExamBatch;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (spreadsheetUrl: string) => void;
}

export const GoogleSheetsExportModal: React.FC<GoogleSheetsExportModalProps> = ({
  batch,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [spreadsheetTitle, setSpreadsheetTitle] = useState(
    `VSB Assessment Report - ${batch.title} (${batch.department})`
  );
  const [tabTitle, setTabTitle] = useState('Assessment Results');
  const [isExporting, setIsExporting] = useState(false);
  const [createdUrl, setCreatedUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleExport = async () => {
    setError(null);
    setIsExporting(true);

    try {
      let token = await getAccessToken();
      if (!token) {
        // Prompt Google Sign in
        const res = await googleSignIn();
        if (!res?.accessToken) {
          throw new Error('Google sign-in required to export to Google Sheets.');
        }
        token = res.accessToken;
      }

      // Build structured rows for Google Sheets
      const detectedSubjectHeaders: string[] = Array.from(
        new Set<string>(
          batch.results.flatMap((r) =>
            (r.subjects || []).map((s) => s.subjectName || s.subjectCode || 'Subject')
          )
        )
      );

      const rows: (string | number)[][] = [
        ['VSB ENGINEERING COLLEGE • VY NEXTGEN TECHNOLOGY'],
        [
          `INTERNAL ASSESSMENT REPORT — DEPARTMENT OF ${(batch.department || 'CSE(AIML)').toUpperCase()}`,
        ],
        [
          `Exam Title: ${batch.title}`,
          `Assessment Date: ${batch.examDate}`,
          `Academic Year: ${batch.academicYear || '2025-2026'}`,
          `Total Students: ${batch.totalStudents}`,
          `Pass Rate: ${batch.passRate}%`,
        ],
        [''], // Empty spacer row
        [
          'S.No',
          'Register Number',
          'Student Name',
          'Parent Mobile',
          ...detectedSubjectHeaders,
          'Total Marks Scored',
          'Max Marks',
          'Percentage',
          'Overall Status',
          'Remarks',
        ],
      ];

      batch.results.forEach((r, idx) => {
        const sNo = r.sNo || idx + 1;
        const regNo = r.registerNumber || '-';
        const name = r.studentName || 'Student';
        const phone = r.phoneNumber || '-';

        let scored = 0;
        let max = 0;

        const subjectMarks = detectedSubjectHeaders.map((subName) => {
          const match = (r.subjects || []).find(
            (s) => (s.subjectName || s.subjectCode) === subName
          );
          if (match) {
            const rawVal = match.marks !== undefined && match.marks !== null ? match.marks : match.grade;
            const num = typeof rawVal === 'number' ? rawVal : parseFloat(String(rawVal)) || 0;
            scored += num;
            max += (match.maxMarks || 100);
            return rawVal !== undefined ? rawVal : 0;
          }
          return '-';
        });

        if (max === 0) max = 100;
        const percentage = ((scored / max) * 100).toFixed(2);
        const status = r.overallStatus || (scored / max >= 0.5 ? 'PASS' : 'FAIL');
        const remarks = status === 'PASS' ? 'Good Performance' : 'Requires Improvement';

        rows.push([
          sNo,
          regNo,
          name,
          phone,
          ...subjectMarks,
          scored,
          max,
          `${percentage}%`,
          status,
          remarks,
        ]);
      });

      const result = await createGoogleSpreadsheetWithData(
        spreadsheetTitle,
        tabTitle,
        rows,
        token
      );

      setCreatedUrl(result.spreadsheetUrl);
      if (onSuccess) onSuccess(result.spreadsheetUrl);
    } catch (err: any) {
      console.error('Google Sheets export failed:', err);
      setError(err.message || 'Failed to export to Google Sheets.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs">
      <div className="bg-white border border-slate-300 w-full max-w-lg rounded-sm shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="px-5 py-4 bg-[#0f172a] text-white flex items-center justify-between border-b border-amber-500/40">
          <div className="flex items-center space-x-2.5">
            <div className="p-1.5 bg-emerald-600/30 rounded border border-emerald-500/40 text-emerald-400">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-black text-sm uppercase tracking-wider text-white">
                Export to Google Sheets
              </h3>
              <p className="text-[10px] text-amber-300 font-bold uppercase tracking-widest">
                Google Workspace & Drive Integration
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-4 text-xs">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-sm flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          {createdUrl ? (
            /* Success State */
            <div className="p-5 bg-emerald-50 border border-emerald-200 rounded-sm text-center space-y-4">
              <div className="w-12 h-12 rounded-full bg-emerald-100 mx-auto flex items-center justify-center text-emerald-700">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h4 className="font-black text-sm text-slate-900 uppercase">
                  Spreadsheet Created Successfully!
                </h4>
                <p className="text-xs text-slate-600">
                  Assessment records for <strong>{batch.results.length} students</strong> were saved to your Google Drive.
                </p>
              </div>

              <div className="pt-2 flex flex-col sm:flex-row gap-2 justify-center">
                <a
                  href={createdUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white font-black text-xs uppercase tracking-wider rounded-sm shadow-sm flex items-center justify-center gap-1.5 transition-all"
                >
                  <ExternalLink className="w-4 h-4" />
                  <span>Open in Google Sheets</span>
                </a>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold text-xs uppercase tracking-wider rounded-sm transition-all cursor-pointer"
                >
                  Done
                </button>
              </div>
            </div>
          ) : (
            /* Explicit Confirmation Form (Mandatory for Workspace Integration) */
            <div className="space-y-4">
              {/* Plain Language Action Description */}
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-sm text-slate-700 space-y-2">
                <div className="flex items-center gap-1.5 font-black text-slate-900 uppercase text-[11px]">
                  <FolderPlus className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Confirm Spreadsheet Creation</span>
                </div>
                <p className="text-xs leading-relaxed">
                  Are you sure you want to create a new Google Spreadsheet in your Google Drive with the assessment report for <strong>{batch.title}</strong>?
                </p>
                <div className="pt-1 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500 font-medium">
                  <span>• <strong>{batch.results.length}</strong> Student Records</span>
                  <span>• Department: <strong>{batch.department}</strong></span>
                  <span>• Pass Rate: <strong>{batch.passRate}%</strong></span>
                </div>
              </div>

              {/* Title & Tab Inputs */}
              <div className="space-y-3">
                <div>
                  <label className="block text-[11px] font-black uppercase tracking-wider text-slate-800 mb-1">
                    Google Spreadsheet Title *
                  </label>
                  <input
                    type="text"
                    value={spreadsheetTitle}
                    onChange={(e) => setSpreadsheetTitle(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-sm text-slate-900 text-xs font-bold focus:outline-none focus:border-amber-500 focus:bg-white"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-black uppercase tracking-wider text-slate-800 mb-1">
                    Sheet Tab Name
                  </label>
                  <input
                    type="text"
                    value={tabTitle}
                    onChange={(e) => setTabTitle(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-sm text-slate-900 text-xs font-bold focus:outline-none focus:border-amber-500 focus:bg-white"
                  />
                </div>
              </div>

              <div className="p-2.5 bg-blue-50/60 border border-blue-200 rounded-sm flex items-center gap-2 text-[11px] text-blue-900">
                <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0" />
                <span>Exports with your Google account permissions directly into your Google Drive.</span>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        {!createdUrl && (
          <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isExporting}
              className="px-4 py-2 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 font-bold text-xs uppercase tracking-wider rounded-sm cursor-pointer disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleExport}
              disabled={isExporting || !spreadsheetTitle.trim()}
              className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-black text-xs uppercase tracking-wider rounded-sm shadow-sm flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
            >
              {isExporting ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-200" />
                  <span>Creating in Drive...</span>
                </>
              ) : (
                <>
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-200" />
                  <span>Confirm & Create Spreadsheet</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
