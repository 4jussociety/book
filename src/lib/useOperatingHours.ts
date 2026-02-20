// useOperatingHours: 캘린더/통계 표시 시간 범위 유틸리티
// 고정 시간 범위(06~24시) 반환

/**
 * 캘린더/통계 표시 시간 범위를 반환 (06시 ~ 24시 고정)
 */
export function getDisplayHourRange(): { startHour: number; endHour: number } {
    return { startHour: 6, endHour: 24 }
}
