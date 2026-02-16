import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { Appointment } from '@/types/db'
import { updateAppointmentsStatus } from './api'

export function useAutoCompleteAppointments(appointments: Appointment[] = []) {
    const queryClient = useQueryClient()

    useEffect(() => {
        const checkAndComplete = async () => {
            const now = new Date()
            const pendingToComplete = appointments.filter(a =>
                a.status === 'PENDING' &&
                new Date(a.end_time) < now
            )

            if (pendingToComplete.length > 0) {
                const ids = pendingToComplete.map(a => a.id)
                try {
                    await updateAppointmentsStatus(ids, 'COMPLETED')
                    queryClient.invalidateQueries({ queryKey: ['appointments'] })
                } catch (error) {
                    console.error('[Auto-Complete] Failed to update status:', error)
                }
            }
        }

        // 초기 마운트 시 및 appointments 변경 시 체크
        checkAndComplete()

        // 1분마다 체크 (화면을 켜놓고 있을 경우를 대비)
        const interval = setInterval(checkAndComplete, 60 * 1000)

        return () => clearInterval(interval)
    }, [appointments, queryClient])
}
