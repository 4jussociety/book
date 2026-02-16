import { supabase } from '@/lib/supabase'
import type { Appointment, Patient, Profile } from '@/types/db'
import { endOfDay, startOfWeek, addDays, formatISO } from 'date-fns'

export async function getAppointments(date: Date) {
    // 주간 뷰: 선택된 날짜가 포함된 한 주(일~토)의 모든 예약을 가져옵니다.

    const weekStart = startOfWeek(date, { weekStartsOn: 0 })
    const weekEnd = endOfDay(addDays(weekStart, 6))

    const { data, error } = await supabase
        .from('appointments')
        .select(`
            *,
            patient:patients!patient_id(*),
            therapist:profiles!therapist_id(*)
        `)
        .gte('start_time', formatISO(weekStart))
        .lte('start_time', formatISO(weekEnd))

    if (error) throw error
    return data as Appointment[]
}

export async function createAppointment(appointment: Partial<Appointment>) {
    const { data, error } = await supabase
        .from('appointments')
        .insert(appointment)
        .select(`
            *,
            patient:patients!patient_id(*),
            therapist:profiles!therapist_id(*)
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
            patient:patients!patient_id(*),
            therapist:profiles!therapist_id(*)
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

export async function getPatients(query?: string) {
    let builder = supabase.from('patients').select('*')
    if (query) {
        builder = builder.or(`name.ilike.%${query}%,phone.ilike.%${query}%`)
    }
    const { data, error } = await builder.order('name')
    if (error) throw error
    return data as Patient[]
}

export async function getProfiles(systemId?: string) {
    if (!systemId) return []

    // 1. 해당 시스템의 Owner ID 조회
    const { data: system, error: systemError } = await supabase
        .from('systems')
        .select('owner_id')
        .eq('id', systemId)
        .single()

    if (systemError) throw systemError

    // 2. Guest Access에서 치료사 권한을 가진 사용자 ID 조회
    const { data: guestTherapists, error: guestError } = await supabase
        .from('guest_access')
        .select('user_id')
        .eq('system_id', systemId)
        .eq('role', 'therapist')
        .eq('status', 'approved')

    if (guestError) throw guestError

    const therapistIds = new Set(guestTherapists.map(g => g.user_id))
    if (system.owner_id) {
        therapistIds.add(system.owner_id)
    }

    // 3. ID 목록에 해당하는 프로필 조회 (system_id 필터 제거)
    if (therapistIds.size === 0) return []

    const { data: profiles, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .in('id', Array.from(therapistIds))
        .order('full_name')

    if (profileError) throw profileError

    return profiles as Profile[]
}
