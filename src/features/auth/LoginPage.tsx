import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useAuth } from './AuthContext'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { Loader2 } from 'lucide-react'

// 최소 요구사항만 갖춘 로그인 스키마
const loginSchema = z.object({
    id: z.string().min(1, '아이디 또는 이메일을 입력해주세요.'),
    password: z.string().min(1, '비밀번호를 입력해주세요.'),
})

type LoginForm = z.infer<typeof loginSchema>

export default function LoginPage() {
    const { session } = useAuth()
    const navigate = useNavigate()
    const [error, setError] = useState<string | null>(null)
    const [activeTab, setActiveTab] = useState<'admin' | 'member'>('member')

    useEffect(() => {
        if (session) {
            navigate('/', { replace: true })
        }
    }, [session, navigate])

    const {
        register,
        handleSubmit,
        formState: { errors, isSubmitting },
        reset
    } = useForm<LoginForm>({
        resolver: zodResolver(loginSchema),
    })

    // 탭 변경 시 폼 에러/입력값 초기화
    useEffect(() => {
        reset()
        setError(null)
    }, [activeTab, reset])

    const onLoginSubmit = async (data: LoginForm) => {
        setError(null)

        // 이메일 조합 로직
        let emailToLogin = data.id

        if (activeTab === 'admin') {
            // 관리자 탭: @가 포함되어 있으면 그대로 사용, 없으면 @thept.co.kr 추가
            if (!data.id.includes('@')) {
                emailToLogin = `${data.id}@thept.co.kr`
            }
        } else {
            // 직원(멤버) 탭: 무조건 @member.thept.co.kr
            if (!data.id.includes('@')) {
                emailToLogin = `${data.id.toLowerCase()}@member.thept.co.kr`
            }
        }

        try {
            const { error: authError } = await supabase.auth.signInWithPassword({
                email: emailToLogin,
                password: data.password,
            })

            if (authError) {
                console.error(authError)
                if (authError.message.includes('Invalid login credentials')) {
                    setError('아이디 또는 비밀번호가 올바르지 않습니다.')
                } else {
                    setError('로그인 중 문제가 발생했습니다. 관리자에게 문의해주세요.')
                }
            }
        } catch (err) {
            console.error('Login exception:', err)
            setError('알 수 없는 오류가 발생했습니다.')
        }
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4 font-sans">
            <div className="max-w-md w-full bg-white p-8 rounded-2xl shadow-xl shadow-gray-200/50 border border-gray-100">
                <div className="text-center mb-10">
                    <h1 className="text-5xl font-black text-black font-roboto italic tracking-tighter leading-none [-webkit-text-stroke:2px_black]">THEPT#</h1>
                    <p className="text-gray-500 text-sm mt-3 font-medium">물리치료/재활 일정 관리 시스템</p>
                </div>

                {/* 탭 메뉴 */}
                <div className="flex bg-gray-100/80 p-1.5 rounded-xl mb-8">
                    <button
                        type="button"
                        className={`flex-1 py-2.5 text-sm font-bold transition-all rounded-lg ${activeTab === 'member' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                        onClick={() => setActiveTab('member')}
                    >
                        직원 로그인
                    </button>
                    <button
                        type="button"
                        className={`flex-1 py-2.5 text-sm font-bold transition-all rounded-lg ${activeTab === 'admin' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                        onClick={() => setActiveTab('admin')}
                    >
                        관리자(원장)
                    </button>
                </div>

                {error && (
                    <div className="bg-red-50 text-red-600 text-sm p-4 rounded-xl mb-6 border border-red-100 font-bold flex items-center gap-2">
                        <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5 stroke-current stroke-2"><circle cx="12" cy="12" r="10" /><path d="M12 8v4" strokeLinecap="round" /><path d="M12 16h.01" strokeLinecap="round" /></svg>
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit(onLoginSubmit)} className="space-y-6">
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-2">
                            {activeTab === 'member' ? '발급 받은 아이디' : '관리자 아이디 또는 이메일'}
                        </label>
                        <div className="relative group">
                            <input
                                {...register('id')}
                                type="text"
                                className="w-full px-4 py-3.5 bg-gray-50/50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium placeholder-gray-400"
                                placeholder={activeTab === 'member' ? "아이디를 입력하세요" : "admin@email.com"}
                                autoCapitalize="none"
                                autoComplete="username"
                            />
                        </div>
                        {errors.id && (
                            <p className="text-red-500 text-xs mt-2 font-bold ml-1">{errors.id.message}</p>
                        )}
                    </div>

                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-2">
                            비밀번호
                        </label>
                        <input
                            {...register('password')}
                            type="password"
                            className="w-full px-4 py-3.5 bg-gray-50/50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium placeholder-gray-400"
                            placeholder="비밀번호를 입력하세요"
                            autoComplete="current-password"
                        />
                        {errors.password && (
                            <p className="text-red-500 text-xs mt-2 font-bold ml-1">{errors.password.message}</p>
                        )}
                    </div>

                    <button
                        type="submit"
                        disabled={isSubmitting}
                        className={`w-full text-white py-4 rounded-xl font-bold transition-all disabled:opacity-50 shadow-lg flex items-center justify-center gap-2 mt-8 ${activeTab === 'member'
                            ? 'bg-blue-600 hover:bg-blue-700 shadow-blue-500/25 active:bg-blue-800'
                            : 'bg-gray-800 hover:bg-gray-900 shadow-gray-500/25 active:bg-black'
                            }`}
                    >
                        {isSubmitting ? (
                            <><Loader2 className="w-5 h-5 animate-spin" /> 확인 중...</>
                        ) : (
                            activeTab === 'member' ? '직원으로 로그인' : '관리자로 로그인'
                        )}
                    </button>

                    {activeTab === 'member' && (
                        <p className="text-center text-xs text-gray-400 mt-6 font-medium">
                            안내: 직원 계정은 소속 센터의 관리자(원장)가 직접 발급할 수 있습니다.
                        </p>
                    )}
                </form>
            </div>
        </div>
    )
}
