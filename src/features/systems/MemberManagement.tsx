// MemberManagement: 관리자용 멤버 관리 페이지
// 소유자가 직접 멤버(치료사/스태프)의 ID와 비밀번호를 발급하여 시스템에 등록합니다.

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/AuthContext'
import { Check, X, Loader2, Users, Shield, Stethoscope, Trash2, AlertTriangle, Plus, Key } from 'lucide-react'

type GuestRequest = {
    id: string
    status: string
    created_at: string
    user_id: string
    role?: 'therapist' | 'staff' | string
    profiles: { full_name: string; email: string; role: string | null } | null
}

type RoleOption = 'therapist' | 'staff'

export default function MemberManagement() {
    const { profile, refreshProfile } = useAuth()
    const [members, setMembers] = useState<GuestRequest[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [processingId, setProcessingId] = useState<string | null>(null)

    // 새 멤버 모달 상태
    const [showCreateModal, setShowCreateModal] = useState(false)
    const [isCreating, setIsCreating] = useState(false)
    const [newMemberForm, setNewMemberForm] = useState({
        guestId: '',
        password: '',
        name: '',
        role: 'therapist' as RoleOption
    })

    const [showResetModal, setShowResetModal] = useState(false)
    const [resetConfirmText, setResetConfirmText] = useState('')
    const [isResetting, setIsResetting] = useState(false)

    const fetchMembers = useCallback(async () => {
        if (!profile?.system_id) return
        setIsLoading(true)
        try {
            const { data, error } = await supabase
                .from('guest_access')
                .select(`
                    *,
                    profiles:user_id ( full_name, email, role )
                `)
                .eq('system_id', profile.system_id)
                .order('created_at', { ascending: false })

            if (error) throw error
            // approved 상태인 멤버만 표시 (거절/대기 로직 제거됨)
            setMembers((data || []).filter(r => r.status === 'approved') as unknown as GuestRequest[])
        } catch (err: unknown) {
            console.error('Error fetching members:', err)
        } finally {
            setIsLoading(false)
        }
    }, [profile?.system_id])

    useEffect(() => {
        fetchMembers()
    }, [fetchMembers])

    const handleCreateMember = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!profile?.system_id) return

        if (!newMemberForm.guestId || !newMemberForm.password || !newMemberForm.name) {
            alert('모든 필드를 입력해주세요.')
            return
        }

        // 아이디 영문 숫자 확인 등 간단 규칙 (선택 사항)
        if (!/^[a-zA-Z0-9_]+$/.test(newMemberForm.guestId)) {
            alert('아이디는 영문, 숫자, 밑줄(_)만 사용 가능합니다.')
            return
        }

        if (newMemberForm.password.length < 6) {
            alert('비밀번호는 최소 6자 이상이어야 합니다.')
            return
        }

        setIsCreating(true)
        try {
            const { data, error } = await supabase.functions.invoke('create-member', {
                body: {
                    systemId: profile.system_id,
                    guestId: newMemberForm.guestId,
                    password: newMemberForm.password,
                    name: newMemberForm.name,
                    role: newMemberForm.role
                }
            })

            if (error) {
                throw new Error(error.message || '서버 오류가 발생했습니다.')
            }

            if (data?.error) {
                throw new Error(data.error)
            }

            // 성공
            alert(`${newMemberForm.name} 멤버가 성공적으로 발급되었습니다.`)
            setShowCreateModal(false)
            setNewMemberForm({ guestId: '', password: '', name: '', role: 'therapist' })
            fetchMembers()

        } catch (err: any) {
            console.error('Error creating member:', err)
            alert(`멤버 발급 실패: ${err.message}`)
        } finally {
            setIsCreating(false)
        }
    }

    if (isLoading) {
        return (
            <div className="p-8 flex justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            </div>
        )
    }

    return (
        <div className="max-w-4xl mx-auto p-4 sm:p-8">
            {/* 헤더 */}
            <div className="flex items-center justify-between mb-6 md:mb-8">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-100 rounded-lg text-blue-600">
                        <Users className="w-6 h-6" />
                    </div>
                    <div>
                        <h1 className="text-xl md:text-2xl font-bold text-gray-900">멤버 관리</h1>
                        <p className="text-gray-500 text-xs md:text-sm hidden sm:block">직원의 접속 계정(ID/PW)을 직접 발급하고 권한을 관리합니다.</p>
                        {!profile?.system_id && (
                            <p className="text-red-500 text-xs font-bold mt-1">⚠️ 시스템 ID가 설정되지 않았습니다. 새로고침 해주세요.</p>
                        )}
                    </div>
                </div>

                <div className="flex gap-2">
                    <button
                        onClick={() => setShowCreateModal(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 transition-colors shadow-sm"
                    >
                        <Plus className="w-4 h-4" />
                        <span className="hidden sm:inline">멤버 추가 발급</span>
                        <span className="sm:hidden">추가</span>
                    </button>
                    <button
                        onClick={() => { fetchMembers(); refreshProfile() }}
                        className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors border border-transparent hover:border-gray-200"
                        title="새로고침"
                    >
                        <Loader2 className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
                    </button>
                </div>
            </div>

            {/* 승인된 멤버 목록 (Current Members) */}
            <section className="mb-12">
                <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                    등록된 멤버
                    <span className="bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded-full">
                        {members.length}
                    </span>
                </h2>
                <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm overflow-x-auto">
                    <table className="w-full text-left text-sm min-w-[600px]">
                        <thead className="bg-gray-50 text-gray-600 border-b border-gray-100">
                            <tr>
                                <th className="px-6 py-4 font-bold text-xs uppercase tracking-wider">이름</th>
                                <th className="px-6 py-4 font-bold text-xs uppercase tracking-wider">가입 이메일(ID)</th>
                                <th className="px-6 py-4 font-bold text-xs uppercase tracking-wider">현재 역할</th>
                                <th className="px-6 py-4 font-bold text-xs uppercase tracking-wider text-right">관리</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {members.length === 0 ? (
                                <tr>
                                    <td colSpan={4} className="px-6 py-12 text-center text-gray-400">
                                        <div className="flex flex-col items-center gap-2">
                                            <Users className="w-8 h-8 opacity-20" />
                                            <span>아직 등록된 멤버가 없습니다.<br />[멤버 추가 발급] 버튼을 눌러 직원을 등록해주세요.</span>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                members.map((member) => (
                                    <tr key={member.id} className="hover:bg-blue-50/30 transition-colors group">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${member.role === 'staff'
                                                    ? 'bg-green-100 text-green-600'
                                                    : 'bg-blue-100 text-blue-600'
                                                    }`}>
                                                    {member.role === 'staff' ? <Shield className="w-4 h-4" /> : <Stethoscope className="w-4 h-4" />}
                                                </div>
                                                <div>
                                                    <span className="font-bold text-gray-900 block group-hover:text-blue-700 transition-colors">{member.profiles?.full_name || '이름 없음'}</span>
                                                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${member.role === 'staff' ? 'bg-green-50 text-green-600' : 'bg-blue-50 text-blue-600'}`}>
                                                        {member.role === 'staff' ? '스태프' : '치료사'}
                                                    </span>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-gray-500 font-mono text-xs max-w-[200px] truncate" title={member.profiles?.email || ''}>
                                            {member.profiles?.email || '-'}
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={async () => {
                                                        if (!confirm(`${member.profiles?.full_name}님의 역할을 '치료사'로 변경하시겠습니까?`)) return
                                                        setProcessingId(member.id)
                                                        try {
                                                            const { error } = await supabase
                                                                .from('guest_access')
                                                                .update({ role: 'therapist' })
                                                                .eq('id', member.id)

                                                            if (error) throw error
                                                            fetchMembers()
                                                        } catch (e) {
                                                            console.error(e)
                                                            alert('역할 변경 실패')
                                                        } finally {
                                                            setProcessingId(null)
                                                        }
                                                    }}
                                                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${member.role === 'therapist'
                                                        ? 'bg-blue-600 text-white shadow-sm ring-2 ring-blue-600/20'
                                                        : 'bg-white border border-gray-200 text-gray-400 hover:text-blue-600 hover:border-blue-300'
                                                        }`}
                                                    title="치료사로 변경"
                                                >
                                                    <Stethoscope className="w-3.5 h-3.5" />
                                                    치료사
                                                </button>
                                                <button
                                                    onClick={async () => {
                                                        if (!confirm(`${member.profiles?.full_name}님의 역할을 '스태프'로 변경하시겠습니까?`)) return
                                                        setProcessingId(member.id)
                                                        try {
                                                            const { error } = await supabase
                                                                .from('guest_access')
                                                                .update({ role: 'staff' })
                                                                .eq('id', member.id)

                                                            if (error) throw error
                                                            fetchMembers()
                                                        } catch (e) {
                                                            console.error(e)
                                                            alert('역할 변경 실패')
                                                        } finally {
                                                            setProcessingId(null)
                                                        }
                                                    }}
                                                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${member.role === 'staff'
                                                        ? 'bg-green-600 text-white shadow-sm ring-2 ring-green-600/20'
                                                        : 'bg-white border border-gray-200 text-gray-400 hover:text-green-600 hover:border-green-300'
                                                        }`}
                                                    title="스태프로 변경"
                                                >
                                                    <Shield className="w-3.5 h-3.5" />
                                                    스태프
                                                </button>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <button
                                                onClick={async () => {
                                                    if (!confirm(`정말 ${member.profiles?.full_name} 멤버를 추방하시겠습니까?\n이 작업은 즉시 반영되며, 해당 계정은 더 이상 이 시스템에 로그인할 수 없습니다.`)) return
                                                    setProcessingId(member.id)
                                                    try {
                                                        await supabase.from('guest_access').delete().eq('id', member.id)
                                                        await supabase.from('profiles').update({ system_id: null, role: null }).eq('id', member.user_id)
                                                        fetchMembers()
                                                    } catch (e) {
                                                        console.error(e)
                                                        alert('추방 실패')
                                                    } finally {
                                                        setProcessingId(null)
                                                    }
                                                }}
                                                disabled={!!processingId}
                                                className="px-3 py-1.5 bg-red-50 text-red-600 hover:bg-red-600 hover:text-white rounded-lg text-xs font-bold transition-colors disabled:opacity-50 inline-flex items-center gap-1.5"
                                            >
                                                {processingId === member.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                                                추방
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </section>

            {/* 새 멤버 추가 모달 */}
            {showCreateModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="px-6 py-5 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
                            <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                                <Key className="w-5 h-5 text-blue-600" />
                                새 멤버 발급
                            </h3>
                            <button
                                onClick={() => setShowCreateModal(false)}
                                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <form onSubmit={handleCreateMember} className="p-6">
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-1.5">이름</label>
                                    <input
                                        type="text"
                                        required
                                        value={newMemberForm.name}
                                        onChange={(e) => setNewMemberForm({ ...newMemberForm, name: e.target.value })}
                                        className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all sm:text-sm"
                                        placeholder="홍길동"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-1.5">발급 아이디 (ID)</label>
                                    <input
                                        type="text"
                                        required
                                        value={newMemberForm.guestId}
                                        onChange={(e) => setNewMemberForm({ ...newMemberForm, guestId: e.target.value.toLowerCase() })}
                                        className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all sm:text-sm font-mono"
                                        placeholder="hong123"
                                    />
                                    <p className="text-xs text-gray-400 mt-1.5 ml-1">영문 소문자, 숫자만 입력 (이름 뒤 1~2자리 숫자 권장)</p>
                                </div>

                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-1.5">초기 비밀번호</label>
                                    <input
                                        type="text"
                                        required
                                        minLength={6}
                                        value={newMemberForm.password}
                                        onChange={(e) => setNewMemberForm({ ...newMemberForm, password: e.target.value })}
                                        className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all sm:text-sm font-mono"
                                        placeholder="6자리 이상 비밀번호"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-2">권한 배정</label>
                                    <div className="grid grid-cols-2 gap-3">
                                        <button
                                            type="button"
                                            onClick={() => setNewMemberForm({ ...newMemberForm, role: 'therapist' })}
                                            className={`py-3 px-4 rounded-xl border flex flex-col items-center justify-center gap-1.5 transition-all ${newMemberForm.role === 'therapist'
                                                ? 'bg-blue-50 border-blue-500 ring-1 ring-blue-500 text-blue-700 font-bold'
                                                : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
                                                }`}
                                        >
                                            <Stethoscope className={`w-5 h-5 ${newMemberForm.role === 'therapist' ? 'text-blue-600' : 'text-gray-400'}`} />
                                            <span className="text-sm">치료사</span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setNewMemberForm({ ...newMemberForm, role: 'staff' })}
                                            className={`py-3 px-4 rounded-xl border flex flex-col items-center justify-center gap-1.5 transition-all ${newMemberForm.role === 'staff'
                                                ? 'bg-green-50 border-green-500 ring-1 ring-green-500 text-green-700 font-bold'
                                                : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
                                                }`}
                                        >
                                            <Shield className={`w-5 h-5 ${newMemberForm.role === 'staff' ? 'text-green-600' : 'text-gray-400'}`} />
                                            <span className="text-sm">스태프</span>
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <div className="mt-8">
                                <button
                                    type="submit"
                                    disabled={isCreating}
                                    className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                                >
                                    {isCreating ? (
                                        <><Loader2 className="w-4 h-4 animate-spin" /> 발급 중...</>
                                    ) : (
                                        <><Check className="w-4 h-4" />멤버 발급 완료</>
                                    )}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

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
                    className="flex items-center gap-2 px-5 py-2.5 bg-white border border-red-200 text-red-600 rounded-xl font-bold hover:bg-red-50 hover:border-red-300 transition-colors text-sm shadow-sm"
                >
                    <Trash2 className="w-4 h-4" />
                    시스템 전체 초기화
                </button>
            </section>

            {/* 초기화 확인 모달 */}
            {/* ... keeping the same reset modal ... */}
            {showResetModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    {/* ... (reset modal content exactly same as before) ... */}
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
                                        await supabase.from('appointments').delete().eq('system_id', systemId)
                                        await supabase.from('patients').delete().eq('system_id', systemId)
                                        await supabase.from('guest_access').delete().eq('system_id', systemId)
                                        await supabase.from('profiles').update({ system_id: null, role: null }).eq('system_id', systemId).neq('id', profile.id)
                                        await supabase.from('profiles').update({ system_id: null }).eq('id', profile.id)
                                        await supabase.from('systems').delete().eq('id', systemId)
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
