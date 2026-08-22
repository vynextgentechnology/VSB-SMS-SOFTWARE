import {
  User,
  ParentEnrollment,
  Student,
  Staff,
  Department,
  SmsLog,
  ExamBatch,
  ResultType,
  SmsTemplate,
  GatewaySettings,
  DashboardStats,
  ActivityLog,
  UserRole,
  LoginLog,
  ApiKey,
  AttendanceSession,
  AttendanceRecord,
  AttendanceStatus,
} from '../types.js';

let currentUserId = localStorage.getItem('vy_sms_user_id') || '';
let currentToken = localStorage.getItem('vy_sms_jwt_token') || '';

export function setCurrentUserId(userId: string) {
  currentUserId = userId;
  if (userId) {
    localStorage.setItem('vy_sms_user_id', userId);
  } else {
    localStorage.removeItem('vy_sms_user_id');
  }
}

export function getCurrentUserId(): string {
  return currentUserId || localStorage.getItem('vy_sms_user_id') || '';
}

export function setAuthToken(token: string) {
  currentToken = token;
  if (token) {
    localStorage.setItem('vy_sms_jwt_token', token);
  } else {
    localStorage.removeItem('vy_sms_jwt_token');
  }
}

export function getAuthToken(): string {
  return currentToken || localStorage.getItem('vy_sms_jwt_token') || '';
}

export function normalizeUser(rawUser: any): User {
  if (!rawUser) return rawUser;
  const rawRole = (rawUser.role || 'staff').toString().trim().toLowerCase();
  let role: UserRole = 'staff';
  if (rawRole === 'super_admin') {
    role = 'SUPER_ADMIN';
  } else if (rawRole === 'admin') {
    role = 'admin';
  } else if (rawRole === 'hod') {
    role = 'hod';
  } else {
    role = 'staff';
  }

  return {
    id: rawUser.id || rawUser._id || `usr-${rawUser.userId || Date.now()}`,
    userId: rawUser.userId || rawUser.username || '',
    name: rawUser.name || rawUser.userId || 'User',
    role: role,
    department: rawUser.department || 'General',
    phoneNumber: rawUser.phoneNumber || '',
    permissions: Array.isArray(rawUser.permissions) ? rawUser.permissions : [],
    createdAt: rawUser.createdAt || new Date().toISOString(),
  };
}

export function formatErrorMessage(err: any): string {
  if (!err) return 'An unexpected error occurred';
  if (typeof err === 'string') return err;
  if (err instanceof Error) return err.message;
  if (err?.message && typeof err.message === 'string') return err.message;
  if (err?.error && typeof err.error === 'string') return err.error;
  if (err?.response?.data?.message && typeof err.response.data.message === 'string') return err.response.data.message;
  if (err?.response?.data?.error && typeof err.response.data.error === 'string') return err.response.data.error;
  if (err?.response?.data && typeof err.response.data === 'string') return err.response.data;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

const baseUrl = ((import.meta as any).env?.VITE_API_BASE_URL || (import.meta as any).env?.VITE_API_URL || '').replace(/\/$/, '');

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const userId = getCurrentUserId();
  const token = getAuthToken();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'x-user-id': userId,
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const url = endpoint.startsWith('http') ? endpoint : `${baseUrl}${endpoint}`;

  let res: Response;
  try {
    res = await fetch(url, { ...options, headers });
  } catch (netErr: any) {
    console.error('Fetch error:', netErr);
    throw new Error(`Network connection error: ${netErr.message || 'Unable to connect to server'}`);
  }

  const contentType = res.headers.get('content-type') || '';
  const text = await res.text();

  let data: any;
  if (text && text.trim()) {
    try {
      data = JSON.parse(text);
    } catch (e) {
      console.error(`Non-JSON response from ${endpoint} (${res.status} ${res.statusText}):`, text.slice(0, 300));
      if (contentType.includes('text/html') || text.includes('<!DOCTYPE html>') || text.includes('<html')) {
        throw new Error(`Received HTML response instead of JSON from ${endpoint} (HTTP ${res.status}). Ensure backend API route is registered and Vercel route is not rewriting /api/* to index.html.`);
      }
      if (!res.ok) {
        throw new Error(`Server error (${res.status} ${res.statusText}) for ${endpoint}.`);
      }
      throw new Error(`Invalid JSON returned from ${endpoint} (HTTP ${res.status}).`);
    }
  }

  if (!res.ok) {
    console.error('API Error response data:', data);
    const errorMsg = formatErrorMessage(data) || `HTTP Error ${res.status}: ${res.statusText || 'Request failed'}`;
    throw new Error(errorMsg);
  }

  return (data ?? {}) as T;
}

