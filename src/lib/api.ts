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

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-user-id': currentUserId,
    ...(options.headers as Record<string, string>),
  };

  if (currentToken) {
    headers['Authorization'] = `Bearer ${currentToken}`;
  }

  const res = await fetch(endpoint, { ...options, headers });
  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error || 'Invalid credentials or wrong role');
  }

  return data as T;
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

  // Student Excel File Upload
  uploadStudentsExcel: async (file: File): Promise<{ success: boolean; message: string; added: number; updated: number }> => {
    const formData = new FormData();
    formData.append('file', file);
    const token = localStorage.getItem('vbs_auth_token');
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const response = await fetch('/api/students/upload-excel', {
      method: 'POST',
      headers,
      body: formData,
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: 'Upload failed' }));
      throw new Error(err.error || 'Failed to upload Excel file');
    }

    return response.json();
  },

  // Gemini AI
  getGeminiStatus: (): Promise<{ configured: boolean; keyName: string; model: string }> =>
    request('/api/gemini/status'),
  generateGeminiContent: (prompt: string, systemInstruction?: string): Promise<{ success: boolean; response: string }> =>
    request('/api/gemini/generate', {
      method: 'POST',
      body: JSON.stringify({ prompt, systemInstruction }),
    }),
};
