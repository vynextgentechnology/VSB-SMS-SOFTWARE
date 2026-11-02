import 'dotenv/config';
import express from 'express';
import path from 'path';
import fs from 'fs';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import { GoogleGenAI } from '@google/genai';
import { createServer as createViteServer } from 'vite';
import { db, normalizeAcademicYear } from './src/server/db.js';
import { getMongoDBConnectionDetails } from './src/server/mongo.js';
import { sendSMS, getSmsApiKeyPoolStatus, rotateToNextKey } from './src/server/smsService.js';
import { evaluateSubjectGrade, evaluateInternalMark } from './src/utils/gradeEvaluator.js';

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB max limit
});

const JWT_SECRET = process.env.JWT_SECRET || 'VSB_ENGINEERING_COLLEGE_SECRET_KEY_2026';

// Helper function for lazy initialization of Google GenAI SDK client
function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error('GEMINI_API_KEY is missing or unconfigured in environment variables (.env).');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '10mb' }));

// Enable CORS and custom headers
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, x-user-id, x-api-key');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Middleware to extract user info from Authorization JWT header, API Key, or x-user-id header
app.use((req, res, next) => {
  const apiKeyHeader = (req.headers['x-api-key'] as string) || (req.headers['authorization']?.startsWith('Bearer vsb_live_sk_') ? req.headers['authorization'].replace('Bearer ', '') : null);

  if (apiKeyHeader) {
    const keyVal = db.validateApiKey(apiKeyHeader);
    if (keyVal.valid && keyVal.key) {
      (req as any).apiKeyInfo = keyVal.key;
      (req as any).currentUser = keyVal.key.name;
      (req as any).userRole = keyVal.key.role;
      return next();
    }
  }

  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as any;
      (req as any).user = decoded;
      (req as any).currentUser = decoded.userId || 'VSBEC';
      (req as any).userRole = decoded.role || (decoded.userId?.toUpperCase() === 'VYNEXTGEN' ? 'SUPER_ADMIN' : 'ADMIN');
      return next();
    } catch (err) {
      // Invalid or expired token, fall back to x-user-id header
    }
  }
  const userId = (req.headers['x-user-id'] as string) || 'VSBEC';
  (req as any).currentUser = userId;
  const dbUser = db.getUserByUserId(userId);
  (req as any).userRole = dbUser?.role || (userId.toUpperCase() === 'VYNEXTGEN' ? 'SUPER_ADMIN' : 'ADMIN');
  next();
});

// --- API ROUTES ---

// Health Check Endpoint
app.get(['/api/health', '/health'], (req, res) => {
  return res.json({
    success: true,
    message: 'API is running'
  });
});

// Auth Routes (Strict Role-Based Authentication)
app.get('/api/auth/me', async (req, res) => {
  try {
    const userId = (req as any).currentUser || (req.headers['x-user-id'] as string);
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Not authenticated', error: 'Not authenticated' });
    }
    const user = await db.getUserByUserIdAsync(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found', error: 'User not found' });
    }
    return res.json({ success: true, user });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message || 'Failed to fetch user session' });
  }
});

app.get('/api/auth/setup-status', (req, res) => {
  return res.json({ success: true, hasAdmin: db.hasAdmin() });
});

app.post('/api/auth/setup-admin', (req, res) => {
  try {
    const { name, userId, password, department } = req.body;
    if (!name || !userId || !password) {
      return res.status(400).json({ success: false, message: 'Name, User ID, and Password are required for admin setup' });
    }
    const adminUser = db.setupInitialAdmin(name, userId, password, department || 'General');
    const authResult = db.authenticate(userId, password, 'admin', JWT_SECRET);
    return res.json({
      success: true,
      message: 'Admin account created successfully',
      user: adminUser,
      token: authResult?.token,
    });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message || 'Failed to setup admin account' });
  }
});

