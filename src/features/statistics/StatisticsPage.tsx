// StatisticsPage: 통계 대시보드 페이지 (전면 리디자인)
// 좌측 치료사 세로 사이드바, 치료사별 치료시간 매트릭스, SVG 시간대 차트

import { useState, useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
    startOfToday, endOfToday, startOfWeek, endOfWeek, startOfMonth, endOfMonth,
    format, addMonths, subMonths, addYears, subYears, setMonth,
    getWeekOfMonth, eachWeekOfInterval, isSameMonth
} from 'date-fns'
import { ko } from 'date-fns/locale'
import type { StatsData, DateRange, PeriodType } from './types'
import type { Profile } from '@/types/db'
import { fetchStats, DURATION_BUCKETS, type DurationPrice } from './api'
import {
    Loader2, Download, Calendar, TrendingUp, CheckCircle2, XCircle,
    AlertTriangle, UserPlus, ChevronLeft, ChevronRight, User, CircleDollarSign, Settings, BadgePercent
} from 'lucide-react'
import { useProfiles, useUpdateProfile } from '../calendar/useCalendar'
import { useAuth } from '../auth/AuthContext'
import { useIsMobile } from '@/hooks/useMediaQuery'

// ─── 상수 ─────────────────────────────────────────────────────────────────────
const loadPricesFromProfile = (profile: Profile | null): DurationPrice[] => {
    if (!profile?.pricing) return []
    return profile.pricing.map(p => ({ durationMin: p.duration_minutes, priceKrw: p.price }))
}

const BUCKET_LABELS: Record<number, string> = {
    30: '30분', 40: '40분', 50: '50분', 60: '60분', 90: '90분', 0: '기타'
}
const BUCKET_COLORS: Record<number, string> = {
    30: 'bg-blue-100 text-blue-700',
    40: 'bg-violet-100 text-violet-700',
    50: 'bg-cyan-100 text-cyan-700',
    60: 'bg-green-100 text-green-700',
    90: 'bg-amber-100 text-amber-700',
    0: 'bg-gray-100 text-gray-500',
}
const BUCKET_BAR_COLORS: Record<number, string> = {
    30: '#3b82f6',
    40: '#8b5cf6',
    50: '#06b6d4',
    60: '#22c55e',
    90: '#f59e0b',
    0: '#9ca3af',
}

