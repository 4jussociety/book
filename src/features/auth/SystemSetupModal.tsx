// SystemSetupModal: 새 시스템(센터/센터) 개설 모달
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
            // 6자리 스케줄 코드 생성 (DB 트리거로도 생성되지만, 클라이언트에서도 전달)
            const scheduleCode = String(Math.floor(100000 + Math.random() * 900000))

            // 시스템 생성
            let system = null
            const { data, error: insertError } = await supabase
                .from('systems')
                .insert({
                    name: `${user.user_metadata?.full_name || user.email?.split('@')[0] || '센터장'}님의 시스템`,
                    owner_id: user.id,
                    schedule_code: scheduleCode,
                })
                .select()
                .single()

            if (insertError) {
                console.error('System Insert Error:', insertError)
                throw insertError
            }
            system = data

            if (!system) throw new Error('시스템 생성에 실패했습니다. 잠시 후 다시 시도해주세요.')

            // 1. 프로필 업데이트 (기본 정보) -> 없으면 생성
            const { error: profileError } = await supabase
                .from('profiles')
                .upsert({
                    id: user.id,
                    email: user.email,
                    full_name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'instructor'
                })

            if (profileError) {
                console.error('Profile Upsert Error:', profileError)
                throw profileError
            }

            // 2. 시스템 멤버십 추가 (개설자를 owner로)
            const { error: memberError } = await supabase
                .from('system_members')
                .upsert({
                    system_id: system.id,
                    user_id: user.id,
                    status: 'approved',
                    role: 'owner'
                })

            if (memberError && !memberError.message?.includes('duplicate')) {
                console.error('Member Insert Error:', memberError)
                throw memberError
            }

            // 3. 매니저 본인을 선생님(instructor)으로 자동 발급
            // 이름: {managerId}@thept.shop (초기 @thept.co.kr가 아님)
            // (나중에 매니저 프로필에서 이름을 바꿀 수 있지만, 초기 생성용)
            if (user) {
                try {
                    const managerId = user.email?.split('@')[0] || 'manager'
                    const instructorEmail = `${managerId}@thept.shop`
                    const instructorName = user.user_metadata?.full_name || user.email?.split('@')[0] || '센터장'

                    const { data: memberData, error: memberFnError } = await supabase.functions.invoke('create-member', {
                        body: {
                            systemId: system.id,
                            email: instructorEmail,
                            password: '000000',
                            name: instructorName,
                            role: 'instructor'
                        }
                    })

                    if (memberFnError || memberData?.error) {
                        console.warn('선생님 자동 발급 실패 (시스템 생성은 정상):', memberFnError?.message || memberData?.error)
                    }
                } catch (autoMemberErr) {
                    // 선생님 자동 발급 실패해도 시스템 생성 자체는 성공 처리
                    console.warn('선생님 자동 발급 중 예외 (시스템 생성은 정상):', autoMemberErr)
                }
            }
            // 스케줄 코드를 로컬에 저장 (성공 화면에 표시용)
            localStorage.setItem('last_schedule_code', system.schedule_code || scheduleCode)

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
                    <p className="text-gray-500 mb-4 leading-relaxed">
                        이제부터 새로운 스케줄 관리와<br />
                        고객 관리를 시작할 수 있습니다.
                    </p>

                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4">
                        <p className="text-xs text-blue-500 font-bold mb-1">직원 로그인용 스케줄 번호</p>
                        <p className="text-3xl font-black text-blue-700 tracking-[0.3em] font-mono">
                            {/* system data에서 schedule_code 가져오기 */}
                            {localStorage.getItem('last_schedule_code') || '------'}
                        </p>
                        <p className="text-xs text-blue-400 mt-2">
                            이 번호를 직원들에게 전달해주세요.<br />
                            매니저 설정 페이지에서도 확인할 수 있습니다.
                        </p>
                    </div>

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
                    고객 관리와 수업 일정을 시작하기 위해<br />
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
