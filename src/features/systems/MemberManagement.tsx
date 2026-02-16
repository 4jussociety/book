// MemberManagement: 관리자용 멤버 관리 페이지
// 게스트 입장 요청 승인/거절, 역할 배정, Realtime 신규 요청 알림

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/AuthContext'
import { Check, X, User, Loader2, Users, Bell, Shield, Stethoscope, Trash2, AlertTriangle } from 'lucide-react'

type GuestRequest = {
    id: string
    status: string
    created_at: string
    user_id: string
    role?: 'therapist' | 'staff' | string // guest_access.role added
    profiles: { full_name: string; email: string; role: string | null } | null
}

type RoleOption = 'therapist' | 'staff'

export default function MemberManagement() {
    const { profile, refreshProfile } = useAuth()
    const [requests, setRequests] = useState<GuestRequest[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [processingId, setProcessingId] = useState<string | null>(null)
    const [selectedRoles, setSelectedRoles] = useState<Record<string, RoleOption>>({})
    const [newRequestAlert, setNewRequestAlert] = useState(false)
    const [showResetModal, setShowResetModal] = useState(false)
    const [resetConfirmText, setResetConfirmText] = useState('')
    const [isResetting, setIsResetting] = useState(false)

    const fetchRequests = useCallback(async () => {
        if (!profile?.system_id) return
        setIsLoading(true)
        try {
            // 소유자 권한 확인 (프로필 존재 시)
            if (profile.id && profile.system_id) {
                await supabase.from('systems').select('owner_id').eq('id', profile.system_id).single()
            }

            const { data, error } = await supabase
                .from('guest_access')
                .select(`
                    *,
                    profiles:user_id ( full_name, email, role )
                `)
                .eq('system_id', profile.system_id)
                .order('created_at', { ascending: false })

            if (error) throw error
            setRequests((data || []) as unknown as GuestRequest[])
        } catch (err: unknown) {
            console.error('Error fetching requests:', err)
        } finally {
            setIsLoading(false)
        }
    }, [profile?.system_id, profile?.id])

    useEffect(() => {
        fetchRequests()
    }, [fetchRequests])

    // Supabase Realtime: 새 입장 요청 감지
    useEffect(() => {
        if (!profile?.system_id) return

        const channel = supabase
            .channel('admin-guest-requests')
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'guest_access',
                    filter: `system_id=eq.${profile.system_id}`,
                },
                () => {
                    setNewRequestAlert(true)
                    fetchRequests()
                }
            )
            .subscribe()

        return () => {
            supabase.removeChannel(channel)
        }
    }, [profile?.system_id, fetchRequests])

    const handleAction = async (requestId: string, guestUserId: string, status: 'approved' | 'rejected') => {
        setProcessingId(requestId)
        try {
            if (status === 'approved') {
                const role = selectedRoles[requestId] || 'therapist'

                // 1. guest_access 테이블 업데이트 (status='approved', role=선택된역할)
                const { error: accessUpdateError } = await supabase
                    .from('guest_access')
                    .update({ status: 'approved', role: role }) // status와 role 함께 업데이트
                    .eq('id', requestId)

                if (accessUpdateError) throw accessUpdateError

                // 2. profiles 테이블 업데이트 (system_id 연결, role은 null)
                const { error: profileError } = await supabase
                    .from('profiles')
                    .update({
                        system_id: profile?.system_id ?? null,
                        role: null // profiles.role은 이제 사용하지 않음 (명시적 null)
                    })
                    .eq('id', guestUserId)

                if (profileError) throw profileError
            } else { // status === 'rejected'
                // 1. guest_access 테이블 업데이트 (status='rejected')
                const { error: accessError } = await supabase
                    .from('guest_access')
                    .update({ status: 'rejected' })
                    .eq('id', requestId)

                if (accessError) throw accessError
            }

            // 3. 로컬 상태 업데이트
            setRequests(prev => prev.map(r => r.id === requestId ? { ...r, status } : r))
        } catch (err: unknown) {
            console.error('Error processing request:', err)
            alert('처리 중 오류가 발생했습니다.')
        } finally {
            setProcessingId(null)
        }
    }

    if (isLoading) {
        return (
            <div className="p-8 flex justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            </div>
        )
    }

    const pendingRequests = requests.filter(r => r.status === 'pending')

    return (
        <div className="max-w-4xl mx-auto p-4 sm:p-8">
            {/* 헤더 */}
            <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-100 rounded-lg text-blue-600">
                        <Users className="w-6 h-6" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">멤버 관리</h1>
                        <p className="text-gray-500 text-sm">시스템 입장 요청 및 멤버 권한을 관리합니다.</p>
                        {!profile?.system_id && (
                            <p className="text-red-500 text-xs font-bold mt-1">⚠️ 시스템 ID가 설정되지 않았습니다. 새로고침 해주세요.</p>
                        )}
                    </div>
                </div>

                <div className="flex gap-2">
                    <button
                        onClick={() => { fetchRequests(); refreshProfile() }}
                        className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors"
                        title="새로고침"
                    >
                        <Loader2 className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
                    </button>

                    {/* 새 요청 알림 */}
                    {newRequestAlert && (
                        <button
                            onClick={() => { setNewRequestAlert(false); fetchRequests() }}
                            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold animate-pulse hover:bg-blue-700 transition-colors"
                        >
                            <Bell className="w-4 h-4" />
                            새로운 요청!
                        </button>
                    )}
                </div>
            </div>

            {/* 승인 대기 목록 */}
            <section className="mb-12">
                <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                    승인 대기
                    <span className="bg-blue-600 text-white text-xs px-2 py-0.5 rounded-full">
                        {pendingRequests.length}
                    </span>
                </h2>
                {pendingRequests.length === 0 ? (
                    <div className="bg-white border border-dashed border-gray-300 rounded-2xl p-12 text-center text-gray-400">
                        대기 중인 요청이 없습니다.
                    </div>
                ) : (
                    <div className="grid gap-4">
                        {pendingRequests.map((req) => (
                            <div key={req.id} className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                                <div className="flex items-center justify-between mb-4">
                                    {/* 사용자 정보 */}
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 bg-blue-50 rounded-full flex items-center justify-center text-blue-500">
                                            <User className="w-6 h-6" />
                                        </div>
                                        <div>
                                            <div className="font-bold text-gray-900 text-lg">
                                                {req.profiles?.full_name || '이름 없음'}
                                            </div>
                                            <div className="text-sm text-gray-400">
                                                {new Date(req.created_at).toLocaleString('ko-KR', {
                                                    year: 'numeric', month: '2-digit', day: '2-digit',
                                                    hour: '2-digit', minute: '2-digit'
                                                })} 요청
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* 역할 선택 + 액션 버튼 */}
                                <div className="flex items-center justify-between bg-gray-50 rounded-xl p-3">
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs text-gray-500 font-bold">역할 배정:</span>
                                        <button
                                            onClick={() => setSelectedRoles(prev => ({ ...prev, [req.id]: 'therapist' }))}
                                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${(selectedRoles[req.id] || 'therapist') === 'therapist'
                                                ? 'bg-blue-600 text-white shadow-sm'
                                                : 'bg-white text-gray-500 border border-gray-200 hover:border-blue-300'
                                                }`}
                                        >
                                            <Stethoscope className="w-3.5 h-3.5" />
                                            치료사
                                        </button>
                                        <button
                                            onClick={() => setSelectedRoles(prev => ({ ...prev, [req.id]: 'staff' }))}
                                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${selectedRoles[req.id] === 'staff'
                                                ? 'bg-blue-600 text-white shadow-sm'
                                                : 'bg-white text-gray-500 border border-gray-200 hover:border-blue-300'
                                                }`}
                                        >
                                            <Shield className="w-3.5 h-3.5" />
                                            스태프
                                        </button>
                                    </div>

                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => handleAction(req.id, req.user_id, 'approved')}
                                            disabled={!!processingId}
                                            className="flex items-center gap-1.5 px-4 py-2 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-100 transition-colors disabled:opacity-50 text-sm font-bold"
                                            title="승인"
                                        >
                                            {processingId === req.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                                            승인
                                        </button>
                                        <button
                                            onClick={() => handleAction(req.id, req.user_id, 'rejected')}
                                            disabled={!!processingId}
                                            className="flex items-center gap-1.5 px-4 py-2 bg-red-50 text-red-600 rounded-xl hover:bg-red-100 transition-colors disabled:opacity-50 text-sm font-bold"
                                            title="거절"
                                        >
                                            <X className="w-4 h-4" />
                                            거절
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </section>

            {/* 승인된 멤버 목록 (Current Members) */}
            <section className="mb-12">
                <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                    현재 멤버
                    <span className="bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded-full">
                        {requests.filter(r => r.status === 'approved').length}
                    </span>
                </h2>
                <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-gray-50 text-gray-600">
                            <tr>
                                <th className="px-6 py-4 font-bold">이름</th>
                                <th className="px-6 py-4 font-bold">이메일/ID</th>
                                <th className="px-6 py-4 font-bold">현재 역할</th>
                                <th className="px-6 py-4 font-bold text-right">관리</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {requests.filter(r => r.status === 'approved').length === 0 ? (
                                <tr>
                                    <td colSpan={4} className="px-6 py-12 text-center text-gray-400">승인된 멤버가 없습니다.</td>
                                </tr>
                            ) : (
                                requests.filter(r => r.status === 'approved').map((member) => (
                                    <tr key={member.id} className="hover:bg-gray-50/50 transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${member.role === 'staff'
                                                    ? 'bg-green-100 text-green-600'
                                                    : 'bg-blue-100 text-blue-600'
                                                    }`}>
                                                    {member.role === 'staff' ? <Shield className="w-4 h-4" /> : <Stethoscope className="w-4 h-4" />}
                                                </div>
                                                <div>
                                                    <span className="font-bold text-gray-900 block">{member.profiles?.full_name || '이름 없음'}</span>
                                                    <span className={`text-xs font-bold ${member.role === 'staff' ? 'text-green-600' : 'text-blue-600'}`}>
                                                        {member.role === 'staff' ? '스태프' : '치료사'}
                                                    </span>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-gray-500 font-mono text-xs">
                                            {member.profiles?.email || '-'}
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={async () => {
                                                        if (!confirm(`${member.profiles?.full_name}님의 역할을 '치료사'로 변경하시겠습니까?`)) return
                                                        setProcessingId(member.id)
                                                        try {
                                                            // Role Update: guest_access 테이블 수정
                                                            const { error } = await supabase
                                                                .from('guest_access')
                                                                .update({ role: 'therapist' })
                                                                .eq('id', member.id) // guest_access.id 사용

                                                            if (error) throw error
                                                            fetchRequests() // Refresh
                                                        } catch (e) {
                                                            console.error(e)
                                                            alert('역할 변경 실패')
                                                        } finally {
                                                            setProcessingId(null)
                                                        }
                                                    }}
                                                    className={`px-3 py-1 rounded-lg text-xs font-bold border transition-colors flex items-center ${member.role === 'therapist'
                                                        ? 'bg-blue-100 text-blue-700 border-blue-200 ring-1 ring-blue-300'
                                                        : 'border-gray-200 text-gray-400 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200'
                                                        }`}
                                                    title="치료사로 변경"
                                                >
                                                    <Stethoscope className="w-3.5 h-3.5 inline mr-1" />
                                                    치료사
                                                </button>
                                                <button
                                                    onClick={async () => {
                                                        if (!confirm(`${member.profiles?.full_name}님의 역할을 '스태프'로 변경하시겠습니까?`)) return
                                                        setProcessingId(member.id)
                                                        try {
                                                            // Role Update: guest_access 테이블 수정
                                                            const { error } = await supabase
                                                                .from('guest_access')
                                                                .update({ role: 'staff' })
                                                                .eq('id', member.id) // guest_access.id 사용

                                                            if (error) throw error
                                                            fetchRequests()
                                                        } catch (e) {
                                                            console.error(e)
                                                            alert('역할 변경 실패')
                                                        } finally {
                                                            setProcessingId(null)
                                                        }
                                                    }}
                                                    className={`px-3 py-1 rounded-lg text-xs font-bold border transition-colors flex items-center ${member.role === 'staff'
                                                        ? 'bg-green-100 text-green-700 border-green-200 ring-1 ring-green-300'
                                                        : 'border-gray-200 text-gray-400 hover:bg-green-50 hover:text-green-600 hover:border-green-200'
                                                        }`}
                                                    title="스태프로 변경"
                                                >
                                                    <Shield className="w-3.5 h-3.5 inline mr-1" />
                                                    스태프
                                                </button>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <button
                                                onClick={async () => {
                                                    if (!confirm(`정말 ${member.profiles?.full_name} 멤버를 추방하시겠습니까? (접근 권한이 삭제됩니다)`)) return
                                                    setProcessingId(member.id)
                                                    try {
                                                        // Delete guest_access
                                                        await supabase.from('guest_access').delete().eq('id', member.id)
                                                        // Reset profile (role을 null로 초기화)
                                                        await supabase.from('profiles').update({ system_id: null, role: null }).eq('id', member.user_id)
                                                        fetchRequests()
                                                    } catch (e) {
                                                        console.error(e)
                                                        alert('추방 실패')
                                                    } finally {
                                                        setProcessingId(null)
                                                    }
                                                }}
                                                disabled={!!processingId}
                                                className="px-3 py-1.5 bg-red-50 text-red-600 rounded-lg text-xs font-bold hover:bg-red-100 transition-colors"
                                            >
                                                {processingId === member.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : '추방'}
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </section>

            {/* 거절된 요청 목록 (Rejected History) */}
            <section>
                <h2 className="text-lg font-bold text-gray-800 mb-4 text-gray-400">최근 거절 내역</h2>
                <div className="bg-gray-50 rounded-2xl border border-gray-100 overflow-hidden opacity-75 hover:opacity-100 transition-opacity">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-gray-100 text-gray-500">
                            <tr>
                                <th className="px-6 py-4 font-bold">사용자</th>
                                <th className="px-6 py-4 font-bold">요청일시</th>
                                <th className="px-6 py-4 font-bold">상태</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {requests.filter(r => r.status === 'rejected').length === 0 ? (
                                <tr>
                                    <td colSpan={3} className="px-6 py-8 text-center text-gray-400">거절된 내역이 없습니다.</td>
                                </tr>
                            ) : (
                                requests.filter(r => r.status === 'rejected').map((req) => (
                                    <tr key={req.id}>
                                        <td className="px-6 py-4 font-medium text-gray-600">{req.profiles?.full_name || '이름 없음'}</td>
                                        <td className="px-6 py-4 text-gray-500">
                                            {new Date(req.created_at).toLocaleString('ko-KR', {
                                                year: 'numeric', month: '2-digit', day: '2-digit',
                                                hour: '2-digit', minute: '2-digit'
                                            })}
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="px-2 py-1 rounded-lg text-xs font-bold bg-red-100 text-red-600">
                                                거절됨
                                            </span>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </section>

            {/* 위험 구역: 시스템 초기화 */}
            <section className="mt-16 border-t-2 border-red-100 pt-8">
                <h2 className="text-lg font-bold text-red-600 mb-2 flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5" />
                    위험 구역
                </h2>
                <p className="text-gray-500 text-sm mb-4">
                    시스템을 초기화하면 모든 예약, 환자 데이터, 멤버 정보가 영구 삭제됩니다.
                </p>
                <button
                    onClick={() => setShowResetModal(true)}
                    className="flex items-center gap-2 px-5 py-2.5 bg-white border-2 border-red-300 text-red-600 rounded-xl font-bold hover:bg-red-50 transition-colors text-sm"
                >
                    <Trash2 className="w-4 h-4" />
                    시스템 전체 초기화
                </button>
            </section>

            {/* 초기화 확인 모달 */}
            {showResetModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8">
                        <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-5 text-red-600">
                            <AlertTriangle className="w-7 h-7" />
                        </div>

                        <h3 className="text-xl font-bold text-gray-900 text-center mb-2">
                            정말 초기화하시겠습니까?
                        </h3>
                        <p className="text-gray-500 text-sm text-center mb-6 leading-relaxed">
                            이 작업은 <span className="text-red-600 font-bold">되돌릴 수 없습니다</span>.<br />
                            모든 예약, 환자, 멤버가 삭제되며 새 시스템을 개설해야 합니다.
                        </p>

                        <div className="mb-6">
                            <label className="block text-sm font-bold text-gray-700 mb-2">
                                확인을 위해 <span className="text-red-600">초기화</span>를 입력하세요
                            </label>
                            <input
                                type="text"
                                value={resetConfirmText}
                                onChange={(e) => setResetConfirmText(e.target.value)}
                                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all font-medium"
                                placeholder="초기화"
                            />
                        </div>

                        <div className="flex gap-3">
                            <button
                                onClick={() => { setShowResetModal(false); setResetConfirmText('') }}
                                className="flex-1 py-3 bg-gray-100 text-gray-600 rounded-xl font-bold hover:bg-gray-200 transition-colors"
                            >
                                취소
                            </button>
                            <button
                                onClick={async () => {
                                    if (!profile?.system_id) return
                                    setIsResetting(true)
                                    try {
                                        const systemId = profile.system_id

                                        // 1. 예약 삭제
                                        await supabase.from('appointments').delete().eq('system_id', systemId)
                                        // 2. 환자 삭제
                                        await supabase.from('patients').delete().eq('system_id', systemId)
                                        // 3. 게스트 접근 삭제
                                        await supabase.from('guest_access').delete().eq('system_id', systemId)
                                        // 4-a. 다른 멤버 프로필 초기화 (role도 null)
                                        await supabase.from('profiles').update({ system_id: null, role: null }).eq('system_id', systemId).neq('id', profile.id)
                                        // 4-b. 관리자(본인)는 system_id만 null, role은 therapist 유지
                                        await supabase.from('profiles').update({ system_id: null }).eq('id', profile.id)
                                        // 5. 시스템 삭제
                                        await supabase.from('systems').delete().eq('id', systemId)

                                        // 프로필 갱신 → SystemSetupModal 표시
                                        await refreshProfile()
                                    } catch (err: unknown) {
                                        console.error('System reset error:', err)
                                        alert('초기화 중 오류가 발생했습니다.')
                                    } finally {
                                        setIsResetting(false)
                                        setShowResetModal(false)
                                    }
                                }}
                                disabled={resetConfirmText !== '초기화' || isResetting}
                                className="flex-1 py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
                            >
                                {isResetting ? (
                                    <><Loader2 className="w-4 h-4 animate-spin" /> 삭제 중...</>
                                ) : (
                                    <><Trash2 className="w-4 h-4" /> 영구 삭제</>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
