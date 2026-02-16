// 통계 API: Supabase에서 실제 데이터를 조회하여 통계 생성
// 기간별 예약 집계, 치료사별 실적, 시간대 분포 계산

import { supabase } from '@/lib/supabase'
import { format, eachDayOfInterval, differenceInMinutes, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'
import type { StatsData, DateRange } from './types'
import type { Appointment } from '@/types/db'

export const fetchStats = async (range: DateRange, therapistId?: string): Promise<StatsData> => {
    const startISO = range.start.toISOString()
    const endISO = range.end.toISOString()

    let query = supabase
        .from('appointments')
        .select(`
            *,
            therapist:profiles(full_name)
        `)
        .gte('start_time', startISO)
        .lte('start_time', endISO)
        .order('start_time', { ascending: true })

    if (therapistId) {
        query = query.eq('therapist_id', therapistId)
    }

    const { data: appointments, error } = await query

    if (error) {
        console.error('[Statistics] Fetch error:', error)
        throw error
    }

    const appts = ((appointments || []) as unknown as Appointment[]).filter(a =>
        a.event_type === 'APPOINTMENT' || !a.event_type // null인 경우도 포함 (하위 호환)
    )

    // 2. 요약 통계
    const total = appts.length
    const completed = appts.filter(a => a.status === 'COMPLETED').length
    const cancelled = appts.filter(a => a.status === 'CANCELLED').length
    const noshow = appts.filter(a => a.status === 'NOSHOW').length
    const pending = appts.filter(a => a.status === 'PENDING').length

    // 신규 환자 수 (visit_count === 1인 예약)
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
    }

    // 3. 시간대별 분포
    const hourCounts: Record<number, number> = {}
    appts.forEach(a => {
        const hour = parseISO(a.start_time).getHours()
        hourCounts[hour] = (hourCounts[hour] || 0) + 1
    })
    const time_distribution = Array.from({ length: 18 }, (_, i) => ({
        hour: i + 6,  // 06:00 ~ 24:00 (실제 데이터는 23시까지)
        count: hourCounts[i + 6] || 0,
    }))

    // 4. 치료사별 실적
    const therapistMap = new Map<string, {
        therapist_id: string
        therapist_name: string
        total: number
        completed: number
        cancelled: number
        noshow: number
        newPatientIds: Set<string>
        returningPatientIds: Set<string>
        totalDuration: number
    }>()

    appts.forEach((a: any) => {
        const tid = a.therapist_id as string
        if (!therapistMap.has(tid)) {
            const therapist = a.therapist as { full_name: string } | null
            therapistMap.set(tid, {
                therapist_id: tid,
                therapist_name: therapist?.full_name || '알 수 없음',
                total: 0,
                completed: 0,
                cancelled: 0,
                noshow: 0,
                newPatientIds: new Set(),
                returningPatientIds: new Set(),
                totalDuration: 0,
            })
        }
        const t = therapistMap.get(tid)!
        t.total++
        if (a.status === 'COMPLETED') {
            t.completed++
            const dur = differenceInMinutes(parseISO(a.end_time as string), parseISO(a.start_time as string))
            t.totalDuration += dur
        }
        if (a.status === 'CANCELLED') t.cancelled++
        if (a.status === 'NOSHOW') t.noshow++

        const pid = a.patient_id as string
        if (pid) {
            if ((a.visit_count as number) === 1) {
                t.newPatientIds.add(pid)
            } else {
                t.returningPatientIds.add(pid)
            }
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
    }))

    // 5. 일별 추세
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

    return {
        summary,
        time_distribution,
        therapist_performance,
        daily_trend,
    }
}
