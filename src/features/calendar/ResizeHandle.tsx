// ResizeHandle: 예약 카드의 상/하단 드래그로 시간 길이(Duration) 변경
// @dnd-kit과 독립적인 네이티브 포인터 이벤트 기반 구현 (중첩 draggable 충돌 방지)

import { useState, useCallback, useRef } from 'react'
import { clsx } from 'clsx'

const PX_PER_HOUR = 80
const PX_PER_MIN = PX_PER_HOUR / 60
const SNAP_MINUTES = 10

type ResizeHandleProps = {
    position: 'top' | 'bottom'
    onResizeStart?: () => void
    onResize?: (deltaMinutes: number, position: 'top' | 'bottom') => void
    onResizeEnd?: (deltaMinutes: number, position: 'top' | 'bottom') => void
}

export function ResizeHandle({ position, onResizeStart, onResize, onResizeEnd }: ResizeHandleProps) {
    const [isDragging, setIsDragging] = useState(false)
    const startYRef = useRef(0)
    const currentDeltaRef = useRef(0)

    const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
        e.preventDefault()
        e.stopPropagation()

        startYRef.current = e.clientY
        currentDeltaRef.current = 0
        setIsDragging(true)
        onResizeStart?.()

            // 포인터 캡처로 요소 밖에서도 이벤트 수신
            ; (e.target as HTMLElement).setPointerCapture(e.pointerId)

        const handlePointerMove = (moveEvent: PointerEvent) => {
            moveEvent.preventDefault()
            moveEvent.stopPropagation()

            const rawDeltaY = moveEvent.clientY - startYRef.current
            const rawDeltaMinutes = rawDeltaY / PX_PER_MIN
            const snappedDeltaMinutes = Math.round(rawDeltaMinutes / SNAP_MINUTES) * SNAP_MINUTES

            if (snappedDeltaMinutes !== currentDeltaRef.current) {
                currentDeltaRef.current = snappedDeltaMinutes
                onResize?.(snappedDeltaMinutes, position)
            }
        }

        const handlePointerUp = (upEvent: PointerEvent) => {
            upEvent.preventDefault()
            upEvent.stopPropagation()

            setIsDragging(false)

            const finalDelta = currentDeltaRef.current
            if (finalDelta !== 0) {
                onResizeEnd?.(finalDelta, position)
            }

            document.removeEventListener('pointermove', handlePointerMove)
            document.removeEventListener('pointerup', handlePointerUp)
        }

        document.addEventListener('pointermove', handlePointerMove)
        document.addEventListener('pointerup', handlePointerUp)
    }, [position, onResizeStart, onResize, onResizeEnd])

    return (
        <div
            onPointerDown={handlePointerDown}
            className={clsx(
                "absolute inset-x-0 h-5 z-[60] cursor-row-resize transition-all group/resize flex items-center justify-center",
                position === 'top' ? "-top-2.5" : "-bottom-2.5",
                isDragging && "bg-blue-500/20"
            )}
            title="드래그하여 시간 조절"
        >
            {/* 시각적 핸들 인디케이터 - Hover 시 표시 */}
            <div className={clsx(
                "flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity",
                isDragging && "opacity-100"
            )}>
                <div className="w-1 h-1 rounded-full bg-gray-400" />
                <div className="w-1 h-1 rounded-full bg-gray-400" />
                <div className="w-1 h-1 rounded-full bg-gray-400" />
            </div>
        </div>
    )
}
