import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getPatientMemberships, createMembership, deleteMembership } from './membershipsApi'
import type { PatientMembership } from '@/types/db'
import { Loader2, Plus, Trash2 } from 'lucide-react'
import { format } from 'date-fns'
import { useAuth } from '@/features/auth/AuthContext'

type Props = {
    patientId: string
}

export default function PatientMembershipsPanel({ patientId }: Props) {
    const { profile } = useAuth()
    const queryClient = useQueryClient()
    const [isCreating, setIsCreating] = useState(false)
    const [formData, setFormData] = useState({
        name: '10회권 패키지',
        total_sessions: 10,
        amount_paid: 500000,
        payment_date: format(new Date(), 'yyyy-MM-dd')
    })

    const { data: memberships, isLoading } = useQuery({
        queryKey: ['memberships', patientId],
        queryFn: () => getPatientMemberships(patientId)
    })

    const createMutation = useMutation({
        mutationFn: async (data: Partial<PatientMembership>) => {
            return await createMembership({
                ...data,
                patient_id: patientId,
                system_id: profile?.system_id!,
            })
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['memberships', patientId] })
            queryClient.invalidateQueries({ queryKey: ['patients'] })
            setIsCreating(false)
            setFormData({
                name: '10회권 패키지',
                total_sessions: 10,
                amount_paid: 500000,
                payment_date: format(new Date(), 'yyyy-MM-dd')
            })
        },
        onError: (err) => alert('등록 실패: ' + err.message)
    })

    const deleteMutation = useMutation({
        mutationFn: deleteMembership,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['memberships', patientId] })
            queryClient.invalidateQueries({ queryKey: ['patients'] })
        },
        onError: (err) => alert('삭제 실패: ' + err.message)
    })

    const handleCreate = (e: React.FormEvent) => {
        e.preventDefault()
        createMutation.mutate(formData)
    }

    const handleDelete = (id: string) => {
        if (confirm('이 회원권을 삭제하시겠습니까? (연결된 예약에는 영향을 주지 않지만 기록이 사라집니다)')) {
            deleteMutation.mutate(id)
        }
    }

    return (
        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
            <div className="flex justify-between items-center bg-gray-50 p-3 rounded-xl border border-gray-100">
                <div className="text-sm font-bold text-gray-700">회원권 내역</div>
                {!isCreating && (
                    <button
                        onClick={() => setIsCreating(true)}
                        className="flex items-center gap-1 text-xs font-bold text-blue-600 bg-blue-50 px-2.5 py-1.5 rounded-lg hover:bg-blue-100 transition-colors"
                    >
                        <Plus className="w-3 h-3" />
                        신규 등록
                    </button>
                )}
            </div>

            {isCreating && (
                <form onSubmit={handleCreate} className="bg-white border border-blue-100 p-4 rounded-xl shadow-sm space-y-3">
                    <div className="text-xs font-bold text-blue-600 mb-2">새 회원권 발급</div>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="col-span-2">
                            <label className="block text-[10px] font-black text-gray-500 mb-1 ml-1">회원권 이름</label>
                            <input
                                type="text"
                                value={formData.name}
                                onChange={e => setFormData({ ...formData, name: e.target.value })}
                                required
                                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-bold outline-none focus:border-blue-500"
                            />
                        </div>
                        <div>
                            <label className="block text-[10px] font-black text-gray-500 mb-1 ml-1">총 횟수</label>
                            <input
                                type="number"
                                min="1"
                                value={formData.total_sessions}
                                onChange={e => setFormData({ ...formData, total_sessions: parseInt(e.target.value) || 0 })}
                                required
                                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-bold outline-none focus:border-blue-500 text-right"
                            />
                        </div>
                        <div>
                            <label className="block text-[10px] font-black text-gray-500 mb-1 ml-1">결제 금액(원)</label>
                            <input
                                type="number"
                                min="0"
                                value={formData.amount_paid}
                                onChange={e => setFormData({ ...formData, amount_paid: parseInt(e.target.value) || 0 })}
                                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-bold outline-none focus:border-blue-500 text-right"
                            />
                        </div>
                        <div className="col-span-2">
                            <label className="block text-[10px] font-black text-gray-500 mb-1 ml-1">결제일</label>
                            <input
                                type="date"
                                value={formData.payment_date}
                                onChange={e => setFormData({ ...formData, payment_date: e.target.value })}
                                required
                                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-bold outline-none focus:border-blue-500"
                            />
                        </div>
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                        <button
                            type="button"
                            onClick={() => setIsCreating(false)}
                            className="px-3 py-1.5 text-xs font-bold text-gray-500 hover:bg-gray-100 rounded-lg"
                        >
                            취소
                        </button>
                        <button
                            type="submit"
                            disabled={createMutation.isPending}
                            className="px-4 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg flex items-center gap-1"
                        >
                            {createMutation.isPending && <Loader2 className="w-3 h-3 animate-spin" />}
                            발급
                        </button>
                    </div>
                </form>
            )}

            {isLoading ? (
                <div className="py-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>
            ) : memberships?.length === 0 ? (
                <div className="py-8 text-center text-sm text-gray-400 font-bold bg-gray-50 rounded-xl border border-gray-100 border-dashed">
                    발급된 회원권이 없습니다.
                </div>
            ) : (
                <div className="space-y-3">
                    {memberships?.map(m => (
                        <div key={m.id} className="p-4 border border-gray-100 rounded-xl shadow-sm relative overflow-hidden group">
                            {/* status indicator line */}
                            <div className={`absolute left-0 top-0 bottom-0 w-1 ${m.status === 'ACTIVE' ? 'bg-green-500' : 'bg-gray-300'}`} />

                            <div className="flex justify-between items-start mb-2 pl-2">
                                <div>
                                    <h4 className="font-bold text-gray-900 flex items-center gap-2">
                                        {m.name}
                                        {m.status === 'ACTIVE' ? (
                                            <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded flex items-center font-bold">ACTIVE</span>
                                        ) : (
                                            <span className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded flex items-center font-bold">{m.status}</span>
                                        )}
                                    </h4>
                                    <div className="text-[11px] text-gray-400 font-medium mt-0.5">결제일: {m.payment_date} · 금액: {m.amount_paid.toLocaleString()}원</div>
                                </div>
                                <div className="text-right">
                                    <div className="text-sm font-black text-gray-900">{m.used_sessions} <span className="text-gray-400 font-medium">/ {m.total_sessions}</span></div>
                                    <div className="text-[10px] text-gray-400 font-bold">({m.total_sessions - m.used_sessions}회 남음)</div>
                                </div>
                            </div>

                            {/* Progress bar */}
                            <div className="mt-3 pl-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                <div
                                    className={`h-full transition-all ${m.status === 'ACTIVE' ? 'bg-green-500' : 'bg-gray-400'}`}
                                    style={{ width: `${Math.min(100, (m.used_sessions / m.total_sessions) * 100)}%` }}
                                />
                            </div>

                            <button
                                onClick={() => handleDelete(m.id)}
                                className="absolute top-3 right-3 p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-md opacity-0 group-hover:opacity-100 transition-all"
                                title="삭제"
                            >
                                <Trash2 className="w-3 h-3" />
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
