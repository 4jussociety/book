// ProfilePage: 프로필 설정 페이지
// 기본 정보(이름, 연락처), 예약 문자 템플릿을 관리

import { useState, useEffect } from 'react'
import { useAuth } from '@/features/auth/AuthContext'
import { supabase } from '@/lib/supabase'
import { Loader2, Save, User, MessageSquare } from 'lucide-react'

export default function ProfilePage() {
    const { user, profile } = useAuth()
    const [isLoading, setIsLoading] = useState(false)
    const [fullName, setFullName] = useState('')
    const [phone, setPhone] = useState('')
    const [messageTemplate, setMessageTemplate] = useState('')

    useEffect(() => {
        if (profile) {
            setFullName(profile.full_name || '')
            setPhone(profile.phone || '')
            setMessageTemplate(profile.message_template || '')
        }
    }, [profile])

    const handleSave = async () => {
        if (!user || !profile) return
        setIsLoading(true)
        try {
            // 1. 프로필 저장 (이름, 연락처)
            const { error: profileError } = await supabase
                .from('profiles')
                .update({
                    full_name: fullName,
                    phone: phone,
                })
                .eq('id', user.id)
            if (profileError) throw profileError

            // 2. 문자 템플릿 저장 (system_id가 있을 때만)
            if (profile.system_id && messageTemplate) {
                const { error: templateError } = await supabase
                    .from('message_templates')
                    .upsert({
                        system_id: profile.system_id,
                        template_name: '기본 템플릿',
                        template_body: messageTemplate,
                        is_default: true,
                    }, { onConflict: 'system_id,template_name' })
                if (templateError) throw templateError
            }

            alert('프로필이 저장되었습니다.')
            window.location.reload()
        } catch (error) {
            console.error('Error updating profile:', error)
            alert('저장 중 오류가 발생했습니다.')
        } finally {
            setIsLoading(false)
        }
    }

    if (!profile) {
        return <div className="flex h-full items-center justify-center"><Loader2 className="animate-spin text-blue-600" /></div>
    }

    return (
        <div className="max-w-2xl mx-auto p-4 md:p-6 space-y-6 md:space-y-8">
            <header>
                <h1 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight">개인 정보 설정</h1>
                <p className="text-gray-500 mt-1 md:mt-2 text-sm">기본 정보 및 예약 안내 문자 템플릿을 관리하세요.</p>
            </header>

            {/* 기본 정보 */}
            <Section icon={<User className="w-5 h-5" />} iconBg="bg-blue-50" iconColor="text-blue-600" title="기본 정보">
                <div className="space-y-4">
                    <Field label="아이디 (가입 이메일)">
                        <input type="text" value={profile.email || user?.email || ''} disabled
                            className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-gray-500 font-medium" />
                    </Field>
                    <Field label="이름 (표시명)" hint="예약 캘린더와 안내 문자에 표시될 이름입니다.">
                        <input type="text" value={fullName} onChange={e => setFullName(e.target.value)}
                            placeholder="이름을 입력하세요"
                            className="w-full px-4 py-2 bg-white border border-gray-200 rounded-xl text-gray-900 font-bold focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all" />
                    </Field>
                    <Field label="연락처" hint="관리자에게 표시되는 개인 연락처입니다.">
                        <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
                            placeholder="010-0000-0000"
                            className="w-full px-4 py-2 bg-white border border-gray-200 rounded-xl text-gray-900 font-bold focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all" />
                    </Field>
                </div>
            </Section>

            {/* 예약 안내 문자 공통 템플릿 - 시스템에 소속된 경우에만 표시 */}
            {profile.system_id && (
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
                        className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-gray-900 font-medium focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all resize-none"
                        placeholder="예약 안내 문자 양식을 입력하세요..." />
                    <div className="bg-indigo-50 rounded-xl p-4 border border-indigo-100 mt-3">
                        <span className="text-xs font-bold text-indigo-400 uppercase tracking-wider block mb-2">미리보기 (내 정보 기준)</span>
                        <pre className="text-sm text-indigo-900 whitespace-pre-wrap font-sans">
                            {messageTemplate
                                .replace('{환자}', '김철수')
                                .replace('{일시}', '2024년 3월 15일(금) 14:00')
                                .replace('{장소}', profile.organization_name || 'OO물리치료센터')
                                .replace('{담당자}', fullName || profile.full_name || '치료사')
                                .replace('{연락처}', phone || profile.phone || '010-0000-0000')
                            }
                        </pre>
                    </div>
                </Section>
            )}

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
