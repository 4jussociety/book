import { useRef } from 'react'
import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import type { Appointment } from '@/types/db'
import { ResizeHandle } from './ResizeHandle'
import { DraggableAppointmentContent } from './DraggableAppointmentContent'

type Props = {
    appointment: Appointment
    style?: React.CSSProperties
    onClick?: (appointment: Appointment) => void
    onResizeStart?: () => void
    onResize?: (deltaMinutes: number, position: 'top' | 'bottom') => void
    onResizeEnd?: (deltaMinutes: number, position: 'top' | 'bottom') => void
}

export function DraggableAppointment({ appointment, style, onClick, onResizeStart, onResize, onResizeEnd }: Props) {
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
        id: appointment.id,
        data: appointment,
    })

    // 리사이즈 직후 click 이벤트 방지용 플래그
    const isResizingRef = useRef(false)

    const handleResizeStartInternal = () => {
        isResizingRef.current = true
        onResizeStart?.()
    }

    const handleResizeEndInternal = (deltaMinutes: number, position: 'top' | 'bottom') => {
        onResizeEnd?.(deltaMinutes, position)
        // click 이벤트가 pointerup 직후 발생하므로, 짧은 딜레이 후 플래그 해제
        setTimeout(() => { isResizingRef.current = false }, 150)
    }

    const animatedStyle = {
        ...style,
        transform: CSS.Translate.toString(transform),
        zIndex: transform ? 100 : (style?.zIndex ?? 10),
        opacity: isDragging ? 0 : 1, // 드래그 중에는 원본 숨김 (DragOverlay가 대신 표시)
    }

    const handleClick = (e: React.MouseEvent) => {
        // 드래그(이동) 중이었다면 상세 정보를 열지 않음
        if (transform && (Math.abs(transform.x) > 3 || Math.abs(transform.y) > 3)) return
        // 리사이즈 직후라면 열지 않음
        if (isResizingRef.current) return
        e.stopPropagation()
        onClick?.(appointment)
    }

    return (
        <div ref={setNodeRef} style={animatedStyle} className="w-full" {...listeners} {...attributes}>
            <DraggableAppointmentContent
                appointment={appointment}
                isDragging={isDragging}
                onClick={handleClick}
                className="h-full" // 부모 div의 height를 채우도록
            >
                {/* Resize Handles - 네이티브 포인터 이벤트 기반 (dnd-kit 충돌 방지) */}
                <ResizeHandle position="top" onResizeStart={handleResizeStartInternal} onResize={onResize} onResizeEnd={handleResizeEndInternal} />
                <ResizeHandle position="bottom" onResizeStart={handleResizeStartInternal} onResize={onResize} onResizeEnd={handleResizeEndInternal} />
            </DraggableAppointmentContent>
        </div>
    )
}
