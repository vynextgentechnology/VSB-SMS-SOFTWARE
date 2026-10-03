import React, { useState, useEffect } from 'react';
import {
  FileSpreadsheet,
  FolderOpen,
  LogOut,
  X,
  CheckCircle2,
  ExternalLink,
  ShieldCheck,
  RefreshCw,
  AlertCircle,
  Database,
} from 'lucide-react';
import {
  googleSignIn,
  logoutGoogle,
  getAccessToken,
  getGoogleUser,
  WORKSPACE_SCOPES,
} from '../lib/googleAuth';
import { listGoogleSpreadsheets, GoogleDriveFile } from '../services/googleSheetsService';
import { User } from 'firebase/auth';

interface GoogleAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const GoogleAccountModal: React.FC<GoogleAccountModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [googleUser, setGoogleUser] = useState<User | null>(getGoogleUser());
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [recentFiles, setRecentFiles] = useState<GoogleDriveFile[]>([]);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      checkAuthAndLoad();
    }
  }, [isOpen]);

  const checkAuthAndLoad = async () => {
    setError(null);
    try {
      const token = await getAccessToken();
      setAccessToken(token);
      const user = getGoogleUser();
      setGoogleUser(user);
      if (token) {
        setIsLoadingFiles(true);
        try {
          const files = await listGoogleSpreadsheets(token);
          setRecentFiles(files.slice(0, 5));
        } catch (e: any) {
          console.error('Failed to list sheets:', e);
        } finally {
          setIsLoadingFiles(false);
        }
      }
    } catch (e: any) {
      console.error(e);
    }
  };

  const handleSignIn = async () => {
    setError(null);
    setIsConnecting(true);
    try {
      const res = await googleSignIn();
      if (res) {
        setAccessToken(res.accessToken);
        setGoogleUser(res.user);
        setIsLoadingFiles(true);
        try {
          const files = await listGoogleSpreadsheets(res.accessToken);
          setRecentFiles(files.slice(0, 5));
        } catch (e) {
          console.error(e);
        } finally {
          setIsLoadingFiles(false);
        }
      }
    } catch (err: any) {
      setError(err.message || 'Google Sign-in failed. Please try again.');
    } finally {
      setIsConnecting(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await logoutGoogle();
      setAccessToken(null);
      setGoogleUser(null);
      setRecentFiles([]);
    } catch (err: any) {
      setError(err.message || 'Logout failed.');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white border border-slate-300 w-full max-w-lg rounded-sm shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 bg-[#0f172a] text-white flex items-center justify-between border-b border-amber-500/40">
          <div className="flex items-center space-x-2.5">
            <div className="p-1.5 bg-emerald-600/30 rounded border border-emerald-500/40 text-emerald-400">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-black text-sm uppercase tracking-wider text-white">
                Google Sheets & Drive Integration
              </h3>
              <p className="text-[10px] text-amber-300 font-bold uppercase tracking-widest">
                Official Google Workspace Integration
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

        {/* Content */}
        <div className="p-6 space-y-5 text-xs">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-sm flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          {/* Connection Status Card */}
          {googleUser && accessToken ? (
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-sm space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {googleUser.photoURL ? (
                    <img
                      src={googleUser.photoURL}
                      alt=""
                      className="w-10 h-10 rounded-full border border-emerald-400"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-emerald-600 text-white font-black text-sm flex items-center justify-center">
                      {googleUser.displayName?.charAt(0) || 'G'}
                    </div>
                  )}
                  <div>
                    <h4 className="font-black text-sm text-slate-900">
                      {googleUser.displayName || 'Google Account'}
                    </h4>
                    <p className="text-slate-600 text-xs font-mono">{googleUser.email}</p>
                  </div>
                </div>

                <span className="px-2.5 py-1 bg-emerald-200/70 text-emerald-900 font-black text-[10px] uppercase rounded-sm flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                  Active
                </span>
              </div>

              <div className="pt-2 border-t border-emerald-200/80 flex items-center justify-between">
                <span className="text-[11px] text-emerald-800 font-medium">
                  Token active in memory • Securely signed in
                </span>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="text-xs font-bold text-rose-600 hover:text-rose-800 flex items-center gap-1 cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Disconnect</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="p-5 bg-slate-50 border border-slate-200 rounded-sm text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-slate-100 border border-slate-200 mx-auto flex items-center justify-center text-slate-500">
                <FileSpreadsheet className="w-6 h-6 text-emerald-600" />
              </div>
              <div>
                <h4 className="font-black text-sm text-slate-900 uppercase">
                  Google Account Not Connected
                </h4>
                <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
                  Connect your Google account with permission to read and create spreadsheets directly in your Google Drive.
                </p>
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleSignIn}
                  disabled={isConnecting}
                  className="px-5 py-2.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-800 font-bold text-xs rounded-sm shadow-sm flex items-center gap-2.5 mx-auto transition-all cursor-pointer disabled:opacity-50"
                >
                  <svg className="w-4 h-4" viewBox="0 0 48 48">
                    <path
                      fill="#EA4335"
                      d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                    />
                    <path
                      fill="#4285F4"
                      d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                    />
                    <path
                      fill="#34A853"
                      d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                    />
                  </svg>
                  <span>{isConnecting ? 'Signing In...' : 'Sign in with Google'}</span>
                </button>
              </div>
            </div>
          )}

          {/* Capabilities Grid */}
          <div className="border border-slate-200 rounded-sm p-4 space-y-3 bg-slate-50/50">
            <h5 className="font-black text-slate-800 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              Integrated Features & Permissions
            </h5>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
              <div className="p-2.5 bg-white border border-slate-200 rounded-sm space-y-1">
                <span className="font-bold text-slate-900 block flex items-center gap-1">
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                  Import From Sheets
                </span>
                <p className="text-slate-500">
                  Select and import mark lists, student registrations, and attendance rosters directly from Drive.
                </p>
              </div>

              <div className="p-2.5 bg-white border border-slate-200 rounded-sm space-y-1">
                <span className="font-bold text-slate-900 block flex items-center gap-1">
                  <FolderOpen className="w-3.5 h-3.5 text-blue-600" />
                  Export to Drive
                </span>
                <p className="text-slate-500">
                  Create clean, formatted spreadsheets for assessment results, student directories, and attendance reports.
                </p>
              </div>
            </div>
          </div>

          {/* Recent Drive Spreadsheets if connected */}
          {googleUser && accessToken && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-black uppercase text-slate-700">
                  Recent Spreadsheets in Drive
                </span>
                <button
                  type="button"
                  onClick={checkAuthAndLoad}
                  disabled={isLoadingFiles}
                  className="text-slate-500 hover:text-slate-800 p-0.5"
                  title="Refresh"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoadingFiles ? 'animate-spin' : ''}`} />
                </button>
              </div>

              {isLoadingFiles ? (
                <div className="p-3 text-center text-slate-400 text-xs">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin mx-auto mb-1 text-emerald-600" />
                  Loading spreadsheets...
                </div>
              ) : recentFiles.length === 0 ? (
                <div className="p-3 text-center text-slate-400 text-xs border border-dashed border-slate-200 rounded-sm">
                  No spreadsheets found in Drive.
                </div>
              ) : (
                <div className="divide-y divide-slate-100 border border-slate-200 rounded-sm overflow-hidden bg-white">
                  {recentFiles.map((f) => (
                    <div
                      key={f.id}
                      className="p-2 flex items-center justify-between text-xs hover:bg-slate-50"
                    >
                      <div className="flex items-center gap-2 truncate pr-2">
                        <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        <span className="font-bold text-slate-800 truncate">{f.name}</span>
                      </div>
                      {f.webViewLink && (
                        <a
                          href={f.webViewLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-slate-400 hover:text-emerald-700 p-1 shrink-0"
                          title="Open in Google Sheets"
                        >
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs uppercase tracking-wider rounded-sm cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
