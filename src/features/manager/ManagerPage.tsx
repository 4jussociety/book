// ManagerPage: 시스템 설정 및 관리 대시보드
// 가격 설정, 예약 안내 문자 템플릿, 멤버 관리 연동, 시스템 전체 초기화 등을 담당

import { useState, useEffect } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '@/features/auth/AuthContext'
import { supabase } from '@/lib/supabase'
import { Loader2, Save, MessageSquare, DollarSign, AlertTriangle, ShieldAlert, Trash2, UserCheck, X } from 'lucide-react'

const DURATION_BUCKETS = [30, 40, 50, 60]
type DurationPrice = { durationMin: number; sessionType: import('@/types/db').SessionType; priceKrw: number }
const defaultPrices = (): DurationPrice[] => [
    ...DURATION_BUCKETS.map(d => ({ durationMin: d, sessionType: 'normal' as const, priceKrw: 0 })),
    ...DURATION_BUCKETS.map(d => ({ durationMin: d, sessionType: 'option1' as const, priceKrw: 0 })),
    ...DURATION_BUCKETS.map(d => ({ durationMin: d, sessionType: 'option2' as const, priceKrw: 0 })),
    ...DURATION_BUCKETS.map(d => ({ durationMin: d, sessionType: 'option3' as const, priceKrw: 0 })),
]

type PackageItem = {
    id?: string // 신규 추가시 없음
    name: string
    session_type: string
    total_sessions: number
    default_price: number
    valid_days: number | null
}


