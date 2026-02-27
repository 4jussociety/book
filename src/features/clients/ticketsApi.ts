// 이용권(Ticket) API: 고객별 이용권 CRUD
// 이용권 목록 조회, ACTIVE 필터, 신규 등록, 수정, 삭제 기능

import { supabase } from '@/lib/supabase'
import type { ClientTicket } from '@/types/db'

// 특정 고객의 이용권 목록 조회
export async function getClientTickets(clientId: string): Promise<ClientTicket[]> {
    const { data, error } = await supabase
        .from('client_tickets')
        .select('*')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false })

    if (error) throw error
    return data as ClientTicket[]
}

// 고객의 ACTIVE 상태 이용권만 조회 (예약 등록 시 선택용)
export async function getActiveTickets(clientId: string): Promise<ClientTicket[]> {
    const { data, error } = await supabase
        .from('client_tickets')
        .select('*')
        .eq('client_id', clientId)
        .eq('status', 'ACTIVE')
        .order('created_at', { ascending: false })

    if (error) throw error
    return data as ClientTicket[]
}

// 이용권 신규 등록
export async function createTicket(ticket: Partial<ClientTicket>): Promise<ClientTicket> {
    const { data, error } = await supabase
        .from('client_tickets')
        .insert(ticket)
        .select()
        .single()

    if (error) throw error
    return data as ClientTicket
}

// 이용권 수정 (환불, 만료, 수동 횟수 조정 등)
export async function updateTicket(id: string, updates: Partial<ClientTicket>): Promise<ClientTicket> {
    const { data, error } = await supabase
        .from('client_tickets')
        .update(updates)
        .eq('id', id)
        .select()
        .single()

    if (error) throw error
    return data as ClientTicket
}

// 이용권 삭제 (잘못 등록한 경우)
export async function deleteTicket(id: string): Promise<void> {
    const { error } = await supabase
        .from('client_tickets')
        .delete()
        .eq('id', id)

    if (error) throw error
}
