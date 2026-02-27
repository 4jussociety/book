// 통계 페이지 타입 정의
// 기간별 통계 데이터 구조, 선생님 실적, 예약 시간 길이별 분포 타입

export type StatsSummary = {
    total_reservations: number
    completed_reservations: number
    cancelled_reservations: number
    noshow_reservations: number
    pending_reservations: number
    new_clients: number
    noshow_rate: number
    total_revenue: number // 전체 매출
}

export type TimeDistribution = {
    hour: number
    count: number
}

export type InstructorPerformance = {
    instructor_id: string
    instructor_name: string
    total_appointments: number
    completed_appointments: number
    cancelled_appointments: number
    noshow_appointments: number
    new_clients: number
    returning_clients: number
    avg_duration_min: number
    revenue: number // 총 매출
    incentive: number // 예상 인센티브
    incentive_rate: number // 인센티브 비율
}

// 선생님별 수업 시간 구간 실적 (다차원 계층구조로 변경)
export type SessionStats = {
    total: number
    completed: number
    revenue: number
    incentive: number
    durations: Record<number, number> // { 30: 5, 50: 3 }
}

export type InstructorDurationBreakdown = {
    instructor_id: string
    instructor_name: string
    // key: 'normal' | 'option1' | 'option2' | 'option3'
    session_stats: Record<string, SessionStats>
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
    instructor_performance: InstructorPerformance[]
    instructor_duration_breakdown: InstructorDurationBreakdown[]
    daily_trend: DailyTrend[]
    duration_distribution: DurationBucket[]
}

export type DateRange = {
    start: Date
    end: Date
}

export type PeriodType = 'today' | 'week' | 'month' | 'custom'
