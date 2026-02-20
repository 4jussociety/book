import type { Appointment } from '@/types/db'
import { format, isPast, differenceInMinutes } from 'date-fns'
import { clsx } from 'clsx'

type Props = {
    appointment: Appointment
    style?: React.CSSProperties
    className?: string
    isDragging?: boolean
    isResizing?: boolean
    onClick?: (e: React.MouseEvent) => void
    children?: React.ReactNode
}

export function DraggableAppointmentContent({
    appointment,
    style,
    className,
    isDragging,
    onClick,
    children
}: Props) {
    // 자동 완료 상태 시각화 로직
    const isEndTimePassed = isPast(new Date(appointment.end_time))
    const effectiveStatus = (appointment.status === 'PENDING' && isEndTimePassed) ? 'COMPLETED' : appointment.status

    const statusConfig: Record<string, { bg: string; border: string; strip: string; text: string; badge: string }> = {
        PENDING: {
            bg: 'bg-blue-50',
            border: 'border-blue-500',
            strip: 'bg-blue-500',
            text: 'text-blue-900',
            badge: 'bg-blue-200/50 text-blue-700'
        },
        COMPLETED: {
            bg: 'bg-emerald-50',
            border: 'border-emerald-500',
            strip: 'bg-emerald-500',
            text: 'text-emerald-900',
            badge: 'bg-emerald-200/50 text-emerald-700'
        },
        CANCELLED: {
            bg: 'bg-gray-100',
            border: 'border-gray-500',
            strip: 'bg-gray-500',
            text: 'text-gray-900',
            badge: 'bg-gray-200 text-gray-600'
        },
        NOSHOW: {
            bg: 'bg-rose-50',
            border: 'border-rose-500',
            strip: 'bg-rose-500',
            text: 'text-rose-900',
            badge: 'bg-rose-200/50 text-rose-700'
        },
        BLOCK: {
            bg: 'bg-gray-100/80',
            border: 'border-gray-300',
            strip: 'bg-gray-400',
            text: 'text-gray-600',
            badge: 'bg-gray-200 text-gray-500'
        }
    }

    const config = appointment.event_type === 'BLOCK' ? statusConfig.BLOCK : (statusConfig[effectiveStatus] || statusConfig.PENDING)

    // 노쇼나 취소 상태이거나, 시간이 매우 짧은 경우 '작은 카드' 모드로 표시
    const isInactiveStatus = appointment.status === 'NOSHOW' || appointment.status === 'CANCELLED'
    const isSmall = isInactiveStatus || differenceInMinutes(new Date(appointment.end_time), new Date(appointment.start_time)) <= 20

    return (
        <div
            style={style}
            data-appointment="true"
            onClick={onClick}
            className={clsx(
                "absolute inset-x-1 border-l-[6px] rounded-xl shadow-sm transition-all select-none cursor-grab active:cursor-grabbing group hover:shadow-md hover:brightness-95",
                config.bg,
                config.border,
                config.text,
                isDragging && "shadow-2xl ring-4 ring-blue-500/10 scale-[1.02] opacity-80 z-50",
                className
            )}
        >
            {/* Internal Content Wrapper (Clipped) */}
            <div className={clsx("h-full w-full overflow-hidden flex flex-col justify-between", isSmall ? "px-1.5 py-0.5" : "px-2.5 py-1.5")}>
                <div>
                    <div className="flex items-center gap-1.5 mb-0.5">
                        <span className={clsx("font-black truncate", isSmall ? "text-[11px]" : "text-[13px]")}>
                            {appointment.event_type === 'BLOCK' ? appointment.block_title || '잠금' : appointment.patient?.name || 'Unknown'}
                        </span>
                        {appointment.event_type === 'APPOINTMENT' && !isSmall && (
                            <span className={clsx("text-[9px] font-black px-1.5 py-0.5 rounded-full uppercase tracking-tighter", config.badge)}>
                                {appointment.patient?.is_manual_no ? '' : '#'}{appointment.patient?.patient_no || '...'}
                            </span>
                        )}
                    </div>
                    {appointment.visit_count && !isSmall && (
                        <div className="text-[10px] font-bold opacity-60 flex items-center gap-1">
                            <span className="w-1 h-1 rounded-full bg-current opacity-40"></span>
                            {appointment.visit_count}회차
                        </div>
                    )}
                </div>

                {!isSmall && (
                    <div className="flex items-center justify-between mt-auto">
                        <span className="text-[10px] font-black opacity-40 bg-black/5 px-1.5 rounded-md">
                            {format(new Date(appointment.start_time), 'HH:mm')} - {format(new Date(appointment.end_time), 'HH:mm')}
                        </span>
                    </div>
                )}
            </div>

            {/* 자동 완료 시각적 표시기 - 내부가 아닌 Root 위에 표시 (가시성 확보) */}
            {effectiveStatus === 'COMPLETED' && appointment.status === 'PENDING' && (
                <div className="absolute top-1 right-1 pointer-events-none">
                    <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse shadow-sm shadow-emerald-500/50"></div>
                </div>
            )}

            {children}
        </div>
    )
}
