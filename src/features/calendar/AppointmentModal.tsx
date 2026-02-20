import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { formatKST, parseKSTDateTime } from '@/lib/dateUtils'
import { usePatients, useProfiles, useCreateAppointment, useUpdateAppointment, usePatientAppointments } from './useCalendar'
import PatientForm from '@/features/patients/PatientForm'
import { X, Loader2, Calendar, User, UserCheck, Search, CheckCircle, Lock, ArrowRight } from 'lucide-react'
import { useAuth } from '@/features/auth/AuthContext'
import type { Appointment, Patient } from '@/types/db'


const appointmentSchema = z.object({
    patient_id: z.string().optional(),
    therapist_id: z.string().min(1, '치료사를 선택해주세요.'),
    date: z.string().min(1, '날짜를 선택해주세요.'),
    start_time: z.string().min(1, '시작 시간을 선택해주세요.'),
    end_time: z.string().min(1, '종료 시간을 선택해주세요.'),
    memo: z.string().optional(),
    event_type: z.enum(['APPOINTMENT', 'BLOCK']),
    block_title: z.string().optional(),
})

type AppointmentForm = z.infer<typeof appointmentSchema>

type Props = {
    isOpen: boolean
    onClose: () => void
    initialData?: { date: string; start_time: string; end_time?: string; therapist_id?: string } | null
    editingAppointment?: Appointment | null
}

type ModalStep = 'TYPE_SELECT' | 'PATIENT_SEARCH' | 'QUICK_CREATE' | 'DETAIL_FORM'