export const api = {
  // Auth
  getMe: async (): Promise<{ user: User }> => {
    const data = await request<{ user: User }>('/api/auth/me');
    return { ...data, user: normalizeUser(data.user) };
  },
  logout: (): Promise<{ success: boolean }> => request<{ success: boolean }>('/api/auth/logout', { method: 'POST' }),
  getSetupStatus: (): Promise<{ hasAdmin: boolean }> => request<{ hasAdmin: boolean }>('/api/auth/setup-status'),
  setupAdmin: async (name: string, userId: string, pass: string, department: string = 'General'): Promise<{ success: boolean; token: string; user: User }> => {
    const data = await request<{ success: boolean; token: string; user: User }>('/api/auth/setup-admin', {
      method: 'POST',
      body: JSON.stringify({ name, userId, password: pass, department }),
    });
    if (data.user) {
      setCurrentUserId(data.user.userId || data.user.id);
    }
    if (data.token) {
      setAuthToken(data.token);
    }
    return { ...data, user: normalizeUser(data.user) };
  },

  login: async (userId: string, pass: string, role?: UserRole): Promise<{ success: boolean; token: string; user: User }> => {
    const data = await request<{ success: boolean; token: string; user: User }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ userId, password: pass, ...(role ? { role } : {}) }),
    });
    if (data.user) {
      setCurrentUserId(data.user.userId || data.user.id);
    }
    if (data.token) {
      setAuthToken(data.token);
    }
    return { ...data, user: normalizeUser(data.user) };
  },

  // Dashboard Stats
  getDashboardStats: (): Promise<DashboardStats> => request<DashboardStats>('/api/dashboard/stats'),

  // Parent Enrollment
  getParents: (): Promise<ParentEnrollment[]> => request<ParentEnrollment[]>('/api/parents'),
  addParent: (parent: Omit<ParentEnrollment, 'id' | 'createdAt'>): Promise<ParentEnrollment> =>
    request<ParentEnrollment>('/api/parents', {
      method: 'POST',
      body: JSON.stringify(parent),
    }),
  batchImportParents: (parents: Omit<ParentEnrollment, 'id' | 'createdAt'>[]): Promise<{ addedCount: number; skippedCount: number; total: number }> =>
    request('/api/parents/batch-import', {
      method: 'POST',
      body: JSON.stringify({ parents }),
    }),
  deleteParent: (id: string): Promise<{ success: boolean }> =>
    request(`/api/parents/${id}`, { method: 'DELETE' }),

  // Users & Role Management
  getUsers: (): Promise<User[]> => request<User[]>('/api/users'),
  addUser: (userData: { userId: string; name: string; role: UserRole; department?: string; phoneNumber?: string; rawPassword?: string }): Promise<User> =>
    request<User>('/api/users', {
      method: 'POST',
      body: JSON.stringify(userData),
    }),
  updateUser: (id: string, updates: Partial<{ name: string; role: UserRole; department: string; phoneNumber: string; rawPassword: string }>): Promise<User> =>
    request<User>(`/api/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    }),
  deleteUser: (id: string): Promise<{ success: boolean }> =>
    request(`/api/users/${id}`, { method: 'DELETE' }),

  // Students
  getStudents: (): Promise<Student[]> => request<Student[]>('/api/students'),
  addStudent: (student: Omit<Student, 'id' | 'createdAt'>): Promise<Student> =>
    request<Student>('/api/students', {
      method: 'POST',
      body: JSON.stringify(student),
    }),
  batchImportStudents: (students: Omit<Student, 'id' | 'createdAt'>[]): Promise<{
    success?: boolean;
    message?: string;
    addedCount: number;
    skippedCount: number;
    total: number;
    created?: number;
    updated?: number;
    failed?: number;
  }> =>
    request('/api/students/batch', {
      method: 'POST',
      body: JSON.stringify({ students }),
    }),
  bulkImportStudents: (students: Omit<Student, 'id' | 'createdAt'>[]): Promise<{
    success: boolean;
    message: string;
    total: number;
    created: number;
    updated: number;
    failed: number;
    addedCount: number;
    skippedCount: number;
    updatedCount: number;
  }> =>
    request('/api/students/bulk-import', {
      method: 'POST',
      body: JSON.stringify({ students }),
    }),
  uploadStudentsExcel: async (file: File): Promise<{
    success: boolean;
    message: string;
    added: number;
    updated: number;
    totalParsed: number;
    parsedStudents: any[];
  }> => {
    const formData = new FormData();
    formData.append('file', file);

    const headers: Record<string, string> = {
      'x-user-id': currentUserId,
    };
    if (currentToken) {
      headers['Authorization'] = `Bearer ${currentToken}`;
    }

    const url = `${baseUrl}/api/students/upload-excel`;

    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers,
        body: formData,
      });
    } catch (netErr: any) {
      console.error('Excel Upload Fetch Error:', netErr);
      throw new Error(`API Connection Error: ${netErr.message || 'Unable to connect to server during Excel upload'}`);
    }

    const text = await res.text();
    let data: any = {};
    if (text && text.trim()) {
      try {
        data = JSON.parse(text);
      } catch (e) {
        throw new Error(`Server returned non-JSON response (${res.status} ${res.statusText}): ${text.slice(0, 200)}`);
      }
    }

    if (!res.ok) {
      throw new Error(data.error || data.message || `Upload failed with status ${res.status}`);
    }
    return data;
  },
  updateStudent: (id: string, updates: Partial<Student>): Promise<Student> =>
    request<Student>(`/api/students/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    }),
  deleteStudent: (id: string): Promise<{ success: boolean }> =>
    request(`/api/students/${id}`, { method: 'DELETE' }),

  // Departments
  getDepartments: (): Promise<Department[]> => request<Department[]>('/api/departments'),
  seedDepartments: (): Promise<{ success: boolean; message: string; departments: Department[] }> =>
    request('/api/departments/seed', { method: 'POST' }),
  addDepartment: (dept: Omit<Department, 'id' | 'createdAt'>): Promise<Department> =>
    request<Department>('/api/departments', {
      method: 'POST',
      body: JSON.stringify(dept),
    }),
  updateDepartment: (id: string, updates: Partial<Department>): Promise<Department> =>
    request<Department>(`/api/departments/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    }),
  deleteDepartment: (id: string): Promise<{ success: boolean }> =>
    request(`/api/departments/${id}`, { method: 'DELETE' }),

  // Staff
  getStaff: (): Promise<Staff[]> => request<Staff[]>('/api/staff'),
  addStaff: (staff: Omit<Staff, 'id' | 'createdAt'>): Promise<Staff> =>
    request<Staff>('/api/staff', {
      method: 'POST',
      body: JSON.stringify(staff),
    }),
  updateStaff: (id: string, updates: Partial<Staff>): Promise<Staff> =>
    request<Staff>(`/api/staff/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    }),
  deleteStaff: (id: string): Promise<{ success: boolean }> =>
    request(`/api/staff/${id}`, { method: 'DELETE' }),

  // SMS
  sendSms: (payload: {
    recipients: Array<{ name: string; registerNumber: string; phoneNumber: string; department: string }>;
    messageType: string;
    messageContent: string;
    channel?: string;
  }): Promise<{ success: boolean; totalCount: number; sentCount: number; failedCount: number; logs: SmsLog[] }> =>
    request('/api/sms/send', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getSmsKeyPoolStatus: (): Promise<{
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
  }> => request('/api/sms/keys-status'),

  rotateSmsApiKey: (): Promise<{ success: boolean; message: string; activeKeyIndex: number }> =>
    request('/api/sms/rotate-key', { method: 'POST' }),

  parseSmsExcel: async (file: File): Promise<{
    success: boolean;
    fileName: string;
    totalParsed: number;
    validCount: number;
    records: Array<{
      sNo: number;
      studentName: string;
      phoneNumber: string;
      marks: string;
      isValid: boolean;
    }>;
  }> => {
    const formData = new FormData();
    formData.append('file', file);

    const headers: Record<string, string> = {
      'x-user-id': currentUserId,
    };
    if (currentToken) {
      headers['Authorization'] = `Bearer ${currentToken}`;
    }

    let res: Response;
    try {
      res = await fetch(`${baseUrl}/api/sms/parse-excel`, {
        method: 'POST',
        headers,
        body: formData,
      });
    } catch (netErr: any) {
      console.log(netErr);
      if (netErr?.message) console.log(netErr.message);
      throw new Error(`Network error: ${netErr?.message || 'Failed to upload Excel file'}`);
    }

    const text = await res.text();
    let data: any = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { message: text || 'Invalid response from server' };
    }

    if (!res.ok) {
      console.log('Parse Excel Error Data:', data);
      const errMsg = formatErrorMessage(data) || 'Failed to parse Excel file';
      console.log(errMsg);
      throw new Error(errMsg);
    }
    return data;
  },

  sendSmsFromExcel: async (
    file: File,
    templateText: string,
    messageType: string = 'Exam Result SMS'
  ): Promise<{
    success: boolean;
    message: string;
    totalDispatched: number;
    sentCount: number;
    failedCount: number;
    staffId: string;
    logs: SmsLog[];
    keyPoolStatus: any;
  }> => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('templateText', templateText);
    formData.append('messageType', messageType);

    const headers: Record<string, string> = {
      'x-user-id': currentUserId,
    };
    if (currentToken) {
      headers['Authorization'] = `Bearer ${currentToken}`;
    }

    let res: Response;
    try {
      res = await fetch(`${baseUrl}/api/sms/upload-excel-send`, {
        method: 'POST',
        headers,
        body: formData,
      });
    } catch (netErr: any) {
      console.log(netErr);
      if (netErr?.message) console.log(netErr.message);
      throw new Error(`Network error: ${netErr?.message || 'Failed to send SMS from Excel file'}`);
    }

    const text = await res.text();
    let data: any = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { message: text || 'Invalid response from server' };
    }

    if (!res.ok) {
      console.log('Send SMS Excel Error Data:', data);
      const errMsg = formatErrorMessage(data) || 'Failed to send SMS from Excel file';
      console.log(errMsg);
      throw new Error(errMsg);
    }
    return data;
  },

  getSmsReports: (): Promise<SmsLog[]> => request<SmsLog[]>('/api/sms/reports'),
  clearSmsReports: (): Promise<{ success: boolean }> => request('/api/sms/reports', { method: 'DELETE' }),
  getSmsExcelReportUrl: (params?: {
    batch?: string;
    department?: string;
    date?: string;
    type?: string;
    status?: string;
    search?: string;
    regNo?: string;
    student?: string;
  }): string => {
    const query = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        if (v && v !== 'ALL') query.append(k, v);
      });
    }
    const qStr = query.toString();
    return `${baseUrl}/api/reports/sms-excel${qStr ? `?${qStr}` : ''}`;
  },

  // Exam Results
  getExamBatches: (): Promise<ExamBatch[]> => request<ExamBatch[]>('/api/results'),
  getExamBatchById: (batchId: string): Promise<ExamBatch> => request<ExamBatch>(`/api/results/${batchId}`),
  getExamBatchReport: (batchId: string): Promise<any> => request<any>(`/api/results/${batchId}/report`),
  getExamBatchStudents: (batchId: string): Promise<any[]> => request<any[]>(`/api/results/${batchId}/students`),
  uploadExamBatch: (batch: {
    title: string;
    resultType?: ResultType;
    department: string;
    examDate?: string;
    results: any[];
  }): Promise<ExamBatch> =>
    request<ExamBatch>('/api/results', {
      method: 'POST',
      body: JSON.stringify(batch),
    }),
  updateExamBatch: (batchId: string, updates: Partial<ExamBatch>): Promise<ExamBatch> =>
    request<ExamBatch>(`/api/results/${batchId}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    }),
  sendResultSms: (batchId: string, targetRegNos?: string[]): Promise<{ success: boolean; totalCount: number; sentCount: number; failedCount: number; batch: ExamBatch }> =>
    request(`/api/results/${batchId}/send-sms`, {
      method: 'POST',
      body: JSON.stringify({ targetRegNos }),
    }),
  deleteExamBatch: (batchId: string): Promise<{ success: boolean; message?: string }> =>
    request<{ success: boolean; message?: string }>(`/api/results/${batchId}`, {
      method: 'DELETE',
    }),

  // Attendance & Absent SMS Methods
  getEnrolledStudentsForAttendance: (department?: string): Promise<Array<{
    id: string;
    registerNumber: string;
    name: string;
    department: string;
    year?: string;
    section?: string;
    parentName?: string;
    parentMobile: string;
    parentMatched: boolean;
  }>> => {
    const q = department && department !== 'ALL' ? `?department=${encodeURIComponent(department)}` : '';
    return request(`/api/attendance/enrolled-students${q}`);
  },

  getAttendanceSessions: (department?: string, date?: string): Promise<AttendanceSession[]> => {
    const params = new URLSearchParams();
    if (department && department !== 'ALL') params.append('department', department);
    if (date) params.append('date', date);
    const qs = params.toString() ? `?${params.toString()}` : '';
    return request<AttendanceSession[]>(`/api/attendance${qs}`);
  },

  getAttendanceSessionById: (id: string): Promise<AttendanceSession> =>
    request<AttendanceSession>(`/api/attendance/${id}`),

  uploadAttendanceExcel: async (file: File): Promise<{
    success: boolean;
    totalRows: number;
    presentCount: number;
    absentCount: number;
    parentMatchedCount: number;
    parentMissingCount: number;
    records: AttendanceRecord[];
  }> => {
    const formData = new FormData();
    formData.append('file', file);

    const headers: Record<string, string> = {
      'x-user-id': currentUserId,
    };
    if (currentToken) {
      headers['Authorization'] = `Bearer ${currentToken}`;
    }

    const url = `${baseUrl}/api/attendance/upload-excel`;

    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers,
        body: formData,
      });
    } catch (netErr: any) {
      console.error('Attendance Excel Upload Fetch Error:', netErr);
      throw new Error(`API Connection Error: ${netErr.message || 'Unable to connect to server during Excel upload'}`);
    }

    const text = await res.text();
    let data: any = {};
    if (text && text.trim()) {
      try {
        data = JSON.parse(text);
      } catch (e) {
        throw new Error(`Server returned non-JSON response (${res.status} ${res.statusText}): ${text.slice(0, 200)}`);
      }
    }

    if (!res.ok) {
      throw new Error(data.error || data.message || `Upload failed with status ${res.status}`);
    }
    return data;
  },

  saveAttendanceSession: (sessionData: {
    department: string;
    date: string;
    academicGroup: string;
    section?: string;
    sessionType?: string;
    title?: string;
    records: Array<{
      studentId?: string;
      registerNumber: string;
      studentName?: string;
      status: AttendanceStatus;
      department?: string;
    }>;
  }): Promise<AttendanceSession> =>
    request<AttendanceSession>('/api/attendance', {
      method: 'POST',
      body: JSON.stringify(sessionData),
    }),

  updateAttendanceSession: (id: string, records: AttendanceRecord[]): Promise<AttendanceSession> =>
    request<AttendanceSession>(`/api/attendance/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ records }),
    }),

  deleteAttendanceSession: (id: string): Promise<{ success: boolean; message?: string }> =>
    request<{ success: boolean; message?: string }>(`/api/attendance/${id}`, {
      method: 'DELETE',
    }),

  sendAbsentParentSms: (
    sessionId: string,
    targetRegNos?: string[],
    customTemplate?: string,
    forceResend?: boolean
  ): Promise<{
    success: boolean;
    totalAbsent: number;
    sentCount: number;
    failedCount: number;
    skippedCount: number;
    session: AttendanceSession;
    logs: SmsLog[];
  }> =>
    request(`/api/attendance/${sessionId}/send-absent-sms`, {
      method: 'POST',
      body: JSON.stringify({ targetRegNos, customTemplate, forceResend }),
    }),

  // Templates
  getTemplates: (): Promise<SmsTemplate[]> => request<SmsTemplate[]>('/api/templates'),
  addTemplate: (tpl: Omit<SmsTemplate, 'id' | 'createdAt'>): Promise<SmsTemplate> =>
    request<SmsTemplate>('/api/templates', {
      method: 'POST',
      body: JSON.stringify(tpl),
    }),
  updateTemplate: (id: string, updates: Partial<SmsTemplate>): Promise<SmsTemplate> =>
    request<SmsTemplate>(`/api/templates/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    }),
  deleteTemplate: (id: string): Promise<{ success: boolean }> =>
    request(`/api/templates/${id}`, { method: 'DELETE' }),

  // Settings
  getSettings: (): Promise<GatewaySettings> => request<GatewaySettings>('/api/settings'),
  saveSettings: (settings: GatewaySettings): Promise<{ success: boolean; settings: GatewaySettings }> =>
    request('/api/settings', {
      method: 'POST',
      body: JSON.stringify(settings),
    }),

  // Activity Logs & Login History
  getActivityLogs: (): Promise<ActivityLog[]> => request<ActivityLog[]>('/api/activity-logs'),
  getLoginHistory: (): Promise<LoginLog[]> => request<LoginLog[]>('/api/login-history'),

  // Gemini AI
  getGeminiStatus: (): Promise<{ configured: boolean; keyName: string; model: string }> =>
    request('/api/gemini/status'),
  generateGeminiContent: (prompt: string, systemInstruction?: string): Promise<{ success: boolean; response: string }> =>
    request('/api/gemini/generate', {
      method: 'POST',
      body: JSON.stringify({ prompt, systemInstruction }),
    }),

  // API Keys Management
  getApiKeys: (): Promise<ApiKey[]> => request<ApiKey[]>('/api/keys'),
  createApiKey: (data: { name: string; role?: 'admin' | 'hod' | 'staff' | 'system'; department?: string; scopes?: string[]; description?: string }): Promise<ApiKey> =>
    request<ApiKey>('/api/keys', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  toggleApiKey: (id: string): Promise<ApiKey> => request<ApiKey>(`/api/keys/${id}/toggle`, { method: 'PATCH' }),
  deleteApiKey: (id: string): Promise<{ success: boolean }> => request<{ success: boolean }>(`/api/keys/${id}`, { method: 'DELETE' }),

  getDbStatus: (): Promise<{ connected: boolean; configured: boolean; lastError: string | null; inCoolDown: boolean }> =>
    request<{ connected: boolean; configured: boolean; lastError: string | null; inCoolDown: boolean }>('/api/db/status'),

  // Download Complete Codebase
  downloadSourceCodeZip: async (): Promise<void> => {
    let res: Response;
    try {
      res = await fetch(`${baseUrl}/api/download/source-code`);
    } catch (netErr: any) {
      console.log(netErr);
      if (netErr?.message) console.log(netErr.message);
      throw new Error(`Network error: ${netErr?.message || 'Failed to download source code archive'}`);
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      let data: any = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        data = { message: text || 'Failed to download source code archive' };
      }
      const errMsg = formatErrorMessage(data) || 'Failed to download source code archive';
      console.log(errMsg);
      throw new Error(errMsg);
    }

    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'vsbec_sms_management_system.zip';
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  },
};
