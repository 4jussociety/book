// PatientList: 환자 관리 목록 페이지
// 데스크톱: 테이블 뷰 / 모바일: 카드형 리스트

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getPatients, deletePatient } from './api'
import type { PatientWithDetails } from './api'
import { Plus, Search, Trash2, Edit, CalendarPlus, Users, Hash, MessageSquare, X } from 'lucide-react'
import PatientModal from './PatientModal'
import PatientMembershipsPanel from './PatientMembershipsPanel'
import { format, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'
import { useNavigate } from 'react-router-dom'
import type { Patient } from '@/types/db'
import { useIsMobile } from '@/hooks/useMediaQuery'
import { useAuth } from '@/features/auth/AuthContext'

export default function PatientList() {
    const [search, setSearch] = useState('')
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [editingPatient, setEditingPatient] = useState<Patient | null>(null)
    const navigate = useNavigate()
    const isMobile = useIsMobile()
    const { profile } = useAuth()
    const [membershipPatient, setMembershipPatient] = useState<Patient | null>(null)

    const queryClient = useQueryClient()

    const { data: patients, isLoading } = useQuery({
        queryKey: ['patients', search],
        queryFn: () => getPatients(search),
    })

    const deleteMutation = useMutation({
        mutationFn: deletePatient,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['patients'] })
        },
    })

    const handleDelete = async (id: string) => {
        if (confirm('정말 삭제하시겠습니까? 관련 예약도 영향을 받을 수 있습니다.')) {
            await deleteMutation.mutateAsync(id)
        }
    }

    const handleEdit = (patient: Patient) => {
        setEditingPatient(patient)
        setIsModalOpen(true)
    }

    const handleAddNew = () => {
        setEditingPatient(null)
        setIsModalOpen(true)
    }

    const handleBookAppointment = (patient: Patient) => {
        navigate(`/calendar?patientId=${patient.id}&patientName=${encodeURIComponent(patient.name)}`)
    }

    const handleCopyMessage = (patient: PatientWithDetails) => {
        const nextAppt = patient.next_appointment
        if (!nextAppt) {
            alert('이 환자의 예정된 예약이 없습니다.')
            return
        }
        const aptDate = parseISO(nextAppt.start_time)
        const dateStr = format(aptDate, 'yyyy년 M월 d일(EEE) HH:mm', { locale: ko })
        const therapistName = nextAppt.therapist_name || '담당 선생님'

        const template = profile?.message_template || `[예약 안내] {환자}님\n일시: {일시}\n장소: {장소}\n담당: {담당자} 선생님`

        const text = template
            .replace(/{환자}/g, patient.name)
            .replace(/{일시}/g, dateStr)
            .replace(/{장소}/g, profile?.organization_name || '치료실')
            .replace(/{담당자}/g, therapistName)
            .replace(/{연락처}/g, profile?.contact_number || '')

        navigator.clipboard.writeText(text).then(() => {
            alert('예약 안내 문자가 복사되었습니다!')
        })
    }

    return (
        <div className="p-4 md:p-6 max-w-7xl mx-auto">
            {/* Header */}
            <div className="flex justify-between items-center mb-4 md:mb-6">
                <div>
                    <h1 className="text-xl md:text-2xl font-black text-gray-900">환자 관리</h1>
                    <p className="text-xs md:text-sm text-gray-500 mt-1">
                        총 <span className="font-bold text-blue-600">{patients?.length || 0}</span>명
                    </p>
                </div>
                <button
                    onClick={handleAddNew}
                    className="bg-blue-600 text-white px-4 md:px-5 py-2.5 rounded-xl flex items-center gap-2 hover:bg-blue-700 font-bold text-sm shadow-lg shadow-blue-500/20 transition-all"
                >
                    <Plus className="w-4 h-4" />
                    <span className="hidden sm:inline">환자 등록</span>
                    <span className="sm:hidden">등록</span>
                </button>
            </div>

            {/* 검색 */}
            <div className="mb-4 md:mb-6 relative">
                <input
                    type="text"
                    placeholder="환자 이름으로 검색..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full pl-11 pr-4 py-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none font-medium text-sm shadow-sm"
                />
                <Search className="w-5 h-5 text-gray-400 absolute left-4 top-3.5" />
            </div>

            {/* 로딩/빈 상태 */}
            {isLoading ? (
                <div className="flex flex-col items-center gap-2 py-12">
                    <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                    <span className="text-sm text-gray-400 font-medium">로딩 중...</span>
                </div>
            ) : patients?.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-16">
                    <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center">
                        <Users className="w-6 h-6 text-gray-300" />
                    </div>
                    <div className="text-center">
                        <p className="text-sm font-bold text-gray-500">등록된 환자가 없습니다</p>
                        <p className="text-xs text-gray-400 mt-0.5">상단의 '환자 등록' 버튼으로 새 환자를 추가하세요</p>
                    </div>
                </div>
            ) : isMobile ? (
                /* ─── 모바일: 카드형 리스트 ─── */
                <div className="space-y-3">
                    {patients?.map((patient: PatientWithDetails) => (
                        <div key={patient.id} className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
                            <div className="flex items-start justify-between">
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1.5">
                                        <span className="inline-flex items-center px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded text-[10px] font-black">
                                            {patient.is_manual_no ? '' : '#'}{patient.patient_no}
                                        </span>
                                        <span className="font-bold text-gray-900 text-sm truncate">{patient.name}</span>
                                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${patient.gender === 'M' || patient.gender === 'MALE'
                                            ? 'bg-sky-50 text-sky-600'
                                            : 'bg-pink-50 text-pink-500'
                                            }`}>
                                            {patient.gender === 'M' || patient.gender === 'MALE' ? '남' : '여'}
                                        </span>
                                        {patient.birth_date && (
                                            <span className="text-[10px] text-gray-400 font-medium">
                                                {new Date().getFullYear() - parseInt(patient.birth_date.substring(0, 4))}세
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-3 text-xs text-gray-400">
                                        {patient.phone && <span>{patient.phone}</span>}
                                        {patient.last_therapist_name && (
                                            <span className="font-bold text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded text-[10px]">
                                                {patient.last_therapist_name}
                                            </span>
                                        )}
                                        {patient.last_visit && (
                                            <span className="font-medium text-gray-500 bg-gray-50 px-1.5 py-0.5 rounded text-[10px]">
                                                {format(parseISO(patient.last_visit), 'yy.MM.dd')}
                                            </span>
                                        )}
                                        <span className="font-bold text-gray-600">
                                            {patient.visit_count}회차
                                        </span>
                                        {patient.active_memberships && patient.active_memberships.length > 0 ? (
                                            patient.active_memberships.map((m, idx) => (
                                                <button key={idx} onClick={() => setMembershipPatient(patient)} className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-50 text-amber-600 border border-amber-200 hover:bg-amber-100 transition-colors cursor-pointer" title={m.name}>
                                                    🎟️ {m.total_sessions - m.used_sessions}/{m.total_sessions}
                                                </button>
                                            ))
                                        ) : (
                                            <button onClick={() => setMembershipPatient(patient)} className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-gray-50 text-gray-400 border border-gray-200 hover:bg-amber-50 hover:text-amber-600 hover:border-amber-200 transition-colors cursor-pointer">
                                                + 회원권 등록
                                            </button>
                                        )}
                                    </div>
                                </div>
                                {/* 관리 버튼 */}
                                <div className="flex items-center gap-0.5 ml-2">
                                    <button
                                        onClick={() => handleCopyMessage(patient)}
                                        className={`p-2 rounded-lg transition-colors ${patient.next_appointment ? 'text-indigo-500 hover:bg-indigo-50' : 'text-gray-300 cursor-not-allowed'}`}
                                        title={patient.next_appointment ? '예약안내문자 복사' : '예정된 예약 없음'}
                                        disabled={!patient.next_appointment}
                                    >
                                        <MessageSquare className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={() => handleBookAppointment(patient)}
                                        className="p-2 text-green-500 hover:bg-green-50 rounded-lg transition-colors"
                                    >
                                        <CalendarPlus className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={() => handleEdit(patient)}
                                        className="p-2 text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"
                                    >
                                        <Edit className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={() => handleDelete(patient.id)}
                                        className="p-2 text-red-400 hover:bg-red-50 rounded-lg transition-colors"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                /* ─── 데스크톱: 테이블 뷰 ─── */
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-gray-50/80">
                                <th className="px-5 py-3.5 text-[10px] font-black text-gray-400 uppercase tracking-wider">
                                    <div className="flex items-center gap-1"><Hash className="w-3 h-3" />번호</div>
                                </th>
                                <th className="px-5 py-3.5 text-[10px] font-black text-gray-400 uppercase tracking-wider">이름</th>
                                <th className="px-5 py-3.5 text-[10px] font-black text-gray-400 uppercase tracking-wider">성별</th>
                                <th className="px-5 py-3.5 text-[10px] font-black text-gray-400 uppercase tracking-wider">나이</th>
                                <th className="px-5 py-3.5 text-[10px] font-black text-gray-400 uppercase tracking-wider">연락처</th>
                                <th className="px-5 py-3.5 text-[10px] font-black text-gray-400 uppercase tracking-wider">
                                    <div className="flex items-center gap-1"><Users className="w-3 h-3" />담당</div>
                                </th>
                                <th className="px-5 py-3.5 text-[10px] font-black text-gray-400 uppercase tracking-wider">방문</th>
                                <th className="px-5 py-3.5 text-[10px] font-black text-gray-400 uppercase tracking-wider">이용권</th>
                                <th className="px-5 py-3.5 text-[10px] font-black text-gray-400 uppercase tracking-wider">최초 방문</th>
                                <th className="px-5 py-3.5 text-[10px] font-black text-gray-400 uppercase tracking-wider">최근 방문</th>
                                <th className="px-5 py-3.5 text-[10px] font-black text-gray-400 uppercase tracking-wider text-right">관리</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {patients?.map((patient: PatientWithDetails) => (
                                <tr key={patient.id} className="hover:bg-blue-50/30 transition-colors group">
                                    <td className="px-5 py-3">
                                        <span className="inline-flex items-center px-2 py-0.5 bg-blue-50 text-blue-600 rounded-md text-xs font-black">
                                            {patient.is_manual_no ? '' : '#'}{patient.patient_no}
                                        </span>
                                    </td>
                                    <td className="px-5 py-3">
                                        <span className="font-bold text-gray-900 text-sm">{patient.name}</span>
                                    </td>
                                    <td className="px-5 py-3">
                                        <span className={`text-xs font-bold px-2 py-0.5 rounded-md ${patient.gender === 'M' || patient.gender === 'MALE'
                                            ? 'bg-sky-50 text-sky-600'
                                            : 'bg-pink-50 text-pink-500'
                                            }`}>
                                            {patient.gender === 'M' || patient.gender === 'MALE' ? '남' : '여'}
                                        </span>
                                    </td>
                                    <td className="px-5 py-3 text-sm text-gray-500 font-medium">
                                        {patient.birth_date
                                            ? `${new Date().getFullYear() - parseInt(patient.birth_date.substring(0, 4))}세`
                                            : '-'}
                                    </td>
                                    <td className="px-5 py-3 text-sm text-gray-500 font-medium">
                                        {patient.phone || '-'}
                                    </td>
                                    <td className="px-5 py-3">
                                        {patient.last_therapist_name ? (
                                            <span className="text-xs font-bold text-gray-700 bg-gray-100 px-2 py-0.5 rounded-md">
                                                {patient.last_therapist_name}
                                            </span>
                                        ) : (
                                            <span className="text-xs text-gray-300">-</span>
                                        )}
                                    </td>
                                    <td className="px-5 py-3">
                                        <span className="text-sm font-bold text-gray-700">{patient.visit_count}</span>
                                        <span className="text-xs text-gray-400 ml-0.5">회차</span>
                                    </td>
                                    <td className="px-5 py-3">
                                        {patient.active_memberships && patient.active_memberships.length > 0 ? (
                                            <div className="flex flex-wrap gap-1">
                                                {patient.active_memberships.map((m, idx) => (
                                                    <button key={idx} onClick={() => setMembershipPatient(patient)} className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-50 text-amber-600 border border-amber-200 hover:bg-amber-100 transition-colors cursor-pointer" title={m.name}>
                                                        🎟️ {m.total_sessions - m.used_sessions}/{m.total_sessions}
                                                    </button>
                                                ))}
                                            </div>
                                        ) : (
                                            <button onClick={() => setMembershipPatient(patient)} className="text-[10px] font-bold px-1.5 py-1 rounded bg-gray-50 text-gray-400 border border-gray-200 hover:bg-amber-50 hover:text-amber-600 hover:border-amber-200 transition-colors cursor-pointer">
                                                + 등록
                                            </button>
                                        )}
                                    </td>
                                    <td className="px-5 py-3 text-xs text-gray-400 font-medium">
                                        {patient.first_visit
                                            ? format(parseISO(patient.first_visit), 'yy.MM.dd')
                                            : '-'}
                                    </td>
                                    <td className="px-5 py-3 text-xs text-gray-400 font-medium">
                                        {patient.last_visit
                                            ? format(parseISO(patient.last_visit), 'yy.MM.dd')
                                            : '-'}
                                    </td>
                                    <td className="px-5 py-3 text-right">
                                        <div className="flex items-center justify-end gap-1">
                                            <button
                                                onClick={() => handleCopyMessage(patient)}
                                                className={`p-1.5 rounded-lg transition-colors ${patient.next_appointment ? 'text-indigo-500 hover:bg-indigo-50' : 'text-gray-300 cursor-not-allowed'}`}
                                                title={patient.next_appointment ? '예약안내문자 복사' : '예정된 예약 없음'}
                                                disabled={!patient.next_appointment}
                                            >
                                                <MessageSquare className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => handleBookAppointment(patient)}
                                                className="p-1.5 text-green-500 hover:bg-green-50 rounded-lg transition-colors"
                                                title="예약 잡기"
                                            >
                                                <CalendarPlus className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => handleEdit(patient)}
                                                className="p-1.5 text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"
                                                title="수정"
                                            >
                                                <Edit className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => handleDelete(patient.id)}
                                                className="p-1.5 text-red-400 hover:bg-red-50 rounded-lg transition-colors"
                                                title="삭제"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )
            }

            <PatientModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                initialData={editingPatient}
            />

            {/* 회원권 전용 모달 */}
            {membershipPatient && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setMembershipPatient(null)}>
                    <div className="bg-white rounded-xl shadow-lg w-full max-w-md p-6 relative animate-in fade-in zoom-in duration-200" onClick={e => e.stopPropagation()}>
                        <button
                            onClick={() => setMembershipPatient(null)}
                            className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
                        >
                            <X className="w-5 h-5" />
                        </button>
                        <h2 className="text-lg font-black text-gray-900 mb-1">{membershipPatient.name}</h2>
                        <p className="text-xs text-gray-400 mb-4">회원권 관리</p>
                        <PatientMembershipsPanel patientId={membershipPatient.id} />
                    </div>
                </div>
            )}
        </div >
    )
}
