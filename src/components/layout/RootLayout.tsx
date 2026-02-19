import { Outlet } from 'react-router-dom'
import GNB from './GNB'
import { useAuth } from '@/features/auth/AuthContext'
import SystemSetupModal from '@/features/auth/SystemSetupModal'
import { useRealtimeAppointments } from '@/hooks/useRealtimeAppointments'

export default function RootLayout() {
    const { profile } = useAuth()

    // Supabase Realtime: appointments 테이블 변경 실시간 구독 (전역 1회)
    // 내 병원(system_id)의 데이터 변경만 구독
    useRealtimeAppointments(profile?.system_id)

    // 관리자(테라피스트)인데 시스템 ID가 없는 경우 개설 모달 표시
    const showSetupModal = profile && !profile.system_id && profile.role === 'therapist'

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
            <GNB />
            <main className="flex-1">
                <Outlet />
            </main>

            {showSetupModal && <SystemSetupModal />}
        </div>
    )
}
