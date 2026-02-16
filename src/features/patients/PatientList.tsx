// PatientList: 환자 관리 목록 페이지
// 고객번호/담당치료사/최초방문일 표시, 예약 잡기 기능 포함

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getPatients, deletePatient } from './api'
import type { PatientWithDetails } from './api'
import { Plus, Search, Trash2, Edit, CalendarPlus, Users, Hash } from 'lucide-react'
import PatientModal from './PatientModal'
import { format } from 'date-fns'
import { useNavigate } from 'react-router-dom'
import type { Patient } from '@/types/db'

export default function PatientList() {
    const [search, setSearch] = useState('')
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [editingPatient, setEditingPatient] = useState<Patient | null>(null)
    const navigate = useNavigate()

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

    return (
        <div className="p-6 max-w-7xl mx-auto">
            {/* Header */}
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-black text-gray-900">환자 관리</h1>
                    <p className="text-sm text-gray-500 mt-1">
                        총 <span className="font-bold text-blue-600">{patients?.length || 0}</span>명의 환자가 등록되어 있습니다
                    </p>
                </div>
                <button
                    onClick={handleAddNew}
                    className="bg-blue-600 text-white px-5 py-2.5 rounded-xl flex items-center gap-2 hover:bg-blue-700 font-bold text-sm shadow-lg shadow-blue-500/20 transition-all hover:shadow-xl hover:shadow-blue-500/30"
                >
                    <Plus className="w-4 h-4" />
                    환자 등록
                </button>
            </div>

            {/* 검색 */}
            <div className="mb-6 relative">
                <input
                    type="text"
                    placeholder="환자 이름으로 검색..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full pl-11 pr-4 py-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none font-medium text-sm shadow-sm"
                />
                <Search className="w-5 h-5 text-gray-400 absolute left-4 top-3.5" />
            </div>

            {/* 테이블 */}
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
                            <th className="px-5 py-3.5 text-[10px] font-black text-gray-400 uppercase tracking-wider">최초 방문</th>
                            <th className="px-5 py-3.5 text-[10px] font-black text-gray-400 uppercase tracking-wider">최근 방문</th>
                            <th className="px-5 py-3.5 text-[10px] font-black text-gray-400 uppercase tracking-wider text-right">관리</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                        {isLoading ? (
                            <tr>
                                <td colSpan={10} className="px-6 py-12 text-center">
                                    <div className="flex flex-col items-center gap-2">
                                        <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                                        <span className="text-sm text-gray-400 font-medium">로딩 중...</span>
                                    </div>
                                </td>
                            </tr>
                        ) : patients?.length === 0 ? (
                            <tr>
                                <td colSpan={10} className="px-6 py-16 text-center">
                                    <div className="flex flex-col items-center gap-3">
                                        <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center">
                                            <Users className="w-6 h-6 text-gray-300" />
                                        </div>
                                        <div>
                                            <p className="text-sm font-bold text-gray-500">등록된 환자가 없습니다</p>
                                            <p className="text-xs text-gray-400 mt-0.5">상단의 '환자 등록' 버튼으로 새 환자를 추가하세요</p>
                                        </div>
                                    </div>
                                </td>
                            </tr>
                        ) : (
                            patients?.map((patient: PatientWithDetails) => (
                                <tr key={patient.id} className="hover:bg-blue-50/30 transition-colors group">
                                    {/* 고객번호 */}
                                    <td className="px-5 py-3">
                                        <span className="inline-flex items-center px-2 py-0.5 bg-blue-50 text-blue-600 rounded-md text-xs font-black">
                                            #{patient.patient_no}
                                        </span>
                                    </td>
                                    {/* 이름 */}
                                    <td className="px-5 py-3">
                                        <span className="font-bold text-gray-900 text-sm">{patient.name}</span>
                                    </td>
                                    {/* 성별 */}
                                    <td className="px-5 py-3">
                                        <span className={`text-xs font-bold px-2 py-0.5 rounded-md ${patient.gender === 'M' || patient.gender === 'MALE'
                                                ? 'bg-sky-50 text-sky-600'
                                                : 'bg-pink-50 text-pink-500'
                                            }`}>
                                            {patient.gender === 'M' || patient.gender === 'MALE' ? '남' : '여'}
                                        </span>
                                    </td>
                                    {/* 나이 */}
                                    <td className="px-5 py-3 text-sm text-gray-500 font-medium">
                                        {patient.birth_date
                                            ? `${new Date().getFullYear() - parseInt(patient.birth_date.substring(0, 4))}세`
                                            : '-'}
                                    </td>
                                    {/* 연락처 */}
                                    <td className="px-5 py-3 text-sm text-gray-500 font-medium">
                                        {patient.phone || '-'}
                                    </td>
                                    {/* 담당치료사 */}
                                    <td className="px-5 py-3">
                                        {patient.last_therapist_name ? (
                                            <span className="text-xs font-bold text-gray-700 bg-gray-100 px-2 py-0.5 rounded-md">
                                                {patient.last_therapist_name}
                                            </span>
                                        ) : (
                                            <span className="text-xs text-gray-300">-</span>
                                        )}
                                    </td>
                                    {/* 방문 횟수 */}
                                    <td className="px-5 py-3">
                                        <span className="text-sm font-bold text-gray-700">{patient.visit_count}</span>
                                        <span className="text-xs text-gray-400 ml-0.5">회</span>
                                    </td>
                                    {/* 최초 방문 */}
                                    <td className="px-5 py-3 text-xs text-gray-400 font-medium">
                                        {patient.first_visit
                                            ? format(new Date(patient.first_visit), 'yy.MM.dd')
                                            : '-'}
                                    </td>
                                    {/* 최근 방문 */}
                                    <td className="px-5 py-3 text-xs text-gray-400 font-medium">
                                        {patient.last_visit
                                            ? format(new Date(patient.last_visit), 'yy.MM.dd')
                                            : '-'}
                                    </td>
                                    {/* 관리 버튼 */}
                                    <td className="px-5 py-3 text-right">
                                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
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
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            <PatientModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                initialData={editingPatient}
            />
        </div>
    )
}
