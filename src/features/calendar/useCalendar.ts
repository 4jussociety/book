import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getAppointments, createAppointment, getPatients, getProfiles, updateAppointment, deleteAppointment, updateProfile, getMonthlyAppointments } from './api'
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


/** 특정 날짜의 예약 목록 조회 훅 (Realtime은 전역 useRealtimeAppointments에서 처리) */
export function useAppointments(date: Date) {
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
            // refetchQueries: Realtime이 자기 세션에 이벤트를 보내지 않으므로
            // 본인이 변경해도 즉시 서버에서 최신 데이터를 강제 재조회
            queryClient.refetchQueries({ queryKey: ['appointments'] })
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
            queryClient.refetchQueries({ queryKey: ['appointments'] })
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
            queryClient.refetchQueries({ queryKey: ['appointments'] })
        },
    })
}

/** 프로필 업데이트 훅 */
export function useUpdateProfile() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: ({ id, updates }: { id: string; updates: Partial<import('@/types/db').Profile> }) =>
            updateProfile(id, updates),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['profiles'] }) // 프로필 목록 갱신
            queryClient.invalidateQueries({ queryKey: ['statistics'] }) // 통계 갱신 (인센티브 비율 변경 시 재계산 필요)
        },
    })
}

/** 월간 예약 목록 조회 훅 (미니 달력용) */
export function useMonthlyAppointments(date: Date) {
    return useQuery({
        queryKey: ['appointments', 'monthly', date],
        queryFn: () => getMonthlyAppointments(date),
    })
}