export default function AppointmentModal({ isOpen, onClose, initialData, editingAppointment }: Props) {
    const { profile: myProfile } = useAuth()
    const { data: patients } = usePatients()
    const { data: profiles } = useProfiles(myProfile?.system_id)
    const createMutation = useCreateAppointment()
    const updateMutation = useUpdateAppointment()


    const [step, setStep] = useState<ModalStep>('TYPE_SELECT')
    const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null)
    const [searchQuery, setSearchQuery] = useState('')

    const {
        register,
        handleSubmit,
        setValue,
        watch,
        reset,
        formState: { isSubmitting },
    } = useForm<AppointmentForm>({
        resolver: zodResolver(appointmentSchema),
        defaultValues: {
            event_type: 'APPOINTMENT',
        }
    })

    const eventType = watch('event_type')

    useEffect(() => {
        if (isOpen) {
            if (editingAppointment) {
                // ... (existing logic)
                setStep('DETAIL_FORM')
                setSelectedPatient(editingAppointment.patient || null)
                setValue('event_type', editingAppointment.event_type)
                setValue('block_title', editingAppointment.block_title || '')
                setValue('memo', editingAppointment.note || '')
                setValue('therapist_id', editingAppointment.therapist_id)

                const start = new Date(editingAppointment.start_time)
                const end = new Date(editingAppointment.end_time)
                // ... (snap logic)

                // (Existing date/time logic...)
                const snapMins = (date: Date) => {
                    const m = date.getMinutes()
                    const snappedM = Math.round(m / 10) * 10
                    const newDate = new Date(date)
                    newDate.setMinutes(snappedM)
                    newDate.setSeconds(0)
                    return newDate
                }

                const snappedStart = snapMins(start)
                const snappedEnd = snapMins(end)

                setValue('date', formatKST(snappedStart, 'yyyy-MM-dd'))
                setValue('start_time', formatKST(snappedStart, 'HH:mm'))
                setValue('end_time', formatKST(snappedEnd, 'HH:mm'))
            } else {
                setStep('TYPE_SELECT')
                setSelectedPatient(null)
                setSearchQuery('')

                reset({
                    event_type: initialData ? 'APPOINTMENT' : 'APPOINTMENT',
                    block_title: '',
                    memo: '',
                })

                if (initialData) {
                    // ... (existing initialData logic)
                    setValue('date', initialData.date)
                    setValue('therapist_id', initialData.therapist_id || myProfile?.id || '')
                    // ... (time logic)
                    if (initialData.end_time) {
                        setValue('start_time', initialData.start_time)
                        setValue('end_time', initialData.end_time)
                    } else {
                        const [h, m] = initialData.start_time.split(':').map(Number)
                        const snappedM = Math.round(m / 10) * 10
                        setValue('start_time', `${h.toString().padStart(2, '0')}:${snappedM.toString().padStart(2, '0')} `)

                        const endM = snappedM
                        const endH = (h + 1).toString().padStart(2, '0')
                        setValue('end_time', `${endH}:${endM.toString().padStart(2, '0')} `)
                    }
                }
            }
        }
    }, [isOpen, initialData, editingAppointment, setValue, reset, myProfile])


    const { data: patientHistory } = usePatientAppointments(selectedPatient?.id)

    const onSubmit = async (data: AppointmentForm) => {
        if (!myProfile?.system_id) {
            alert('시스템 정보가 없습니다. 관리자에게 문의하여 소속 시스템을 설정해주세요.')
            return
        }

        try {
            const startDateTime = parseKSTDateTime(data.date, data.start_time)
            const endDateTime = parseKSTDateTime(data.date, data.end_time)

            if (editingAppointment) {
                await updateMutation.mutateAsync({
                    id: editingAppointment.id,
                    updates: {
                        event_type: data.event_type,
                        patient_id: data.event_type === 'APPOINTMENT' ? selectedPatient?.id || null : null,
                        therapist_id: data.therapist_id,
                        start_time: startDateTime.toISOString(),
                        end_time: endDateTime.toISOString(),
                        note: data.memo, // 예약 메모에도 저장 (선택 사항)
                        block_title: data.block_title,
                        version: editingAppointment.version,
                    }
                })
            } else {
                await createMutation.mutateAsync({
                    event_type: data.event_type,
                    patient_id: data.event_type === 'APPOINTMENT' ? selectedPatient?.id || null : null,
                    therapist_id: data.therapist_id,
                    start_time: startDateTime.toISOString(),
                    end_time: endDateTime.toISOString(),
                    status: 'PENDING',
                    note: data.memo, // 예약 메모에도 저장
                    block_title: data.block_title,
                    system_id: myProfile?.system_id,
                })
            }
            onClose()
        } catch (error) {
            console.error('Failed to save appointment', error)
            alert(`저장에 실패했습니다. (${error instanceof Error ? error.message : 'Unknown error'})`)
        }
    }

    if (!isOpen) return null

    // Filtered patients for search
    const patientList = (patients ?? []) as Patient[]
    const filteredPatients = patientList.filter((p: Patient) =>
        p.name.includes(searchQuery) || p.phone?.includes(searchQuery) || p.patient_no.toString().includes(searchQuery)
    )

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4 font-sans" onClick={onClose}>
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-[480px] max-h-[95vh] overflow-hidden animate-in fade-in zoom-in duration-200" onClick={e => e.stopPropagation()}>
                {/* Step 1: Type Select */}
                {step === 'TYPE_SELECT' && (
                    <div className="p-6">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-xl font-black text-gray-900">예약 유형 선택</h2>
                            <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors"><X className="w-5 h-5 text-gray-500" /></button>
                        </div>
                        <div className="grid grid-cols-1 gap-3">
                            <button
                                onClick={() => { setValue('event_type', 'APPOINTMENT'); setStep('PATIENT_SEARCH') }}
                                className="flex items-center gap-4 p-5 border-2 border-gray-100 rounded-2xl hover:border-blue-500 hover:bg-blue-50 transition-all group text-left"
                            >
                                <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center text-blue-600 group-hover:scale-110 transition-transform shrink-0">
                                    <UserCheck className="w-6 h-6" />
                                </div>
                                <div className="flex-1">
                                    <div className="text-lg font-bold text-gray-900 mb-0.5 leading-none">치료 예약 (재진/기본)</div>
                                    <div className="text-xs text-gray-500 font-medium">기존 환자 또는 신규 환자 예약</div>
                                </div>
                                <ArrowRight className="w-5 h-5 text-gray-300 group-hover:text-blue-500 transition-colors" />
                            </button>
                            <button
                                onClick={() => { setValue('event_type', 'BLOCK'); setStep('DETAIL_FORM') }}
                                className="flex items-center gap-4 p-5 border-2 border-gray-100 rounded-2xl hover:border-gray-500 hover:bg-gray-50 transition-all group text-left"
                            >
                                <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center text-gray-600 group-hover:scale-110 transition-transform shrink-0">
                                    <Lock className="w-6 h-6" />
                                </div>
                                <div className="flex-1">
                                    <div className="text-lg font-bold text-gray-900 mb-0.5 leading-none">일정 잠금 (Block)</div>
                                    <div className="text-xs text-gray-500 font-medium">점심, 회의, 휴가 등 일정 차단</div>
                                </div>
                                <ArrowRight className="w-5 h-5 text-gray-300 group-hover:text-gray-500 transition-colors" />
                            </button>
                        </div>
                    </div>
                )}

                {/* Patient Search Step... (Existing logic remains) */}
                {step === 'PATIENT_SEARCH' && (
                    <div className="p-6">
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-xl font-black text-gray-900">환자 검색</h2>
                            <button onClick={() => setStep('TYPE_SELECT')} className="text-blue-600 font-bold text-xs hover:underline">이전으로</button>
                        </div>
                        <div className="relative mb-4">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                                autoFocus
                                type="text"
                                placeholder="이름, 번호, 연락처 검색"
                                className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none font-bold text-sm"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                        <div className="max-h-[280px] overflow-auto space-y-2 pr-1 mb-4 scrollbar-hide">
                            <button
                                onClick={() => {
                                    setStep('QUICK_CREATE')
                                }}
                                className="w-full flex items-center justify-between p-3 bg-blue-50 text-blue-600 rounded-xl font-bold border border-blue-100 hover:bg-blue-100 transition-all shadow-sm text-sm"
                            >
                                <span>+ 신규 환자로 등록하기</span>
                                <CheckCircle className="w-4 h-4" />
                            </button>
                            {filteredPatients.map((p: Patient) => (
                                <button
                                    key={p.id}
                                    onClick={() => { setSelectedPatient(p); setStep('DETAIL_FORM') }}
                                    className="w-full flex items-center gap-3 p-3 border border-gray-100 rounded-xl hover:bg-gray-50 hover:border-gray-300 transition-all text-left group"
                                >
                                    <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center text-gray-500 group-hover:bg-blue-100 group-hover:text-blue-600 transition-colors">
                                        <User className="w-4 h-4" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="font-black text-gray-900 text-sm truncate">{p.name} <span className="text-gray-400 text-[10px] font-bold">{p.is_manual_no ? '' : '#'}{p.patient_no}</span></div>
                                        <div className="text-[10px] text-gray-500 font-medium truncate">{p.birth_date ? `${new Date().getFullYear() - parseInt(p.birth_date.substring(0, 4))}세` : '나이 정보 없음'} · {p.phone || '연락처 없음'}</div>
                                    </div>
                                </button>
                            ))}
                            {filteredPatients.length === 0 && searchQuery && (
                                <div className="text-center py-6 text-gray-400">
                                    <div className="font-bold text-sm">검색 결과가 없습니다.</div>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Step 2: Quick Create Form */}
                {step === 'QUICK_CREATE' && (
                    <div className="p-6">
                        <div className="flex justify-between items-center mb-5">
                            <h2 className="text-xl font-black text-gray-900 flex items-center gap-2">
                                <UserCheck className="w-5 h-5 text-blue-600" />
                                신규 환자 등록
                            </h2>
                            <button onClick={() => setStep('PATIENT_SEARCH')} className="text-gray-400 hover:text-gray-600 transition-colors"><X className="w-5 h-5" /></button>
                        </div>

                        <PatientForm
                            initialData={null}
                            defaultName={searchQuery}
                            onSuccess={(newPatient) => {
                                setSelectedPatient(newPatient)
                                setStep('DETAIL_FORM')
                            }}
                            onCancel={() => setStep('PATIENT_SEARCH')}
                        />
                    </div>
                )}

                {/* Step 3: Detail Form */}
                {step === 'DETAIL_FORM' && (
                    <form onSubmit={handleSubmit(onSubmit)}>
                        <div className="bg-blue-600 px-6 py-4 flex items-center justify-between text-white">
                            <div>
                                <h2 className="text-lg font-black flex items-center gap-2 leading-none">
                                    {eventType === 'BLOCK' ? <Lock className="w-5 h-5" /> : <Calendar className="w-5 h-5" />}
                                    {editingAppointment ? (eventType === 'BLOCK' ? '일정 잠금 수정' : '예약 정보 수정') : (eventType === 'BLOCK' ? '일정 잠금 상세' : '예약 상세 입력')}
                                </h2>
                            </div>
                            <button type="button" onClick={onClose} className="p-1.5 hover:bg-white/20 rounded-lg transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="p-6 space-y-4 max-h-[60vh] overflow-auto scrollbar-hide">

                            {/* Row 1: Patient/Title & Therapist */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {/* Col 1 */}
                                <div>
                                    <label className="block text-[10px] font-black text-gray-500 mb-1 ml-1">
                                        {eventType === 'BLOCK' ? '잠금 제목' : '환자 정보'}
                                    </label>
                                    {eventType === 'APPOINTMENT' ? (
                                        <div className="bg-blue-50/50 p-2.5 rounded-xl border border-blue-100 flex items-center gap-2.5 h-[42px]">
                                            <div className="w-6 h-6 bg-white rounded-full shadow-sm flex items-center justify-center text-blue-600 shrink-0">
                                                <User className="w-3.5 h-3.5" />
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <div className="text-sm font-black text-gray-900 truncate leading-none">
                                                    {selectedPatient ? selectedPatient.name : '신규'}
                                                </div>
                                                {selectedPatient && <div className="text-[10px] text-gray-500 font-medium truncate">{selectedPatient.is_manual_no ? '' : '#'}{selectedPatient.patient_no}</div>}
                                            </div>
                                            {!editingAppointment && (
                                                <button type="button" onClick={() => setStep('PATIENT_SEARCH')} className="text-[10px] font-bold text-blue-600 hover:bg-blue-100 px-2 py-1 rounded-lg">변경</button>
                                            )}
                                        </div>
                                    ) : (
                                        <input
                                            {...register('block_title')}
                                            type="text"
                                            placeholder="예: 점심시간"
                                            className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none font-bold text-xs h-[42px]"
                                        />
                                    )}
                                </div>

                                {/* Col 2 */}
                                <div>
                                    <label className="block text-[10px] font-black text-gray-500 mb-1 ml-1">담당 치료사</label>
                                    <select
                                        {...register('therapist_id')}
                                        className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none font-bold cursor-pointer transition-all text-xs h-[42px]"
                                    >
                                        <option value="">선택</option>
                                        {profiles?.map(p => <option key={p.id} value={p.id}>{p.full_name || p.name}</option>)}
                                    </select>
                                </div>
                            </div>

                            {/* Row 2: Date & Time */}
                            <div>
                                <label className="block text-[10px] font-black text-gray-500 mb-1 ml-1">예약 일시 & 금액</label>
                                <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mb-2">
                                    <div className="col-span-3 sm:col-span-2">
                                        <span className="block text-[9px] text-gray-400 font-bold mb-0.5 ml-1">날짜</span>
                                        <input type="date" {...register('date')} className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl font-bold text-xs h-[42px]" />
                                    </div>
                                    <div className="col-span-3 grid grid-cols-2 gap-2">
                                        <div>
                                            <span className="block text-[9px] text-gray-400 font-bold mb-0.5 ml-1">시작</span>
                                            <div className="flex gap-1">
                                                <select
                                                    value={watch('start_time')?.split(':')[0] || '09'}
                                                    onChange={(e) => {
                                                        const h = e.target.value
                                                        const m = watch('start_time')?.split(':')[1] || '00'
                                                        setValue('start_time', `${h}:${m}`)
                                                    }}
                                                    className="w-full px-1 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none font-bold cursor-pointer transition-all text-xs h-[42px] text-center appearance-none"
                                                >
                                                    {Array.from({ length: 19 }, (_, i) => i + 6).map(h => (
                                                        <option key={h} value={h.toString().padStart(2, '0')}>{h}시</option>
                                                    ))}
                                                </select>
                                                <select
                                                    value={watch('start_time')?.split(':')[1] || '00'}
                                                    onChange={(e) => {
                                                        const h = watch('start_time')?.split(':')[0] || '09'
                                                        const m = e.target.value
                                                        setValue('start_time', `${h}:${m}`)
                                                    }}
                                                    className="w-full px-1 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none font-bold cursor-pointer transition-all text-xs h-[42px] text-center appearance-none"
                                                >
                                                    {['00', '10', '20', '30', '40', '50'].map(m => (
                                                        <option key={m} value={m}>{m}분</option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>
                                        <div>
                                            <span className="block text-[9px] text-gray-400 font-bold mb-0.5 ml-1">종료</span>
                                            <div className="flex gap-1">
                                                <select
                                                    value={watch('end_time')?.split(':')[0] || '10'}
                                                    onChange={(e) => {
                                                        const h = e.target.value
                                                        const m = watch('end_time')?.split(':')[1] || '00'
                                                        setValue('end_time', `${h}:${m}`)
                                                    }}
                                                    className="w-full px-1 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none font-bold cursor-pointer transition-all text-xs h-[42px] text-center appearance-none"
                                                >
                                                    {Array.from({ length: 19 }, (_, i) => i + 6).map(h => (
                                                        <option key={h} value={h.toString().padStart(2, '0')}>{h}시</option>
                                                    ))}
                                                </select>
                                                <select
                                                    value={watch('end_time')?.split(':')[1] || '00'}
                                                    onChange={(e) => {
                                                        const h = watch('end_time')?.split(':')[0] || '10'
                                                        const m = e.target.value
                                                        setValue('end_time', `${h}:${m}`)
                                                    }}
                                                    className="w-full px-1 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none font-bold cursor-pointer transition-all text-xs h-[42px] text-center appearance-none"
                                                >
                                                    {['00', '10', '20', '30', '40', '50'].map(m => (
                                                        <option key={m} value={m}>{m}분</option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Row 3: Memo (History & New) */}
                            <div className="space-y-2">
                                <label className="block text-[10px] font-black text-gray-500 ml-1">메모 (환자 히스토리)</label>

                                {/* 1. History View (Appointment Notes) */}
                                {selectedPatient && patientHistory && (
                                    <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 max-h-[120px] overflow-y-auto text-xs text-gray-700 whitespace-pre-wrap mb-2 space-y-2 scrollbar-thin scrollbar-thumb-amber-200">
                                        <div className="text-[9px] text-amber-500 font-bold mb-1 sticky top-0 bg-amber-50 pb-1 border-b border-amber-100">이전 기록</div>
                                        {patientHistory.filter(app => app.note).map(app => (
                                            <div key={app.id} className="border-b border-amber-100 last:border-0 pb-1 last:pb-0">
                                                <span className="text-[10px] text-amber-600 font-bold block mb-0.5">
                                                    [{formatKST(new Date(app.start_time), 'yyyy-MM-dd HH:mm')}]
                                                </span>
                                                {app.note}
                                            </div>
                                        ))}
                                        {patientHistory.filter(app => app.note).length === 0 && (
                                            <div className="text-gray-400 text-center py-2">기록 없음</div>
                                        )}
                                    </div>
                                )}

                                {/* 2. New Memo Input */}
                                <textarea
                                    {...register('memo')}
                                    rows={3}
                                    placeholder={selectedPatient ? "새로운 메모를 입력하세요 (저장 시 날짜와 함께 상단에 추가됩니다)" : "메모 입력..."}
                                    className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none font-bold text-xs resize-none transition-all placeholder:font-medium"
                                />
                            </div>

                            {/* Footer Info */}
                            <div className="text-[10px] text-gray-400 bg-gray-50 p-3 rounded-lg text-center leading-relaxed">
                                환자정보, 담당 치료사 정보는 예약완료 후<br />환자 관리에서도 수정가능합니다.
                            </div>
                        </div>

                        <div className="p-6 pt-0 flex gap-3">
                            <button
                                type="button"
                                onClick={() => {
                                    if (editingAppointment) {
                                        onClose()
                                    } else {
                                        if (eventType === 'BLOCK') {
                                            setStep('TYPE_SELECT')
                                        } else {
                                            setStep('PATIENT_SEARCH')
                                        }
                                    }
                                }}
                                className="flex-1 py-3 text-gray-400 font-black hover:bg-gray-100 rounded-xl transition-all text-xs"
                            >
                                {editingAppointment ? '취소' : '이전'}
                            </button>
                            <button
                                type="submit"
                                disabled={isSubmitting}
                                className="flex-[2] bg-blue-600 text-white py-3 rounded-xl font-black hover:bg-blue-700 shadow-lg shadow-blue-500/20 transition-all flex items-center justify-center gap-2 text-sm"
                            >
                                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : '저장하기'}
                            </button>
                        </div>
                    </form>
                )}
            </div>
        </div>
    )
}
