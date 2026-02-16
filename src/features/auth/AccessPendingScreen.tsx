// AccessPendingScreen: 게스트 승인 대기 화면
// Supabase Realtime으로 승인 상태를 자동 감지하여 메인 페이지로 리다이렉트

import { useState, useEffect } from 'react'
import { useAuth } from './AuthContext'
import { supabase } from '@/lib/supabase'
import { Clock, LogOut, XCircle, RefreshCw } from 'lucide-react'

export default function AccessPendingScreen() {
    const { signOut, guestStatus, user, refreshProfile } = useAuth()
    const [dotCount, setDotCount] = useState(0)

    // 점 애니메이션 (대기 중 시각 효과)
    useEffect(() => {
        const interval = setInterval(() => {
            setDotCount(prev => (prev + 1) % 4)
        }, 600)
        return () => clearInterval(interval)
    }, [])

    // Supabase Realtime 구독: guest_access 상태 변경 감지
    useEffect(() => {
        if (!user) return

        const channel = supabase
            .channel('guest-access-status')
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'guest_access',
                    filter: `user_id=eq.${user.id}`,
                },
                (payload) => {
                    const newStatus = payload.new?.status
                    if (newStatus === 'approved' || newStatus === 'rejected') {
                        // 상태 변경 감지 → 프로필 갱신
                        refreshProfile()
                    }
                }
            )
            .subscribe()

        return () => {
            supabase.removeChannel(channel)
        }
    }, [user, refreshProfile])

    // 폴링 백업: 10초마다 수동 확인 (Realtime 연결 실패 대비)
    useEffect(() => {
        const interval = setInterval(() => {
            refreshProfile()
        }, 10000)
        return () => clearInterval(interval)
    }, [refreshProfile])

    const isRejected = guestStatus === 'rejected'

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4 font-sans">
            <div className="max-w-md w-full bg-white p-8 rounded-2xl shadow-sm border border-gray-200 text-center">
                <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6 ${isRejected
                    ? 'bg-red-100 text-red-600'
                    : 'bg-yellow-100 text-yellow-600'
                    }`}>
                    {isRejected
                        ? <XCircle className="w-8 h-8" />
                        : <Clock className="w-8 h-8" />
                    }
                </div>

                <h2 className="text-2xl font-bold text-gray-900 mb-2">
                    {isRejected ? '입장이 거절되었습니다' : '승인 대기 중'}
                </h2>

                <p className="text-gray-500 mb-6 leading-relaxed">
                    {isRejected
                        ? '해당 스케줄 시스템 관리자에 의해 입장이 거절되었습니다.\n관리자에게 문의하세요.'
                        : `관리자가 귀하의 입장을 검토하고 있습니다.\n승인이 완료되면 자동으로 이동합니다.`}
                </p>

                {!isRejected && (
                    <div className="bg-blue-50 p-4 rounded-xl mb-6 text-blue-600 text-sm font-medium flex items-center justify-center gap-2">
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>승인 상태 확인 중{'.'.repeat(dotCount)}</span>
                    </div>
                )}

                {isRejected && (
                    <div className="bg-red-50 p-4 rounded-xl mb-6 text-red-600 text-sm">
                        ⚠️ 다른 일련번호로 다시 시도하거나 관리자에게 문의하세요.
                    </div>
                )}

                <button
                    onClick={() => signOut()}
                    className="flex items-center justify-center gap-2 mx-auto text-gray-500 hover:text-gray-700 transition-colors text-sm"
                >
                    <LogOut className="w-4 h-4" />
                    로그아웃 및 나가기
                </button>
            </div>
        </div>
    )
}
