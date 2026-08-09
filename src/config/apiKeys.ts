export interface ApiKeyConfig {
  id: string;
  key: string;
  name: string;
  role: 'admin' | 'hod' | 'staff' | 'system';
  department: string;
  scopes: string[];
  status: 'active' | 'revoked';
  createdAt: string;
  lastUsedAt?: string;
  description: string;
}

// 8 Pre-generated, secure API keys attached directly within the codebase
export const INITIAL_API_KEYS: ApiKeyConfig[] = [
  {
    id: 'key-vsb-01',
    key: 'vsb_live_sk_7f8a9b2c1d3e4f5a6b7c8d9e0f1a2b3c',
    name: 'Main SMS Gateway Primary Key',
    role: 'admin',
    department: 'ALL',
    scopes: ['sms:send', 'results:read', 'results:write', 'students:read', 'parents:read', 'templates:manage'],
    status: 'active',
    createdAt: '2026-08-01T00:00:00.000Z',
    lastUsedAt: '2026-08-08T22:15:00.000Z',
    description: 'System master key for automated SMS broadcasting and Fast2SMS carrier integration.',
  },
  {
    id: 'key-vsb-02',
    key: 'vsb_live_sk_9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d',
    name: 'Exam Result Auto-Dispatcher Key',
    role: 'admin',
    department: 'EXAM_CELL',
    scopes: ['results:read', 'results:write', 'sms:send', 'reports:read'],
    status: 'active',
    createdAt: '2026-08-02T10:30:00.000Z',
    lastUsedAt: '2026-08-08T21:40:00.000Z',
    description: 'Automated service key for processing semester marksheets and triggering bulk result SMS.',
  },
  {
    id: 'key-vsb-03',
    key: 'vsb_live_sk_3c2b1a0f9e8d7c6b5a4f3e2d1c0b9a8f',
    name: 'Parent Portal Sync & Enrollment Key',
    role: 'staff',
    department: 'STUDENT_AFFAIRS',
    scopes: ['parents:read', 'parents:write', 'students:read'],
    status: 'active',
    createdAt: '2026-08-03T11:15:00.000Z',
    lastUsedAt: '2026-08-08T19:05:00.000Z',
    description: 'Used by parent enrollment kiosks to synchronize parent phone numbers and student mappings.',
  },
  {
    id: 'key-vsb-04',
    key: 'vsb_live_sk_1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d',
    name: 'Department HOD Integration Key (AIML)',
    role: 'hod',
    department: 'AIML',
    scopes: ['results:read', 'students:read', 'sms:send'],
    status: 'active',
    createdAt: '2026-08-04T09:00:00.000Z',
    lastUsedAt: '2026-08-08T18:30:00.000Z',
    description: 'Departmental key for AI & Machine Learning department head result dispatching.',
  },
  {
    id: 'key-vsb-05',
    key: 'vsb_live_sk_8f7e6d5c4b3a2f1e0d9c8b7a6f5e4d3c',
    name: 'Attendance & Circular Alert Connector',
    role: 'staff',
    department: 'ALL',
    scopes: ['sms:send', 'templates:read'],
    status: 'active',
    createdAt: '2026-08-05T14:20:00.000Z',
    lastUsedAt: '2026-08-08T20:10:00.000Z',
    description: 'Connector key for biometric attendance system alerts and urgent circular broadcasts.',
  },
  {
    id: 'key-vsb-06',
    key: 'vsb_live_sk_5d4c3b2a1f0e9d8c7b6a5f4e3d2c1b0a',
    name: 'Department HOD Integration Key (AIDS)',
    role: 'hod',
    department: 'AIDS',
    scopes: ['results:read', 'students:read', 'sms:send'],
    status: 'active',
    createdAt: '2026-08-06T08:45:00.000Z',
    lastUsedAt: '2026-08-08T15:20:00.000Z',
    description: 'Departmental key for AI & Data Science department head result dispatching.',
  },
  {
    id: 'key-vsb-07',
    key: 'vsb_live_sk_0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d',
    name: 'Student Information System (SIS) Sync Key',
    role: 'system',
    department: 'ACADEMICS',
    scopes: ['students:read', 'students:write', 'parents:read'],
    status: 'active',
    createdAt: '2026-08-07T12:00:00.000Z',
    lastUsedAt: '2026-08-08T22:00:00.000Z',
    description: 'Bi-directional sync key connecting main college server ERP to SMS database.',
  },
  {
    id: 'key-vsb-08',
    key: 'vsb_live_sk_4b3c2d1e0f9a8b7c6d5e4f3a2b1c0d9e',
    name: 'Mobile App External API Key',
    role: 'staff',
    department: 'MOBILE_SERVICES',
    scopes: ['sms:send', 'results:read', 'reports:read'],
    status: 'active',
    createdAt: '2026-08-08T10:00:00.000Z',
    lastUsedAt: '2026-08-08T22:25:00.000Z',
    description: 'Official API key used by VSBEC Mobile Staff Application for result validation.',
  },
];
