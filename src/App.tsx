import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './features/auth/AuthProvider'
import LoginPage from './features/auth/LoginPage'
import RequireAuth from './components/layout/RequireAuth'
import RequireOwner from './features/auth/RequireOwner'
import CalendarPage from './features/calendar/CalendarPage'
import ClientList from './features/clients/ClientList'
import StatisticsPage from './features/statistics/StatisticsPage'
import MemberManagement from './features/systems/MemberManagement'
import ProfilePage from './features/profile/ProfilePage'
import ManagerPage from './features/manager/ManagerPage'
import SuperAdminPage from './features/super-admin/SuperAdminPage'

import RootLayout from './components/layout/RootLayout'

const queryClient = new QueryClient()

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />

            <Route element={<RequireAuth />}>
              <Route element={<RootLayout />}>
                <Route path="/" element={<Navigate to="/calendar" replace />} />
                <Route path="/calendar" element={<CalendarPage />} />
                <Route path="/clients" element={<ClientList />} />
                <Route path="/profile" element={<ProfilePage />} />

                {/* 관리자 전용 라우트 */}
                <Route element={<RequireOwner />}>
                  <Route path="/statistics" element={<StatisticsPage />} />
                  <Route path="/members" element={<MemberManagement />} />
                  <Route path="/settings" element={<ManagerPage />} />
                </Route>
              </Route>
            </Route>

            {/* Super Admin 전용 (Layout 없이 독립적이거나 RootLayout 사용할 수 있음) */}
            <Route element={<RequireAuth />}>
              <Route path="/super-admin" element={<SuperAdminPage />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  )
}

export default App
