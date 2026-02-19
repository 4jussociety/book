// useOperatingHours: 운영 시간 로드 및 표시 범위 계산 유틸리티
// localStorage에서 운영 시간 설정을 불러와 캘린더/통계 표시 범위를 반환

export type DaySchedule = {
    start: string  // 'HH:MM'
    end: string    // 'HH:MM'
    enabled: boolean
}

export type OperatingHours = {
    [day: string]: DaySchedule
}

const DEFAULT_HOURS: OperatingHours = {
    mon: { start: '09:00', end: '18:00', enabled: true },
    tue: { start: '09:00', end: '18:00', enabled: true },
    wed: { start: '09:00', end: '18:00', enabled: true },
    thu: { start: '09:00', end: '18:00', enabled: true },
    fri: { start: '09:00', end: '18:00', enabled: true },
    sat: { start: '09:00', end: '13:00', enabled: false },
    sun: { start: '09:00', end: '13:00', enabled: false },
}

/** localStorage에서 운영 시간 설정 로드 */
export function loadOperatingHours(): OperatingHours {
    try {
        const stored = localStorage.getItem('operatingHours')
        if (stored) return JSON.parse(stored) as OperatingHours
    } catch {
        // 파싱 실패 시 기본값 반환
    }
    return DEFAULT_HOURS
}

/**
 * 운영 시간 설정 기반으로 캘린더/통계 표시 시간 범위 계산.
 * 설정이 없거나 비활성 상태이면 기본값(6~23시) 반환.
 */
export function getDisplayHourRange(): { startHour: number; endHour: number } {
    const hours = loadOperatingHours()
    const enabled = Object.values(hours).filter(d => d.enabled)

    if (enabled.length === 0) {
        return { startHour: 6, endHour: 23 }
    }

    const starts = enabled.map(d => parseInt(d.start.split(':')[0], 10))
    const ends = enabled.map(d => parseInt(d.end.split(':')[0], 10))

    const minStart = Math.min(...starts)
    const maxEnd = Math.max(...ends)

    // 앞뒤로 1시간 여유 부여
    return {
        startHour: Math.max(0, minStart - 1),
        endHour: Math.min(24, maxEnd + 1),
    }
}
