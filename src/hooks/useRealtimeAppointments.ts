// useRealtimeAppointments: appointments 테이블 변경 실시간 구독 (전역 1회)
// App 또는 최상위 컴포넌트에서 호출하여 모든 클라이언트에 변경사항 즉시 반영

import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/**
 * appointments 테이블의 INSERT/UPDATE/DELETE를 실시간 구독.
 * 변경 감지 시 React Query 캐시를 무효화하여 자동 재조회.
 *
 * 사용법: RootLayout 등 최상위에서 1회 호출
 *   useRealtimeAppointments(profile?.system_id)
 */
export function useRealtimeAppointments(systemId?: string | null) {
    const queryClient = useQueryClient()
    const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

    useEffect(() => {
        // systemId가 없으면 스킵
        if (!systemId) return

        // 기존 채널 있으면 정리 (systemId 변경 시)
        if (channelRef.current) {
            supabase.removeChannel(channelRef.current)
            channelRef.current = null
        }

        const channel = supabase
            .channel(`realtime-appointments-${systemId}`) // 채널명 유니크하게
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'appointments',
                    filter: `system_id=eq.${systemId}`, // 내 병원의 변경만 수신
                },
                (payload) => {
                    console.log('[Realtime] appointments 변경 감지:', payload.eventType)
                    queryClient.invalidateQueries({ queryKey: ['appointments'] })
                    queryClient.invalidateQueries({ queryKey: ['statistics'] })
                }
            )
            .subscribe((status, err) => {
                console.log(`[Realtime] 채널 상태: ${status}`, err ? `에러: ${err.message}` : '')
                if (status === 'SUBSCRIBED') {
                    console.log('[Realtime] ✅ 실시간 구독 성공!')
                } else if (status === 'CHANNEL_ERROR') {
                    console.error('[Realtime] ❌ 채널 에러 발생:', err)
                } else if (status === 'TIMED_OUT') {
                    console.error('[Realtime] ⏰ 연결 시간 초과')
                }
            })

        channelRef.current = channel

        return () => {
            if (channelRef.current) {
                supabase.removeChannel(channelRef.current)
                channelRef.current = null
            }
        }
    }, [queryClient, systemId])
}
