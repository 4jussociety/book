// ProfilePage: 개인 프로필 설정 페이지
// 기본 정보(이름, 연락처)를 관리

import { useState, useEffect } from 'react'
import { useAuth } from '@/features/auth/AuthContext'
import { supabase } from '@/lib/supabase'
import { Loader2, Save, User } from 'lucide-react'

export default function ProfilePage() {
    const { user, profile } = useAuth()
    const [isLoading, setIsLoading] = useState(false)
    const [fullName, setFullName] = useState('')
    const [phone, setPhone] = useState('')

    useEffect(() => {
        if (profile) {
            setFullName(profile.full_name || '')
            setPhone(profile.phone || '')
        }
    }, [profile])

    const handleSave = async () => {
        if (!user || !profile) return
        setIsLoading(true)
        try {
            const { error: profileError } = await supabase
                .from('profiles')
                .update({
                    full_name: fullName,
                    phone: phone,
                })
                .eq('id', user.id)
            if (profileError) throw profileError

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
        <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-6 md:space-y-8">
            <header>
                <h1 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight">개인 정보 설정</h1>
                <p className="text-gray-500 mt-1 md:mt-2 text-sm">기본 정보를 관리하세요.</p>
            </header>

            {/* 기본 정보 */}
            <Section icon={<User className="w-5 h-5" />} iconBg="bg-blue-50" iconColor="text-blue-600" title="기본 정보">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                    <Field label="아이디 (가입 이메일)">
                        <input type="text" value={profile.email || user?.email || ''} disabled
                            className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-gray-500 font-medium" />
                    </Field>
                    <Field label="이름 (표시명)" hint="예약 캘린더에 표시될 이름입니다.">
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
