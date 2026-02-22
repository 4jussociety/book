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
                .select('id, email, full_name')
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

            // 2. Fetch system_members (replacement for guest_access)
            const { data: memberData } = await supabase
                .from('system_members')
                .select('system_id, role, status')
                .eq('user_id', userId)
                .maybeSingle()

            if (memberData) {
                setGuestStatus(memberData.status as GuestStatus)
                if (memberData.status === 'approved') {
                    combinedProfile.system_id = memberData.system_id
                    combinedProfile.role = memberData.role

                    // 3. Fetch system details to inject settings into profile
                    const { data: systemData, error: sysError } = await supabase
                        .from('systems')
                        .select('owner_id, organization_name, contact_number, admin_name')
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
                        combinedProfile.admin_name = systemData.admin_name || undefined
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
                } else if (userEmail?.endsWith('@thept.co.kr')) {
                    if (!combinedProfile.role) combinedProfile.role = 'pending_admin'
                    setProfile(combinedProfile)
                } else {
                    setProfile(null)
                }
                return
            }

            if (userEmail?.endsWith('@thept.co.kr') && !combinedProfile.role) {
                combinedProfile.role = 'pending_admin'
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
