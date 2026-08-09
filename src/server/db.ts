import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
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
  SmsTemplate,
  GatewaySettings,
  ActivityLog,
  LoginLog,
  ApiKey,
} from '../types.js';
import { INITIAL_API_KEYS } from '../config/apiKeys.js';

const DATA_DIR = path.join(process.cwd(), 'data');
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
    templateText: 'Dear Parent/Student, Result for {regNo} ({name}) - {department}: Total Marks: {marks}. Result: {status}. - VY NEXTGEN TECHNOLOGY',
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
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
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
    const cleanUserId = userId.trim().toUpperCase();
    const cleanRole = requestedRole ? requestedRole.trim().toLowerCase() : null;

    const found = this.data.users.find(
      (u) => u.userId.toUpperCase() === cleanUserId
    );

    if (!found) {
      return null;
    }

    // STRICT ROLE CHECK: If role was requested, user role MUST match!
    if (cleanRole && found.role.toLowerCase() !== cleanRole) {
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

  public getActivityLogs() {
    return this.data.activityLogs;
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

  public getLoginLogs() {
    return this.data.loginLogs || [];
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
    return this.data.users.map(({ rawPassword, ...user }) => user);
  }

  public addUser(
    userData: { userId: string; name: string; role: UserRole; department?: string; phoneNumber?: string; rawPassword?: string; permissions?: Permission[] },
    user: string
  ): User {
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

    const { rawPassword, ...safeUser } = newUser;
    return safeUser;
  }

  public deleteUser(id: string, user: string): boolean {
    const index = this.data.users.findIndex((u) => u.id === id);
    if (index === -1) return false;
    const removed = this.data.users[index];
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

  public addStudent(studentData: Omit<Student, 'id' | 'createdAt'>, user: string): Student {
    const existing = this.data.students.find(
      (s) => s.registerNumber.toUpperCase() === studentData.registerNumber.toUpperCase()
    );

    if (existing) {
      throw new Error(`Student with Register Number ${studentData.registerNumber} already exists`);
    }

    const newStudent: Student = {
      ...studentData,
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

  public updateStudent(id: string, updates: Partial<Omit<Student, 'id' | 'createdAt'>>, user: string): Student {
    const index = this.data.students.findIndex((s) => s.id === id);
    if (index === -1) throw new Error('Student not found');

    if (updates.registerNumber) {
      const conflict = this.data.students.find(
        (s) => s.id !== id && s.registerNumber.toUpperCase() === updates.registerNumber?.toUpperCase()
      );
      if (conflict) throw new Error(`Register number ${updates.registerNumber} already assigned to another student`);
    }

    this.data.students[index] = {
      ...this.data.students[index],
      ...updates,
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

  public deleteStudent(id: string, user: string): boolean {
    const index = this.data.students.findIndex((s) => s.id === id);
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

  public importStudentsBatch(students: Omit<Student, 'id' | 'createdAt'>[], user: string) {
    let addedCount = 0;
    let skippedCount = 0;

    for (const std of students) {
      const exists = this.data.students.some(
        (s) => s.registerNumber.toUpperCase() === std.registerNumber.toUpperCase()
      );
      if (exists) {
        skippedCount++;
        continue;
      }

      const newStudent: Student = {
        ...std,
        id: `std-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        createdAt: new Date().toISOString(),
      };
      this.data.students.push(newStudent);
      addedCount++;
    }

    this.addActivity(
      'student',
      'Batch Import Students',
      `Batch imported ${addedCount} students (${skippedCount} duplicates skipped)`,
      user
    );
    this.save();
    return { addedCount, skippedCount, total: this.data.students.length };
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
    user: string
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
  public getDashboardStats() {
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

    // Recent activity
    const recentActivity = this.data.activityLogs.slice(0, 15);

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
      recentActivity,
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