app.post(['/api/auth/login', '/api/login'], async (req, res) => {
  try {
    const rawUserId = req.body?.userId || req.body?.username || req.body?.user || '';
    const rawPassword = req.body?.password || req.body?.pass || '';
    const rawRole = req.body?.role || '';

    const userId = rawUserId.toString().trim();
    const password = rawPassword.toString();
    const role = rawRole ? rawRole.toString().trim().toLowerCase() : undefined;

    if (!userId || !password) {
      return res.status(400).json({
        success: false,
        message: 'Username and password are required',
      });
    }

    const result = await db.authenticateAsync(userId, password, role, JWT_SECRET);
    if (!result) {
      return res.status(401).json({
        success: false,
        message: 'Invalid username or password',
      });
    }

    const userObj = {
      id: result.user.id,
      userId: result.user.userId,
      username: result.user.userId,
      name: result.user.name,
      role: result.user.role.toUpperCase(),
      department: result.user.department || 'General',
      phoneNumber: result.user.phoneNumber || '',
      permissions: result.user.permissions || [],
    };

    return res.json({
      success: true,
      message: 'Login successful',
      user: userObj,
      token: result.token,
    });
  } catch (err: any) {
    console.error('[Auth Login Error]:', err);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
});

app.post('/api/auth/logout', (req, res) => {
  try {
    const userId = (req as any).currentUser || 'VSBEC';
    db.recordLogout(userId);
    return res.json({ success: true, message: 'Logged out successfully' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Login / Logout History
app.get('/api/login-history', (req, res) => {
  try {
    const role = (req as any).userRole || '';
    const logs = db.getLoginLogs(role);
    return res.json(logs);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// --- REPORT DOWNLOAD ENDPOINTS (CSV / Excel format) ---
app.get('/api/reports/login-history', (req, res) => {
  try {
    const role = (req as any).userRole || '';
    const logs = db.getLoginLogs(role);
    const headers = ['User ID', 'Name', 'Role', 'Department', 'Action', 'Timestamp'];
    const rows = logs.map(l => [l.userId, l.name, l.role.toUpperCase(), l.department || 'General', l.action.toUpperCase(), new Date(l.timestamp).toLocaleString()]);
    const csvContent = [headers.join(','), ...rows.map(r => r.map(c => `"${c}"`).join(','))].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="login_history_report.csv"');
    return res.send(csvContent);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.get('/api/reports/students', async (req, res) => {
  try {
    const students = await db.getStudentsAsync();
    const headers = ['Register Number', 'Student Name', 'Academic Year', 'Department', 'Parent Mobile Number', 'Student Mobile Number', 'Email', 'Gender', 'Enrolled Date'];
    const rows = students.map(s => [
      s.registerNumber,
      s.name,
      s.academicYear || s.year || '1st Year',
      s.department,
      s.parentMobile || s.phoneNumber || '',
      s.studentMobile || '',
      s.email || '',
      s.gender || '',
      new Date(s.createdAt).toLocaleString()
    ]);
    const csvContent = [headers.join(','), ...rows.map(r => r.map(c => `"${c}"`).join(','))].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="vsb_student_records_report.csv"');
    return res.send(csvContent);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.get('/api/reports/sms-logs', (req, res) => {
  try {
    const logs = db.getSmsLogs();
    const headers = ['Recipient', 'Register Number', 'Phone Number', 'Department', 'Type', 'Content', 'Status', 'Sent By', 'Sent At'];
    const rows = logs.map(l => [l.recipientName, l.registerNumber, l.phoneNumber, l.department, l.messageType, l.messageContent.replace(/[\r\n]+/g, ' '), l.status, l.sentBy, new Date(l.sentAt).toLocaleString()]);
    const csvContent = [headers.join(','), ...rows.map(r => r.map(c => `"${c}"`).join(','))].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="sms_logs_report.csv"');
    return res.send(csvContent);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Dashboard Stats (Year-Wise & Department-Wise with Staff Scope Filtering)
app.get('/api/dashboard/stats', async (req, res) => {
  try {
    const role = (req as any).userRole || '';
    const userId = (req as any).currentUser || '';
    const dbUser = (await db.getUserByUserIdAsync(userId)) || db.getUserByUserId(userId);
    const stats = db.getDashboardStats(role, dbUser || undefined);
    return res.json(stats);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Student Management (Year-Wise, Department-Wise & Scope-Enforced)
app.get('/api/students', async (req, res) => {
  try {
    let students = await db.getStudentsAsync();
    const currentUserId = (req as any).currentUser || '';
    const userRole = ((req as any).userRole || '').toUpperCase();
    const dbUser = (await db.getUserByUserIdAsync(currentUserId)) || db.getUserByUserId(currentUserId);

    // Enforce Staff/HOD assigned scopes
    if ((userRole === 'STAFF' || userRole === 'HOD') && dbUser) {
      students = students.filter(s => db.canUserAccessStudent(dbUser, s));
    }

    // Filter by academic year
    const { academicYear, year, department, search } = req.query as any;
    const filterYear = academicYear || year;
    if (filterYear && filterYear !== 'ALL' && filterYear !== 'All Years') {
      const targetYearNorm = normalizeAcademicYear(filterYear);
      students = students.filter(s => normalizeAcademicYear(s.academicYear || s.year) === targetYearNorm);
    }

    // Filter by department
    if (department && department !== 'ALL' && department !== 'All Departments') {
      const targetDept = department.toString().trim().toUpperCase();
      students = students.filter(s => (s.department || '').toUpperCase() === targetDept);
    }

    // Filter by search query
    if (search && search.toString().trim()) {
      const q = search.toString().trim().toUpperCase();
      students = students.filter(s =>
        s.name.toUpperCase().includes(q) ||
        s.registerNumber.toUpperCase().includes(q) ||
        (s.parentMobile && s.parentMobile.includes(q)) ||
        (s.phoneNumber && s.phoneNumber.includes(q)) ||
        (s.studentMobile && s.studentMobile.includes(q))
      );
    }

    return res.json(students);
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message || 'Failed to fetch students' });
  }
});

app.post('/api/students', async (req, res) => {
  try {
    const {
      name,
      registerNumber,
      department,
      academicYear,
      year,
      section,
      phoneNumber,
      parentMobile,
      studentMobile,
      email,
      gender
    } = req.body;

    const primaryPhone = parentMobile || phoneNumber;
    if (!name || !registerNumber || !department || !primaryPhone) {
      return res.status(400).json({
        success: false,
        message: 'Student Name, Register Number, Department, and Parent Mobile Number are required'
      });
    }

    const normYear = normalizeAcademicYear(academicYear || year || '1st Year');
    const currentUserId = (req as any).currentUser || '';
    const userRole = ((req as any).userRole || '').toUpperCase();
    const dbUser = (await db.getUserByUserIdAsync(currentUserId)) || db.getUserByUserId(currentUserId);

    // Permission check for Staff
    if (userRole === 'STAFF' && dbUser) {
      const allowed = db.canUserAccessStudent(dbUser, {
        department,
        academicYear: normYear,
      } as any);
      if (!allowed) {
        return res.status(403).json({
          success: false,
          message: `Access Denied: Your staff account can only manage assigned academic years and departments.`
        });
      }
    }

    const newStudent = await db.addStudentAsync(
      {
        name,
        registerNumber,
        department,
        academicYear: normYear,
        year: normYear,
        section: section || '',
        phoneNumber: primaryPhone,
        parentMobile: primaryPhone,
        studentMobile: studentMobile || '',
        email: email || '',
        gender: gender || '',
      },
      (req as any).currentUser
    );
    return res.status(201).json(newStudent);
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

app.post(['/api/students/bulk-import', '/api/students/batch'], async (req, res) => {
  try {
    const rawStudents = req.body?.students || req.body?.records || (Array.isArray(req.body) ? req.body : []);

    if (!Array.isArray(rawStudents) || rawStudents.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Array of student records is required.',
        error: 'No student records provided in payload',
        total: 0,
        created: 0,
        updated: 0,
        failed: 0,
        addedCount: 0,
        skippedCount: 0,
      });
    }

    const validStudents: Array<any> = [];
    let invalidCount = 0;

    rawStudents.forEach((std: any) => {
      const name = (std.name || std.studentName || '').toString().trim();
      const registerNumber = (std.registerNumber || std.regNo || std.registerNo || '').toString().trim().toUpperCase();
      const department = (std.department || std.dept || 'CSE').toString().trim().toUpperCase();
      const parentMobile = (std.parentMobile || std.phoneNumber || std.phone || std.mobile || '').toString().trim().replace(/\D/g, '').slice(-10);
      const studentMobile = (std.studentMobile || '').toString().trim().replace(/\D/g, '').slice(-10);
      const academicYear = normalizeAcademicYear(std.academicYear || std.year || req.body?.targetAcademicYear || '1st Year');

      if (name && registerNumber && parentMobile.length === 10) {
        validStudents.push({
          name,
          registerNumber,
          department: department || 'CSE',
          academicYear,
          year: academicYear,
          section: std.section || '',
          phoneNumber: parentMobile,
          parentMobile,
          studentMobile,
          email: std.email || '',
          gender: std.gender || '',
        });
      } else {
        invalidCount++;
      }
    });

    if (validStudents.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid student records found in payload. Each record must include Name, Register Number, and a 10-digit Parent Mobile Number.',
        error: 'Validation failed for all student records',
        total: rawStudents.length,
        created: 0,
        updated: 0,
        failed: rawStudents.length,
        addedCount: 0,
        skippedCount: 0,
      });
    }

    const currentUser = (req as any).currentUser || (req.headers['x-user-id'] as string) || 'VSBEC';
    const importResult = await db.importStudentsBatchAsync(validStudents, currentUser);

    const created = importResult.addedCount;
    const updated = importResult.updatedCount || importResult.skippedCount;

    return res.json({
      success: true,
      message: `Student enrollment processed! ${validStudents.length} records handled (${created} created, ${updated} updated${invalidCount > 0 ? `, ${invalidCount} invalid skipped` : ''}).`,
      total: rawStudents.length,
      created,
      updated,
      failed: invalidCount,
      addedCount: created,
      skippedCount: updated,
      updatedCount: updated,
    });
  } catch (err: any) {
    console.error('[Student Bulk Import Fatal Error]:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to process student enrollment import.',
      error: err.message || 'Server error during student import',
    });
  }
});

// Excel Preview Endpoint (Validates records and checks duplicates before importing)
app.post('/api/students/preview-excel', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No Excel file selected. Please choose a valid .xlsx, .xls, or .csv file.' });
    }

    const origName = req.file.originalname || '';
    if (!origName.match(/\.(xlsx|xls|csv)$/i)) {
      return res.status(400).json({ error: 'Unsupported file format. Please upload .xlsx, .xls, or .csv.' });
    }

    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    if (!workbook || !workbook.SheetNames || workbook.SheetNames.length === 0) {
      return res.status(400).json({ error: 'Excel file contains no worksheet sheets.' });
    }

    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const rawRows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

    if (!rawRows || rawRows.length === 0) {
      return res.status(400).json({ error: 'Worksheet is completely empty.' });
    }

    let headerRowIdx = -1;
    for (let i = 0; i < Math.min(10, rawRows.length); i++) {
      if (rawRows[i] && rawRows[i].some((cell: any) => cell !== null && cell !== undefined && String(cell).trim().length > 0)) {
        headerRowIdx = i;
        break;
      }
    }

    if (headerRowIdx === -1) {
      return res.status(400).json({ error: 'Could not locate header row in Excel worksheet.' });
    }

    const headers = rawRows[headerRowIdx].map((h: any) => (h !== null && h !== undefined ? String(h).trim() : ''));
    let nameIdx = -1;
    let regNoIdx = -1;
    let deptIdx = -1;
    let parentPhoneIdx = -1;
    let studentPhoneIdx = -1;
    let yearIdx = -1;
    let emailIdx = -1;
    let genderIdx = -1;
    let sectionIdx = -1;

    headers.forEach((h, idx) => {
      const clean = h.toUpperCase().replace(/[^A-Z0-9\s_]/g, '').trim();
      if (/^(REGISTER|REG|REGISTRATION|REGISTER NO|REG NO|REGISTER NUMBER|STUDENT ID|ROLL NO|REG_NO)$/.test(clean) || clean.includes('REGISTER') || clean.includes('REG NO') || clean.includes('ROLL')) {
        if (regNoIdx === -1) regNoIdx = idx;
      } else if (/^(NAME|STUDENT NAME|STUDENT_NAME|FULL NAME)$/.test(clean) || clean.includes('STUDENT NAME') || clean === 'NAME') {
        if (nameIdx === -1) nameIdx = idx;
      } else if (/^(DEPARTMENT|DEPT|BRANCH|DEPT CODE|STREAM)$/.test(clean) || clean.includes('DEPT') || clean.includes('BRANCH')) {
        if (deptIdx === -1) deptIdx = idx;
      } else if (/^(PARENT MOBILE|PARENT PHONE|PARENT_PHONE|GUARDIAN PHONE|FATHER MOBILE|MOTHER MOBILE)$/.test(clean) || clean.includes('PARENT')) {
        if (parentPhoneIdx === -1) parentPhoneIdx = idx;
      } else if (/^(STUDENT MOBILE|STUDENT PHONE|STUDENT_PHONE|OWN MOBILE|CANDIDATE PHONE)$/.test(clean) || clean.includes('STUDENT MOBILE') || clean.includes('STUDENT PHONE')) {
        if (studentPhoneIdx === -1) studentPhoneIdx = idx;
      } else if (/^(MOBILE|PHONE|PHONE NUMBER|CONTACT|MOBILE NO)$/.test(clean) || clean.includes('MOBILE') || clean.includes('PHONE')) {
        if (parentPhoneIdx === -1) parentPhoneIdx = idx;
      } else if (/^(YEAR|ACADEMIC YEAR|ACADEMIC_YEAR|CLASS|CURRENT YEAR)$/.test(clean) || clean.includes('YEAR')) {
        if (yearIdx === -1) yearIdx = idx;
      } else if (/^(EMAIL|E-MAIL|MAIL|STUDENT EMAIL)$/.test(clean) || clean.includes('EMAIL') || clean.includes('MAIL')) {
        if (emailIdx === -1) emailIdx = idx;
      } else if (/^(GENDER|SEX)$/.test(clean)) {
        if (genderIdx === -1) genderIdx = idx;
      } else if (/^(SECTION|SEC)$/.test(clean)) {
        if (sectionIdx === -1) sectionIdx = idx;
      }
    });

    if (nameIdx === -1 && headers.length > 0) nameIdx = 0;
    if (regNoIdx === -1 && headers.length > 1) regNoIdx = 1;
    if (deptIdx === -1 && headers.length > 2) deptIdx = 2;
    if (parentPhoneIdx === -1 && headers.length > 3) parentPhoneIdx = 3;

    const existingStudents = await db.getStudentsAsync();
    const existingRegMap = new Set(existingStudents.map(s => s.registerNumber.toUpperCase()));

    const fallbackYear = normalizeAcademicYear(req.query?.academicYear || req.body?.academicYear || '1st Year');
    const fallbackDept = (req.query?.department || req.body?.department || 'CSE').toString().toUpperCase();

    const previewRows: any[] = [];
    const validRows: any[] = [];
    const invalidRows: any[] = [];
    const seenRegNosInFile = new Set<string>();
    const duplicateRegNosInFile = new Set<string>();
    const duplicatesInDb: string[] = [];

    for (let r = headerRowIdx + 1; r < rawRows.length; r++) {
      const row = rawRows[r];
      if (!row || row.length === 0) continue;

      const name = nameIdx >= 0 && row[nameIdx] !== undefined ? String(row[nameIdx]).trim() : '';
      const registerNumber = regNoIdx >= 0 && row[regNoIdx] !== undefined ? String(row[regNoIdx]).trim().toUpperCase() : '';
      const department = deptIdx >= 0 && row[deptIdx] !== undefined ? String(row[deptIdx]).trim().toUpperCase() : fallbackDept;
      const rawParentPhone = parentPhoneIdx >= 0 && row[parentPhoneIdx] !== undefined ? String(row[parentPhoneIdx]).trim().replace(/\D/g, '') : '';
      const parentMobile = rawParentPhone.slice(-10);
      const studentMobile = studentPhoneIdx >= 0 && row[studentPhoneIdx] !== undefined ? String(row[studentPhoneIdx]).trim().replace(/\D/g, '').slice(-10) : '';
      const academicYear = yearIdx >= 0 && row[yearIdx] !== undefined && String(row[yearIdx]).trim()
        ? normalizeAcademicYear(String(row[yearIdx]).trim())
        : fallbackYear;
      const email = emailIdx >= 0 && row[emailIdx] !== undefined ? String(row[emailIdx]).trim() : '';
      const gender = genderIdx >= 0 && row[genderIdx] !== undefined ? String(row[genderIdx]).trim() : '';
      const section = sectionIdx >= 0 && row[sectionIdx] !== undefined ? String(row[sectionIdx]).trim() : '';

      if (!name && !registerNumber && !parentMobile) continue;

      const errors: string[] = [];
      if (!name) errors.push('Missing Name');
      if (!registerNumber) errors.push('Missing Register Number');
      if (!parentMobile || parentMobile.length !== 10) errors.push('Invalid Parent Mobile (Must be 10 digits)');
      
      if (registerNumber) {
        if (seenRegNosInFile.has(registerNumber)) {
          duplicateRegNosInFile.add(registerNumber);
          errors.push('Duplicate Register Number in this file');
        } else {
          seenRegNosInFile.add(registerNumber);
        }
        if (existingRegMap.has(registerNumber)) {
          duplicatesInDb.push(registerNumber);
        }
      }

      const isValid = errors.length === 0;
      const rowItem = {
        rowNumber: r + 1,
        name,
        registerNumber,
        department: department || fallbackDept,
        academicYear,
        parentMobile,
        studentMobile,
        email,
        gender,
        section,
        isValid,
        errors,
        existsInDb: existingRegMap.has(registerNumber),
      };

      previewRows.push(rowItem);
      if (isValid) {
        validRows.push(rowItem);
      } else {
        invalidRows.push(rowItem);
      }
    }

    return res.json({
      success: true,
      headers,
      totalCount: previewRows.length,
      validCount: validRows.length,
      invalidCount: invalidRows.length,
      duplicateCountInFile: duplicateRegNosInFile.size,
      duplicateCountInDb: duplicatesInDb.length,
      rows: previewRows,
      validRows,
      invalidRows,
      duplicateRegNosInFile: Array.from(duplicateRegNosInFile),
      duplicatesInDb,
    });
  } catch (err: any) {
    console.error('[Excel Preview Error]:', err);
    return res.status(500).json({ error: `Failed to preview Excel: ${err.message || 'Unknown error'}` });
  }
});

// Excel Student Upload (Saves Validated Records Directly to Database)
app.post('/api/students/upload-excel', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No Excel file selected. Please choose a valid .xlsx or .xls file.' });
    }

    const origName = req.file.originalname || '';
    if (!origName.match(/\.(xlsx|xls|csv)$/i)) {
      return res.status(400).json({ error: 'Unsupported file format. Please upload .xlsx, .xls, or .csv.' });
    }

    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    if (!workbook || !workbook.SheetNames || workbook.SheetNames.length === 0) {
      return res.status(400).json({ error: 'Excel file contains no worksheet sheets.' });
    }

    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const rawRows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

    if (!rawRows || rawRows.length === 0) {
      return res.status(400).json({ error: 'Excel worksheet is completely empty.' });
    }

    let headerRowIdx = -1;
    for (let i = 0; i < Math.min(10, rawRows.length); i++) {
      if (rawRows[i] && rawRows[i].some((cell: any) => cell !== null && cell !== undefined && String(cell).trim().length > 0)) {
        headerRowIdx = i;
        break;
      }
    }

    if (headerRowIdx === -1) {
      return res.status(400).json({ error: 'Could not locate header row in Excel worksheet.' });
    }

    const headers = rawRows[headerRowIdx].map((h: any) => (h !== null && h !== undefined ? String(h).trim() : ''));
    let nameIdx = -1;
    let regNoIdx = -1;
    let deptIdx = -1;
    let parentPhoneIdx = -1;
    let studentPhoneIdx = -1;
    let yearIdx = -1;
    let emailIdx = -1;
    let genderIdx = -1;
    let sectionIdx = -1;

    headers.forEach((h, idx) => {
      const clean = h.toUpperCase().replace(/[^A-Z0-9\s_]/g, '').trim();
      if (/^(REGISTER|REG|REGISTRATION|REGISTER NO|REG NO|REGISTER NUMBER|STUDENT ID|ROLL NO|REG_NO)$/.test(clean) || clean.includes('REGISTER') || clean.includes('REG NO') || clean.includes('ROLL')) {
        if (regNoIdx === -1) regNoIdx = idx;
      } else if (/^(NAME|STUDENT NAME|STUDENT_NAME|FULL NAME)$/.test(clean) || clean.includes('STUDENT NAME') || clean === 'NAME') {
        if (nameIdx === -1) nameIdx = idx;
      } else if (/^(DEPARTMENT|DEPT|BRANCH|DEPT CODE|STREAM)$/.test(clean) || clean.includes('DEPT') || clean.includes('BRANCH')) {
        if (deptIdx === -1) deptIdx = idx;
      } else if (/^(PARENT MOBILE|PARENT PHONE|PARENT_PHONE|GUARDIAN PHONE|FATHER MOBILE|MOTHER MOBILE)$/.test(clean) || clean.includes('PARENT')) {
        if (parentPhoneIdx === -1) parentPhoneIdx = idx;
      } else if (/^(STUDENT MOBILE|STUDENT PHONE|STUDENT_PHONE|OWN MOBILE|CANDIDATE PHONE)$/.test(clean) || clean.includes('STUDENT MOBILE') || clean.includes('STUDENT PHONE')) {
        if (studentPhoneIdx === -1) studentPhoneIdx = idx;
      } else if (/^(MOBILE|PHONE|PHONE NUMBER|CONTACT|MOBILE NO)$/.test(clean) || clean.includes('MOBILE') || clean.includes('PHONE')) {
        if (parentPhoneIdx === -1) parentPhoneIdx = idx;
      } else if (/^(YEAR|ACADEMIC YEAR|ACADEMIC_YEAR|CLASS|CURRENT YEAR)$/.test(clean) || clean.includes('YEAR')) {
        if (yearIdx === -1) yearIdx = idx;
      } else if (/^(EMAIL|E-MAIL|MAIL|STUDENT EMAIL)$/.test(clean) || clean.includes('EMAIL') || clean.includes('MAIL')) {
        if (emailIdx === -1) emailIdx = idx;
      } else if (/^(GENDER|SEX)$/.test(clean)) {
        if (genderIdx === -1) genderIdx = idx;
      } else if (/^(SECTION|SEC)$/.test(clean)) {
        if (sectionIdx === -1) sectionIdx = idx;
      }
    });

    if (nameIdx === -1 && headers.length > 0) nameIdx = 0;
    if (regNoIdx === -1 && headers.length > 1) regNoIdx = 1;
    if (deptIdx === -1 && headers.length > 2) deptIdx = 2;
    if (parentPhoneIdx === -1 && headers.length > 3) parentPhoneIdx = 3;

    const fallbackYear = normalizeAcademicYear(req.query?.academicYear || req.body?.academicYear || '1st Year');
    const fallbackDept = (req.query?.department || req.body?.department || 'CSE').toString().toUpperCase();

    const parsedStudents: Array<any> = [];
    const validationErrors: string[] = [];
    const seenReg = new Set<string>();

    for (let r = headerRowIdx + 1; r < rawRows.length; r++) {
      const row = rawRows[r];
      if (!row || row.length === 0) continue;

      const name = nameIdx >= 0 && row[nameIdx] !== undefined ? String(row[nameIdx]).trim() : '';
      const registerNumber = regNoIdx >= 0 && row[regNoIdx] !== undefined ? String(row[regNoIdx]).trim().toUpperCase() : '';
      const department = deptIdx >= 0 && row[deptIdx] !== undefined ? String(row[deptIdx]).trim().toUpperCase() : fallbackDept;
      const rawParentPhone = parentPhoneIdx >= 0 && row[parentPhoneIdx] !== undefined ? String(row[parentPhoneIdx]).trim().replace(/\D/g, '') : '';
      const parentMobile = rawParentPhone.slice(-10);
      const studentMobile = studentPhoneIdx >= 0 && row[studentPhoneIdx] !== undefined ? String(row[studentPhoneIdx]).trim().replace(/\D/g, '').slice(-10) : '';
      const academicYear = yearIdx >= 0 && row[yearIdx] !== undefined && String(row[yearIdx]).trim()
        ? normalizeAcademicYear(String(row[yearIdx]).trim())
        : fallbackYear;
      const email = emailIdx >= 0 && row[emailIdx] !== undefined ? String(row[emailIdx]).trim() : '';
      const gender = genderIdx >= 0 && row[genderIdx] !== undefined ? String(row[genderIdx]).trim() : '';
      const section = sectionIdx >= 0 && row[sectionIdx] !== undefined ? String(row[sectionIdx]).trim() : '';

      if (!name && !registerNumber && !parentMobile) continue;

      if (!registerNumber) {
        validationErrors.push(`Row ${r + 1}: Missing Register Number`);
        continue;
      }
      if (!name) {
        validationErrors.push(`Row ${r + 1} (${registerNumber}): Missing Student Name`);
        continue;
      }
      if (!parentMobile || parentMobile.length !== 10) {
        validationErrors.push(`Row ${r + 1} (${registerNumber}): Invalid 10-digit Parent Mobile`);
        continue;
      }

      if (seenReg.has(registerNumber)) {
        validationErrors.push(`Row ${r + 1} (${registerNumber}): Duplicate Register Number in spreadsheet`);
        continue;
      }
      seenReg.add(registerNumber);

      parsedStudents.push({
        name,
        registerNumber,
        department: department || fallbackDept,
        academicYear,
        year: academicYear,
        section,
        phoneNumber: parentMobile,
        parentMobile,
        studentMobile,
        email,
        gender,
      });
    }

    if (parsedStudents.length === 0) {
      return res.status(400).json({
        error: `No valid student records found. ${validationErrors.slice(0, 5).join('; ')}`,
        validationErrors,
      });
    }

    const currentUser = (req as any).currentUser || 'VSBEC';
    const result = await db.importStudentsBatchAsync(parsedStudents, currentUser);

    return res.json({
      success: true,
      message: `Excel import completed: ${result.addedCount} created, ${result.updatedCount || result.skippedCount} updated.`,
      added: result.addedCount,
      updated: result.updatedCount || result.skippedCount,
      totalParsed: parsedStudents.length,
      validationWarnings: validationErrors.length > 0 ? validationErrors : undefined,
    });
  } catch (err: any) {
    console.error('[Excel Upload Fatal Server Error]:', err);
    return res.status(500).json({ error: `Internal server error during Excel processing: ${err.message || 'Unknown error'}` });
  }
});

// Update Student Record with Detailed Field-Level Audit Trail
app.put('/api/students/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const currentUserId = (req as any).currentUser || 'VSBEC';
    const userRole = ((req as any).userRole || '').toUpperCase();
    const dbUser = (await db.getUserByUserIdAsync(currentUserId)) || db.getUserByUserId(currentUserId);

    // Permission enforcement for Staff
    if (userRole === 'STAFF' && dbUser) {
      const students = await db.getStudentsAsync();
      const existing = students.find(s => s.id === id || s.registerNumber.toUpperCase() === id.toUpperCase());
      if (existing && !db.canUserAccessStudent(dbUser, existing)) {
        return res.status(403).json({
          success: false,
          message: 'Access Denied: You cannot modify students outside your assigned academic years and departments.'
        });
      }
    }

    const userObj = {
      userId: currentUserId,
      name: (req as any).user?.name || currentUserId,
      role: userRole,
    };

    const updated = await db.updateStudentAsync(id, req.body, currentUserId, userObj.name, userRole);
    return res.json(updated);
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

// Student Modification Audit Trail Endpoint (Admin & Staff Oversight)
app.get('/api/students/audit-history', async (req, res) => {
  try {
    const { registerNumber, department, academicYear } = req.query as any;
    const history = await db.getStudentModificationHistories({
      registerNumber,
      department,
      academicYear,
    });
    return res.json(history);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Academic Year Promotion Endpoints
app.get(['/api/promotion/preview', '/api/students/promote/preview'], async (req, res) => {
  try {
    const filters = {
      year: (req.query.year as string) || undefined,
      department: (req.query.department as string) || undefined,
    };
    const preview = await db.previewAcademicYearPromotion(filters);
    return res.json(preview);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Dedicated /api/students/promote endpoint (with /api/promotion/execute alias)
app.post(['/api/students/promote', '/api/promotion/execute'], async (req, res) => {
  try {
    const currentUserId = (req as any).currentUser || 'VSBEC';
    const userRole = ((req as any).userRole || '').toUpperCase();
    const isCollegeAdmin = userRole === 'ADMIN' || userRole === 'SUPER_ADMIN' ||
      currentUserId.toUpperCase() === 'VSBEC' || currentUserId.toUpperCase() === 'ADMIN' || currentUserId.toUpperCase() === 'VYNEXTGEN';

    if (!isCollegeAdmin) {
      return res.status(403).json({ error: 'Access Denied: Only College Administrators can execute Annual Academic Promotion.' });
    }

    // Normalize payload to handle various shapes
    const body = req.body || {};
    const payload: any = {
      academicSession: body.academicSession || `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`,
      notes: body.notes || 'Academic Year Promotion executed by Administrator',
    };

    if (body.studentRegisterNumbers) {
      payload.studentRegisterNumbers = body.studentRegisterNumbers;
    } else if (body.registerNumber) {
      payload.studentRegisterNumbers = [body.registerNumber];
    } else if (body.studentIds) {
      payload.studentIds = body.studentIds;
    } else if (body.studentId) {
      payload.studentIds = [body.studentId];
    }

    if (body.students) payload.students = body.students;
    if (body.selectedYears) payload.selectedYears = body.selectedYears;
    if (body.selectedDepartments) payload.selectedDepartments = body.selectedDepartments;

    const userName = (req as any).user?.name || currentUserId;
    const result = await db.executeAcademicYearPromotionAsync(payload, currentUserId, userName);
    return res.json({
      success: true,
      message: `Annual academic year promotion executed successfully for ${result.totalPromoted} students.`,
      totalPromoted: result.totalPromoted,
      successfulCount: result.successfulCount,
      failedCount: result.failedCount,
      details: result.details,
      promotedStudents: result.promotedStudents,
      failedStudents: result.failedStudents,
      result,
    });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

app.get('/api/promotion/history', async (req, res) => {
  try {
    const history = await db.getAcademicPromotionHistoryAsync();
    return res.json(history);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.get('/api/promotion/history/export', async (req, res) => {
  try {
    const history = await db.getAcademicPromotionHistoryAsync();
    const rows: string[] = [];
    rows.push('Student Name,Register Number,Department,Previous Year,New Year,Academic Session,Promoted By,Promotion Date,Status');

    for (const h of history) {
      if (h.studentRecords && h.studentRecords.length > 0) {
        for (const s of h.studentRecords) {
          const sName = `"${(s.studentName || '').replace(/"/g, '""')}"`;
          const sReg = `"${(s.registerNumber || '').replace(/"/g, '""')}"`;
          const sDept = `"${(s.department || '').replace(/"/g, '""')}"`;
          const sFrom = `"${(s.fromYear || '').replace(/"/g, '""')}"`;
          const sTo = `"${(s.toYear || '').replace(/"/g, '""')}"`;
          const sSession = `"${(h.academicSession || '').replace(/"/g, '""')}"`;
          const sBy = `"${(s.promotedByName || s.promotedBy || h.promotedByName || h.promotedBy || '').replace(/"/g, '""')}"`;
          const sDate = `"${(s.promotionDate || h.timestamp || '').replace(/"/g, '""')}"`;
          const sStatus = `"${(s.status || 'SUCCESS').replace(/"/g, '""')}"`;
          rows.push(`${sName},${sReg},${sDept},${sFrom},${sTo},${sSession},${sBy},${sDate},${sStatus}`);
        }
      } else if (h.promotions && h.promotions.length > 0) {
        for (const p of h.promotions) {
          rows.push(`"Cohort Batch","N/A","${p.department}","${p.fromYear}","${p.toYear}","${h.academicSession}","${h.promotedByName || h.promotedBy}","${h.timestamp}","SUCCESS (${p.count} students)"`);
        }
      }
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="VSB_Academic_Promotion_History.csv"');
    return res.send(rows.join('\n'));
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Clear All Students Endpoint (Permanent administrative wipe)
app.delete(['/api/students/all', '/api/students/clear-all', '/api/students'], async (req, res) => {
  try {
    const currentUserId = (req as any).currentUser || (req.headers['x-user-id'] as string) || 'VSBEC';
    const userRole = ((req as any).userRole || '').toUpperCase();
    const isCollegeAdmin = userRole === 'ADMIN' || userRole === 'SUPER_ADMIN' ||
      currentUserId.toUpperCase() === 'VSBEC' || currentUserId.toUpperCase() === 'ADMIN' || currentUserId.toUpperCase() === 'VYNEXTGEN';

    if (!isCollegeAdmin) {
      return res.status(403).json({ success: false, message: 'Access Denied: Only College Administrators can permanently clear all student records.' });
    }

    const result = await db.deleteAllStudentsAsync(currentUserId);
    return res.json({
      success: true,
      message: `Permanently deleted all ${result.deletedCount} student records from the database.`,
      deletedCount: result.deletedCount,
    });
  } catch (err: any) {
    console.error('[Student DELETE All Route Error]:', err);
    return res.status(500).json({
      success: false,
      message: err.message || 'Failed to clear all student records',
    });
  }
});

app.delete('/api/students/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!id || id === 'undefined') {
      return res.status(400).json({ success: false, message: 'Student ID or Register Number is required' });
    }

    const cleanId = id.trim();
    if (cleanId.toLowerCase() === 'all' || cleanId.toLowerCase() === 'clear-all') {
      const currentUserId = (req as any).currentUser || (req.headers['x-user-id'] as string) || 'VSBEC';
      const result = await db.deleteAllStudentsAsync(currentUserId);
      return res.json({
        success: true,
        message: `Permanently deleted all ${result.deletedCount} student records from the database.`,
        deletedCount: result.deletedCount,
      });
    }
    const cleanReg = cleanId.toUpperCase();

    // User authentication & role detection
    const authUser = (req as any).user;
    const currentUserId = (req as any).currentUser || (req.headers['x-user-id'] as string) || 'VSBEC';
    const dbUser = await db.getUserByUserIdAsync(currentUserId);

    let rawRole = (authUser?.role || dbUser?.role || '').toLowerCase();
    if (!rawRole) {
      if (currentUserId.toUpperCase().includes('ADMIN') || currentUserId.toUpperCase() === 'VSBEC') {
        rawRole = 'admin';
      } else if (currentUserId.toUpperCase().startsWith('HOD')) {
        rawRole = 'hod';
      } else {
        rawRole = 'staff';
      }
    }

    let userRole = rawRole;
    let userDepartment = (authUser?.department || dbUser?.department || 'General').toUpperCase();
    let userPermissions: string[] = authUser?.permissions || dbUser?.permissions || (userRole === 'admin' ? ['send_sms', 'upload_results', 'manage_students', 'manage_staff', 'view_reports', 'manage_settings', 'manage_parents'] : ['send_sms', 'upload_results', 'manage_students']);

    // Find student to verify department restrictions before deleting
    const students = await db.getStudentsAsync();
    const targetStudent = students.find(
      (s) =>
        s.id === cleanId ||
        s.registerNumber.toUpperCase() === cleanReg ||
        s.name.trim().toUpperCase() === cleanReg
    );

    // Permission enforcement
    if (userRole === 'admin' || userRole === 'super_admin') {
      // Full administrative permission
    } else if (userRole === 'hod') {
      if (targetStudent && targetStudent.department.toUpperCase() !== userDepartment && userDepartment !== 'ALL' && userDepartment !== 'GENERAL') {
        return res.status(403).json({
          success: false,
          message: `HODs are only permitted to delete students from their own department (${userDepartment})`,
        });
      }
    } else if (userRole === 'staff') {
      const hasStudentMgmtPerm = userPermissions.includes('manage_students') || userPermissions.includes('ALL');
      if (!hasStudentMgmtPerm) {
        return res.status(403).json({
          success: false,
          message: 'Staff account lacks manage_students permission required to delete student records',
        });
      }
      if (targetStudent && userDepartment !== 'GENERAL' && userDepartment !== 'ALL' && targetStudent.department.toUpperCase() !== userDepartment) {
        return res.status(403).json({
          success: false,
          message: `Staff are only permitted to delete students in their assigned department (${userDepartment})`,
        });
      }
    }

    const deleteResult = await db.deleteStudentAsync(cleanId, currentUserId);
    if (!deleteResult.success) {
      return res.status(404).json({
        success: false,
        message: deleteResult.error || 'Student could not be deleted',
      });
    }

    return res.json({
      success: true,
      message: 'Student deleted successfully',
      student: deleteResult.student,
    });
  } catch (err: any) {
    console.error('[Student DELETE Route Error]:', err);
    return res.status(500).json({
      success: false,
      message: err.message || 'Student could not be deleted',
    });
  }
});

// Department Management
app.get('/api/departments', async (req, res) => {
  try {
    const depts = await db.getDepartmentsAsync();
    return res.json(depts);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/departments/seed', async (req, res) => {
  try {
    db.seedDefaultDepartments();
    const depts = await db.getDepartmentsAsync();
    return res.json({ success: true, message: 'Default departments seeded successfully', departments: depts });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/departments', async (req, res) => {
  try {
    const { code, name, headOfDepartment } = req.body;
    if (!code || !name) {
      return res.status(400).json({ error: 'Code and Name required' });
    }
    const created = await db.addDepartmentAsync({ code, name, headOfDepartment }, (req as any).currentUser);
    return res.status(201).json(created);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

app.put('/api/departments/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updated = await db.updateDepartmentAsync(id, req.body, (req as any).currentUser);
    return res.json(updated);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

app.delete('/api/departments/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const success = await db.deleteDepartmentAsync(id, (req as any).currentUser);
    if (!success) return res.status(404).json({ error: 'Department not found' });
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Parent Enrollment Routes
app.get('/api/parents', (req, res) => {
  try {
    const parents = db.getParentEnrollments();
    return res.json(parents);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/parents', (req, res) => {
  try {
    const { parentName, parentPhoneNumber, studentName, registerNumber } = req.body;
    if (!parentName || !parentPhoneNumber || !studentName || !registerNumber) {
      return res.status(400).json({ error: 'Parent Name, Mobile Number, Student Name, and Register Number are required' });
    }

    const created = db.addParentEnrollment(
      { parentName, parentPhoneNumber, studentName, registerNumber },
      (req as any).currentUser
    );
    return res.status(201).json(created);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

app.delete('/api/parents/:id', (req, res) => {
  try {
    const { id } = req.params;
    const success = db.deleteParentEnrollment(id, (req as any).currentUser);
    if (!success) return res.status(404).json({ error: 'Parent enrollment record not found' });
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/parents/batch-import', (req, res) => {
  try {
    const { parents } = req.body;
    if (!Array.isArray(parents) || parents.length === 0) {
      return res.status(400).json({ error: 'No parent records provided' });
    }
    const result = db.importParentEnrollmentsBatch(parents, (req as any).currentUser);
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// User & Role Management Routes (Admin creates HOD & Staff)
app.get('/api/users', async (req, res) => {
  try {
    const users = await db.getUsersAsync();
    return res.json(users);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/users', async (req, res) => {
  try {
    const { userId, name, role, department, phoneNumber, rawPassword, email } = req.body;
    if (!userId || !name || !role) {
      return res.status(400).json({ error: 'User ID, Name, and Role are required' });
    }
    const created = await db.addUserAsync(
      { userId, name, role, department, phoneNumber, rawPassword, email },
      (req as any).currentUser
    );
    return res.status(201).json(created);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

app.put('/api/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const currentUser = (req as any).currentUser || 'VSBEC';
    const userRole = (req as any).currentUserRole || 'admin';

    // Verify permission: Only Admin or Super Admin can edit HOD / User details
    if (userRole !== 'admin' && userRole !== 'super_admin' && userRole !== 'SUPER_ADMIN') {
      return res.status(403).json({
        success: false,
        error: 'Access Denied: Only Administrators can update HOD / user profiles',
      });
    }

    const updated = await db.updateUserAsync(id, req.body, currentUser);
    return res.json({
      success: true,
      message: 'HOD details updated successfully',
      user: {
        id: updated.id,
        username: updated.userId,
        userId: updated.userId,
        name: updated.name,
        role: updated.role,
        department: updated.department,
        phoneNumber: updated.phoneNumber,
        email: (updated as any).email || '',
      },
    });
  } catch (err: any) {
    console.error('[HOD / User Update API Error]:', err);
    return res.status(400).json({
      success: false,
      error: err.message || 'Failed to update HOD details',
      message: err.message || 'Failed to update HOD details',
    });
  }
});

app.delete('/api/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const success = await db.deleteUserAsync(id, (req as any).currentUser);
    if (!success) return res.status(404).json({ success: false, error: 'User not found' });
    return res.json({ success: true, message: 'User deleted successfully' });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Staff Management
app.get('/api/staff', async (req, res) => {
  try {
    const staff = await db.getStaffAsync();
    return res.json(staff);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/staff', async (req, res) => {
  try {
    const { name, staffId, department, phoneNumber, permissions, email, assignedYears, assignedDepartments, status, password } = req.body;
    if (!name || !staffId || !department || !phoneNumber) {
      return res.status(400).json({ error: 'Name, Staff ID, Department, and Phone Number are required' });
    }

    const newStaff = await db.addStaffAsync(
      {
        name,
        staffId,
        department,
        phoneNumber,
        email: email || '',
        assignedYears: assignedYears || ['1st Year'],
        assignedDepartments: assignedDepartments || [department],
        status: status || 'active',
        rawPassword: password || 'VSB123',
        permissions: permissions || ['send_sms', 'view_reports'],
      },
      (req as any).currentUser
    );
    return res.status(201).json(newStaff);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

app.put('/api/staff/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updated = await db.updateStaffAsync(id, req.body, (req as any).currentUser);
    return res.json(updated);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

app.post('/api/staff/:id/reset-password', async (req, res) => {
  try {
    const { id } = req.params;
    const { newPassword } = req.body;
    if (!newPassword || newPassword.trim().length < 4) {
      return res.status(400).json({ error: 'New password must be at least 4 characters long' });
    }
    const result = await db.resetStaffPasswordAsync(id, newPassword.trim(), (req as any).currentUser);
    return res.json({ success: true, message: 'Password reset successfully', staffId: id });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

app.patch('/api/staff/:id/toggle-status', async (req, res) => {
  try {
    const { id } = req.params;
    const updated = await db.toggleStaffStatusAsync(id, (req as any).currentUser);
    return res.json({ success: true, staff: updated });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

app.delete('/api/staff/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const success = await db.deleteStaffAsync(id, (req as any).currentUser);
    if (!success) return res.status(404).json({ error: 'Staff member not found' });
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Direct Fast2SMS API Route (as requested for standalone test & integration)
app.post(['/send-sms', '/api/send-sms'], async (req, res) => {
  try {
    const { phone, message } = req.body;

    if (!phone || !message) {
      return res.status(400).json({ error: 'Phone & message required' });
    }

    const result = await sendSMS(phone, message);

    if (result.success) {
      res.json({ status: 'SMS Sent', data: result.data });
    } else {
      res.status(500).json({ status: 'Failed', error: result.error });
    }
  } catch (err: any) {
    res.status(500).json({ status: 'Failed', error: err.message });
  }
});

// SMS Sending Module (Bulk / Group Dispatch with Scope Verification)
app.post('/api/sms/send', async (req, res) => {
  try {
    const { recipients, messageType, messageContent, channel, templateId } = req.body;

    if (!Array.isArray(recipients) || recipients.length === 0) {
      return res.status(400).json({ error: 'No recipients provided' });
    }

    if (!messageContent || !messageContent.trim()) {
      return res.status(400).json({ error: 'Message content cannot be empty' });
    }

    const userRole = ((req as any).userRole || '').toUpperCase();
    const currentUserId = (req as any).currentUser || '';
    const dbUser = (await db.getUserByUserIdAsync(currentUserId)) || db.getUserByUserId(currentUserId);

    if (userRole === 'STAFF' && dbUser) {
      for (const rec of recipients) {
        if (!db.canUserAccessStudent(dbUser, {
          department: rec.department,
          academicYear: rec.academicYear || rec.year || '1st Year',
        } as any)) {
          return res.status(403).json({
            error: `Access Denied: You cannot dispatch SMS to student ${rec.name || rec.registerNumber || ''} (${rec.department || 'N/A'}) outside your assigned academic years and departments.`
          });
        }
      }
    }

    const sender = (req as any).currentUser;
    const newLogs: any[] = [];

    for (const rec of recipients) {
      const interpolatedContent = messageContent
        .replace(/\{name\}/g, rec.name || 'Student')
        .replace(/\{regNo\}/g, rec.registerNumber || 'N/A')
        .replace(/\{department\}/g, rec.department || 'N/A');

      let status = 'Sent';
      let errorMessage: string | undefined = undefined;

      if (rec.phoneNumber) {
        const smsRes = await sendSMS(rec.phoneNumber, interpolatedContent);
        if (!smsRes.success) {
          status = 'Failed';
          errorMessage = typeof smsRes.error === 'string' ? smsRes.error : JSON.stringify(smsRes.error);
        }
      } else {
        status = 'Failed';
        errorMessage = 'Invalid or missing phone number';
      }

      newLogs.push({
        recipientName: rec.name,
        registerNumber: rec.registerNumber || 'N/A',
        phoneNumber: rec.phoneNumber,
        department: rec.department || 'N/A',
        messageType: messageType || 'General Notification',
        messageContent: interpolatedContent,
        channel: channel || 'Fast2SMS Gateway',
        status,
        sentAt: new Date().toISOString(),
        sentBy: sender,
        errorMessage,
      });
    }

    const savedLogs = db.addSmsLogs(newLogs);
    const sentCount = savedLogs.filter((l) => l.status === 'Sent').length;
    const failedCount = savedLogs.filter((l) => l.status === 'Failed').length;

    db.addActivity(
      'sms',
      'SMS Dispatched via Fast2SMS',
      `Sent ${sentCount} SMS successfully (${failedCount} failed)`,
      sender
    );

    return res.json({
      success: true,
      totalCount: savedLogs.length,
      sentCount,
      failedCount,
      logs: savedLogs,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// SMS API Key Pool Status & Manual Rotation
app.get('/api/sms/keys-status', (req, res) => {
  try {
    const status = getSmsApiKeyPoolStatus();
    return res.json(status);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/sms/rotate-key', (req, res) => {
  try {
    const newIdx = rotateToNextKey();
    const status = getSmsApiKeyPoolStatus();
    return res.json({
      success: true,
      message: `Rotated to SMS API Key #${newIdx + 1}`,
      activeKeyIndex: newIdx,
      status,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Parse Excel File for SMS Preview
app.post('/api/sms/parse-excel', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No Excel file attached' });
    }

    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    if (!workbook || !workbook.SheetNames || workbook.SheetNames.length === 0) {
      return res.status(400).json({ error: 'Excel file has no worksheet' });
    }

    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const rawRows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

    if (!rawRows || rawRows.length < 2) {
      return res.status(400).json({ error: 'Excel file contains no data rows' });
    }

    let headerRowIdx = -1;
    for (let i = 0; i < Math.min(10, rawRows.length); i++) {
      if (rawRows[i] && rawRows[i].some((c: any) => c !== null && c !== undefined && String(c).trim().length > 0)) {
        headerRowIdx = i;
        break;
      }
    }

    if (headerRowIdx === -1) {
      return res.status(400).json({ error: 'Could not locate header row in Excel worksheet' });
    }

    const headers = rawRows[headerRowIdx].map((h: any) => String(h || '').trim());

    let phoneIdx = -1;
    let nameIdx = -1;
    let marksIdx = -1;

    headers.forEach((h, idx) => {
      const clean = h.toUpperCase().replace(/[^A-Z0-9\s_]/g, '').trim();
      if (/^(MOBILE|PHONE|PHONE NUMBER|CONTACT|MOBILE NO|PARENT MOBILE|PARENT PHONE)$/.test(clean) || clean.includes('MOBILE') || clean.includes('PHONE')) {
        phoneIdx = idx;
      } else if (/^(NAME|STUDENT NAME|STUDENT_NAME|FULL NAME)$/.test(clean) || clean.includes('NAME')) {
        nameIdx = idx;
      } else if (/^(MARKS|MARK|SCORE|RESULT|TOTAL MARKS|GRADE)$/.test(clean) || clean.includes('MARK') || clean.includes('SCORE') || clean.includes('RESULT')) {
        marksIdx = idx;
      }
    });

    if (nameIdx === -1 && headers.length > 0) nameIdx = 0;
    if (phoneIdx === -1 && headers.length > 1) phoneIdx = 1;
    if (marksIdx === -1 && headers.length > 2) marksIdx = 2;

    const previewList: Array<{
      sNo: number;
      studentName: string;
      phoneNumber: string;
      marks: string;
      isValid: boolean;
    }> = [];

    for (let r = headerRowIdx + 1; r < rawRows.length; r++) {
      const row = rawRows[r];
      if (!row || row.length === 0) continue;

      const studentName = nameIdx >= 0 && row[nameIdx] !== undefined ? String(row[nameIdx]).trim() : '';
      const phoneNumber = phoneIdx >= 0 && row[phoneIdx] !== undefined ? String(row[phoneIdx]).trim().replace(/[^0-9+]/g, '') : '';
      const marks = marksIdx >= 0 && row[marksIdx] !== undefined ? String(row[marksIdx]).trim() : '';

      if (!studentName && !phoneNumber && !marks) continue;

      const isValid = Boolean(phoneNumber && phoneNumber.replace(/\D/g, '').length >= 10);

      previewList.push({
        sNo: previewList.length + 1,
        studentName: studentName || 'Student',
        phoneNumber,
        marks: marks || 'N/A',
        isValid,
      });
    }

    return res.json({
      success: true,
      fileName: req.file.originalname,
      totalParsed: previewList.length,
      validCount: previewList.filter((p) => p.isValid).length,
      records: previewList,
    });
  } catch (err: any) {
    return res.status(500).json({ error: `Excel parse failed: ${err.message}` });
  }
});

// Excel SMS Upload & Loop Dispatch with Automatic API Key Rotation
app.post('/api/sms/upload-excel-send', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No Excel file provided for SMS dispatch' });
    }

    const templateText = req.body.templateText || 'Dear Parent, your child {name} scored {marks}.';
    const messageType = req.body.messageType || 'Exam Result SMS';

    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    if (!workbook || !workbook.SheetNames || workbook.SheetNames.length === 0) {
      return res.status(400).json({ error: 'Excel file contains no sheets' });
    }

    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const rawRows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

    if (!rawRows || rawRows.length < 2) {
      return res.status(400).json({ error: 'Excel file contains no data rows' });
    }

    let headerRowIdx = -1;
    for (let i = 0; i < Math.min(10, rawRows.length); i++) {
      if (rawRows[i] && rawRows[i].some((c: any) => c !== null && c !== undefined && String(c).trim().length > 0)) {
        headerRowIdx = i;
        break;
      }
    }

    if (headerRowIdx === -1) {
      return res.status(400).json({ error: 'Could not locate header row in Excel worksheet' });
    }

    const headers = rawRows[headerRowIdx].map((h: any) => String(h || '').trim());

    let phoneIdx = -1;
    let nameIdx = -1;
    let marksIdx = -1;

    headers.forEach((h, idx) => {
      const clean = h.toUpperCase().replace(/[^A-Z0-9\s_]/g, '').trim();
      if (/^(MOBILE|PHONE|PHONE NUMBER|CONTACT|MOBILE NO|PARENT MOBILE|PARENT PHONE)$/.test(clean) || clean.includes('MOBILE') || clean.includes('PHONE')) {
        phoneIdx = idx;
      } else if (/^(NAME|STUDENT NAME|STUDENT_NAME|FULL NAME)$/.test(clean) || clean.includes('NAME')) {
        nameIdx = idx;
      } else if (/^(MARKS|MARK|SCORE|RESULT|TOTAL MARKS|GRADE)$/.test(clean) || clean.includes('MARK') || clean.includes('SCORE') || clean.includes('RESULT')) {
        marksIdx = idx;
      }
    });

    if (nameIdx === -1 && headers.length > 0) nameIdx = 0;
    if (phoneIdx === -1 && headers.length > 1) phoneIdx = 1;
    if (marksIdx === -1 && headers.length > 2) marksIdx = 2;

    const senderStaffId = (req as any).currentUser || 'STAFF';
    const newSmsLogs: any[] = [];

    for (let r = headerRowIdx + 1; r < rawRows.length; r++) {
      const row = rawRows[r];
      if (!row || row.length === 0) continue;

      const studentName = nameIdx >= 0 && row[nameIdx] !== undefined ? String(row[nameIdx]).trim() : 'Student';
      const phoneNumber = phoneIdx >= 0 && row[phoneIdx] !== undefined ? String(row[phoneIdx]).trim().replace(/[^0-9+]/g, '') : '';
      const marks = marksIdx >= 0 && row[marksIdx] !== undefined ? String(row[marksIdx]).trim() : 'N/A';

      if (!phoneNumber) continue;

      // Dynamic placeholder replacement
      const messageContent = templateText
        .replace(/\{name\}/g, studentName)
        .replace(/\{marks\}/g, marks)
        .replace(/\{phone\}/g, phoneNumber)
        .replace(/\{date\}/g, new Date().toLocaleDateString());

      let status = 'Sent';
      let errorMsg: string | undefined = undefined;

      const smsResult = await sendSMS(phoneNumber, messageContent);
      if (!smsResult.success) {
        status = 'Failed';
        errorMsg = typeof smsResult.error === 'string' ? smsResult.error : JSON.stringify(smsResult.error);
      }

      newSmsLogs.push({
        recipientName: studentName,
        registerNumber: 'Excel Upload',
        phoneNumber,
        department: 'Excel Batch',
        messageType,
        messageContent,
        channel: 'Fast2SMS Multi-Key Gateway',
        status,
        sentAt: new Date().toISOString(),
        sentBy: senderStaffId,
        errorMessage: errorMsg,
      });
    }

    if (newSmsLogs.length === 0) {
      return res.status(400).json({ error: 'No valid phone numbers found in uploaded Excel file.' });
    }

    const savedLogs = db.addSmsLogs(newSmsLogs);
    const sentCount = savedLogs.filter((l) => l.status === 'Sent').length;
    const failedCount = savedLogs.filter((l) => l.status === 'Failed').length;

    db.addActivity(
      'sms',
      'Excel Bulk SMS Dispatched',
      `Sent ${sentCount} SMS from Excel (${failedCount} failed) by Staff: ${senderStaffId}`,
      senderStaffId
    );

    return res.json({
      success: true,
      message: `Excel SMS Dispatch Completed! ${sentCount} Sent, ${failedCount} Failed.`,
      totalDispatched: savedLogs.length,
      sentCount,
      failedCount,
      staffId: senderStaffId,
      logs: savedLogs,
      keyPoolStatus: getSmsApiKeyPoolStatus(),
    });

  } catch (err: any) {
    return res.status(500).json({ error: `Excel SMS Upload failed: ${err.message}` });
  }
});

// SMS Reports Endpoints
app.get('/api/sms/reports', async (req, res) => {
  try {
    const logs = await db.getSmsLogsAsync();
    return res.json(logs);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.delete('/api/sms/reports', async (req, res) => {
  try {
    await db.clearSmsLogsAsync((req as any).currentUser);
    return res.json({ success: true, message: 'SMS logs cleared from MongoDB' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Download SMS Report in official Excel format (.xlsx) from MongoDB logs
app.get('/api/reports/sms-excel', async (req, res) => {
  try {
    const logs = await db.getSmsLogsAsync();
    const { batch, department, date, type, status, search, regNo, student } = req.query;

    let filtered = logs;

    if (department && department !== 'ALL') {
      filtered = filtered.filter((l) => l.department && l.department.toLowerCase() === String(department).toLowerCase());
    }

    if (type && type !== 'ALL') {
      filtered = filtered.filter((l) => l.messageType && l.messageType.toLowerCase() === String(type).toLowerCase());
    }

    if (status && status !== 'ALL') {
      filtered = filtered.filter((l) => l.status && l.status.toLowerCase() === String(status).toLowerCase());
    }

    if (date) {
      const dateStr = String(date).trim();
      filtered = filtered.filter((l) => {
        if (!l.sentAt) return false;
        const d = new Date(l.sentAt);
        const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        return ymd === dateStr;
      });
    }

    if (batch && batch !== 'ALL') {
      const bStr = String(batch).toLowerCase();
      filtered = filtered.filter((l) => l.messageContent && l.messageContent.toLowerCase().includes(bStr));
    }

    if (regNo) {
      const rStr = String(regNo).trim().toLowerCase();
      filtered = filtered.filter((l) => l.registerNumber && l.registerNumber.toLowerCase().includes(rStr));
    }

    if (student) {
      const sStr = String(student).trim().toLowerCase();
      filtered = filtered.filter((l) => l.recipientName && l.recipientName.toLowerCase().includes(sStr));
    }

    if (search) {
      const query = String(search).trim().toLowerCase();
      filtered = filtered.filter((l) =>
        (l.recipientName && l.recipientName.toLowerCase().includes(query)) ||
        (l.registerNumber && l.registerNumber.toLowerCase().includes(query)) ||
        (l.phoneNumber && l.phoneNumber.includes(query)) ||
        (l.messageContent && l.messageContent.toLowerCase().includes(query))
      );
    }

    // Generate accurate Excel file strictly following required column structure
    const formatSmsDate = (sentAt: string | Date | undefined): string => {
      if (!sentAt) return '-';
      try {
        const d = new Date(sentAt);
        if (isNaN(d.getTime())) return String(sentAt);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
      } catch {
        return String(sentAt);
      }
    };

    const formatSmsTime = (sentAt: string | Date | undefined): string => {
      if (!sentAt) return '-';
      try {
        const d = new Date(sentAt);
        if (isNaN(d.getTime())) return '-';
        let hours = d.getHours();
        const minutes = String(d.getMinutes()).padStart(2, '0');
        const ampm = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12;
        hours = hours ? hours : 12;
        const strHours = String(hours).padStart(2, '0');
        return `${strHours}:${minutes} ${ampm}`;
      } catch {
        return '-';
      }
    };

    const excelRows = filtered.map((log, index) => ({
      'Serial No': index + 1,
      'Register Number': log.registerNumber || '-',
      'Student Name': log.recipientName || '-',
      'Parent Mobile Number': log.phoneNumber || '-',
      'SMS Data': log.messageContent || '',
      'SMS Date': formatSmsDate(log.sentAt),
      'SMS Time': formatSmsTime(log.sentAt),
      'SMS Status': log.status || 'Sent',
    }));

    const worksheet = XLSX.utils.json_to_sheet(excelRows);

    // Precise column widths
    worksheet['!cols'] = [
      { wch: 10 }, // Serial No
      { wch: 18 }, // Register Number
      { wch: 25 }, // Student Name
      { wch: 20 }, // Parent Mobile Number
      { wch: 70 }, // SMS Data
      { wch: 14 }, // SMS Date
      { wch: 14 }, // SMS Time
      { wch: 14 }, // SMS Status
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'SMS Delivery Report');

    const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
    const today = new Date().toISOString().split('T')[0];

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="SMS_Delivery_Report_${today}.xlsx"`);
    return res.send(buffer);
  } catch (err: any) {
    console.error('Export SMS Excel Error:', err);
    return res.status(500).json({ error: `Failed to export SMS Excel: ${err.message}` });
  }
});

// Exam Results & Batches Endpoints
async function handleGetExamBatches(req: express.Request, res: express.Response) {
  try {
    const batches = await db.getExamBatchesAsync();
    return res.json(batches);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

app.get('/api/exam-batches', handleGetExamBatches);
app.get('/api/results', handleGetExamBatches);

async function handleCreateExamBatch(req: express.Request, res: express.Response) {
  try {
    const { title, resultType, department, examDate, results } = req.body;
    if (!title || !department || !Array.isArray(results) || results.length === 0) {
      return res.status(400).json({ error: 'Title, Department, and non-empty results array required' });
    }

    const currentUser = (req as any).currentUser || 'VSBEC';

    // Auto-sync Student Enrollment with Parent Mobile Number using REGISTER NUMBER as unique ID
    for (const rec of results) {
      if (!rec.registerNumber) continue;
      const cleanReg = rec.registerNumber.toString().trim();
      const cleanName = rec.studentName ? rec.studentName.toString().trim() : 'Student';
      const cleanPhone = rec.phoneNumber ? rec.phoneNumber.toString().trim() : '';
      const dept = rec.department || department;

      try {
        const students = db.getStudents();
        const existing = students.find((s) => s.registerNumber.toUpperCase() === cleanReg.toUpperCase());
        if (existing) {
          db.updateStudent(existing.id, {
            name: cleanName || existing.name,
            phoneNumber: cleanPhone || existing.phoneNumber,
            department: dept || existing.department,
          }, currentUser);
        } else {
          db.addStudent({
            registerNumber: cleanReg,
            name: cleanName,
            phoneNumber: cleanPhone,
            department: dept,
          }, currentUser);
        }
      } catch (e) {
        // Ignore duplicate conflicts if any
      }
    }

    const batch = await db.addExamBatchAsync(
      title,
      department,
      examDate || new Date().toISOString().split('T')[0],
      results,
      currentUser,
      resultType || 'Semester Result'
    );
    return res.status(201).json(batch);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

app.post('/api/exam-batches', handleCreateExamBatch);
app.post('/api/results', handleCreateExamBatch);

async function handleGetExamBatchById(req: express.Request, res: express.Response) {
  try {
    const { id } = req.params;
    const cleanId = (id || '').trim();
    const batch = await db.getExamBatchByIdAsync(cleanId);
    if (!batch) {
      return res.status(404).json({ error: `Exam Batch "${cleanId}" not found in database.` });
    }
    return res.json(batch);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

app.get('/api/exam-batches/:id', handleGetExamBatchById);
app.get('/api/results/:id', handleGetExamBatchById);

async function handleGetExamBatchReport(req: express.Request, res: express.Response) {
  try {
    const { id } = req.params;
    const cleanId = (id || '').trim();
    const batch = await db.getExamBatchByIdAsync(cleanId);
    if (!batch) {
      return res.status(404).json({ error: `Exam Report for "${cleanId}" not found.` });
    }
    return res.json({
      id: batch.id,
      title: batch.title,
      resultType: batch.resultType,
      department: batch.department,
      examDate: batch.examDate,
      uploadedAt: batch.uploadedAt,
      uploadedBy: batch.uploadedBy,
      totalStudents: batch.totalStudents,
      passedCount: batch.passedCount,
      failedCount: batch.failedCount,
      passRate: batch.passRate,
      smsSentCount: batch.smsSentCount,
      matchedCount: batch.matchedCount,
      unmatchedCount: batch.unmatchedCount,
      detectedSubjects: batch.detectedSubjects,
      results: batch.results,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

app.get('/api/exam-batches/:id/report', handleGetExamBatchReport);
app.get('/api/results/:id/report', handleGetExamBatchReport);

async function handleGetExamBatchStudents(req: express.Request, res: express.Response) {
  try {
    const { id } = req.params;
    const cleanId = (id || '').trim();
    const batch = await db.getExamBatchByIdAsync(cleanId);
    if (!batch) {
      return res.status(404).json({ error: `Exam Batch "${cleanId}" not found.` });
    }
    return res.json(batch.results || []);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

app.get('/api/exam-batches/:id/students', handleGetExamBatchStudents);
app.get('/api/results/:id/students', handleGetExamBatchStudents);

async function handleUpdateExamBatch(req: express.Request, res: express.Response) {
  try {
    const { id } = req.params;
    const cleanId = (id || '').trim();
    const batch = await db.getExamBatchByIdAsync(cleanId);
    if (!batch) {
      return res.status(404).json({ error: `Exam Batch "${cleanId}" not found.` });
    }
    const { title, department, examDate, results, resultType } = req.body;
    if (results && Array.isArray(results)) {
      await db.updateExamBatchResultsAsync(batch.id, results);
    }
    const updated = await db.getExamBatchByIdAsync(cleanId);
    return res.json(updated);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

app.put('/api/exam-batches/:id', handleUpdateExamBatch);
app.put('/api/results/:id', handleUpdateExamBatch);

async function handleDeleteExamBatch(req: express.Request, res: express.Response) {
  try {
    const { id } = req.params;
    const cleanId = (id || '').trim();

    if (!cleanId) {
      return res.status(400).json({ success: false, message: 'Exam batch ID is required.' });
    }

    // 1. Authenticate user and verify role
    const currentUserId = (req as any).currentUser || (req.headers['x-user-id'] as string) || 'VSBEC';
    const userRoleOverride = (req as any).userRole;
    const user = db.getUserByUserId(currentUserId);

    const role = userRoleOverride || user?.role || (currentUserId.toUpperCase() === 'ADMIN' || currentUserId.toUpperCase() === 'VSBEC' ? 'admin' : 'staff');
    const userDept = user?.department || '';

    // Security Authorization:
    // Admin: Full delete access
    // HOD: Can delete only exam batches belonging to their own department
    // Staff: Do NOT allow exam batch deletion
    if (role === 'staff') {
      return res.status(403).json({ success: false, message: 'Staff members are not authorized to delete exam batches.' });
    }

    // 2. Find exact Exam Batch in database (using MongoDB / local store)
    const batch = await db.getExamBatchByIdAsync(cleanId);
    if (!batch) {
      return res.status(404).json({ success: false, message: 'Exam batch not found in database.' });
    }

    if (role === 'hod') {
      if (!userDept || batch.department.trim().toUpperCase() !== userDept.trim().toUpperCase()) {
        return res.status(403).json({
          success: false,
          message: `HODs can only delete exam batches belonging to their own department (${userDept || 'unassigned'}).`,
        });
      }
    }

    // 3. Permanently delete from MongoDB, delete related result & SMS records, preserve student enrollments
    const delResult = await db.deleteExamBatch(batch.id, currentUserId);
    if (!delResult.success) {
      return res.status(500).json({
        success: false,
        message: delResult.message || 'Exam batch could not be deleted',
      });
    }

    // 4. Verify the Exam Batch document no longer exists
    const stillExists = await db.getExamBatchByIdAsync(batch.id);
    if (stillExists) {
      return res.status(500).json({
        success: false,
        message: 'Exam batch could not be deleted',
      });
    }

    return res.json({
      success: true,
      message: 'Exam batch deleted successfully',
    });
  } catch (err: any) {
    console.error('[API Delete Exam Batch Error]:', err);
    return res.status(500).json({
      success: false,
      message: err.message || 'Exam batch could not be deleted',
    });
  }
}

app.delete('/api/exam-batches/:id', handleDeleteExamBatch);
app.delete('/api/results/:id', handleDeleteExamBatch);

app.post('/api/results/:id/send-sms', async (req, res) => {
  try {
    const { id } = req.params;
    const cleanId = (id || '').trim();
    const { targetRegNos } = req.body || {};
    const batches = await db.getExamBatchesAsync();
    const batch = batches.find((b) => b.id.trim().toLowerCase() === cleanId.toLowerCase());

    if (!batch) {
      return res.status(404).json({ error: 'Exam Result Batch not found' });
    }

    if (Array.isArray(targetRegNos)) {
      if (targetRegNos.length === 0) {
        return res.status(400).json({ error: 'No students selected. Please select at least one student to send SMS.' });
      }
    }

    const sender = (req as any).currentUser || 'VSBEC';
    const updatedResults = [...batch.results];
    const newSmsLogs: any[] = [];

    for (const rec of updatedResults) {
      if (Array.isArray(targetRegNos) && targetRegNos.length > 0) {
        if (!targetRegNos.includes(rec.registerNumber)) {
          continue;
        }
      }

      // Live Parent Mobile Number lookup from Student Enrollment using Register Number
      let recipientPhone = rec.phoneNumber || '';
      let isParentMatched = rec.matchedParent !== false;

      if (rec.registerNumber) {
        const regUpper = rec.registerNumber.toString().trim().toUpperCase();
        const parents = db.getParentEnrollments();
        const parentMatch = parents.find((p) => p.registerNumber.trim().toUpperCase() === regUpper);
        if (parentMatch && parentMatch.parentPhoneNumber) {
          recipientPhone = parentMatch.parentPhoneNumber;
          isParentMatched = true;
        } else {
          const students = db.getStudents();
          const studentMatch = students.find((s) => s.registerNumber.trim().toUpperCase() === regUpper);
          if (studentMatch && studentMatch.phoneNumber) {
            recipientPhone = studentMatch.phoneNumber;
            isParentMatched = true;
          }
        }
      }

      if (recipientPhone) {
        rec.phoneNumber = recipientPhone;
      }

      let messageContent = '';
      const hasNumericMarks = Array.isArray(rec.subjects) && rec.subjects.some((s: any) => typeof s.marks === 'number' && s.marks > 0);
      const isLetterGradesOnly = batch.resultType === 'Semester Result' && !hasNumericMarks && !rec.totalMarks;

      if (isLetterGradesOnly) {
        let subjectLines = '';
        let arrearsCount = 0;

        if (Array.isArray(rec.subjects) && rec.subjects.length > 0) {
          const lines: string[] = [];
          for (const s of rec.subjects) {
            const subjectName = s.subjectName || s.subjectCode || 'SUBJECT';
            const rawGrade = s.grade !== undefined && s.grade !== null && s.grade !== '' ? String(s.grade).trim() : (s.result || '-');
            const evalGrade = evaluateSubjectGrade(rawGrade);
            if (evalGrade.isFail) {
              arrearsCount++;
            }
            lines.push(`${subjectName}: ${evalGrade.gradeStr}`);
          }
          subjectLines = lines.join('\n');
        } else {
          subjectLines = `RESULT: ${rec.overallStatus || '-'}`;
          if (rec.overallStatus === 'FAIL') arrearsCount = 1;
        }

        if (typeof rec.failedSubjectsCount === 'number' && rec.failedSubjectsCount > arrearsCount) {
          arrearsCount = rec.failedSubjectsCount;
        }

        messageContent = `DEAR PARENT,\n\nName: ${rec.studentName}\n\nRegister Number: ${rec.registerNumber}\n\n${subjectLines}\n\nTotal Number of Arrears: ${arrearsCount}`;
      } else {
        // Mark Statement / Internal Assessment format:
        // Dear Parent,
        //
        // Semester 4 Internal Assessment Result
        //
        // Student Name: MOHANA PRIYA G
        // Register Number: 922524148063
        //
        // Total Marks: 494 / 600
        // Percentage: 82.33%
        //
        // Thank you.
        let totalScored = 0;
        let totalMax = 0;

        if (Array.isArray(rec.subjects) && rec.subjects.length > 0) {
          rec.subjects.forEach((s: any) => {
            const rawMark = s.marks !== undefined && s.marks !== null && s.marks !== '' ? s.marks : s.grade;
            const evalMark = evaluateInternalMark(rawMark);
            totalScored += evalMark.mark;
            totalMax += (s.maxMarks || 100);
          });
        } else if (rec.totalMarks !== undefined && rec.totalMarks !== null && rec.totalMarks !== '') {
          const str = String(rec.totalMarks).trim();
          if (str.includes('/')) {
            const parts = str.split('/');
            totalScored = parseFloat(parts[0]) || 0;
            totalMax = parseFloat(parts[1]) || 100;
          } else {
            totalScored = parseFloat(str) || 0;
            totalMax = 600;
          }
        } else {
          totalScored = 0;
          totalMax = 100;
        }

        if (totalMax === 0) totalMax = 100;
        const percentage = ((totalScored / totalMax) * 100).toFixed(2);

        const examHeader = batch.title
          ? (/result/i.test(batch.title) ? batch.title : `${batch.title} Result`)
          : 'Semester 4 Internal Assessment Result';

        messageContent = `Dear Parent,\n\n${examHeader}\n\nStudent Name: ${rec.studentName}\nRegister Number: ${rec.registerNumber}\n\nTotal Marks: ${totalScored} / ${totalMax}\nPercentage: ${percentage}%\n\nThank you.`;
      }

      let status = 'Sent';
      let errorMessage: string | undefined = undefined;

      const cleanPhone = recipientPhone ? recipientPhone.replace(/\D/g, '') : '';

      // Send SMS ONLY if Parent enrolled & Register Number matched
      if (isParentMatched && cleanPhone && cleanPhone.length >= 10) {
        const smsRes = await sendSMS(recipientPhone, messageContent);
        if (!smsRes.success) {
          status = 'Failed';
          errorMessage = typeof smsRes.error === 'string' ? smsRes.error : JSON.stringify(smsRes.error);
        }
      } else {
        status = 'Failed';
        errorMessage = !isParentMatched
          ? 'Parent Mobile Not Found in Student Enrollment database'
          : 'Invalid or missing parent mobile number';
      }

      rec.smsSent = true;
      rec.smsSentAt = new Date().toISOString();
      rec.smsStatus = status as any;
      rec.smsErrorMessage = errorMessage;

      newSmsLogs.push({
        recipientName: rec.studentName,
        registerNumber: rec.registerNumber,
        phoneNumber: rec.phoneNumber || 'N/A',
        department: rec.department || batch.department,
        messageType: 'Exam Result',
        messageContent,
        channel: 'Fast2SMS Gateway',
        status,
        sentAt: rec.smsSentAt,
        sentBy: sender,
        errorMessage,
      });
    }

    db.addSmsLogs(newSmsLogs);
    await db.updateExamBatchResultsAsync(batch.id, updatedResults);

    const sentCount = newSmsLogs.filter((l) => l.status === 'Sent').length;
    const failedCount = newSmsLogs.filter((l) => l.status === 'Failed').length;

    db.addActivity(
      'result',
      'Result SMS Dispatched via Fast2SMS',
      `Sent exam result SMS for batch "${batch.title}" (${sentCount} sent, ${failedCount} failed)`,
      sender
    );

    return res.json({
      success: true,
      totalCount: updatedResults.length,
      sentCount,
      failedCount,
      batch: { ...batch, results: updatedResults },
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ==========================================
// --- ATTENDANCE & ABSENT SMS MODULE APIS ---
// ==========================================

// Get permanently enrolled students for manual attendance marking
app.get('/api/attendance/enrolled-students', (req, res) => {
  try {
    const { department } = req.query;
    const students = db.getStudents();
    const parents = db.getParentEnrollments();

    let filtered = students;
    if (department && department !== 'ALL') {
      const deptUpper = String(department).trim().toUpperCase();
      filtered = students.filter(
        (s) => s.department && s.department.trim().toUpperCase() === deptUpper
      );
    }

    const result = filtered.map((s) => {
      const regUpper = (s.registerNumber || '').trim().toUpperCase();
      const parent = parents.find(
        (p) => p.registerNumber && p.registerNumber.trim().toUpperCase() === regUpper
      );

      const rawPhone = parent?.parentPhoneNumber || s.phoneNumber || '';
      const cleanPhone = rawPhone.replace(/\D/g, '').slice(-10);
      const isParentMatched = cleanPhone.length === 10;

      return {
        id: s.id,
        registerNumber: regUpper,
        name: s.name,
        department: s.department,
        year: s.year,
        section: s.section,
        parentName: parent?.parentName || 'Parent',
        parentMobile: isParentMatched ? cleanPhone : '',
        parentMatched: isParentMatched,
      };
    });

    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Get attendance sessions
app.get('/api/attendance', async (req, res) => {
  try {
    const { department, date } = req.query;
    const currentUserId = (req as any).currentUser || (req.headers['x-user-id'] as string) || 'VSBEC';
    const userRoleOverride = (req as any).userRole;
    const user = db.getUserByUserId(currentUserId);
    const role = userRoleOverride || user?.role || 'staff';
    const userDept = user?.department || '';

    let filterDept = department ? String(department).trim() : undefined;

    // Role-based Department scope enforcement
    if (role === 'hod' && userDept && userDept !== 'ALL') {
      filterDept = userDept;
    } else if (role === 'staff' && userDept && userDept !== 'ALL') {
      filterDept = userDept;
    }

    const sessions = await db.getAttendanceSessionsAsync({
      department: filterDept,
      date: date ? String(date).trim() : undefined,
    });

    return res.json(sessions);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Get single attendance session by ID
app.get('/api/attendance/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const session = await db.getAttendanceSessionByIdAsync(id);
    if (!session) {
      return res.status(404).json({ error: 'Attendance session not found' });
    }
    return res.json(session);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Upload Excel Attendance File
app.post('/api/attendance/upload-excel', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No Excel file uploaded. Please select a valid .xlsx or .xls file.' });
    }

    const origName = req.file.originalname || '';
    if (!origName.match(/\.(xlsx|xls|csv)$/i)) {
      return res.status(400).json({
        error: 'Unsupported file format. Please upload a Microsoft Excel spreadsheet (.xlsx or .xls).',
      });
    }

    let workbook;
    try {
      workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    } catch (parseErr: any) {
      return res.status(400).json({
        error: `Failed to parse Excel file: ${parseErr.message || 'Corrupted spreadsheet'}`,
      });
    }

    if (!workbook || !workbook.SheetNames || workbook.SheetNames.length === 0) {
      return res.status(400).json({ error: 'Excel file contains no sheets.' });
    }

    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const rawRows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

    if (!rawRows || rawRows.length === 0) {
      return res.status(400).json({ error: 'Worksheet is completely empty.' });
    }

    // Locate header row
    let headerRowIdx = -1;
    for (let i = 0; i < Math.min(10, rawRows.length); i++) {
      if (rawRows[i] && rawRows[i].some((cell: any) => cell !== null && cell !== undefined && String(cell).trim().length > 0)) {
        headerRowIdx = i;
        break;
      }
    }

    if (headerRowIdx === -1) {
      return res.status(400).json({ error: 'Could not locate header row in Excel file.' });
    }

    const headers = rawRows[headerRowIdx].map((h: any) => (h !== null && h !== undefined ? String(h).trim() : ''));

    let regNoIdx = -1;
    let nameIdx = -1;
    let statusIdx = -1;
    let deptIdx = -1;

    headers.forEach((h, idx) => {
      const clean = h.toUpperCase().replace(/[^A-Z0-9\s_]/g, '').trim();
      if (/^(REGISTER|REG|REGISTRATION|REGISTER NO|REG NO|REGISTER NUMBER|STUDENT ID|ROLL NO|REG_NO)$/.test(clean) || clean.includes('REGISTER') || clean.includes('REG NO') || clean.includes('ROLL')) {
        regNoIdx = idx;
      } else if (/^(NAME|STUDENT NAME|STUDENT_NAME|FULL NAME)$/.test(clean) || clean.includes('NAME')) {
        nameIdx = idx;
      } else if (/^(ATTENDANCE|STATUS|ATTENDANCE STATUS|ATT STATUS|PRESENT ABSENT|P A|P\/A|MARK|TODAY ATTENDANCE)$/.test(clean) || clean.includes('ATTEND') || clean.includes('STATUS')) {
        statusIdx = idx;
      } else if (/^(DEPARTMENT|DEPT|BRANCH|DEPT CODE)$/.test(clean) || clean.includes('DEPT')) {
        deptIdx = idx;
      }
    });

    if (regNoIdx === -1) {
      // Fallback: If 1st column looks like numbers/alphanumerics
      regNoIdx = 0;
    }

    const permanentStudents = db.getStudents();
    const permanentParents = db.getParentEnrollments();

    const parsedRecords: any[] = [];
    let presentCount = 0;
    let absentCount = 0;
    let parentMatchedCount = 0;
    let parentMissingCount = 0;

    for (let r = headerRowIdx + 1; r < rawRows.length; r++) {
      const row = rawRows[r];
      if (!row || row.every((c: any) => c === null || c === undefined || String(c).trim() === '')) {
        continue;
      }

      const rawReg = row[regNoIdx] !== undefined ? String(row[regNoIdx]).trim() : '';
      if (!rawReg || rawReg.toUpperCase() === 'REGISTER NUMBER' || rawReg.toUpperCase() === 'REG NO') {
        continue;
      }

      const cleanReg = rawReg.toUpperCase();

      // Look up student from permanent database
      const matchedStudent = permanentStudents.find(
        (s) => s.registerNumber && s.registerNumber.trim().toUpperCase() === cleanReg
      );

      // Look up parent from permanent enrollment database
      const matchedParent = permanentParents.find(
        (p) => p.registerNumber && p.registerNumber.trim().toUpperCase() === cleanReg
      );

      const rawName = nameIdx !== -1 && row[nameIdx] ? String(row[nameIdx]).trim() : '';
      const studentName = rawName || matchedStudent?.name || matchedParent?.studentName || cleanReg;

      const rawDept = deptIdx !== -1 && row[deptIdx] ? String(row[deptIdx]).trim().toUpperCase() : '';
      const department = rawDept || matchedStudent?.department?.toUpperCase() || 'CSE';

      // Parse status
      let status: 'PRESENT' | 'ABSENT' = 'PRESENT';
      if (statusIdx !== -1 && row[statusIdx] !== undefined) {
        const rawStatus = String(row[statusIdx]).trim().toUpperCase();
        if (
          rawStatus === 'A' ||
          rawStatus === 'ABSENT' ||
          rawStatus === 'AB' ||
          rawStatus === '0' ||
          rawStatus === 'FALSE' ||
          rawStatus === 'ABS'
        ) {
          status = 'ABSENT';
        } else {
          status = 'PRESENT';
        }
      }

      // Check Parent Phone matching from Permanent DB
      const rawPhone = matchedParent?.parentPhoneNumber || matchedStudent?.phoneNumber || '';
      const cleanPhone = rawPhone.replace(/\D/g, '').slice(-10);
      const isParentMatched = Boolean(cleanPhone && cleanPhone.length === 10);

      if (status === 'PRESENT') {
        presentCount++;
      } else {
        absentCount++;
      }

      if (isParentMatched) {
        parentMatchedCount++;
      } else {
        parentMissingCount++;
      }

      parsedRecords.push({
        studentId: matchedStudent?.id,
        registerNumber: cleanReg,
        studentName,
        department,
        status,
        parentMobile: isParentMatched ? cleanPhone : '',
        parentName: matchedParent?.parentName || (isParentMatched ? 'Parent' : ''),
        parentMatched: isParentMatched,
        smsSent: false,
      });
    }

    if (parsedRecords.length === 0) {
      return res.status(400).json({ error: 'No valid student attendance rows could be parsed from the uploaded spreadsheet.' });
    }

    return res.json({
      success: true,
      totalRows: parsedRecords.length,
      presentCount,
      absentCount,
      parentMatchedCount,
      parentMissingCount,
      records: parsedRecords,
    });
  } catch (err: any) {
    console.error('Attendance Excel Upload error:', err);
    return res.status(500).json({ error: err.message || 'Failed to parse Excel file' });
  }
});

// Save attendance session permanently to MongoDB
app.post('/api/attendance', async (req, res) => {
  try {
    const { department, date, academicGroup, section, sessionType, records, title } = req.body || {};

    if (!department || !date || !academicGroup || !Array.isArray(records) || records.length === 0) {
      return res.status(400).json({
        error: 'Missing required attendance fields: department, date, academicGroup, and records are required.',
      });
    }

    const currentUserId = (req as any).currentUser || (req.headers['x-user-id'] as string) || 'VSBEC';
    const userRoleOverride = (req as any).userRole;
    const user = db.getUserByUserId(currentUserId);
    const role = userRoleOverride || user?.role || 'staff';
    const userName = user?.name || currentUserId;

    const savedSession = await db.saveAttendanceSessionAsync(
      {
        department,
        date,
        academicGroup,
        section,
        sessionType,
        records,
        title,
      },
      currentUserId,
      userName,
      role
    );

    return res.status(201).json(savedSession);
  } catch (err: any) {
    console.error('Save attendance error:', err);
    return res.status(500).json({ error: err.message || 'Failed to save attendance session' });
  }
});

// Update records in an existing attendance session
app.put('/api/attendance/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { records } = req.body;

    if (!Array.isArray(records)) {
      return res.status(400).json({ error: 'Records array is required for updating attendance session.' });
    }

    const session = await db.getAttendanceSessionByIdAsync(id);
    if (!session) {
      return res.status(404).json({ error: 'Attendance session not found' });
    }

    const updated = await db.updateAttendanceSessionRecordsAsync(id, records);
    return res.json(updated);
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to update attendance session' });
  }
});

// Delete attendance session
app.delete('/api/attendance/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const currentUserId = (req as any).currentUser || (req.headers['x-user-id'] as string) || 'VSBEC';
    const userRoleOverride = (req as any).userRole;
    const user = db.getUserByUserId(currentUserId);
    const role = userRoleOverride || user?.role || 'staff';
    const userDept = user?.department || '';

    const session = await db.getAttendanceSessionByIdAsync(id);
    if (!session) {
      return res.status(404).json({ error: 'Attendance session not found' });
    }

    if (role === 'hod') {
      if (userDept && session.department.trim().toUpperCase() !== userDept.trim().toUpperCase()) {
        return res.status(403).json({ error: `HODs can only delete attendance records for their own department (${userDept}).` });
      }
    }

    const success = await db.deleteAttendanceSessionAsync(id, currentUserId);
    if (!success) {
      return res.status(400).json({ error: 'Failed to delete attendance session' });
    }

    return res.json({ success: true, message: 'Attendance session deleted permanently.' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to delete attendance session' });
  }
});

// Send Absent Parent SMS
app.post('/api/attendance/:id/send-absent-sms', async (req, res) => {
  try {
    const { id } = req.params;
    const { targetRegNos, customTemplate, forceResend } = req.body || {};

    const session = await db.getAttendanceSessionByIdAsync(id);
    if (!session) {
      return res.status(404).json({ error: 'Attendance session not found' });
    }

    const currentUserId = (req as any).currentUser || (req.headers['x-user-id'] as string) || 'VSBEC';
    const user = db.getUserByUserId(currentUserId);
    const sender = user?.name || currentUserId;

    const permanentParents = db.getParentEnrollments();
    const permanentStudents = db.getStudents();

    const updatedRecords = [...session.records];
    const newSmsLogs: any[] = [];
    let sentCount = 0;
    let failedCount = 0;
    let skippedCount = 0;

    for (const rec of updatedRecords) {
      // RULE: Students marked PRESENT must NOT receive an absent SMS!
      if (rec.status !== 'ABSENT') {
        continue;
      }

      // If specific register numbers were selected, only target those
      if (Array.isArray(targetRegNos) && targetRegNos.length > 0) {
        if (!targetRegNos.includes(rec.registerNumber)) {
          continue;
        }
      }

      // If already sent and forceResend is not requested, skip
      if (rec.smsSent && rec.smsStatus === 'Sent' && !forceResend) {
        skippedCount++;
        continue;
      }

      // Dynamic lookup: Register Number -> Student Enrollment -> Parent Mobile Number
      const regUpper = (rec.registerNumber || '').trim().toUpperCase();
      const matchedParent = permanentParents.find(
        (p) => p.registerNumber && p.registerNumber.trim().toUpperCase() === regUpper
      );
      const matchedStudent = permanentStudents.find(
        (s) => s.registerNumber && s.registerNumber.trim().toUpperCase() === regUpper
      );

      const rawPhone = matchedParent?.parentPhoneNumber || matchedStudent?.phoneNumber || rec.parentMobile || '';
      const cleanPhone = rawPhone.replace(/\D/g, '').slice(-10);
      const isParentMatched = Boolean(cleanPhone && cleanPhone.length === 10);

      // Construct Absent SMS message according to mandatory specification
      let messageContent = '';
      if (customTemplate && customTemplate.trim()) {
        messageContent = customTemplate
          .replace(/\[STUDENT NAME\]|\{studentName\}/gi, rec.studentName)
          .replace(/\[REGISTER NUMBER\]|\{registerNumber\}/gi, rec.registerNumber)
          .replace(/\[CLASS \/ SUBJECT \/ EXAM\]|\[CLASS\/SUBJECT\/EXAM\]|\{academicGroup\}|\{class\}/gi, session.academicGroup)
          .replace(/\[DATE\]|\{date\}/gi, session.date)
          .replace(/\{department\}/gi, session.department);
      } else {
        messageContent = `DEAR PARENT,\n\nYour ward ${rec.studentName}\nRegister Number: ${rec.registerNumber}\n\nwas ABSENT for ${session.academicGroup} on ${session.date}.\n\nPlease take the necessary action.\n\nRegards,\nVSB Engineering College`;
      }

      let status = 'Sent';
      let errorMessage: string | undefined = undefined;

      if (isParentMatched) {
        const smsRes = await sendSMS(cleanPhone, messageContent);
        if (!smsRes.success) {
          status = 'Failed';
          errorMessage = typeof smsRes.error === 'string' ? smsRes.error : JSON.stringify(smsRes.error);
          failedCount++;
        } else {
          sentCount++;
        }
      } else {
        status = 'Failed';
        errorMessage = 'Parent Mobile Not Found in Student Enrollment database';
        failedCount++;
      }

      rec.parentMobile = isParentMatched ? cleanPhone : '';
      rec.parentMatched = isParentMatched;
      rec.smsSent = true;
      rec.smsSentAt = new Date().toISOString();
      rec.smsStatus = status as any;
      rec.smsErrorMessage = errorMessage;

      newSmsLogs.push({
        recipientName: rec.studentName,
        registerNumber: rec.registerNumber,
        phoneNumber: isParentMatched ? cleanPhone : 'N/A',
        department: rec.department || session.department,
        messageType: 'Attendance Absent',
        messageContent,
        channel: 'Fast2SMS Gateway',
        status,
        sentAt: rec.smsSentAt,
        sentBy: sender,
        errorMessage,
      });
    }

    if (newSmsLogs.length > 0) {
      db.addSmsLogs(newSmsLogs);
    }

    const updatedSession = await db.updateAttendanceSessionRecordsAsync(session.id, updatedRecords);

    db.addActivity(
      'sms',
      'Absent Parent SMS Dispatched',
      `Sent Absent SMS for ${session.academicGroup} (${session.department}) on ${session.date} (${sentCount} sent, ${failedCount} failed, ${skippedCount} skipped)`,
      sender
    );

    return res.json({
      success: true,
      totalAbsent: updatedRecords.filter((r) => r.status === 'ABSENT').length,
      sentCount,
      failedCount,
      skippedCount,
      session: updatedSession,
      logs: newSmsLogs,
    });
  } catch (err: any) {
    console.error('Absent SMS Dispatch error:', err);
    return res.status(500).json({ error: err.message || 'Failed to dispatch Absent SMS' });
  }
});

// Templates
app.get('/api/templates', (req, res) => {
  try {
    const templates = db.getSmsTemplates();
    return res.json(templates);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/templates', (req, res) => {
  try {
    const { title, type, templateText } = req.body;
    if (!title || !templateText) {
      return res.status(400).json({ error: 'Title and Template Text required' });
    }

    const created = db.addSmsTemplate({ title, type: type || 'General Notification', templateText }, (req as any).currentUser);
    return res.status(201).json(created);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.put('/api/templates/:id', (req, res) => {
  try {
    const { id } = req.params;
    const updated = db.updateSmsTemplate(id, req.body, (req as any).currentUser);
    return res.json(updated);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

app.delete('/api/templates/:id', (req, res) => {
  try {
    const { id } = req.params;
    db.deleteSmsTemplate(id, (req as any).currentUser);
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Settings
app.get('/api/settings', (req, res) => {
  try {
    const settings = db.getSettings();
    return res.json(settings);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/settings', (req, res) => {
  try {
    const settings = db.updateSettings(req.body, (req as any).currentUser);
    return res.json({ success: true, settings });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Activity Logs
app.get('/api/activity-logs', (req, res) => {
  try {
    const role = (req as any).userRole || '';
    const logs = db.getActivityLogs(role);
    return res.json(logs);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// --- DATABASE ENGINE STATUS ROUTE ---
app.get('/api/db/status', (req, res) => {
  const status = getMongoDBConnectionDetails();
  return res.json(status);
});

// --- GOOGLE GEMINI AI API ROUTES ---
app.get('/api/gemini/status', (req, res) => {
  const apiKey = process.env.GEMINI_API_KEY;
  const isConfigured = Boolean(apiKey && apiKey !== 'MY_GEMINI_API_KEY');
  return res.json({
    configured: isConfigured,
    keyName: 'GEMINI_API_KEY',
    model: 'gemini-3.8-flash',
  });
});

app.post('/api/gemini/generate', async (req, res) => {
  try {
    const { prompt, systemInstruction } = req.body;
    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      return res.status(400).json({ error: 'A valid non-empty "prompt" string is required.' });
    }

    // Lazy load Gemini client using process.env.GEMINI_API_KEY
    const ai = getGeminiClient();

    // Call Gemini 3.8 Flash model
    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt.trim(),
      config: systemInstruction
        ? { systemInstruction: systemInstruction.trim() }
        : undefined,
    });

    const outputText = response.text || 'No text output returned by Gemini model.';
    return res.json({ success: true, response: outputText });
  } catch (err: any) {
    console.error('Gemini API Error:', err);
    const errorMsg = err.message || 'Error occurred while contacting Google Gemini API.';

    if (errorMsg.includes('GEMINI_API_KEY is missing') || errorMsg.includes('API key not valid') || errorMsg.includes('API_KEY_INVALID')) {
      return res.status(401).json({
        error: 'Invalid or missing GEMINI_API_KEY. Please verify your .env file or environment variables.',
      });
    }

    return res.status(500).json({ error: errorMsg });
  }
});

// --- API KEYS MANAGEMENT ENDPOINTS ---
app.get('/api/keys', (req, res) => {
  const keys = db.getApiKeys();
  res.json(keys);
});

app.post('/api/keys', (req, res) => {
  const { name, role, department, scopes, description } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Key name is required' });
  }
  const newKey = db.addApiKey({ name, role, department, scopes, description });
  res.json(newKey);
});

app.patch('/api/keys/:id/toggle', (req, res) => {
  const updated = db.toggleApiKey(req.params.id);
  if (!updated) {
    return res.status(404).json({ error: 'API key not found' });
  }
  res.json(updated);
});

app.delete('/api/keys/:id', (req, res) => {
  const success = db.deleteApiKey(req.params.id);
  if (!success) {
    return res.status(404).json({ error: 'API key not found' });
  }
  res.json({ success: true });
});

// --- COMPLETE SOURCE CODE DOWNLOAD ENDPOINT ---
app.get('/api/download/source-code', async (req, res) => {
  try {
    const zip = new JSZip();
    const rootDir = process.cwd();

    const addFilesToZip = (dirPath: string, zipFolder: JSZip) => {
      const items = fs.readdirSync(dirPath);
      for (const item of items) {
        if (
          item === 'node_modules' ||
          item === '.git' ||
          item === 'dist' ||
          item === '.cache' ||
          item === 'data' ||
          (item.startsWith('.env') && item !== '.env.example') ||
          item.endsWith('.log')
        ) {
          continue;
        }
        const fullPath = path.join(dirPath, item);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          const subFolder = zipFolder.folder(item);
          if (subFolder) addFilesToZip(fullPath, subFolder);
        } else if (stat.isFile()) {
          const content = fs.readFileSync(fullPath);
          zipFolder.file(item, content);
        }
      }
    };

    addFilesToZip(rootDir, zip);

    const archiveBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="vsbec_sms_management_system.zip"');
    res.setHeader('Content-Length', archiveBuffer.length);
    res.send(archiveBuffer);
  } catch (err: any) {
    console.error('Download source code error:', err);
    res.status(500).json({ error: 'Failed to build source code ZIP' });
  }
});

// --- API 404 HANDLER ---
// Catch all unmatched /api requests and return clean JSON 404 instead of falling back to index.html
app.all(['/api', '/api/*'], (req, res) => {
  const msg = `API route not found: ${req.method} ${req.path}`;
  res.status(404).json({
    success: false,
    message: msg,
    error: msg,
  });
});

// --- GLOBAL EXPRESS ERROR HANDLER ---
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled Express Error:', err);
  if (res.headersSent) {
    return next(err);
  }
  const cleanMsg = typeof err === 'string' ? err : (err?.message || 'An unexpected server error occurred.');
  res.status(err.status || 500).json({
    success: false,
    message: cleanMsg,
    error: cleanMsg,
  });
});

// Start Server with Vite Middleware for dev / static output in prod (only when NOT on Vercel)
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      if (req.path.startsWith('/api')) {
        return res.status(404).json({
          success: false,
          message: `API endpoint not found: ${req.method} ${req.path}`,
          error: 'API endpoint not found',
        });
      }
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

if (!process.env.VERCEL && !process.env.NOW_REGION) {
  startServer();
}

export default app;
