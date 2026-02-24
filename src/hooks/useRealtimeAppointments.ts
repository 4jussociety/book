// useRealtimeAppointments: appointments 테이블 변경 실시간 구독 (전역 1회)
// 자동 재연결 + 브라우저 포커스 복귀 시 재조회 기능 포함

import { useEffect, useRef, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/**
 * appointments 테이블의 INSERT/UPDATE/DELETE를 실시간 구독.
 * 변경 감지 시 React Query 캐시를 무효화하여 자동 재조회.
 *
 * - 연결 끊김 시 5초 후 자동 재연결
 * - 브라우저 포커스 복귀 시 재구독 + 데이터 강제 갱신
 */
export function useRealtimeAppointments(systemId?: string | null) {
    const queryClient = useQueryClient()
    const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
    const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    const subscribe = useCallback(() => {
        if (!systemId) return

        if (retryTimerRef.current) {
            clearTimeout(retryTimerRef.current)
            retryTimerRef.current = null
        }
        if (channelRef.current) {
            supabase.removeChannel(channelRef.current)
            channelRef.current = null
        }

        const channel = supabase
            .channel(`realtime-appointments-${systemId}`)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'appointments',
                    filter: `system_id=eq.${systemId}`,
                },
                (payload) => {
                    console.log('[Realtime] appointments 변경 감지:', payload.eventType)
                    queryClient.invalidateQueries({ queryKey: ['appointments'] })
                    queryClient.invalidateQueries({ queryKey: ['statistics'] })
                }
            )
            .subscribe((status) => {
                if (status === 'SUBSCRIBED') {
                    console.log('[Realtime] ✅ 실시간 구독 성공!')
                } else if (status === 'TIMED_OUT' || status === 'CHANNEL_ERROR') {
                    console.warn(`[Realtime] ⚠️ ${status} — 5초 후 재연결 시도`)
                    retryTimerRef.current = setTimeout(() => subscribe(), 5000)
                }
            })

        channelRef.current = channel
    }, [systemId, queryClient])

    // 초기 구독 + systemId 변경 시 재구독
    useEffect(() => {
        subscribe()
        return () => {
            if (retryTimerRef.current) clearTimeout(retryTimerRef.current)
            if (channelRef.current) {
                supabase.removeChannel(channelRef.current)
                channelRef.current = null
            }
        }
    }, [subscribe])

    // 브라우저 포커스 복귀 시 재구독 + 데이터 강제 갱신
    useEffect(() => {
        const handleVisibility = () => {
            if (document.visibilityState === 'visible' && systemId) {
                const state = channelRef.current?.state
                if (state !== 'joined') {
                    console.log('[Realtime] 🔄 포커스 복귀 — 재구독')
                    subscribe()
                }
                queryClient.invalidateQueries({ queryKey: ['appointments'] })
                queryClient.invalidateQueries({ queryKey: ['statistics'] })
            }
        }

        document.addEventListener('visibilitychange', handleVisibility)
        return () => document.removeEventListener('visibilitychange', handleVisibility)
    }, [systemId, subscribe, queryClient])
}
