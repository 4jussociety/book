// 환자관리 API 함수: 환자 CRUD 및 목록 조회
// 담당치료사는 최근 예약 기반으로 클라이언트에서 처리

import { supabase } from '@/lib/supabase'
import type { Patient } from '@/types/db'

export type PatientWithDetails = Patient & {
    last_therapist_name?: string
    first_visit?: string
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

    return patients.map(p => ({
        ...p,
        last_therapist_name: therapistMap.get(p.id) || undefined,
        first_visit: firstVisitMap.get(p.id) || undefined,
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
