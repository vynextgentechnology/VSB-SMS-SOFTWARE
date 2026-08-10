import {
  User,
  ParentEnrollment,
  Student,
  Staff,
  Department,
  SmsLog,
  ExamBatch,
  SmsTemplate,
  GatewaySettings,
  DashboardStats,
  ActivityLog,
  UserRole,
  LoginLog,
  ApiKey,
} from '../types.js';

let currentUserId = localStorage.getItem('vy_sms_user_id') || '';
let currentToken = localStorage.getItem('vy_sms_jwt_token') || '';

export function setCurrentUserId(userId: string) {
  currentUserId = userId;
  localStorage.setItem('vy_sms_user_id', userId);
}

export function getCurrentUserId(): string {
  return currentUserId;
}

export function setAuthToken(token: string) {
  currentToken = token;
  if (token) {
    localStorage.setItem('vy_sms_jwt_token', token);
  } else {
    localStorage.removeItem('vy_sms_jwt_token');
  }
}

const baseUrl = ((import.meta as any).env?.VITE_API_BASE_URL || '').replace(/\/$/, '');

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'x-user-id': currentUserId,
    ...(options.headers as Record<string, string>),
  };

  if (currentToken) {
    headers['Authorization'] = `Bearer ${currentToken}`;
  }

  const url = endpoint.startsWith('http') ? endpoint : `${baseUrl}${endpoint}`;

  let res: Response;
  try {
    res = await fetch(url, { ...options, headers });
  } catch (netErr: any) {
    throw new Error(`Network connection error: ${netErr.message || 'Unable to connect to server'}`);
  }

  const contentType = res.headers.get('content-type') || '';
  const text = await res.text();

  let data: any;
  if (text && text.trim()) {
    try {
      data = JSON.parse(text);
    } catch (e) {
      if (!res.ok) {
        throw new Error(`Server returned non-JSON response (${res.status} ${res.statusText}) for ${endpoint}. Please check API route configuration.`);
      }
      throw new Error(`Invalid JSON returned from ${endpoint}. HTML fallback was received.`);
    }
  }

  if (!res.ok) {
    const errorMsg = data?.error || data?.message || `HTTP Error ${res.status}: ${res.statusText || 'Request failed'}`;
    throw new Error(errorMsg);
  }

  return (data ?? {}) as T;
}

export const api = {
  // Auth
  getMe: (): Promise<{ user: User }> => request<{ user: User }>('/api/auth/me'),
  logout: (): Promise<{ success: boolean }> => request<{ success: boolean }>('/api/auth/logout', { method: 'POST' }),
  getSetupStatus: (): Promise<{ hasAdmin: boolean }> => request<{ hasAdmin: boolean }>('/api/auth/setup-status'),
  setupAdmin: async (name: string, userId: string, pass: string, department: string = 'General'): Promise<{ success: boolean; token: string; user: User }> => {
    const data = await request<{ success: boolean; token: string; user: User }>('/api/auth/setup-admin', {
      method: 'POST',
      body: JSON.stringify({ name, userId, password: pass, department }),
    });
    if (data.user) {
      setCurrentUserId(data.user.userId);
    }
    if (data.token) {
      setAuthToken(data.token);
    }
    return data;
  },

  login: async (userId: string, pass: string, role: UserRole): Promise<{ success: boolean; token: string; user: User }> => {
    const data = await request<{ success: boolean; token: string; user: User }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ userId, password: pass, role }),
    });
    if (data.user) {
      setCurrentUserId(data.user.userId);
    }
    if (data.token) {
      setAuthToken(data.token);
    }
    return data;
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
  batchImportStudents: (students: Omit<Student, 'id' | 'createdAt'>[]): Promise<{ addedCount: number; skippedCount: number; total: number }> =>
    request('/api/students/batch', {
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

    const res = await fetch(`${baseUrl}/api/students/upload-excel`, {
      method: 'POST',
      headers,
      body: formData,
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to upload Excel file');
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

    const res = await fetch(`${baseUrl}/api/sms/parse-excel`, {
      method: 'POST',
      headers,
      body: formData,
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to parse Excel file');
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

    const res = await fetch(`${baseUrl}/api/sms/upload-excel-send`, {
      method: 'POST',
      headers,
      body: formData,
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to send SMS from Excel file');
    }
    return data;
  },

  getSmsReports: (): Promise<SmsLog[]> => request<SmsLog[]>('/api/sms/reports'),
  clearSmsReports: (): Promise<{ success: boolean }> => request('/api/sms/reports', { method: 'DELETE' }),

  // Exam Results
  getExamBatches: (): Promise<ExamBatch[]> => request<ExamBatch[]>('/api/results'),
  uploadExamBatch: (batch: {
    title: string;
    department: string;
    examDate?: string;
    results: any[];
  }): Promise<ExamBatch> =>
    request<ExamBatch>('/api/results', {
      method: 'POST',
      body: JSON.stringify(batch),
    }),
  sendResultSms: (batchId: string): Promise<{ success: boolean; totalCount: number; sentCount: number; failedCount: number; batch: ExamBatch }> =>
    request(`/api/results/${batchId}/send-sms`, {
      method: 'POST',
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

  // Download Complete Codebase
  downloadSourceCodeZip: async (): Promise<void> => {
    const res = await fetch('/api/download/source-code');
    if (!res.ok) throw new Error('Failed to download source code archive');
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
