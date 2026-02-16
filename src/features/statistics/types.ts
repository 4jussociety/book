// 통계 페이지 타입 정의
// 기간별 통계 데이터 구조 및 치료사 실적 타입

export type StatsSummary = {
    total_reservations: number
    completed_reservations: number
    cancelled_reservations: number
    noshow_reservations: number
    pending_reservations: number
    new_patients: number
    noshow_rate: number
}

export type TimeDistribution = {
    hour: number
    count: number
}

export type TherapistPerformance = {
    therapist_id: string
    therapist_name: string
    total_appointments: number
    completed_appointments: number
    cancelled_appointments: number
    noshow_appointments: number
    new_patients: number
    returning_patients: number
    avg_duration_min: number
}

export type DailyTrend = {
    date: string
    label: string
    total: number
    completed: number
    cancelled: number
    noshow: number
}

export type StatsData = {
    summary: StatsSummary
    time_distribution: TimeDistribution[]
    therapist_performance: TherapistPerformance[]
    daily_trend: DailyTrend[]
}

export type DateRange = {
    start: Date
    end: Date
}

export type PeriodType = 'today' | 'week' | 'month' | 'custom'
