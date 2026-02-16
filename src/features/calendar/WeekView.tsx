import { DayPicker } from 'react-day-picker'
import { ko } from 'date-fns/locale'
import 'react-day-picker/style.css' // Ensure styles are available
import { useState, useEffect, useCallback, useRef } from 'react'
import { format, differenceInMinutes, addMinutes } from 'date-fns'
import { getNow, getStartOfWeekKST, addDaysKST, isSameDayKST, formatKST } from '@/lib/dateUtils'
import { useAppointments, useUpdateAppointment, useDeleteAppointment, useProfiles } from './useCalendar'
import { useAutoCompleteAppointments } from './useAutoCompleteAppointments'
import { ChevronLeft, ChevronRight, Plus, MessageSquare } from 'lucide-react'
import { clsx } from 'clsx'
import AppointmentModal from './AppointmentModal'
import { DndContext, useSensor, useSensors, MouseSensor, TouchSensor, DragOverlay } from '@dnd-kit/core'
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core'
import { DroppableSlot } from './DroppableSlot'
import { DraggableAppointment } from './DraggableAppointment'
import { DraggableAppointmentContent } from './DraggableAppointmentContent'
import type { Appointment } from '@/types/db'

import { useAuth } from '@/features/auth/AuthContext'

// --- Constants ---
const START_HOUR = 6        // 캘린더 시작 시간 06:00
const END_HOUR = 24         // 캘린더 종료 시간 24:00
const TOTAL_HOURS = END_HOUR - START_HOUR  // 총 18시간
const PX_PER_HOUR = 80      // 시간당 높이 (픽셀)
const PX_PER_MIN = PX_PER_HOUR / 60
const SNAP_MINUTES = 10     // 10분 단위 스냅
const MIN_DURATION = 30     // 최소 초기 블록 = 30분

/** 픽셀 오프셋(그리드 상단 기준)을 자정 이후 총 분(minutes)으로 변환 */
function pxToMinutes(px: number): number {
    const raw = START_HOUR * 60 + (px / PX_PER_MIN)
    // Snap to nearest 10-minute
    return Math.round(raw / SNAP_MINUTES) * SNAP_MINUTES
}

/** 자정 이후 총 분(minutes)을 그리드 상단 기준 픽셀 오프셋으로 변환 */
function minutesToPx(mins: number): number {
    return (mins - START_HOUR * 60) * PX_PER_MIN
}

// --- Types ---
type DraftSelection = {
    therapistId: string
    dayISO: string
    anchorMinutes: number   // 마우스 최초 클릭 위치 (스냅됨)
    currentMinutes: number  // 현재 마우스 위치 (스냅됨)
}

