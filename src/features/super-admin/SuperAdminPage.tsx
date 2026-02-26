import { useState, useEffect } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/AuthContext'
import { Loader2, Plus, Trash2, Save, Image as ImageIcon } from 'lucide-react'

// 권한 확인을 위한 이메일 주소 하드코딩 (운영 환경에서는 다르게 처리될 수 있음)
const SUPER_ADMIN_EMAILS = [
    import.meta.env.VITE_SUPER_ADMIN_EMAIL || '4jussociety@thept.co.kr'
]

type GlobalAd = {
    id: string
    slot_id: string
    image_url: string
    link_url: string | null
    is_active: boolean
    sort_order?: number
    created_at: string
}

// 사전에 정의된 광고 슬롯 목록
const AVAILABLE_SLOTS = [
    {
        id: 'instructor_bottom',
        label: '[A섹션] 사이드바 하단',
        description: '왼쪽 캘린더 사이드바의 강사 리스트 하단 영역에 노출되는 배너입니다.',
        recommendedSize: '가로 220px × 세로 120px (또는 16:9 비율의 직사각형)'
    }
]

export default function SuperAdminPage() {
    const { user, session } = useAuth()
    const [isLoading, setIsLoading] = useState(true)
    const [ads, setAds] = useState<Record<string, GlobalAd[]>>({})
    const [isSaving, setIsSaving] = useState(false)
    const [selectedSlotId, setSelectedSlotId] = useState<string>('instructor_bottom')

    const isSuperAdmin = user?.email && SUPER_ADMIN_EMAILS.includes(user.email)

    useEffect(() => {
        if (!isSuperAdmin) return

        const fetchAds = async () => {
            setIsLoading(true)
            const { data, error } = await supabase
                .from('global_ads')
                .select('*')
                .order('sort_order', { ascending: true })
                .order('created_at', { ascending: true })

            if (data) {
                // slot_id를 key로 하는 배열 객체로 변환하여 관리
                const adsMap: Record<string, GlobalAd[]> = {}
                data.forEach(ad => {
                    if (!adsMap[ad.slot_id]) adsMap[ad.slot_id] = []
                    adsMap[ad.slot_id].push(ad)
                })
                setAds(adsMap)
            }
            if (error) {
                console.error("Failed to fetch global_ads:", error)
            }
            setIsLoading(false)
        }

        fetchAds()
    }, [isSuperAdmin])

    if (!session) {
        return <Navigate to="/login" replace />
    }

    if (!isSuperAdmin) {
        // 일반 유저가 접근 시 프로필 페이지로 튕겨내기
        return <Navigate to="/profile" replace />
    }

    const handleSelectSlot = (slotId: string) => {
        setSelectedSlotId(slotId)
    }

    const handleAddAd = () => {
        const slotAds = ads[selectedSlotId] || []
        const newAd: GlobalAd = {
            id: `temp-${Date.now()}`,
            slot_id: selectedSlotId,
            image_url: '',
            link_url: '',
            is_active: true,
            sort_order: slotAds.length,
            created_at: new Date().toISOString()
        }
        setAds({ ...ads, [selectedSlotId]: [...slotAds, newAd] })
    }

    const handleChange = (adId: string, field: keyof GlobalAd, value: any) => {
        const slotAds = ads[selectedSlotId] || []
        const newSlotAds = slotAds.map(ad => ad.id === adId ? { ...ad, [field]: value } : ad)
        setAds({
            ...ads,
            [selectedSlotId]: newSlotAds
        })
    }

    const handleDelete = async (adId: string) => {
        if (!window.confirm('이 광고 배너를 정말 삭제하시겠습니까?')) return

        const slotAds = ads[selectedSlotId] || []
        const currentAd = slotAds.find(ad => ad.id === adId)
        if (!currentAd) return

        // DB에 저장된 내역이면 삭제 호출
        if (!currentAd.id.startsWith('temp-')) {
            const { error } = await supabase.from('global_ads').delete().eq('id', currentAd.id)
            if (error) {
                alert('삭제 중 오류가 발생했습니다.')
                console.error("Delete Error:", error)
                return
            }
        }

        // 상태값 업데이트 (해당 항목만 제외)
        const newSlotAds = slotAds.filter(ad => ad.id !== adId)
        setAds({ ...ads, [selectedSlotId]: newSlotAds })
    }

    const handleSave = async () => {
        setIsSaving(true)
        try {
            const slotAds = ads[selectedSlotId] || []

            // 검증
            const invalidAd = slotAds.find(ad => !ad.image_url)
            if (invalidAd) {
                alert('모든 광고에 이미지 URL은 필수 항목입니다. 비어있는 배너를 채우거나 삭제해주세요.')
                setIsSaving(false)
                return
            }

            // 기존 광고 (업데이트)와 신규 광고 (추가) 분리
            const adsToUpdate = slotAds.filter(ad => !ad.id.startsWith('temp-')).map((ad, index) => ({
                id: ad.id,
                slot_id: ad.slot_id,
                image_url: ad.image_url,
                link_url: ad.link_url,
                is_active: ad.is_active,
                sort_order: index
            }))

            const adsToInsert = slotAds.filter(ad => ad.id.startsWith('temp-')).map((ad, index) => ({
                slot_id: ad.slot_id,
                image_url: ad.image_url,
                link_url: ad.link_url,
                is_active: ad.is_active,
                sort_order: index
            }))

            if (adsToUpdate.length > 0) {
                const { error: updateError } = await supabase.from('global_ads').upsert(adsToUpdate)
                if (updateError) throw updateError
            }

            if (adsToInsert.length > 0) {
                const { error: insertError } = await supabase.from('global_ads').insert(adsToInsert)
                if (insertError) throw insertError
            }

            alert('광고 배너 설정이 저장되었습니다.')
            // 다시 조회하여 id 등 최신 상태로 동기화
            const { data } = await supabase.from('global_ads').select('*').order('sort_order', { ascending: true }).order('created_at', { ascending: true })
            if (data) {
                const adsMap: Record<string, GlobalAd[]> = {}
                data.forEach(ad => {
                    if (!adsMap[ad.slot_id]) adsMap[ad.slot_id] = []
                    adsMap[ad.slot_id].push(ad)
                })
                setAds(adsMap)
            }
        } catch (error) {
            console.error("Save Error:", error)
            alert('저장 중 오류가 발생했습니다. (다중 스택 관련 설정이 DB에 반영되었는지 확인 필요)')
        } finally {
            setIsSaving(false)
        }
    }

    if (isLoading) {
        return <div className="min-h-screen flex items-center justify-center bg-gray-50"><Loader2 className="w-8 h-8 text-indigo-600 animate-spin" /></div>
    }

    const currentSlotData = AVAILABLE_SLOTS.find(s => s.id === selectedSlotId)

    return (
        <div className="min-h-screen bg-gray-50 p-2 sm:p-4 lg:p-6 flex flex-col">
            <div className="w-full max-w-none mx-auto space-y-6 flex-1 flex flex-col">
                <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-black text-gray-900 tracking-tight">전역 광고 <span className="text-indigo-600">Visual 콘솔</span></h1>
                        <p className="text-gray-500 mt-2 text-sm font-medium">직관적으로 화면 배치를 보며 각 위치(슬롯)별 배너를 제어합니다.</p>
                    </div>
                </header>

                <div className="flex flex-col xl:flex-row gap-6 flex-1">
                    {/* Visual Mockup Planner (Left/Top) */}
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 flex flex-col flex-1">
                        <div className="p-4 border-b border-gray-100 bg-gray-50/50 shrink-0 rounded-t-2xl">
                            <h2 className="text-lg font-bold text-gray-900">시스템 화면 도면 (Visual Mockup)</h2>
                            <p className="text-xs text-gray-500 mt-1">원하는 위치(슬롯)를 클릭하여 우측 패널에서 광고를 등록하세요.</p>
                        </div>

                        {/* Mockup Container */}
                        <div className="p-0 md:p-6 bg-gray-100 flex-1 flex items-start justify-center overflow-x-auto rounded-b-2xl">

                            {/* Browser/App Frame Mockup (Actual App UI Clone) */}
                            <div className="w-full min-w-[1024px] xl:max-w-none bg-white md:rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.1)] border border-gray-300 flex flex-col shrink-0 overflow-hidden font-sans text-gray-900 relative">
                                {/* ── GNB Clone ── */}
                                <div className="h-16 border-b border-gray-200 bg-white flex items-center justify-between px-4 md:px-6 shrink-0 z-50">
                                    <div className="flex items-center gap-4 md:gap-8">
                                        <div className="text-2xl md:text-3xl font-black text-black italic tracking-tighter leading-none [-webkit-text-stroke:1px_black]">THEPT#</div>
                                        <div className="hidden md:flex items-center gap-1">
                                            <span className="px-4 py-2 text-sm font-bold transition-all rounded-lg bg-blue-50 text-blue-600">예약 관리</span>
                                            <span className="px-4 py-2 text-sm font-bold transition-all rounded-lg text-gray-500">고객 관리</span>
                                            <span className="px-4 py-2 text-sm font-bold transition-all rounded-lg text-gray-500">통계</span>
                                            <span className="px-4 py-2 text-sm font-bold transition-all rounded-lg text-gray-500">커뮤니티</span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 md:gap-4">
                                        <div className="flex items-center gap-2 md:gap-3 p-2">
                                            <div className="text-right hidden sm:block">
                                                <div className="text-sm font-bold text-gray-900 leading-none">4jussociety</div>
                                                <div className="text-[10px] font-bold text-blue-500 mt-1 uppercase tracking-wider bg-blue-50 px-1 rounded inline-block">매니저</div>
                                            </div>
                                            <div className="w-8 h-8 md:w-9 md:h-9 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center text-gray-500">
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* App Body */}
                                <div className="flex flex-1 relative">

                                    {/* ── SIDEBAR ── */}
                                    <div className="w-[280px] flex-none border-r bg-white p-4 flex flex-col gap-6 hidden lg:flex shrink-0 pt-24 z-30">
                                        {/* Mini Calendar Clone */}
                                        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex justify-center mt-2">
                                            <div className="w-full relative">
                                                <div className="absolute top-1 left-0 w-full flex justify-between px-1 items-center h-8 z-10 pointer-events-none">
                                                    <button className="pointer-events-auto h-7 w-7 bg-transparent text-gray-400 flex items-center justify-center"><svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"></polyline></svg></button>
                                                    <button className="pointer-events-auto h-7 w-7 bg-transparent text-gray-400 flex items-center justify-center"><svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"></polyline></svg></button>
                                                </div>
                                                <div className="flex justify-center pt-1 items-center mb-4 h-8">
                                                    <div className="text-sm font-black text-gray-800 tracking-tight">2026년 2월</div>
                                                </div>
                                                <div className="flex justify-center mb-2 gap-1 text-[0.75rem] font-medium text-gray-400 uppercase tracking-wider">
                                                    <div className="w-7 text-center text-red-500">일</div><div className="w-7 text-center">월</div><div className="w-7 text-center">화</div><div className="w-7 text-center">수</div><div className="w-7 text-center">목</div><div className="w-7 text-center">금</div><div className="w-7 text-center text-blue-500">토</div>
                                                </div>
                                                <div className="grid grid-cols-7 gap-y-2 text-center text-xs">
                                                    {Array.from({ length: 28 }).map((_, i) => (
                                                        <div key={i} className={`h-7 w-7 m-auto flex items-center justify-center font-medium ${i % 7 === 0 ? 'text-red-400' : ''} ${i % 7 === 6 ? 'text-blue-400' : 'text-gray-600'} ${i === 25 ? 'bg-blue-50 text-blue-600 rounded-full ring-1 ring-blue-200 font-bold' : ''}`}>
                                                            {(i % 28) + 1}
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Instructors */}
                                        <div>
                                            <h3 className="text-xs font-black text-gray-400 uppercase tracking-wider mb-3 px-2">instructors</h3>
                                            <div className="space-y-1">
                                                <button className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-bold transition-all text-left bg-blue-50 text-blue-700">
                                                    <div className="w-2.5 h-2.5 rounded-full transition-all bg-blue-500 ring-2 ring-blue-200"></div>
                                                    4jussociety
                                                </button>
                                            </div>
                                        </div>

                                        {/* Slot A */}
                                        <div className="mt-4 px-2">
                                            <h3 className="text-xs font-black text-gray-400 uppercase tracking-wider mb-2">Sponsors</h3>
                                            <div
                                                className={`flex flex-col gap-3 p-2 rounded-xl border-2 border-dashed transition-all cursor-pointer ${(selectedSlotId === 'instructor_bottom') ? 'border-indigo-500 bg-indigo-50/50 shadow-[0_0_0_4px_rgba(99,102,241,0.1)]' : 'border-gray-300 hover:border-indigo-400 hover:bg-gray-50'}`}
                                                onClick={() => handleSelectSlot('instructor_bottom')}
                                            >
                                                {(ads['instructor_bottom'] || []).length > 0 ? (
                                                    (ads['instructor_bottom'] || []).map((ad, idx) => (
                                                        <div key={ad.id || idx} className="relative w-full rounded-lg overflow-hidden border border-gray-200 shadow-sm group bg-white">
                                                            <img src={ad.image_url} alt={`Slot A Mockup ${idx}`} className="w-full h-auto object-cover" />
                                                            <div className="absolute inset-0 bg-indigo-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center backdrop-blur-sm">
                                                                <span className="text-white font-bold text-xs tracking-widest">[A섹션] 배너 {idx + 1}</span>
                                                                {!ad.is_active && <span className="text-xs text-red-300 mt-1 font-bold">(숨김 처리됨)</span>}
                                                            </div>
                                                        </div>
                                                    ))
                                                ) : (
                                                    <div className={`w-full aspect-video flex flex-col items-center justify-center text-xs font-bold ${(selectedSlotId === 'instructor_bottom') ? 'text-indigo-600' : 'text-gray-400'}`}>
                                                        <span>[A섹션] 배치</span>
                                                        <span className="scale-75 opacity-70">클릭하여 여러 배너 스택 관리</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* ── MAIN CONTENT (Header + Grid) ── */}
                                    <div className="flex-1 flex flex-col min-w-0 bg-white relative pt-[80px]">
                                        {/* ── HEADER ── */}
                                        <div className="flex flex-col border-b bg-white z-20">
                                            <div className="flex items-center justify-between p-2 px-3 md:p-4 md:px-6">
                                                <div className="flex items-center gap-2 md:gap-8">
                                                    <div className="flex flex-col">
                                                        <div className="flex items-center gap-2 md:gap-4">
                                                            <button className="px-3 py-1.5 text-xs font-black text-gray-700 bg-white border border-gray-200 rounded-full shadow-sm">
                                                                오늘
                                                            </button>
                                                            <div className="flex items-center gap-1 md:gap-2">
                                                                <div className="flex items-center gap-0.5">
                                                                    <button className="p-1.5 text-gray-400"><svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"></polyline></svg></button>
                                                                    <button className="p-1.5 text-gray-400"><svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6"></polyline></svg></button>
                                                                </div>
                                                                <h2 className="text-lg md:text-2xl font-black text-gray-900 tracking-tighter ml-1">
                                                                    2026년 2월
                                                                </h2>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* ── GRID ── */}
                                        <div className="flex bg-[#F0F4F8] relative select-none pt-[72px] overflow-x-auto">
                                            {/* Time Axis */}
                                            <div className="flex-none border-r bg-white/90 backdrop-blur-xl sticky left-0 h-max w-16 z-40">
                                                <div className="relative" style={{ height: '1120px' }}>
                                                    {Array.from({ length: 14 }).map((_, i) => {
                                                        const hour = i + 6;
                                                        const period = hour < 12 ? 'AM' : 'PM';
                                                        const h = hour > 12 ? hour - 12 : hour;
                                                        return (
                                                            <div key={hour} className="absolute w-full flex justify-center transform -translate-y-2.5" style={{ top: `${i * 80}px` }}>
                                                                <span className="text-[11px] font-bold text-gray-400 bg-white/90 px-1 rounded z-10">{period} {h}시</span>
                                                            </div>
                                                        )
                                                    })}
                                                </div>
                                            </div>

                                            {/* Day Columns */}
                                            <div className="flex flex-1 relative h-max min-w-max">
                                                {['일', '월', '화', '수', '목', '금', '토'].map((day, d) => (
                                                    <div key={d} className={`flex flex-col border-r border-gray-200/50 relative ${d === 4 ? 'bg-blue-50/30' : 'bg-white/50'}`}>
                                                        <div className="flex flex-col items-center justify-center border-b sticky top-0 z-40 bg-white/95 backdrop-blur-sm h-12">
                                                            <span className={`text-[10px] font-bold ${d === 0 ? 'text-red-500' : d === 4 ? 'text-blue-500' : 'text-gray-400'}`}>{day}</span>
                                                            <span className={`text-lg font-black leading-none w-7 h-7 flex items-center justify-center mt-0.5 ${d === 4 ? 'bg-blue-400 text-white rounded-full' : 'text-gray-800'}`}>{22 + d}</span>
                                                        </div>
                                                        {/* Red Present Time Line */}
                                                        {d === 4 && (
                                                            <div className="absolute left-0 right-0 z-40 pointer-events-none" style={{ top: '812px' }}> {/* Appx 4:15 PM */}
                                                                <div className="h-0.5 bg-red-600 w-full relative shadow-[0_0_4px_rgba(220,38,38,0.5)]">
                                                                    <div className="absolute -left-1.5 -top-1 w-2.5 h-2.5 bg-red-600 rounded-full ring-2 ring-white" />
                                                                </div>
                                                            </div>
                                                        )}
                                                        <div className="flex relative h-full">
                                                            <div className="border-r border-gray-100 relative w-[120px]">
                                                                <div className="h-6 flex items-center justify-center bg-gray-50/80 backdrop-blur-sm border-b border-gray-100 text-[10px] font-black text-gray-500 sticky z-30 top-12">
                                                                    4jussociety
                                                                </div>
                                                                <div className="relative flex-col pointer-events-none" style={{ height: '1120px' }}>
                                                                    {Array.from({ length: 14 }).map((_, i) => (
                                                                        <div key={i} className="h-20 border-b border-gray-200 relative">
                                                                            <div className="absolute top-1/2 w-full border-t border-gray-100 border-dashed pointer-events-none" />
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Slot Editor Panel (Right/Bottom) */}
                    <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-200 flex flex-col w-full xl:w-[400px] shrink-0 h-max sticky top-24">
                        <div className="p-6 bg-indigo-600 text-white flex-shrink-0">
                            <span className="inline-block px-2 py-1 bg-indigo-500 rounded text-[10px] font-bold uppercase tracking-widest mb-2 border border-indigo-400/50">Selected Slot</span>
                            <h2 className="text-2xl font-bold">{currentSlotData?.label}</h2>
                            <p className="text-indigo-100 text-sm mt-1">{currentSlotData?.description}</p>

                            <div className="mt-4 inline-flex items-center text-xs font-semibold bg-indigo-900/30 px-3 py-1.5 rounded-full border border-indigo-500/50">
                                ℹ️ {currentSlotData?.recommendedSize}
                            </div>
                        </div>

                        <div className="flex-1 p-6 overflow-y-auto bg-gray-50/50">
                            {!(ads[selectedSlotId] || []).length ? (
                                <div className="h-full flex flex-col items-center justify-center text-center space-y-4 py-12">
                                    <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center text-gray-400 mb-2">
                                        <ImageIcon className="w-8 h-8" />
                                    </div>
                                    <div className="text-gray-500 font-medium">현재 이 슬롯에는 등록된 <br />광고 배너가 없습니다.</div>
                                    <button
                                        onClick={handleAddAd}
                                        className="flex items-center gap-2 px-6 py-3 bg-white border-2 border-indigo-100 text-indigo-600 font-bold rounded-xl hover:bg-indigo-50 hover:border-indigo-200 transition-colors shadow-sm"
                                    >
                                        <Plus className="w-5 h-5" />
                                        첫 배너 추가하기
                                    </button>
                                </div>
                            ) : (
                                <div className="space-y-6">
                                    {(ads[selectedSlotId] || []).map((ad, index) => (
                                        <div key={ad.id} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col relative">
                                            <div className="flex items-center justify-between bg-gray-50 p-3 border-b border-gray-200">
                                                <span className="font-bold text-sm text-gray-700"># {index + 1} 배너 ({ad.is_active ? '활성' : '숨김'})</span>
                                                <div className="flex items-center gap-3">
                                                    <label className="flex items-center cursor-pointer">
                                                        <div className="relative">
                                                            <input
                                                                type="checkbox"
                                                                className="sr-only"
                                                                checked={ad.is_active}
                                                                onChange={e => handleChange(ad.id, 'is_active', e.target.checked)}
                                                            />
                                                            <div className={`block w-10 h-6 rounded-full transition-colors ${ad.is_active ? 'bg-green-500' : 'bg-gray-300'}`}></div>
                                                            <div className={`dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${ad.is_active ? 'translate-x-4' : ''}`}></div>
                                                        </div>
                                                    </label>
                                                    <button onClick={() => handleDelete(ad.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors group relative" title="배너 삭제">
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </div>
                                            <div className="p-4 space-y-4">
                                                <div>
                                                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">노출 이미지 업로드 *</label>

                                                    {ad.image_url ? (
                                                        <div className="relative w-full aspect-[4/1] bg-gray-100 rounded-lg overflow-hidden border border-gray-200 group mb-2">
                                                            <img src={ad.image_url} alt="배너 스크림샷" className="w-full h-full object-cover" />
                                                            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                                <button
                                                                    onClick={() => handleChange(ad.id, 'image_url', '')}
                                                                    className="px-3 py-1.5 bg-white text-red-600 font-bold text-xs rounded-lg shadow-sm hover:bg-red-50"
                                                                >
                                                                    재업로드
                                                                </button>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-gray-300 border-dashed rounded-lg cursor-pointer bg-gray-50 hover:bg-gray-100 transition-colors">
                                                            <div className="flex flex-col items-center justify-center pt-5 pb-6">
                                                                <ImageIcon className="w-6 h-6 mb-2 text-gray-400" />
                                                                <p className="text-xs text-gray-500 font-medium whitespace-nowrap"><span className="font-bold text-indigo-600">클릭하여 이미지 파일 업로드</span></p>
                                                            </div>
                                                            <input type="file" className="hidden" accept="image/*" onChange={async (e) => {
                                                                const file = e.target.files?.[0];
                                                                if (!file) return;

                                                                try {
                                                                    setIsSaving(true);
                                                                    // 1. Storage 버킷에 업로드 (파일명 충돌 방지를 위해 timestamp + random 문자열 사용)
                                                                    const fileExt = file.name.split('.').pop();
                                                                    const fileName = `${Date.now()}_${Math.random().toString(36).substring(2)}.${fileExt}`;
                                                                    const filePath = `banners/${fileName}`;

                                                                    const { error: uploadError } = await supabase.storage
                                                                        .from('global-ads')
                                                                        .upload(filePath, file);

                                                                    if (uploadError) throw uploadError;

                                                                    // 2. Public URL 가져오기
                                                                    const { data: publicUrlData } = supabase.storage
                                                                        .from('global-ads')
                                                                        .getPublicUrl(filePath);

                                                                    // 3. state 업데이트
                                                                    handleChange(ad.id, 'image_url', publicUrlData.publicUrl);

                                                                } catch (error) {
                                                                    console.error('Upload error:', error);
                                                                    alert('이미지 업로드에 실패했습니다. 관리자에게 문의하세요.');
                                                                } finally {
                                                                    setIsSaving(false);
                                                                    // input 초기화 (같은 파일을 다시 선택할 수 있도록)
                                                                    e.target.value = '';
                                                                }
                                                            }} />
                                                        </label>
                                                    )}
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">클릭 시 이동할 링크 URL (선택)</label>
                                                    <input
                                                        type="text"
                                                        value={ad.link_url || ''}
                                                        onChange={e => handleChange(ad.id, 'link_url', e.target.value)}
                                                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all outline-none text-sm placeholder:text-gray-300 placeholder:font-normal"
                                                        placeholder="https://event.com/promo"
                                                    />
                                                </div>
                                                {ad.image_url && (
                                                    <div className="mt-2 bg-checkered rounded overflow-hidden border border-gray-100 flex justify-center py-2 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4IiBoZWlnaHQ9IjgiPgo8cmVjdCB3aWR0aD0iNCIgaGVpZ2h0PSI0IiBmaWxsPSIjZjBmMGYwIi8+CjxyZWN0IHdpZHRoPSI0IiBoZWlnaHQ9IjQiIHg9IjQiIHk9IjQiIGZpbGw9IiNmMGYwZjAiLz4KPC9zdmc+')]">
                                                        <img src={ad.image_url} alt={`Preview ${index}`} className="max-h-24 object-contain" onError={e => e.currentTarget.style.display = 'none'} />
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ))}

                                    <button
                                        onClick={handleAddAd}
                                        className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-white border-2 border-dashed border-indigo-200 text-indigo-600 font-bold rounded-xl hover:bg-indigo-50 hover:border-indigo-400 transition-colors shadow-sm mt-4"
                                    >
                                        <Plus className="w-5 h-5" />
                                        이 슬롯에 새 배너 추가 (스택 쌓기)
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Panel Footer */}
                        <div className="p-5 bg-white border-t border-gray-100 flex justify-end shrink-0">
                            <button
                                onClick={handleSave}
                                disabled={isSaving || !(ads[selectedSlotId] || []).length}
                                className="w-full sm:w-auto flex items-center justify-center gap-2 px-8 py-3.5 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-shadow shadow hover:shadow-lg disabled:opacity-50 disabled:shadow-none"
                            >
                                {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                                <span>이 슬롯 설정 덮어쓰기</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
