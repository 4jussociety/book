// 고객관리 API 함수: 고객 CRUD 및 목록 조회
// 담당선생님은 최근 예약 기반으로 클라이언트에서 처리

import { supabase } from '@/lib/supabase'
import type { Client } from '@/types/db'

export type ClientWithDetails = Client & {
    last_instructor_name?: string
    first_visit?: string
    next_appointment?: {
        start_time: string
        end_time: string
        instructor_name: string
    }
    active_memberships?: {
        id: string
        name: string
        used_sessions: number
        total_sessions: number
    }[]
}

export async function getClients(search?: string): Promise<ClientWithDetails[]> {
    let query = supabase
        .from('clients')
        .select('*')
        .order('created_at', { ascending: false })

    if (search) {
        query = query.ilike('name', `%${search}%`)
    }

    const { data: clients, error } = await query
    if (error) throw error

    if (!clients || clients.length === 0) return []

    // 각 고객별 최근 예약에서 담당선생님 및 최초방문일 추출
    const clientIds = clients.map(p => p.id)

    // 최초 방문일: 각 고객별 가장 오래된 예약
    const { data: firstVisits } = await supabase
        .from('appointments')
        .select('client_id, start_time')
        .in('client_id', clientIds)
        .eq('event_type', 'APPOINTMENT')
        .order('start_time', { ascending: true })

    // 최근 예약 선생님
    const { data: lastAppts } = await supabase
        .from('appointments')
        .select('client_id, instructor_id, profiles!appointments_instructor_id_fkey(full_name)')
        .in('client_id', clientIds)
        .eq('event_type', 'APPOINTMENT')
        .order('start_time', { ascending: false })

    // Map: client_id -> first_visit
    const firstVisitMap = new Map<string, string>()
    firstVisits?.forEach(fv => {
        if (!firstVisitMap.has(fv.client_id)) {
            firstVisitMap.set(fv.client_id, fv.start_time)
        }
    })

    // Map: client_id -> last_instructor_name
    const instructorMap = new Map<string, string>()
    lastAppts?.forEach((la: Record<string, unknown>) => {
        if (!instructorMap.has(la.client_id as string)) {
            const profiles = la.profiles as { full_name: string } | null
            if (profiles?.full_name) {
                instructorMap.set(la.client_id as string, profiles.full_name)
            }
        }
    })

    // 최근 예약 데이터 조회 (과거/미래 무관, 상태 무관하게 최신 예약 1건)
    const { data: nextAppts } = await supabase
        .from('appointments')
        .select('client_id, start_time, end_time, instructor_id, profiles!appointments_instructor_id_fkey(full_name)')
        .in('client_id', clientIds)
        .eq('event_type', 'APPOINTMENT')
        .order('start_time', { ascending: false })

    // Map: client_id -> next_appointment
    const nextApptMap = new Map<string, { start_time: string; end_time: string; instructor_name: string }>()
    nextAppts?.forEach((na: Record<string, unknown>) => {
        if (!nextApptMap.has(na.client_id as string)) {
            const profiles = na.profiles as { full_name: string } | null
            nextApptMap.set(na.client_id as string, {
                start_time: na.start_time as string,
                end_time: na.end_time as string,
                instructor_name: profiles?.full_name || '담당 선생님',
            })
        }
    })

    // 회원권 (ACTIVE 상태) 조회
    const { data: activeMembs } = await supabase
        .from('client_memberships')
        .select('id, client_id, name, used_sessions, total_sessions')
        .in('client_id', clientIds)
        .eq('status', 'ACTIVE')

    const activeMembershipsMap = new Map<string, { id: string; name: string; used_sessions: number; total_sessions: number }[]>()
    activeMembs?.forEach((m: Record<string, unknown>) => {
        const cId = m.client_id as string
        if (!activeMembershipsMap.has(cId)) {
            activeMembershipsMap.set(cId, [])
        }
        activeMembershipsMap.get(cId)!.push({
            id: m.id as string,
            name: m.name as string,
            used_sessions: m.used_sessions as number,
            total_sessions: m.total_sessions as number,
        })
    })

    return clients.map(p => ({
        ...p,
        last_instructor_name: instructorMap.get(p.id) || undefined,
        first_visit: firstVisitMap.get(p.id) || undefined,
        next_appointment: nextApptMap.get(p.id) || undefined,
        active_memberships: activeMembershipsMap.get(p.id) || undefined,
    })) as ClientWithDetails[]
}

export async function createClient(client: Partial<Client>) {
    const { data, error } = await supabase
        .from('clients')
        .insert(client)
        .select()
        .single()

    if (error) throw error
    return data as Client
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

export async function deleteClient(id: string) {
    const { error } = await supabase.from('clients').delete().eq('id', id)
    if (error) throw error
}
