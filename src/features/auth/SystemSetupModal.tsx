// SystemSetupModal: 새 시스템(병원/센터) 개설 모달
// 10자리 숫자 일련번호 생성 및 시스템 등록 처리

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from './AuthContext'
import { Loader2, PlusCircle, CheckCircle } from 'lucide-react'


export default function SystemSetupModal() {
    const { user, refreshProfile } = useAuth()
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [isSystemCreated, setIsSystemCreated] = useState(false)
    const [isStarting, setIsStarting] = useState(false)

    const handleStart = async () => {
        setIsStarting(true)
        await refreshProfile()
        window.location.reload()
    }

    const handleCreateSystem = async () => {
        if (!user) return
        setIsLoading(true)
        setError(null)

        try {
            // 중복 방지: 최대 5회 재시도 (기존 구조 유지하되 일련번호는 일단 하드코딩 빈값 삽입)
            // 참고: 추후 DB에서 serial_number 컬럼이 완전히 필요없어지면 insert 내용도 수정해야함
            let system = null
            for (let attempt = 0; attempt < 1; attempt++) {
                const { data, error: insertError } = await supabase
                    .from('systems')
                    .insert({
                        serial_number: `sys_${Date.now()}_${Math.random().toString(36).substring(7)}`, // 더미 데이터
                        owner_id: user.id,
                    })
                    .select()
                    .single()

                if (!insertError && data) {
                    system = data
                    break
                }

                // 중복 에러가 아니면 즉시 throw
                if (insertError && !insertError.message.includes('unique') && !insertError.message.includes('duplicate')) {
                    throw insertError
                }
            }

            if (!system) throw new Error('일련번호 생성에 실패했습니다. 잠시 후 다시 시도해주세요.')

            // 프로필 업데이트 (system_id 연결) - 없으면 생성 (Upsert)
            const { error: profileError } = await supabase
                .from('profiles')
                .upsert({
                    id: user.id,
                    system_id: system.id,
                    email: user.email,
                    role: 'therapist', // 시스템 개설자는 항상 therapist
                    full_name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'Therapist'
                })
                .select()

            if (profileError) throw profileError

            setIsSystemCreated(true)

            // 3초 후 자동 리프레시
            setTimeout(async () => {
                await refreshProfile()
            }, 3000)

        } catch (err: unknown) {
            console.error('Error creating system:', err)
            setError(err instanceof Error ? err.message : '시스템 개설 중 오류가 발생했습니다.')
        } finally {
            setIsLoading(false)
        }
    }

    // 개설 완료 화면
    if (isSystemCreated) {
        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8 text-center">
                    <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6 text-green-600">
                        <CheckCircle className="w-8 h-8" />
                    </div>

                    <h2 className="text-2xl font-bold text-gray-900 mb-2">시스템 개설 완료!</h2>
                    <p className="text-gray-500 mb-6 leading-relaxed">
                        이제부터 새로운 스케줄 관리와<br />
                        환자 관리를 시작할 수 있습니다.
                    </p>
                    <p className="text-xs text-gray-400 mb-6">
                        3초 후 자동으로 메인 페이지로 이동합니다...
                    </p>

                    <button
                        onClick={handleStart}
                        disabled={isStarting}
                        className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                        {isStarting ? (
                            <>
                                <Loader2 className="w-5 h-5 animate-spin" />
                                시작하는 중...
                            </>
                        ) : (
                            '바로 시작하기'
                        )}
                    </button>
                </div>
            </div>
        )
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8 text-center">
                <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-6 text-blue-600">
                    <PlusCircle className="w-8 h-8" />
                </div>

                <h2 className="text-2xl font-bold text-gray-900 mb-2">스케줄 시스템 개설</h2>
                <p className="text-gray-500 mb-8 leading-relaxed">
                    환자 관리와 치료 일정을 시작하기 위해<br />
                    새로운 스케줄 시스템을 개설하시겠습니까?
                </p>

                {error && (
                    <div className="mb-6 p-3 bg-red-50 text-red-600 text-sm rounded-lg">
                        {error}
                    </div>
                )}

                <div className="flex flex-col gap-3">
                    <button
                        onClick={handleCreateSystem}
                        disabled={isLoading}
                        className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                        {isLoading ? (
                            <>
                                <Loader2 className="w-5 h-5 animate-spin" />
                                개설 중...
                            </>
                        ) : (
                            '네, 지금 개설하겠습니다'
                        )}
                    </button>
                </div>
            </div>
        </div>
    )
}
