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
            // Fetch profile
            const { data: profileData, error: profileError } = await supabase
                .from('profiles')
                .select('id, system_id, role, full_name, message_template, organization_name, avatar_url, contact_number')
                .eq('id', userId)
                .maybeSingle()

            if (profileError || !profileData) {
                // If profile missing, but user is admin (@thept.co.kr), provide fallback
                if (userEmail?.endsWith('@thept.co.kr')) {
                    const fallback = {
                        id: userId,
                        system_id: null,
                        role: 'therapist',
                        full_name: userEmail.split('@')[0]
                    }
                    setProfile(fallback)
                } else if (userEmail === undefined && !userId.includes('-')) {
                    setProfile(null)
                } else {
                    setProfile(null)
                }
            } else {
                // @thept.co.kr 관리자인데 role이 null인 경우 therapist로 보정
                if (userEmail?.endsWith('@thept.co.kr') && !profileData.role) {
                    profileData.role = 'therapist'
                }
                setProfile(profileData)
            }

            // If user is guest/anonymous, check access status
            const { data: guestData } = await supabase
                .from('guest_access')
                .select('status, role') // role 추가 조회
                .eq('user_id', userId)
                .maybeSingle()

            if (guestData) {
                setGuestStatus(guestData.status)
                // 게스트 접근 승인 시, guest_access의 role을 프로필 역할로 사용
                if (guestData.status === 'approved' && guestData.role && profileData) {
                    profileData.role = guestData.role
                }
            } else {
                setGuestStatus(null)
            }

            // Check System Ownership
            let isOwner = false
            if (profileData?.system_id) {
                const { data: systemData } = await supabase
                    .from('systems')
                    .select('owner_id')
                    .eq('id', profileData.system_id)
                    .single()

                if (systemData && systemData.owner_id === userId) {
                    isOwner = true
                }
            }

            // Update profile with is_owner flag
            if (profileData) {
                setProfile({ ...profileData, is_owner: isOwner })
            } else if (userEmail?.endsWith('@thept.co.kr')) { // Fallback profile case
                setProfile((prev: Profile | null) => prev ? { ...prev, is_owner: true } : prev) // Assuming admin fallback is owner-like
            }

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
