import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import {
  User,
  UserRole,
  ParentEnrollment,
  Student,
  Staff,
  Department,
  Permission,
  SmsLog,
  MessageType,
  DeliveryChannel,
  ExamBatch,
  ResultType,
  SmsTemplate,
  GatewaySettings,
  ActivityLog,
  LoginLog,
  ApiKey,
  DeliveryStatus,
  AttendanceSession,
  AttendanceRecord,
  AttendanceStatus,
} from '../types.js';
import { evaluateSubjectGrade } from '../utils/gradeEvaluator.js';
import { INITIAL_API_KEYS } from '../config/apiKeys.js';
import { isMongoDBConnected, connectToMongoDB } from './mongo.js';
import { ExamBatchModel } from '../models/ExamBatch.js';
import { SmsLogModel } from '../models/SmsLog.js';
import { StudentModel } from '../models/Student.js';
import { UserModel } from '../models/User.js';
import { DepartmentModel } from '../models/Department.js';
import { StaffModel } from '../models/Staff.js';
import { AttendanceModel } from '../models/Attendance.js';

const isVercel = Boolean(process.env.VERCEL || process.env.NOW_REGION);
const DATA_DIR = isVercel ? '/tmp/data' : path.join(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'sms_system.json');

interface DatabaseSchema {
  users: Array<User & { passwordHash?: string; rawPassword?: string }>;
  parentEnrollments: ParentEnrollment[];
  students: Student[];
  staff: Staff[];
  departments: Department[];
  smsLogs: SmsLog[];
  examBatches: ExamBatch[];
  attendanceSessions: AttendanceSession[];
  smsTemplates: SmsTemplate[];
  settings: GatewaySettings;
  activityLogs: ActivityLog[];
  loginLogs: LoginLog[];
  apiKeys: ApiKey[];
}

const defaultDepartments: Department[] = [
  { id: 'dept-aiml', code: 'AIML', name: 'Artificial Intelligence & Machine Learning', headOfDepartment: 'Dr. A. Ramesh', createdAt: new Date().toISOString() },
  { id: 'dept-aids', code: 'AIDS', name: 'Artificial Intelligence & Data Science', headOfDepartment: 'Dr. S. Karthik', createdAt: new Date().toISOString() },
  { id: 'dept-cse', code: 'CSE', name: 'Computer Science & Engineering', headOfDepartment: 'Dr. R. Sharma', createdAt: new Date().toISOString() },
  { id: 'dept-cce', code: 'CCE', name: 'Computer & Communication Engineering', headOfDepartment: 'Dr. V. Lakshmi', createdAt: new Date().toISOString() },
  { id: 'dept-ece', code: 'ECE', name: 'Electronics & Communication Engineering', headOfDepartment: 'Dr. S. Priya', createdAt: new Date().toISOString() },
  { id: 'dept-eee', code: 'EEE', name: 'Electrical & Electronics Engineering', headOfDepartment: 'Dr. M. Kumar', createdAt: new Date().toISOString() },
  { id: 'dept-mech', code: 'MECH', name: 'Mechanical Engineering', headOfDepartment: 'Dr. K. Arumugam', createdAt: new Date().toISOString() },
  { id: 'dept-csbs', code: 'CSBS', name: 'Computer Science & Business Systems', headOfDepartment: 'Dr. P. Venkatesh', createdAt: new Date().toISOString() },
  { id: 'dept-chemical', code: 'CHEMICAL', name: 'Chemical Engineering', headOfDepartment: 'Dr. N. Sundaram', createdAt: new Date().toISOString() },
  { id: 'dept-civil', code: 'CIVIL', name: 'Civil Engineering', headOfDepartment: 'Dr. G. Moorthy', createdAt: new Date().toISOString() },
];

const defaultSettings: GatewaySettings = {
  provider: 'Fast2SMS',
  fast2smsApiKey: '',
  fast2smsSenderId: 'VSBEC',
  fast2smsRoute: 'dlt',
  fast2smsEnabled: true,
  twilioAccountSid: '',
  twilioAuthToken: '',
  twilioFromNumber: '+18005550199',
  whatsAppEnabled: false,
  whatsAppApiKey: '',
  autoSendResultSms: false,
  defaultSenderName: 'VSBEC VY NEXTGEN',
};

const defaultTemplates: SmsTemplate[] = [
  {
    id: 'tpl-1',
    title: 'Exam Result Notification',
    type: 'Exam Result',
    templateText: 'DEAR PARENT,\n\nName: {name}\n\nRegister Number: {regNo}\n\n{subjects}\n\nTotal Number of Arrears: {arrearsCount}',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'tpl-2',
    title: 'Attendance Alert',
    type: 'Attendance Alert',
    templateText: 'Alert: Student {name} ({regNo}), Dept: {department} has overall attendance of {attendance}% as of {date}. Please ensure regular attendance. - VY NEXTGEN',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'tpl-3',
    title: 'General Circular',
    type: 'General Notification',
    templateText: 'Notice: Dear Student {name} ({regNo}), {messageText}. Issued on {date} by VY NEXTGEN TECHNOLOGY.',
    createdAt: new Date().toISOString(),
  },
];

class Database {
  private data: DatabaseSchema;

  constructor() {
    this.ensureDirectory();
    this.data = this.loadData();
    this.seedDefaultDepartments();
    this.ensureSuperAdminUser();
  }

  public ensureSuperAdminUser() {
    const superUserId = 'VYNEXTGEN';
    let superAdmin = this.data.users.find((u) => u.userId.toUpperCase() === superUserId);
    const hashedPass = bcrypt.hashSync('VSBSMS', 10);

    if (!superAdmin) {
      superAdmin = {
        id: 'usr-super-admin-01',
        userId: 'VYNEXTGEN',
        name: 'Super Administrator',
        role: 'SUPER_ADMIN' as UserRole,
        department: 'ALL',
        phoneNumber: '',
        passwordHash: hashedPass,
        permissions: ['send_sms', 'upload_results', 'manage_students', 'manage_staff', 'view_reports', 'manage_settings', 'manage_parents'],
        createdAt: new Date().toISOString(),
      };
      this.data.users.unshift(superAdmin);
      this.save();
    } else {
      superAdmin.role = 'SUPER_ADMIN' as UserRole;
      let validPass = false;
      if (superAdmin.passwordHash) {
        try {
          validPass = bcrypt.compareSync('VSBSMS', superAdmin.passwordHash);
        } catch {
          validPass = false;
        }
      }
      if (!validPass) {
        superAdmin.passwordHash = hashedPass;
        this.save();
      }
    }
  }

  public seedDefaultDepartments() {
    if (!this.data.departments || this.data.departments.length === 0) {
      this.data.departments = [...defaultDepartments];
      this.addActivity('settings', 'Default Seeder Executed', 'Seeded 10 default academic departments (AIML, AIDS, CSE, CCE, ECE, EEE, MECH, CSBS, CHEMICAL, CIVIL)', 'VSBEC');
      this.save();
    } else {
      let addedCount = 0;
      for (const defaultDept of defaultDepartments) {
        const exists = this.data.departments.some(
          (d) => d.code.toUpperCase() === defaultDept.code.toUpperCase()
        );
        if (!exists) {
          this.data.departments.push(defaultDept);
          addedCount++;
        }
      }
      if (addedCount > 0) {
        this.addActivity('settings', 'Department Migration', `Auto-inserted ${addedCount} missing default departments into database`, 'VSBEC');
        this.save();
      }
    }
  }

