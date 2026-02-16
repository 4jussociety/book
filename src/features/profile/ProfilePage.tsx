import { useState, useEffect } from 'react'
import { useAuth } from '@/features/auth/AuthContext'
import { supabase } from '@/lib/supabase'
import { Loader2, Save, User, MessageSquare } from 'lucide-react'

export default function ProfilePage() {
    const { user, profile } = useAuth()
    const [isLoading, setIsLoading] = useState(false)
    const [fullName, setFullName] = useState('')
    const [organizationName, setOrganizationName] = useState('')
    const [contactNumber, setContactNumber] = useState('')
    const [messageTemplate, setMessageTemplate] = useState('')

    // 초기 데이터 로드
    useEffect(() => {
        if (profile) {
            setFullName(profile.full_name || '')
            // 기존 값이 없으면(null or empty) 새로운 기본값 적용
            setOrganizationName(profile.organization_name || 'Re:무브 체형교정')
            setContactNumber(profile.contact_number || '')

            // 템플릿도 없으면 새 기본값
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
            // AuthContext의 profile 갱신이 필요할 수 있음 (일반적으로 실시간 구독이나 리로드 필요)
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
        <div className="max-w-2xl mx-auto p-6 space-y-8">
            <header>
                <h1 className="text-3xl font-black text-gray-900 tracking-tight">프로필 설정</h1>
                <p className="text-gray-500 mt-2">개인 정보와 예약 문자 양식을 설정하세요.</p>
            </header>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                {/* 기본 정보 섹션 */}
                <div className="p-6 border-b border-gray-100">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="w-10 h-10 bg-blue-50 rounded-full flex items-center justify-center text-blue-600">
                            <User className="w-5 h-5" />
                        </div>
                        <h2 className="text-lg font-bold text-gray-900">기본 정보</h2>
                    </div>

                    <div className="space-y-4 ml-13">
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1">
                                이메일
                            </label>
                            <input
                                type="text"
                                value={profile.email || user?.email || ''}
                                disabled
                                className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-gray-500 font-medium"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1">
                                이름 (표시명)
                            </label>
                            <input
                                type="text"
                                value={fullName}
                                onChange={(e) => setFullName(e.target.value)}
                                placeholder="이름을 입력하세요"
                                className="w-full px-4 py-2 bg-white border border-gray-200 rounded-xl text-gray-900 font-bold focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                            />
                            <p className="text-xs text-gray-400 mt-1">예약 캘린더와 안내 문자에 표시될 이름입니다.</p>
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1">
                                업체명 (장소)
                            </label>
                            <input
                                type="text"
                                value={organizationName}
                                onChange={(e) => setOrganizationName(e.target.value)}
                                placeholder="예: Re:무브 체형교정"
                                className="w-full px-4 py-2 bg-white border border-gray-200 rounded-xl text-gray-900 font-bold focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                            />
                            <p className="text-xs text-gray-400 mt-1">예약 안내 문자의 {'{장소}'} 변수에 들어갈 내용입니다.</p>
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1">
                                연락처
                            </label>
                            <input
                                type="text"
                                value={contactNumber}
                                onChange={(e) => setContactNumber(e.target.value)}
                                placeholder="예: 02-1234-5678"
                                className="w-full px-4 py-2 bg-white border border-gray-200 rounded-xl text-gray-900 font-bold focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                            />
                            <p className="text-xs text-gray-400 mt-1">예약 안내 문자의 {'{연락처}'} 변수에 들어갈 내용입니다.</p>
                        </div>
                    </div>
                </div>

                {/* 예약 문자 설정 섹션 */}
                <div className="p-6 bg-gray-50/50">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="w-10 h-10 bg-indigo-50 rounded-full flex items-center justify-center text-indigo-600">
                            <MessageSquare className="w-5 h-5" />
                        </div>
                        <h2 className="text-lg font-bold text-gray-900">예약 안내 문자 설정</h2>
                    </div>

                    <div className="space-y-4">
                        <div>
                            <div className="bg-white border border-gray-200 rounded-xl p-4 mb-3">
                                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">사용 가능한 변수</h3>
                                <div className="flex gap-2 text-sm font-medium">
                                    <code className="px-2 py-1 bg-gray-100 rounded text-gray-700">{`{환자}`}</code>
                                    <code className="px-2 py-1 bg-gray-100 rounded text-gray-700">{`{일시}`}</code>
                                    <code className="px-2 py-1 bg-gray-100 rounded text-gray-700">{`{장소}`}</code>
                                    <code className="px-2 py-1 bg-gray-100 rounded text-gray-700">{`{담당자}`}</code>
                                    <code className="px-2 py-1 bg-gray-100 rounded text-gray-700">{`{연락처}`}</code>
                                </div>
                            </div>

                            <label className="block text-sm font-bold text-gray-700 mb-1">
                                문자 템플릿
                            </label>
                            <textarea
                                value={messageTemplate}
                                onChange={(e) => setMessageTemplate(e.target.value)}
                                rows={6}
                                className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-gray-900 font-medium focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all resize-none"
                                placeholder="예약 안내 문자 양식을 입력하세요..."
                            />
                        </div>

                        {/* 미리보기 */}
                        <div className="bg-indigo-50 rounded-xl p-4 border border-indigo-100">
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
                    </div>
                </div>
            </div>

            <div className="flex justify-end">
                <button
                    onClick={handleSave}
                    disabled={isLoading}
                    className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-all shadow-lg hover:shadow-xl disabled:opacity-50 active:scale-95"
                >
                    {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                    <span>변경사항 저장</span>
                </button>
            </div>
        </div>
    )
}