export default function WeekView() {
    const { profile } = useAuth()
    const [currentDate, setCurrentDate] = useState(getNow())
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [modalData, setModalData] = useState<{
        date: string; start_time: string; end_time?: string; therapist_id?: string
    } | null>(null)
    const [now, setNow] = useState(getNow())

    // 드래그 선택 상태
    const [draft, setDraft] = useState<DraftSelection | null>(null)
    const draftRef = useRef<DraftSelection | null>(null)
    draftRef.current = draft

    // 셀 Hover 상태: + 버튼 표시용
    const [hoverCell, setHoverCell] = useState<{
        dayISO: string
        therapistId: string
        minutes: number  // 10분 단위로 스냅된 시간 (자정 기준 분)
    } | null>(null)

    // 리사이즈 실시간 상태
    const [resizingState, setResizingState] = useState<{
        appointmentId: string
        deltaMinutes: number
        position: 'top' | 'bottom'
    } | null>(null)

    // 상세 / 삭제 상태
    const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null)
    const [editingAppointment, setEditingAppointment] = useState<Appointment | null>(null)
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
    const [activeAppointment, setActiveAppointment] = useState<Appointment | null>(null)
    const deleteMutation = useDeleteAppointment()

    // 치료사 필터 (같은 시스템 소속만)
    const { data: profiles } = useProfiles(profile?.system_id)
    const [selectedTherapistIds, setSelectedTherapistIds] = useState<string[]>([])

    const { data: appointments, isLoading } = useAppointments(currentDate)
    useAutoCompleteAppointments(appointments)
    const updateMutation = useUpdateAppointment()

    useEffect(() => {
        if (profiles && selectedTherapistIds.length === 0) {
            // 로그인한 사용자 본인이 목록에 있다면 본인만 선택
            const myProfile = profiles.find((p: { id: string }) => p.id === profile?.id)
            if (myProfile) {
                setSelectedTherapistIds([myProfile.id])
            } else {
                // 본인이 없다면 (관리자 등) 전체 선택
                setSelectedTherapistIds(profiles.map((p: { id: string }) => p.id))
            }
        }
    }, [profiles, profile?.id])

    useEffect(() => {
        const timer = setInterval(() => setNow(getNow()), 60000)
        return () => clearInterval(timer)
    }, [])

    const sensors = useSensors(
        useSensor(MouseSensor, { activationConstraint: { distance: 10 } }),
        useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
    )

    const weekStart = getStartOfWeekKST(currentDate)
    const weekDays = Array.from({ length: 7 }).map((_, i) => addDaysKST(weekStart, i))
    const timeSlots = Array.from({ length: TOTAL_HOURS }).map((_, i) => START_HOUR + i)

    const activeTherapists = profiles?.filter((p: { id: string }) => selectedTherapistIds.includes(p.id)) || []

    const handlePrevWeek = () => setCurrentDate(addDaysKST(currentDate, -7))
    const handleNextWeek = () => setCurrentDate(addDaysKST(currentDate, 7))
    const handleToday = () => setCurrentDate(getNow())

    // ──────────────────────────────
    // ──────────────────────────────
    // 드래그 생성: 마우스 핸들러
    // ──────────────────────────────

    /** 치료사 컬럼 그리드 내부에서 mousedown 발생 시 호출 */
    const handleGridMouseDown = useCallback((
        dayISO: string,
        therapistId: string,
        e: React.MouseEvent<HTMLDivElement>
    ) => {
        // 좌클릭만 허용
        if (e.button !== 0) return

        // 기존 예약 카드 위 클릭 시 드래그 생성 건너뜀
        const target = e.target as HTMLElement
        if (target.closest('[data-appointment]')) return

        e.preventDefault()

        const rect = e.currentTarget.getBoundingClientRect()
        const offsetY = e.clientY - rect.top
        const anchorMinutes = pxToMinutes(offsetY)

        setDraft({
            therapistId,
            dayISO,
            anchorMinutes,
            currentMinutes: anchorMinutes + MIN_DURATION, // Start with 30-min block
        })
    }, [])

    /** 치료사 컬럼 그리드 내부에서 mousemove 발생 시 호출 */
    const handleGridMouseMove = useCallback((
        dayISO: string,
        therapistId: string,
        e: React.MouseEvent<HTMLDivElement>
    ) => {
        const d = draftRef.current
        if (!d || d.dayISO !== dayISO || d.therapistId !== therapistId) return

        const rect = e.currentTarget.getBoundingClientRect()
        const offsetY = e.clientY - rect.top
        const rawMinutes = pxToMinutes(offsetY)

        // 최소 30분 기간 보장
        const diff = rawMinutes - d.anchorMinutes
        let currentMinutes: number
        if (diff >= 0) {
            // 아래로 드래그: 시작점으로부터 최소 30분 보장
            currentMinutes = Math.max(rawMinutes, d.anchorMinutes + MIN_DURATION)
        } else {
            // 위로 드래그: 시작점보다 최소 30분 전 보장
            currentMinutes = Math.min(rawMinutes, d.anchorMinutes - MIN_DURATION)
        }

        // 그리드 범위 내로 제한
        currentMinutes = Math.max(START_HOUR * 60, Math.min(END_HOUR * 60, currentMinutes))

        setDraft(prev => prev ? { ...prev, currentMinutes } : null)
    }, [])

    /** 어디서든(window) mouseup 발생 시 호출 */
    const handleMouseUp = useCallback(() => {
        const d = draftRef.current
        if (!d) return

        const startMins = Math.min(d.anchorMinutes, d.currentMinutes)
        const endMins = Math.max(d.anchorMinutes, d.currentMinutes)

        const sH = Math.floor(startMins / 60)
        const sM = startMins % 60
        const eH = Math.floor(endMins / 60)
        const eM = endMins % 60

        // dayISO는 이미 'yyyy-MM-dd' 형식
        const dayStr = d.dayISO

        setModalData({
            date: dayStr,
            start_time: `${sH.toString().padStart(2, '0')}:${sM.toString().padStart(2, '0')}`,
            end_time: `${eH.toString().padStart(2, '0')}:${eM.toString().padStart(2, '0')}`,
            therapist_id: d.therapistId,
        })
        setIsModalOpen(true)
        setDraft(null)
    }, [])

    useEffect(() => {
        window.addEventListener('mouseup', handleMouseUp)
        return () => window.removeEventListener('mouseup', handleMouseUp)
    }, [handleMouseUp])

    // DnD (이동)
    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over, delta } = event

        // 이동 (Move)
        if (over && active.data.current) {
            const appointment = active.data.current as Appointment
            const [dateStr, hourStr, therapistId] = (over.id as string).split('|')

            // 기존 로직: 드롭된 '시간 슬롯(Start Hour)' 기준
            // 개선 로직: delta.y를 사용하여 '분' 단위 디테일 계산

            // 드롭된 슬롯의 시작 시간
            const slotStartTime = new Date(dateStr)
            slotStartTime.setHours(parseInt(hourStr), 0, 0, 0)

            // 드래그 전 원래 시작 시간 (KST 기준 분/초 유지 필요?)
            // active.data.current는 DB 데이터.
            const originalStart = new Date(appointment.start_time)
            // DragStart 시점의 상대적 오프셋을 알면 좋겠지만, 
            // 여기서는 '새로운 슬롯' + '10분 단위 스냅'으로 근사 계산

            // 그러나 over.id는 '마우스가 위치한 슬롯'임.
            // 정확한 배치를 위해 delta를 사용하거나, over 위에서의 상대 위치를 계산해야 함.
            // dnd-kit는 over에서의 위치를 직접 주진 않음.

            // 간단한 접근:
            // "슬롯의 시작 + (드래그한 거리 % 슬롯높이)?" -> 복잡함.

            // 대안: 
            // 1. Appointment의 원래 시작 시간에서 delta.y 만큼 더함.
            // 2. 10분 단위 스냅.
            // 3. Therapist/Day는 over.id를 참고.

            // 이동한 분(Minute) 변화량 (10분 스냅)
            const moveMinutes = Math.round(delta.y / PX_PER_MIN / SNAP_MINUTES) * SNAP_MINUTES

            // 날짜/치료사 변경 여부 확인
            const isDayChanged = !isSameDayKST(originalStart, slotStartTime)
            const isTherapistChanged = appointment.therapist_id !== therapistId

            let newStartDate: Date

            if (isDayChanged || isTherapistChanged) {
                // 날짜나 치료사가 바뀌면, 해당 슬롯의 정각(00분) + 원래 분(minute)으로 일단 이동 후 delta 적용?
                // 아니면 그냥 Drop된 슬롯(Hour)의 00분으로 맞추고 분만 유지?

                // 사용자가 '06:30' 슬롯에 드롭했다면?
                // over.id는 '06'. 
                // 정확한 분을 알기 어려움.

                // 따라서 '10분 단위 이동'을 위해서는 Grid Mouse Event방식(handleMouseUp)이 가장 정확하지만,
                // Draggable은 dnd-kit이므로 delta를 쓰는게 맞음.

                // delta를 쓰면 '화면 상의 이동 거리'이므로, 날짜가 바뀌어도 y축 이동량은 유효함(같은 주간 뷰).
                newStartDate = addMinutes(originalStart, moveMinutes)

                // 단, 날짜(Day)가 바뀌었다면 년월일 부분은 over된 날짜로 교체해야 함.
                // (WeekView는 가로로 요일이 배치됨. x축 이동 -> 날짜 변경)

                // 날짜 변경 로직:
                // newStartDate의 '시간'은 유지하되 '날짜'만 변경
                // 복잡하므로, over된 날짜(slotStartTime)의 년월일 + newStartDate의 시분초 사용? No.

                // 전략:
                // 1. y축 이동 -> 시간 변경 (분 단위)
                // 2. over된 컬럼 -> 날짜/치료사 변경

                // originalStart + moveMinutes (시간 변경)
                const tempDate = addMinutes(originalStart, moveMinutes)

                // over된 날짜(slotStartTime)의 년-월-일 적용
                newStartDate = new Date(slotStartTime)
                newStartDate.setHours(tempDate.getHours(), tempDate.getMinutes(), 0, 0)

            } else {
                // 같은 날, 같은 치료사 -> 단순히 시간만 변경
                newStartDate = addMinutes(originalStart, moveMinutes)
            }

            // Snap to 10 minutes (redundant but safe)
            const minutes = newStartDate.getMinutes()
            const snappedMinutes = Math.round(minutes / SNAP_MINUTES) * SNAP_MINUTES
            newStartDate.setMinutes(snappedMinutes, 0, 0)

            const duration = differenceInMinutes(new Date(appointment.end_time), new Date(appointment.start_time))
            const newEndDate = addMinutes(newStartDate, duration)

            // 유효성 체크 (Start Hour ~ End Hour)
            if (newStartDate.getHours() < START_HOUR || newEndDate.getHours() >= END_HOUR + (newEndDate.getMinutes() > 0 ? 1 : 0)) {
                // 범위 밖이면 무시 or 클램핑? 무시가 안전.
                return
            }

            updateMutation.mutate({
                id: appointment.id,
                updates: {
                    start_time: newStartDate.toISOString(),
                    end_time: newEndDate.toISOString(),
                    therapist_id: therapistId,
                    version: appointment.version,
                },
            })
        }
    }

    // ──────────────────────────────
    // 리사이즈 콜백 (네이티브 포인터 이벤트 기반)
    // ──────────────────────────────
    const handleResizeEnd = useCallback((appointment: Appointment, deltaMinutes: number, position: 'top' | 'bottom') => {
        if (deltaMinutes === 0) return

        let newStartTime = new Date(appointment.start_time)
        let newEndTime = new Date(appointment.end_time)

        if (position === 'top') {
            newStartTime = addMinutes(newStartTime, deltaMinutes)
        } else {
            newEndTime = addMinutes(newEndTime, deltaMinutes)
        }

        const newDuration = differenceInMinutes(newEndTime, newStartTime)
        if (newDuration < 10) return
        if (newStartTime >= newEndTime) return

        updateMutation.mutate({
            id: appointment.id,
            updates: {
                start_time: newStartTime.toISOString(),
                end_time: newEndTime.toISOString(),
                version: appointment.version,
            },
        })
    }, [appointments, updateMutation])

    // Ghost overlay geometry
    const ghostForColumn = useCallback((dayISO: string, therapistId: string) => {
        if (!draft || draft.dayISO !== dayISO || draft.therapistId !== therapistId) return null

        const startMins = Math.min(draft.anchorMinutes, draft.currentMinutes)
        const endMins = Math.max(draft.anchorMinutes, draft.currentMinutes)
        const durationMins = endMins - startMins

        return {
            top: minutesToPx(startMins),
            height: durationMins * PX_PER_MIN,
            durationMins,
        }
    }, [draft])

    if (isLoading) {
        return (
            <div className="flex h-full items-center justify-center font-black text-blue-600 animate-pulse">
                LOADING CALENDAR...
            </div>
        )
    }

    return (
        <div className="flex h-[calc(100vh-64px)] overflow-hidden bg-white font-sans text-gray-900">
            {/* ── SIDEBAR ── */}
            <div className="w-[280px] flex-none border-r bg-white p-4 flex flex-col gap-6 overflow-y-auto hidden lg:flex">
                {/* Mini Calendar */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex justify-center">
                    <DayPicker
                        mode="single"
                        selected={currentDate}
                        onSelect={(date) => date && setCurrentDate(date)}
                        locale={ko}
                        showOutsideDays
                        fixedWeeks
                        modifiers={{
                            booked: (date) => appointments?.some(app => isSameDayKST(new Date(app.start_time), date)) ?? false
                        }}
                        modifiersClassNames={{
                            booked: 'relative after:content-[""] after:absolute after:bottom-1 after:left-1/2 after:-translate-x-1/2 after:w-1 after:h-1 after:bg-blue-400 after:rounded-full after:opacity-70'
                        }}
                        formatters={{
                            formatCaption: (date) => format(date, 'yyyy년 M월', { locale: ko }),
                        }}
                        classNames={{
                            root: 'w-full',
                            months: 'flex flex-col',
                            month: 'space-y-4',
                            caption: 'flex justify-center pt-2 relative items-center mb-4',
                            caption_label: 'text-base font-black text-gray-800 tracking-tight',
                            nav: 'space-x-1 flex items-center absolute right-0',
                            nav_button: 'h-6 w-6 bg-transparent hover:bg-gray-50 p-0.5 rounded-md transition-colors text-gray-400 hover:text-gray-900',
                            nav_button_previous: 'absolute left-0',
                            nav_button_next: 'absolute right-0',
                            table: 'w-full border-collapse space-y-1',
                            head_row: 'flex justify-center mb-2 gap-1',
                            head_cell: 'text-gray-400 w-8 font-medium text-[0.75rem] uppercase tracking-wider',
                            row: 'flex w-full mt-1 justify-center gap-1',
                            cell: 'text-center text-sm p-0 relative focus-within:relative focus-within:z-20',
                            day: 'h-8 w-8 p-0 font-medium text-gray-600 aria-selected:opacity-100 hover:bg-gray-50 rounded-full transition-all text-xs',
                            day_selected: 'bg-gray-900 !text-white hover:!bg-gray-800 font-bold shadow-md shadow-gray-200 after:bg-white',
                            day_today: 'text-blue-600 font-black bg-blue-50',
                            day_outside: 'text-gray-300 opacity-30',
                            day_disabled: 'text-gray-300 opacity-30',
                            day_hidden: 'invisible',
                        }}
                    />
                </div>

                {/* Therapist Legend / Filter could go here */}
                <div>
                    <h3 className="text-xs font-black text-gray-400 uppercase tracking-wider mb-3 px-2">Therapists</h3>
                    <div className="space-y-1">
                        {profiles?.map((p: { id: string; full_name?: string; name?: string }) => (
                            <button
                                key={p.id}
                                onClick={() =>
                                    setSelectedTherapistIds(prev =>
                                        prev.includes(p.id) ? prev.filter(id => id !== p.id) : [...prev, p.id],
                                    )
                                }
                                className={clsx(
                                    'w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-bold transition-all text-left',
                                    selectedTherapistIds.includes(p.id)
                                        ? 'bg-blue-50 text-blue-700'
                                        : 'text-gray-500 hover:bg-gray-50'
                                )}
                            >
                                <div className={clsx(
                                    "w-2.5 h-2.5 rounded-full transition-all",
                                    selectedTherapistIds.includes(p.id) ? "bg-blue-500 ring-2 ring-blue-200" : "bg-gray-300"
                                )} />
                                {p.full_name || p.name}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* ── MAIN CONTENT (Header + Grid) ── */}
            <div className="flex-1 flex flex-col min-w-0 bg-white relative">
                {/* ── HEADER ── */}
                <div className="flex flex-col border-b bg-white z-20">
                    <div className="flex items-center justify-between p-4 px-6">
                        <div className="flex items-center gap-8">
                            <div className="flex flex-col">

                                <div className="flex items-center gap-4">
                                    <button
                                        onClick={handleToday}
                                        className="px-4 py-1.5 text-xs font-black text-gray-700 bg-white border border-gray-200 rounded-full hover:bg-gray-50 hover:border-gray-300 transition-all active:scale-95 shadow-sm"
                                    >
                                        오늘
                                    </button>
                                    <div className="flex items-center gap-2">
                                        <div className="flex items-center gap-0.5">
                                            <button onClick={handlePrevWeek} className="p-1.5 hover:bg-gray-100 rounded-full transition-all active:scale-90 text-gray-400 hover:text-gray-900">
                                                <ChevronLeft className="w-5 h-5" strokeWidth={2.5} />
                                            </button>
                                            <button onClick={handleNextWeek} className="p-1.5 hover:bg-gray-100 rounded-full transition-all active:scale-90 text-gray-400 hover:text-gray-900">
                                                <ChevronRight className="w-5 h-5" strokeWidth={2.5} />
                                            </button>
                                        </div>
                                        <h2 className="text-2xl font-black text-gray-900 tracking-tighter ml-1">
                                            {formatKST(currentDate, 'yyyy년 M월')}
                                        </h2>
                                    </div>
                                </div>
                            </div>

                            {/* Therapist Filter removed (moved to Sidebar) */}
                        </div>
                    </div>
                </div>

                {/* ── GRID ── */}
                <DndContext
                    sensors={sensors}
                    onDragStart={(event: DragStartEvent) => {
                        if (event.active.data.current) {
                            setActiveAppointment(event.active.data.current as Appointment)
                        }
                    }}
                    onDragEnd={(event) => {
                        handleDragEnd(event)
                        setActiveAppointment(null)
                    }}
                    onDragCancel={() => setActiveAppointment(null)}
                >
                    <div className="flex-1 overflow-auto flex bg-[#F0F4F8] relative scrollbar-hide select-none">
                        {/* Time Axis (sticky left) */}
                        <div className="w-20 flex-none border-r bg-white/90 backdrop-blur-xl sticky left-0 z-30 pt-[96px]">
                            <div className="relative" style={{ height: `${TOTAL_HOURS * PX_PER_HOUR}px` }}>
                                {timeSlots.map(hour => {
                                    const period = hour < 12 ? 'AM' : 'PM'
                                    const h = hour > 12 ? hour - 12 : hour
                                    return (
                                        <div
                                            key={hour}
                                            className="absolute w-full flex justify-center transform -translate-y-5"
                                            style={{ top: `${(hour - START_HOUR) * PX_PER_HOUR}px` }}
                                        >
                                            <span className="text-[11px] font-bold text-gray-400 bg-white/90 px-1 rounded z-10">
                                                {`${period} ${h}시`}
                                            </span>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>

                        {/* Day Columns */}
                        <div className="flex flex-1 min-w-max relative">
                            {/* Now Line (KST) - Spans entire week if today is in view */}
                            {weekDays.some(d => isSameDayKST(d, now)) && (() => {
                                const nowH = parseInt(formatKST(now, 'H'))
                                return nowH >= START_HOUR && nowH < END_HOUR
                            })() && (
                                    <div
                                        className="absolute left-0 right-0 z-40 pointer-events-none"
                                        style={{
                                            // 64px (DayHeader h-16) + 32px (SubHeader) = 96px offset
                                            top: `${96 + (parseInt(formatKST(now, 'H')) - START_HOUR) * PX_PER_HOUR + (parseInt(formatKST(now, 'm')) / 60) * PX_PER_HOUR}px`,
                                        }}
                                    >
                                        <div className="h-0.5 bg-red-600 w-full relative shadow-[0_0_4px_rgba(220,38,38,0.5)]">
                                            <div className="absolute -left-1.5 -top-1 w-2.5 h-2.5 bg-red-600 rounded-full ring-2 ring-white" />
                                        </div>
                                    </div>
                                )}
                            {weekDays.map(day => {
                                const isToday = isSameDayKST(day, now)
                                const dayISO = formatKST(day, 'yyyy-MM-dd')

                                return (
                                    <div
                                        key={dayISO}
                                        className={clsx(
                                            'flex flex-col border-r border-gray-200/50',
                                            isToday ? 'bg-blue-50/30' : 'bg-white/50',
                                        )}
                                    >
                                        {/* Day Header */}
                                        <div
                                            className="h-16 flex flex-col items-center justify-center border-b sticky top-0 z-30 bg-white/95 backdrop-blur-sm"
                                        >
                                            <span className={clsx(
                                                "text-[11px] font-bold",
                                                isToday ? 'text-blue-600' : 'text-gray-400'
                                            )}>
                                                {formatKST(day, 'EEE')}
                                            </span>
                                            <span className={clsx(
                                                "text-xl font-black leading-none w-9 h-9 flex items-center justify-center",
                                                isToday
                                                    ? 'bg-blue-600 text-white rounded-full'
                                                    : 'text-gray-800'
                                            )}>
                                                {formatKST(day, 'd')}
                                            </span>
                                        </div>

                                        {/* Therapist Columns */}
                                        <div className="flex relative h-full">

                                            {activeTherapists.map((therapist: { id: string; full_name?: string; name?: string }) => {
                                                const ghost = ghostForColumn(dayISO, therapist.id)

                                                return (
                                                    <div
                                                        key={therapist.id}
                                                        className="w-[120px] border-r border-gray-100 relative"
                                                    >
                                                        {/* Therapist sub-header */}
                                                        <div className="h-8 flex items-center justify-center bg-white/60 border-b border-gray-100 text-[10px] font-black text-gray-400">
                                                            {therapist.full_name || therapist.name}
                                                        </div>

                                                        {/* The actual time grid - mousemove tracked here */}
                                                        <div
                                                            className="relative"
                                                            style={{ height: `${TOTAL_HOURS * PX_PER_HOUR}px` }}
                                                            onMouseDown={e => handleGridMouseDown(dayISO, therapist.id, e)}
                                                            onMouseMove={e => {
                                                                handleGridMouseMove(dayISO, therapist.id, e)
                                                                // Hover 시 + 버튼 위치 계산 (드래그 중이 아닐 때만)
                                                                if (!draftRef.current) {
                                                                    const rect = e.currentTarget.getBoundingClientRect()
                                                                    const offsetY = e.clientY - rect.top
                                                                    const snappedMinutes = pxToMinutes(offsetY)
                                                                    setHoverCell({ dayISO, therapistId: therapist.id, minutes: snappedMinutes })
                                                                }
                                                            }}
                                                            onMouseLeave={() => setHoverCell(null)}
                                                        >
                                                            {/* Hour-grid lines (visual only) */}
                                                            {timeSlots.map(hour => (
                                                                <DroppableSlot
                                                                    key={hour}
                                                                    id={`${dayISO}|${hour}|${therapist.id}`}
                                                                />
                                                            ))}

                                                            {/* Hover + Button */}
                                                            {hoverCell && !draft &&
                                                                hoverCell.dayISO === dayISO &&
                                                                hoverCell.therapistId === therapist.id && (() => {
                                                                    // 해당 위치에 이미 예약이 있는지 확인
                                                                    const hoverStart = hoverCell.minutes
                                                                    const hoverEnd = hoverStart + MIN_DURATION
                                                                    const hasConflict = appointments?.some(
                                                                        (apt: Appointment) => {
                                                                            if (apt.therapist_id !== therapist.id) return false
                                                                            if (!isSameDayKST(new Date(apt.start_time), day)) return false
                                                                            const aptStartH = parseInt(formatKST(new Date(apt.start_time), 'H'))
                                                                            const aptStartM = parseInt(formatKST(new Date(apt.start_time), 'm'))
                                                                            const aptEndH = parseInt(formatKST(new Date(apt.end_time), 'H'))
                                                                            const aptEndM = parseInt(formatKST(new Date(apt.end_time), 'm'))
                                                                            const aptStart = aptStartH * 60 + aptStartM
                                                                            const aptEnd = aptEndH * 60 + aptEndM
                                                                            return hoverStart < aptEnd && hoverEnd > aptStart
                                                                        }
                                                                    )
                                                                    if (hasConflict) return null

                                                                    return (
                                                                        <div
                                                                            className="absolute inset-x-1 z-30 flex items-center justify-center pointer-events-none"
                                                                            style={{
                                                                                top: `${minutesToPx(hoverCell.minutes)}px`,
                                                                                height: `${MIN_DURATION * PX_PER_MIN}px`,
                                                                            }}
                                                                        >
                                                                            {/* Ghost preview */}
                                                                            <div className="absolute inset-0 bg-blue-500/5 border border-blue-300/30 border-dashed rounded-lg" />
                                                                            {/* + Button */}
                                                                            <button
                                                                                className="pointer-events-auto w-7 h-7 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg hover:shadow-xl flex items-center justify-center transition-all hover:scale-110 active:scale-95"
                                                                                onMouseDown={e => e.stopPropagation()}
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation()
                                                                                    const sH = Math.floor(hoverCell.minutes / 60)
                                                                                    const sM = hoverCell.minutes % 60
                                                                                    const endMins = hoverCell.minutes + MIN_DURATION
                                                                                    const eH = Math.floor(endMins / 60)
                                                                                    const eM = endMins % 60
                                                                                    setModalData({
                                                                                        date: dayISO,
                                                                                        start_time: `${sH.toString().padStart(2, '0')}:${sM.toString().padStart(2, '0')}`,
                                                                                        end_time: `${eH.toString().padStart(2, '0')}:${eM.toString().padStart(2, '0')}`,
                                                                                        therapist_id: therapist.id,
                                                                                    })
                                                                                    setIsModalOpen(true)
                                                                                    setHoverCell(null)
                                                                                }}
                                                                            >
                                                                                <Plus className="w-4 h-4" strokeWidth={3} />
                                                                            </button>
                                                                        </div>
                                                                    )
                                                                })()}

                                                            {/* Ghost Selection Box */}
                                                            {ghost && (
                                                                <div
                                                                    className="absolute inset-x-1 bg-blue-500/15 border-2 border-blue-500 border-dashed rounded-xl z-50 pointer-events-none flex items-center justify-center overflow-hidden backdrop-blur-[1px]"
                                                                    style={{
                                                                        top: `${ghost.top}px`,
                                                                        height: `${ghost.height}px`,
                                                                    }}
                                                                >
                                                                    <div className="bg-blue-600 text-white text-[11px] font-black px-3 py-1 rounded-full shadow-lg whitespace-nowrap">
                                                                        {ghost.durationMins}분
                                                                    </div>
                                                                </div>
                                                            )}



                                                            {/* Rendered Appointments */}
                                                            {appointments
                                                                ?.filter(
                                                                    (apt: Appointment) =>
                                                                        isSameDayKST(new Date(apt.start_time), day) &&
                                                                        apt.therapist_id === therapist.id,
                                                                )
                                                                .map((apt: Appointment) => {
                                                                    const startTime = new Date(apt.start_time)
                                                                    const endTime = new Date(apt.end_time)

                                                                    // DB에 저장된 UTC를 KST 시/분으로 변환하여 위치 계산
                                                                    // formatKST는 KST 시각 문자열 반환 -> H, m 파싱
                                                                    const startH_KST = parseInt(formatKST(startTime, 'H'))
                                                                    const startM_KST = parseInt(formatKST(startTime, 'm'))

                                                                    // 리사이즈 중이면 delta 적용
                                                                    const isResizing = resizingState?.appointmentId === apt.id
                                                                    const resizeDelta = isResizing ? resizingState!.deltaMinutes : 0
                                                                    const resizePosition = isResizing ? resizingState!.position : null

                                                                    let adjustedTop =
                                                                        (startH_KST - START_HOUR) * PX_PER_HOUR +
                                                                        (startM_KST / 60) * PX_PER_HOUR

                                                                    let adjustedHeight =
                                                                        ((endTime.getTime() - startTime.getTime()) /
                                                                            (1000 * 60 * 60)) *
                                                                        PX_PER_HOUR

                                                                    if (isResizing) {
                                                                        const deltaPx = resizeDelta * PX_PER_MIN
                                                                        if (resizePosition === 'top') {
                                                                            adjustedTop += deltaPx
                                                                            adjustedHeight -= deltaPx
                                                                        } else {
                                                                            adjustedHeight += deltaPx
                                                                        }
                                                                        // 최소 높이 보장 (10분)
                                                                        adjustedHeight = Math.max(adjustedHeight, 10 * PX_PER_MIN)
                                                                    }

                                                                    return (
                                                                        <DraggableAppointment
                                                                            key={apt.id}
                                                                            appointment={apt}
                                                                            onClick={(a) => setSelectedAppointment(a)}
                                                                            onResize={(delta, pos) => setResizingState({
                                                                                appointmentId: apt.id,
                                                                                deltaMinutes: delta,
                                                                                position: pos,
                                                                            })}
                                                                            onResizeEnd={(deltaMinutes, position) => {
                                                                                setResizingState(null)
                                                                                handleResizeEnd(apt, deltaMinutes, position)
                                                                            }}
                                                                            style={{
                                                                                top: `${adjustedTop}px`,
                                                                                height: `${adjustedHeight}px`,
                                                                                position: 'absolute',
                                                                                transition: isResizing ? 'none' : undefined,
                                                                            }}
                                                                        />
                                                                    )
                                                                })}
                                                        </div>
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                    {/* Drag Overlay with Snapping */}
                    <DragOverlay
                        modifiers={[
                            // Custom Snap Modifier
                            ({ transform }) => {
                                const snapY = PX_PER_MIN * SNAP_MINUTES // 13.333px
                                return {
                                    ...transform,
                                    x: transform.x, // X축 스냅은 컬럼 이동으로 자연스럽게 처리됨 (or could snap to 120px)
                                    y: Math.round(transform.y / snapY) * snapY,
                                }
                            }
                        ]}
                        dropAnimation={{
                            duration: 150,
                            easing: 'cubic-bezier(0.18, 0.67, 0.6, 1.22)',
                        }}
                    >
                        {activeAppointment ? (
                            <DraggableAppointmentContent
                                appointment={activeAppointment}
                                isDragging
                                // DragOverlay는 Portal에 생성되므로 context가 다름.
                                // 원래 크기를 유지하려면 style 지정 필요.
                                style={{
                                    width: '120px', // Column width
                                    height: `${(differenceInMinutes(new Date(activeAppointment.end_time), new Date(activeAppointment.start_time)) / 60) * PX_PER_HOUR}px`,
                                }}
                                className="opacity-90 shadow-2xl scale-105"
                            />
                        ) : null}
                    </DragOverlay>
                </DndContext>

                <AppointmentModal
                    isOpen={isModalOpen}
                    onClose={() => {
                        setIsModalOpen(false)
                        setModalData(null)
                        setEditingAppointment(null)
                    }}
                    initialData={modalData}
                    editingAppointment={editingAppointment}
                />

                {/* Appointment Detail Overlay */}
                {selectedAppointment && (
                    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[9999] flex items-center justify-center" onClick={() => { setSelectedAppointment(null); setShowDeleteConfirm(false) }}>
                        <div className="bg-white rounded-2xl shadow-2xl w-[400px] max-w-[90vw] overflow-hidden" onClick={e => e.stopPropagation()}>
                            {/* Header */}
                            <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-5">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <h3 className="text-lg font-black tracking-tight">
                                            {selectedAppointment.event_type === 'BLOCK'
                                                ? `🔒 ${selectedAppointment.block_title || '잠금'}`
                                                : selectedAppointment.patient?.name || '예약'}
                                        </h3>
                                        {selectedAppointment.event_type === 'APPOINTMENT' && selectedAppointment.patient?.patient_no && (
                                            <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full font-bold">
                                                #{selectedAppointment.patient.patient_no}
                                            </span>
                                        )}
                                        {selectedAppointment.event_type === 'APPOINTMENT' && (
                                            <span className={clsx(
                                                "text-[10px] font-black px-2 py-0.5 rounded-full",
                                                selectedAppointment.status === 'PENDING' && 'bg-blue-100 text-blue-700',
                                                selectedAppointment.status === 'COMPLETED' && 'bg-emerald-100 text-emerald-700',
                                                selectedAppointment.status === 'CANCELLED' && 'bg-gray-100 text-gray-600',
                                                selectedAppointment.status === 'NOSHOW' && 'bg-rose-100 text-rose-700',
                                            )}>
                                                {selectedAppointment.status === 'PENDING' && '예정'}
                                                {selectedAppointment.status === 'COMPLETED' && '완료'}
                                                {selectedAppointment.status === 'CANCELLED' && '취소'}
                                                {selectedAppointment.status === 'NOSHOW' && '노쇼'}
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <button
                                            onClick={() => {
                                                setEditingAppointment(selectedAppointment)
                                                setIsModalOpen(true)
                                                setSelectedAppointment(null)
                                            }}
                                            className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors text-white"
                                            title="수정"
                                        >
                                            ✏️
                                        </button>
                                        <button
                                            onClick={() => setShowDeleteConfirm(!showDeleteConfirm)}
                                            className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center hover:bg-red-500/50 transition-colors text-white"
                                            title="삭제"
                                        >
                                            🗑️
                                        </button>
                                        <div className="w-px h-4 bg-white/20 mx-1" />
                                        <button
                                            onClick={() => { setSelectedAppointment(null); setShowDeleteConfirm(false) }}
                                            className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors text-sm font-bold"
                                        >
                                            ✕
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Body */}
                            <div className="p-5 space-y-3">
                                <div className="flex items-center gap-3 text-sm">
                                    <span className="text-gray-400 w-16 text-right font-bold">시간</span>
                                    <span className="font-black text-gray-900">
                                        {formatKST(new Date(selectedAppointment.start_time), 'yyyy-MM-dd HH:mm')}
                                        {' → '}
                                        {formatKST(new Date(selectedAppointment.end_time), 'HH:mm')}
                                    </span>
                                </div>
                                {selectedAppointment.therapist?.full_name && (
                                    <div className="flex items-center gap-3 text-sm">
                                        <span className="text-gray-400 w-16 text-right font-bold">치료사</span>
                                        <span className="font-bold text-gray-700">{selectedAppointment.therapist.full_name}</span>
                                    </div>
                                )}
                                {selectedAppointment.note && (
                                    <div className="flex items-start gap-3 text-sm">
                                        <span className="text-gray-400 w-16 text-right font-bold pt-0.5">메모</span>
                                        <span className="text-gray-600 bg-gray-50 rounded-lg px-3 py-2 flex-1">{selectedAppointment.note}</span>
                                    </div>
                                )}
                            </div>

                            {/* Actions */}
                            <div className="border-t p-4 space-y-3 bg-gray-50/50">
                                {/* 상태 변경 버튼 */}
                                {selectedAppointment.event_type === 'APPOINTMENT' && (
                                    <div className="grid grid-cols-4 gap-2">
                                        <button
                                            onClick={() => updateMutation.mutate(
                                                { id: selectedAppointment.id, updates: { status: 'PENDING' } },
                                                {
                                                    onSuccess: () => setSelectedAppointment(prev => prev ? { ...prev, status: 'PENDING' } : null)
                                                }
                                            )}
                                            className={clsx(
                                                "px-2 py-2 text-[10px] font-black rounded-xl transition-all border",
                                                selectedAppointment.status === 'PENDING'
                                                    ? "bg-blue-600 text-white border-blue-600 shadow-md scale-105"
                                                    : "bg-white text-gray-400 border-gray-200 hover:border-blue-300 hover:text-blue-500"
                                            )}
                                        >
                                            🔄 예정
                                        </button>
                                        <button
                                            onClick={() => updateMutation.mutate(
                                                { id: selectedAppointment.id, updates: { status: 'COMPLETED' } },
                                                {
                                                    onSuccess: () => setSelectedAppointment(prev => prev ? { ...prev, status: 'COMPLETED' } : null)
                                                }
                                            )}
                                            className={clsx(
                                                "px-2 py-2 text-[10px] font-black rounded-xl transition-all border",
                                                selectedAppointment.status === 'COMPLETED'
                                                    ? "bg-emerald-600 text-white border-emerald-600 shadow-md scale-105"
                                                    : "bg-white text-gray-400 border-gray-200 hover:border-emerald-300 hover:text-emerald-500"
                                            )}
                                        >
                                            ✅ 완료
                                        </button>
                                        <button
                                            onClick={() => updateMutation.mutate(
                                                { id: selectedAppointment.id, updates: { status: 'NOSHOW' } },
                                                {
                                                    onSuccess: () => setSelectedAppointment(prev => prev ? { ...prev, status: 'NOSHOW' } : null)
                                                }
                                            )}
                                            className={clsx(
                                                "px-2 py-2 text-[10px] font-black rounded-xl transition-all border",
                                                selectedAppointment.status === 'NOSHOW'
                                                    ? "bg-rose-600 text-white border-rose-600 shadow-md scale-105"
                                                    : "bg-white text-gray-400 border-gray-200 hover:border-rose-300 hover:text-rose-500"
                                            )}
                                        >
                                            🚫 노쇼
                                        </button>
                                        <button
                                            onClick={() => updateMutation.mutate(
                                                { id: selectedAppointment.id, updates: { status: 'CANCELLED' } },
                                                {
                                                    onSuccess: () => setSelectedAppointment(prev => prev ? { ...prev, status: 'CANCELLED' } : null)
                                                }
                                            )}
                                            className={clsx(
                                                "px-2 py-2 text-[10px] font-black rounded-xl transition-all border",
                                                selectedAppointment.status === 'CANCELLED'
                                                    ? "bg-gray-600 text-white border-gray-600 shadow-md scale-105"
                                                    : "bg-white text-gray-400 border-gray-200 hover:border-gray-400 hover:text-gray-600"
                                            )}
                                        >
                                            ❌ 취소
                                        </button>
                                    </div>
                                )}

                                {/* 예약 안내 문자 복사 (APPOINTMENT 타입일 때만) */}
                                {selectedAppointment.event_type === 'APPOINTMENT' && (
                                    <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-800">
                                        <button
                                            onClick={() => {
                                                const aptDate = new Date(selectedAppointment.start_time)
                                                const dateStr = formatKST(aptDate, 'yyyy년 M월 d일(EEE) HH:mm')
                                                const therapistName = selectedAppointment.therapist?.full_name || '담당 선생님'

                                                // 기본 템플릿 또는 사용자 설정 템플릿 사용
                                                const template = profile?.message_template || `[예약 안내] {환자}님\n일시: {일시}\n장소: {장소}\n담당: {담당자} 선생님`

                                                const text = template
                                                    .replace(/{환자}/g, selectedAppointment.patient?.name || '환자')
                                                    .replace(/{일시}/g, dateStr)
                                                    .replace(/{장소}/g, profile?.organization_name || '치료실')
                                                    .replace(/{담당자}/g, therapistName)
                                                    .replace(/{연락처}/g, profile?.contact_number || '')

                                                navigator.clipboard.writeText(text).then(() => {
                                                    alert('예약 안내 문자가 복사되었습니다!')
                                                })
                                            }}
                                            className="w-full flex items-center justify-center gap-2 py-2.5 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 rounded-xl transition-all font-bold text-sm border border-indigo-100 hover:border-indigo-200"
                                        >
                                            <MessageSquare className="w-4 h-4" />
                                            <span>예약 안내 문자 복사</span>
                                        </button>
                                    </div>
                                )}

                                {/* 삭제 확인 UI (버튼 아래에 표시) */}
                                {showDeleteConfirm && (
                                    <div className="flex items-center justify-between bg-red-50 p-3 rounded-xl border border-red-100 animate-in slide-in-from-bottom-2">
                                        <span className="text-xs text-red-600 font-bold flex items-center gap-2">
                                            ⚠️ 정말 이 예약을 삭제하시겠습니까?
                                        </span>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => setShowDeleteConfirm(false)}
                                                className="px-3 py-1.5 text-xs font-bold text-gray-500 hover:bg-white hover:text-gray-700 rounded-lg transition-colors"
                                            >
                                                취소
                                            </button>
                                            <button
                                                onClick={() => {
                                                    deleteMutation.mutate(selectedAppointment.id, {
                                                        onSuccess: () => {
                                                            setSelectedAppointment(null)
                                                            setShowDeleteConfirm(false)
                                                        }
                                                    })
                                                }}
                                                disabled={deleteMutation.isPending}
                                                className="px-3 py-1.5 text-xs font-black bg-red-600 text-white hover:bg-red-700 rounded-lg transition-all shadow-sm"
                                            >
                                                {deleteMutation.isPending ? '삭제 중...' : '확인'}
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
