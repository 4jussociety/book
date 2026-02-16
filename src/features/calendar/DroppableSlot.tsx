// DroppableSlot: 캘린더 그리드의 1시간 블록 (시각적 경계 + DnD 드롭 대상)
// 마우스 인터랙션은 부모(WeekView)의 컬럼 컨테이너에서 처리

import { useDroppable } from '@dnd-kit/core'
import { clsx } from 'clsx'

type Props = {
    id: string
    children?: React.ReactNode
}

export function DroppableSlot({ id, children }: Props) {
    const { setNodeRef, isOver } = useDroppable({ id })

    return (
        <div
            ref={setNodeRef}
            className={clsx(
                'h-20 border-b border-gray-200 relative transition-colors',
                isOver && 'bg-blue-50/50',
            )}
        >
            {/* 30분 구분선 (점선) */}
            <div className="absolute top-1/2 w-full border-t border-gray-100 border-dashed pointer-events-none" />

            {/* 10분/50분 가이드 (매우 연하게) */}
            {/* <div className="absolute top-[16.6%] w-full border-t border-gray-50/50 pointer-events-none" /> */}
            {/* <div className="absolute top-[83.3%] w-full border-t border-gray-50/50 pointer-events-none" /> */}

            {children}
        </div>
    )
}
