// 환자관리 API 함수: 환자 CRUD 및 목록 조회
// 담당치료사는 최근 예약 기반으로 클라이언트에서 처리

import { supabase } from '@/lib/supabase'
import type { Patient } from '@/types/db'

export type PatientWithDetails = Patient & {
    last_therapist_name?: string
    first_visit?: string
    next_appointment?: {
        start_time: string
        end_time: string
        therapist_name: string
    }
    active_memberships?: {
        id: string
        name: string
        used_sessions: number
        total_sessions: number
    }[]
}

export async function getPatients(search?: string): Promise<PatientWithDetails[]> {
    let query = supabase
        .from('patients')
        .select('*')
        .order('created_at', { ascending: false })

    if (search) {
        query = query.ilike('name', `%${search}%`)
    }

    const { data: patients, error } = await query
    if (error) throw error

    if (!patients || patients.length === 0) return []

    // 각 환자별 최근 예약에서 담당치료사 및 최초방문일 추출
    const patientIds = patients.map(p => p.id)

    // 최초 방문일: 각 환자별 가장 오래된 예약
    const { data: firstVisits } = await supabase
        .from('appointments')
        .select('patient_id, start_time')
        .in('patient_id', patientIds)
        .eq('event_type', 'APPOINTMENT')
        .order('start_time', { ascending: true })

    // 최근 예약 치료사
    const { data: lastAppts } = await supabase
        .from('appointments')
        .select('patient_id, therapist_id, profiles!appointments_therapist_id_fkey(full_name)')
        .in('patient_id', patientIds)
        .eq('event_type', 'APPOINTMENT')
        .order('start_time', { ascending: false })

    // Map: patient_id -> first_visit
    const firstVisitMap = new Map<string, string>()
    firstVisits?.forEach(fv => {
        if (!firstVisitMap.has(fv.patient_id)) {
            firstVisitMap.set(fv.patient_id, fv.start_time)
        }
    })

    // Map: patient_id -> last_therapist_name
    const therapistMap = new Map<string, string>()
    lastAppts?.forEach((la: Record<string, unknown>) => {
        if (!therapistMap.has(la.patient_id as string)) {
            const profiles = la.profiles as { full_name: string } | null
            if (profiles?.full_name) {
                therapistMap.set(la.patient_id as string, profiles.full_name)
            }
        }
    })

    // 다음 예약(미래 가장 가까운 예약) 조회
    const { data: nextAppts } = await supabase
        .from('appointments')
        .select('patient_id, start_time, end_time, therapist_id, profiles!appointments_therapist_id_fkey(full_name)')
        .in('patient_id', patientIds)
        .eq('event_type', 'APPOINTMENT')
        .not('status', 'in', '(CANCELLED,NOSHOW)')
        .gte('start_time', new Date().toISOString())
        .order('start_time', { ascending: true })

    // Map: patient_id -> next_appointment
    const nextApptMap = new Map<string, { start_time: string; end_time: string; therapist_name: string }>()
    nextAppts?.forEach((na: Record<string, unknown>) => {
        if (!nextApptMap.has(na.patient_id as string)) {
            const profiles = na.profiles as { full_name: string } | null
            nextApptMap.set(na.patient_id as string, {
                start_time: na.start_time as string,
                end_time: na.end_time as string,
                therapist_name: profiles?.full_name || '담당 선생님',
            })
        }
    })

    // 회원권 (ACTIVE 상태) 조회
    const { data: activeMembs } = await supabase
        .from('patient_memberships')
        .select('id, patient_id, name, used_sessions, total_sessions')
        .in('patient_id', patientIds)
        .eq('status', 'ACTIVE')

    const activeMembershipsMap = new Map<string, { id: string; name: string; used_sessions: number; total_sessions: number }[]>()
    activeMembs?.forEach((m: Record<string, unknown>) => {
        const pId = m.patient_id as string
        if (!activeMembershipsMap.has(pId)) {
            activeMembershipsMap.set(pId, [])
        }
        activeMembershipsMap.get(pId)!.push({
            id: m.id as string,
            name: m.name as string,
            used_sessions: m.used_sessions as number,
            total_sessions: m.total_sessions as number,
        })
    })

    return patients.map(p => ({
        ...p,
        last_therapist_name: therapistMap.get(p.id) || undefined,
        first_visit: firstVisitMap.get(p.id) || undefined,
        next_appointment: nextApptMap.get(p.id) || undefined,
        active_memberships: activeMembershipsMap.get(p.id) || undefined,
    })) as PatientWithDetails[]
}

export async function createPatient(patient: Partial<Patient>) {
    const { data, error } = await supabase
        .from('patients')
        .insert(patient)
        .select()
        .single()

    if (error) throw error
    return data as Patient
}

export async function updatePatient(id: string, updates: Partial<Patient>) {
    const { data, error } = await supabase
        .from('patients')
        .update(updates)
        .eq('id', id)
        .select()
        .single()

    if (error) throw error
    return data as Patient
}

export async function deletePatient(id: string) {
    const { error } = await supabase.from('patients').delete().eq('id', id)
    if (error) throw error
}
