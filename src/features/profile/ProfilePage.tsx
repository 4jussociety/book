// ProfilePage: 프로필 설정 페이지
// 기본 정보, 예약 문자 템플릿, 단가 설정을 관리

import { useState, useEffect } from 'react'
import { useAuth } from '@/features/auth/AuthContext'
import { supabase } from '@/lib/supabase'
import { Loader2, Save, User, MessageSquare, DollarSign } from 'lucide-react'

// ─── 단가 localStorage 키 ─────────────────────────────────────────
const PRICE_KEY = 'clinic_duration_prices'

const DURATION_BUCKETS = [30, 40, 50, 60, 90]

type DurationPrice = { durationMin: number; priceKrw: number }

const defaultPrices = (): DurationPrice[] =>
    DURATION_BUCKETS.map(d => ({ durationMin: d, priceKrw: 0 }))

const loadPrices = (): DurationPrice[] => {
    try { return JSON.parse(localStorage.getItem(PRICE_KEY) || '') } catch { return defaultPrices() }
}
const savePrices = (p: DurationPrice[]) => localStorage.setItem(PRICE_KEY, JSON.stringify(p))

// ─── 컴포넌트 ────────────────────────────────────────────────────────────────
export default function ProfilePage() {
    const { user, profile } = useAuth()
    const [isLoading, setIsLoading] = useState(false)
    const [fullName, setFullName] = useState('')
    const [organizationName, setOrganizationName] = useState('')
    const [contactNumber, setContactNumber] = useState('')
    const [messageTemplate, setMessageTemplate] = useState('')

    const [prices, setPrices] = useState<DurationPrice[]>(loadPrices)

    useEffect(() => {
        if (profile) {
            setFullName(profile.full_name || '')
            setOrganizationName(profile.organization_name || 'Re:무브 체형교정')
            setContactNumber(profile.contact_number || '')
            setMessageTemplate(profile.message_template ||
                `[예약 안내] {환자}님
일시: {일시}
장소: Re:무브 체형교정
담당: {담당자} 선생님`)
        }
    }, [profile])

    const handleSave = async () => {
        if (!user) return
        setIsLoading(true)
        try {
            const { error } = await supabase
                .from('profiles')
                .update({
                    full_name: fullName,
                    organization_name: organizationName,
                    contact_number: contactNumber,
                    message_template: messageTemplate,
                    updated_at: new Date().toISOString(),
                })
                .eq('id', user.id)
            if (error) throw error
            alert('프로필이 저장되었습니다.')
            window.location.reload()
        } catch (error) {
            console.error('Error updating profile:', error)
            alert('저장 중 오류가 발생했습니다.')
        } finally {
            setIsLoading(false)
        }
    }

    const handlePriceChange = (durationMin: number, value: string) => {
        const priceKrw = parseInt(value.replace(/[^0-9]/g, ''), 10) || 0
        const updated = prices.map(p => p.durationMin === durationMin ? { ...p, priceKrw } : p)
        setPrices(updated)
        savePrices(updated)
    }

    if (!profile) {
        return <div className="flex h-full items-center justify-center"><Loader2 className="animate-spin text-blue-600" /></div>
    }

    return (
        <div className="max-w-2xl mx-auto p-6 space-y-8">
            <header>
                <h1 className="text-3xl font-black text-gray-900 tracking-tight">프로필 설정</h1>
                <p className="text-gray-500 mt-2">개인 정보, 단가를 설정하세요.</p>
            </header>

            {/* 기본 정보 */}
            <Section icon={<User className="w-5 h-5" />} iconBg="bg-blue-50" iconColor="text-blue-600" title="기본 정보">
                <div className="space-y-4">
                    <Field label="이메일">
                        <input type="text" value={profile.email || user?.email || ''} disabled
                            className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-gray-500 font-medium" />
                    </Field>
                    <Field label="이름 (표시명)" hint="예약 캘린더와 안내 문자에 표시될 이름입니다.">
                        <input type="text" value={fullName} onChange={e => setFullName(e.target.value)}
                            placeholder="이름을 입력하세요"
                            className="w-full px-4 py-2 bg-white border border-gray-200 rounded-xl text-gray-900 font-bold focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all" />
                    </Field>
                    <Field label="업체명 (장소)" hint="안내 문자의 {장소} 변수에 들어갈 내용입니다.">
                        <input type="text" value={organizationName} onChange={e => setOrganizationName(e.target.value)}
                            placeholder="예: Re:무브 체형교정"
                            className="w-full px-4 py-2 bg-white border border-gray-200 rounded-xl text-gray-900 font-bold focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all" />
                    </Field>
                    <Field label="연락처" hint="안내 문자의 {연락처} 변수에 들어갈 내용입니다.">
                        <input type="text" value={contactNumber} onChange={e => setContactNumber(e.target.value)}
                            placeholder="예: 02-1234-5678"
                            className="w-full px-4 py-2 bg-white border border-gray-200 rounded-xl text-gray-900 font-bold focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all" />
                    </Field>
                </div>
            </Section>

            {/* 단가 설정 */}
            <Section icon={<DollarSign className="w-5 h-5" />} iconBg="bg-green-50" iconColor="text-green-600" title="치료 시간별 단가 설정">
                <p className="text-xs text-gray-400 mb-4">각 치료 시간 구간의 1회당 단가를 설정합니다. (통계 매출 계산에 사용)</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {prices.map(p => (
                        <div key={p.durationMin} className="flex items-center gap-3 bg-gray-50 px-4 py-3 rounded-xl">
                            <span className="text-sm font-black text-gray-700 w-12 flex-shrink-0">{p.durationMin}분</span>
                            <div className="flex-1 flex items-center">
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    value={p.priceKrw > 0 ? p.priceKrw.toLocaleString() : ''}
                                    onChange={e => handlePriceChange(p.durationMin, e.target.value)}
                                    placeholder="0"
                                    className="w-full text-right px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-sm font-bold text-gray-900 focus:ring-2 focus:ring-green-500/20 focus:border-green-500 outline-none transition-all"
                                />
                                <span className="ml-2 text-xs text-gray-400 font-bold flex-shrink-0">원</span>
                            </div>
                        </div>
                    ))}
                </div>
                <p className="text-[11px] text-gray-400 mt-3">※ 단가는 브라우저에 자동 저장됩니다.</p>
            </Section>


            {/* 예약 문자 설정 */}
            <Section icon={<MessageSquare className="w-5 h-5" />} iconBg="bg-indigo-50" iconColor="text-indigo-600" title="예약 안내 문자 설정">
                <div className="bg-white border border-gray-200 rounded-xl p-4 mb-3">
                    <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">사용 가능한 변수</h3>
                    <div className="flex flex-wrap gap-2 text-sm font-medium">
                        {['{환자}', '{일시}', '{장소}', '{담당자}', '{연락처}'].map(v => (
                            <code key={v} className="px-2 py-1 bg-gray-100 rounded text-gray-700 text-xs">{v}</code>
                        ))}
                    </div>
                </div>
                <label className="block text-sm font-bold text-gray-700 mb-1">문자 템플릿</label>
                <textarea value={messageTemplate} onChange={e => setMessageTemplate(e.target.value)}
                    rows={6}
                    className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-gray-900 font-medium focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all resize-none"
                    placeholder="예약 안내 문자 양식을 입력하세요..." />
                <div className="bg-indigo-50 rounded-xl p-4 border border-indigo-100 mt-3">
                    <span className="text-xs font-bold text-indigo-400 uppercase tracking-wider block mb-2">미리보기</span>
                    <pre className="text-sm text-indigo-900 whitespace-pre-wrap font-sans">
                        {messageTemplate
                            .replace('{환자}', '김철수')
                            .replace('{일시}', '2024년 3월 15일(금) 14:00')
                            .replace('{장소}', organizationName || 'Re:무브 체형교정')
                            .replace('{담당자}', fullName || '홍길동')
                            .replace('{연락처}', contactNumber || '02-123-4567')
                        }
                    </pre>
                </div>
            </Section>

            <div className="flex justify-end">
                <button onClick={handleSave} disabled={isLoading}
                    className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-all shadow-lg hover:shadow-xl disabled:opacity-50 active:scale-95">
                    {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                    <span>변경사항 저장</span>
                </button>
            </div>
        </div>
    )
}

// ─── 헬퍼 컴포넌트 ───────────────────────────────────────────────────────────
function Section({ icon, iconBg, iconColor, title, children }: {
    icon: React.ReactNode; iconBg: string; iconColor: string; title: string; children: React.ReactNode
}) {
    return (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-6 border-b border-gray-100">
                <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 ${iconBg} rounded-full flex items-center justify-center ${iconColor}`}>{icon}</div>
                    <h2 className="text-lg font-bold text-gray-900">{title}</h2>
                </div>
            </div>
            <div className="p-6">{children}</div>
        </div>
    )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
    return (
        <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">{label}</label>
            {children}
            {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
        </div>
    )
}
