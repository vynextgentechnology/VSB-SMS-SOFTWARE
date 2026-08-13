import React, { useState, useEffect } from 'react';
import { User, Student, Staff, Department, SmsTemplate, ExamBatch, SmsLog, DashboardStats, ParentEnrollment } from './types';
import { api, getCurrentUserId, setCurrentUserId, getAuthToken, setAuthToken, normalizeUser } from './lib/api';

import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { LoginModal } from './components/LoginModal';

import { Dashboard } from './components/Dashboard';
import { AdminManagement } from './components/AdminManagement';
import { GeminiAssistant } from './components/GeminiAssistant';
import { ParentEnrollmentSystem } from './components/ParentEnrollmentSystem';
import { DepartmentManagement } from './components/DepartmentManagement';
import { StudentManagement } from './components/StudentManagement';
import { StaffManagement } from './components/StaffManagement';
import { SmsSendingModule } from './components/SmsSendingModule';
import { ResultSmsSystem } from './components/ResultSmsSystem';
import { SmsReportSystem } from './components/SmsReportSystem';
import { TemplateManager } from './components/TemplateManager';
import { SettingsView } from './components/SettingsView';

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [showLoginModal, setShowLoginModal] = useState<boolean>(false);
  const [isAuthInitializing, setIsAuthInitializing] = useState<boolean>(true);
  const [isLoadingDashboard, setIsLoadingDashboard] = useState<boolean>(false);

  // Application Data States
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [parents, setParents] = useState<ParentEnrollment[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [templates, setTemplates] = useState<SmsTemplate[]>([]);
  const [examBatches, setExamBatches] = useState<ExamBatch[]>([]);
  const [smsLogs, setSmsLogs] = useState<SmsLog[]>([]);

  // Navigation state passed to SMS compose
  const [preSelectedStudent, setPreSelectedStudent] = useState<Student | null>(null);

  useEffect(() => {
    async function initAuth() {
      setIsAuthInitializing(true);
      const savedUserId = getCurrentUserId();
      const savedToken = getAuthToken();
      if (savedUserId && savedToken) {
        try {
          const res = await api.getMe();
          if (res && res.user) {
            const user = normalizeUser(res.user);
            setCurrentUser(user);
            setShowLoginModal(false);
            await refreshData();
          } else {
            setCurrentUserId('');
            setAuthToken('');
            setCurrentUser(null);
            setShowLoginModal(true);
          }
        } catch (err) {
          console.error('Failed to restore auth session:', err);
          setCurrentUserId('');
          setAuthToken('');
          setCurrentUser(null);
          setShowLoginModal(true);
        }
      } else {
        setCurrentUserId('');
        setAuthToken('');
        setCurrentUser(null);
        setShowLoginModal(true);
      }
      setIsAuthInitializing(false);
    }

    initAuth();
  }, []);

  // Role guard tab redirection
  useEffect(() => {
    if (!currentUser) return;
    const role = (currentUser.role || 'staff').toString().trim().toLowerCase();
    const adminTabs = ['dashboard', 'admin_management', 'departments', 'students', 'staff', 'sms_send', 'result_sms', 'sms_reports', 'templates', 'settings'];
    const hodTabs = ['dashboard', 'students', 'staff', 'sms_send', 'result_sms', 'templates'];
    const staffTabs = ['dashboard', 'students', 'sms_send', 'result_sms', 'templates'];

    const allowed = (role === 'admin' || role === 'super_admin') ? adminTabs : role === 'hod' ? hodTabs : staffTabs;
    if (!allowed.includes(activeTab)) {
      setActiveTab('dashboard');
    }
  }, [currentUser, activeTab]);

  const refreshData = async () => {
    try {
      const [statsData, parentsData, stdsData, staffData, deptsData, tplsData, batchesData, logsData] = await Promise.all([
        api.getDashboardStats().catch((e) => {
          console.error('getDashboardStats failed:', e);
          return null;
        }),
        api.getParents().catch(() => []),
        api.getStudents().catch(() => []),
        api.getStaff().catch(() => []),
        api.getDepartments().catch(() => []),
        api.getTemplates().catch(() => []),
        api.getExamBatches().catch(() => []),
        api.getSmsReports().catch(() => []),
      ]);

      if (statsData) setStats(statsData);
      setParents(parentsData);
      setStudents(stdsData);
      setStaffList(staffData);
      setDepartments(deptsData);
      setTemplates(tplsData);
      setExamBatches(batchesData);
      setSmsLogs(logsData);
    } catch (err) {
      console.error('Error refreshing application data:', err);
    }
  };

  const handleAddDepartment = async (dept: { code: string; name: string; headOfDepartment?: string }) => {
    await api.addDepartment(dept);
    await refreshData();
  };

  const handleUpdateDepartment = async (id: string, dept: { code: string; name: string; headOfDepartment?: string }) => {
    await api.updateDepartment(id, dept);
    await refreshData();
  };

  const handleDeleteDepartment = async (id: string) => {
    await api.deleteDepartment(id);
    await refreshData();
  };

  const handleSeedDepartments = async () => {
    await api.seedDepartments();
    await refreshData();
  };

  const handleLoginSuccess = async (user: User) => {
    setIsLoadingDashboard(true);
    const normalized = normalizeUser(user);
    setCurrentUser(normalized);
    setShowLoginModal(false);
    setActiveTab('dashboard');

    try {
      await refreshData();
    } catch (err) {
      console.error('Error loading dashboard after login:', err);
    } finally {
      setIsLoadingDashboard(false);
    }
  };

  const handleLogout = async () => {
    try {
      await api.logout();
    } catch (e) {
      // ignore
    }
    setCurrentUserId('');
    setAuthToken('');
    setCurrentUser(null);
    setStats(null);
    setShowLoginModal(true);
  };

  const handleSendSmsToStudent = (student: Student) => {
    setPreSelectedStudent(student);
    setActiveTab('sms_send');
  };

  if (isAuthInitializing) {
    return (
      <div className="min-h-screen bg-[#0f172a] text-slate-100 flex flex-col items-center justify-center p-4 font-sans">
        <div className="flex flex-col items-center space-y-4">
          <div className="w-10 h-10 border-4 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
          <div className="text-xs font-black uppercase tracking-widest text-slate-300">
            Loading dashboard...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f0f2f5] text-slate-800 flex flex-col font-sans selection:bg-blue-600 selection:text-white">
      
      {/* Header Bar displaying "VY NEXTGEN TECHNOLOGY" branding */}
      <Header
        user={currentUser}
        onLogout={handleLogout}
        activeView={activeTab}
      />

      <div className="flex-1 flex overflow-hidden">
        
        {/* Sidebar Navigation */}
        <Sidebar
          user={currentUser}
          activeTab={activeTab}
          setActiveTab={(tab) => {
            if (tab !== 'sms_send') setPreSelectedStudent(null);
            setActiveTab(tab);
          }}
          studentCount={students.length}
          staffCount={staffList.length}
        />

        {/* Main Content Viewport */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full">
          
          {isLoadingDashboard ? (
            <div className="p-12 text-center text-slate-600 font-extrabold uppercase tracking-widest flex flex-col items-center justify-center space-y-3 min-h-[400px]">
              <div className="w-8 h-8 border-3 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
              <span>Loading dashboard...</span>
            </div>
          ) : (
            <>
              {activeTab === 'dashboard' && (
                <Dashboard
                  stats={stats}
                  user={currentUser}
                  onNavigate={(tab) => {
                    if (tab !== 'sms_send') setPreSelectedStudent(null);
                    setActiveTab(tab);
                  }}
                  onRefresh={refreshData}
                />
              )}

              {activeTab === 'admin_management' && (
                <AdminManagement
                  departments={departments}
                  currentUser={currentUser}
                  onRefresh={refreshData}
                />
              )}

              {activeTab === 'gemini_ai' && (
                <GeminiAssistant />
              )}

              {activeTab === 'parents' && (
                <ParentEnrollmentSystem
                  parents={parents}
                  onRefresh={refreshData}
                />
              )}

              {activeTab === 'departments' && (
                <DepartmentManagement
                  departments={departments}
                  students={students}
                  staffList={staffList}
                  onAddDepartment={handleAddDepartment}
                  onUpdateDepartment={handleUpdateDepartment}
                  onDeleteDepartment={handleDeleteDepartment}
                  onSeedDepartments={handleSeedDepartments}
                  userRole={currentUser?.role || 'admin'}
                />
              )}

              {activeTab === 'students' && (
                <StudentManagement
                  students={students}
                  departments={departments}
                  currentUser={currentUser}
                  onRefresh={refreshData}
                  onSendSmsToStudent={handleSendSmsToStudent}
                />
              )}

              {activeTab === 'staff' && (
                <StaffManagement
                  staffList={staffList}
                  departments={departments}
                  currentUser={currentUser}
                  onRefresh={refreshData}
                />
              )}

              {activeTab === 'sms_send' && (
                <SmsSendingModule
                  students={students}
                  templates={templates}
                  departments={departments}
                  preSelectedStudent={preSelectedStudent}
                  currentUser={currentUser}
                  onRefresh={refreshData}
                  onNavigateToReports={() => setActiveTab('sms_reports')}
                />
              )}

              {activeTab === 'result_sms' && (
                <ResultSmsSystem
                  batches={examBatches}
                  departments={departments}
                  students={students}
                  parents={parents}
                  currentUser={currentUser}
                  onRefresh={refreshData}
                  onNavigateToReports={() => setActiveTab('sms_reports')}
                />
              )}

              {activeTab === 'sms_reports' && (
                <SmsReportSystem
                  logs={smsLogs}
                  onRefresh={refreshData}
                />
              )}

              {activeTab === 'templates' && (
                <TemplateManager
                  templates={templates}
                  onRefresh={refreshData}
                />
              )}

              {activeTab === 'settings' && (
                <SettingsView
                  onRefresh={refreshData}
                />
              )}
            </>
          )}

        </main>
      </div>

      {/* Login Modal overlay if logged out or requested */}
      {(!currentUser || showLoginModal) && (
        <LoginModal onLoginSuccess={handleLoginSuccess} />
      )}

    </div>
  );
}
