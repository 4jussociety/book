
import { toZonedTime, formatInTimeZone } from 'date-fns-tz'
import { ko } from 'date-fns/locale'

export const TIMEZONE = 'Asia/Seoul'

/**
 * 현재 한국 시간(KST)을 반환합니다.
 * @returns Date 객체 (시스템 시간)
 */
export function getNow(): Date {
    return new Date()
}

/**
 * Date 객체를 한국 시간대 기준으로 포맷팅합니다.
 * @param date Date 객체 또는 ISO 문자열
 * @param formatStr 포맷 문자열 (예: 'yyyy-MM-dd HH:mm')
 */
export function formatKST(date: Date | string | number, formatStr: string): string {
    return formatInTimeZone(date, TIMEZONE, formatStr, { locale: ko })
}

/**
 * KST 기준의 ISO 문자열을 반환합니다. (예: 2024-02-15T18:00:00+09:00)
 */
export function toISOStringKST(date: Date): string {
    return formatInTimeZone(date, TIMEZONE, "yyyy-MM-dd'T'HH:mm:ssXXX", { locale: ko })
}

/**
 * 입력받은 날짜가 오늘인지 확인 (KST 기준)
 */
export function isTodayKST(date: Date): boolean {
    const now = getNow()
    return formatKST(date, 'yyyy-MM-dd') === formatKST(now, 'yyyy-MM-dd')
}

import { addDays } from 'date-fns'

/**
 * 주어진 날짜가 속한 주의 시작일(일요일)을 KST 기준으로 반환합니다.
 * 반환된 Date 객체는 해당 일의 "한국 시간 자정"에 해당하는 UTC 시각입니다.
 */
export function getStartOfWeekKST(date: Date): Date {
    // 1. KST 기준 해당 날짜의 자정 시각을 구함 (UTC 타임스탬프)
    const kstMidnightStr = formatInTimeZone(date, TIMEZONE, 'yyyy-MM-dd 00:00:00')
    const kstMidnight = toZonedTime(kstMidnightStr, TIMEZONE)

    // 2. KST 기준 요일 인덱스 (0:일요일 ~ 6:토요일)
    // 2024-01-01 (월) -> 1
    const dayIndex = parseInt(formatInTimeZone(date, TIMEZONE, 'i'))
    // format 'i'는 1(월)~7(일). 우리는 0(일)~6(토)를 원함.
    // 일요일(7) -> 0, 월요일(1) -> 1, ... 토요일(6) -> 6
    const sundayBasedIndex = dayIndex === 7 ? 0 : dayIndex

    // 3. 해당 요일만큼 뺌
    return addDays(kstMidnight, -sundayBasedIndex)
}

/**
 * KST 기준으로 날짜를 더합니다.
 */
export function addDaysKST(date: Date, amount: number): Date {
    return addDays(date, amount)
}

/**
 * KST 기준으로 두 날짜가 같은 날인지 확인합니다.
 */
export function isSameDayKST(dateLeft: Date, dateRight: Date): boolean {
    return formatKST(dateLeft, 'yyyy-MM-dd') === formatKST(dateRight, 'yyyy-MM-dd')
}

export const kstFormat = (date: Date, fmt: string) => formatInTimeZone(date, TIMEZONE, fmt, { locale: ko })

/**
 * KST 기준의 날짜(yyyy-MM-dd)와 시간(HH:mm) 문자열을 받아
 * 해당 시각의 UTC Date 객체를 반환합니다.
 */
export function parseKSTDateTime(dateStr: string, timeStr: string): Date {
    // '2024-02-15T10:00:00' 형태의 문자열 생성 (Local ISO-like)
    const isoString = `${dateStr}T${timeStr}:00`
    // 이를 Asia/Seoul 시간대로 해석하여 UTC Date로 변환
    return toZonedTime(isoString, TIMEZONE)
}


/**
 * 시작 시간부터 종료 시간까지 지정된 분 단위로 시간 문자열 배열을 생성합니다.
 * @param startHour 시작 시 (0~23)
 * @param endHour 종료 시 (0~23)
 * @param stepMinutes 단위 분 (기본 10분)
 * @returns ["09:00", "09:10", ... "20:00"] 형태의 배열
 */
export function generateTimeOptions(startHour: number = 0, endHour: number = 24, stepMinutes: number = 10): string[] {
    const options: string[] = []

    // 종료 시간까지 포함하려면 <= endHour * 60, 미포함이면 <
    // 보통 캘린더는 24:00까지 표현하기도 하므로 상황에 맞게 조정
    const totalMinutesStart = startHour * 60
    const totalMinutesEnd = endHour * 60

    for (let m = totalMinutesStart; m <= totalMinutesEnd; m += stepMinutes) {
        // 24:00을 넘어가면 멈춤 (혹은 00:00으로 표기하고 싶다면 로직 추가)
        if (m >= 24 * 60 + stepMinutes) break

        const h = Math.floor(m / 60)
        // 24시인 경우 24:00으로 표기할지, 다음날 00:00으로 표기할지 결정.
        // input type="time"은 24:00을 지원하지 않지만 select는 문자열이므로 가능.
        // 여기서는 24시간제(00~23) 루프를 돌되, 마감 시간을 위해 24:00도 허용
        const min = m % 60

        // 24:00 이상의 처리가 필요없다면 h % 24
        const displayH = h.toString().padStart(2, '0')
        const displayM = min.toString().padStart(2, '0')

        options.push(`${displayH}:${displayM}`)
    }
    return options
}
