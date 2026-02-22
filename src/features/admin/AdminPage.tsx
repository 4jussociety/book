// AdminPage: 최고 관리자(Owner) 전용 시스템 설정 및 관리 대시보드
// 가격 설정, 예약 안내 문자 템플릿, 멤버 관리 연동, 시스템 전체 초기화 등을 담당

import { useState, useEffect } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '@/features/auth/AuthContext'
import { supabase } from '@/lib/supabase'
import { Loader2, Save, MessageSquare, DollarSign, AlertTriangle, ShieldAlert } from 'lucide-react'

const DURATION_BUCKETS = [30, 40, 50, 60]
type DurationPrice = { durationMin: number; priceKrw: number }
const defaultPrices = (): DurationPrice[] => DURATION_BUCKETS.map(d => ({ durationMin: d, priceKrw: 0 }))

export default function AdminPage() {
    const { user, profile } = useAuth()
    const [isLoading, setIsLoading] = useState(false)
    const [organizationName, setOrganizationName] = useState('')
    const [contactNumber, setContactNumber] = useState('')
    const [adminName, setAdminName] = useState('')
    const [messageTemplate, setMessageTemplate] = useState('')
    const [prices, setPrices] = useState<DurationPrice[]>(defaultPrices())

    useEffect(() => {
        if (profile?.is_owner) {
            setOrganizationName(profile.organization_name || '')
            setContactNumber(profile.contact_number || '')
            setAdminName(profile.admin_name || '')
            setMessageTemplate(profile.message_template ||
                `[예약 안내] {환자}님\n일시: {일시}\n장소: {장소}\n담당: {담당자} 선생님`)

            // pricing 배열에서 가격 데이터 매핑
            if (profile.pricing && profile.pricing.length > 0) {
                setPrices(DURATION_BUCKETS.map(d => {
                    const found = profile.pricing?.find(p => p.duration_minutes === d)
                    return { durationMin: d, priceKrw: found?.price || 0 }
                }))
            }
        }
    }, [profile])

    // 만약 관리자가 아니라면 튕겨냅니다.
    if (profile && !profile.is_owner) {
        return <Navigate to="/profile" replace />
    }

    const handleSave = async () => {
        if (!user || !profile?.system_id) return
        setIsLoading(true)
        try {
            // 1. 업체 기본 정보 저장 (systems 테이블)
            const { error: systemError } = await supabase
                .from('systems')
                .update({
                    organization_name: organizationName,
                    contact_number: contactNumber,
                    admin_name: adminName,
                })
                .eq('id', profile.system_id)

            if (systemError) throw systemError

            // 2. 단가 설정 저장 (pricing_settings 테이블 - upsert)
            const pricingData = prices.map(p => ({
                system_id: profile.system_id!,
                duration_minutes: p.durationMin,
                price: p.priceKrw,
            }))

            const { error: pricingError } = await supabase
                .from('pricing_settings')
                .upsert(pricingData, { onConflict: 'system_id,duration_minutes' })

            if (pricingError) throw pricingError

            // 3. 문자 템플릿 저장 (message_templates 테이블 - upsert)
            const { error: templateError } = await supabase
                .from('message_templates')
                .upsert({
                    system_id: profile.system_id!,
                    template_name: '기본 템플릿',
                    template_body: messageTemplate,
                    is_default: true,
                }, { onConflict: 'system_id,template_name' })

            if (templateError) throw templateError

            alert('관리자 설정이 성공적으로 저장되었습니다.')
            window.location.reload()
        } catch (error) {
            console.error('Error updating admin settings:', error)
            alert('저장 중 오류가 발생했습니다.')
        } finally {
            setIsLoading(false)
        }
    }

    const handlePriceChange = (durationMin: number, value: string) => {
        const priceKrw = parseInt(value.replace(/[^0-9]/g, ''), 10) || 0
        const updated = prices.map(p => p.durationMin === durationMin ? { ...p, priceKrw } : p)
        setPrices(updated)
    }



    if (!profile) {
        return <div className="flex h-full items-center justify-center"><Loader2 className="animate-spin text-blue-600" /></div>
    }

    return (
        <div className="max-w-2xl mx-auto p-4 md:p-6 space-y-6 md:space-y-8">
            <header className="flex items-center gap-3">
                <div className="p-3 bg-red-100 text-red-600 rounded-xl">
                    <ShieldAlert className="w-8 h-8" />
                </div>
                <div>
                    <h1 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight">관리자 프로필</h1>
                    <p className="text-gray-500 mt-1 md:mt-2 text-sm">최고 관리자(Owner) 전용 시스템 전역 설정 공간입니다.</p>
                </div>
            </header>

            {/* 업체 기본 정보 */}
            <Section icon={<AlertTriangle className="w-5 h-5" />} iconBg="bg-blue-50" iconColor="text-blue-600" title="업체 기본 정보">
                <div className="space-y-4">
                    <Field label="업체명 (장소)" hint="안내 문자의 {장소} 변수에 들어갈 내용입니다.">
                        <input type="text" value={organizationName} onChange={e => setOrganizationName(e.target.value)}
                            placeholder="예: Re:무브 체형교정"
                            className="w-full px-4 py-2 bg-white text-gray-900 border border-gray-200 rounded-xl font-bold focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all" />
                    </Field>
                    <Field label="관리자 이름" hint="안내 문자의 {담당자} 변수에 들어갈 내용입니다.">
                        <input type="text" value={adminName} onChange={e => setAdminName(e.target.value)}
                            placeholder="예: 홍길동"
                            className="w-full px-4 py-2 bg-white text-gray-900 border border-gray-200 rounded-xl font-bold focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all" />
                    </Field>
                    <Field label="관리자 연락처" hint="안내 문자의 {연락처} 변수에 들어갈 내용입니다.">
                        <input type="text" value={contactNumber} onChange={e => setContactNumber(e.target.value)}
                            placeholder="예: 02-1234-5678"
                            className="w-full px-4 py-2 bg-white text-gray-900 border border-gray-200 rounded-xl font-bold focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all" />
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
            </Section>

            {/* 예약 문자 설정 */}
            <Section icon={<MessageSquare className="w-5 h-5" />} iconBg="bg-indigo-50" iconColor="text-indigo-600" title="예약 안내 문자 공통 템플릿">
                <div className="bg-white border border-gray-200 rounded-xl p-4 mb-3">
                    <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">사용 가능한 변수</h3>
                    <div className="flex flex-wrap gap-2 text-sm font-medium">
                        {['{환자}', '{일시}', '{장소}', '{담당자}', '{연락처}'].map(v => (
                            <code key={v} className="px-2 py-1 bg-gray-100 rounded text-gray-700 text-xs">{v}</code>
                        ))}
                    </div>
                </div>
                <label className="block text-sm font-bold text-gray-700 mb-1">
                    문자 템플릿 작성
                </label>
                <textarea value={messageTemplate} onChange={e => setMessageTemplate(e.target.value)}
                    rows={6}
                    className="w-full px-4 py-3 bg-white text-gray-900 border border-gray-200 rounded-xl font-medium focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all resize-none"
                    placeholder="예약 안내 문자 양식을 입력하세요..." />
                <div className="bg-indigo-50 rounded-xl p-4 border border-indigo-100 mt-3">
                    <span className="text-xs font-bold text-indigo-400 uppercase tracking-wider block mb-2">미리보기 (실제 예시)</span>
                    <pre className="text-sm text-indigo-900 whitespace-pre-wrap font-sans">
                        {messageTemplate
                            .replace('{환자}', '김철수')
                            .replace('{일시}', '2024년 3월 15일(금) 14:00')
                            .replace('{장소}', organizationName || 'Re:무브 체형교정')
                            .replace('{담당자}', adminName || profile.full_name || '홍길동')
                            .replace('{연락처}', contactNumber || '02-123-4567')
                        }
                    </pre>
                </div>
            </Section>



            {/* 플로팅/스틱키 하단 저장 버튼 */}
            <div className="flex justify-end sticky bottom-4">
                <button onClick={handleSave} disabled={isLoading}
                    className="flex items-center gap-2 px-6 py-3 bg-gray-900 text-white font-bold rounded-xl hover:bg-black transition-all shadow-xl hover:shadow-2xl disabled:opacity-50 active:scale-95">
                    {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                    <span>관리자 전역 설정 적용</span>
                </button>
            </div>
        </div>
    )
}

function Section({ icon, iconBg, iconColor, title, children }: {
    icon: React.ReactNode; iconBg: string; iconColor: string; title: string; children: React.ReactNode
}) {
    return (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-4 md:p-6 border-b border-gray-100">
                <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 ${iconBg} rounded-full flex items-center justify-center ${iconColor}`}>{icon}</div>
                    <h2 className="text-lg font-bold text-gray-900">{title}</h2>
                </div>
            </div>
            <div className="p-4 md:p-6">{children}</div>
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

