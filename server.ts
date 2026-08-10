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
import { db } from './src/server/db.js';
import { sendSMS, getSmsApiKeyPoolStatus, rotateToNextKey } from './src/server/smsService.js';

const storage = multer.memoryStorage();
const upload = multer({ storage });

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
      return next();
    } catch (err) {
      // Invalid or expired token, fall back to x-user-id header
    }
  }
  const userId = (req.headers['x-user-id'] as string) || 'VSBEC';
  (req as any).currentUser = userId;
  next();
});

// --- API ROUTES ---

// Auth Routes (Strict Role-Based Authentication)
app.get('/api/auth/me', (req, res) => {
  const userId = req.headers['x-user-id'] as string;
  if (!userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  const user = db.getUserByUserId(userId);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  return res.json({ user });
});

app.get('/api/auth/setup-status', (req, res) => {
  return res.json({ hasAdmin: db.hasAdmin() });
});

app.post('/api/auth/setup-admin', (req, res) => {
  try {
    const { name, userId, password, department } = req.body;
    if (!name || !userId || !password) {
      return res.status(400).json({ error: 'Name, User ID, and Password are required for admin setup' });
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
    return res.status(400).json({ error: err.message || 'Failed to setup admin account' });
  }
});

app.post('/api/auth/login', (req, res) => {
  const { userId, password, role } = req.body;
  if (!userId || !password) {
    return res.status(400).json({ error: 'User ID and Password required' });
  }

  const result = db.authenticate(userId, password, role, JWT_SECRET);
  if (!result) {
    return res.status(401).json({ error: 'Invalid credentials or wrong role' });
  }

  return res.json({ success: true, token: result.token, user: result.user });
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
    const logs = db.getLoginLogs();
    return res.json(logs);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// --- REPORT DOWNLOAD ENDPOINTS (CSV / Excel format) ---
app.get('/api/reports/login-history', (req, res) => {
  try {
    const logs = db.getLoginLogs();
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

app.get('/api/reports/students', (req, res) => {
  try {
    const students = db.getStudents();
    const headers = ['Register Number', 'Student Name', 'Department', 'Parent Phone Number', 'Enrolled Date'];
    const rows = students.map(s => [s.registerNumber, s.name, s.department, s.phoneNumber, new Date(s.createdAt).toLocaleString()]);
    const csvContent = [headers.join(','), ...rows.map(r => r.map(c => `"${c}"`).join(','))].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="student_records_report.csv"');
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

// Excel (.xlsx) File Upload Endpoint for Student Enrollment
app.post('/api/students/upload-excel', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Excel file (.xlsx or .xls) is required' });
    }

    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rawData = XLSX.utils.sheet_to_json<any>(sheet);

    if (!rawData || rawData.length === 0) {
      return res.status(400).json({ error: 'Uploaded Excel file is empty.' });
    }

    const parsedStudents: Array<{ name: string; registerNumber: string; department: string; phoneNumber: string }> = [];

    rawData.forEach((row: any) => {
      const name = (row['Student Name'] || row['Name'] || row['studentName'] || row['Student'] || '').toString().trim();
      const registerNumber = (row['Register Number'] || row['RegisterNo'] || row['Reg No'] || row['regNo'] || row['Register Number (UNIQUE)'] || '').toString().trim().toUpperCase();
      const department = (row['Department'] || row['Dept'] || row['dept'] || 'General').toString().trim().toUpperCase();
      const phoneNumber = (row['Parent Phone Number'] || row['Parent Mobile Number'] || row['Phone Number'] || row['Phone'] || row['Mobile'] || '').toString().trim().replace(/\D/g, '');

      if (name && registerNumber && phoneNumber) {
        parsedStudents.push({
          name,
          registerNumber,
          department,
          phoneNumber,
        });
      }
    });

    if (parsedStudents.length === 0) {
      return res.status(400).json({ error: 'No valid student records found in Excel. Ensure headers include: Student Name, Register Number, Department, Parent Phone Number.' });
    }

    const importResult = db.importStudentsBatch(parsedStudents, (req as any).currentUser);
    return res.json({
      success: true,
      message: `Processed ${parsedStudents.length} records. Added: ${importResult.addedCount}, Skipped/Duplicates: ${importResult.skippedCount}`,
      added: importResult.addedCount,
      updated: importResult.skippedCount,
      ...importResult,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to parse Excel file' });
  }
});

// Dashboard Stats
app.get('/api/dashboard/stats', (req, res) => {
  try {
    const stats = db.getDashboardStats();
    return res.json(stats);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Student Management
app.get('/api/students', (req, res) => {
  try {
    const students = db.getStudents();
    return res.json(students);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/students', (req, res) => {
  try {
    const { name, registerNumber, department, phoneNumber } = req.body;
    if (!name || !registerNumber || !department || !phoneNumber) {
      return res.status(400).json({ error: 'Name, Register Number, Department, and Phone Number are required' });
    }

    const newStudent = db.addStudent(
      { name, registerNumber, department, phoneNumber },
      (req as any).currentUser
    );
    return res.status(201).json(newStudent);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

app.post('/api/students/batch', (req, res) => {
  try {
    const { students } = req.body;
    if (!Array.isArray(students) || students.length === 0) {
      return res.status(400).json({ error: 'Array of student records required' });
    }

    const result = db.importStudentsBatch(students, (req as any).currentUser);
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/students/upload-excel', upload.single('file'), (req, res) => {
  try {
    console.log('[Excel Upload API] Received file upload request...');

    if (!req.file) {
      console.error('[Excel Upload Error] No file attached in request');
      return res.status(400).json({ error: 'No Excel file selected. Please choose a valid .xlsx or .xls spreadsheet file.' });
    }

    const origName = req.file.originalname || '';
    console.log(`[Excel Upload API] File name: "${origName}", Size: ${req.file.size} bytes, MimeType: ${req.file.mimetype}`);

    if (!origName.match(/\.(xlsx|xls|csv)$/i)) {
      console.error(`[Excel Upload Error] Invalid file format: ${origName}`);
      return res.status(400).json({
        error: 'Unsupported file format. Please upload a Microsoft Excel spreadsheet (.xlsx or .xls).'
      });
    }

    let workbook;
    try {
      workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    } catch (parseErr: any) {
      console.error('[Excel Upload Error] Failed to parse workbook:', parseErr);
      return res.status(400).json({
        error: `Failed to read Excel file: ${parseErr.message || 'File may be corrupted or password protected.'}`
      });
    }

    if (!workbook || !workbook.SheetNames || workbook.SheetNames.length === 0) {
      return res.status(400).json({ error: 'Excel file contains no worksheet sheets.' });
    }

    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const rawRows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

    if (!rawRows || rawRows.length === 0) {
      return res.status(400).json({ error: 'Excel worksheet is completely empty.' });
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
      return res.status(400).json({ error: 'Could not locate header row in Excel worksheet.' });
    }

    const headers = rawRows[headerRowIdx].map((h: any) => (h !== null && h !== undefined ? String(h).trim() : ''));
    console.log(`[Excel Upload API] Detected headers at row ${headerRowIdx + 1}:`, headers);

    let nameIdx = -1;
    let regNoIdx = -1;
    let deptIdx = -1;
    let phoneIdx = -1;
    let marksIdx = -1;

    headers.forEach((h, idx) => {
      const clean = h.toUpperCase().replace(/[^A-Z0-9\s_]/g, '').trim();
      if (/^(REGISTER|REG|REGISTRATION|REGISTER NO|REG NO|REGISTER NUMBER|STUDENT ID|ROLL NO|REG_NO)$/.test(clean) || clean.includes('REGISTER') || clean.includes('REG NO') || clean.includes('ROLL')) {
        regNoIdx = idx;
      } else if (/^(NAME|STUDENT NAME|STUDENT_NAME|FULL NAME)$/.test(clean) || clean.includes('NAME')) {
        nameIdx = idx;
      } else if (/^(DEPARTMENT|DEPT|BRANCH|DEPT CODE|STREAM)$/.test(clean) || clean.includes('DEPT') || clean.includes('BRANCH')) {
        deptIdx = idx;
      } else if (/^(MOBILE|PHONE|PHONE NUMBER|CONTACT|MOBILE NO|PARENT MOBILE|PARENT PHONE|GUARDIAN PHONE)$/.test(clean) || clean.includes('MOBILE') || clean.includes('PHONE')) {
        phoneIdx = idx;
      } else if (/^(MARKS|MARK|SCORE|RESULT|TOTAL MARKS|GRADE)$/.test(clean) || clean.includes('MARK') || clean.includes('RESULT') || clean.includes('SCORE')) {
        marksIdx = idx;
      }
    });

    // Smart index fallbacks
    if (nameIdx === -1 && headers.length > 0) nameIdx = 0;
    if (regNoIdx === -1 && headers.length > 1) regNoIdx = 1;
    if (deptIdx === -1 && headers.length > 2) deptIdx = 2;
    if (phoneIdx === -1 && headers.length > 3) phoneIdx = 3;

    const parsedStudents: Array<{ name: string; registerNumber: string; department: string; phoneNumber: string; marks?: string }> = [];
    const validationErrors: string[] = [];

    for (let r = headerRowIdx + 1; r < rawRows.length; r++) {
      const row = rawRows[r];
      if (!row || row.length === 0) continue;

      const name = nameIdx >= 0 && row[nameIdx] !== undefined ? String(row[nameIdx]).trim() : '';
      const registerNumber = regNoIdx >= 0 && row[regNoIdx] !== undefined ? String(row[regNoIdx]).trim() : '';
      const department = deptIdx >= 0 && row[deptIdx] !== undefined ? String(row[deptIdx]).trim().toUpperCase() : 'CSE';
      const phoneNumber = phoneIdx >= 0 && row[phoneIdx] !== undefined ? String(row[phoneIdx]).trim().replace(/[^0-9+]/g, '') : '';
      const marks = marksIdx >= 0 && row[marksIdx] !== undefined ? String(row[marksIdx]).trim() : '';

      // Skip totally blank rows
      if (!name && !registerNumber && !phoneNumber) {
        continue;
      }

      // Check required fields
      if (!registerNumber) {
        validationErrors.push(`Row ${r + 1}: Missing Register Number`);
        continue;
      }
      if (!name) {
        validationErrors.push(`Row ${r + 1} (${registerNumber}): Missing Student Name`);
        continue;
      }
      if (!phoneNumber) {
        validationErrors.push(`Row ${r + 1} (${registerNumber} - ${name}): Missing Parent Phone Number`);
        continue;
      }

      parsedStudents.push({
        name,
        registerNumber,
        department: department || 'CSE',
        phoneNumber,
        ...(marks ? { marks } : {})
      });
    }

    if (parsedStudents.length === 0) {
      const detailMsg = validationErrors.length > 0
        ? `Excel validation errors: ${validationErrors.slice(0, 4).join('; ')}`
        : 'No valid student records found in Excel. Expected columns: Register Number, Student Name, Department, Parent Phone Number.';
      console.error(`[Excel Upload Error] ${detailMsg}`);
      return res.status(400).json({ error: detailMsg, validationErrors });
    }

    console.log(`[Excel Upload API] Parsed ${parsedStudents.length} valid student records. Storing in database...`);

    const result = db.importStudentsBatch(parsedStudents, (req as any).currentUser);

    console.log(`[Excel Upload API] Database save success. Added: ${result.addedCount}, Updated: ${result.updatedCount || result.skippedCount}`);

    return res.json({
      success: true,
      message: `Excel import successful! Added ${result.addedCount} new students, updated ${result.updatedCount || result.skippedCount} existing records.`,
      added: result.addedCount,
      updated: result.updatedCount || result.skippedCount,
      totalParsed: parsedStudents.length,
      parsedStudents,
      validationWarnings: validationErrors.length > 0 ? validationErrors : undefined
    });

  } catch (err: any) {
    console.error('[Excel Upload Fatal Server Error]:', err);
    return res.status(500).json({ error: `Internal server error during Excel processing: ${err.message || 'Unknown error'}` });
  }
});

app.put('/api/students/:id', (req, res) => {
  try {
    const { id } = req.params;
    const updated = db.updateStudent(id, req.body, (req as any).currentUser);
    return res.json(updated);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

app.delete('/api/students/:id', (req, res) => {
  try {
    const { id } = req.params;
    const success = db.deleteStudent(id, (req as any).currentUser);
    if (!success) return res.status(404).json({ error: 'Student not found' });
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Department Management
app.get('/api/departments', (req, res) => {
  try {
    const depts = db.getDepartments();
    return res.json(depts);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/departments/seed', (req, res) => {
  try {
    db.seedDefaultDepartments();
    const depts = db.getDepartments();
    return res.json({ success: true, message: 'Default departments seeded successfully', departments: depts });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/departments', (req, res) => {
  try {
    const { code, name, headOfDepartment } = req.body;
    if (!code || !name) {
      return res.status(400).json({ error: 'Code and Name required' });
    }
    const created = db.addDepartment({ code, name, headOfDepartment }, (req as any).currentUser);
    return res.status(201).json(created);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

app.put('/api/departments/:id', (req, res) => {
  try {
    const { id } = req.params;
    const updated = db.updateDepartment(id, req.body, (req as any).currentUser);
    return res.json(updated);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

app.delete('/api/departments/:id', (req, res) => {
  try {
    const { id } = req.params;
    const success = db.deleteDepartment(id, (req as any).currentUser);
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
app.get('/api/users', (req, res) => {
  try {
    const users = db.getUsers();
    return res.json(users);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/users', (req, res) => {
  try {
    const { userId, name, role, department, phoneNumber, rawPassword } = req.body;
    if (!userId || !name || !role) {
      return res.status(400).json({ error: 'User ID, Name, and Role are required' });
    }
    const created = db.addUser(
      { userId, name, role, department, phoneNumber, rawPassword },
      (req as any).currentUser
    );
    return res.status(201).json(created);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

app.put('/api/users/:id', (req, res) => {
  try {
    const { id } = req.params;
    const updated = db.updateUser(id, req.body, (req as any).currentUser);
    return res.json(updated);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

app.delete('/api/users/:id', (req, res) => {
  try {
    const { id } = req.params;
    const success = db.deleteUser(id, (req as any).currentUser);
    if (!success) return res.status(404).json({ error: 'User not found' });
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Staff Management
app.get('/api/staff', (req, res) => {
  try {
    const staff = db.getStaff();
    return res.json(staff);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/staff', (req, res) => {
  try {
    const { name, staffId, department, phoneNumber, permissions } = req.body;
    if (!name || !staffId || !department || !phoneNumber) {
      return res.status(400).json({ error: 'Name, Staff ID, Department, and Phone Number are required' });
    }

    const newStaff = db.addStaff(
      { name, staffId, department, phoneNumber, permissions: permissions || ['send_sms', 'view_reports'] },
      (req as any).currentUser
    );
    return res.status(201).json(newStaff);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

app.put('/api/staff/:id', (req, res) => {
  try {
    const { id } = req.params;
    const updated = db.updateStaff(id, req.body, (req as any).currentUser);
    return res.json(updated);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

app.delete('/api/staff/:id', (req, res) => {
  try {
    const { id } = req.params;
    const success = db.deleteStaff(id, (req as any).currentUser);
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

// SMS Sending Module (Bulk / Group Dispatch)
app.post('/api/sms/send', async (req, res) => {
  try {
    const { recipients, messageType, messageContent, channel, templateId } = req.body;

    if (!Array.isArray(recipients) || recipients.length === 0) {
      return res.status(400).json({ error: 'No recipients provided' });
    }

    if (!messageContent || !messageContent.trim()) {
      return res.status(400).json({ error: 'Message content cannot be empty' });
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

// SMS Reports
app.get('/api/sms/reports', (req, res) => {
  try {
    const logs = db.getSmsLogs();
    return res.json(logs);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.delete('/api/sms/reports', (req, res) => {
  try {
    db.clearSmsLogs((req as any).currentUser);
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Exam Results
app.get('/api/results', (req, res) => {
  try {
    const batches = db.getExamBatches();
    return res.json(batches);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/results', (req, res) => {
  try {
    const { title, department, examDate, results } = req.body;
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

    const batch = db.addExamBatch(title, department, examDate || new Date().toISOString().split('T')[0], results, currentUser);
    return res.status(201).json(batch);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/results/:id/send-sms', async (req, res) => {
  try {
    const { id } = req.params;
    const batches = db.getExamBatches();
    const batch = batches.find((b) => b.id === id);

    if (!batch) {
      return res.status(404).json({ error: 'Exam Result Batch not found' });
    }

    const sender = (req as any).currentUser || 'VSBEC';
    const updatedResults = [...batch.results];
    const newSmsLogs: any[] = [];

    for (const rec of updatedResults) {
      const totalDisplay = rec.totalMarks !== undefined && rec.totalMarks !== null && rec.totalMarks !== ''
        ? rec.totalMarks
        : (rec.subjects && rec.subjects.length > 0 ? rec.subjects.reduce((sum: number, s: any) => sum + (Number(s.marks) || 0), 0) : 'N/A');

      let subjectLines = '';
      if (rec.subjects && rec.subjects.length > 0) {
        subjectLines = rec.subjects.map((s: any) => `${s.subjectName || s.subjectCode}: ${s.marks}`).join('\n');
      } else {
        subjectLines = `Total Marks: ${totalDisplay}`;
      }

      const messageContent = `Dear Parent,
Your ward ${rec.studentName} (Reg: ${rec.registerNumber})

${subjectLines}

Result: ${rec.overallStatus}

- VSB Engineering College
Powered by VY NEXTGEN TECHNOLOGY`;

      let status = 'Sent';
      let errorMessage: string | undefined = undefined;

      const cleanPhone = rec.phoneNumber ? rec.phoneNumber.replace(/\D/g, '') : '';

      // Send SMS ONLY if Parent enrolled & Register Number matched
      if (rec.matchedParent !== false && cleanPhone && cleanPhone.length >= 10) {
        const smsRes = await sendSMS(rec.phoneNumber, messageContent);
        if (!smsRes.success) {
          status = 'Failed';
          errorMessage = typeof smsRes.error === 'string' ? smsRes.error : JSON.stringify(smsRes.error);
        }
      } else {
        status = 'Failed';
        errorMessage = rec.matchedParent === false
          ? 'Parent Not Enrolled / Unmatched Register Number'
          : 'Invalid or missing parent mobile number';
      }

      rec.smsSent = true;
      rec.smsSentAt = new Date().toISOString();
      rec.smsStatus = status as any;
      rec.smsErrorMessage = errorMessage;

      newSmsLogs.push({
        recipientName: rec.studentName,
        registerNumber: rec.registerNumber,
        phoneNumber: rec.phoneNumber,
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
    db.updateExamBatchResults(id, updatedResults);

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
    const logs = db.getActivityLogs();
    return res.json(logs);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// --- GOOGLE GEMINI AI API ROUTES ---
app.get('/api/gemini/status', (req, res) => {
  const apiKey = process.env.GEMINI_API_KEY;
  const isConfigured = Boolean(apiKey && apiKey !== 'MY_GEMINI_API_KEY');
  return res.json({
    configured: isConfigured,
    keyName: 'GEMINI_API_KEY',
    model: 'gemini-3.6-flash',
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

    // Call Gemini 3.6 Flash model
    const response = await ai.models.generateContent({
      model: 'gemini-3.6-flash',
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
app.all('/api/*', (req, res) => {
  res.status(404).json({
    error: `API route not found: ${req.method} ${req.path}`,
  });
});

// --- GLOBAL EXPRESS ERROR HANDLER ---
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled Express Error:', err);
  if (res.headersSent) {
    return next(err);
  }
  res.status(err.status || 500).json({
    error: err.message || 'An unexpected server error occurred.',
  });
});

// Start Server with Vite Middleware for dev / static output in prod
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
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
