// 통계 페이지 타입 정의
// 기간별 통계 데이터 구조, 치료사 실적, 예약 시간 길이별 분포 타입

export type StatsSummary = {
    total_reservations: number
    completed_reservations: number
    cancelled_reservations: number
    noshow_reservations: number
    pending_reservations: number
    new_patients: number
    noshow_rate: number
    total_revenue: number // 전체 매출
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
    revenue: number // 총 매출
    incentive: number // 예상 인센티브
    incentive_rate: number // 인센티브 비율
}

// 치료사별 치료 시간 구간별 실적
export type TherapistDurationBreakdown = {
    therapist_id: string
    therapist_name: string
    durations: Record<number, number>  // { 30: 5, 60: 3, ... } 구간별 완료 건수
    total: number
}

export type DailyTrend = {
    date: string
    label: string
    total: number
    completed: number
    cancelled: number
    noshow: number
}

// 예약 시간 길이(분) 구간별 집계
export type DurationBucket = {
    durationMin: number
    label: string
    count: number
    completedCount: number
}

export type StatsData = {
    summary: StatsSummary
    time_distribution: TimeDistribution[]
    therapist_performance: TherapistPerformance[]
    therapist_duration_breakdown: TherapistDurationBreakdown[]
    daily_trend: DailyTrend[]
    duration_distribution: DurationBucket[]
}

export type DateRange = {
    start: Date
    end: Date
}

export type PeriodType = 'today' | 'week' | 'month' | 'custom'
