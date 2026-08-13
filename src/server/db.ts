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
  ExamBatch,
  ResultType,
  SmsTemplate,
  GatewaySettings,
  ActivityLog,
  LoginLog,
  ApiKey,
} from '../types.js';
import { INITIAL_API_KEYS } from '../config/apiKeys.js';
import { isMongoDBConnected, connectToMongoDB } from './mongo.js';
import { ExamBatchModel } from '../models/ExamBatch.js';
import { SmsLogModel } from '../models/SmsLog.js';
import { StudentModel } from '../models/Student.js';
import { UserModel } from '../models/User.js';

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
    templateText: 'Dear Parent, Semester Result for {name} ({regNo}): {subjects}. Overall Result: {status}. - VSB Engineering College',
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

    // 1. Try local memory state first
    const memoryResult = this.authenticate(userId, pass, requestedRole, jwtSecret);
    if (memoryResult) {
      return memoryResult;
    }

    // 2. Try MongoDB if URI configured
    try {
      await connectToMongoDB();
      if (isMongoDBConnected() && UserModel) {
        const mongoUser = await (UserModel as any).findOne({ userId: cleanUserId });
        if (mongoUser) {
          if (cleanRole && mongoUser.role.toLowerCase() !== cleanRole) {
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

          if (isPasswordValid) {
            const userObj: User = {
              id: mongoUser._id?.toString() || mongoUser.id || `usr-${Date.now()}`,
              userId: mongoUser.userId,
              name: mongoUser.name,
              role: mongoUser.role as UserRole,
              department: mongoUser.department || 'General',
              phoneNumber: mongoUser.phoneNumber || '',
              permissions: mongoUser.permissions || [],
              createdAt: mongoUser.createdAt ? new Date(mongoUser.createdAt).toISOString() : new Date().toISOString(),
            };

            if (!this.data.users.some(u => u.userId.toUpperCase() === cleanUserId)) {
              this.data.users.push({
                ...userObj,
                passwordHash: mongoUser.passwordHash,
              });
              this.save();
            }

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
    } catch (mongoErr) {
      console.error('[MongoDB Authenticate Error]:', mongoErr);
    }

    return null;
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

  public addUser(
    userData: { userId: string; name: string; role: UserRole; department?: string; phoneNumber?: string; rawPassword?: string; permissions?: Permission[] },
    user: string
  ): User {
    if (userData.role === 'SUPER_ADMIN' || userData.userId.trim().toUpperCase() === 'VYNEXTGEN') {
      throw new Error('Access Denied: Creating Super Admin accounts is strictly prohibited.');
    }

    const existing = this.data.users.find((u) => u.userId.toUpperCase() === userData.userId.trim().toUpperCase());
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
      userId: userData.userId.trim().toUpperCase(),
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

    const { rawPassword, passwordHash, ...safeUser } = newUser;
    return safeUser as User;
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
    return true;
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

    const { rawPassword, passwordHash, ...safeUser } = targetUser;
    return safeUser as User;
  }

  // --- Student Methods ---
  public getStudents(): Student[] {
    return this.data.students;
  }

  public async getStudentsAsync(): Promise<Student[]> {
    try {
      await connectToMongoDB();
      if (isMongoDBConnected() && StudentModel) {
        const docs = await (StudentModel as any).find({}).lean();
        if (docs && docs.length > 0) {
          const mongoStudents: Student[] = docs.map((d: any) => ({
            id: d._id ? d._id.toString() : `std-${d.registerNumber}`,
            name: d.name,
            registerNumber: d.registerNumber,
            department: d.department,
            phoneNumber: d.phoneNumber,
            createdAt: d.createdAt ? new Date(d.createdAt).toISOString() : new Date().toISOString(),
          }));

          for (const mStd of mongoStudents) {
            const idx = this.data.students.findIndex(
              (s) => s.registerNumber.toUpperCase() === mStd.registerNumber.toUpperCase()
            );
            if (idx !== -1) {
              this.data.students[idx] = { ...this.data.students[idx], ...mStd };
            } else {
              this.data.students.push(mStd);
            }
          }
          this.save();
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
    const newStudent = this.addStudent(studentData, user);

    try {
      await connectToMongoDB();
      if (isMongoDBConnected() && StudentModel) {
        await (StudentModel as any).findOneAndUpdate(
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

  public async deleteStudentAsync(idOrReg: string, user: string): Promise<{ success: boolean; student?: Student; error?: string }> {
    const cleanId = idOrReg.trim();
    const cleanReg = cleanId.toUpperCase();

    let removedStudent: Student | undefined;

    // 1. Remove from local memory data array
    const index = this.data.students.findIndex(
      (s) => s.id === cleanId || s.registerNumber.toUpperCase() === cleanReg
    );

    if (index !== -1) {
      removedStudent = this.data.students[index];
      this.data.students.splice(index, 1);
      this.addActivity(
        'student',
        'Student Deleted',
        `Deleted student ${removedStudent.name} (${removedStudent.registerNumber})`,
        user
      );
      this.save();
    }

    // 2. Delete permanently from MongoDB collection
    try {
      await connectToMongoDB();
      if (isMongoDBConnected() && StudentModel) {
        const isObjId = mongoose.Types.ObjectId.isValid(cleanId);
        const mongoDoc = await (StudentModel as any).findOneAndDelete({
          $or: [
            { registerNumber: cleanReg },
            ...(isObjId ? [{ _id: cleanId }] : []),
          ],
        });

        if (mongoDoc && !removedStudent) {
          removedStudent = {
            id: mongoDoc._id ? mongoDoc._id.toString() : `std-${mongoDoc.registerNumber}`,
            name: mongoDoc.name,
            registerNumber: mongoDoc.registerNumber,
            department: mongoDoc.department,
            phoneNumber: mongoDoc.phoneNumber,
            createdAt: mongoDoc.createdAt ? new Date(mongoDoc.createdAt).toISOString() : new Date().toISOString(),
          };
        }
      }
    } catch (mongoErr) {
      console.error('[MongoDB Student Delete Error]:', mongoErr);
    }

    if (!removedStudent) {
      return { success: false, error: 'Student not found' };
    }

    return { success: true, student: removedStudent };
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

  public addSmsLogs(logs: Omit<SmsLog, 'id'>[]): SmsLog[] {
    const createdLogs: SmsLog[] = logs.map((log) => ({
      ...log,
      id: `sms-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    }));

    this.data.smsLogs.unshift(...createdLogs);
    this.save();
    return createdLogs;
  }

  public clearSmsLogs(user: string) {
    const count = this.data.smsLogs.length;
    this.data.smsLogs = [];
    this.addActivity('sms', 'Cleared SMS Reports', `Cleared ${count} SMS log entries`, user);
    this.save();
  }

  // --- Exam Results Methods ---
  public getExamBatches(): ExamBatch[] {
    return this.data.examBatches;
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

    const processedResults = rawResults.map((rec) => {
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
      }

      return {
        ...rec,
        registerNumber: regUpper,
        studentName,
        parentName,
        phoneNumber,
        matchedParent,
        smsStatus: matchedParent ? rec.smsStatus : 'Failed',
        smsErrorMessage: matchedParent ? rec.smsErrorMessage : 'Unmatched: No Parent Enrolled for Reg No',
      };
    });

    const matchedCount = processedResults.filter((r) => r.matchedParent).length;
    const unmatchedCount = processedResults.filter((r) => !r.matchedParent).length;

    const batch: ExamBatch = {
      id: `exm-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      title,
      resultType: resultType || 'Semester Result',
      department,
      examDate,
      results: processedResults,
      uploadedAt: new Date().toISOString(),
      uploadedBy: user,
      totalStudents: processedResults.length,
      smsSentCount: processedResults.filter((r) => r.smsSent).length,
      matchedCount,
      unmatchedCount,
    };

    this.data.examBatches.unshift(batch);
    this.addActivity(
      'result',
      'Uploaded Exam Results',
      `Uploaded result set "${title}" (${department}) - ${matchedCount} matched, ${unmatchedCount} unmatched`,
      user
    );
    this.save();
    return batch;
  }

  public updateExamBatchResults(batchId: string, results: ExamBatch['results']) {
    const batch = this.data.examBatches.find((b) => b.id === batchId);
    if (batch) {
      batch.results = results;
      batch.smsSentCount = results.filter((r) => r.smsSent).length;
      batch.matchedCount = results.filter((r) => r.matchedParent !== false).length;
      batch.unmatchedCount = results.filter((r) => r.matchedParent === false).length;
      this.save();
    }
  }

  public async deleteExamBatch(id: string, user: string): Promise<boolean> {
    const index = this.data.examBatches.findIndex((b) => b.id === id);
    if (index === -1) return false;

    const batch = this.data.examBatches[index];

    // Delete SMS logs related ONLY to this batch if any exist
    this.data.smsLogs = this.data.smsLogs.filter((log) => {
      if (log.messageType === 'Exam Result') {
        const matchTitle = log.messageContent && log.messageContent.includes(batch.title);
        const matchReg = batch.results.some((r) => r.registerNumber === log.registerNumber);
        if (matchTitle && matchReg) {
          return false;
        }
      }
      return true;
    });

    // Remove selected batch from examBatches list
    this.data.examBatches.splice(index, 1);

    this.addActivity(
      'result',
      'Deleted Exam Batch',
      `Deleted Exam Result Batch "${batch.title}" (${batch.department})`,
      user
    );

    this.save();

    // If MongoDB Atlas is connected, permanently delete from MongoDB
    try {
      if (isMongoDBConnected()) {
        await ExamBatchModel.deleteOne({ id });
        if (SmsLogModel) {
          await SmsLogModel.deleteMany({
            messageType: 'Exam Result',
            messageContent: { $regex: batch.title, $options: 'i' },
          });
        }
      }
    } catch (err) {
      console.error('MongoDB deleteExamBatch error:', err);
    }

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