  private ensureDirectory() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
    } catch (err) {
      console.warn('Directory creation warning:', err);
    }
  }

  private loadData(): DatabaseSchema {
    try {
      if (fs.existsSync(DB_FILE)) {
        const fileContent = fs.readFileSync(DB_FILE, 'utf-8');
        const parsed = JSON.parse(fileContent);
        return {
          users: parsed.users || [],
          parentEnrollments: parsed.parentEnrollments || [],
          students: parsed.students || [],
          staff: parsed.staff || [],
          departments: parsed.departments && parsed.departments.length > 0 ? parsed.departments : defaultDepartments,
          smsLogs: parsed.smsLogs || [],
          examBatches: parsed.examBatches || [],
          attendanceSessions: parsed.attendanceSessions || [],
          smsTemplates: parsed.smsTemplates && parsed.smsTemplates.length > 0 ? parsed.smsTemplates : defaultTemplates,
          settings: parsed.settings ? { ...defaultSettings, ...parsed.settings } : defaultSettings,
          activityLogs: parsed.activityLogs || [],
          loginLogs: parsed.loginLogs || [],
          apiKeys: parsed.apiKeys && parsed.apiKeys.length > 0 ? parsed.apiKeys : INITIAL_API_KEYS,
        };
      }
    } catch (err) {
      console.error('Error loading database file, initializing fresh:', err);
    }

    return {
      users: [],
      parentEnrollments: [],
      students: [],
      staff: [],
      departments: defaultDepartments,
      smsLogs: [],
      examBatches: [],
      attendanceSessions: [],
      smsTemplates: defaultTemplates,
      settings: defaultSettings,
      activityLogs: [],
      loginLogs: [],
      apiKeys: INITIAL_API_KEYS,
    };
  }

  public save() {
    try {
      this.ensureDirectory();
      fs.writeFileSync(DB_FILE, JSON.stringify(this.data, null, 2), 'utf-8');
    } catch (err) {
      console.error('Error saving database:', err);
    }
  }

  public hasAdmin(): boolean {
    return this.data.users.some((u) => u.role === 'admin');
  }

  public getUserByUserId(userId: string): User | null {
    if (!userId) return null;
    const cleanUserId = userId.trim().toUpperCase();
    const found = this.data.users.find(
      (u) => u.userId.toUpperCase() === cleanUserId
    );
    if (!found) return null;
    const { rawPassword, passwordHash, ...safeUser } = found;
    return safeUser as User;
  }

  public async getUserByUserIdAsync(userId: string): Promise<User | null> {
    if (!userId) return null;
    const cleanUserId = userId.trim().toUpperCase();
    const localUser = this.getUserByUserId(cleanUserId);
    if (localUser) return localUser;

    try {
      await connectToMongoDB();
      if (isMongoDBConnected() && UserModel) {
        const mongoUser = await (UserModel as any).findOne({
          $or: [
            { userId: cleanUserId },
            { username: cleanUserId },
          ],
        }).lean();

        if (mongoUser) {
          const userObj: User = {
            id: mongoUser._id ? mongoUser._id.toString() : `usr-${mongoUser.userId}`,
            userId: mongoUser.userId || mongoUser.username,
            name: mongoUser.name || mongoUser.username,
            role: (mongoUser.role || 'staff').toLowerCase() as UserRole,
            department: mongoUser.department || 'General',
            phoneNumber: mongoUser.phoneNumber || '',
            permissions: mongoUser.permissions || ['send_sms', 'upload_results', 'manage_students'],
            createdAt: mongoUser.createdAt || new Date().toISOString(),
          };
          this.data.users.push({
            ...userObj,
            rawPassword: '',
            passwordHash: mongoUser.passwordHash || '',
          });
          this.save();
          return userObj;
        }
      }
    } catch (err) {
      console.error('[MongoDB getUserByUserIdAsync Error]:', err);
    }

    return null;
  }

  public setupInitialAdmin(name: string, userId: string, rawPassword: string, department: string = 'General'): User {
    const cleanUserId = userId.trim().toUpperCase();
    const existing = this.data.users.find((u) => u.userId.toUpperCase() === cleanUserId);

    if (existing) {
      throw new Error(`User ID "${userId}" already exists.`);
    }

    const newUser = {
      id: `usr-admin-${Date.now()}`,
      userId: cleanUserId,
      name: name.trim(),
      role: 'admin' as const,
      department: department.trim() || 'General',
      rawPassword: rawPassword.trim(),
      passwordHash: bcrypt.hashSync(rawPassword.trim(), 10),
      permissions: [
        'send_sms',
        'upload_results',
        'manage_students',
        'manage_staff',
        'view_reports',
        'manage_settings',
        'manage_parents',
      ] as Permission[],
      createdAt: new Date().toISOString(),
    };

    this.data.users.push(newUser);
    this.addActivity('auth', 'Initial Admin Setup', `Registered Admin account (${cleanUserId})`, cleanUserId);
    this.save();

    const { rawPassword: _, passwordHash: __, ...safeUser } = newUser;
    return safeUser as User;
  }

  // --- Auth Methods ---
  public authenticate(
    userId: string,
    pass: string,
    requestedRole?: string,
    jwtSecret: string = 'VSB_SECRET_KEY_2026'
  ): { user: User; token: string } | null {
    this.ensureSuperAdminUser();
    const cleanUserId = userId.trim().toUpperCase();
    const cleanRole = requestedRole ? requestedRole.trim().toLowerCase() : null;

    const found = this.data.users.find(
      (u) => u.userId.toUpperCase() === cleanUserId
    );

    if (!found) {
      return null;
    }

    // Bypass role check for SUPER_ADMIN so VYNEXTGEN can log in from any portal tab
    const isSuperAdmin = found.role === 'SUPER_ADMIN' || cleanUserId === 'VYNEXTGEN';
    if (!isSuperAdmin && cleanRole && found.role.toLowerCase() !== cleanRole) {
      return null;
    }

    // Password Verification (bcrypt + fallback)
    let isPasswordValid = false;
    if (found.passwordHash) {
      try {
        isPasswordValid = bcrypt.compareSync(pass, found.passwordHash);
      } catch (e) {
        isPasswordValid = false;
      }
    }
    if (!isPasswordValid && isSuperAdmin && pass === 'VSBSMS') {
      isPasswordValid = true;
    }
    if (!isPasswordValid && found.rawPassword) {
      isPasswordValid = (found.rawPassword === pass);
    }

    if (!isPasswordValid) {
      return null;
    }

    this.addActivity('auth', 'User Login', `Logged in as ${found.name} (${found.role.toUpperCase()})`, found.userId);
    this.addLoginLog(found.userId, found.name, found.role, found.department || 'General', 'login');
    const { rawPassword, passwordHash, ...safeUser } = found;

    // JWT Generation
    const token = jwt.sign(
      {
        id: safeUser.id,
        userId: safeUser.userId,
        name: safeUser.name,
        role: safeUser.role,
        department: safeUser.department,
      },
      jwtSecret,
      { expiresIn: '24h' }
    );

    return { user: safeUser, token };
  }

  public async authenticateAsync(
    userId: string,
    pass: string,
    requestedRole?: string,
    jwtSecret: string = 'VSB_ENGINEERING_COLLEGE_SECRET_KEY_2026'
  ): Promise<{ user: User; token: string } | null> {
    const cleanUserId = userId.trim().toUpperCase();
    const cleanRole = requestedRole ? requestedRole.trim().toLowerCase() : null;

    // 1. Check MongoDB first if connected to ensure fresh database data is always authoritative
    try {
      await connectToMongoDB();
      if (isMongoDBConnected() && UserModel) {
        const mongoUser = await (UserModel as any).findOne({
          $or: [
            { userId: cleanUserId },
            { username: cleanUserId },
          ],
        }).lean();

        if (mongoUser) {
          const userRole = (mongoUser.role || 'staff').toLowerCase();
          const isSuper = userRole === 'super_admin' || cleanUserId === 'VYNEXTGEN';
          if (!isSuper && cleanRole && userRole !== cleanRole) {
            return null;
          }

          let isPasswordValid = false;
          if (mongoUser.passwordHash) {
            try {
              isPasswordValid = bcrypt.compareSync(pass, mongoUser.passwordHash);
            } catch (e) {
              isPasswordValid = false;
            }
          }
          if (!isPasswordValid && isSuper && pass === 'VSBSMS') {
            isPasswordValid = true;
          }
          if (!isPasswordValid && mongoUser.rawPassword) {
            isPasswordValid = mongoUser.rawPassword === pass;
          }

          if (isPasswordValid) {
            const userObj: User = {
              id: mongoUser._id?.toString() || mongoUser.id || `usr-${Date.now()}`,
              userId: mongoUser.userId || cleanUserId,
              name: mongoUser.name,
              role: (mongoUser.role || 'staff') as UserRole,
              department: mongoUser.department || 'General',
              phoneNumber: mongoUser.phoneNumber || '',
              permissions: mongoUser.permissions || ['send_sms', 'view_reports'],
              createdAt: mongoUser.createdAt ? new Date(mongoUser.createdAt).toISOString() : new Date().toISOString(),
            };

            // Synchronize authoritative MongoDB state with memory
            const localIdx = this.data.users.findIndex(u => u.userId.toUpperCase() === cleanUserId);
            if (localIdx !== -1) {
              this.data.users[localIdx] = {
                ...this.data.users[localIdx],
                ...userObj,
                passwordHash: mongoUser.passwordHash || this.data.users[localIdx].passwordHash,
                rawPassword: mongoUser.rawPassword || this.data.users[localIdx].rawPassword,
              };
            } else {
              this.data.users.push({
                ...userObj,
                passwordHash: mongoUser.passwordHash,
                rawPassword: mongoUser.rawPassword || '',
              });
            }
            this.save();

            this.addActivity('auth', 'User Login', `Logged in as ${userObj.name} (${userObj.role.toUpperCase()})`, userObj.userId);
            this.addLoginLog(userObj.userId, userObj.name, userObj.role, userObj.department || 'General', 'login');

            const token = jwt.sign(
              {
                id: userObj.id,
                userId: userObj.userId,
                name: userObj.name,
                role: userObj.role,
                department: userObj.department,
              },
              jwtSecret,
              { expiresIn: '24h' }
            );

            return { user: userObj, token };
          }
        }
      }
    } catch (err) {
      console.warn('[MongoDB authenticateAsync Warning]:', err);
    }

    // 2. Fallback to local memory state
    const memoryResult = this.authenticate(userId, pass, requestedRole, jwtSecret);
    return memoryResult;
  }

  // --- Activity Logs ---
  public addActivity(type: ActivityLog['type'], action: string, details: string, user: string) {
    const log: ActivityLog = {
      id: `act-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      action,
      details,
      user,
      type,
      timestamp: new Date().toISOString(),
    };
    this.data.activityLogs.unshift(log);
    // Keep last 100 activity logs
    if (this.data.activityLogs.length > 100) {
      this.data.activityLogs = this.data.activityLogs.slice(0, 100);
    }
    this.save();
  }

  private isSuperAdminActivityLog(log: ActivityLog): boolean {
    if (!log) return false;
    const user = (log.user || '').toUpperCase();
    const details = (log.details || '').toUpperCase();
    const action = (log.action || '').toUpperCase();
    if (user === 'VYNEXTGEN' || user === 'SUPER_ADMIN' || user === 'SUPER ADMINISTRATOR') return true;
    if (details.includes('SUPER_ADMIN') || details.includes('VYNEXTGEN') || details.includes('SUPER ADMINISTRATOR')) return true;
    if (action.includes('SUPER_ADMIN') || action.includes('VYNEXTGEN')) return true;
    return false;
  }

  private isSuperAdminLoginLog(log: LoginLog): boolean {
    if (!log) return false;
    const userId = (log.userId || '').toUpperCase();
    const role = (log.role || '').toUpperCase();
    const name = (log.name || '').toUpperCase();
    if (userId === 'VYNEXTGEN' || role === 'SUPER_ADMIN' || name === 'SUPER ADMINISTRATOR' || name === 'VYNEXTGEN') return true;
    return false;
  }

  public getActivityLogs(userRole?: string): ActivityLog[] {
    const roleUpper = (userRole || '').toUpperCase();
    if (roleUpper === 'SUPER_ADMIN') {
      return this.data.activityLogs || [];
    }
    return (this.data.activityLogs || []).filter((log) => !this.isSuperAdminActivityLog(log));
  }

  // --- Login / Logout History ---
  public addLoginLog(userId: string, name: string, role: UserRole, department: string = 'General', action: 'login' | 'logout') {
    if (!this.data.loginLogs) this.data.loginLogs = [];
    const log: LoginLog = {
      id: `login-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      userId,
      name,
      role,
      department,
      action,
      timestamp: new Date().toISOString(),
    };
    this.data.loginLogs.unshift(log);
    if (this.data.loginLogs.length > 500) {
      this.data.loginLogs = this.data.loginLogs.slice(0, 500);
    }
    this.save();
  }

  public recordLogout(userId: string) {
    const user = this.data.users.find(u => u.userId.toUpperCase() === userId.trim().toUpperCase());
    if (user) {
      this.addLoginLog(user.userId, user.name, user.role, user.department || 'General', 'logout');
      this.addActivity('auth', 'User Logout', `Logged out (${user.userId})`, user.userId);
    } else {
      this.addLoginLog(userId, userId, 'staff', 'General', 'logout');
      this.addActivity('auth', 'User Logout', `Logged out (${userId})`, userId);
    }
  }

  public getLoginLogs(userRole?: string): LoginLog[] {
    const roleUpper = (userRole || '').toUpperCase();
    if (roleUpper === 'SUPER_ADMIN') {
      return this.data.loginLogs || [];
    }
    return (this.data.loginLogs || []).filter((log) => !this.isSuperAdminLoginLog(log));
  }

  // --- Parent Enrollment Methods ---
  public getParentEnrollments(): ParentEnrollment[] {
    return this.data.parentEnrollments || [];
  }

  public addParentEnrollment(
    data: Omit<ParentEnrollment, 'id' | 'createdAt'>,
    user: string
  ): ParentEnrollment {
    const regNoUpper = data.registerNumber.trim().toUpperCase();
    if (!this.data.parentEnrollments) this.data.parentEnrollments = [];

    const existing = this.data.parentEnrollments.find(
      (p) => p.registerNumber.trim().toUpperCase() === regNoUpper
    );

    if (existing) {
      throw new Error(`Parent record for Register Number ${data.registerNumber} already exists`);
    }

    const newParent: ParentEnrollment = {
      ...data,
      registerNumber: regNoUpper,
      id: `prn-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      createdAt: new Date().toISOString(),
    };

    this.data.parentEnrollments.unshift(newParent);

    // Auto sync student record
    const existingStudent = this.data.students.find(
      (s) => s.registerNumber.toUpperCase() === regNoUpper
    );
    if (!existingStudent) {
      this.data.students.unshift({
        id: `std-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        name: data.studentName,
        registerNumber: regNoUpper,
        department: 'General',
        phoneNumber: data.parentPhoneNumber,
        createdAt: new Date().toISOString(),
      });
    } else {
      existingStudent.phoneNumber = data.parentPhoneNumber;
      if (data.studentName) existingStudent.name = data.studentName;
    }

    this.addActivity(
      'student',
      'Parent Enrolled',
      `Enrolled parent ${newParent.parentName} for student ${newParent.studentName} (${newParent.registerNumber})`,
      user
    );
    this.save();
    return newParent;
  }

  public deleteParentEnrollment(id: string, user: string): boolean {
    if (!this.data.parentEnrollments) this.data.parentEnrollments = [];
    const index = this.data.parentEnrollments.findIndex((p) => p.id === id);
    if (index === -1) return false;

    const removed = this.data.parentEnrollments[index];
    this.data.parentEnrollments.splice(index, 1);
    this.addActivity(
      'student',
      'Parent Enrollment Deleted',
      `Deleted parent record for ${removed.studentName} (${removed.registerNumber})`,
      user
    );
    this.save();
    return true;
  }

  public importParentEnrollmentsBatch(parents: Omit<ParentEnrollment, 'id' | 'createdAt'>[], user: string) {
    let addedCount = 0;
    let skippedCount = 0;

    if (!this.data.parentEnrollments) this.data.parentEnrollments = [];

    for (const p of parents) {
      const regNoUpper = p.registerNumber.trim().toUpperCase();
      const exists = this.data.parentEnrollments.some(
        (existing) => existing.registerNumber.trim().toUpperCase() === regNoUpper
      );
      if (exists) {
        skippedCount++;
        continue;
      }

      const newParent: ParentEnrollment = {
        ...p,
        registerNumber: regNoUpper,
        id: `prn-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        createdAt: new Date().toISOString(),
      };
      this.data.parentEnrollments.push(newParent);

      // Auto sync student
      const existingStudent = this.data.students.find(
        (s) => s.registerNumber.toUpperCase() === regNoUpper
      );
      if (!existingStudent) {
        this.data.students.push({
          id: `std-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          name: p.studentName,
          registerNumber: regNoUpper,
          department: 'General',
          phoneNumber: p.parentPhoneNumber,
          createdAt: new Date().toISOString(),
        });
      } else {
        existingStudent.phoneNumber = p.parentPhoneNumber;
      }

      addedCount++;
    }

    this.addActivity(
      'student',
      'Batch Parent Enrollment',
      `Enrolled ${addedCount} parents (${skippedCount} duplicates skipped)`,
      user
    );
    this.save();
    return { addedCount, skippedCount, total: this.data.parentEnrollments.length };
  }

  // --- User / Role Management Methods ---
  public getUsers(): User[] {
    return this.data.users
      .filter((u) => u.role !== 'SUPER_ADMIN' && u.userId.toUpperCase() !== 'VYNEXTGEN')
      .map(({ rawPassword, passwordHash, ...user }) => user as User);
  }

  public async getUsersAsync(): Promise<User[]> {
    try {
      await connectToMongoDB();
      if (isMongoDBConnected() && UserModel) {
        const docs = await (UserModel as any).find({}).sort({ createdAt: -1 }).lean();
        if (Array.isArray(docs) && docs.length > 0) {
          const mongoUsers: Array<User & { passwordHash?: string; rawPassword?: string }> = docs.map((d: any) => ({
            id: d._id ? d._id.toString() : (d.id || `usr-${d.userId}`),
            userId: (d.userId || d.username || '').toUpperCase(),
            name: d.name || d.userId,
            role: (d.role || 'staff').toLowerCase() as UserRole,
            department: d.department || 'General',
            phoneNumber: d.phoneNumber || '',
            email: d.email || '',
            passwordHash: d.passwordHash || '',
            rawPassword: d.rawPassword || '',
            permissions: d.permissions || ['send_sms', 'view_reports'],
            createdAt: d.createdAt ? new Date(d.createdAt).toISOString() : new Date().toISOString(),
          }));

          // Retain Super Admin if defined locally
          const superAdmin = this.data.users.find(u => u.role === 'SUPER_ADMIN' || u.userId === 'VYNEXTGEN');
          const finalUsers = [...mongoUsers];
          if (superAdmin && !finalUsers.some(u => u.userId === superAdmin.userId)) {
            finalUsers.unshift(superAdmin);
          }

          this.data.users = finalUsers;
          this.save();
        }
      }
    } catch (err) {
      console.error('[MongoDB getUsersAsync Error]:', err);
    }

    return this.data.users
      .filter((u) => u.role !== 'SUPER_ADMIN' && u.userId.toUpperCase() !== 'VYNEXTGEN')
      .map(({ rawPassword, passwordHash, ...user }) => user as User);
  }

  public async addUserAsync(
    userData: {
      userId: string;
      username?: string;
      name: string;
      role: UserRole;
      department?: string;
      phoneNumber?: string;
      email?: string;
      rawPassword?: string;
      permissions?: Permission[];
    },
    user: string
  ): Promise<User> {
    const cleanUserId = (userData.userId || userData.username || '').trim().toUpperCase();
    if (!cleanUserId) {
      throw new Error('User ID / Username is required');
    }
    if (!userData.name || !userData.name.trim()) {
      throw new Error('User Name is required');
    }

    if (userData.role === 'SUPER_ADMIN' || cleanUserId === 'VYNEXTGEN') {
      throw new Error('Access Denied: Creating Super Admin accounts is strictly prohibited.');
    }

    // Check duplicate in memory
    const existing = this.data.users.find((u) => u.userId.toUpperCase() === cleanUserId);
    if (existing) {
      throw new Error(`User ID "${cleanUserId}" already exists`);
    }

    // Check duplicate in MongoDB
    try {
      await connectToMongoDB();
      if (isMongoDBConnected() && UserModel) {
        const safeRegex = cleanUserId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const existingDoc = await (UserModel as any).findOne({
          userId: { $regex: new RegExp(`^${safeRegex}$`, 'i') },
        });
        if (existingDoc) {
          throw new Error(`User ID "${cleanUserId}" already exists in MongoDB`);
        }
      }
    } catch (err: any) {
      if (err.message?.includes('already exists')) throw err;
    }

    const defaultPerms: Permission[] =
      userData.role === 'admin'
        ? ['send_sms', 'upload_results', 'manage_students', 'manage_staff', 'view_reports', 'manage_settings', 'manage_parents']
        : userData.role === 'hod'
        ? ['send_sms', 'upload_results', 'manage_students', 'manage_staff', 'view_reports', 'manage_parents']
        : ['send_sms', 'view_reports'];

    const pass = userData.rawPassword || 'VSB123';
    const passwordHash = bcrypt.hashSync(pass, 10);
    const id = `usr-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const createdAt = new Date().toISOString();

    const newUserObj = {
      id,
      userId: cleanUserId,
      name: userData.name.trim(),
      role: userData.role,
      department: (userData.department || 'General').trim(),
      phoneNumber: (userData.phoneNumber || '').trim(),
      email: (userData.email || '').trim(),
      rawPassword: pass,
      passwordHash,
      permissions: userData.permissions || defaultPerms,
      createdAt,
    };

    // Save to MongoDB with confirmation
    let mongoSavedId: string = id;
    try {
      await connectToMongoDB();
      if (isMongoDBConnected() && UserModel) {
        const doc = await (UserModel as any).findOneAndUpdate(
          { userId: cleanUserId },
          {
            $set: {
              userId: cleanUserId,
              name: newUserObj.name,
              role: newUserObj.role,
              department: newUserObj.department,
              phoneNumber: newUserObj.phoneNumber,
              email: newUserObj.email,
              passwordHash,
              rawPassword: pass,
              permissions: newUserObj.permissions,
              createdAt: new Date(createdAt),
            },
          },
          { upsert: true, new: true }
        );
        if (doc && doc._id) {
          mongoSavedId = doc._id.toString();
          newUserObj.id = mongoSavedId;
        }
      }
    } catch (mongoErr) {
      console.error('[MongoDB Add User Error]:', mongoErr);
    }

    // Save to memory
    this.data.users.unshift(newUserObj);
    this.addActivity('auth', 'User Account Created', `Created ${newUserObj.role.toUpperCase()} account for ${newUserObj.name} (${newUserObj.userId})`, user);
    this.save();

    const { rawPassword: _, passwordHash: __, ...safeUser } = newUserObj;
    return safeUser as User;
  }

  public addUser(
    userData: { userId: string; name: string; role: UserRole; department?: string; phoneNumber?: string; rawPassword?: string; permissions?: Permission[] },
    user: string
  ): User {
    const cleanUserId = userData.userId.trim().toUpperCase();
    if (userData.role === 'SUPER_ADMIN' || cleanUserId === 'VYNEXTGEN') {
      throw new Error('Access Denied: Creating Super Admin accounts is strictly prohibited.');
    }

    const existing = this.data.users.find((u) => u.userId.toUpperCase() === cleanUserId);
    if (existing) {
      throw new Error(`User ID "${userData.userId}" already exists`);
    }

    const defaultPerms: Permission[] =
      userData.role === 'admin'
        ? ['send_sms', 'upload_results', 'manage_students', 'manage_staff', 'view_reports', 'manage_settings', 'manage_parents']
        : userData.role === 'hod'
        ? ['send_sms', 'upload_results', 'manage_students', 'manage_staff', 'view_reports', 'manage_parents']
        : ['send_sms', 'view_reports'];

    const pass = userData.rawPassword || 'VSB123';
    const newUser = {
      id: `usr-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      userId: cleanUserId,
      name: userData.name,
      role: userData.role,
      department: userData.department || 'General',
      phoneNumber: userData.phoneNumber || '',
      rawPassword: pass,
      passwordHash: bcrypt.hashSync(pass, 10),
      permissions: userData.permissions || defaultPerms,
      createdAt: new Date().toISOString(),
    };

    this.data.users.unshift(newUser);
    this.addActivity('auth', 'User Account Created', `Created ${newUser.role.toUpperCase()} account for ${newUser.name} (${newUser.userId})`, user);
    this.save();

    // Async push to MongoDB in background
    connectToMongoDB().then(() => {
      if (isMongoDBConnected() && UserModel) {
        (UserModel as any).findOneAndUpdate(
          { userId: cleanUserId },
          {
            $set: {
              userId: cleanUserId,
              name: newUser.name,
              role: newUser.role,
              department: newUser.department,
              phoneNumber: newUser.phoneNumber,
              passwordHash: newUser.passwordHash,
              rawPassword: newUser.rawPassword,
              permissions: newUser.permissions,
              createdAt: new Date(newUser.createdAt),
            },
          },
          { upsert: true, new: true }
        ).catch((err: any) => console.error('[MongoDB Async addUser Sync Error]:', err));
      }
    }).catch(() => {});

    const { rawPassword, passwordHash, ...safeUser } = newUser;
    return safeUser as User;
  }

  public async updateUserAsync(
    idOrUserId: string,
    updates: Partial<{
      name: string;
      userId: string;
      username: string;
      role: UserRole;
      department: string;
      phoneNumber: string;
      email: string;
      rawPassword: string;
      permissions: Permission[];
    }>,
    user: string
  ): Promise<User> {
    const cleanId = (idOrUserId || '').trim();
    if (!cleanId) {
      throw new Error('User ID / Identifier is required');
    }
    const cleanUserId = cleanId.toUpperCase();

    // 1. Locate user in memory or in MongoDB
    let targetUser = this.data.users.find(
      (u) =>
        u.id === cleanId ||
        u.userId.toUpperCase() === cleanUserId ||
        (u as any).username?.toUpperCase() === cleanUserId
    );

    let mongoDoc: any = null;
    try {
      await connectToMongoDB();
      if (isMongoDBConnected() && UserModel) {
        const isObjId = mongoose.Types.ObjectId.isValid(cleanId);
        const orFilters: any[] = [
          { userId: cleanUserId },
          { userId: { $regex: new RegExp(`^${cleanUserId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } },
          { id: cleanId },
        ];
        if (isObjId) {
          orFilters.push({ _id: cleanId });
        }
        if (targetUser) {
          orFilters.push({ userId: targetUser.userId.toUpperCase() });
          if (targetUser.id && mongoose.Types.ObjectId.isValid(targetUser.id)) {
            orFilters.push({ _id: targetUser.id });
          }
        }
        mongoDoc = await (UserModel as any).findOne({ $or: orFilters });
      }
    } catch (mongoSearchErr) {
      console.warn('[MongoDB User Search Warning]:', mongoSearchErr);
    }

    if (!targetUser && !mongoDoc) {
      throw new Error(`User account "${cleanId}" not found`);
    }

    const currentUserId = (targetUser?.userId || mongoDoc?.userId || '').toUpperCase();
    const currentRole = targetUser?.role || mongoDoc?.role;

    if (currentRole === 'SUPER_ADMIN' || currentUserId === 'VYNEXTGEN') {
      throw new Error('Access Denied: Super Admin account cannot be modified.');
    }
    if (updates.role === 'SUPER_ADMIN') {
      throw new Error('Access Denied: Assigning Super Admin role is prohibited.');
    }

    // Build the updated properties
    const updatedName = updates.name !== undefined && updates.name.trim() ? updates.name.trim() : (targetUser?.name || mongoDoc?.name || '');
    const updatedRole = (updates.role !== undefined ? updates.role : (targetUser?.role || mongoDoc?.role || 'staff')).toLowerCase() as UserRole;
    const updatedDept = updates.department !== undefined ? (updates.department.trim() || 'General') : (targetUser?.department || mongoDoc?.department || 'General');
    const updatedPhone = updates.phoneNumber !== undefined ? updates.phoneNumber.trim() : (targetUser?.phoneNumber || mongoDoc?.phoneNumber || '');
    const updatedEmail = updates.email !== undefined ? updates.email.trim() : ((targetUser as any)?.email || mongoDoc?.email || '');
    const newUsername = (updates.userId || updates.username)?.trim().toUpperCase();
    const updatedUserId = newUsername || currentUserId;

    let updatedPasswordHash = targetUser?.passwordHash || mongoDoc?.passwordHash || '';
    let updatedRawPassword = targetUser?.rawPassword || mongoDoc?.rawPassword || '';
    if (updates.rawPassword && updates.rawPassword.trim().length > 0) {
      const pass = updates.rawPassword.trim();
      updatedRawPassword = pass;
      updatedPasswordHash = bcrypt.hashSync(pass, 10);
    }

    const updatedPermissions = updates.permissions || targetUser?.permissions || mongoDoc?.permissions || (
      updatedRole === 'admin'
        ? ['send_sms', 'upload_results', 'manage_students', 'manage_staff', 'view_reports', 'manage_settings', 'manage_parents']
        : updatedRole === 'hod'
        ? ['send_sms', 'upload_results', 'manage_students', 'manage_staff', 'view_reports', 'manage_parents']
        : ['send_sms', 'view_reports']
    );

    const mongoSetFields: any = {
      name: updatedName,
      role: updatedRole,
      department: updatedDept,
      phoneNumber: updatedPhone,
      email: updatedEmail,
      passwordHash: updatedPasswordHash,
      rawPassword: updatedRawPassword,
      permissions: updatedPermissions,
    };
    if (newUsername) {
      mongoSetFields.userId = newUsername;
    }

    // 2. Perform MongoDB update and verify
    let verifiedDoc: any = null;
    try {
      await connectToMongoDB();
      if (isMongoDBConnected() && UserModel) {
        const isObjId = mongoose.Types.ObjectId.isValid(cleanId);
        const orFilters: any[] = [
          { userId: currentUserId },
          { userId: { $regex: new RegExp(`^${currentUserId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } },
          { id: cleanId },
        ];
        if (isObjId) {
          orFilters.push({ _id: cleanId });
        }
        if (targetUser?.id && mongoose.Types.ObjectId.isValid(targetUser.id)) {
          orFilters.push({ _id: targetUser.id });
        }

        const updateResult = await (UserModel as any).findOneAndUpdate(
          { $or: orFilters },
          { $set: mongoSetFields },
          { new: true, upsert: false }
        );

        if (updateResult) {
          verifiedDoc = updateResult;
        } else {
          // If doc didn't exist in MongoDB yet, create/upsert it
          verifiedDoc = await (UserModel as any).findOneAndUpdate(
            { userId: updatedUserId },
            {
              $set: {
                ...mongoSetFields,
                userId: updatedUserId,
                createdAt: new Date(),
              },
            },
            { new: true, upsert: true }
          );
        }

        // Verification query: Confirm document contains the new values in MongoDB
        const checkDoc = await (UserModel as any).findOne({
          $or: [
            { userId: updatedUserId },
            ...(verifiedDoc?._id ? [{ _id: verifiedDoc._id }] : []),
          ],
        }).lean();

        if (!checkDoc || checkDoc.name !== updatedName) {
          throw new Error('Database verification failed: Updated HOD document does not reflect the changes in MongoDB.');
        }

        console.log(`[MongoDB User Update Verified]: HOD/User "${updatedName}" (${updatedUserId}) successfully updated in MongoDB.`);
      }
    } catch (mongoErr: any) {
      console.error('[MongoDB Update User Error]:', mongoErr);
      if (isMongoDBConnected()) {
        throw new Error(`MongoDB update failed: ${mongoErr.message || 'Database error'}`);
      }
    }

    // 3. Update memory representation
    if (targetUser) {
      targetUser.name = updatedName;
      targetUser.role = updatedRole;
      targetUser.department = updatedDept;
      targetUser.phoneNumber = updatedPhone;
      (targetUser as any).email = updatedEmail;
      targetUser.userId = updatedUserId;
      targetUser.passwordHash = updatedPasswordHash;
      targetUser.rawPassword = updatedRawPassword;
      targetUser.permissions = updatedPermissions;
      if (verifiedDoc && verifiedDoc._id) {
        targetUser.id = verifiedDoc._id.toString();
      }
    } else {
      targetUser = {
        id: verifiedDoc?._id ? verifiedDoc._id.toString() : cleanId,
        userId: updatedUserId,
        name: updatedName,
        role: updatedRole,
        department: updatedDept,
        phoneNumber: updatedPhone,
        permissions: updatedPermissions,
        createdAt: verifiedDoc?.createdAt ? new Date(verifiedDoc.createdAt).toISOString() : new Date().toISOString(),
        passwordHash: updatedPasswordHash,
        rawPassword: updatedRawPassword,
      } as any;
      this.data.users.unshift(targetUser!);
    }

    // 4. If this is an HOD, synchronize the Department's headOfDepartment
    if (updatedRole === 'hod' && updatedDept && updatedDept !== 'General' && updatedDept !== 'ALL') {
      const deptIdx = this.data.departments.findIndex(
        (d) => d.code.toUpperCase() === updatedDept.toUpperCase()
      );
      if (deptIdx !== -1) {
        this.data.departments[deptIdx].headOfDepartment = updatedName;
        try {
          if (isMongoDBConnected() && DepartmentModel) {
            await (DepartmentModel as any).updateOne(
              { code: updatedDept.toUpperCase() },
              { $set: { headOfDepartment: updatedName } }
            );
          }
        } catch (deptSyncErr) {
          console.warn('[Department HOD Sync Warning]:', deptSyncErr);
        }
      }
    }

    this.addActivity('auth', 'User Account Updated', `Updated details for ${updatedRole.toUpperCase()} ${updatedName} (${updatedUserId})`, user);
    this.save();

    const { rawPassword, passwordHash, ...safeUser } = targetUser;
    return safeUser as User;
  }

  public updateUser(
    id: string,
    updates: Partial<{ name: string; role: UserRole; department: string; phoneNumber: string; rawPassword: string }>,
    user: string
  ): User {
    const targetUser = this.data.users.find((u) => u.id === id);
    if (!targetUser) {
      throw new Error('User account not found');
    }

    if (targetUser.role === 'SUPER_ADMIN' || targetUser.userId.toUpperCase() === 'VYNEXTGEN') {
      throw new Error('Access Denied: Super Admin account cannot be modified.');
    }
    if (updates.role === 'SUPER_ADMIN') {
      throw new Error('Access Denied: Assigning Super Admin role is prohibited.');
    }

    if (updates.name !== undefined && updates.name.trim()) {
      targetUser.name = updates.name.trim();
    }
    if (updates.role !== undefined) {
      targetUser.role = updates.role;
    }
    if (updates.department !== undefined) {
      targetUser.department = updates.department.trim() || 'General';
    }
    if (updates.phoneNumber !== undefined) {
      targetUser.phoneNumber = updates.phoneNumber.trim();
    }
    if (updates.rawPassword && updates.rawPassword.trim().length > 0) {
      const pass = updates.rawPassword.trim();
      targetUser.rawPassword = pass;
      targetUser.passwordHash = bcrypt.hashSync(pass, 10);
    }

    this.addActivity('auth', 'User Account Updated', `Updated details for user ${targetUser.name} (${targetUser.userId})`, user);
    this.save();

    // Async MongoDB sync
    connectToMongoDB().then(() => {
      if (isMongoDBConnected() && UserModel) {
        (UserModel as any).findOneAndUpdate(
          { $or: [{ userId: targetUser.userId }, { id: targetUser.id }] },
          {
            $set: {
              name: targetUser.name,
              role: targetUser.role,
              department: targetUser.department,
              phoneNumber: targetUser.phoneNumber,
              passwordHash: targetUser.passwordHash,
              rawPassword: targetUser.rawPassword,
            },
          }
        ).catch((err: any) => console.error('[MongoDB Async updateUser Sync Error]:', err));
      }
    }).catch(() => {});

    const { rawPassword, passwordHash, ...safeUser } = targetUser;
    return safeUser as User;
  }

  public async deleteUserAsync(id: string, user: string): Promise<boolean> {
    const cleanId = (id || '').trim();
    const targetUser = this.data.users.find((u) => u.id === cleanId || u.userId.toUpperCase() === cleanId.toUpperCase());
    
    const userIdToCheck = (targetUser?.userId || cleanId).toUpperCase();
    if (targetUser?.role === 'SUPER_ADMIN' || userIdToCheck === 'VYNEXTGEN') {
      throw new Error('Access Denied: Super Admin account cannot be deleted.');
    }
    if (userIdToCheck === 'VSBEC') {
      throw new Error('System Admin cannot be deleted');
    }

    // Delete from MongoDB
    try {
      await connectToMongoDB();
      if (isMongoDBConnected() && UserModel) {
        const isObjId = mongoose.Types.ObjectId.isValid(cleanId);
        const orFilters: any[] = [
          { userId: userIdToCheck },
          { userId: { $regex: new RegExp(`^${userIdToCheck.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } },
          { id: cleanId },
        ];
        if (isObjId) orFilters.push({ _id: cleanId });
        if (targetUser?.id && mongoose.Types.ObjectId.isValid(targetUser.id)) {
          orFilters.push({ _id: targetUser.id });
        }

        await (UserModel as any).deleteMany({ $or: orFilters });
        console.log(`[MongoDB User Delete Verified]: User "${userIdToCheck}" permanently deleted from MongoDB.`);
      }
    } catch (err: any) {
      console.error('[MongoDB deleteUserAsync Error]:', err);
      if (isMongoDBConnected()) {
        throw new Error(`Failed to delete user from database: ${err.message || 'Database error'}`);
      }
    }

    // Remove from memory
    const index = this.data.users.findIndex((u) => u.id === cleanId || u.userId.toUpperCase() === userIdToCheck);
    if (index !== -1) {
      const removed = this.data.users[index];
      this.data.users.splice(index, 1);
      this.addActivity('auth', 'User Account Deleted', `Deleted user ${removed.name} (${removed.userId})`, user);
      this.save();
      return true;
    }

    return true;
  }

  public deleteUser(id: string, user: string): boolean {
    const index = this.data.users.findIndex((u) => u.id === id);
    if (index === -1) return false;
    const removed = this.data.users[index];
    if (removed.role === 'SUPER_ADMIN' || removed.userId.toUpperCase() === 'VYNEXTGEN') {
      throw new Error('Access Denied: Super Admin account cannot be deleted.');
    }
    if (removed.userId === 'VSBEC') {
      throw new Error('System Admin cannot be deleted');
    }
    this.data.users.splice(index, 1);
    this.addActivity('auth', 'User Account Deleted', `Deleted user ${removed.name} (${removed.userId})`, user);
    this.save();

    connectToMongoDB().then(() => {
      if (isMongoDBConnected() && UserModel) {
        (UserModel as any).deleteMany({
          $or: [{ userId: removed.userId }, { id: removed.id }],
        }).catch((err: any) => console.error('[MongoDB Async deleteUser Sync Error]:', err));
      }
    }).catch(() => {});

    return true;
  }

  // --- Student Methods ---
  public getStudents(): Student[] {
    return this.data.students;
  }

  public async getStudentsAsync(): Promise<Student[]> {
    try {
      await connectToMongoDB();
      if (isMongoDBConnected() && StudentModel) {
        const docs = await (StudentModel as any).find({}).sort({ createdAt: -1 }).lean();
        if (Array.isArray(docs)) {
          const mongoStudents: Student[] = docs.map((d: any) => ({
            id: d._id ? d._id.toString() : `std-${d.registerNumber}`,
            name: d.name,
            registerNumber: d.registerNumber,
            department: d.department,
            phoneNumber: d.phoneNumber,
            createdAt: d.createdAt ? new Date(d.createdAt).toISOString() : new Date().toISOString(),
          }));

          // MongoDB is the single source of truth - synchronize state
          this.data.students = mongoStudents;
          this.save();
          return mongoStudents;
        }
      }
    } catch (err) {
      console.error('[MongoDB getStudentsAsync Error]:', err);
    }
    return this.data.students;
  }

  public addStudent(studentData: Omit<Student, 'id' | 'createdAt'>, user: string): Student {
    const cleanReg = studentData.registerNumber.trim().toUpperCase();
    const existing = this.data.students.find(
      (s) => s.registerNumber.toUpperCase() === cleanReg
    );

    if (existing) {
      throw new Error(`Student with Register Number ${studentData.registerNumber} already exists`);
    }

    const newStudent: Student = {
      ...studentData,
      name: studentData.name.trim(),
      registerNumber: cleanReg,
      department: studentData.department.trim().toUpperCase(),
      phoneNumber: studentData.phoneNumber.trim(),
      id: `std-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      createdAt: new Date().toISOString(),
    };

    this.data.students.unshift(newStudent);
    this.addActivity(
      'student',
      'Student Added',
      `Added student ${newStudent.name} (${newStudent.registerNumber}) - Dept: ${newStudent.department}`,
      user
    );
    this.save();
    return newStudent;
  }

  public async addStudentAsync(studentData: Omit<Student, 'id' | 'createdAt'>, user: string): Promise<Student> {
    const cleanReg = studentData.registerNumber.trim().toUpperCase();
    
    // Check if exists in MongoDB or local memory
    try {
      await connectToMongoDB();
      if (isMongoDBConnected() && StudentModel) {
        const safeRegex = cleanReg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const existingDoc = await (StudentModel as any).findOne({
          registerNumber: { $regex: new RegExp(`^${safeRegex}$`, 'i') },
        });
        if (existingDoc) {
          throw new Error(`Student with Register Number ${studentData.registerNumber} already exists in database`);
        }
      }
    } catch (checkErr: any) {
      if (checkErr.message?.includes('already exists')) {
        throw checkErr;
      }
    }

    const newStudent = this.addStudent(studentData, user);

    try {
      if (isMongoDBConnected() && StudentModel) {
        const doc = await (StudentModel as any).findOneAndUpdate(
          { registerNumber: newStudent.registerNumber },
          {
            $set: {
              name: newStudent.name,
              registerNumber: newStudent.registerNumber,
              department: newStudent.department,
              phoneNumber: newStudent.phoneNumber,
              createdAt: new Date(),
            },
          },
          { upsert: true, new: true }
        );
        if (doc && doc._id) {
          newStudent.id = doc._id.toString();
        }
      }
    } catch (mongoErr) {
      console.error('[MongoDB Add Student Async Error]:', mongoErr);
    }

    return newStudent;
  }

  public updateStudent(id: string, updates: Partial<Omit<Student, 'id' | 'createdAt'>>, user: string): Student {
    const cleanId = id.trim();
    const index = this.data.students.findIndex((s) => s.id === cleanId || s.registerNumber.toUpperCase() === cleanId.toUpperCase());
    if (index === -1) throw new Error('Student not found');

    if (updates.registerNumber) {
      const cleanReg = updates.registerNumber.trim().toUpperCase();
      const conflict = this.data.students.find(
        (s) => s.id !== cleanId && s.registerNumber.toUpperCase() === cleanReg
      );
      if (conflict) throw new Error(`Register number ${updates.registerNumber} already assigned to another student`);
    }

    this.data.students[index] = {
      ...this.data.students[index],
      ...updates,
      ...(updates.registerNumber ? { registerNumber: updates.registerNumber.trim().toUpperCase() } : {}),
      ...(updates.name ? { name: updates.name.trim() } : {}),
      ...(updates.department ? { department: updates.department.trim().toUpperCase() } : {}),
      ...(updates.phoneNumber ? { phoneNumber: updates.phoneNumber.trim() } : {}),
    };

    this.addActivity(
      'student',
      'Student Updated',
      `Updated details for ${this.data.students[index].name} (${this.data.students[index].registerNumber})`,
      user
    );
    this.save();
    return this.data.students[index];
  }

  public async updateStudentAsync(id: string, updates: Partial<Omit<Student, 'id' | 'createdAt'>>, user: string): Promise<Student> {
    const cleanId = id.trim();
    const index = this.data.students.findIndex((s) => s.id === cleanId || s.registerNumber.toUpperCase() === cleanId.toUpperCase());
    if (index === -1) throw new Error('Student not found');
    const oldReg = this.data.students[index].registerNumber;

    const updated = this.updateStudent(id, updates, user);

    try {
      await connectToMongoDB();
      if (isMongoDBConnected() && StudentModel) {
        const isObjId = mongoose.Types.ObjectId.isValid(cleanId);
        await (StudentModel as any).findOneAndUpdate(
          {
            $or: [
              { registerNumber: oldReg.toUpperCase() },
              { registerNumber: updated.registerNumber.toUpperCase() },
              ...(isObjId ? [{ _id: cleanId }] : []),
            ],
          },
          {
            $set: {
              name: updated.name,
              registerNumber: updated.registerNumber,
              department: updated.department,
              phoneNumber: updated.phoneNumber,
            },
          },
          { upsert: true, new: true }
        );
      }
    } catch (mongoErr) {
      console.error('[MongoDB Update Student Async Error]:', mongoErr);
    }

    return updated;
  }

  public deleteStudent(id: string, user: string): boolean {
    const cleanId = id.trim();
    const cleanReg = cleanId.toUpperCase();
    const index = this.data.students.findIndex((s) => s.id === cleanId || s.registerNumber.toUpperCase() === cleanReg);
    if (index === -1) return false;

    const removed = this.data.students[index];
    this.data.students.splice(index, 1);
    this.addActivity(
      'student',
      'Student Deleted',
      `Deleted student ${removed.name} (${removed.registerNumber})`,
      user
    );
    this.save();
    return true;
  }

  public async deleteStudentAsync(
    idOrReg: string,
    user: string
  ): Promise<{ success: boolean; student?: Student; error?: string }> {
    const cleanId = (idOrReg || '').trim();
    if (!cleanId) {
      return { success: false, error: 'Student ID or Register Number is required' };
    }
    const cleanReg = cleanId.toUpperCase();

    let targetStudent: Student | undefined;

    // 1. Locate student in memory/local store first if present
    const localIndex = this.data.students.findIndex(
      (s) =>
        s.id === cleanId ||
        s.registerNumber.toUpperCase() === cleanReg ||
        s.name.trim().toUpperCase() === cleanReg
    );

    if (localIndex !== -1) {
      targetStudent = this.data.students[localIndex];
    }

    // 2. Delete permanently from MongoDB collection
    let mongoDeleted = false;
    try {
      await connectToMongoDB();
      if (isMongoDBConnected() && StudentModel) {
        const isObjId = mongoose.Types.ObjectId.isValid(cleanId);
        const safeRegex = cleanId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

        const orFilters: any[] = [
          { registerNumber: cleanReg },
          { registerNumber: { $regex: new RegExp(`^${safeRegex}$`, 'i') } },
          { name: { $regex: new RegExp(`^${safeRegex}$`, 'i') } },
        ];

        if (isObjId) {
          orFilters.push({ _id: cleanId });
        }

        if (targetStudent) {
          const safeTargetReg = targetStudent.registerNumber.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const safeTargetName = targetStudent.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          orFilters.push(
            { registerNumber: targetStudent.registerNumber.toUpperCase() },
            { registerNumber: { $regex: new RegExp(`^${safeTargetReg}$`, 'i') } },
            { name: { $regex: new RegExp(`^${safeTargetName}$`, 'i') } }
          );
        }

        const filter = { $or: orFilters };

        // Fetch doc if not known locally
        if (!targetStudent) {
          const foundDoc = await (StudentModel as any).findOne(filter).lean();
          if (foundDoc) {
            targetStudent = {
              id: foundDoc._id ? foundDoc._id.toString() : `std-${foundDoc.registerNumber}`,
              name: foundDoc.name,
              registerNumber: foundDoc.registerNumber,
              department: foundDoc.department,
              phoneNumber: foundDoc.phoneNumber,
              createdAt: foundDoc.createdAt ? new Date(foundDoc.createdAt).toISOString() : new Date().toISOString(),
            };
          }
        }

        // Execute permanent delete in MongoDB
        const deleteRes = await (StudentModel as any).deleteMany(filter);
        if (deleteRes && deleteRes.deletedCount > 0) {
          mongoDeleted = true;
          console.log(`[MongoDB Delete Student]: Permanently deleted ${deleteRes.deletedCount} record(s) matching "${cleanId}".`);
        }

        // Verification query: Confirm document is gone from MongoDB
        const checkDoc = await (StudentModel as any).findOne(filter);
        if (checkDoc) {
          console.warn(`[MongoDB Warning]: Student document still existed after deleteMany, running direct deleteOne for _id ${checkDoc._id}`);
          await (StudentModel as any).deleteOne({ _id: checkDoc._id });
        }
      }
    } catch (mongoErr: any) {
      console.error('[MongoDB Student Delete Error]:', mongoErr);
      if (isMongoDBConnected()) {
        return { success: false, error: `MongoDB deletion failed: ${mongoErr.message || 'Database error'}` };
      }
    }

    // 3. Remove ALL matching occurrences from local data array
    const regToRemove = (targetStudent?.registerNumber || cleanReg).toUpperCase();
    const nameToRemove = (targetStudent?.name || '').trim().toUpperCase();
    const idToRemove = targetStudent?.id || cleanId;

    const initialLength = this.data.students.length;
    this.data.students = this.data.students.filter(
      (s) =>
        s.id !== idToRemove &&
        s.id !== cleanId &&
        s.registerNumber.toUpperCase() !== regToRemove &&
        s.registerNumber.toUpperCase() !== cleanReg &&
        (!nameToRemove || s.name.trim().toUpperCase() !== nameToRemove)
    );

    const localRemoved = this.data.students.length < initialLength;

    if (targetStudent || localRemoved || mongoDeleted) {
      const studentName = targetStudent?.name || cleanId;
      const studentReg = targetStudent?.registerNumber || cleanReg;
      this.addActivity(
        'student',
        'Student Deleted',
        `Deleted student ${studentName} (${studentReg})`,
        user
      );
      this.save();

      return {
        success: true,
        student: targetStudent || {
          id: cleanId,
          name: cleanId,
          registerNumber: cleanReg,
          department: 'GENERAL',
          phoneNumber: '',
          createdAt: new Date().toISOString(),
        },
      };
    }

    return { success: false, error: `Student with identifier "${cleanId}" not found in database.` };
  }

  public importStudentsBatch(students: Omit<Student, 'id' | 'createdAt'>[], user: string) {
    let addedCount = 0;
    let skippedCount = 0;
    let updatedCount = 0;

    for (const std of students) {
      const cleanReg = std.registerNumber.trim().toUpperCase();
      if (!cleanReg) continue;

      const existingIdx = this.data.students.findIndex(
        (s) => s.registerNumber.trim().toUpperCase() === cleanReg
      );

      if (existingIdx !== -1) {
        // Update existing student details
        this.data.students[existingIdx] = {
          ...this.data.students[existingIdx],
          name: std.name.trim() || this.data.students[existingIdx].name,
          department: (std.department || this.data.students[existingIdx].department).trim().toUpperCase(),
          phoneNumber: std.phoneNumber.trim() || this.data.students[existingIdx].phoneNumber,
        };
        updatedCount++;
        skippedCount++;
      } else {
        const newStudent: Student = {
          ...std,
          registerNumber: cleanReg,
          name: std.name.trim(),
          department: (std.department || 'CSE').trim().toUpperCase(),
          phoneNumber: std.phoneNumber.trim(),
          id: `std-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          createdAt: new Date().toISOString(),
        };
        this.data.students.push(newStudent);
        addedCount++;
      }
    }

    this.addActivity(
      'student',
      'Batch Import Students',
      `Batch imported ${addedCount} students (${updatedCount} updated)`,
      user
    );
    this.save();

    // Async background sync to MongoDB if connected
    if (isMongoDBConnected() && StudentModel) {
      (async () => {
        try {
          for (const std of students) {
            const cleanReg = std.registerNumber.trim().toUpperCase();
            if (cleanReg) {
              await (StudentModel as any).findOneAndUpdate(
                { registerNumber: cleanReg },
                {
                  $set: {
                    name: std.name.trim(),
                    registerNumber: cleanReg,
                    department: (std.department || 'CSE').trim().toUpperCase(),
                    phoneNumber: std.phoneNumber.trim(),
                  },
                  $setOnInsert: {
                    createdAt: new Date(),
                  },
                },
                { upsert: true, new: true }
              );
            }
          }
        } catch (mongoErr) {
          console.error('[MongoDB Student Batch Sync Error]:', mongoErr);
        }
      })();
    }

    return { addedCount, skippedCount, updatedCount, total: this.data.students.length };
  }

  public async importStudentsBatchAsync(students: Omit<Student, 'id' | 'createdAt'>[], user: string) {
    let addedCount = 0;
    let skippedCount = 0;
    let updatedCount = 0;

    for (const std of students) {
      const cleanReg = std.registerNumber.trim().toUpperCase();
      if (!cleanReg) continue;

      const existingIdx = this.data.students.findIndex(
        (s) => s.registerNumber.trim().toUpperCase() === cleanReg
      );

      if (existingIdx !== -1) {
        this.data.students[existingIdx] = {
          ...this.data.students[existingIdx],
          name: std.name.trim() || this.data.students[existingIdx].name,
          department: (std.department || this.data.students[existingIdx].department).trim().toUpperCase(),
          phoneNumber: std.phoneNumber.trim() || this.data.students[existingIdx].phoneNumber,
        };
        updatedCount++;
        skippedCount++;
      } else {
        const newStudent: Student = {
          ...std,
          registerNumber: cleanReg,
          name: std.name.trim(),
          department: (std.department || 'CSE').trim().toUpperCase(),
          phoneNumber: std.phoneNumber.trim(),
          id: `std-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          createdAt: new Date().toISOString(),
        };
        this.data.students.push(newStudent);
        addedCount++;
      }
    }

    this.addActivity(
      'student',
      'Batch Import Students',
      `Batch imported ${addedCount} students (${updatedCount} updated)`,
      user
    );
    this.save();

    try {
      await connectToMongoDB();
      if (isMongoDBConnected() && StudentModel) {
        for (const std of students) {
          const cleanReg = std.registerNumber.trim().toUpperCase();
          if (cleanReg) {
            await (StudentModel as any).findOneAndUpdate(
              { registerNumber: cleanReg },
              {
                $set: {
                  name: std.name.trim(),
                  registerNumber: cleanReg,
                  department: (std.department || 'CSE').trim().toUpperCase(),
                  phoneNumber: std.phoneNumber.trim(),
                },
                $setOnInsert: {
                  createdAt: new Date(),
                },
              },
              { upsert: true, new: true }
            );
          }
        }
      }
    } catch (err) {
      console.error('[MongoDB Student Async Import Sync Error]:', err);
    }

    return { addedCount, skippedCount, updatedCount, total: this.data.students.length };
  }

  // --- Department Methods ---
  public getDepartments(): Department[] {
    return this.data.departments || defaultDepartments;
  }

  public async getDepartmentsAsync(): Promise<Department[]> {
    try {
      await connectToMongoDB();
      if (isMongoDBConnected() && DepartmentModel) {
        let docs = await (DepartmentModel as any).find({}).sort({ code: 1 }).lean();
        if (!docs || docs.length === 0) {
          // Seed defaults into MongoDB
          const seedData = (this.data.departments && this.data.departments.length > 0)
            ? this.data.departments
            : defaultDepartments;
          for (const d of seedData) {
            await (DepartmentModel as any).findOneAndUpdate(
              { code: d.code.toUpperCase() },
              { $set: { id: d.id, code: d.code.toUpperCase(), name: d.name, headOfDepartment: d.headOfDepartment || '', createdAt: new Date() } },
              { upsert: true, new: true }
            );
          }
          docs = await (DepartmentModel as any).find({}).sort({ code: 1 }).lean();
        }

        if (Array.isArray(docs) && docs.length > 0) {
          this.data.departments = docs.map((d: any) => ({
            id: d.id || d._id?.toString() || `dept-${d.code.toLowerCase()}`,
            code: d.code.toUpperCase(),
            name: d.name,
            headOfDepartment: d.headOfDepartment || '',
            createdAt: d.createdAt ? new Date(d.createdAt).toISOString() : new Date().toISOString(),
          }));
          this.save();
        }
      }
    } catch (err) {
      console.error('[MongoDB getDepartmentsAsync Error]:', err);
    }

    return this.data.departments || defaultDepartments;
  }

  public async addDepartmentAsync(deptData: Omit<Department, 'id' | 'createdAt'>, user: string): Promise<Department> {
    const cleanCode = deptData.code.trim().toUpperCase();
    const existing = this.data.departments.find(
      (d) => d.code.toUpperCase() === cleanCode
    );
    if (existing) {
      throw new Error(`Department with code "${cleanCode}" already exists`);
    }

    const newDept: Department = {
      ...deptData,
      code: cleanCode,
      id: `dept-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      createdAt: new Date().toISOString(),
    };

    try {
      await connectToMongoDB();
      if (isMongoDBConnected() && DepartmentModel) {
        const doc = await (DepartmentModel as any).findOneAndUpdate(
          { code: cleanCode },
          {
            $set: {
              id: newDept.id,
              code: cleanCode,
              name: newDept.name.trim(),
              headOfDepartment: (newDept.headOfDepartment || '').trim(),
              createdAt: new Date(newDept.createdAt),
            },
          },
          { upsert: true, new: true }
        );
        if (doc && doc._id) {
          newDept.id = doc.id || doc._id.toString();
        }
      }
    } catch (err) {
      console.error('[MongoDB addDepartmentAsync Error]:', err);
    }

    this.data.departments.push(newDept);
    this.addActivity('settings', 'Department Created', `Created department ${newDept.code} (${newDept.name})`, user);
    this.save();
    return newDept;
  }

  public addDepartment(deptData: Omit<Department, 'id' | 'createdAt'>, user: string): Department {
    const existing = this.data.departments.find(
      (d) => d.code.toUpperCase() === deptData.code.toUpperCase()
    );
    if (existing) {
      throw new Error(`Department with code ${deptData.code} already exists`);
    }

    const newDept: Department = {
      ...deptData,
      id: `dept-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      createdAt: new Date().toISOString(),
    };

    this.data.departments.push(newDept);
    this.addActivity('settings', 'Department Created', `Created department ${newDept.code} (${newDept.name})`, user);
    this.save();
    return newDept;
  }

  public async updateDepartmentAsync(
    id: string,
    updates: Partial<Omit<Department, 'id' | 'createdAt'>>,
    user: string
  ): Promise<Department> {
    const cleanId = (id || '').trim();
    const index = this.data.departments.findIndex((d) => d.id === cleanId || d.code.toUpperCase() === cleanId.toUpperCase());
    if (index === -1) throw new Error('Department not found');

    if (updates.code) {
      const cleanNewCode = updates.code.trim().toUpperCase();
      const conflict = this.data.departments.find(
        (d) => d.id !== cleanId && d.code.toUpperCase() === cleanNewCode
      );
      if (conflict) throw new Error(`Department code ${updates.code} already in use`);
      updates.code = cleanNewCode;
    }

    const updated = { ...this.data.departments[index], ...updates };
    this.data.departments[index] = updated;

    try {
      await connectToMongoDB();
      if (isMongoDBConnected() && DepartmentModel) {
        const isObjId = mongoose.Types.ObjectId.isValid(cleanId);
        const orFilters: any[] = [
          { code: updated.code.toUpperCase() },
          { id: cleanId },
        ];
        if (isObjId) orFilters.push({ _id: cleanId });

        await (DepartmentModel as any).findOneAndUpdate(
          { $or: orFilters },
          {
            $set: {
              name: updated.name,
              code: updated.code,
              headOfDepartment: updated.headOfDepartment || '',
            },
          },
          { new: true, upsert: true }
        );
      }
    } catch (err) {
      console.error('[MongoDB updateDepartmentAsync Error]:', err);
    }

    this.addActivity('settings', 'Department Updated', `Updated department ${this.data.departments[index].code}`, user);
    this.save();
    return this.data.departments[index];
  }

  public updateDepartment(id: string, updates: Partial<Omit<Department, 'id' | 'createdAt'>>, user: string): Department {
    const index = this.data.departments.findIndex((d) => d.id === id);
    if (index === -1) throw new Error('Department not found');

    if (updates.code) {
      const conflict = this.data.departments.find(
        (d) => d.id !== id && d.code.toUpperCase() === updates.code?.toUpperCase()
      );
      if (conflict) throw new Error(`Department code ${updates.code} already in use`);
    }

    this.data.departments[index] = { ...this.data.departments[index], ...updates };
    this.addActivity('settings', 'Department Updated', `Updated department ${this.data.departments[index].code}`, user);
    this.save();
    return this.data.departments[index];
  }

  public async deleteDepartmentAsync(id: string, user: string): Promise<boolean> {
    const cleanId = (id || '').trim();
    const index = this.data.departments.findIndex((d) => d.id === cleanId || d.code.toUpperCase() === cleanId.toUpperCase());
    if (index === -1) return false;

    const removed = this.data.departments[index];
    this.data.departments.splice(index, 1);

    try {
      await connectToMongoDB();
      if (isMongoDBConnected() && DepartmentModel) {
        const isObjId = mongoose.Types.ObjectId.isValid(cleanId);
        const orFilters: any[] = [
          { code: removed.code.toUpperCase() },
          { id: cleanId },
        ];
        if (isObjId) orFilters.push({ _id: cleanId });
        await (DepartmentModel as any).deleteMany({ $or: orFilters });
      }
    } catch (err) {
      console.error('[MongoDB deleteDepartmentAsync Error]:', err);
    }

    this.addActivity('settings', 'Department Deleted', `Deleted department ${removed.code}`, user);
    this.save();
    return true;
  }

  public deleteDepartment(id: string, user: string): boolean {
    const index = this.data.departments.findIndex((d) => d.id === id);
    if (index === -1) return false;

    const removed = this.data.departments[index];
    this.data.departments.splice(index, 1);
    this.addActivity('settings', 'Department Deleted', `Deleted department ${removed.code}`, user);
    this.save();
    return true;
  }

  // --- Staff Methods ---
  public getStaff(): Staff[] {
    return this.data.staff;
  }

  public async getStaffAsync(): Promise<Staff[]> {
    try {
      await connectToMongoDB();
      if (isMongoDBConnected() && StaffModel) {
        const docs = await (StaffModel as any).find({}).sort({ createdAt: -1 }).lean();
        if (Array.isArray(docs) && docs.length > 0) {
          this.data.staff = docs.map((d: any) => ({
            id: d.id || d._id?.toString() || `stf-${d.staffId}`,
            staffId: d.staffId.toUpperCase(),
            name: d.name,
            department: d.department,
            phoneNumber: d.phoneNumber,
            permissions: d.permissions || ['send_sms', 'view_reports'],
            createdAt: d.createdAt ? new Date(d.createdAt).toISOString() : new Date().toISOString(),
          }));
          this.save();
        }
      }
    } catch (err) {
      console.error('[MongoDB getStaffAsync Error]:', err);
    }

    return this.data.staff;
  }

  public async addStaffAsync(staffData: Omit<Staff, 'id' | 'createdAt'>, user: string): Promise<Staff> {
    const cleanStaffId = staffData.staffId.trim().toUpperCase();
    const existing = this.data.staff.find(
      (s) => s.staffId.toUpperCase() === cleanStaffId
    );
    if (existing) throw new Error(`Staff ID ${cleanStaffId} already exists`);

    const newStaff: Staff = {
      ...staffData,
      staffId: cleanStaffId,
      name: staffData.name.trim(),
      department: (staffData.department || 'General').trim(),
      phoneNumber: staffData.phoneNumber.trim(),
      id: `stf-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      createdAt: new Date().toISOString(),
    };

    // Save to StaffModel
    try {
      await connectToMongoDB();
      if (isMongoDBConnected() && StaffModel) {
        const doc = await (StaffModel as any).findOneAndUpdate(
          { staffId: cleanStaffId },
          {
            $set: {
              id: newStaff.id,
              staffId: cleanStaffId,
              name: newStaff.name,
              department: newStaff.department,
              phoneNumber: newStaff.phoneNumber,
              permissions: newStaff.permissions,
              createdAt: new Date(newStaff.createdAt),
            },
          },
          { upsert: true, new: true }
        );
        if (doc && doc._id) {
          newStaff.id = doc.id || doc._id.toString();
        }
      }
    } catch (err) {
      console.error('[MongoDB addStaffAsync Error]:', err);
    }

    this.data.staff.unshift(newStaff);

    // Create user login account for staff
    const staffPass = 'VSB' + cleanStaffId;
    await this.addUserAsync(
      {
        userId: cleanStaffId,
        name: newStaff.name,
        role: 'staff',
        department: newStaff.department,
        phoneNumber: newStaff.phoneNumber,
        rawPassword: staffPass,
        permissions: newStaff.permissions,
      },
      user
    );

    this.addActivity(
      'staff',
      'Staff Account Created',
      `Created staff account for ${newStaff.name} (${newStaff.staffId})`,
      user
    );
    this.save();
    return newStaff;
  }

  public addStaff(staffData: Omit<Staff, 'id' | 'createdAt'>, user: string): Staff {
    const existing = this.data.staff.find(
      (s) => s.staffId.toUpperCase() === staffData.staffId.toUpperCase()
    );
    if (existing) throw new Error(`Staff ID ${staffData.staffId} already exists`);

    const newStaff: Staff = {
      ...staffData,
      id: `stf-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      createdAt: new Date().toISOString(),
    };

    this.data.staff.unshift(newStaff);

    // Create user login account for staff
    const staffPass = 'VSB' + newStaff.staffId;
    this.data.users.push({
      id: newStaff.id,
      userId: newStaff.staffId,
      name: newStaff.name,
      role: 'staff',
      department: newStaff.department,
      phoneNumber: newStaff.phoneNumber,
      rawPassword: staffPass,
      passwordHash: bcrypt.hashSync(staffPass, 10),
      permissions: newStaff.permissions,
      createdAt: newStaff.createdAt,
    });

    this.addActivity(
      'staff',
      'Staff Account Created',
      `Created staff account for ${newStaff.name} (${newStaff.staffId})`,
      user
    );
    this.save();
    return newStaff;
  }

  public async updateStaffAsync(
    id: string,
    updates: Partial<Omit<Staff, 'id' | 'createdAt'>>,
    user: string
  ): Promise<Staff> {
    const cleanId = (id || '').trim();
    const index = this.data.staff.findIndex((s) => s.id === cleanId || s.staffId.toUpperCase() === cleanId.toUpperCase());
    if (index === -1) throw new Error('Staff member not found');

    const oldStaffId = this.data.staff[index].staffId;
    this.data.staff[index] = { ...this.data.staff[index], ...updates };
    const currentStaff = this.data.staff[index];

    // Update Staff in MongoDB
    try {
      await connectToMongoDB();
      if (isMongoDBConnected() && StaffModel) {
        const isObjId = mongoose.Types.ObjectId.isValid(cleanId);
        const orFilters: any[] = [
          { staffId: oldStaffId.toUpperCase() },
          { staffId: currentStaff.staffId.toUpperCase() },
          { id: cleanId },
        ];
        if (isObjId) orFilters.push({ _id: cleanId });

        await (StaffModel as any).findOneAndUpdate(
          { $or: orFilters },
          {
            $set: {
              name: currentStaff.name,
              staffId: currentStaff.staffId,
              department: currentStaff.department,
              phoneNumber: currentStaff.phoneNumber,
              permissions: currentStaff.permissions,
            },
          },
          { new: true, upsert: true }
        );
      }
    } catch (err) {
      console.error('[MongoDB updateStaffAsync Error]:', err);
    }

    // Update associated user record
    try {
      await this.updateUserAsync(
        oldStaffId,
        {
          name: currentStaff.name,
          department: currentStaff.department,
          phoneNumber: currentStaff.phoneNumber,
          permissions: currentStaff.permissions,
        },
        user
      );
    } catch (userErr) {
      console.warn('[Staff User Sync Warning]:', userErr);
    }

    this.addActivity('staff', 'Staff Updated', `Updated staff ${currentStaff.name}`, user);
    this.save();
    return currentStaff;
  }

  public updateStaff(id: string, updates: Partial<Omit<Staff, 'id' | 'createdAt'>>, user: string): Staff {
    const index = this.data.staff.findIndex((s) => s.id === id);
    if (index === -1) throw new Error('Staff member not found');

    this.data.staff[index] = { ...this.data.staff[index], ...updates };

    // Update user record too
    const userIndex = this.data.users.findIndex((u) => u.id === id || u.userId === this.data.staff[index].staffId);
    if (userIndex !== -1) {
      if (updates.name) this.data.users[userIndex].name = updates.name;
      if (updates.permissions) this.data.users[userIndex].permissions = updates.permissions;
      if (updates.department) this.data.users[userIndex].department = updates.department;
    }

    this.addActivity('staff', 'Staff Updated', `Updated staff ${this.data.staff[index].name}`, user);
    this.save();
    return this.data.staff[index];
  }

  public async deleteStaffAsync(id: string, user: string): Promise<boolean> {
    const cleanId = (id || '').trim();
    const index = this.data.staff.findIndex((s) => s.id === cleanId || s.staffId.toUpperCase() === cleanId.toUpperCase());
    if (index === -1) return false;

    const removed = this.data.staff[index];
    this.data.staff.splice(index, 1);

    // Remove from MongoDB Staff
    try {
      await connectToMongoDB();
      if (isMongoDBConnected() && StaffModel) {
        const isObjId = mongoose.Types.ObjectId.isValid(cleanId);
        const orFilters: any[] = [
          { staffId: removed.staffId.toUpperCase() },
          { id: cleanId },
        ];
        if (isObjId) orFilters.push({ _id: cleanId });
        await (StaffModel as any).deleteMany({ $or: orFilters });
      }
    } catch (err) {
      console.error('[MongoDB deleteStaffAsync Error]:', err);
    }

    // Also delete user account
    try {
      await this.deleteUserAsync(removed.staffId, user);
    } catch (uErr) {
      console.warn('[Staff User Delete Warning]:', uErr);
    }

    this.addActivity('staff', 'Staff Deleted', `Deleted staff account ${removed.name}`, user);
    this.save();
    return true;
  }

  public deleteStaff(id: string, user: string): boolean {
    const index = this.data.staff.findIndex((s) => s.id === id);
    if (index === -1) return false;

    const removed = this.data.staff[index];
    this.data.staff.splice(index, 1);

    // remove from users
    const uIdx = this.data.users.findIndex((u) => u.userId === removed.staffId || u.id === id);
    if (uIdx !== -1) {
      this.data.users.splice(uIdx, 1);
    }

    this.addActivity('staff', 'Staff Deleted', `Deleted staff account ${removed.name}`, user);
    this.save();
    return true;
  }

  // --- SMS Logs Methods ---
  public getSmsLogs(): SmsLog[] {
    return this.data.smsLogs;
  }

  public async getSmsLogsAsync(): Promise<SmsLog[]> {
    try {
      await connectToMongoDB();
      if (isMongoDBConnected() && SmsLogModel) {
        const docs = await (SmsLogModel as any).find({}).sort({ sentAt: -1 }).lean();
        if (docs && docs.length > 0) {
          const mongoLogs: SmsLog[] = docs.map((d: any) => ({
            id: d.id || d._id?.toString() || `sms-${Date.now()}`,
            recipientName: d.recipientName || 'Student',
            registerNumber: d.registerNumber || '-',
            phoneNumber: d.phoneNumber || '',
            department: d.department || 'General',
            messageType: (d.messageType as MessageType) || 'General Notification',
            messageContent: d.messageContent || '',
            channel: (d.channel as DeliveryChannel) || 'Fast2SMS Gateway',
            status: (d.status as DeliveryStatus) || 'Sent',
            sentAt: d.sentAt ? (typeof d.sentAt === 'string' ? d.sentAt : new Date(d.sentAt).toISOString()) : new Date().toISOString(),
            sentBy: d.sentBy || 'VSBEC',
            errorMessage: d.errorMessage,
          }));

          // Replace in-memory cache with MongoDB authoritative records
          this.data.smsLogs = mongoLogs;
          this.save();
          return this.data.smsLogs;
        }
      }
    } catch (err) {
      console.error('[MongoDB getSmsLogsAsync Error]:', err);
    }
    return this.data.smsLogs;
  }

  public async addSmsLogsAsync(logs: Omit<SmsLog, 'id'>[]): Promise<SmsLog[]> {
    const createdLogs: SmsLog[] = logs.map((log) => ({
      ...log,
      id: `sms-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    }));

    this.data.smsLogs.unshift(...createdLogs);
    this.save();

    try {
      await connectToMongoDB();
      if (isMongoDBConnected() && SmsLogModel) {
        const mongoDocs = createdLogs.map((l) => ({
          recipientName: l.recipientName,
          registerNumber: l.registerNumber,
          phoneNumber: l.phoneNumber,
          department: l.department,
          messageType: l.messageType,
          messageContent: l.messageContent,
          channel: l.channel || 'Fast2SMS Gateway',
          status: l.status,
          sentBy: l.sentBy || 'VSBEC',
          errorMessage: l.errorMessage,
          sentAt: l.sentAt ? new Date(l.sentAt) : new Date(),
        }));
        await (SmsLogModel as any).insertMany(mongoDocs);
      }
    } catch (err) {
      console.error('[MongoDB addSmsLogsAsync Error]:', err);
    }

    return createdLogs;
  }

  public addSmsLogs(logs: Omit<SmsLog, 'id'>[]): SmsLog[] {
    const createdLogs: SmsLog[] = logs.map((log) => ({
      ...log,
      id: `sms-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    }));

    this.data.smsLogs.unshift(...createdLogs);
    this.save();

    // Asynchronously ensure permanent persistence to MongoDB Atlas
    (async () => {
      try {
        await connectToMongoDB();
        if (isMongoDBConnected() && SmsLogModel) {
          const mongoDocs = createdLogs.map((l) => ({
            recipientName: l.recipientName,
            registerNumber: l.registerNumber,
            phoneNumber: l.phoneNumber,
            department: l.department,
            messageType: l.messageType,
            messageContent: l.messageContent,
            channel: l.channel || 'Fast2SMS Gateway',
            status: l.status,
            sentBy: l.sentBy || 'VSBEC',
            errorMessage: l.errorMessage,
            sentAt: l.sentAt ? new Date(l.sentAt) : new Date(),
          }));
          await (SmsLogModel as any).insertMany(mongoDocs);
        }
      } catch (err) {
        console.error('[MongoDB addSmsLogs Error]:', err);
      }
    })();

    return createdLogs;
  }

  public async clearSmsLogsAsync(user: string): Promise<void> {
    const count = this.data.smsLogs.length;
    this.data.smsLogs = [];
    this.addActivity('sms', 'Cleared SMS Reports', `Cleared ${count} SMS log entries`, user);
    this.save();

    try {
      await connectToMongoDB();
      if (isMongoDBConnected() && SmsLogModel) {
        await (SmsLogModel as any).deleteMany({});
      }
    } catch (err) {
      console.error('[MongoDB clearSmsLogsAsync Error]:', err);
    }
  }

  public clearSmsLogs(user: string) {
    const count = this.data.smsLogs.length;
    this.data.smsLogs = [];
    this.addActivity('sms', 'Cleared SMS Reports', `Cleared ${count} SMS log entries`, user);
    this.save();

    (async () => {
      try {
        await connectToMongoDB();
        if (isMongoDBConnected() && SmsLogModel) {
          await (SmsLogModel as any).deleteMany({});
        }
      } catch (err) {
        console.error('[MongoDB clearSmsLogs Error]:', err);
      }
    })();
  }

  // --- Exam Results Methods ---
  public getExamBatches(): ExamBatch[] {
    return this.data.examBatches;
  }

  public async getExamBatchesAsync(): Promise<ExamBatch[]> {
    try {
      await connectToMongoDB();
      if (isMongoDBConnected() && ExamBatchModel) {
        const docs = await (ExamBatchModel as any).find({}).sort({ uploadedAt: -1 }).lean();
        const mongoBatches: ExamBatch[] = (docs || []).map((d: any) => ({
          id: d.id || d._id.toString(),
          title: d.title,
          resultType: (d.resultType as ResultType) || 'Semester Result',
          department: d.department,
          examDate: d.examDate,
          results: Array.isArray(d.results) ? d.results : [],
          uploadedAt: d.uploadedAt ? (typeof d.uploadedAt === 'string' ? d.uploadedAt : new Date(d.uploadedAt).toISOString()) : new Date().toISOString(),
          uploadedBy: d.uploadedBy || 'VSBEC',
          totalStudents: d.totalStudents || (d.results ? d.results.length : 0),
          passedCount: d.passedCount !== undefined ? d.passedCount : (d.results ? d.results.filter((r: any) => r.overallStatus === 'PASS').length : 0),
          failedCount: d.failedCount !== undefined ? d.failedCount : (d.results ? d.results.filter((r: any) => r.overallStatus === 'FAIL').length : 0),
          passRate: d.passRate !== undefined ? d.passRate : (d.results && d.results.length > 0 ? Math.round((d.results.filter((r: any) => r.overallStatus === 'PASS').length / d.results.length) * 100) : 0),
          smsSentCount: d.smsSentCount || (d.results ? d.results.filter((r: any) => r.smsSent).length : 0),
          matchedCount: d.matchedCount !== undefined ? d.matchedCount : (d.results ? d.results.filter((r: any) => r.phoneNumber && r.matchedParent !== false).length : 0),
          unmatchedCount: d.unmatchedCount !== undefined ? d.unmatchedCount : (d.results ? d.results.filter((r: any) => !r.phoneNumber || r.matchedParent === false).length : 0),
          detectedSubjects: d.detectedSubjects || (d.results && d.results.length > 0 ? Array.from(new Set(d.results.flatMap((r: any) => (r.subjects || []).map((s: any) => (s.subjectName || s.subjectCode || 'Subject').trim())))) : []),
        }));

        // MongoDB is the single source of truth - replace local cache completely with MongoDB authoritative state
        this.data.examBatches = mongoBatches;
        this.save();
        return this.data.examBatches;
      }
    } catch (err) {
      console.error('[MongoDB getExamBatchesAsync Error]:', err);
    }
    return this.getExamBatches();
  }

  public async getExamBatchByIdAsync(batchId: string): Promise<ExamBatch | null> {
    const cleanId = (batchId || '').trim();
    if (!cleanId) return null;

    try {
      await connectToMongoDB();
      if (isMongoDBConnected() && ExamBatchModel) {
        const isObjId = mongoose.Types.ObjectId.isValid(cleanId);
        const orFilters: any[] = [{ id: cleanId }, { id: cleanId.toLowerCase() }];
        if (isObjId) {
          orFilters.push({ _id: cleanId });
          orFilters.push({ _id: new mongoose.Types.ObjectId(cleanId) });
        }
        const doc = await (ExamBatchModel as any).findOne({ $or: orFilters }).lean();

        if (doc) {
          const batch: ExamBatch = {
            id: doc.id || doc._id.toString(),
            title: doc.title,
            resultType: (doc.resultType as ResultType) || 'Semester Result',
            department: doc.department,
            examDate: doc.examDate,
            results: Array.isArray(doc.results) ? doc.results : [],
            uploadedAt: doc.uploadedAt ? (typeof doc.uploadedAt === 'string' ? doc.uploadedAt : new Date(doc.uploadedAt).toISOString()) : new Date().toISOString(),
            uploadedBy: doc.uploadedBy || 'VSBEC',
            totalStudents: doc.totalStudents || (doc.results ? doc.results.length : 0),
            passedCount: doc.passedCount !== undefined ? doc.passedCount : (doc.results ? doc.results.filter((r: any) => r.overallStatus === 'PASS').length : 0),
            failedCount: doc.failedCount !== undefined ? doc.failedCount : (doc.results ? doc.results.filter((r: any) => r.overallStatus === 'FAIL').length : 0),
            passRate: doc.passRate !== undefined ? doc.passRate : (doc.results && doc.results.length > 0 ? Math.round((doc.results.filter((r: any) => r.overallStatus === 'PASS').length / doc.results.length) * 100) : 0),
            smsSentCount: doc.smsSentCount || 0,
            matchedCount: doc.matchedCount || 0,
            unmatchedCount: doc.unmatchedCount || 0,
            detectedSubjects: doc.detectedSubjects || (doc.results && doc.results.length > 0 ? Array.from(new Set(doc.results.flatMap((r: any) => (r.subjects || []).map((s: any) => (s.subjectName || s.subjectCode || 'Subject').trim())))) : []),
          };
          return batch;
        } else {
          // If MongoDB is connected and doc does not exist in MongoDB, remove any stale copy from local memory
          this.data.examBatches = this.data.examBatches.filter((b) => b.id.toLowerCase() !== cleanId.toLowerCase());
          this.save();
          return null;
        }
      }
    } catch (err) {
      console.error(`[MongoDB getExamBatchByIdAsync Error for ${cleanId}]:`, err);
    }

    return this.data.examBatches.find((b) => b.id.toLowerCase() === cleanId.toLowerCase()) || null;
  }

  public addExamBatch(
    title: string,
    department: string,
    examDate: string,
    rawResults: ExamBatch['results'],
    user: string,
    resultType?: ResultType
  ): ExamBatch {
    const parentList = this.data.parentEnrollments || [];
    const studentList = this.data.students || [];

    const processedResults = rawResults.map((rec, index) => {
      const regUpper = (rec.registerNumber || '').trim().toUpperCase();
      const parentMatch = parentList.find(
        (p) => p.registerNumber.trim().toUpperCase() === regUpper
      );
      const studentMatch = studentList.find(
        (s) => s.registerNumber.trim().toUpperCase() === regUpper
      );

      let matchedParent = false;
      let phoneNumber = rec.phoneNumber || '';
      let studentName = rec.studentName || '';
      let parentName = '';

      if (parentMatch) {
        matchedParent = true;
        phoneNumber = parentMatch.parentPhoneNumber;
        parentName = parentMatch.parentName;
        studentName = parentMatch.studentName || rec.studentName || 'Student';
      } else if (studentMatch && studentMatch.phoneNumber) {
        matchedParent = true;
        phoneNumber = studentMatch.phoneNumber;
        studentName = studentMatch.name || rec.studentName || 'Student';
      } else if (phoneNumber && phoneNumber.replace(/\D/g, '').length >= 10) {
        matchedParent = true;
      }

      // Preserve exact subject grades (like B+, A+, O, etc.)
      const subjects = Array.isArray(rec.subjects)
        ? rec.subjects.map((sub) => {
            const rawGrade = sub.grade !== undefined && sub.grade !== null && sub.grade !== '' ? String(sub.grade).trim() : (sub.result || '-');
            const evalGrade = evaluateSubjectGrade(rawGrade);
            return {
              subjectCode: sub.subjectCode || 'SUB',
              subjectName: sub.subjectName || sub.subjectCode || 'Subject',
              grade: evalGrade.gradeStr, // Exact string preserved, e.g. "B+", "A+"
              marks: typeof sub.marks === 'number' ? sub.marks : (!isNaN(Number(evalGrade.gradeStr)) && evalGrade.gradeStr !== '' ? Number(evalGrade.gradeStr) : (evalGrade.isFail ? 0 : 100)),
              maxMarks: sub.maxMarks || 100,
              result: evalGrade.result,
            };
          })
        : [];

      let failedSubjectsCount = 0;
      let passedSubjectsCount = 0;
      subjects.forEach((s) => {
        if (s.result === 'FAIL' || evaluateSubjectGrade(s.grade).isFail) {
          failedSubjectsCount++;
        } else {
          passedSubjectsCount++;
        }
      });

      if (typeof rec.failedSubjectsCount === 'number' && rec.failedSubjectsCount > failedSubjectsCount) {
        failedSubjectsCount = rec.failedSubjectsCount;
      }

      let overallStatus: 'PASS' | 'FAIL' = 'PASS';
      if (failedSubjectsCount > 0) {
        overallStatus = 'FAIL';
      } else if (rec.overallStatus === 'FAIL') {
        overallStatus = 'FAIL';
      }

      return {
        ...rec,
        sNo: rec.sNo || index + 1,
        registerNumber: regUpper,
        studentName,
        parentName,
        phoneNumber,
        department: rec.department || department,
        subjects,
        passedSubjectsCount,
        failedSubjectsCount,
        overallStatus,
        matchedParent,
        smsStatus: (matchedParent ? (rec.smsStatus || 'Pending') : 'Failed') as DeliveryStatus,
        smsErrorMessage: matchedParent ? rec.smsErrorMessage : 'Unmatched: No Parent Enrolled for Reg No',
      };
    });

    const matchedCount = processedResults.filter((r) => r.matchedParent).length;
    const unmatchedCount = processedResults.filter((r) => !r.matchedParent).length;
    const passedCount = processedResults.filter((r) => r.overallStatus === 'PASS').length;
    const failedCount = processedResults.filter((r) => r.overallStatus === 'FAIL').length;
    const totalStudents = processedResults.length;
    const passRate = totalStudents > 0 ? Math.round((passedCount / totalStudents) * 100) : 0;
    const detectedSubjects = Array.from(
      new Set(processedResults.flatMap((r) => (r.subjects || []).map((s) => (s.subjectName || s.subjectCode || 'Subject').trim())))
    );

    const batch: ExamBatch = {
      id: `exm-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      title,
      resultType: resultType || 'Semester Result',
      department,
      examDate,
      results: processedResults,
      uploadedAt: new Date().toISOString(),
      uploadedBy: user,
      totalStudents,
      passedCount,
      failedCount,
      passRate,
      smsSentCount: processedResults.filter((r) => r.smsSent).length,
      matchedCount,
      unmatchedCount,
      detectedSubjects,
    };

    this.data.examBatches.unshift(batch);
    this.addActivity(
      'result',
      'Uploaded Exam Results',
      `Uploaded result set "${title}" (${department}) - ${totalStudents} students, ${passRate}% pass rate (${matchedCount} parents matched)`,
      user
    );
    this.save();
    return batch;
  }

  public async addExamBatchAsync(
    title: string,
    department: string,
    examDate: string,
    rawResults: ExamBatch['results'],
    user: string,
    resultType?: ResultType
  ): Promise<ExamBatch> {
    const batch = this.addExamBatch(title, department, examDate, rawResults, user, resultType);
    try {
      await connectToMongoDB();
      if (isMongoDBConnected() && ExamBatchModel) {
        await (ExamBatchModel as any).findOneAndUpdate(
          { id: batch.id },
          { $set: batch },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        console.log(`[MongoDB Atlas]: Exam Batch "${batch.title}" (${batch.id}) permanently saved with ${batch.totalStudents} student results.`);
      }
    } catch (err) {
      console.error('[MongoDB addExamBatchAsync Error]:', err);
    }
    return batch;
  }

  public updateExamBatchResults(batchId: string, results: ExamBatch['results']) {
    const batch = this.data.examBatches.find((b) => b.id === batchId);
    if (batch) {
      batch.results = results;
      batch.smsSentCount = results.filter((r) => r.smsSent).length;
      batch.matchedCount = results.filter((r) => r.matchedParent !== false && Boolean(r.phoneNumber)).length;
      batch.unmatchedCount = results.filter((r) => r.matchedParent === false || !r.phoneNumber).length;
      batch.passedCount = results.filter((r) => r.overallStatus === 'PASS').length;
      batch.failedCount = results.filter((r) => r.overallStatus === 'FAIL').length;
      batch.passRate = results.length > 0 ? Math.round((batch.passedCount / results.length) * 100) : 0;
      this.save();
    }
  }

  public async updateExamBatchResultsAsync(batchId: string, results: ExamBatch['results']) {
    this.updateExamBatchResults(batchId, results);
    try {
      await connectToMongoDB();
      if (isMongoDBConnected() && ExamBatchModel) {
        const batch = this.data.examBatches.find((b) => b.id === batchId);
        if (batch) {
          await (ExamBatchModel as any).updateOne(
            { id: batchId },
            {
              $set: {
                results: batch.results,
                smsSentCount: batch.smsSentCount,
                matchedCount: batch.matchedCount,
                unmatchedCount: batch.unmatchedCount,
                passedCount: batch.passedCount,
                failedCount: batch.failedCount,
                passRate: batch.passRate,
              },
            },
            { upsert: true }
          );
        }
      }
    } catch (err) {
      console.error('[MongoDB updateExamBatchResultsAsync Error]:', err);
    }
  }

  public async deleteExamBatch(id: string, user: string): Promise<{ success: boolean; message?: string }> {
    const cleanId = (id || '').trim();
    if (!cleanId) {
      return { success: false, message: 'Invalid Exam Batch ID' };
    }

    let batchTitle = '';
    let batchDept = '';
    let batchResults: any[] = [];

    // Check local memory
    const localIndex = this.data.examBatches.findIndex(
      (b) => b.id.toLowerCase() === cleanId.toLowerCase()
    );
    if (localIndex !== -1) {
      const b = this.data.examBatches[localIndex];
      batchTitle = b.title;
      batchDept = b.department;
      batchResults = b.results || [];
      this.data.examBatches.splice(localIndex, 1);
    }

    // Perform permanent MongoDB deletion
    try {
      await connectToMongoDB();
      if (isMongoDBConnected() && ExamBatchModel) {
        const isObjId = mongoose.Types.ObjectId.isValid(cleanId);
        const orFilters: any[] = [
          { id: cleanId },
          { id: cleanId.toLowerCase() },
        ];
        if (isObjId) {
          orFilters.push({ _id: cleanId });
          orFilters.push({ _id: new mongoose.Types.ObjectId(cleanId) });
        }

        // If batch title was not cached, retrieve before deletion
        if (!batchTitle) {
          const doc = await (ExamBatchModel as any).findOne({ $or: orFilters }).lean();
          if (doc) {
            batchTitle = doc.title || '';
            batchDept = doc.department || '';
            batchResults = doc.results || [];
          }
        }

        // Permanently delete the Exam Batch document from MongoDB
        await (ExamBatchModel as any).deleteMany({ $or: orFilters });

        // Delete ONLY related SMS logs for this exam batch
        if (SmsLogModel && batchTitle) {
          await (SmsLogModel as any).deleteMany({
            messageType: 'Exam Result',
            messageContent: { $regex: batchTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' },
          });
        }

        // Verify the Exam Batch document no longer exists in MongoDB
        const checkDoc = await (ExamBatchModel as any).findOne({ $or: orFilters }).lean();
        if (checkDoc) {
          console.error(`[MongoDB Error]: Exam batch ${cleanId} still present after deletion.`);
          return { success: false, message: 'Exam batch could not be deleted from database' };
        }
      }
    } catch (err: any) {
      console.error('[MongoDB deleteExamBatch Error]:', err);
      return { success: false, message: err.message || 'Database deletion failed' };
    }

    // Clean up local SMS logs related ONLY to this batch
    if (batchTitle) {
      this.data.smsLogs = this.data.smsLogs.filter((log) => {
        if (log.messageType === 'Exam Result') {
          const matchTitle = log.messageContent && log.messageContent.toLowerCase().includes(batchTitle.toLowerCase());
          const matchReg = batchResults.some((r) => r.registerNumber === log.registerNumber);
          if (matchTitle && matchReg) {
            return false;
          }
        }
        return true;
      });
    }

    // Ensure it is completely stripped from local state
    this.data.examBatches = this.data.examBatches.filter(
      (b) => b.id.toLowerCase() !== cleanId.toLowerCase()
    );

    this.addActivity(
      'result',
      'Deleted Exam Batch',
      `Deleted Exam Result Batch "${batchTitle || cleanId}" (${batchDept || 'General'})`,
      user
    );
    this.save();

    return { success: true, message: 'Exam batch deleted successfully' };
  }

  // --- Attendance Management Methods ---
  public getAttendanceSessions(): AttendanceSession[] {
    return this.data.attendanceSessions || [];
  }

  public async getAttendanceSessionsAsync(filters?: {
    department?: string;
    date?: string;
  }): Promise<AttendanceSession[]> {
    try {
      await connectToMongoDB();
      if (isMongoDBConnected() && AttendanceModel) {
        const query: any = {};
        if (filters?.department && filters.department !== 'ALL') {
          query.department = filters.department.trim().toUpperCase();
        }
        if (filters?.date) {
          query.date = filters.date.trim();
        }
        const docs = await (AttendanceModel as any).find(query).sort({ date: -1, createdAt: -1 }).lean();
        if (docs && docs.length > 0) {
          const mappedDocs: AttendanceSession[] = docs.map((d: any) => ({
            id: d.id || d._id?.toString(),
            title: d.title || '',
            department: d.department || 'CSE',
            date: d.date,
            academicGroup: d.academicGroup || '',
            section: d.section || '',
            sessionType: d.sessionType || 'Full Day',
            records: (d.records || []).map((r: any) => ({
              studentId: r.studentId,
              registerNumber: r.registerNumber,
              studentName: r.studentName,
              department: r.department || d.department,
              status: r.status || 'PRESENT',
              parentMobile: r.parentMobile || '',
              parentName: r.parentName || '',
              parentMatched: Boolean(r.parentMatched),
              smsSent: Boolean(r.smsSent),
              smsSentAt: r.smsSentAt,
              smsStatus: r.smsStatus,
              smsErrorMessage: r.smsErrorMessage,
            })),
            totalStudents: d.totalStudents || (d.records ? d.records.length : 0),
            presentCount: d.presentCount || (d.records ? d.records.filter((r: any) => r.status === 'PRESENT').length : 0),
            absentCount: d.absentCount || (d.records ? d.records.filter((r: any) => r.status === 'ABSENT').length : 0),
            smsSentCount: d.smsSentCount || 0,
            takenBy: d.takenBy || 'Staff',
            takenByName: d.takenByName || 'Staff',
            takenByRole: d.takenByRole || 'staff',
            createdAt: d.createdAt ? new Date(d.createdAt).toISOString() : new Date().toISOString(),
            updatedAt: d.updatedAt ? new Date(d.updatedAt).toISOString() : undefined,
          }));

          if (!filters?.department && !filters?.date) {
            this.data.attendanceSessions = mappedDocs;
            this.save();
          }
          return mappedDocs;
        }
      }
    } catch (err) {
      console.error('[MongoDB getAttendanceSessionsAsync Error]:', err);
    }

    let results = this.data.attendanceSessions || [];
    if (filters?.department && filters.department !== 'ALL') {
      results = results.filter((s) => s.department.toUpperCase() === filters.department?.toUpperCase());
    }
    if (filters?.date) {
      results = results.filter((s) => s.date === filters.date);
    }
    return results;
  }

  public async getAttendanceSessionByIdAsync(id: string): Promise<AttendanceSession | null> {
    const cleanId = (id || '').trim();
    try {
      await connectToMongoDB();
      if (isMongoDBConnected() && AttendanceModel) {
        const isObjId = mongoose.Types.ObjectId.isValid(cleanId);
        const orFilters: any[] = [{ id: cleanId }];
        if (isObjId) orFilters.push({ _id: cleanId });

        const doc = await (AttendanceModel as any).findOne({ $or: orFilters }).lean();
        if (doc) {
          return {
            id: doc.id || doc._id?.toString(),
            title: doc.title || '',
            department: doc.department || 'CSE',
            date: doc.date,
            academicGroup: doc.academicGroup || '',
            section: doc.section || '',
            sessionType: doc.sessionType || 'Full Day',
            records: (doc.records || []).map((r: any) => ({
              studentId: r.studentId,
              registerNumber: r.registerNumber,
              studentName: r.studentName,
              department: r.department || doc.department,
              status: r.status || 'PRESENT',
              parentMobile: r.parentMobile || '',
              parentName: r.parentName || '',
              parentMatched: Boolean(r.parentMatched),
              smsSent: Boolean(r.smsSent),
              smsSentAt: r.smsSentAt,
              smsStatus: r.smsStatus,
              smsErrorMessage: r.smsErrorMessage,
            })),
            totalStudents: doc.totalStudents || 0,
            presentCount: doc.presentCount || 0,
            absentCount: doc.absentCount || 0,
            smsSentCount: doc.smsSentCount || 0,
            takenBy: doc.takenBy || 'Staff',
            takenByName: doc.takenByName || 'Staff',
            takenByRole: doc.takenByRole || 'staff',
            createdAt: doc.createdAt ? new Date(doc.createdAt).toISOString() : new Date().toISOString(),
            updatedAt: doc.updatedAt ? new Date(doc.updatedAt).toISOString() : undefined,
          };
        }
      }
    } catch (err) {
      console.error('[MongoDB getAttendanceSessionByIdAsync Error]:', err);
    }

    return (this.data.attendanceSessions || []).find((s) => s.id === cleanId) || null;
  }

  public async saveAttendanceSessionAsync(
    sessionData: {
      id?: string;
      title?: string;
      department: string;
      date: string;
      academicGroup: string;
      section?: string;
      sessionType?: string;
      records: Array<{
        studentId?: string;
        registerNumber: string;
        studentName?: string;
        status: AttendanceStatus;
        department?: string;
      }>;
    },
    user: string,
    userName: string,
    userRole: string
  ): Promise<AttendanceSession> {
    const cleanDept = (sessionData.department || 'CSE').trim().toUpperCase();
    const cleanDate = (sessionData.date || new Date().toISOString().split('T')[0]).trim();
    const cleanGroup = (sessionData.academicGroup || 'General Section').trim();
    const sessionId = sessionData.id || `att-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    // Match each record with permanently enrolled students and parent records
    const processedRecords: AttendanceRecord[] = sessionData.records.map((rawRec) => {
      const cleanReg = (rawRec.registerNumber || '').trim().toUpperCase();
      
      const matchedStudent = this.data.students.find(
        (s) => s.registerNumber.toUpperCase() === cleanReg
      );

      const matchedParent = this.data.parentEnrollments.find(
        (p) => p.registerNumber.toUpperCase() === cleanReg
      );

      const studentName = rawRec.studentName?.trim() || matchedStudent?.name || matchedParent?.studentName || cleanReg;
      const dept = rawRec.department?.trim().toUpperCase() || matchedStudent?.department?.toUpperCase() || cleanDept;

      const rawPhone = matchedParent?.parentPhoneNumber || matchedStudent?.phoneNumber || '';
      const cleanPhone = rawPhone.replace(/\D/g, '').slice(-10);
      const isParentMatched = Boolean(cleanPhone && cleanPhone.length === 10);

      const status: AttendanceStatus = (rawRec.status === 'ABSENT' || String(rawRec.status).toUpperCase() === 'ABSENT' || String(rawRec.status) === 'A')
        ? 'ABSENT'
        : 'PRESENT';

      return {
        studentId: matchedStudent?.id || rawRec.studentId,
        registerNumber: cleanReg,
        studentName,
        department: dept,
        status,
        parentMobile: isParentMatched ? cleanPhone : '',
        parentName: matchedParent?.parentName || (isParentMatched ? 'Parent' : ''),
        parentMatched: isParentMatched,
        smsSent: false,
      };
    });

    const presentCount = processedRecords.filter((r) => r.status === 'PRESENT').length;
    const absentCount = processedRecords.filter((r) => r.status === 'ABSENT').length;

    const newSession: AttendanceSession = {
      id: sessionId,
      title: sessionData.title || `${cleanDept} - ${cleanGroup} (${cleanDate})`,
      department: cleanDept,
      date: cleanDate,
      academicGroup: cleanGroup,
      section: (sessionData.section || '').trim(),
      sessionType: (sessionData.sessionType || 'Full Day').trim(),
      records: processedRecords,
      totalStudents: processedRecords.length,
      presentCount,
      absentCount,
      smsSentCount: 0,
      takenBy: user,
      takenByName: userName || user,
      takenByRole: userRole || 'staff',
      createdAt: new Date().toISOString(),
    };

    if (!this.data.attendanceSessions) {
      this.data.attendanceSessions = [];
    }

    const existingIdx = this.data.attendanceSessions.findIndex((s) => s.id === sessionId);
    if (existingIdx >= 0) {
      this.data.attendanceSessions[existingIdx] = newSession;
    } else {
      this.data.attendanceSessions.unshift(newSession);
    }

    // Save permanently to MongoDB
    try {
      await connectToMongoDB();
      if (isMongoDBConnected() && AttendanceModel) {
        await (AttendanceModel as any).findOneAndUpdate(
          { id: sessionId },
          {
            $set: {
              id: newSession.id,
              title: newSession.title,
              department: newSession.department,
              date: newSession.date,
              academicGroup: newSession.academicGroup,
              section: newSession.section,
              sessionType: newSession.sessionType,
              records: newSession.records,
              totalStudents: newSession.totalStudents,
              presentCount: newSession.presentCount,
              absentCount: newSession.absentCount,
              smsSentCount: newSession.smsSentCount,
              takenBy: newSession.takenBy,
              takenByName: newSession.takenByName,
              takenByRole: newSession.takenByRole,
              createdAt: new Date(newSession.createdAt),
              updatedAt: new Date(),
            },
          },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        console.log(`[MongoDB Atlas]: Attendance session "${newSession.title}" saved with ${newSession.totalStudents} students (${presentCount} Present, ${absentCount} Absent).`);
      }
    } catch (err) {
      console.error('[MongoDB saveAttendanceSessionAsync Error]:', err);
    }

    this.addActivity(
      'sms',
      'Attendance Saved',
      `Recorded attendance for ${newSession.academicGroup} (${newSession.department}) on ${newSession.date} - ${presentCount} Present, ${absentCount} Absent`,
      user
    );

    this.save();
    return newSession;
  }

  public async updateAttendanceSessionRecordsAsync(
    sessionId: string,
    updatedRecords: AttendanceRecord[]
  ): Promise<AttendanceSession | null> {
    if (!this.data.attendanceSessions) this.data.attendanceSessions = [];
    const session = this.data.attendanceSessions.find((s) => s.id === sessionId);
    
    const presentCount = updatedRecords.filter((r) => r.status === 'PRESENT').length;
    const absentCount = updatedRecords.filter((r) => r.status === 'ABSENT').length;
    const smsSentCount = updatedRecords.filter((r) => r.smsSent).length;

    if (session) {
      session.records = updatedRecords;
      session.presentCount = presentCount;
      session.absentCount = absentCount;
      session.smsSentCount = smsSentCount;
      session.updatedAt = new Date().toISOString();
      this.save();
    }

    try {
      await connectToMongoDB();
      if (isMongoDBConnected() && AttendanceModel) {
        await (AttendanceModel as any).findOneAndUpdate(
          { id: sessionId },
          {
            $set: {
              records: updatedRecords,
              presentCount,
              absentCount,
              smsSentCount,
              updatedAt: new Date(),
            },
          },
          { new: true }
        );
      }
    } catch (err) {
      console.error('[MongoDB updateAttendanceSessionRecordsAsync Error]:', err);
    }

    return session || null;
  }

  public async deleteAttendanceSessionAsync(id: string, user: string): Promise<boolean> {
    const cleanId = (id || '').trim();
    if (!this.data.attendanceSessions) this.data.attendanceSessions = [];
    const index = this.data.attendanceSessions.findIndex((s) => s.id === cleanId);
    if (index === -1) return false;

    const removed = this.data.attendanceSessions[index];
    this.data.attendanceSessions.splice(index, 1);

    try {
      await connectToMongoDB();
      if (isMongoDBConnected() && AttendanceModel) {
        const isObjId = mongoose.Types.ObjectId.isValid(cleanId);
        const orFilters: any[] = [{ id: cleanId }];
        if (isObjId) orFilters.push({ _id: cleanId });
        await (AttendanceModel as any).deleteMany({ $or: orFilters });
      }
    } catch (err) {
      console.error('[MongoDB deleteAttendanceSessionAsync Error]:', err);
    }

    this.addActivity(
      'sms',
      'Attendance Deleted',
      `Deleted attendance record for ${removed.academicGroup} (${removed.department}) on ${removed.date}`,
      user
    );
    this.save();
    return true;
  }

  // --- SMS Templates ---
  public getSmsTemplates(): SmsTemplate[] {
    return this.data.smsTemplates;
  }

  public addSmsTemplate(template: Omit<SmsTemplate, 'id' | 'createdAt'>, user: string): SmsTemplate {
    const newTpl: SmsTemplate = {
      ...template,
      id: `tpl-${Date.now()}`,
      createdAt: new Date().toISOString(),
    };
    this.data.smsTemplates.push(newTpl);
    this.addActivity('sms', 'Template Created', `Created SMS template "${newTpl.title}"`, user);
    this.save();
    return newTpl;
  }

  public updateSmsTemplate(id: string, updates: Partial<Omit<SmsTemplate, 'id' | 'createdAt'>>, user: string) {
    const index = this.data.smsTemplates.findIndex((t) => t.id === id);
    if (index === -1) throw new Error('Template not found');

    this.data.smsTemplates[index] = { ...this.data.smsTemplates[index], ...updates };
    this.addActivity('sms', 'Template Updated', `Updated template "${this.data.smsTemplates[index].title}"`, user);
    this.save();
    return this.data.smsTemplates[index];
  }

  public deleteSmsTemplate(id: string, user: string) {
    const index = this.data.smsTemplates.findIndex((t) => t.id === id);
    if (index === -1) return false;
    const removed = this.data.smsTemplates[index];
    this.data.smsTemplates.splice(index, 1);
    this.addActivity('sms', 'Template Deleted', `Deleted template "${removed.title}"`, user);
    this.save();
    return true;
  }

  // --- Settings ---
  public getSettings(): GatewaySettings {
    return this.data.settings;
  }

  public updateSettings(settings: GatewaySettings, user: string) {
    this.data.settings = settings;
    this.addActivity('settings', 'Updated Gateway Settings', `Provider set to ${settings.provider}`, user);
    this.save();
    return this.data.settings;
  }

  // --- Dashboard Analytics ---
  public getDashboardStats(userRole?: string) {
    const totalParentsEnrolled = (this.data.parentEnrollments || []).length;
    const totalStudents = this.data.students.length;
    const totalSmsSent = this.data.smsLogs.filter((l) => l.status === 'Sent' || l.status === 'Delivered').length;
    const failedSmsCount = this.data.smsLogs.filter((l) => l.status === 'Failed').length;
    const totalStaff = this.data.staff.length + this.data.users.filter((u) => u.role === 'hod' || u.role === 'staff').length;

    let unmatchedRecordsCount = 0;
    this.data.examBatches.forEach((batch) => {
      unmatchedRecordsCount += batch.results.filter((r) => r.matchedParent === false).length;
    });

    // Department breakdown
    const deptMap: Record<string, { studentCount: number; smsSentCount: number }> = {};

    this.data.students.forEach((s) => {
      const dept = s.department || 'General';
      if (!deptMap[dept]) deptMap[dept] = { studentCount: 0, smsSentCount: 0 };
      deptMap[dept].studentCount++;
    });

    this.data.smsLogs.forEach((l) => {
      const dept = l.department || 'General';
      if (!deptMap[dept]) deptMap[dept] = { studentCount: 0, smsSentCount: 0 };
      if (l.status === 'Sent' || l.status === 'Delivered') {
        deptMap[dept].smsSentCount++;
      }
    });

    const departmentBreakdown = Object.entries(deptMap).map(([department, stats]) => ({
      department,
      ...stats,
    }));

    // Monthly/Daily SMS trend
    const dateMap: Record<string, { sent: number; failed: number }> = {};
    this.data.smsLogs.forEach((l) => {
      const dateKey = l.sentAt ? l.sentAt.split('T')[0] : new Date().toISOString().split('T')[0];
      if (!dateMap[dateKey]) dateMap[dateKey] = { sent: 0, failed: 0 };
      if (l.status === 'Failed') {
        dateMap[dateKey].failed++;
      } else {
        dateMap[dateKey].sent++;
      }
    });

    const monthlySmsTrend = Object.entries(dateMap)
      .map(([date, counts]) => ({ date, ...counts }))
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-10);

    return {
      totalParentsEnrolled,
      totalStudents,
      totalStaff,
      totalSmsSent,
      failedSmsCount,
      unmatchedRecordsCount,
      departmentBreakdown,
      monthlySmsTrend,
    };
  }

  // --- API KEY MANAGEMENT METHODS ---
  public getApiKeys(): ApiKey[] {
    if (!this.data.apiKeys || this.data.apiKeys.length === 0) {
      this.data.apiKeys = [...INITIAL_API_KEYS];
      this.save();
    }
    return this.data.apiKeys;
  }

  public addApiKey(keyData: {
    name: string;
    role?: 'admin' | 'hod' | 'staff' | 'system';
    department?: string;
    scopes?: string[];
    description?: string;
  }): ApiKey {
    const randomHex = Array.from({ length: 32 }, () =>
      Math.floor(Math.random() * 16).toString(16)
    ).join('');
    const newKeyStr = `vsb_live_sk_${randomHex}`;

    const newKey: ApiKey = {
      id: `key-vsb-${Date.now().toString(36)}`,
      key: newKeyStr,
      name: keyData.name || 'New Custom Service Key',
      role: keyData.role || 'staff',
      department: keyData.department || 'ALL',
      scopes: keyData.scopes || ['sms:send', 'results:read'],
      status: 'active',
      createdAt: new Date().toISOString(),
      lastUsedAt: 'Never',
      description: keyData.description || 'Custom generated authentication key.',
    };

    if (!this.data.apiKeys) this.data.apiKeys = [];
    this.data.apiKeys.unshift(newKey);
    this.addActivity('settings', 'API Key Generated', `Generated new API key: ${newKey.name} (${newKey.key.slice(0, 15)}...)`, 'VSBEC');
    this.save();
    return newKey;
  }

  public toggleApiKey(id: string): ApiKey | null {
    if (!this.data.apiKeys) return null;
    const item = this.data.apiKeys.find((k) => k.id === id);
    if (!item) return null;
    item.status = item.status === 'active' ? 'revoked' : 'active';
    this.addActivity('settings', 'API Key Status Changed', `API key ${item.name} set to ${item.status}`, 'VSBEC');
    this.save();
    return item;
  }

  public deleteApiKey(id: string): boolean {
    if (!this.data.apiKeys) return false;
    const initialLen = this.data.apiKeys.length;
    this.data.apiKeys = this.data.apiKeys.filter((k) => k.id !== id);
    if (this.data.apiKeys.length < initialLen) {
      this.addActivity('settings', 'API Key Deleted', `Revoked & removed API Key ID: ${id}`, 'VSBEC');
      this.save();
      return true;
    }
    return false;
  }

  public validateApiKey(keyString: string): { valid: boolean; key?: ApiKey; error?: string } {
    if (!keyString || !keyString.trim()) {
      return { valid: false, error: 'Missing API key header' };
    }
    const keys = this.getApiKeys();
    const match = keys.find((k) => k.key === keyString.trim());
    if (!match) {
      return { valid: false, error: 'Invalid API key provided' };
    }
    if (match.status !== 'active') {
      return { valid: false, error: 'This API key has been revoked or deactivated' };
    }
    match.lastUsedAt = new Date().toISOString();
    this.save();
    return { valid: true, key: match };
  }
}

export const db = new Database();
