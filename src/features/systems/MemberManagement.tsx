// MemberManagement: 매니저용 멤버 관리 페이지
// 소유자가 직접 멤버(선생님/스태프)의 ID와 비밀번호를 발급하여 시스템에 등록합니다.

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/AuthContext'
import { Check, X, Loader2, Users, Shield, Stethoscope, Trash2, Plus, Key, ShieldAlert, Pencil } from 'lucide-react'

type GuestRequest = {
    id: string
    status: string
    created_at: string
    user_id: string
    role?: 'instructor' | 'staff' | string
    profiles: {
        full_name: string;
        email: string;
        phone: string | null;
        role: string | null;
        incentive_percentage?: number;
        incentive_percentage_opt1?: number;
        incentive_percentage_opt2?: number;
        incentive_percentage_opt3?: number;
    } | null
}

type RoleOption = 'instructor' | 'staff'

export default function MemberManagement() {
    const { profile, refreshProfile } = useAuth()
    const [members, setMembers] = useState<GuestRequest[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [processingId, setProcessingId] = useState<string | null>(null)
    const [systemManagerName, setSystemManagerName] = useState<string>('')

    // 새 멤버 모달 상태
    const [showCreateModal, setShowCreateModal] = useState(false)
    const [isCreating, setIsCreating] = useState(false)
    const [newMemberForm, setNewMemberForm] = useState({
        email: '',
        password: '',
        name: '',
        role: 'instructor' as RoleOption
    })

    // 인라인 편집 상태
    const [editingMemberId, setEditingMemberId] = useState<string | null>(null)
    const [editForm, setEditForm] = useState({ name: '', phone: '', incentive: '0', incentiveOpt1: '0', incentiveOpt2: '0', incentiveOpt3: '0' })

    // 비밀번호 초기화 모달 상태
    const [showResetModal, setShowResetModal] = useState(false)
    const [resetTargetUser, setResetTargetUser] = useState<GuestRequest | null>(null)
    const [newPassword, setNewPassword] = useState('')
    const [isResetting, setIsResetting] = useState(false)
    const fetchMembers = useCallback(async () => {
        if (!profile?.system_id) return
        setIsLoading(true)
        try {
            // systems 테이블의 manager_name 조회
            const { data: systemData } = await supabase
                .from('systems')
                .select('manager_name')
                .eq('id', profile.system_id)
                .single()

            if (systemData?.manager_name) setSystemManagerName(systemData.manager_name)

            const { data, error } = await supabase
                .from('system_members')
                .select(`
                    *,
                    profiles:user_id ( full_name, email, phone, incentive_percentage, incentive_percentage_opt1, incentive_percentage_opt2, incentive_percentage_opt3 )
                `)
                .eq('system_id', profile.system_id)
                .order('created_at', { ascending: false })

            if (error) throw error
            const approved = (data || []).filter(r => r.status === 'approved') as unknown as GuestRequest[]

            // phone 컬럼 안전 조회 (DB 마이그레이션 전에도 동작)
            try {
                const userIds = approved.map(m => m.user_id)
                if (userIds.length > 0) {
                    const { data: phoneData } = await supabase
                        .from('profiles')
                        .select('id, phone')
                        .in('id', userIds)
                    if (phoneData) {
                        const phoneMap = new Map(phoneData.map((p: any) => [p.id, p.phone]))
                        approved.forEach(m => {
                            if (m.profiles) m.profiles.phone = phoneMap.get(m.user_id) || null
                        })
                    }
                }
            } catch { /* phone 컬럼 미존재 시 무시 */ }

            setMembers(approved)
        } catch (err: unknown) {
            console.error('Error fetching members:', err)
        } finally {
            setIsLoading(false)
        }
    }, [profile?.system_id])

    // 인라인 편집 시작
    const startEditing = (member: GuestRequest) => {
        setEditingMemberId(member.user_id)
        setEditForm({
            name: member.profiles?.full_name || '',
            phone: member.profiles?.phone || '',
            incentive: member.profiles?.incentive_percentage?.toString() || '0',
            incentiveOpt1: member.profiles?.incentive_percentage_opt1?.toString() || '0',
            incentiveOpt2: member.profiles?.incentive_percentage_opt2?.toString() || '0',
            incentiveOpt3: member.profiles?.incentive_percentage_opt3?.toString() || '0',
        })
    }

    // 인라인 편집 저장
    const saveEditing = async () => {
        if (!editingMemberId) return
        setProcessingId(editingMemberId)
        try {
            const { error } = await supabase
                .from('profiles')
                .update({
                    full_name: editForm.name.trim(),
                    phone: editForm.phone.trim() || null,
                    incentive_percentage: parseFloat(editForm.incentive) || 0,
                    incentive_percentage_opt1: parseFloat(editForm.incentiveOpt1) || 0,
                    incentive_percentage_opt2: parseFloat(editForm.incentiveOpt2) || 0,
                    incentive_percentage_opt3: parseFloat(editForm.incentiveOpt3) || 0,
                })
                .eq('id', editingMemberId)

            if (error) throw error
            setEditingMemberId(null)
            fetchMembers()
        } catch (err) {
            console.error('프로필 수정 실패:', err)
            alert('프로필 수정에 실패했습니다.')
        } finally {
            setProcessingId(null)
        }
    }

    const cancelEditing = () => {
        setEditingMemberId(null)
    }

    const handleEditKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault()
            saveEditing()
        } else if (e.key === 'Escape') {
            cancelEditing()
        }
    }

    const handleResetPassword = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!profile?.system_id || !resetTargetUser) return

        if (newPassword.length < 6) {
            alert('비밀번호는 최소 6자 이상이어야 합니다.')
            return
        }

        setIsResetting(true)
        try {
            // 본인(매니저)의 비밀번호를 변경하는 경우
            if (resetTargetUser.user_id === profile.id || resetTargetUser.role === 'owner') {
                const { error } = await supabase.auth.updateUser({
                    password: newPassword
                })

                if (error) {
                    throw new Error(error.message || '비밀번호 변경에 실패했습니다.')
                }

                alert('본인의 비밀번호가 성공적으로 변경되었습니다.')
            } else {
                // 다른 멤버의 비밀번호를 강제 초기화하는 경우 (Edge Function 사용)
                const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
                if (sessionError || !sessionData.session) {
                    throw new Error('로그인 세션이 만료되었습니다. 페이지를 새로고침 후 다시 시도해주세요.')
                }

                const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
                const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
                const response = await fetch(`${supabaseUrl}/functions/v1/update-member-password`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${sessionData.session.access_token}`,
                        'apikey': supabaseAnonKey
                    },
                    body: JSON.stringify({
                        systemId: profile.system_id,
                        targetUserId: resetTargetUser.user_id,
                        newPassword: newPassword
                    })
                })

                if (!response.ok) {
                    const errData = await response.json().catch(() => null)
                    throw new Error(errData?.error || `비밀번호 변경 실패 (상태 코드: ${response.status})`)
                }

                alert(`${resetTargetUser.profiles?.full_name} 님의 비밀번호가 성공적으로 변경되었습니다.`)
            }

            setShowResetModal(false)
            setNewPassword('')
            setResetTargetUser(null)
        } catch (err: any) {
            console.error('Error resetting password:', err)
            alert(err.message)
        } finally {
            setIsResetting(false)
        }
    }

    useEffect(() => {
        fetchMembers()
    }, [fetchMembers])

    const handleCreateMember = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!profile?.system_id) return

        if (!newMemberForm.email || !newMemberForm.password || !newMemberForm.name) {
            alert('모든 필드를 입력해주세요.')
            return
        }

        // 이메일 형식 간단 검증
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newMemberForm.email)) {
            alert('유효한 이메일 주소를 입력해주세요.')
            return
        }

        if (newMemberForm.password.length < 6) {
            alert('비밀번호는 최소 6자 이상이어야 합니다.')
            return
        }

        setIsCreating(true)
        try {
            // 세션 토큰을 최신으로 갱신한 뒤 가져오기
            const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
            if (sessionError || !sessionData.session) {
                throw new Error('로그인 세션이 만료되었습니다. 페이지를 새로고침 후 다시 시도해주세요.')
            }
            const accessToken = sessionData.session.access_token

            // Edge Function을 직접 fetch로 호출하여 에러 메시지를 정확히 추출
            const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
            const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
            const response = await fetch(`${supabaseUrl}/functions/v1/create-member`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${accessToken}`,
                    'apikey': supabaseAnonKey
                },
                body: JSON.stringify({
                    systemId: profile.system_id,
                    email: newMemberForm.email,
                    password: newMemberForm.password,
                    name: newMemberForm.name,
                    role: newMemberForm.role
                })
            })

            const data = await response.json().catch(() => null)

            if (!response.ok) {
                const errorMessage = data?.error || data?.details || `서버 오류 (${response.status})`
                throw new Error(errorMessage)
            }

            if (data?.error) {
                throw new Error(data.error)
            }

            // 성공
            alert(`${newMemberForm.name} 멤버가 성공적으로 발급되었습니다.`)
            setShowCreateModal(false)
            setNewMemberForm({ email: '', password: '', name: '', role: 'instructor' })
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
        <div className="w-full max-w-7xl mx-auto p-4 sm:p-8">
            {/* 헤더 */}
            <div className="flex items-center justify-between mb-6 md:mb-8">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-100 rounded-lg text-blue-600">
                        <Users className="w-6 h-6" />
                    </div>
                    <div>
                        <h1 className="text-xl md:text-2xl font-bold text-gray-900">멤버 관리</h1>
                        <p className="text-gray-500 text-xs md:text-sm hidden sm:block">직원의 접속 계정(ID/PW)을 직접 발급하고 권한을 관리합니다.</p>
                        <p className="text-blue-600 text-xs font-bold mt-1 bg-blue-50 px-2 py-1 rounded inline-block">💡 팁: 새 멤버 발급 시 설정한 초기 비밀번호를 직원에게 따로 전달해주세요.</p>
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
                                <th className="px-6 py-4 font-bold text-xs uppercase tracking-wider whitespace-nowrap">이름</th>
                                <th className="px-6 py-4 font-bold text-xs uppercase tracking-wider whitespace-nowrap">가입 이메일(ID)</th>
                                <th className="px-6 py-4 font-bold text-xs uppercase tracking-wider whitespace-nowrap">연락처</th>
                                <th className="px-6 py-4 font-bold text-xs uppercase tracking-wider text-center whitespace-nowrap">인센티브(%)</th>
                                <th className="px-6 py-4 font-bold text-xs uppercase tracking-wider whitespace-nowrap">현재 역할</th>
                                <th className="px-6 py-4 font-bold text-xs uppercase tracking-wider text-right whitespace-nowrap">관리</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {members.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-6 py-12 text-center text-gray-400">
                                        <div className="flex flex-col items-center gap-2">
                                            <Users className="w-8 h-8 opacity-20" />
                                            <span>아직 등록된 멤버가 없습니다.<br />[멤버 추가 발급] 버튼을 눌러 직원을 등록해주세요.</span>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                members.map((member) => {
                                    const isEditing = editingMemberId === member.user_id
                                    return (
                                        <tr key={member.id} className="hover:bg-blue-50/30 transition-colors group">
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${member.role === 'owner' ? 'bg-red-100 text-red-600' : member.role === 'staff'
                                                        ? 'bg-green-100 text-green-600'
                                                        : 'bg-blue-100 text-blue-600'
                                                        }`}>
                                                        {member.role === 'owner' ? <ShieldAlert className="w-4 h-4" /> : member.role === 'staff' ? <Shield className="w-4 h-4" /> : <Stethoscope className="w-4 h-4" />}
                                                    </div>
                                                    <div>
                                                        {isEditing ? (
                                                            <input
                                                                type="text"
                                                                value={editForm.name}
                                                                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                                                                onKeyDown={handleEditKeyDown}
                                                                className="px-2 py-1 border border-blue-300 rounded-lg text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500/30 w-28"
                                                                autoFocus
                                                                placeholder="이름"
                                                            />
                                                        ) : (
                                                            <span className="font-bold text-gray-900 block group-hover:text-blue-700 transition-colors">
                                                                {member.role === 'owner'
                                                                    ? (systemManagerName || member.profiles?.full_name || '이름 없음')
                                                                    : (member.profiles?.full_name || '이름 없음')}
                                                            </span>
                                                        )}
                                                        {member.role === 'owner' ? (
                                                            <span className="text-[10px] font-black px-1.5 py-0.5 rounded-md bg-red-50 text-red-600 border border-red-100">
                                                                매니저
                                                            </span>
                                                        ) : (
                                                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${member.role === 'staff' ? 'bg-green-50 text-green-600' : 'bg-blue-50 text-blue-600'}`}>
                                                                {member.role === 'staff' ? '스태프' : '선생님'}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-gray-500 font-mono text-xs max-w-[200px] truncate whitespace-nowrap" title={member.profiles?.email || ''}>
                                                {member.profiles?.email || '-'}
                                            </td>
                                            <td className="px-6 py-4 text-gray-600 text-sm whitespace-nowrap">
                                                {isEditing ? (
                                                    <input
                                                        type="tel"
                                                        value={editForm.phone}
                                                        onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                                                        onKeyDown={handleEditKeyDown}
                                                        className="px-2 py-1 border border-blue-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 w-32"
                                                        placeholder="010-0000-0000"
                                                    />
                                                ) : (
                                                    member.profiles?.phone || <span className="text-gray-300">미입력</span>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 text-center whitespace-nowrap">
                                                {member.role === 'instructor' ? (
                                                    isEditing ? (
                                                        <div className="flex flex-col gap-2">
                                                            <div className="inline-flex items-center gap-2 justify-between">
                                                                <span className="text-xs text-gray-500 font-bold whitespace-nowrap">일반:</span>
                                                                <div className="flex items-center gap-1">
                                                                    <input
                                                                        type="number"
                                                                        value={editForm.incentive}
                                                                        onChange={(e) => setEditForm({ ...editForm, incentive: e.target.value })}
                                                                        onKeyDown={handleEditKeyDown}
                                                                        className="px-2 py-1 border border-blue-300 rounded-lg text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500/30 w-16 text-right"
                                                                        min="0"
                                                                        max="100"
                                                                        placeholder="0"
                                                                    />
                                                                    <span className="text-xs text-gray-500 font-bold">%</span>
                                                                </div>
                                                            </div>
                                                            {(profile?.option1_name || profile?.option2_name || profile?.option3_name) && (
                                                                <div className="border-t border-gray-100 pt-2 flex flex-col gap-2">
                                                                    {profile?.option1_name && (
                                                                        <div className="inline-flex items-center gap-2 justify-between">
                                                                            <span className="text-xs text-gray-500 font-bold truncate max-w-[80px]" title={profile.option1_name}>{profile.option1_name}:</span>
                                                                            <div className="flex items-center gap-1">
                                                                                <input
                                                                                    type="number"
                                                                                    value={editForm.incentiveOpt1}
                                                                                    onChange={(e) => setEditForm({ ...editForm, incentiveOpt1: e.target.value })}
                                                                                    onKeyDown={handleEditKeyDown}
                                                                                    className="px-2 py-1 border border-blue-300 rounded-lg text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500/30 w-16 text-right"
                                                                                    min="0"
                                                                                    max="100"
                                                                                    placeholder="0"
                                                                                />
                                                                                <span className="text-xs text-gray-500 font-bold">%</span>
                                                                            </div>
                                                                        </div>
                                                                    )}
                                                                    {profile?.option2_name && (
                                                                        <div className="inline-flex items-center gap-2 justify-between">
                                                                            <span className="text-xs text-gray-500 font-bold truncate max-w-[80px]" title={profile.option2_name}>{profile.option2_name}:</span>
                                                                            <div className="flex items-center gap-1">
                                                                                <input
                                                                                    type="number"
                                                                                    value={editForm.incentiveOpt2}
                                                                                    onChange={(e) => setEditForm({ ...editForm, incentiveOpt2: e.target.value })}
                                                                                    onKeyDown={handleEditKeyDown}
                                                                                    className="px-2 py-1 border border-blue-300 rounded-lg text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500/30 w-16 text-right"
                                                                                    min="0"
                                                                                    max="100"
                                                                                    placeholder="0"
                                                                                />
                                                                                <span className="text-xs text-gray-500 font-bold">%</span>
                                                                            </div>
                                                                        </div>
                                                                    )}
                                                                    {profile?.option3_name && (
                                                                        <div className="inline-flex items-center gap-2 justify-between">
                                                                            <span className="text-xs text-gray-500 font-bold truncate max-w-[80px]" title={profile.option3_name}>{profile.option3_name}:</span>
                                                                            <div className="flex items-center gap-1">
                                                                                <input
                                                                                    type="number"
                                                                                    value={editForm.incentiveOpt3}
                                                                                    onChange={(e) => setEditForm({ ...editForm, incentiveOpt3: e.target.value })}
                                                                                    onKeyDown={handleEditKeyDown}
                                                                                    className="px-2 py-1 border border-blue-300 rounded-lg text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500/30 w-16 text-right"
                                                                                    min="0"
                                                                                    max="100"
                                                                                    placeholder="0"
                                                                                />
                                                                                <span className="text-xs text-gray-500 font-bold">%</span>
                                                                            </div>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </div>
                                                    ) : (
                                                        <div className="flex flex-col gap-1 items-end">
                                                            <span className="inline-flex items-center gap-1 text-sm font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-lg border border-blue-100">
                                                                일반: {member.profiles?.incentive_percentage || 0}%
                                                            </span>
                                                            {profile?.option1_name && (
                                                                <span className="inline-flex items-center gap-1 text-xs font-bold text-blue-500 bg-blue-50 px-2 py-0.5 rounded-lg border border-blue-50">
                                                                    {profile.option1_name}: {member.profiles?.incentive_percentage_opt1 || 0}%
                                                                </span>
                                                            )}
                                                            {profile?.option2_name && (
                                                                <span className="inline-flex items-center gap-1 text-xs font-bold text-blue-500 bg-blue-50 px-2 py-0.5 rounded-lg border border-blue-50">
                                                                    {profile.option2_name}: {member.profiles?.incentive_percentage_opt2 || 0}%
                                                                </span>
                                                            )}
                                                            {profile?.option3_name && (
                                                                <span className="inline-flex items-center gap-1 text-xs font-bold text-blue-500 bg-blue-50 px-2 py-0.5 rounded-lg border border-blue-50">
                                                                    {profile.option3_name}: {member.profiles?.incentive_percentage_opt3 || 0}%
                                                                </span>
                                                            )}
                                                        </div>
                                                    )
                                                ) : (
                                                    <span className="text-gray-300 text-xs">-</span>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                {member.role !== 'owner' ? (
                                                    <div className="flex items-center gap-2">
                                                        <button
                                                            onClick={async () => {
                                                                if (!confirm(`${member.profiles?.full_name}님의 역할을 '선생님'으로 변경하시겠습니까?`)) return
                                                                setProcessingId(member.id)
                                                                try {
                                                                    const { error } = await supabase
                                                                        .from('system_members')
                                                                        .update({ role: 'instructor' })
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
                                                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${member.role === 'instructor'
                                                                ? 'bg-blue-600 text-white shadow-sm ring-2 ring-blue-600/20'
                                                                : 'bg-white border border-gray-200 text-gray-400 hover:text-blue-600 hover:border-blue-300'
                                                                }`}
                                                            title="선생님으로 변경"
                                                        >
                                                            <Stethoscope className="w-3.5 h-3.5" />
                                                            선생님
                                                        </button>
                                                        <button
                                                            onClick={async () => {
                                                                if (!confirm(`${member.profiles?.full_name}님의 역할을 '스태프'로 변경하시겠습니까?`)) return
                                                                setProcessingId(member.id)
                                                                try {
                                                                    const { error } = await supabase
                                                                        .from('system_members')
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
                                                ) : (
                                                    <span className="text-xs font-bold text-gray-400 bg-gray-100 px-3 py-1.5 rounded-lg">센터장(직책 고정)</span>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 text-right whitespace-nowrap">
                                                <div className="flex items-center justify-end gap-1.5">
                                                    {isEditing ? (
                                                        <>
                                                            <button
                                                                onClick={saveEditing}
                                                                disabled={!!processingId}
                                                                className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-bold transition-colors disabled:opacity-50 inline-flex items-center gap-1.5 hover:bg-blue-700"
                                                            >
                                                                {processingId === member.user_id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                                                                저장
                                                            </button>
                                                            <button
                                                                onClick={cancelEditing}
                                                                className="px-3 py-1.5 bg-gray-100 text-gray-600 hover:bg-gray-200 rounded-lg text-xs font-bold transition-colors inline-flex items-center gap-1.5"
                                                            >
                                                                <X className="w-3.5 h-3.5" />
                                                                취소
                                                            </button>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <button
                                                                onClick={() => {
                                                                    setResetTargetUser(member)
                                                                    setNewPassword('')
                                                                    setShowResetModal(true)
                                                                }}
                                                                className="px-3 py-1.5 bg-yellow-50 text-yellow-600 hover:bg-yellow-600 hover:text-white rounded-lg text-xs font-bold transition-colors inline-flex items-center gap-1.5"
                                                                title={member.role === 'owner' ? "비밀번호 변경" : "비밀번호 초기화"}
                                                            >
                                                                <Key className="w-3.5 h-3.5" />
                                                                {member.role === 'owner' ? "비번변경" : "비번초기화"}
                                                            </button>
                                                            {member.role !== 'owner' && (
                                                                <button
                                                                    onClick={() => startEditing(member)}
                                                                    className="px-3 py-1.5 bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white rounded-lg text-xs font-bold transition-colors inline-flex items-center gap-1.5"
                                                                >
                                                                    <Pencil className="w-3.5 h-3.5" />
                                                                    수정
                                                                </button>
                                                            )}
                                                            {member.role !== 'owner' && (
                                                                <button
                                                                    onClick={async () => {
                                                                        if (!confirm(`정말 ${member.profiles?.full_name} 멤버를 추방하시겠습니까?\n이 작업은 즉시 반영되며, 해당 계정은 더 이상 이 시스템에 로그인할 수 없습니다.`)) return
                                                                        setProcessingId(member.id)
                                                                        try {
                                                                            await supabase.from('system_members').delete().eq('id', member.id)
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
                                                            )}
                                                        </>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    )
                                })
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
                                    <label className="block text-sm font-bold text-gray-700 mb-1.5">이메일</label>
                                    <input
                                        type="email"
                                        required
                                        value={newMemberForm.email}
                                        onChange={(e) => setNewMemberForm({ ...newMemberForm, email: e.target.value.toLowerCase() })}
                                        className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all sm:text-sm"
                                        placeholder="staff@email.com"
                                    />
                                    <p className="text-xs text-gray-400 mt-1.5 ml-1">직원의 실제 이메일 주소를 입력해주세요</p>
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
                                    <label className="block text-sm font-bold text-gray-700 mb-2">권한 배정</label>
                                    <div className="grid grid-cols-2 gap-3">
                                        <button
                                            type="button"
                                            onClick={() => setNewMemberForm({ ...newMemberForm, role: 'instructor' })}
                                            className={`py-3 px-4 rounded-xl border flex flex-col items-center justify-center gap-1.5 transition-all ${newMemberForm.role === 'instructor'
                                                ? 'bg-blue-50 border-blue-500 ring-1 ring-blue-500 text-blue-700 font-bold'
                                                : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
                                                }`}
                                        >
                                            <Stethoscope className={`w-5 h-5 ${newMemberForm.role === 'instructor' ? 'text-blue-600' : 'text-gray-400'}`} />
                                            <span className="text-sm">선생님</span>
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

            {/* 비밀번호 변경 모달 */}
            {showResetModal && resetTargetUser && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="px-6 py-5 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
                            <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                                <Key className="w-5 h-5 text-yellow-600" />
                                비밀번호 변경
                            </h3>
                            <button
                                onClick={() => {
                                    setShowResetModal(false)
                                    setResetTargetUser(null)
                                }}
                                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <form onSubmit={handleResetPassword} className="p-6">
                            <div className="mb-6">
                                <p className="text-sm text-gray-600 mb-4">
                                    {(resetTargetUser.user_id === profile?.id || resetTargetUser.role === 'owner') ? (
                                        <>
                                            <span className="font-bold text-gray-900">본인({resetTargetUser.profiles?.full_name})</span>의 비밀번호를 안전하게 변경합니다.
                                        </>
                                    ) : (
                                        <>
                                            <span className="font-bold text-gray-900">{resetTargetUser.profiles?.full_name}</span> 님의 접속 비밀번호를 강제로 초기화 및 변경합니다.
                                        </>
                                    )}
                                </p>

                                <label className="block text-sm font-bold text-gray-700 mb-1.5">새 비밀번호 (6자 이상)</label>
                                <input
                                    type="text"
                                    required
                                    minLength={6}
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-yellow-500/20 focus:border-yellow-500 transition-all sm:text-sm"
                                    placeholder="새로운 비밀번호 확인"
                                />
                            </div>

                            <button
                                type="submit"
                                disabled={isResetting || newPassword.length < 6}
                                className="w-full py-3 bg-yellow-500 text-white rounded-xl font-bold text-sm hover:bg-yellow-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2 shadow-sm"
                            >
                                {isResetting ? (
                                    <><Loader2 className="w-4 h-4 animate-spin" /> 저장 중...</>
                                ) : (
                                    <><Check className="w-4 h-4" />새 비밀번호 적용</>
                                )}
                            </button>
                        </form>
                    </div>
                </div>
            )}

        </div>
    )
}