export default function ManagerPage() {
    const { user, profile, refreshProfile } = useAuth()
    const [isLoading, setIsLoading] = useState(false)
    const [organizationName, setOrganizationName] = useState('')
    const [contactNumber, setContactNumber] = useState('')
    const [managerName, setManagerName] = useState('')
    const [option1Name, setOption1Name] = useState('')
    const [option2Name, setOption2Name] = useState('')
    const [option3Name, setOption3Name] = useState('')
    const [messageTemplate, setMessageTemplate] = useState('')
    const [resetConfirm, setResetConfirm] = useState('')
    const [isResetting, setIsResetting] = useState(false)
    const [prices, setPrices] = useState<DurationPrice[]>(defaultPrices())
    const [packages, setPackages] = useState<PackageItem[]>([])
    const [deletedPackageIds, setDeletedPackageIds] = useState<string[]>([])

    useEffect(() => {
        if (profile?.is_owner) {
            setOrganizationName(profile.organization_name || '')
            setContactNumber(profile.contact_number || '')
            setManagerName(profile.manager_name || '')
            setOption1Name(profile.option1_name || '')
            setOption2Name(profile.option2_name || '')
            setOption3Name(profile.option3_name || '')
            setMessageTemplate(profile.message_template ||
                `[예약 안내] {고객}님\n일시: {일시}\n장소: {장소}\n담당: {담당자} 선생님`)

            // pricing 배열에서 가격 데이터 매핑
            if (profile.pricing && profile.pricing.length > 0) {
                const newPrices = defaultPrices().map(dp => {
                    const found = profile.pricing?.find(p => p.duration_minutes === dp.durationMin && p.session_type === dp.sessionType)
                    return { ...dp, priceKrw: found?.price || 0 }
                })
                setPrices(newPrices)
            }

            // 패키지 상품 로드
            const loadPackages = async () => {
                const { data } = await supabase
                    .from('membership_packages')
                    .select('*')
                    .eq('system_id', profile.system_id)
                    .order('created_at', { ascending: true })
                if (data) {
                    setPackages(data.map(d => ({
                        id: d.id,
                        name: d.name,
                        session_type: d.session_type,
                        total_sessions: d.total_sessions,
                        default_price: d.default_price,
                        valid_days: d.valid_days
                    })))
                }
            }
            loadPackages()
        }
    }, [profile])

    // 만약 매니저가 아니라면 튕겨냅니다.
    if (profile && !profile.is_owner) {
        return <Navigate to="/profile" replace />
    }

    // 1. 업체 기본 정보 저장
    const handleSaveOrganizationInfo = async () => {
        if (!user || !profile?.system_id) return
        setIsLoading(true)
        try {
            const { error: systemError } = await supabase
                .from('systems')
                .update({
                    organization_name: organizationName,
                    contact_number: contactNumber,
                    manager_name: managerName,
                })
                .eq('id', profile.system_id)

            if (systemError) throw systemError
            alert('업체 기본 정보가 성공적으로 저장되었습니다.')
        } catch (error) {
            console.error('Error updating organization info:', error)
            alert('업체 기본 정보 저장 중 오류가 발생했습니다.')
        } finally {
            setIsLoading(false)
        }
    }

    // 2. 예약 안내 문자 템플릿 저장
    const handleSaveTemplate = async () => {
        if (!user || !profile?.system_id) return
        setIsLoading(true)
        try {
            const { error: templateError } = await supabase
                .from('message_templates')
                .upsert({
                    system_id: profile.system_id!,
                    template_name: '기본 템플릿',
                    template_body: messageTemplate,
                    is_default: true,
                }, { onConflict: 'system_id,template_name' })

            if (templateError) throw templateError
            alert('안내 문자 템플릿이 성공적으로 저장되었습니다.')
        } catch (error) {
            console.error('Error updating template info:', error)
            alert('템플릿 저장 중 오류가 발생했습니다.')
        } finally {
            setIsLoading(false)
        }
    }

    // 3. 단가 및 수업 종류 설정 저장
    const handleSavePricing = async () => {
        if (!user || !profile?.system_id) return
        setIsLoading(true)
        try {
            const { error: systemError } = await supabase
                .from('systems')
                .update({
                    option1_name: option1Name || null,
                    option2_name: option2Name || null,
                    option3_name: option3Name || null,
                })
                .eq('id', profile.system_id)
            if (systemError) throw systemError

            const pricingData = prices.map(p => ({
                system_id: profile.system_id!,
                duration_minutes: p.durationMin,
                session_type: p.sessionType,
                price: p.priceKrw,
            }))

            const { error: pricingError } = await supabase
                .from('pricing_settings')
                .upsert(pricingData, { onConflict: 'system_id,duration_minutes,session_type' })

            if (pricingError) throw pricingError
            alert('단가 및 수업 설정이 성공적으로 저장되었습니다.')
            await refreshProfile()
        } catch (error) {
            console.error('Error updating pricing:', error)
            alert('단가 설정 저장 중 오류가 발생했습니다.')
        } finally {
            setIsLoading(false)
        }
    }

    // 4. 패키지 상품 저장
    const handleSavePackages = async () => {
        if (!user || !profile?.system_id) return
        setIsLoading(true)
        try {
            if (deletedPackageIds.length > 0) {
                const { error: delError } = await supabase
                    .from('membership_packages')
                    .delete()
                    .in('id', deletedPackageIds)
                if (delError) throw delError
            }

            // 기존 패키지 (id 있음) -> upsert
            const packagesToUpdate = packages
                .filter(pkg => pkg.id)
                .map(pkg => ({
                    id: pkg.id,
                    system_id: profile.system_id!,
                    name: pkg.name,
                    session_type: pkg.session_type,
                    total_sessions: pkg.total_sessions,
                    default_price: pkg.default_price,
                    valid_days: pkg.valid_days
                }))

            // 신규 패키지 (id 없음) -> insert (id 키 자체를 생략해야 400 에러 발생 안함)
            const packagesToInsert = packages
                .filter(pkg => !pkg.id)
                .map(pkg => ({
                    system_id: profile.system_id!,
                    name: pkg.name,
                    session_type: pkg.session_type,
                    total_sessions: pkg.total_sessions,
                    default_price: pkg.default_price,
                    valid_days: pkg.valid_days
                }))

            if (packagesToUpdate.length > 0) {
                const { error: updateError } = await supabase
                    .from('membership_packages')
                    .upsert(packagesToUpdate)
                if (updateError) throw updateError
            }

            if (packagesToInsert.length > 0) {
                const { error: insertError } = await supabase
                    .from('membership_packages')
                    .insert(packagesToInsert)
                if (insertError) throw insertError
            }

            setDeletedPackageIds([]) // 삭제 처리 완료 후 초기화
            alert('패키지 상품 설정이 성공적으로 저장되었습니다.')

            // 패키지 상품 재로드
            const { data } = await supabase
                .from('membership_packages')
                .select('*')
                .eq('system_id', profile.system_id)
                .order('created_at', { ascending: true })
            if (data) {
                setPackages(data.map(d => ({
                    id: d.id,
                    name: d.name,
                    session_type: d.session_type,
                    total_sessions: d.total_sessions,
                    default_price: d.default_price,
                    valid_days: d.valid_days
                })))
            }
        } catch (error) {
            console.error('Error updating packages:', error)
            alert('패키지 설정 저장 중 오류가 발생했습니다.')
        } finally {
            setIsLoading(false)
        }
    }

    const handleDeleteSystem = async () => {
        if (resetConfirm !== '초기화') return
        if (!profile?.system_id) return
        if (!confirm('정말로 시스템을 완전히 삭제하시겠습니까?\n\n모든 멤버 계정, 고객, 예약, 설정 데이터가 영구 삭제됩니다.\n이 작업은 되돌릴 수 없습니다.')) return

        setIsResetting(true)
        try {
            const { data: sessionData } = await supabase.auth.getSession()
            if (!sessionData.session) throw new Error('세션이 만료되었습니다.')

            const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
            const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

            const response = await fetch(`${supabaseUrl}/functions/v1/delete-system`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${sessionData.session.access_token}`,
                    'apikey': supabaseAnonKey
                },
                body: JSON.stringify({ systemId: profile.system_id })
            })

            if (!response.ok) {
                const errData = await response.json().catch(() => null)
                throw new Error(errData?.error || '시스템 삭제 실패')
            }

            await refreshProfile()
            // system_id가 null이 되면 RootLayout에서 SystemSetupModal이 자동으로 나타남
        } catch (err: any) {
            console.error('시스템 삭제 실패:', err)
            alert(err?.message || '시스템 삭제에 실패했습니다.')
        } finally {
            setIsResetting(false)
            setResetConfirm('')
        }
    }



    const handlePriceChange = (sessionType: string, durationMin: number, value: string) => {
        const priceKrw = parseInt(value.replace(/[^0-9]/g, ''), 10) || 0
        const updated = prices.map(p => (p.durationMin === durationMin && p.sessionType === sessionType) ? { ...p, priceKrw } : p)
        setPrices(updated)
    }

    const handleAddPackage = () => {
        setPackages([...packages, { name: '', session_type: 'normal', total_sessions: 10, default_price: 0, valid_days: null }])
    }

    const handleUpdatePackage = (index: number, field: keyof PackageItem, value: any) => {
        const newPackages = [...packages]
        newPackages[index] = { ...newPackages[index], [field]: value }
        setPackages(newPackages)
    }

    const handleRemovePackage = (index: number) => {
        const pkg = packages[index]
        if (pkg.id) {
            setDeletedPackageIds([...deletedPackageIds, pkg.id])
        }
        setPackages(packages.filter((_, i) => i !== index))
    }

    if (!profile) {
        return <div className="flex h-full items-center justify-center"><Loader2 className="animate-spin text-blue-600" /></div>
    }

    return (
        <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-6 md:space-y-8">
            <header className="flex items-center gap-3">
                <div className="p-3 bg-red-100 text-red-600 rounded-xl">
                    <ShieldAlert className="w-8 h-8" />
                </div>
                <div>
                    <h1 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight">매니저 프로필</h1>
                    <p className="text-gray-500 mt-1 md:mt-2 text-sm">최고 매니저(Owner) 전용 시스템 전역 설정 공간입니다.</p>
                </div>
            </header>

            {/* 상단 2단 배치: 업체 기본 정보 & 예약 안내 문자 설정 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8">
                {/* 업체 기본 정보 */}
                <Section icon={<AlertTriangle className="w-5 h-5" />} iconBg="bg-blue-50" iconColor="text-blue-600" title="업체 기본 정보">
                    <div className="space-y-4">
                        <Field label="업체명 (장소)" hint="안내 문자의 {장소} 변수에 들어갈 내용입니다.">
                            <input type="text" value={organizationName} onChange={e => setOrganizationName(e.target.value)}
                                placeholder="예: Re:무브 체형교정"
                                className="w-full px-4 py-2 bg-white text-gray-900 border border-gray-200 rounded-xl font-bold focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all" />
                        </Field>
                        <Field label="매니저 이름" hint="안내 문자의 {담당자} 변수에 들어갈 내용입니다.">
                            <input type="text" value={managerName} onChange={e => setManagerName(e.target.value)}
                                placeholder="예: 홍길동"
                                className="w-full px-4 py-2 bg-white text-gray-900 border border-gray-200 rounded-xl font-bold focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all" />
                        </Field>
                        <Field label="매니저 연락처" hint="안내 문자의 {연락처} 변수에 들어갈 내용입니다.">
                            <input type="text" value={contactNumber} onChange={e => setContactNumber(e.target.value)}
                                placeholder="예: 02-1234-5678"
                                className="w-full px-4 py-2 bg-white text-gray-900 border border-gray-200 rounded-xl font-bold focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all" />
                        </Field>
                    </div>

                    <div className="mt-6 flex justify-end">
                        <button onClick={handleSaveOrganizationInfo} disabled={isLoading}
                            className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-all shadow-md hover:shadow-lg disabled:opacity-50 text-sm">
                            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                            <span>업체 정보 저장</span>
                        </button>
                    </div>
                </Section>

                {/* 예약 문자 설정 */}
                <Section icon={<MessageSquare className="w-5 h-5" />} iconBg="bg-indigo-50" iconColor="text-indigo-600" title="예약 안내 문자 공통 템플릿">
                    <div className="bg-white border border-gray-200 rounded-xl p-4 mb-3">
                        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">사용 가능한 변수</h3>
                        <div className="flex flex-wrap gap-2 text-sm font-medium">
                            {['{고객}', '{일시}', '{장소}', '{담당자}', '{연락처}'].map(v => (
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
                                .replace('{고객}', '김철수')
                                .replace('{일시}', '2024년 3월 15일(금) 14:00')
                                .replace('{장소}', organizationName || 'Re:무브 체형교정')
                                .replace('{담당자}', managerName || profile.full_name || '홍길동')
                                .replace('{연락처}', contactNumber || '02-123-4567')
                            }
                        </pre>
                    </div>

                    <div className="mt-6 flex justify-end">
                        <button onClick={handleSaveTemplate} disabled={isLoading}
                            className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-all shadow-md hover:shadow-lg disabled:opacity-50 text-sm">
                            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                            <span>템플릿 저장</span>
                        </button>
                    </div>
                </Section>
            </div>

            {/* 단가 및 수업 종류 설정 (Matrix Layout) */}
            <Section icon={<DollarSign className="w-5 h-5" />} iconBg="bg-green-50" iconColor="text-green-600" title="수업 종류 및 단가 설정">
                <p className="text-xs text-gray-400 mb-4">운영하실 수업 종류의 이름을 정하고, 각 시간별 1회당 단가를 입력하세요. 비워두면 표출되지 않습니다.</p>

                <div className="overflow-x-auto rounded-xl border border-gray-200">
                    <table className="w-full text-left bg-white min-w-[600px]">
                        <thead>
                            <tr className="bg-gray-50 border-b border-gray-200">
                                <th className="px-4 py-3 text-xs font-black text-gray-500 w-1/4">수업 종류명</th>
                                {DURATION_BUCKETS.map(d => (
                                    <th key={d} className="px-2 py-3 text-xs font-black text-gray-500 text-center w-[18%]">{d}분 단가</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {/* 매뉴얼PT (이름 고정) */}
                            <tr className="hover:bg-green-50/30 transition-colors">
                                <td className="px-4 py-3">
                                    <div className="w-full px-3 py-2 bg-gray-100 text-gray-500 border border-gray-200 rounded-lg text-sm font-bold flex items-center justify-center">
                                        매뉴얼PT
                                    </div>
                                </td>
                                {DURATION_BUCKETS.map(d => {
                                    const priceObj = prices.find(p => p.sessionType === 'normal' && p.durationMin === d)
                                    return (
                                        <td key={d} className="px-2 py-3 text-center">
                                            <input
                                                type="text" inputMode="numeric"
                                                value={priceObj?.priceKrw ? priceObj.priceKrw.toLocaleString() : ''}
                                                onChange={e => handlePriceChange('normal', d, e.target.value)}
                                                placeholder="0"
                                                className="w-full text-right px-2 py-1.5 bg-white border border-gray-200 rounded-lg text-sm font-bold text-gray-900 focus:ring-2 focus:ring-green-500/20 focus:border-green-500 outline-none transition-all placeholder-gray-300"
                                            />
                                        </td>
                                    )
                                })}
                            </tr>
                            {/* 옵션 1 */}
                            <tr className="hover:bg-green-50/30 transition-colors">
                                <td className="px-4 py-3">
                                    <input
                                        type="text" value={option1Name} onChange={e => setOption1Name(e.target.value)}
                                        placeholder="옵션 1 (예: 체형교정)"
                                        className="w-full text-center px-3 py-2 bg-white border border-orange-200 rounded-lg text-sm font-bold text-gray-900 focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none transition-all placeholder-gray-300"
                                    />
                                </td>
                                {DURATION_BUCKETS.map(d => {
                                    const priceObj = prices.find(p => p.sessionType === 'option1' && p.durationMin === d)
                                    return (
                                        <td key={d} className="px-2 py-3 text-center">
                                            <input
                                                type="text" inputMode="numeric" disabled={!option1Name.trim()}
                                                value={priceObj?.priceKrw ? priceObj.priceKrw.toLocaleString() : ''}
                                                onChange={e => handlePriceChange('option1', d, e.target.value)}
                                                placeholder="0"
                                                className="w-full text-right px-2 py-1.5 bg-white border border-gray-200 rounded-lg text-sm font-bold text-gray-900 focus:ring-2 focus:ring-green-500/20 focus:border-green-500 outline-none transition-all disabled:bg-gray-50 disabled:text-transparent disabled:border-gray-100 placeholder-gray-300"
                                            />
                                        </td>
                                    )
                                })}
                            </tr>
                            {/* 옵션 2 */}
                            <tr className="hover:bg-green-50/30 transition-colors">
                                <td className="px-4 py-3">
                                    <input
                                        type="text" value={option2Name} onChange={e => setOption2Name(e.target.value)}
                                        placeholder="옵션 2 (예: 재활)"
                                        className="w-full text-center px-3 py-2 bg-white border border-orange-200 rounded-lg text-sm font-bold text-gray-900 focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none transition-all placeholder-gray-300"
                                    />
                                </td>
                                {DURATION_BUCKETS.map(d => {
                                    const priceObj = prices.find(p => p.sessionType === 'option2' && p.durationMin === d)
                                    return (
                                        <td key={d} className="px-2 py-3 text-center">
                                            <input
                                                type="text" inputMode="numeric" disabled={!option2Name.trim()}
                                                value={priceObj?.priceKrw ? priceObj.priceKrw.toLocaleString() : ''}
                                                onChange={e => handlePriceChange('option2', d, e.target.value)}
                                                placeholder="0"
                                                className="w-full text-right px-2 py-1.5 bg-white border border-gray-200 rounded-lg text-sm font-bold text-gray-900 focus:ring-2 focus:ring-green-500/20 focus:border-green-500 outline-none transition-all disabled:bg-gray-50 disabled:text-transparent disabled:border-gray-100 placeholder-gray-300"
                                            />
                                        </td>
                                    )
                                })}
                            </tr>
                            {/* 옵션 3 */}
                            <tr className="hover:bg-green-50/30 transition-colors">
                                <td className="px-4 py-3">
                                    <input
                                        type="text" value={option3Name} onChange={e => setOption3Name(e.target.value)}
                                        placeholder="옵션 3 (미사용시 비움)"
                                        className="w-full text-center px-3 py-2 bg-white border border-orange-200 rounded-lg text-sm font-bold text-gray-900 focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none transition-all placeholder-gray-300"
                                    />
                                </td>
                                {DURATION_BUCKETS.map(d => {
                                    const priceObj = prices.find(p => p.sessionType === 'option3' && p.durationMin === d)
                                    return (
                                        <td key={d} className="px-2 py-3 text-center">
                                            <input
                                                type="text" inputMode="numeric" disabled={!option3Name.trim()}
                                                value={priceObj?.priceKrw ? priceObj.priceKrw.toLocaleString() : ''}
                                                onChange={e => handlePriceChange('option3', d, e.target.value)}
                                                placeholder="0"
                                                className="w-full text-right px-2 py-1.5 bg-white border border-gray-200 rounded-lg text-sm font-bold text-gray-900 focus:ring-2 focus:ring-green-500/20 focus:border-green-500 outline-none transition-all disabled:bg-gray-50 disabled:text-transparent disabled:border-gray-100 placeholder-gray-300"
                                            />
                                        </td>
                                    )
                                })}
                            </tr>
                        </tbody>
                    </table>
                </div>

                <div className="mt-6 flex justify-end">
                    <button onClick={handleSavePricing} disabled={isLoading}
                        className="flex items-center gap-2 px-5 py-2.5 bg-green-600 text-white font-bold rounded-xl hover:bg-green-700 transition-all shadow-md hover:shadow-lg disabled:opacity-50 text-sm">
                        {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        <span>수업 단가 설정 저장</span>
                    </button>
                </div>
            </Section>

            {/* 패키지/상품 설정 (Membership Packages) */}
            <Section icon={<UserCheck className="w-5 h-5" />} iconBg="bg-teal-50" iconColor="text-teal-600" title="회원권 상품(패키지) 설정">
                <p className="text-xs text-gray-400 mb-4">예약 화면에서 고객에게 즉시 발급할 수 있는 회원권 상품(패키지) 메뉴팩을 무제한으로 등록해 둘 수 있습니다.</p>

                <div className="overflow-x-auto rounded-xl border border-gray-200 mb-3">
                    <table className="w-full text-left bg-white min-w-[700px]">
                        <thead>
                            <tr className="bg-gray-50 border-b border-gray-200">
                                <th className="px-3 py-3 text-xs font-black text-gray-500 w-[22%]">상품명</th>
                                <th className="px-3 py-3 text-xs font-black text-gray-500 text-center w-[15%]">적용 수업</th>
                                <th className="px-3 py-3 text-xs font-black text-gray-500 text-center w-[12%]">총 횟수</th>
                                <th className="px-3 py-3 text-xs font-black text-gray-500 text-center w-[18%]">기본 결제금액</th>
                                <th className="px-3 py-3 text-xs font-black text-gray-500 text-center w-[15%]">유효기간 (일)</th>
                                <th className="px-3 py-3 text-xs font-black text-gray-500 text-center w-[10%]">삭제</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {packages.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-400 font-medium bg-gray-50/50">
                                        등록된 상품이 없습니다. 하단의 [+ 새 상품 추가] 버튼을 눌러 추가해주세요.
                                    </td>
                                </tr>
                            ) : (
                                packages.map((pkg, index) => (
                                    <tr key={index} className="hover:bg-teal-50/20 transition-colors">
                                        <td className="px-2 py-2">
                                            <input
                                                type="text" value={pkg.name} onChange={e => handleUpdatePackage(index, 'name', e.target.value)}
                                                placeholder="상품명 입력"
                                                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm font-bold text-gray-900 focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none transition-all placeholder-gray-300"
                                            />
                                        </td>
                                        <td className="px-2 py-2">
                                            <select
                                                value={pkg.session_type} onChange={e => handleUpdatePackage(index, 'session_type', e.target.value)}
                                                className="w-full px-2 py-2 bg-white border border-gray-200 rounded-lg text-sm font-bold text-gray-900 focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none transition-all cursor-pointer"
                                            >
                                                <option value="normal">매뉴얼PT</option>
                                                {option1Name && <option value="option1">{option1Name}</option>}
                                                {option2Name && <option value="option2">{option2Name}</option>}
                                                {option3Name && <option value="option3">{option3Name}</option>}
                                            </select>
                                        </td>
                                        <td className="px-2 py-2">
                                            <div className="flex items-center">
                                                <input
                                                    type="number" min="1" value={pkg.total_sessions || ''} onChange={e => handleUpdatePackage(index, 'total_sessions', parseInt(e.target.value) || 0)}
                                                    className="w-full text-center px-2 py-2 bg-white border border-gray-200 rounded-lg text-sm font-bold text-gray-900 focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none transition-all"
                                                />
                                                <span className="ml-1 text-xs text-gray-500 font-bold shrink-0">회</span>
                                            </div>
                                        </td>
                                        <td className="px-2 py-2">
                                            <div className="flex items-center">
                                                <input
                                                    type="text" inputMode="numeric"
                                                    value={pkg.default_price ? pkg.default_price.toLocaleString() : ''}
                                                    onChange={e => handleUpdatePackage(index, 'default_price', parseInt(e.target.value.replace(/[^0-9]/g, ''), 10) || 0)}
                                                    placeholder="0"
                                                    className="w-full text-right px-2 py-2 bg-white border border-gray-200 rounded-lg text-sm font-bold text-gray-900 focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none transition-all"
                                                />
                                                <span className="ml-1 text-xs text-gray-500 font-bold shrink-0">원</span>
                                            </div>
                                        </td>
                                        <td className="px-2 py-2">
                                            <div className="flex items-center">
                                                <input
                                                    type="number" min="1" value={pkg.valid_days || ''} onChange={e => handleUpdatePackage(index, 'valid_days', e.target.value ? parseInt(e.target.value) : null)}
                                                    placeholder="무제한"
                                                    className="w-full text-center px-2 py-2 bg-white border border-gray-200 rounded-lg text-sm font-bold text-gray-900 focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none transition-all placeholder-gray-400"
                                                />
                                                <span className="ml-1 text-xs text-gray-500 font-bold shrink-0">일</span>
                                            </div>
                                        </td>
                                        <td className="px-2 py-2 text-center">
                                            <button onClick={() => handleRemovePackage(index)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors inline-block tooltip-trigger">
                                                <X className="w-4 h-4" />
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                <button
                    onClick={handleAddPackage}
                    className="w-full py-2.5 border-2 border-dashed border-teal-200 text-teal-600 font-bold rounded-xl hover:bg-teal-50 hover:border-teal-300 transition-colors flex items-center justify-center gap-2 text-sm"
                >
                    + 새 상품 추가
                </button>

                <div className="mt-6 flex justify-end">
                    <button onClick={handleSavePackages} disabled={isLoading}
                        className="flex items-center gap-2 px-5 py-2.5 bg-teal-600 text-white font-bold rounded-xl hover:bg-teal-700 transition-all shadow-md hover:shadow-lg disabled:opacity-50 text-sm">
                        {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        <span>패키지 상품 설정 저장</span>
                    </button>
                </div>
            </Section>

            {/* 시스템 전체 초기화 */}
            <Section icon={<Trash2 className="w-5 h-5" />} iconBg="bg-red-50" iconColor="text-red-600" title="시스템 전체 초기화">
                <div className="space-y-4">
                    <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                        <p className="text-sm text-red-700 font-bold mb-1">⚠️ 위험한 작업</p>
                        <p className="text-xs text-red-600">
                            시스템을 삭제하면 모든 멤버, 고객, 예약, 설정 데이터가 <strong>영구적으로 삭제</strong>됩니다.<br />
                            삭제 후 새로운 시스템을 바로 생성할 수 있습니다.
                        </p>
                    </div>
                    <div className="flex items-end gap-3">
                        <div className="flex-1">
                            <label className="block text-sm font-bold text-gray-700 mb-1">확인 입력</label>
                            <input
                                type="text"
                                value={resetConfirm}
                                onChange={e => setResetConfirm(e.target.value)}
                                placeholder='삭제하려면 "초기화"를 입력하세요'
                                className="w-full px-4 py-2 bg-white text-gray-900 border border-red-200 rounded-xl font-bold focus:ring-2 focus:ring-red-500 focus:border-transparent outline-none transition-all"
                            />
                        </div>
                        <button
                            onClick={handleDeleteSystem}
                            disabled={resetConfirm !== '초기화' || isResetting}
                            className="px-5 py-2 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 whitespace-nowrap"
                        >
                            {isResetting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                            시스템 삭제
                        </button>
                    </div>
                </div>
            </Section>


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

