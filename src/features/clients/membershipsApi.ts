import { supabase } from '@/lib/supabase'
import type { ClientMembership } from '@/types/db'

// 특정 고객의 회원권 목록 조회
export async function getClientMemberships(clientId: string): Promise<ClientMembership[]> {
    const { data, error } = await supabase
        .from('client_memberships')
        .select('*')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false })

    if (error) throw error
    return data as ClientMembership[]
}

// 고객의 ACTIVE 상태 회원권만 조회 (예약 등록 시 선택용)
export async function getActiveMemberships(clientId: string): Promise<ClientMembership[]> {
    const { data, error } = await supabase
        .from('client_memberships')
        .select('*')
        .eq('client_id', clientId)
        .eq('status', 'ACTIVE')
        .order('created_at', { ascending: false })

    if (error) throw error
    return data as ClientMembership[]
}

// 회원권 신규 등록
export async function createMembership(membership: Partial<ClientMembership>): Promise<ClientMembership> {
    const { data, error } = await supabase
        .from('client_memberships')
        .insert(membership)
        .select()
        .single()

    if (error) throw error
    return data as ClientMembership
}

// 회원권 수정 (환불, 만료, 수동 횟수 조정 등)
export async function updateMembership(id: string, updates: Partial<ClientMembership>): Promise<ClientMembership> {
    const { data, error } = await supabase
        .from('client_memberships')
        .update(updates)
        .eq('id', id)
        .select()
        .single()

    if (error) throw error
    return data as ClientMembership
}

// 회원권 삭제 (잘못 등록한 경우)
export async function deleteMembership(id: string): Promise<void> {
    const { error } = await supabase
        .from('client_memberships')
        .delete()
        .eq('id', id)

    if (error) throw error
}
