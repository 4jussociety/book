// useMediaQuery: 반응형 화면 크기 감지 훅
// CSS 미디어 쿼리 기반으로 boolean 값 반환

import { useState, useEffect } from 'react'

export function useMediaQuery(query: string): boolean {
    const [matches, setMatches] = useState(() => {
        if (typeof window !== 'undefined') {
            return window.matchMedia(query).matches
        }
        return false
    })

    useEffect(() => {
        const mediaQuery = window.matchMedia(query)
        const handler = (e: MediaQueryListEvent) => setMatches(e.matches)

        mediaQuery.addEventListener('change', handler)
        setMatches(mediaQuery.matches)

        return () => mediaQuery.removeEventListener('change', handler)
    }, [query])

    return matches
}

/** 모바일(768px 미만) 여부를 반환 */
export function useIsMobile(): boolean {
    return !useMediaQuery('(min-width: 768px)')
}