export default function StatisticsPage() {
    const { profile } = useAuth()
    const { data: profiles } = useProfiles(profile?.system_id)
    const updateProfileMutation = useUpdateProfile()
    const isMobile = useIsMobile()

    const [period, setPeriod] = useState<PeriodType>('week')
    const [viewDate, setViewDate] = useState(new Date())
    // 이번 달 주차 계산 (월요일 시작이 아닌 일요일 시작으로 변경)
    const currentWeekOfMonth = useMemo(() => {
        return getWeekOfMonth(new Date(), { weekStartsOn: 0 }) - 1
    }, [])
    const [selectedWeekIndex, setSelectedWeekIndex] = useState(currentWeekOfMonth)
    const [selectedTherapistId, setSelectedTherapistId] = useState<string | null>(null)
    const [customStart, setCustomStart] = useState('')
    const [customEnd, setCustomEnd] = useState('')

    // 단가 설정 로드 (profile.pricing에서)
    const [prices, setPrices] = useState<DurationPrice[]>([])
    useEffect(() => {
        setPrices(loadPricesFromProfile(profile))
    }, [profile])

    // 인센티브 설정 상태
    const [editingIncentiveId, setEditingIncentiveId] = useState<string | null>(null)
    const [incentiveValue, setIncentiveValue] = useState('')

    const handleUpdateIncentive = async (id: string) => {
        const val = parseFloat(incentiveValue)
        if (isNaN(val) || val < 0 || val > 100) {
            alert('0~100 사이의 숫자를 입력해주세요.')
            return
        }
        try {
            await updateProfileMutation.mutateAsync({
                id,
                updates: { incentive_percentage: val }
            })
            setEditingIncentiveId(null)
        } catch (e) {
            console.error('Failed to update incentive', e)
            alert('업데이트 실패')
        }
    }

    useEffect(() => {
        if (period === 'week') {
            const currentWeekOfMonth = getWeekOfMonth(new Date(), { weekStartsOn: 0 })
            setSelectedWeekIndex(currentWeekOfMonth - 1)
        }
    }, [period])

    const weeksInMonth = useMemo(() => {
        const start = startOfMonth(viewDate)
        const end = endOfMonth(viewDate)
        return eachWeekOfInterval({ start, end }, { weekStartsOn: 0 }).filter(weekStart =>
            isSameMonth(weekStart, viewDate) || isSameMonth(endOfWeek(weekStart, { weekStartsOn: 0 }), viewDate)
        )
    }, [viewDate])

    const dateRange = useMemo<DateRange>(() => {
        const today = new Date()
        switch (period) {
            case 'today':
                return { start: startOfToday(), end: endOfToday() }
            case 'week':
                if (weeksInMonth.length > 0) {
                    const targetWeekStart = weeksInMonth[Math.min(selectedWeekIndex, weeksInMonth.length - 1)]
                    return { start: targetWeekStart, end: endOfWeek(targetWeekStart, { weekStartsOn: 0 }) }
                }
                return { start: startOfWeek(today, { weekStartsOn: 0 }), end: endOfWeek(today, { weekStartsOn: 0 }) }
            case 'month':
                return { start: startOfMonth(viewDate), end: endOfMonth(viewDate) }
            case 'custom':
                return { start: customStart ? new Date(customStart) : today, end: customEnd ? new Date(customEnd + 'T23:59:59') : today }
            default:
                return { start: startOfWeek(today, { weekStartsOn: 0 }), end: endOfWeek(today, { weekStartsOn: 0 }) }
        }
    }, [period, viewDate, selectedWeekIndex, weeksInMonth, customStart, customEnd])

    const { data: stats, isLoading: loading } = useQuery<StatsData>({
        // prices가 변경되면 쿼리를 재실행하여 매출을 다시 계산
        queryKey: ['statistics', dateRange, selectedTherapistId, prices, profile?.system_id],
        queryFn: async () => {
            const data = await fetchStats(dateRange, selectedTherapistId || undefined, prices, profile?.system_id || undefined)
            return data
        },
        staleTime: 1000 * 60 * 5, // 5분
        enabled: !!profile?.system_id,
    })

    // ─── CSV 내보내기 ──────────────────────────────────────────────────────────
    const handleExport = () => {
        if (!stats) return
        const csvRows = [
            ['치료사', '총예약', '완료', '취소', '노쇼', '신환', '재방문', '평균시간(분)',
                ...DURATION_BUCKETS.map(b => BUCKET_LABELS[b])],
            ...stats.therapist_performance.map(t => {
                const breakdown = stats.therapist_duration_breakdown.find(d => d.therapist_id === t.therapist_id)
                return [
                    t.therapist_name, t.total_appointments, t.completed_appointments,
                    t.cancelled_appointments, t.noshow_appointments,
                    t.new_patients, t.returning_patients, t.avg_duration_min,
                    ...DURATION_BUCKETS.map(b => breakdown?.durations[b] || 0),
                ]
            }),
            [],
            ['총예약', stats.summary.total_reservations],
            ['완료', stats.summary.completed_reservations],
            ['취소', stats.summary.cancelled_reservations],
            ['노쇼', stats.summary.noshow_reservations],
            ['노쇼율', stats.summary.noshow_rate + '%'],
        ]
        const csv = csvRows.map(r => r.join(',')).join('\n')
        const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `통계_${format(dateRange.start, 'yyyyMMdd')}_${format(dateRange.end, 'yyyyMMdd')}.csv`
        a.click()
        URL.revokeObjectURL(url)
    }

    const periodLabel = useMemo(() =>
        `${format(dateRange.start, 'yyyy.MM.dd (eee)', { locale: ko })} ~ ${format(dateRange.end, 'yyyy.MM.dd (eee)', { locale: ko })}`
        , [dateRange])

    // 사용된 시간 구간 목록 (데이터에 존재하는 것만)
    const activeBuckets = useMemo(() => {
        if (!stats) return []
        const bucketSet = new Set<number>()
        stats.therapist_duration_breakdown.forEach(t => {
            Object.keys(t.durations).forEach(k => {
                if (t.durations[Number(k)] > 0) bucketSet.add(Number(k))
            })
        })
        return [...DURATION_BUCKETS, 0].filter(b => bucketSet.has(b))
    }, [stats])

    // 시간대별 최대값
    const maxHourCount = useMemo(() =>
        Math.max(...(stats?.time_distribution.map(t => t.count) || [1]), 1)
        , [stats])

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
        <div className="flex flex-col md:flex-row h-full overflow-hidden">
            {/* ── 모바일: 상단 치료사 필터 (가로 스크롤) ── */}
            {isMobile && (
                <div className="flex-shrink-0 bg-white border-b border-gray-100 px-3 py-2 overflow-x-auto scrollbar-hide">
                    <div className="flex gap-1.5 min-w-max">
                        <button
                            onClick={() => setSelectedTherapistId(null)}
                            className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold transition-all whitespace-nowrap ${!selectedTherapistId
                                ? 'bg-blue-600 text-white'
                                : 'bg-gray-100 text-gray-600'
                                }`}
                        >
                            전체
                        </button>
                        {profiles?.map((p: Profile) => (
                            <button
                                key={p.id}
                                onClick={() => setSelectedTherapistId(p.id)}
                                className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold transition-all whitespace-nowrap ${selectedTherapistId === p.id
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-gray-100 text-gray-600'
                                    }`}
                            >
                                {p.full_name || p.name}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* ── 데스크톱: 좌측 치료사 사이드바 ── */}
            {!isMobile && (
                <aside className="w-44 flex-shrink-0 bg-white border-r border-gray-100 flex flex-col overflow-y-auto">
                    <div className="p-4 border-b border-gray-100">
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider">치료사</p>
                    </div>
                    <div className="p-2 flex flex-col gap-1 flex-1">
                        <button
                            onClick={() => setSelectedTherapistId(null)}
                            className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold transition-all text-left ${!selectedTherapistId
                                ? 'bg-blue-600 text-white shadow-sm'
                                : 'text-gray-600 hover:bg-gray-50'
                                }`}
                        >
                            <User className="w-3.5 h-3.5 flex-shrink-0" />
                            전체
                        </button>
                        {profiles?.map((p: Profile) => (
                            <div key={p.id} className="relative group/item">
                                <button
                                    onClick={() => setSelectedTherapistId(p.id)}
                                    className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold transition-all text-left w-full ${selectedTherapistId === p.id
                                        ? 'bg-blue-600 text-white shadow-sm'
                                        : 'text-gray-600 hover:bg-gray-50'
                                        }`}
                                >
                                    <User className="w-3.5 h-3.5 flex-shrink-0" />
                                    <span className="truncate flex-1">{p.full_name || p.name}</span>
                                    {p.incentive_percentage != null && p.incentive_percentage > 0 && (
                                        <span className={`text-[9px] px-1.5 py-0.5 rounded-md ${selectedTherapistId === p.id ? 'bg-white/20 text-white' : 'bg-green-100 text-green-700'}`}>
                                            {p.incentive_percentage}%
                                        </span>
                                    )}
                                </button>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        setEditingIncentiveId(p.id)
                                        setIncentiveValue(p.incentive_percentage?.toString() || '0')
                                    }}
                                    className="absolute right-1 top-1/2 -translate-y-1/2 p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg opacity-0 group-hover/item:opacity-100 transition-all z-10"
                                >
                                    <Settings className="w-3.5 h-3.5" />
                                </button>

                                {/* 인센티브 설정 팝오버 (간이) */}
                                {editingIncentiveId === p.id && (
                                    <div className="absolute left-full top-0 ml-2 bg-white p-3 rounded-xl shadow-xl border border-gray-100 w-48 z-50 animate-in fade-in zoom-in duration-200" onClick={e => e.stopPropagation()}>
                                        <h4 className="text-xs font-black text-gray-900 mb-2 flex items-center gap-1">
                                            <BadgePercent className="w-3.5 h-3.5 text-blue-600" />
                                            인센티브 비율 설정
                                        </h4>
                                        <div className="flex items-center gap-2 mb-2">
                                            <input
                                                autoFocus
                                                type="number"
                                                value={incentiveValue}
                                                onChange={e => setIncentiveValue(e.target.value)}
                                                className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs font-bold outline-none focus:border-blue-500"
                                                placeholder="%"
                                            />
                                            <span className="text-xs font-bold text-gray-500">%</span>
                                        </div>
                                        <div className="flex gap-1">
                                            <button
                                                onClick={() => setEditingIncentiveId(null)}
                                                className="flex-1 py-1.5 bg-gray-50 text-gray-500 rounded-lg text-[10px] font-bold hover:bg-gray-100"
                                            >
                                                취소
                                            </button>
                                            <button
                                                onClick={() => handleUpdateIncentive(p.id)}
                                                className="flex-1 py-1.5 bg-blue-600 text-white rounded-lg text-[10px] font-bold hover:bg-blue-700"
                                            >
                                                저장
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </aside>
            )}

            {/* ── 메인 콘텐츠 ── */}
            <main className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 md:space-y-6">
                {/* 헤더 */}
                <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-start">
                    <div>
                        <h1 className="text-xl md:text-2xl font-black text-gray-900">통계 대시보드</h1>
                        <p className="text-xs text-gray-400 mt-0.5 font-medium">{periodLabel}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                        {/* 기간 탭 */}
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

                        {period === 'custom' && (
                            <div className="flex items-center gap-2">
                                <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)}
                                    className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none" />
                                <span className="text-gray-400 text-xs">~</span>
                                <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)}
                                    className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none" />
                            </div>
                        )}

                        <button onClick={handleExport}
                            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 font-bold text-xs text-blue-600 transition-all shadow-sm">
                            <Download className="w-3.5 h-3.5" />
                            CSV
                        </button>
                    </div>
                </div>

                {/* 기간 내비게이션 */}
                {(period === 'month' || period === 'week') && (
                    <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
                        {period === 'month' && (
                            <div className="flex flex-col gap-3">
                                <div className="flex items-center justify-center gap-4">
                                    <button onClick={() => setViewDate(subYears(viewDate, 1))} className="p-1 hover:bg-gray-100 rounded-full">
                                        <ChevronLeft className="w-4 h-4 text-gray-500" />
                                    </button>
                                    <span className="text-sm font-black text-gray-900">{format(viewDate, 'yyyy년')}</span>
                                    <button onClick={() => setViewDate(addYears(viewDate, 1))} className="p-1 hover:bg-gray-100 rounded-full">
                                        <ChevronRight className="w-4 h-4 text-gray-500" />
                                    </button>
                                </div>
                                <div className="grid grid-cols-6 sm:grid-cols-12 gap-1">
                                    {Array.from({ length: 12 }, (_, i) => i).map(m => (
                                        <button key={m} onClick={() => setViewDate(setMonth(viewDate, m))}
                                            className={`py-2 rounded-lg text-xs font-bold transition-all ${viewDate.getMonth() === m ? 'bg-blue-600 text-white' : 'bg-gray-50 text-gray-500 hover:bg-gray-100'}`}>
                                            {m + 1}월
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                        {period === 'week' && (
                            <div className="flex flex-col gap-3">
                                <div className="flex items-center justify-center gap-4">
                                    <button onClick={() => setViewDate(subMonths(viewDate, 1))} className="p-1 hover:bg-gray-100 rounded-full">
                                        <ChevronLeft className="w-4 h-4 text-gray-500" />
                                    </button>
                                    <span className="text-sm font-black text-gray-900">{format(viewDate, 'yyyy년 M월')}</span>
                                    <button onClick={() => setViewDate(addMonths(viewDate, 1))} className="p-1 hover:bg-gray-100 rounded-full">
                                        <ChevronRight className="w-4 h-4 text-gray-500" />
                                    </button>
                                </div>
                                <div className="flex justify-center gap-2">
                                    {weeksInMonth.map((ws, idx) => (
                                        <button key={idx} onClick={() => setSelectedWeekIndex(idx)}
                                            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${selectedWeekIndex === idx ? 'bg-blue-600 text-white' : 'bg-gray-50 text-gray-500 hover:bg-gray-100'}`}>
                                            {idx + 1}주
                                            <span className="block text-[10px] opacity-70 font-normal">{format(ws, 'M.d')}~</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* 요약 카드 */}
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
                    <SummaryCard
                        className="col-span-2"
                        icon={<CircleDollarSign className="w-5 h-5" />}
                        label="총 매출"
                        value={stats.summary.total_revenue?.toLocaleString() ?? 0} unit="원"
                        iconBg="bg-indigo-50" iconColor="text-indigo-600" valueColor="text-indigo-600"
                    />
                    <SummaryCard
                        compact
                        icon={<Calendar className="w-3.5 h-3.5" />}
                        label="총 예약"
                        value={stats.summary.total_reservations} unit="건"
                        iconBg="bg-blue-50" iconColor="text-blue-600"
                    />
                    <SummaryCard
                        compact
                        icon={<CheckCircle2 className="w-3.5 h-3.5" />}
                        label="완료"
                        value={stats.summary.completed_reservations} unit="건"
                        iconBg="bg-green-50" iconColor="text-green-600" valueColor="text-green-600"
                    />
                    <SummaryCard
                        compact
                        icon={<TrendingUp className="w-3.5 h-3.5" />}
                        label="예정"
                        value={stats.summary.pending_reservations} unit="건"
                        iconBg="bg-sky-50" iconColor="text-sky-600" valueColor="text-sky-600"
                    />
                    <SummaryCard
                        compact
                        icon={<XCircle className="w-3.5 h-3.5" />}
                        label="취소"
                        value={stats.summary.cancelled_reservations} unit="건"
                        iconBg="bg-gray-100" iconColor="text-gray-500"
                    />
                    <SummaryCard
                        compact
                        icon={<AlertTriangle className="w-3.5 h-3.5" />}
                        label="노쇼"
                        value={stats.summary.noshow_reservations} unit={`건 (${stats.summary.noshow_rate}%)`}
                        iconBg="bg-red-50" iconColor="text-red-500" valueColor="text-red-500"
                    />
                    <SummaryCard
                        compact
                        icon={<UserPlus className="w-3.5 h-3.5" />}
                        label="신규 환자"
                        value={stats.summary.new_patients} unit="명"
                        iconBg="bg-purple-50" iconColor="text-purple-600" valueColor="text-purple-600"
                    />
                </div>

                {/* 치료사별 치료시간 매트릭스 */}
                {stats.therapist_duration_breakdown.length > 0 && activeBuckets.length > 0 && (
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                        <div className="p-5 border-b border-gray-100 flex items-center justify-between">
                            <div>
                                <h3 className="text-sm font-black text-gray-900">치료사별 치료시간 실적</h3>
                                <p className="text-[10px] text-gray-400 mt-0.5">치료 시간 구간별 예약 건수</p>
                            </div>
                            {/* 범례 */}
                            <div className="flex items-center gap-2 flex-wrap justify-end">
                                {activeBuckets.map(b => (
                                    <span key={b} className={`text-[10px] font-black px-2 py-0.5 rounded-full ${BUCKET_COLORS[b]}`}>
                                        {BUCKET_LABELS[b]}
                                    </span>
                                ))}
                            </div>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead>
                                    <tr className="bg-gray-50/80 border-b border-gray-100">
                                        <th className="px-5 py-3 text-[10px] font-black text-gray-400 uppercase tracking-wider w-32">치료사</th>
                                        {activeBuckets.map(b => (
                                            <th key={b} className="px-4 py-3 text-[10px] font-black text-gray-400 uppercase tracking-wider text-center">
                                                {BUCKET_LABELS[b]}
                                            </th>
                                        ))}
                                        <th className="px-4 py-3 text-[10px] font-black text-gray-400 uppercase tracking-wider text-center">합계</th>
                                        <th className="px-5 py-3 text-[10px] font-black text-gray-400 uppercase tracking-wider text-center">완료</th>
                                        <th className="px-5 py-3 text-[10px] font-black text-gray-400 uppercase tracking-wider text-center">매출/인센티브</th>
                                        <th className="px-5 py-3 text-[10px] font-black text-gray-400 uppercase tracking-wider text-center">노쇼</th>
                                        <th className="px-5 py-3 text-[10px] font-black text-gray-400 uppercase tracking-wider text-center">신규환자</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {stats.therapist_duration_breakdown.map(t => {
                                        const perf = stats.therapist_performance.find(p => p.therapist_id === t.therapist_id)
                                        const rowTotal = activeBuckets.reduce((s, b) => s + (t.durations[b] || 0), 0)
                                        const maxInRow = Math.max(...activeBuckets.map(b => t.durations[b] || 0), 1)
                                        return (
                                            <tr key={t.therapist_id} className="hover:bg-blue-50/20 transition-colors">
                                                <td className="px-5 py-4">
                                                    <span className="font-black text-sm text-gray-900">{t.therapist_name}</span>
                                                </td>
                                                {activeBuckets.map(b => {
                                                    const cnt = t.durations[b] || 0
                                                    const intensity = rowTotal > 0 ? cnt / maxInRow : 0
                                                    return (
                                                        <td key={b} className="px-4 py-4 text-center">
                                                            {cnt > 0 ? (
                                                                <div className="flex flex-col items-center gap-1">
                                                                    <div
                                                                        className="w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm transition-all"
                                                                        style={{
                                                                            backgroundColor: `${BUCKET_BAR_COLORS[b]}${Math.round(intensity * 0.85 * 255).toString(16).padStart(2, '0')}`,
                                                                            color: intensity > 0.5 ? '#fff' : BUCKET_BAR_COLORS[b],
                                                                        }}
                                                                    >
                                                                        {cnt}
                                                                    </div>
                                                                </div>
                                                            ) : (
                                                                <span className="text-gray-200 font-bold text-sm">—</span>
                                                            )}
                                                        </td>
                                                    )
                                                })}
                                                <td className="px-4 py-4 text-center">
                                                    <span className="font-black text-sm text-gray-700">{rowTotal}</span>
                                                </td>
                                                <td className="px-5 py-4 text-center">
                                                    <span className="font-black text-sm text-green-600">{perf?.completed_appointments ?? 0}</span>
                                                </td>
                                                <td className="px-5 py-4 text-center">
                                                    <div className="flex flex-col items-center">
                                                        <span className="font-black text-xs text-gray-900">{(perf?.revenue || 0).toLocaleString()}원</span>
                                                        {perf?.incentive_rate && perf.incentive_rate > 0 ? (
                                                            <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
                                                                {perf.incentive_rate}% ➜ {(perf.incentive || 0).toLocaleString()}원
                                                            </span>
                                                        ) : (
                                                            <span className="text-[10px] text-gray-300">-</span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-5 py-4 text-center">
                                                    <span className="font-black text-sm text-red-500">{perf?.noshow_appointments ?? 0}</span>
                                                </td>
                                                <td className="px-5 py-4 text-center">
                                                    <span className="inline-flex items-center px-2 py-0.5 bg-purple-50 text-purple-600 rounded-md text-xs font-black">
                                                        {perf?.new_patients ?? 0}명
                                                    </span>
                                                </td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* 하단 2열 그리드: 시간대별 차트 + 일별 추세 */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* 시간대별 예약 분포 - SVG 바차트 */}
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                        <h3 className="text-sm font-black text-gray-900 mb-1">시간대별 예약 분포</h3>
                        <p className="text-[10px] text-gray-400 mb-4 font-medium">06:00 ~ 23:00 예약 건수</p>
                        <div className="relative">
                            <svg viewBox={`0 0 ${18 * 28} 120`} className="w-full" style={{ height: 130 }}>
                                {stats.time_distribution.map((td, i) => {
                                    const barH = maxHourCount > 0 ? (td.count / maxHourCount) * 90 : 0
                                    const x = i * 28
                                    const y = 100 - barH
                                    return (
                                        <g key={td.hour}>
                                            <rect x={x + 3} y={y} width={22} height={barH}
                                                fill={td.count > 0 ? '#3b82f6' : '#f3f4f6'}
                                                rx={3}
                                                className="transition-all duration-500"
                                            />
                                            {td.count > 0 && (
                                                <text x={x + 14} y={y - 4} textAnchor="middle"
                                                    fontSize={9} fontWeight="bold" fill="#3b82f6">
                                                    {td.count}
                                                </text>
                                            )}
                                            <text x={x + 14} y={115} textAnchor="middle"
                                                fontSize={8} fill="#9ca3af" fontWeight="600">
                                                {td.hour}
                                            </text>
                                        </g>
                                    )
                                })}
                            </svg>
                            {/* Y축 보조선 */}
                            <div className="absolute top-0 right-0 flex flex-col justify-between h-[100px] pr-1 pointer-events-none">
                                <span className="text-[9px] text-gray-300 font-bold">{maxHourCount}</span>
                                <span className="text-[9px] text-gray-300 font-bold">0</span>
                            </div>
                        </div>
                    </div>

                    {/* 일별 예약 추세 */}
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                        <h3 className="text-sm font-black text-gray-900 mb-1">일별 예약 추세</h3>
                        <p className="text-[10px] text-gray-400 mb-4 font-medium">기간 내 일별 예약 현황</p>
                        {stats.daily_trend.length === 0 ? (
                            <div className="flex items-center justify-center h-32 text-sm text-gray-400">데이터 없음</div>
                        ) : (() => {
                            const maxTotal = Math.max(...stats.daily_trend.map(d => d.total), 1)
                            return (
                                <div className="space-y-2">
                                    {stats.daily_trend.map(day => {
                                        const totalW = (day.total / maxTotal) * 100
                                        const compW = day.total > 0 ? (day.completed / day.total) * totalW : 0
                                        return (
                                            <div key={day.date} className="flex items-center gap-3">
                                                <span className="text-[10px] font-bold text-gray-400 w-16 flex-shrink-0 text-right">{day.label}</span>
                                                <div className="flex-1 bg-gray-50 rounded-full h-5 overflow-hidden relative">
                                                    <div className="h-full bg-gradient-to-r from-green-500 to-green-400 rounded-full absolute left-0 top-0 transition-all duration-500"
                                                        style={{ width: `${compW}%` }} />
                                                    <div className="h-full bg-blue-100 rounded-full flex items-center justify-end pr-2 transition-all duration-500"
                                                        style={{ width: `${Math.max(totalW, day.total > 0 ? 8 : 0)}%` }}>
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
                                            <div className="w-3 h-3 rounded-sm bg-green-400" />
                                            <span className="text-[10px] font-bold text-gray-400">완료</span>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            <div className="w-3 h-3 rounded-sm bg-blue-100" />
                                            <span className="text-[10px] font-bold text-gray-400">전체</span>
                                        </div>
                                    </div>
                                </div>
                            )
                        })()}
                    </div>
                </div>
            </main>
        </div>
    )
}

function SummaryCard({ icon, label, value, unit, iconBg, iconColor, valueColor = 'text-gray-900', compact = false, className = '' }: {
    icon: React.ReactNode
    label: string
    value: number | string
    unit: string
    iconBg: string
    iconColor: string
    valueColor?: string
    compact?: boolean
    className?: string
}) {
    return (
        <div className={`bg-white rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow ${compact ? 'p-3' : 'p-4'} ${className}`}>
            <div className={`flex items-center gap-2 ${compact ? 'mb-1' : 'mb-2'}`}>
                <div className={`${compact ? 'w-6 h-6 rounded-md' : 'w-7 h-7 rounded-lg'} ${iconBg} ${iconColor} flex items-center justify-center`}>{icon}</div>
                <span className={`${compact ? 'text-[9px]' : 'text-[10px]'} font-black text-gray-400 uppercase tracking-wider`}>{label}</span>
            </div>
            <div className="flex items-baseline gap-1">
                <span className={`${compact ? 'text-lg' : 'text-xl'} font-black ${valueColor}`}>{value}</span>
                <span className="text-[10px] text-gray-400 font-bold">{unit}</span>
            </div>
        </div>
    )
}
