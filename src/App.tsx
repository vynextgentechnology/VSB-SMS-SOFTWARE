import React, { useState, useEffect } from 'react';
import { User, Student, Staff, Department, SmsTemplate, ExamBatch, SmsLog, DashboardStats, ParentEnrollment } from './types';
import { api, getCurrentUserId, setCurrentUserId } from './lib/api';

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
    const savedUserId = getCurrentUserId();
    if (savedUserId) {
      api
        .getMe()
        .then((res) => {
          if (res && res.user) {
            setCurrentUser(res.user);
          } else {
            setCurrentUserId('');
            setCurrentUser(null);
            setShowLoginModal(true);
          }
        })
        .catch(() => {
          setCurrentUserId('');
          setCurrentUser(null);
          setShowLoginModal(true);
        });
    } else {
      setShowLoginModal(true);
    }
  }, []);

  // Role guard tab redirection
  useEffect(() => {
    if (!currentUser) return;
    const role = currentUser.role || 'staff';
    const adminTabs = ['dashboard', 'admin_management', 'departments', 'students', 'staff', 'sms_send', 'result_sms', 'sms_reports', 'templates', 'settings'];
    const hodTabs = ['dashboard', 'students', 'staff', 'sms_send', 'result_sms', 'templates'];
    const staffTabs = ['dashboard', 'students', 'sms_send', 'result_sms', 'templates'];

    const allowed = role === 'admin' ? adminTabs : role === 'hod' ? hodTabs : staffTabs;
    if (!allowed.includes(activeTab)) {
      setActiveTab('dashboard');
    }
  }, [currentUser, activeTab]);

  useEffect(() => {
    if (currentUser) {
      refreshData();
    }
  }, [currentUser]);

  const refreshData = async () => {
    try {
      const [statsData, parentsData, stdsData, staffData, deptsData, tplsData, batchesData, logsData] = await Promise.all([
        api.getDashboardStats().catch(() => null),
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

  const handleLoginSuccess = (user: User) => {
    setCurrentUser(user);
    setShowLoginModal(false);
    refreshData();
  };

  const handleLogout = async () => {
    try {
      await api.logout();
    } catch (e) {
      // ignore
    }
    setCurrentUserId('');
    setCurrentUser(null);
    setShowLoginModal(true);
  };

  const handleSendSmsToStudent = (student: Student) => {
    setPreSelectedStudent(student);
    setActiveTab('sms_send');
  };

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

        </main>
      </div>

      {/* Login Modal overlay if logged out or requested */}
      {(!currentUser || showLoginModal) && (
        <LoginModal onLoginSuccess={handleLoginSuccess} />
      )}

    </div>
  );
}
