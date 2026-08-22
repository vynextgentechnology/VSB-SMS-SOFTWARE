export type UserRole = 'SUPER_ADMIN' | 'admin' | 'hod' | 'staff';

export type Permission = 'send_sms' | 'upload_results' | 'manage_students' | 'manage_staff' | 'view_reports' | 'manage_settings' | 'manage_parents' | 'manage_attendance';

export interface User {
  id: string;
  userId: string;
  name: string;
  role: UserRole;
  department?: string;
  phoneNumber?: string;
  permissions: Permission[];
  createdAt: string;
}

export interface ParentEnrollment {
  id: string;
  parentName: string;
  parentPhoneNumber: string;
  studentName: string;
  registerNumber: string;
  createdAt: string;
}

export interface Student {
  id: string;
  name: string;
  registerNumber: string;
  department: string;
  year?: string;
  section?: string;
  phoneNumber: string;
  createdAt: string;
}

export interface Staff {
  id: string;
  staffId: string;
  name: string;
  department: string;
  phoneNumber: string;
  permissions: Permission[];
  createdAt: string;
}

export type MessageType = 'Exam Result' | 'Attendance Alert' | 'General Notification' | 'Custom';
export type DeliveryChannel = 'SMS' | 'WhatsApp' | 'Both';
export type DeliveryStatus = 'Sent' | 'Delivered' | 'Failed';

export interface SmsRecipient {
  studentId?: string;
  name: string;
  registerNumber: string;
  phoneNumber: string;
  department: string;
}

export interface SmsLog {
  id: string;
  recipientName: string;
  registerNumber: string;
  phoneNumber: string;
  department: string;
  messageType: MessageType;
  messageContent: string;
  channel: DeliveryChannel;
  status: DeliveryStatus;
  sentAt: string;
  sentBy: string;
  errorMessage?: string;
}

export type ResultType = 'Semester Result' | 'Internal Test / Assessment';

export interface SubjectMark {
  subjectCode: string;
  subjectName: string;
  grade?: string;
  marks: number;
  maxMarks: number;
  result: 'PASS' | 'FAIL' | 'ABSENT';
}

export interface StudentExamResult {
  sNo?: number | string;
  registerNumber: string;
  studentName: string;
  phoneNumber: string;
  department: string;
  matchedParent?: boolean;
  parentName?: string;
  subjects: SubjectMark[];
  totalMarks?: number | string;
  gpa?: string;
  overallGrade?: string;
  passedSubjectsCount?: number;
  failedSubjectsCount?: number;
  overallStatus: 'PASS' | 'FAIL' | 'WITHHELD';
  smsSent: boolean;
  smsSentAt?: string;
  smsStatus?: DeliveryStatus;
  smsErrorMessage?: string;
}

export interface ExamBatch {
  id: string;
  title: string;
  resultType?: ResultType;
  department: string;
  examDate: string;
  results: StudentExamResult[];
  uploadedAt: string;
  uploadedBy: string;
  totalStudents: number;
  passedCount?: number;
  failedCount?: number;
  passRate?: number;
  smsSentCount: number;
  matchedCount?: number;
  unmatchedCount?: number;
  detectedSubjects?: string[];
}

export interface SmsTemplate {
  id: string;
  title: string;
  type: MessageType;
  templateText: string;
  createdAt: string;
}

export interface Department {
  id: string;
  code: string;
  name: string;
  headOfDepartment?: string;
  createdAt: string;
}

export interface GatewaySettings {
  provider: 'Fast2SMS' | 'Twilio' | 'Textlocal' | 'Custom Webhook' | 'Simulated Gateway';
  fast2smsApiKey: string;
  fast2smsSenderId: string;
  fast2smsRoute: 'dlt' | 'v3' | 'otp';
  fast2smsEnabled: boolean;
  twilioAccountSid: string;
  twilioAuthToken: string;
  twilioFromNumber: string;
  whatsAppEnabled: boolean;
  whatsAppApiKey: string;
  autoSendResultSms: boolean;
  defaultSenderName: string;
}

export interface ActivityLog {
  id: string;
  action: string;
  user: string;
  details: string;
  timestamp: string;
  type: 'auth' | 'student' | 'staff' | 'sms' | 'result' | 'settings';
}

export interface LoginLog {
  id: string;
  userId: string;
  name: string;
  role: UserRole;
  department?: string;
  action: 'login' | 'logout';
  timestamp: string;
}

export interface DashboardStats {
  totalParentsEnrolled: number;
  totalStudents: number;
  totalStaff: number;
  totalSmsSent: number;
  failedSmsCount: number;
  unmatchedRecordsCount: number;
  recentActivity?: ActivityLog[];
  departmentBreakdown: { department: string; studentCount: number; smsSentCount: number }[];
  monthlySmsTrend: { date: string; sent: number; failed: number }[];
}

export interface ApiKey {
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

export type AttendanceStatus = 'PRESENT' | 'ABSENT';

export interface AttendanceRecord {
  studentId?: string;
  registerNumber: string;
  studentName: string;
  department: string;
  status: AttendanceStatus;
  parentMobile?: string;
  parentName?: string;
  parentMatched: boolean;
  smsSent: boolean;
  smsSentAt?: string;
  smsStatus?: 'Sent' | 'Failed' | 'Pending';
  smsErrorMessage?: string;
}

export interface AttendanceSession {
  id: string;
  title?: string;
  department: string;
  date: string; // Format: YYYY-MM-DD
  academicGroup: string; // e.g. Class, Section, or Subject name
  section?: string;
  sessionType?: string; // 'Full Day' | 'FN' | 'AN' | 'Lecture' | 'Lab' | 'Assessment'
  records: AttendanceRecord[];
  totalStudents: number;
  presentCount: number;
  absentCount: number;
  smsSentCount: number;
  takenBy: string;
  takenByName: string;
  takenByRole: string;
  createdAt: string;
  updatedAt?: string;
}


