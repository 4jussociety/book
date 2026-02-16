import { createContext, useContext } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import type { Profile } from '@/types/db'

export type GuestStatus = 'pending' | 'approved' | 'rejected' | null

interface AuthContextType {
    session: Session | null
    user: User | null
    profile: Profile | null
    guestStatus: GuestStatus
    loading: boolean
    refreshProfile: () => Promise<void>
    signOut: () => Promise<void>
}

export const AuthContext = createContext<AuthContextType>({
    session: null,
    user: null,
    profile: null,
    guestStatus: null,
    loading: true,
    refreshProfile: async () => { },
    signOut: async () => { },
})

export const useAuth = () => useContext(AuthContext)
