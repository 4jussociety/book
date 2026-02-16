// StatisticsPage: 통계 대시보드 페이지
// 기간 선택(오늘/주간/월간/지정), 요약 카드, 차트, 치료사 실적, CSV 내보내기

import { useState, useEffect, useMemo } from 'react'
import {
    startOfToday, endOfToday, startOfWeek, endOfWeek, startOfMonth, endOfMonth,
    format, addMonths, subMonths, addYears, subYears, setMonth,
    getWeekOfMonth, eachWeekOfInterval, isSameMonth
} from 'date-fns'
import { ko } from 'date-fns/locale'
import type { StatsData, DateRange, PeriodType } from './types'
import { fetchStats } from './api'
import { Loader2, Download, Calendar, TrendingUp, CheckCircle2, XCircle, AlertTriangle, UserPlus, ChevronLeft, ChevronRight, User } from 'lucide-react'
import { useProfiles } from '../calendar/useCalendar'
import { useAuth } from '../auth/AuthContext'

export default function StatisticsPage() {
    const { profile } = useAuth()
    const { data: profiles } = useProfiles(profile?.system_id)

    const [period, setPeriod] = useState<PeriodType>('week')
    const [viewDate, setViewDate] = useState(new Date()) // 월/주 탐색 기준 날짜
    const [selectedWeekIndex, setSelectedWeekIndex] = useState(0) // 주간 보기에서 선택된 주차 인덱스 (0~5)

    const [selectedTherapistId, setSelectedTherapistId] = useState<string | null>(null)

    const [customStart, setCustomStart] = useState('')
    const [customEnd, setCustomEnd] = useState('')
    const [stats, setStats] = useState<StatsData | null>(null)
    const [loading, setLoading] = useState(true)

    // 기간 변경 시 주차 초기화
    useEffect(() => {
        if (period === 'week') {
            // 현재 날짜가 포함된 주차를 기본값으로
            const currentWeekOfMonth = getWeekOfMonth(new Date(), { weekStartsOn: 1 })
            setSelectedWeekIndex(currentWeekOfMonth - 1)
        }
    }, [period])

    const weeksInMonth = useMemo(() => {
        const start = startOfMonth(viewDate)
        const end = endOfMonth(viewDate)
        return eachWeekOfInterval({ start, end }, { weekStartsOn: 1 }).filter(weekStart =>
            isSameMonth(weekStart, viewDate) || isSameMonth(endOfWeek(weekStart, { weekStartsOn: 1 }), viewDate)
        )
    }, [viewDate])

    const dateRange = useMemo<DateRange>(() => {
        const today = new Date()
        switch (period) {
            case 'today':
                return { start: startOfToday(), end: endOfToday() }
            case 'week':
                // viewDate 달의 selectedWeekIndex 번째 주
                if (weeksInMonth.length > 0) {
                    const targetWeekStart = weeksInMonth[Math.min(selectedWeekIndex, weeksInMonth.length - 1)]
                    return {
                        start: targetWeekStart,
                        end: endOfWeek(targetWeekStart, { weekStartsOn: 1 })
                    }
                }
                return { start: startOfWeek(today, { weekStartsOn: 1 }), end: endOfWeek(today, { weekStartsOn: 1 }) }
            case 'month':
                // viewDate의 해당 월 전체
                return { start: startOfMonth(viewDate), end: endOfMonth(viewDate) }
            case 'custom':
                if (customStart && customEnd) {
                    return { start: new Date(customStart), end: new Date(customEnd + 'T23:59:59') }
                }
                return { start: startOfWeek(today, { weekStartsOn: 1 }), end: endOfWeek(today, { weekStartsOn: 1 }) }
        }
    }, [period, viewDate, selectedWeekIndex, weeksInMonth, customStart, customEnd])

    useEffect(() => {
        const loadStats = async () => {
            setLoading(true)
            try {
                const data = await fetchStats(dateRange, selectedTherapistId || undefined)
                setStats(data)
            } catch (error) {
                console.error('Failed to load stats', error)
            } finally {
                setLoading(false)
            }
        }
        loadStats()
    }, [dateRange, selectedTherapistId])

    const handleExport = () => {
        if (!stats) return

        const csvRows = [
            ['구분', '치료사명', '총 예약', '완료', '취소', '노쇼', '신환', '재방문', '평균시간(분)'],
            ...stats.therapist_performance.map(t => [
                '치료사',
                t.therapist_name,
                t.total_appointments,
                t.completed_appointments,
                t.cancelled_appointments,
                t.noshow_appointments,
                t.new_patients,
                t.returning_patients,
                t.avg_duration_min,
            ]),
            [],
            ['총 예약', stats.summary.total_reservations],
            ['완료', stats.summary.completed_reservations],
            ['취소', stats.summary.cancelled_reservations],
            ['노쇼', stats.summary.noshow_reservations],
            ['노쇼율', stats.summary.noshow_rate + '%'],
            ['신규 환자', stats.summary.new_patients],
        ]

        const csvContent = csvRows.map(e => e.join(',')).join('\n')
        const blob = new Blob([`\uFEFF${csvContent}`], { type: 'text/csv;charset=utf-8;' })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = `통계_${format(dateRange.start, 'yyyyMMdd')}_${format(dateRange.end, 'yyyyMMdd')}.csv`
        link.click()
        URL.revokeObjectURL(url)
    }

    const periodLabel = useMemo(() => {
        return `${format(dateRange.start, 'yyyy.MM.dd (eee)', { locale: ko })} ~ ${format(dateRange.end, 'yyyy.MM.dd (eee)', { locale: ko })}`
    }, [dateRange])

    if (loading) {
        return (
            <div className="flex items-center justify-center h-full">
                <div className="flex flex-col items-center gap-3">
                    <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
                    <span className="text-sm text-gray-400 font-medium">통계 데이터 로딩 중...</span>
                </div>
            </div>
        )
    }

    if (!stats) return null

    return (
        <div className="p-6 max-w-7xl mx-auto space-y-6">
            {/* Header + Period Filter */}
            <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-center">
                <div>
                    <h1 className="text-2xl font-black text-gray-900">통계 대시보드</h1>
                    <p className="text-xs text-gray-400 mt-1 font-medium">{periodLabel}</p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    {/* Period Tabs */}
                    <div className="flex bg-gray-100 rounded-xl p-1">
                        {([
                            { key: 'today', label: '오늘' },
                            { key: 'week', label: '주간' },
                            { key: 'month', label: '월간' },
                            { key: 'custom', label: '지정' },
                        ] as { key: PeriodType; label: string }[]).map(tab => (
                            <button
                                key={tab.key}
                                onClick={() => setPeriod(tab.key)}
                                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${period === tab.key
                                    ? 'bg-white text-blue-600 shadow-sm'
                                    : 'text-gray-500 hover:text-gray-700'
                                    }`}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>

                    {/* Custom Date Inputs */}
                    {period === 'custom' && (
                        <div className="flex items-center gap-2">
                            <input
                                type="date"
                                value={customStart}
                                onChange={e => setCustomStart(e.target.value)}
                                className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                            />
                            <span className="text-gray-400 text-xs">~</span>
                            <input
                                type="date"
                                value={customEnd}
                                onChange={e => setCustomEnd(e.target.value)}
                                className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                            />
                        </div>
                    )}

                    {/* Export */}
                    <button
                        onClick={handleExport}
                        className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 font-bold text-xs text-blue-600 transition-all shadow-sm"
                    >
                        <Download className="w-3.5 h-3.5" />
                        CSV 내보내기
                    </button>
                </div>
            </div>

            {/* Navigation & Controls */}
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex flex-col gap-4">
                {/* 1. Therapist Filter */}
                <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide">
                    <button
                        onClick={() => setSelectedTherapistId(null)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap border ${!selectedTherapistId
                            ? 'bg-blue-50 border-blue-200 text-blue-700'
                            : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
                            }`}
                    >
                        <User className="w-3.5 h-3.5" />
                        전체
                    </button>
                    {profiles?.map((p: any) => (
                        <button
                            key={p.id}
                            onClick={() => setSelectedTherapistId(p.id)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap border ${selectedTherapistId === p.id
                                ? 'bg-blue-50 border-blue-200 text-blue-700'
                                : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
                                }`}
                        >
                            <User className="w-3.5 h-3.5" />
                            {p.full_name || p.name}
                        </button>
                    ))}
                </div>

                {/* 2. Period Navigation */}
                {period === 'month' && (
                    <div className="flex flex-col gap-3 border-t border-gray-100 pt-3">
                        {/* Year Selector */}
                        <div className="flex items-center justify-center gap-4">
                            <button onClick={() => setViewDate(subYears(viewDate, 1))} className="p-1 hover:bg-gray-100 rounded-full">
                                <ChevronLeft className="w-4 h-4 text-gray-500" />
                            </button>
                            <span className="text-lg font-black text-gray-900">{format(viewDate, 'yyyy년')}</span>
                            <button onClick={() => setViewDate(addYears(viewDate, 1))} className="p-1 hover:bg-gray-100 rounded-full">
                                <ChevronRight className="w-4 h-4 text-gray-500" />
                            </button>
                        </div>
                        {/* Month Buttons 1~12 */}
                        <div className="grid grid-cols-6 sm:grid-cols-12 gap-1">
                            {Array.from({ length: 12 }, (_, i) => i).map(monthIndex => (
                                <button
                                    key={monthIndex}
                                    onClick={() => setViewDate(setMonth(viewDate, monthIndex))}
                                    className={`py-2 rounded-lg text-xs font-bold transition-all ${viewDate.getMonth() === monthIndex
                                        ? 'bg-blue-600 text-white shadow-md'
                                        : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
                                        }`}
                                >
                                    {monthIndex + 1}월
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {period === 'week' && (
                    <div className="flex flex-col gap-3 border-t border-gray-100 pt-3">
                        {/* Month Selector for Week View */}
                        <div className="flex items-center justify-center gap-4">
                            <button onClick={() => setViewDate(subMonths(viewDate, 1))} className="p-1 hover:bg-gray-100 rounded-full">
                                <ChevronLeft className="w-4 h-4 text-gray-500" />
                            </button>
                            <span className="text-lg font-black text-gray-900">{format(viewDate, 'yyyy년 M월')}</span>
                            <button onClick={() => setViewDate(addMonths(viewDate, 1))} className="p-1 hover:bg-gray-100 rounded-full">
                                <ChevronRight className="w-4 h-4 text-gray-500" />
                            </button>
                        </div>
                        {/* Week Buttons 1~5 */}
                        <div className="flex justify-center gap-2">
                            {weeksInMonth.map((weekStart, idx) => (
                                <button
                                    key={idx}
                                    onClick={() => setSelectedWeekIndex(idx)}
                                    className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${selectedWeekIndex === idx
                                        ? 'bg-blue-600 text-white shadow-md'
                                        : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
                                        }`}
                                >
                                    {idx + 1}주
                                    <span className="block text-[10px] opacity-70 font-normal">
                                        {format(weekStart, 'M.d')}~
                                    </span>
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                <SummaryCard
                    icon={<Calendar className="w-4 h-4" />}
                    label="총 예약"
                    value={stats.summary.total_reservations}
                    unit="건"
                    iconBg="bg-blue-50"
                    iconColor="text-blue-600"
                />
                <SummaryCard
                    icon={<CheckCircle2 className="w-4 h-4" />}
                    label="완료"
                    value={stats.summary.completed_reservations}
                    unit="건"
                    iconBg="bg-green-50"
                    iconColor="text-green-600"
                    valueColor="text-green-600"
                />
                <SummaryCard
                    icon={<TrendingUp className="w-4 h-4" />}
                    label="예정"
                    value={stats.summary.pending_reservations}
                    unit="건"
                    iconBg="bg-sky-50"
                    iconColor="text-sky-600"
                    valueColor="text-sky-600"
                />
                <SummaryCard
                    icon={<XCircle className="w-4 h-4" />}
                    label="취소"
                    value={stats.summary.cancelled_reservations}
                    unit="건"
                    iconBg="bg-gray-100"
                    iconColor="text-gray-500"
                />
                <SummaryCard
                    icon={<AlertTriangle className="w-4 h-4" />}
                    label="노쇼"
                    value={stats.summary.noshow_reservations}
                    unit={`건 (${stats.summary.noshow_rate}%)`}
                    iconBg="bg-red-50"
                    iconColor="text-red-500"
                    valueColor="text-red-500"
                />
                <SummaryCard
                    icon={<UserPlus className="w-4 h-4" />}
                    label="신규 환자"
                    value={stats.summary.new_patients}
                    unit="명"
                    iconBg="bg-purple-50"
                    iconColor="text-purple-600"
                    valueColor="text-purple-600"
                />
            </div>

            {/* Charts Section */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* 시간대별 분포 */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                    <h3 className="text-sm font-black text-gray-900 mb-4">시간대별 예약 분포</h3>
                    <div className="space-y-2">
                        {stats.time_distribution.map(td => {
                            // 시간대별 최대치는 3으로 고정
                            const maxCount = 3
                            const barWidth = (td.count / maxCount) * 100
                            return (
                                <div key={td.hour} className="flex items-center gap-3">
                                    <span className="text-[10px] font-bold text-gray-400 w-8 text-right">{td.hour}시</span>
                                    <div className="flex-1 bg-gray-50 rounded-full h-5 overflow-hidden">
                                        <div
                                            className="h-full bg-gradient-to-r from-blue-500 to-blue-400 rounded-full transition-all duration-500 flex items-center justify-end pr-2"
                                            style={{ width: `${Math.max(barWidth, td.count > 0 ? 8 : 0)}%` }}
                                        >
                                            {td.count > 0 && (
                                                <span className="text-[9px] font-black text-white">{td.count}</span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </div>

                {/* 일별 추세 */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                    <h3 className="text-sm font-black text-gray-900 mb-4">일별 예약 추세</h3>
                    {stats.daily_trend.length === 0 ? (
                        <div className="flex items-center justify-center h-48 text-sm text-gray-400">데이터 없음</div>
                    ) : (
                        <div className="space-y-2">
                            {stats.daily_trend.map(day => {
                                // 일별 최대치는 (치료사 수 * 20)으로 고정
                                const therapistCount = selectedTherapistId ? 1 : (profiles?.length || 1)
                                const maxTotal = 20 * therapistCount
                                const barWidth = (day.total / maxTotal) * 100
                                return (
                                    <div key={day.date} className="flex items-center gap-3">
                                        <span className="text-[10px] font-bold text-gray-400 w-16 text-right flex-shrink-0">{day.label}</span>
                                        <div className="flex-1 bg-gray-50 rounded-full h-5 overflow-hidden relative">
                                            {/* Completed portion */}
                                            <div
                                                className="h-full bg-gradient-to-r from-green-500 to-green-400 rounded-full absolute left-0 top-0"
                                                style={{ width: `${(day.completed / maxTotal) * 100}%` }}
                                            />
                                            {/* Total bar */}
                                            <div
                                                className="h-full bg-blue-100 rounded-full flex items-center justify-end pr-2"
                                                style={{ width: `${Math.max(barWidth, day.total > 0 ? 8 : 0)}%` }}
                                            >
                                                {day.total > 0 && (
                                                    <span className="text-[9px] font-black text-blue-600 relative z-10">{day.total}</span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )
                            })}
                            <div className="flex items-center gap-4 mt-3 pt-3 border-t border-gray-100">
                                <div className="flex items-center gap-1.5">
                                    <div className="w-3 h-3 rounded-sm bg-green-500" />
                                    <span className="text-[10px] font-bold text-gray-400">완료</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <div className="w-3 h-3 rounded-sm bg-blue-100" />
                                    <span className="text-[10px] font-bold text-gray-400">전체</span>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>



            {/* Therapist Performance Table */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="p-5 border-b border-gray-100">
                    <h3 className="text-sm font-black text-gray-900">치료사별 실적</h3>
                </div>
                {stats.therapist_performance.length === 0 ? (
                    <div className="py-12 text-center text-sm text-gray-400">데이터가 없습니다</div>
                ) : (
                    <table className="w-full text-left">
                        <thead>
                            <tr className="bg-gray-50/80">
                                <th className="px-5 py-3 text-[10px] font-black text-gray-400 uppercase tracking-wider">치료사</th>
                                <th className="px-5 py-3 text-[10px] font-black text-gray-400 uppercase tracking-wider text-center">총 예약</th>
                                <th className="px-5 py-3 text-[10px] font-black text-gray-400 uppercase tracking-wider text-center">완료</th>
                                <th className="px-5 py-3 text-[10px] font-black text-gray-400 uppercase tracking-wider text-center">취소</th>
                                <th className="px-5 py-3 text-[10px] font-black text-gray-400 uppercase tracking-wider text-center">노쇼</th>
                                <th className="px-5 py-3 text-[10px] font-black text-gray-400 uppercase tracking-wider text-center">신환</th>
                                <th className="px-5 py-3 text-[10px] font-black text-gray-400 uppercase tracking-wider text-center">재방문</th>
                                <th className="px-5 py-3 text-[10px] font-black text-gray-400 uppercase tracking-wider text-center">평균 시간</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {stats.therapist_performance.map(t => (
                                <tr key={t.therapist_id} className="hover:bg-blue-50/30 transition-colors">
                                    <td className="px-5 py-3">
                                        <span className="font-bold text-sm text-gray-900">{t.therapist_name}</span>
                                    </td>
                                    <td className="px-5 py-3 text-center">
                                        <span className="font-bold text-sm text-gray-700">{t.total_appointments}</span>
                                    </td>
                                    <td className="px-5 py-3 text-center">
                                        <span className="font-bold text-sm text-green-600">{t.completed_appointments}</span>
                                    </td>
                                    <td className="px-5 py-3 text-center">
                                        <span className="font-bold text-sm text-gray-500">{t.cancelled_appointments}</span>
                                    </td>
                                    <td className="px-5 py-3 text-center">
                                        <span className="font-bold text-sm text-red-500">{t.noshow_appointments}</span>
                                    </td>
                                    <td className="px-5 py-3 text-center">
                                        <span className="inline-flex items-center px-2 py-0.5 bg-purple-50 text-purple-600 rounded-md text-xs font-black">
                                            {t.new_patients}명
                                        </span>
                                    </td>
                                    <td className="px-5 py-3 text-center">
                                        <span className="inline-flex items-center px-2 py-0.5 bg-blue-50 text-blue-600 rounded-md text-xs font-black">
                                            {t.returning_patients}명
                                        </span>
                                    </td>
                                    <td className="px-5 py-3 text-center">
                                        <span className="text-sm font-bold text-gray-700">{t.avg_duration_min}</span>
                                        <span className="text-xs text-gray-400 ml-0.5">분</span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    )
}

function SummaryCard({ icon, label, value, unit, iconBg, iconColor, valueColor = 'text-gray-900' }: {
    icon: React.ReactNode
    label: string
    value: number | string
    unit: string
    iconBg: string
    iconColor: string
    valueColor?: string
}) {
    return (
        <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
            <div className="flex items-center gap-2 mb-2">
                <div className={`w-7 h-7 rounded-lg ${iconBg} ${iconColor} flex items-center justify-center`}>
                    {icon}
                </div>
                <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider">{label}</span>
            </div>
            <div className="flex items-baseline gap-1">
                <span className={`text-xl font-black ${valueColor}`}>{value}</span>
                <span className="text-[10px] text-gray-400 font-bold">{unit}</span>
            </div>
        </div>
    )
}
