import React, { useState, useEffect } from 'react';
import {
  FileSpreadsheet,
  RefreshCw,
  Search,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  FolderOpen,
  ArrowRight,
  LogOut,
  Layers,
} from 'lucide-react';
import {
  googleSignIn,
  logoutGoogle,
  getAccessToken,
  getGoogleUser,
} from '../lib/googleAuth';
import {
  listGoogleSpreadsheets,
  getSpreadsheetDetails,
  getSheetValues,
  GoogleDriveFile,
  GoogleSheetTab,
  extractSpreadsheetId,
} from '../services/googleSheetsService';
import { User } from 'firebase/auth';

interface GoogleSheetsPickerProps {
  onDataLoaded: (rows: any[][], sheetTitle: string, spreadsheetName: string) => void;
  onError: (errorMsg: string) => void;
}

export const GoogleSheetsPicker: React.FC<GoogleSheetsPickerProps> = ({
  onDataLoaded,
  onError,
}) => {
  const [googleUser, setGoogleUser] = useState<User | null>(getGoogleUser());
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  // Spreadsheets list from Drive
  const [spreadsheets, setSpreadsheets] = useState<GoogleDriveFile[]>([]);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [searchFilter, setSearchFilter] = useState('');

  // Selected Spreadsheet & Tabs
  const [selectedFile, setSelectedFile] = useState<GoogleDriveFile | null>(null);
  const [manualInput, setManualInput] = useState('');
  const [sheetTabs, setSheetTabs] = useState<GoogleSheetTab[]>([]);
  const [selectedTab, setSelectedTab] = useState<string>('');
  const [isLoadingTabs, setIsLoadingTabs] = useState(false);

  // Data Fetching
  const [isFetchingData, setIsFetchingData] = useState(false);

  // Initialize token from memory on mount
  useEffect(() => {
    getAccessToken().then((token) => {
      setAccessToken(token);
      if (token) {
        setGoogleUser(getGoogleUser());
        loadDriveFiles(token);
      }
    });
  }, []);

  const handleSignIn = async () => {
    setIsAuthenticating(true);
    try {
      const res = await googleSignIn();
      if (res) {
        setAccessToken(res.accessToken);
        setGoogleUser(res.user);
        await loadDriveFiles(res.accessToken);
      }
    } catch (err: any) {
      onError(err.message || 'Google sign-in failed. Please try again.');
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleSignOut = async () => {
    await logoutGoogle();
    setAccessToken(null);
    setGoogleUser(null);
    setSpreadsheets([]);
    setSelectedFile(null);
    setSheetTabs([]);
  };

  const loadDriveFiles = async (token: string) => {
    setIsLoadingFiles(true);
    try {
      const files = await listGoogleSpreadsheets(token);
      setSpreadsheets(files);
      if (files.length > 0 && !selectedFile) {
        // Select first one by default
        handleSelectSpreadsheet(files[0], token);
      }
    } catch (err: any) {
      console.error('Error loading Google Drive spreadsheets:', err);
      onError(err.message || 'Failed to list Google Spreadsheets from Google Drive.');
    } finally {
      setIsLoadingFiles(false);
    }
  };

  const handleSelectSpreadsheet = async (file: GoogleDriveFile, tokenOverride?: string) => {
    const token = tokenOverride || accessToken;
    if (!token) return;

    setSelectedFile(file);
    setIsLoadingTabs(true);
    setSheetTabs([]);
    setSelectedTab('');

    try {
      const details = await getSpreadsheetDetails(file.id, token);
      setSheetTabs(details.sheets);
      if (details.sheets.length > 0) {
        setSelectedTab(details.sheets[0].title);
      }
    } catch (err: any) {
      onError(`Could not inspect tabs for "${file.name}": ${err.message}`);
    } finally {
      setIsLoadingTabs(false);
    }
  };

  const handleManualLookup = async () => {
    const cleanId = extractSpreadsheetId(manualInput);
    if (!cleanId) {
      onError('Please enter a valid Google Spreadsheet URL or ID.');
      return;
    }
    const token = accessToken;
    if (!token) {
      onError('Please connect your Google Account first.');
      return;
    }

    setIsLoadingTabs(true);
    try {
      const details = await getSpreadsheetDetails(cleanId, token);
      const virtualFile: GoogleDriveFile = {
        id: details.id,
        name: details.title,
        webViewLink: `https://docs.google.com/spreadsheets/d/${details.id}/edit`,
      };
      setSelectedFile(virtualFile);
      setSheetTabs(details.sheets);
      if (details.sheets.length > 0) {
        setSelectedTab(details.sheets[0].title);
      }
    } catch (err: any) {
      onError(`Failed to access spreadsheet: ${err.message}`);
    } finally {
      setIsLoadingTabs(false);
    }
  };

  const handleFetchData = async () => {
    if (!selectedFile || !selectedTab) {
      onError('Please select a spreadsheet and sheet tab.');
      return;
    }
    const token = accessToken;
    if (!token) {
      onError('Google session expired. Please reconnect.');
      return;
    }

    setIsFetchingData(true);
    try {
      const rows = await getSheetValues(selectedFile.id, selectedTab, token);
      if (!rows || rows.length === 0) {
        onError(`Sheet "${selectedTab}" contains no data rows.`);
        return;
      }
      onDataLoaded(rows, selectedTab, selectedFile.name);
    } catch (err: any) {
      onError(`Failed to read sheet data: ${err.message}`);
    } finally {
      setIsFetchingData(false);
    }
  };

  const filteredFiles = spreadsheets.filter((f) =>
    f.name.toLowerCase().includes(searchFilter.toLowerCase())
  );

  // If user is not authenticated, show official Sign In with Google UI
  if (!accessToken || !googleUser) {
    return (
      <div className="p-8 bg-slate-50 border border-slate-200 rounded-sm text-center space-y-4">
        <div className="w-14 h-14 mx-auto rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 shadow-inner">
          <FileSpreadsheet className="w-7 h-7" />
        </div>

        <div className="max-w-md mx-auto space-y-1">
          <h4 className="text-sm font-black text-slate-900 uppercase tracking-wider">
            Connect Google Sheets & Drive
          </h4>
          <p className="text-xs text-slate-600 leading-relaxed">
            Connect your Google account with permission to browse spreadsheets in your Google Drive and import assessment marks directly into VSB Result Management.
          </p>
        </div>

        <div className="pt-2 flex justify-center">
          <button
            type="button"
            onClick={handleSignIn}
            disabled={isAuthenticating}
            className="flex items-center gap-3 px-5 py-2.5 bg-white border border-slate-300 hover:border-slate-400 hover:bg-slate-50 text-slate-800 font-bold text-xs rounded-sm shadow-sm transition-all cursor-pointer disabled:opacity-50"
          >
            {/* Official Google 'G' SVG icon */}
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
                d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14-.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
              />
              <path
                fill="#34A853"
                d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
              />
            </svg>
            <span>{isAuthenticating ? 'Connecting to Google...' : 'Sign in with Google'}</span>
          </button>
        </div>

        <p className="text-[10px] text-slate-400">
          Uses secure in-memory token authentication • Permission is requested strictly for Spreadsheets & Drive
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Connected Account Banner */}
      <div className="flex flex-wrap items-center justify-between p-3 bg-emerald-50 border border-emerald-200 rounded-sm text-xs">
        <div className="flex items-center gap-2">
          {googleUser.photoURL ? (
            <img
              src={googleUser.photoURL}
              alt=""
              className="w-6 h-6 rounded-full border border-emerald-300"
            />
          ) : (
            <div className="w-6 h-6 rounded-full bg-emerald-600 text-white font-black text-[10px] flex items-center justify-center">
              G
            </div>
          )}
          <div>
            <span className="font-bold text-slate-900">{googleUser.displayName || 'Google User'}</span>
            <span className="text-slate-500 font-mono text-[11px] ml-1.5">({googleUser.email})</span>
          </div>
        </div>

        <div className="flex items-center gap-2 mt-2 sm:mt-0">
          <span className="text-[10px] bg-emerald-100 text-emerald-800 font-black px-2 py-0.5 rounded-sm">
            Google Sheets Connected
          </span>
          <button
            type="button"
            onClick={handleSignOut}
            className="text-[11px] font-bold text-slate-600 hover:text-rose-600 flex items-center gap-1 cursor-pointer"
            title="Disconnect Google Account"
          >
            <LogOut className="w-3 h-3" />
            <span>Disconnect</span>
          </button>
        </div>
      </div>

      {/* Spreadsheet Selection: Choose from Drive or Enter URL */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        
        {/* Left Column: Drive Spreadsheets List */}
        <div className="border border-slate-200 rounded-sm bg-white p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
              <FolderOpen className="w-3.5 h-3.5 text-emerald-600" />
              Spreadsheets in Drive
            </span>
            <button
              type="button"
              onClick={() => accessToken && loadDriveFiles(accessToken)}
              disabled={isLoadingFiles}
              className="p-1 text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
              title="Refresh Google Drive files"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingFiles ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {/* Search Box */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
            <input
              type="text"
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              placeholder="Search spreadsheets..."
              className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-sm text-xs font-medium focus:outline-none focus:border-amber-500 focus:bg-white"
            />
          </div>

          {/* Files List */}
          <div className="max-h-48 overflow-y-auto divide-y divide-slate-100 border border-slate-100 rounded-sm">
            {isLoadingFiles ? (
              <div className="p-4 text-center text-xs text-slate-500">
                <RefreshCw className="w-4 h-4 animate-spin mx-auto mb-1 text-emerald-600" />
                Loading Drive spreadsheets...
              </div>
            ) : filteredFiles.length === 0 ? (
              <div className="p-4 text-center text-xs text-slate-400">
                No Google Spreadsheets found in Drive.
              </div>
            ) : (
              filteredFiles.map((file) => {
                const isChosen = selectedFile?.id === file.id;
                return (
                  <button
                    key={file.id}
                    type="button"
                    onClick={() => handleSelectSpreadsheet(file)}
                    className={`w-full text-left p-2.5 text-xs transition-colors flex items-center justify-between cursor-pointer ${
                      isChosen
                        ? 'bg-emerald-50 text-emerald-950 font-bold'
                        : 'hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div className="truncate pr-2">
                      <div className="truncate font-bold flex items-center gap-1.5">
                        <FileSpreadsheet className={`w-3.5 h-3.5 shrink-0 ${isChosen ? 'text-emerald-700' : 'text-slate-400'}`} />
                        <span className="truncate">{file.name}</span>
                      </div>
                      {file.modifiedTime && (
                        <span className="text-[10px] text-slate-400 block ml-5">
                          Modified: {new Date(file.modifiedTime).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                    {isChosen && (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Paste Sheet Link / Select Sheet Tab */}
        <div className="border border-slate-200 rounded-sm bg-white p-3 space-y-3 flex flex-col justify-between">
          <div className="space-y-3">
            <div>
              <label className="block text-[11px] font-black uppercase tracking-wider text-slate-700 mb-1">
                Or Enter Google Sheet URL / ID
              </label>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={manualInput}
                  onChange={(e) => setManualInput(e.target.value)}
                  placeholder="https://docs.google.com/spreadsheets/d/..."
                  className="flex-1 px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-sm text-xs font-mono focus:outline-none focus:border-amber-500 focus:bg-white"
                />
                <button
                  type="button"
                  onClick={handleManualLookup}
                  disabled={isLoadingTabs || !manualInput}
                  className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs uppercase tracking-wider rounded-sm disabled:opacity-50 cursor-pointer"
                >
                  Lookup
                </button>
              </div>
            </div>

            {/* Selected File Details */}
            {selectedFile && (
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-sm space-y-2">
                <div className="flex items-center justify-between">
                  <div className="truncate pr-2">
                    <span className="text-[10px] font-black uppercase text-slate-500 block">Selected File</span>
                    <strong className="text-xs font-black text-slate-900 truncate block">
                      {selectedFile.name}
                    </strong>
                  </div>
                  {selectedFile.webViewLink && (
                    <a
                      href={selectedFile.webViewLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-slate-500 hover:text-emerald-700 p-1"
                      title="Open in Google Sheets"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>

                {/* Sheet Tab Picker */}
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-slate-700 mb-1 flex items-center gap-1">
                    <Layers className="w-3 h-3 text-slate-500" />
                    Select Sheet Tab *
                  </label>
                  {isLoadingTabs ? (
                    <div className="text-[11px] text-slate-500 flex items-center gap-1 py-1">
                      <RefreshCw className="w-3 h-3 animate-spin text-emerald-600" />
                      Loading sheet tabs...
                    </div>
                  ) : sheetTabs.length === 0 ? (
                    <p className="text-[11px] text-slate-400">No sheet tabs found.</p>
                  ) : (
                    <select
                      value={selectedTab}
                      onChange={(e) => setSelectedTab(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-sm text-xs font-bold text-slate-900 focus:outline-none focus:border-amber-500"
                    >
                      {sheetTabs.map((tab) => (
                        <option key={tab.sheetId} value={tab.title}>
                          {tab.title} {tab.rowCount ? `(${tab.rowCount} rows)` : ''}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Action button */}
          <button
            type="button"
            onClick={handleFetchData}
            disabled={!selectedFile || !selectedTab || isFetchingData}
            className="w-full py-2.5 px-4 bg-emerald-700 hover:bg-emerald-800 text-white font-black text-xs uppercase tracking-wider rounded-sm shadow-sm flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
          >
            {isFetchingData ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin text-emerald-200" />
                <span>Reading Sheet Rows...</span>
              </>
            ) : (
              <>
                <FileSpreadsheet className="w-4 h-4 text-emerald-200" />
                <span>Load Data From Sheet</span>
                <ArrowRight className="w-3.5 h-3.5 ml-1" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
