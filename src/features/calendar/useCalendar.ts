import { useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { getAppointments, createAppointment, getPatients, getProfiles, updateAppointment, deleteAppointment } from './api'
import { createPatient } from '@/features/patients/api'

/** 환자 목록 조회 훅 */
export function usePatients() {
    return useQuery({
        queryKey: ['patients'],
        queryFn: () => getPatients(),
    })
}

/** 치료사/직원 프로필 조회 훅 (같은 시스템 소속만) */
export function useProfiles(systemId?: string | null) {
    return useQuery({
        queryKey: ['profiles', systemId],
        queryFn: () => getProfiles(systemId || undefined),
        enabled: !!systemId,
    })
}


/** 특정 날짜의 예약 목록 조회 훅 (Realtime 적용) */
export function useAppointments(date: Date) {
    const queryClient = useQueryClient()

    useEffect(() => {
        const channel = supabase
            .channel('appointments-changes')
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'appointments',
                },
                () => {
                    queryClient.invalidateQueries({ queryKey: ['appointments'] })
                }
            )
            .subscribe()

        return () => {
            supabase.removeChannel(channel)
        }
    }, [queryClient])

    return useQuery({
        queryKey: ['appointments', date],
        queryFn: () => getAppointments(date),
    })
}

/** 예약 생성 훅 */
export function useCreateAppointment() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: createAppointment,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['appointments'] })
        },
    })
}

/** 예약 수정 훅 */
export function useUpdateAppointment() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: ({ id, updates }: { id: string; updates: Partial<import('@/types/db').Appointment> }) =>
            updateAppointment(id, updates),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['appointments'] })
        },
    })
}

/** 환자 생성 훅 */
export function useCreatePatient() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: createPatient,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['patients'] })
        },
    })
}

/** 예약 삭제 훅 */
export function useDeleteAppointment() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: (id: string) => deleteAppointment(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['appointments'] })
        },
    })
}
