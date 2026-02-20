// 통계 API: Supabase에서 실제 데이터를 조회하여 통계 생성
// 기간별 예약 집계, 치료사별 실적, 시간대 분포, 치료사별 치료시간 구간 집계

import { supabase } from '@/lib/supabase'
import { format, eachDayOfInterval, differenceInMinutes, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'
import type { StatsData, DateRange } from './types'
import type { Appointment } from '@/types/db'
import { getDisplayHourRange } from '../../lib/useOperatingHours'

// 예약 시간(분) → 표준 구간으로 정규화 (±5분 허용)
export const DURATION_BUCKETS = [30, 40, 50, 60, 90]

export function normalizeDuration(minutes: number): number {
    for (const bucket of DURATION_BUCKETS) {
        if (Math.abs(minutes - bucket) <= 5) return bucket
    }
    return 0 // 기타
}

// 단가 정보 타입
export type DurationPrice = { durationMin: number; priceKrw: number }

export const fetchStats = async (
    range: DateRange,
    therapistId?: string,
    prices: DurationPrice[] = [],
    systemId?: string
): Promise<StatsData> => {
    // 단가 맵 생성 for faster lookup
    const priceMap = new Map<number, number>()
    prices.forEach(p => priceMap.set(p.durationMin, p.priceKrw))

    const getPrice = (start: string, end?: string) => {
        if (!end) return 0
        const dur = differenceInMinutes(parseISO(end), parseISO(start))
        const bucket = normalizeDuration(dur)
        return priceMap.get(bucket) || 0
    }

    const startISO = range.start.toISOString()
    const endISO = range.end.toISOString()

    let query = supabase
        .from('appointments')
        .select(`
            *,
            therapist:profiles(full_name, incentive_percentage)
        `)
        .gte('start_time', startISO)
        .lte('start_time', endISO)
        .order('start_time', { ascending: true })

    if (therapistId) {
        query = query.eq('therapist_id', therapistId)
    }
    if (systemId) {
        query = query.eq('system_id', systemId)
    }

    const { data: appointments, error } = await query

    if (error) {
        console.error('[Statistics] Fetch error:', error)
        throw error
    }

    const appts = ((appointments || []) as unknown as Appointment[]).filter(a =>
        a.event_type === 'APPOINTMENT' || !a.event_type
    )

    // 요약 통계
    const total = appts.length
    const completed = appts.filter(a => a.status === 'COMPLETED').length
    const cancelled = appts.filter(a => a.status === 'CANCELLED').length
    const noshow = appts.filter(a => a.status === 'NOSHOW').length
    const pending = appts.filter(a => a.status === 'PENDING').length

    // 전체 매출 계산 (완료된 예약만, duration 기반 단가 적용)
    const totalRevenue = appts
        .filter(a => a.status === 'COMPLETED')
        .reduce((sum, a) => sum + getPrice(a.start_time, a.end_time), 0)

    const newPatients = new Set(
        appts.filter(a => a.visit_count === 1).map(a => a.patient_id)
    ).size

    const noshowRate = total > 0 ? Math.round((noshow / total) * 1000) / 10 : 0

    const summary = {
        total_reservations: total,
        completed_reservations: completed,
        cancelled_reservations: cancelled,
        noshow_reservations: noshow,
        pending_reservations: pending,
        new_patients: newPatients,
        noshow_rate: noshowRate,
        total_revenue: totalRevenue,
    }

    // 시간대별 분포 (운영시간 설정 기반, 없으면 06~23시)
    const { startHour: distStart, endHour: distEnd } = getDisplayHourRange()
    const hourCounts: Record<number, number> = {}
    appts.forEach(a => {
        const hour = parseISO(a.start_time).getHours()
        hourCounts[hour] = (hourCounts[hour] || 0) + 1
    })
    const displayHours = distEnd - distStart
    const time_distribution = Array.from({ length: displayHours }, (_, i) => ({
        hour: i + distStart,
        count: hourCounts[i + distStart] || 0,
    }))

    // 치료사별 실적 + 시간 구간별 집계
    type TherapistAccum = {
        therapist_id: string
        therapist_name: string
        total: number
        completed: number
        cancelled: number
        noshow: number
        newPatientIds: Set<string>
        returningPatientIds: Set<string>
        totalDuration: number
        durationCounts: Record<number, number>  // 구간별 전체 건수
        revenue: number
        incentivePercent: number
    }

    const therapistMap = new Map<string, TherapistAccum>()

    appts.forEach((a: Appointment) => {
        const tid = a.therapist_id as string
        if (!therapistMap.has(tid)) {
            const therapist = a.therapist as { full_name: string, incentive_percentage?: number } | null
            therapistMap.set(tid, {
                therapist_id: tid,
                therapist_name: therapist?.full_name || '알 수 없음',
                total: 0, completed: 0, cancelled: 0, noshow: 0,
                newPatientIds: new Set(),
                returningPatientIds: new Set(),
                totalDuration: 0,
                durationCounts: {},
                revenue: 0,
                incentivePercent: therapist?.incentive_percentage || 0,
            })
        }
        const t = therapistMap.get(tid)!
        t.total++

        // 시간 구간 집계 (전체 예약 기준)
        if (a.end_time) {
            const dur = differenceInMinutes(parseISO(a.end_time as string), parseISO(a.start_time))
            const bucket = normalizeDuration(dur)
            t.durationCounts[bucket] = (t.durationCounts[bucket] || 0) + 1
        }

        if (a.status === 'COMPLETED') {
            t.completed++
            if (a.end_time) {
                const dur = differenceInMinutes(parseISO(a.end_time as string), parseISO(a.start_time))
                t.totalDuration += dur
            }
            // 매출 집계 (duration 기반)
            t.revenue += getPrice(a.start_time, a.end_time)
        }
        if (a.status === 'CANCELLED') t.cancelled++
        if (a.status === 'NOSHOW') t.noshow++

        const pid = a.patient_id as string
        if (pid) {
            if ((a.visit_count as number) === 1) t.newPatientIds.add(pid)
            else t.returningPatientIds.add(pid)
        }
    })

    const therapist_performance = Array.from(therapistMap.values()).map(t => ({
        therapist_id: t.therapist_id,
        therapist_name: t.therapist_name,
        total_appointments: t.total,
        completed_appointments: t.completed,
        cancelled_appointments: t.cancelled,
        noshow_appointments: t.noshow,
        new_patients: t.newPatientIds.size,
        returning_patients: t.returningPatientIds.size,
        avg_duration_min: t.completed > 0 ? Math.round(t.totalDuration / t.completed) : 0,
        revenue: t.revenue,
        incentive_rate: t.incentivePercent,
        incentive: Math.round(t.revenue * (t.incentivePercent / 100)),
    }))

    // 치료사별 치료 시간 구간 실적
    const therapist_duration_breakdown = Array.from(therapistMap.values()).map(t => ({
        therapist_id: t.therapist_id,
        therapist_name: t.therapist_name,
        durations: t.durationCounts,
        total: t.total,
    }))

    // 일별 추세
    const days = eachDayOfInterval({ start: range.start, end: range.end })
    const daily_trend = days.map(day => {
        const dateStr = format(day, 'yyyy-MM-dd')
        const dayAppts = appts.filter(a => format(parseISO(a.start_time), 'yyyy-MM-dd') === dateStr)
        return {
            date: dateStr,
            label: format(day, 'M/d (eee)', { locale: ko }),
            total: dayAppts.length,
            completed: dayAppts.filter(a => a.status === 'COMPLETED').length,
            cancelled: dayAppts.filter(a => a.status === 'CANCELLED').length,
            noshow: dayAppts.filter(a => a.status === 'NOSHOW').length,
        }
    })

    // 예약 시간 길이 분포 (전체 집계)
    const bucketCountMap: Record<number, { count: number; completedCount: number }> = {}
    appts.forEach((a: Appointment) => {
        if (!a.end_time) return
        const dur = differenceInMinutes(parseISO(a.end_time as string), parseISO(a.start_time))
        const bucket = normalizeDuration(dur)
        if (!bucketCountMap[bucket]) bucketCountMap[bucket] = { count: 0, completedCount: 0 }
        bucketCountMap[bucket].count++
        if (a.status === 'COMPLETED') bucketCountMap[bucket].completedCount++
    })

    const bucketLabels: Record<number, string> = {
        30: '30분', 40: '40분', 50: '50분', 60: '60분', 90: '90분', 0: '기타'
    }
    const allBuckets = [...DURATION_BUCKETS, 0]
    const duration_distribution = allBuckets
        .filter(b => bucketCountMap[b]?.count > 0)
        .map(b => ({
            durationMin: b,
            label: bucketLabels[b] || `${b}분`,
            count: bucketCountMap[b]?.count || 0,
            completedCount: bucketCountMap[b]?.completedCount || 0,
        }))

    return {
        summary,
        time_distribution,
        therapist_performance,
        therapist_duration_breakdown,
        daily_trend,
        duration_distribution,
    }
}
