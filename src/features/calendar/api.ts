import { supabase } from '@/lib/supabase'
import type { Appointment, Client, Profile } from '@/types/db'
import { endOfDay, startOfWeek, addDays, formatISO, startOfMonth, endOfMonth, endOfWeek } from 'date-fns'

export async function getAppointments(date: Date) {
    // 주간 뷰: 선택된 날짜가 포함된 한 주(일~토)의 모든 예약을 가져옵니다.

    const weekStart = startOfWeek(date, { weekStartsOn: 0 })
    const weekEnd = endOfDay(addDays(weekStart, 6))

    const { data, error } = await supabase
        .from('appointments')
        .select(`
            *,
            client:clients!client_id(*),
            instructor:profiles!instructor_id(*),
            membership:client_memberships!membership_id(id, name, total_sessions, used_sessions, status)
        `)
        .gte('start_time', formatISO(weekStart))
        .lte('start_time', formatISO(weekEnd))

    if (error) throw error
    return data as Appointment[]
}

export async function getMembershipPackages(systemId?: string) {
    if (!systemId) return []
    const { data, error } = await supabase
        .from('membership_packages')
        .select('*')
        .eq('system_id', systemId)
        .order('created_at', { ascending: true })

    if (error) throw error
    return data as import('@/types/db').MembershipPackage[]
}

export async function getAppointmentsByClient(clientId: string) {
    const { data, error } = await supabase
        .from('appointments')
        .select(`
            *,
            client:clients!client_id(*),
            instructor:profiles!instructor_id(*)
        `)
        .eq('client_id', clientId)
        .order('start_time', { ascending: false })

    if (error) throw error
    return data as Appointment[]
}

export async function getMonthlyAppointments(date: Date) {
    // 월간 뷰: 선택된 날짜가 포함된 달의 모든 예약을 가져옵니다.
    // 앞뒤로 1주일 정도 여유를 두어 달력의 이전/다음 달 날짜도 커버
    const start = startOfWeek(startOfMonth(date), { weekStartsOn: 0 })
    const end = endOfWeek(endOfMonth(date), { weekStartsOn: 0 })

    const { data, error } = await supabase
        .from('appointments')
        .select(`
            id,
            start_time,
            event_type,
            status,
            instructor_id
        `)
        .gte('start_time', formatISO(start))
        .lte('start_time', formatISO(end))

    if (error) throw error
    return data as Partial<Appointment>[]
}

export async function createAppointment(appointment: Partial<Appointment>) {
    const { data, error } = await supabase
        .from('appointments')
        .insert(appointment)
        .select(`
            *,
            client:clients!client_id(*),
            instructor:profiles!instructor_id(*)
        `)
        .single()

    if (error) throw error
    return data as Appointment
}

export async function updateAppointment(id: string, updates: Partial<Appointment>) {
    // 버전 정보가 있다면 여기서 낙관적 락킹(Optimistic Locking) 검사를 수행할 수 있습니다.
    const { data, error } = await supabase
        .from('appointments')
        .update(updates)
        .eq('id', id)
        .select(`
            *,
            client:clients!client_id(*),
            instructor:profiles!instructor_id(*)
        `)
        .single()

    if (error) throw error
    return data as Appointment
}

export async function updateAppointmentsStatus(ids: string[], status: import('@/types/db').AppointmentStatus) {
    const { data, error } = await supabase
        .from('appointments')
        .update({ status })
        .in('id', ids)
        .select()

    if (error) throw error
    return data as Appointment[]
}

export async function deleteAppointment(id: string) {
    const { error } = await supabase
        .from('appointments')
        .delete()
        .eq('id', id)

    if (error) throw error
}

export async function getClients(query?: string) {
    let builder = supabase.from('clients').select('*')
    if (query) {
        builder = builder.or(`name.ilike.%${query}%,phone.ilike.%${query}%`)
    }
    const { data, error } = await builder.order('name')
    if (error) throw error
    return data as Client[]
}

export async function getProfiles(systemId?: string) {
    if (!systemId) return []

    // 1. System Members에서 instructor 권한을 가진 사용자의 ID만 조회 (owner 제외)
    const { data: members, error: membersError } = await supabase
        .from('system_members')
        .select('user_id')
        .eq('system_id', systemId)
        .eq('role', 'instructor')
        .eq('status', 'approved')

    if (membersError) throw membersError

    const instructorIds = Array.from(new Set(members.map(m => m.user_id)))

    if (instructorIds.length === 0) return []

    // 2. ID 목록에 해당하는 프로필 조회
    const { data: profiles, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .in('id', instructorIds)
        .order('full_name')

    if (profileError) throw profileError

    return profiles as Profile[]
}

export async function updateProfile(id: string, updates: Partial<Profile>) {
    const { data, error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', id)
        .select()
        .single()

    if (error) throw error
    return data as Profile
}

export async function updateClient(id: string, updates: Partial<Client>) {
    const { data, error } = await supabase
        .from('clients')
        .update(updates)
        .eq('id', id)
        .select()
        .single()

    if (error) throw error
    return data as Client
}
