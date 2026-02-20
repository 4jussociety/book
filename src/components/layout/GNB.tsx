// GNB: 글로벌 네비게이션 바
// 데스크톱: 상단 가로 네비게이션 / 모바일: 하단 탭바

import { useState, useEffect } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '@/features/auth/AuthContext'
import { supabase } from '@/lib/supabase'
import { LogOut, User, Copy, Check, CalendarDays, Users, BarChart3, UserCog, Menu, X } from 'lucide-react'
import { clsx } from 'clsx'

export default function GNB() {
    const { profile, signOut } = useAuth()
    const navigate = useNavigate()
    const [serialNumber, setSerialNumber] = useState<string | null>(null)
    const [copied, setCopied] = useState(false)
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

    // 시스템 일련번호 조회
    useEffect(() => {
        if (!profile?.system_id) return
        supabase
            .from('systems')
            .select('serial_number')
            .eq('id', profile.system_id)
            .maybeSingle()
            .then(({ data }: { data: { serial_number: string } | null }) => {
                if (data) setSerialNumber(data.serial_number)
            })
    }, [profile?.system_id])

    const handleCopySerial = async () => {
        if (!serialNumber) return
        await navigator.clipboard.writeText(serialNumber)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }

    const handleLogout = async () => {
        await signOut()
        navigate('/login')
    }

    const navItems = [
        { label: '예약 관리', href: '/calendar', icon: CalendarDays },
        { label: '환자 관리', href: '/patients', icon: Users },
    ]

    if (profile?.is_owner) {
        navItems.push({ label: '통계', href: '/statistics', icon: BarChart3 })
        navItems.push({ label: '멤버 관리', href: '/members', icon: UserCog })
    }

    return (
        <>
            {/* ─── 데스크톱 상단 네비게이션 ─── */}
            <header className="h-16 border-b border-gray-200 bg-white flex items-center justify-between px-4 md:px-6 sticky top-0 z-50 font-sans">
                <div className="flex items-center gap-4 md:gap-8">
                    <Link to="/" className="text-2xl md:text-3xl font-black text-black font-roboto italic tracking-tighter leading-none [-webkit-text-stroke:1px_black]">
                        THEPT#
                    </Link>
                    {/* 데스크톱 네비 */}
                    <nav className="hidden md:flex items-center gap-1">
                        {navItems.map((item) => (
                            <NavLink
                                key={item.href}
                                to={item.href}
                                className={({ isActive }) =>
                                    clsx(
                                        'px-4 py-2 text-sm font-bold transition-all rounded-lg',
                                        isActive
                                            ? 'bg-blue-50 text-blue-600'
                                            : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                                    )
                                }
                            >
                                {item.label}
                            </NavLink>
                        ))}
                    </nav>
                </div>

                <div className="flex items-center gap-2 md:gap-4">
                    {/* 시스템 일련번호 - 데스크톱만 */}
                    {serialNumber && (
                        <button
                            onClick={handleCopySerial}
                            className="hidden md:flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-all group"
                            title="클릭하여 일련번호 복사"
                        >
                            <span className="text-[10px] font-black text-blue-500 uppercase tracking-wider">SYS</span>
                            <span className="text-sm font-bold text-blue-700 font-mono tracking-[0.15em]">
                                {`${serialNumber.slice(0, 5)}-${serialNumber.slice(5)}`}
                            </span>
                            {copied ? (
                                <Check className="w-3.5 h-3.5 text-green-500" />
                            ) : (
                                <Copy className="w-3.5 h-3.5 text-blue-400 group-hover:text-blue-600 transition-colors" />
                            )}
                        </button>
                    )}

                    {/* 프로필 링크 */}
                    <Link to="/profile" className="flex items-center gap-2 md:gap-3 md:pr-4 md:border-r border-gray-100 hover:bg-gray-50 p-2 rounded-xl transition-colors">
                        <div className="text-right hidden sm:block">
                            <div className="text-sm font-bold text-gray-900 leading-none">
                                {profile?.full_name || '로그인 필요'}
                            </div>
                            <div className="text-[10px] font-bold text-blue-500 mt-1 uppercase tracking-wider bg-blue-50 px-1 rounded inline-block">
                                {profile?.is_owner ? 'ADMIN' : (profile?.role ? profile.role.toUpperCase() : 'GUEST')}
                            </div>
                        </div>
                        <div className="w-8 h-8 md:w-9 md:h-9 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center text-gray-500">
                            {profile?.avatar_url ? (
                                <img src={profile.avatar_url} alt="Profile" className="w-full h-full rounded-full object-cover" />
                            ) : (
                                <User className="w-4 h-4 md:w-5 md:h-5" />
                            )}
                        </div>
                    </Link>

                    {/* 로그아웃 */}
                    <button
                        onClick={handleLogout}
                        className="hidden md:block p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                        title="로그아웃"
                    >
                        <LogOut className="w-5 h-5" />
                    </button>

                    {/* 모바일 더보기 메뉴 버튼 */}
                    <button
                        onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                        className="md:hidden p-2 text-gray-500 hover:bg-gray-100 rounded-xl transition-all"
                    >
                        {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
                    </button>
                </div>
            </header>

            {/* ─── 모바일 드롭다운 메뉴 (일련번호, 로그아웃 등) ─── */}
            {mobileMenuOpen && (
                <div className="md:hidden fixed inset-0 top-16 z-40 bg-black/30 backdrop-blur-sm" onClick={() => setMobileMenuOpen(false)}>
                    <div className="bg-white border-b border-gray-200 shadow-lg p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
                        {serialNumber && (
                            <button
                                onClick={() => { handleCopySerial(); setMobileMenuOpen(false) }}
                                className="w-full flex items-center gap-2 px-4 py-3 bg-blue-50 border border-blue-200 rounded-xl"
                            >
                                <span className="text-[10px] font-black text-blue-500 uppercase tracking-wider">SYS</span>
                                <span className="text-sm font-bold text-blue-700 font-mono tracking-[0.15em]">
                                    {`${serialNumber.slice(0, 5)}-${serialNumber.slice(5)}`}
                                </span>
                                {copied ? (
                                    <Check className="w-4 h-4 text-green-500 ml-auto" />
                                ) : (
                                    <Copy className="w-4 h-4 text-blue-400 ml-auto" />
                                )}
                            </button>
                        )}
                        <button
                            onClick={() => { handleLogout(); setMobileMenuOpen(false) }}
                            className="w-full flex items-center gap-3 px-4 py-3 text-red-500 hover:bg-red-50 rounded-xl transition-colors font-bold text-sm"
                        >
                            <LogOut className="w-5 h-5" />
                            로그아웃
                        </button>
                    </div>
                </div>
            )}

            {/* ─── 모바일 하단 탭바 ─── */}
            <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 safe-area-bottom">
                <div className="flex items-center justify-around h-16 px-2">
                    {navItems.map((item) => {
                        const Icon = item.icon
                        return (
                            <NavLink
                                key={item.href}
                                to={item.href}
                                className={({ isActive }) =>
                                    clsx(
                                        'flex flex-col items-center justify-center gap-0.5 flex-1 py-1 rounded-lg transition-colors',
                                        isActive
                                            ? 'text-blue-600'
                                            : 'text-gray-400'
                                    )
                                }
                            >
                                <Icon className="w-5 h-5" />
                                <span className="text-[10px] font-bold">{item.label}</span>
                            </NavLink>
                        )
                    })}
                    {/* 프로필 탭 */}
                    <NavLink
                        to="/profile"
                        className={({ isActive }) =>
                            clsx(
                                'flex flex-col items-center justify-center gap-0.5 flex-1 py-1 rounded-lg transition-colors',
                                isActive
                                    ? 'text-blue-600'
                                    : 'text-gray-400'
                            )
                        }
                    >
                        <User className="w-5 h-5" />
                        <span className="text-[10px] font-bold">프로필</span>
                    </NavLink>
                </div>
            </nav>
        </>
    )
}
