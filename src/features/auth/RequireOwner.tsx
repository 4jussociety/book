// RequireOwner: 관리자(owner) 전용 라우트 가드 컴포넌트
// owner가 아닌 사용자가 접근 시 예약 관리 페이지로 리다이렉트

import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '@/features/auth/AuthContext'

export default function RequireOwner() {
    const { profile } = useAuth()

    if (!profile) return null

    if (!profile.is_owner) {
        return <Navigate to="/calendar" replace />
    }

    return <Outlet />
}
