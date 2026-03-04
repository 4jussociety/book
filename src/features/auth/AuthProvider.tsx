import { useState, useEffect, useCallback } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { AuthContext } from './AuthContext'
import type { GuestStatus } from './AuthContext'
import type { Profile } from '@/types/db'

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [session, setSession] = useState<Session | null>(null)
    const [user, setUser] = useState<User | null>(null)
    const [profile, setProfile] = useState<Profile | null>(null)
    const [guestStatus, setGuestStatus] = useState<GuestStatus>(null)
    const [loading, setLoading] = useState(true)

    const fetchProfile = useCallback(async (userId: string, userEmail?: string) => {
        try {
            // 1. Fetch base profile
            const { data: profileData, error: profileError } = await supabase
                .from('profiles')
                .select('id, email, full_name, incentive_percentage_opt1, incentive_percentage_opt2, incentive_percentage_opt3, incentive_percentage_opt4')
                .eq('id', userId)
                .maybeSingle()

            // phone 컬럼 안전 조회 (DB 마이그레이션 전에도 동작하도록)
            let phoneValue: string | undefined
            try {
                const { data: phoneData } = await supabase
                    .from('profiles')
                    .select('phone')
                    .eq('id', userId)
                    .maybeSingle()
                phoneValue = phoneData?.phone || undefined
            } catch { /* phone 컬럼 미존재 시 무시 */ }

            const baseProfile = profileData as Profile | null
            const combinedProfile = baseProfile || { id: userId, full_name: userEmail?.split('@')[0] || '' } as Profile
            if (phoneValue) combinedProfile.phone = phoneValue

            // 2. Fetch system_members — 스케줄 코드 기반으로 시스템 특정
            const savedScheduleCode = localStorage.getItem('schedule_code')
            let targetSystemId: string | null = null

            if (savedScheduleCode) {
                // 멤버 로그인: 스케줄 코드로 시스템 찾기
                const { data: systemByCode } = await supabase
                    .from('systems')
                    .select('id')
                    .eq('schedule_code', savedScheduleCode)
                    .maybeSingle()
                if (systemByCode) targetSystemId = systemByCode.id
            }

            // 멤버십 조회 (스케줄 코드가 있으면 해당 시스템만, 없으면 아무거나 하나)
            let memberQuery = supabase
                .from('system_members')
                .select('system_id, role, status')
                .eq('user_id', userId)

            if (targetSystemId) {
                memberQuery = memberQuery.eq('system_id', targetSystemId)
            }

            const { data: memberData } = await memberQuery.maybeSingle()

            if (memberData) {
                setGuestStatus(memberData.status as GuestStatus)
                if (memberData.status === 'approved') {
                    combinedProfile.system_id = memberData.system_id
                    combinedProfile.role = memberData.role

                    // 3. Fetch system details to inject settings into profile
                    const { data: systemData, error: sysError } = await supabase
                        .from('systems')
                        .select('owner_id, organization_name, contact_number, manager_name, schedule_code, option1_name, option2_name, option3_name, option4_name')
                        .eq('id', memberData.system_id)
                        .maybeSingle()

                    if (sysError) {
                        console.error('[AuthProvider] System DB 조회 실패 (마이그레이션 누락 의심):', sysError)
                    }

                    // 4. Fetch pricing settings & message templates (안전 조회 - 테이블 미존재 시 무시)
                    let pricingRes: any = { data: null }
                    let templateRes: any = { data: null }
                    try {
                        const results = await Promise.all([
                            supabase
                                .from('pricing_settings')
                                .select('*')
                                .eq('system_id', memberData.system_id)
                                .order('duration_minutes'),
                            supabase
                                .from('message_templates')
                                .select('*')
                                .eq('system_id', memberData.system_id)
                                .eq('is_default', true)
                                .maybeSingle()
                        ])
                        pricingRes = results[0]
                        templateRes = results[1]
                    } catch { /* 테이블 미존재 시 무시 */ }

                    if (systemData) {
                        combinedProfile.is_owner = systemData.owner_id === userId
                        combinedProfile.organization_name = systemData.organization_name || undefined
                        combinedProfile.contact_number = systemData.contact_number || undefined
                        combinedProfile.manager_name = systemData.manager_name || undefined
                        combinedProfile.schedule_code = systemData.schedule_code || undefined
                        combinedProfile.option1_name = systemData.option1_name || undefined
                        combinedProfile.option2_name = systemData.option2_name || undefined
                        combinedProfile.option3_name = systemData.option3_name || undefined
                        combinedProfile.option4_name = systemData.option4_name || undefined
                    }

                    // 가격 설정 주입
                    if (pricingRes.data) {
                        combinedProfile.pricing = pricingRes.data
                    }

                    // 문자 템플릿 주입
                    if (templateRes.data) {
                        combinedProfile.message_template = templateRes.data.template_body
                    }
                }
            } else {
                setGuestStatus(null)
            }

            // Fallback handling if no profile data
            if (profileError || !profileData) {
                // system_members에서 승인된 멤버라면 → 정상 프로필로 세팅
                if (memberData?.status === 'approved' && combinedProfile.role) {
                    setProfile(combinedProfile)
                    // 소속은 시스템에 되어있고 owner인데, role 지정이 안된 경우는 초기 셋팅 필요 (pending_manager)
                    if (!combinedProfile.role) combinedProfile.role = 'pending_manager'
                    setProfile(combinedProfile)
                } else {
                    setProfile(null)
                }
                return
            }

            if (userEmail?.endsWith('@thept.co.kr')) { // 시스템 연결 전인 상태
                combinedProfile.role = 'pending_manager'
            }

            setProfile(combinedProfile)
        } catch (error) {
            console.error('[AuthProvider] 에러:', error)
        }
    }, [])

    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session)
            setUser(session?.user ?? null)
            if (session?.user) {
                fetchProfile(session.user.id, session.user.email).finally(() => setLoading(false))
            } else {
                setLoading(false)
            }
        })

        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session)
            setUser(session?.user ?? null)
            if (session?.user) {
                fetchProfile(session.user.id, session.user.email).finally(() => setLoading(false))
            } else {
                setProfile(null)
                setGuestStatus(null)
                setLoading(false)
            }
        })

        return () => subscription.unsubscribe()
    }, [fetchProfile])

    const value = {
        session,
        user,
        profile,
        guestStatus,
        loading,
        refreshProfile: async () => {
            if (user) await fetchProfile(user.id, user.email)
        },
        signOut: async () => {
            await supabase.auth.signOut()
        },
    }

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
