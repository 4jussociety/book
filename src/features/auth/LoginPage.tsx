import { useState, useEffect, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useAuth } from './AuthContext'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { Loader2, CheckCircle } from 'lucide-react'

// 아이디 기반 로그인을 위해 이메일 형식이 아닌 문자열 허용
const loginSchema = z.object({
    id: z.string().min(1, '아이디를 입력해주세요.'),
    password: z.string().min(1, '비밀번호를 입력해주세요.'),
})

type LoginForm = z.infer<typeof loginSchema>

export default function LoginPage() {
    const { session } = useAuth()
    const navigate = useNavigate()
    const [error, setError] = useState<string | null>(null)
    const [isGuestLoading, setIsGuestLoading] = useState(false)
    const [activeTab, setActiveTab] = useState<'admin' | 'guest-login' | 'guest-apply'>('admin')
    const [groupByCode, setGroupByCode] = useState('')
    const [guestName, setGuestName] = useState('')
    const [showConfirmModal, setShowConfirmModal] = useState(false)

    // 게스트 신청 중 리디렉션 방지
    const isGuestSubmitting = useRef(false)

    useEffect(() => {
        if (session && !isGuestSubmitting.current) {
            navigate('/', { replace: true })
        }
    }, [session, navigate])

    const {
        register,
        handleSubmit,
        formState: { errors, isSubmitting },
    } = useForm<LoginForm>({
        resolver: zodResolver(loginSchema),
    })

    const onAdminLogin = async (data: LoginForm) => {
        setError(null)
        // 수파베이스 정책상 이메일 형식이 강제되므로 도메인을 붙여서 처리
        const email = `${data.id}@thept.co.kr`

        const { error: authError } = await supabase.auth.signInWithPassword({
            email,
            password: data.password,
        })
        if (authError) {
            console.error(authError)
            setError('아이디 또는 비밀번호가 올바르지 않습니다.')
        }
    }

    const onGuestLogin = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!groupByCode || groupByCode.length !== 10) {
            setError('10자리 일련번호를 정확히 입력해주세요.')
            return
        }
        if (!guestName.trim()) {
            setError('이름을 입력해주세요.')
            return
        }

        setIsGuestLoading(true)
        setError(null)

        try {
            // 1. 익명 로그인 (세션 생성)
            const { data: { user }, error: authError } = await supabase.auth.signInAnonymously()
            if (authError || !user) throw new Error('로그인 초기화 실패')

            // 2. RPC 호출 (세션 이양)
            const { data: rpcData, error: rpcError } = await supabase
                .rpc('login_guest', {
                    p_serial_number: groupByCode,
                    p_name: guestName.trim()
                })

            if (rpcError) throw rpcError

            // RPC 결과 확인
            // rpcData가 null이거나 success가 없으면 실패로 간주
            const result = rpcData as { success: boolean, message?: string }
            if (!result || !result.success) {
                // 실패 시 로그아웃
                await supabase.auth.signOut()
                throw new Error(result?.message || '승인된 기록을 찾을 수 없습니다.')
            }

            // 성공 시 리디렉션 (useEffect가 처리)
            // 명시적 리프레시 필요할 수 있음
            window.location.reload()

        } catch (err) {
            console.error(err)
            setError(err instanceof Error ? err.message : '로그인에 실패했습니다.')
            await supabase.auth.signOut()
        } finally {
            setIsGuestLoading(false)
        }
    }

    const onGuestApply = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!groupByCode || groupByCode.length !== 10) {
            setError('10자리 일련번호를 정확히 입력해주세요.')
            return
        }
        if (!guestName.trim()) {
            setError('이름을 입력해주세요.')
            return
        }

        setIsGuestLoading(true)
        setError(null)
        isGuestSubmitting.current = true

        try {
            // 1. 일련번호 확인
            const { data: system, error: systemError } = await supabase
                .from('systems')
                .select('id')
                .eq('serial_number', groupByCode)
                .single()

            if (systemError || !system) throw new Error('존재하지 않는 일련번호입니다.')

            // 2. 익명 로그인 (세션 생성)
            const { data: { user }, error: authError } = await supabase.auth.signInAnonymously()
            if (authError || !user) throw new Error('로그인에 실패했습니다.')

            // 3. 승인 요청 (또는 재요청)
            const { error: accessError } = await supabase
                .from('guest_access')
                .insert({
                    system_id: system.id,
                    user_id: user.id,
                    status: 'pending'
                })

            if (accessError) {
                // 중복 시 재시도 로직
                if (accessError.message.includes('unique') || accessError.code === '23505') {
                    // 삭제 후 재생성 (기존 요청 갱신)
                    await supabase.from('guest_access').delete().eq('user_id', user.id).eq('system_id', system.id)
                    await supabase.from('guest_access').insert({
                        system_id: system.id,
                        user_id: user.id,
                        status: 'pending'
                    })
                } else {
                    throw new Error('승인 요청에 실패했습니다.')
                }
            }

            // 4. 이름 업데이트
            await supabase
                .from('profiles')
                .update({ full_name: guestName.trim(), role: 'guest' })
                .eq('id', user.id)

            // 5. 즉시 로그아웃 (키오스크 모드 - 다음 사람을 위해 세션 클리어)
            await supabase.auth.signOut()

            // 6. 성공 모달 표시 + 폼 초기화
            setGuestName('')
            setGroupByCode('') // 초기화
            setShowConfirmModal(true)

        } catch (err) {
            console.error(err)
            setError(err instanceof Error ? err.message : '오류가 발생했습니다.')
            // 에러 시에도 로그아웃하여 상태 초기화
            await supabase.auth.signOut()
        } finally {
            setIsGuestLoading(false)
            isGuestSubmitting.current = false
        }
    }

    // 성공 확인 모달
    if (showConfirmModal) {
        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-8 text-center animate-in fade-in zoom-in duration-200">
                    <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6 text-green-600">
                        <CheckCircle className="w-8 h-8" />
                    </div>

                    <h2 className="text-xl font-bold text-gray-900 mb-2">승인 요청 완료</h2>
                    <p className="text-gray-500 mb-8 leading-relaxed text-sm">
                        관리자에게 입장 승인을 요청했습니다.<br />
                        승인이 완료되면 '게스트 로그인' 탭에서 입장해주세요.
                    </p>

                    <button
                        onClick={() => setShowConfirmModal(false)}
                        className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700 transition-all"
                    >
                        확인
                    </button>
                </div>
            </div>
        )
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4 font-sans">
            <div className="max-w-md w-full bg-white p-8 rounded-2xl shadow-sm border border-gray-200">
                <div className="text-center mb-8">
                    <h1 className="text-5xl font-black text-black font-roboto italic tracking-tighter leading-none [-webkit-text-stroke:2px_black]">THEPT#</h1>
                    <p className="text-gray-500 text-sm mt-2 font-medium">물리치료/재활 일정 관리 시스템</p>
                </div>

                {/* 탭 메뉴 */}
                <div className="flex bg-gray-100 p-1 rounded-xl mb-8">
                    <button
                        className={`flex-1 py-2 text-sm font-bold transition-all ${activeTab === 'admin' ? 'bg-white text-blue-600 shadow-sm rounded-lg' : 'text-gray-500 hover:text-gray-700'}`}
                        onClick={() => { setActiveTab('admin'); setError(null) }}
                    >
                        관리자
                    </button>
                    <button
                        className={`flex-1 py-2 text-sm font-bold transition-all ${activeTab === 'guest-login' ? 'bg-white text-blue-600 shadow-sm rounded-lg' : 'text-gray-500 hover:text-gray-700'}`}
                        onClick={() => { setActiveTab('guest-login'); setError(null) }}
                    >
                        게스트 로그인
                    </button>
                    <button
                        className={`flex-1 py-2 text-sm font-bold transition-all ${activeTab === 'guest-apply' ? 'bg-white text-blue-600 shadow-sm rounded-lg' : 'text-gray-500 hover:text-gray-700'}`}
                        onClick={() => { setActiveTab('guest-apply'); setError(null) }}
                    >
                        입장 신청
                    </button>
                </div>

                {error && (
                    <div className="bg-red-50 text-red-600 text-sm p-4 rounded-xl mb-6 border border-red-100 font-medium">
                        {error}
                    </div>
                )}

                {activeTab === 'admin' && (
                    <form onSubmit={handleSubmit(onAdminLogin)} className="space-y-6">
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-2">
                                아이디
                            </label>
                            <div className="relative group">
                                <input
                                    {...register('id')}
                                    type="text"
                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium"
                                    placeholder="아이디 입력"
                                />
                                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-semibold pointer-events-none group-focus-within:text-blue-500">@thept.co.kr</span>
                            </div>
                            {errors.id && (
                                <p className="text-red-500 text-xs mt-2 font-medium">{errors.id.message}</p>
                            )}
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-2">
                                비밀번호
                            </label>
                            <input
                                {...register('password')}
                                type="password"
                                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium"
                                placeholder="비밀번호 입력"
                            />
                            {errors.password && (
                                <p className="text-red-500 text-xs mt-2 font-medium">{errors.password.message}</p>
                            )}
                        </div>

                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="w-full bg-blue-600 text-white py-3.5 rounded-xl font-bold hover:bg-blue-700 active:scale-[0.98] transition-all disabled:opacity-50 shadow-lg shadow-blue-500/20"
                        >
                            {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : '관리자 계정으로 로그인'}
                        </button>
                    </form>
                )}

                {activeTab === 'guest-login' && (
                    <form onSubmit={onGuestLogin} className="space-y-5">
                        <div className="border-l-4 border-blue-500 pl-4 py-2 bg-blue-50 rounded-r-lg mb-4">
                            <p className="text-sm text-blue-800 font-medium">승인완료된 멤버 전용</p>
                            <p className="text-xs text-blue-600 mt-1">관리자의 승인을 받은 후 로그인하세요.</p>
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-2">
                                이름
                            </label>
                            <input
                                type="text"
                                value={guestName}
                                onChange={(e) => setGuestName(e.target.value)}
                                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium"
                                placeholder="승인 시 입력한 이름"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-2">
                                시스템 일련번호
                            </label>
                            <input
                                type="text"
                                inputMode="numeric"
                                maxLength={10}
                                value={groupByCode}
                                onChange={(e) => setGroupByCode(e.target.value.replace(/\D/g, '').slice(0, 10))}
                                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-mono font-medium tracking-[0.2em] text-lg"
                                placeholder="0000000000"
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={isGuestLoading || groupByCode.length !== 10 || !guestName.trim()}
                            className="w-full bg-blue-600 text-white py-3.5 rounded-xl font-bold hover:bg-blue-700 active:scale-[0.98] transition-all disabled:opacity-50 shadow-lg shadow-blue-500/20 flex items-center justify-center gap-2"
                        >
                            {isGuestLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : '입장하기'}
                        </button>
                    </form>
                )}

                {activeTab === 'guest-apply' && (
                    <form onSubmit={onGuestApply} className="space-y-5">
                        <div className="border-l-4 border-green-500 pl-4 py-2 bg-green-50 rounded-r-lg mb-4">
                            <p className="text-sm text-green-800 font-medium">처음 오셨나요?</p>
                            <p className="text-xs text-green-600 mt-1">입장 승인 요청을 먼저 진행해주세요.</p>
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-2">
                                이름
                            </label>
                            <input
                                type="text"
                                value={guestName}
                                onChange={(e) => setGuestName(e.target.value)}
                                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500 transition-all font-medium"
                                placeholder="실명 입력"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-2">
                                시스템 일련번호
                            </label>
                            <input
                                type="text"
                                inputMode="numeric"
                                maxLength={10}
                                value={groupByCode}
                                onChange={(e) => setGroupByCode(e.target.value.replace(/\D/g, '').slice(0, 10))}
                                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500 transition-all font-mono font-medium tracking-[0.2em] text-lg"
                                placeholder="0000000000"
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={isGuestLoading || groupByCode.length !== 10 || !guestName.trim()}
                            className="w-full bg-green-600 text-white py-3.5 rounded-xl font-bold hover:bg-green-700 active:scale-[0.98] transition-all disabled:opacity-50 shadow-lg shadow-green-500/20 flex items-center justify-center gap-2"
                        >
                            {isGuestLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : '승인 요청 보내기'}
                        </button>
                    </form>
                )}
            </div>
        </div>
    )
}
