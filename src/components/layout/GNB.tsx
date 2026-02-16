import { useState, useEffect } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '@/features/auth/AuthContext'
import { supabase } from '@/lib/supabase'
import { LogOut, User, Copy, Check } from 'lucide-react'
import { clsx } from 'clsx'

export default function GNB() {
    const { profile, signOut } = useAuth()
    const navigate = useNavigate()
    const [serialNumber, setSerialNumber] = useState<string | null>(null)
    const [copied, setCopied] = useState(false)

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
        { label: '예약 관리', href: '/calendar' },
        { label: '환자 관리', href: '/patients' },
    ]

    // 통계 메뉴: 소유자만 접근 가능 (게스트/직원 접근 차단)
    if (profile?.is_owner) {
        navItems.push({ label: '통계', href: '/statistics' })
    }

    // 멤버 관리: 소유자만 접근 가능
    if (profile?.is_owner) {
        navItems.push({ label: '멤버 관리', href: '/members' })
    }

    return (
        <header className="h-16 border-b border-gray-200 bg-white flex items-center justify-between px-6 sticky top-0 z-50 font-sans">
            <div className="flex items-center gap-8">
                <Link to="/" className="text-3xl font-black text-black font-roboto italic tracking-tighter leading-none [-webkit-text-stroke:1px_black]">
                    THEPT#
                </Link>
                <nav className="flex items-center gap-1">
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

            <div className="flex items-center gap-4">
                {/* 시스템 일련번호 */}
                {serialNumber && (
                    <button
                        onClick={handleCopySerial}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-all group"
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

                <Link to="/profile" className="flex items-center gap-3 pr-4 border-r border-gray-100 hover:bg-gray-50 p-2 rounded-xl transition-colors">
                    <div className="text-right">
                        <div className="text-sm font-bold text-gray-900 leading-none">
                            {profile?.full_name || '로그인 필요'}
                        </div>
                        <div className="text-[10px] font-bold text-blue-500 mt-1 uppercase tracking-wider bg-blue-50 px-1 rounded inline-block">
                            {profile?.is_owner ? 'ADMIN' : (profile?.role ? profile.role.toUpperCase() : 'GUEST')}
                        </div>
                    </div>
                    <div className="w-9 h-9 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center text-gray-500">
                        {profile?.avatar_url ? (
                            <img src={profile.avatar_url} alt="Profile" className="w-full h-full rounded-full object-cover" />
                        ) : (
                            <User className="w-5 h-5" />
                        )}
                    </div>
                </Link>

                <button
                    onClick={handleLogout}
                    className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                    title="로그아웃"
                >
                    <LogOut className="w-5 h-5" />
                </button>
            </div>
        </header>
    )
}
