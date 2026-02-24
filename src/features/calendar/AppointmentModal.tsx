import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { formatKST, parseKSTDateTime } from '@/lib/dateUtils'
import { useClients, useProfiles, useCreateAppointment, useUpdateAppointment, useClientAppointments, useMembershipPackages } from './useCalendar'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getActiveMemberships } from '@/features/clients/membershipsApi'
import ClientForm from '@/features/clients/ClientForm'
import { X, Loader2, Calendar, User, UserCheck, Search, CheckCircle, Lock, ArrowRight, Plus } from 'lucide-react'
import { useAuth } from '@/features/auth/AuthContext'
import { supabase } from '@/lib/supabase'
import type { Appointment, Client } from '@/types/db'


const appointmentSchema = z.object({
    client_id: z.string().optional(),
    instructor_id: z.string().min(1, '선생님을 선택해주세요.'),
    date: z.string().min(1, '날짜를 선택해주세요.'),
    start_time: z.string().min(1, '시작 시간을 선택해주세요.'),
    end_time: z.string().min(1, '종료 시간을 선택해주세요.'),
    memo: z.string().optional(),
    event_type: z.enum(['APPOINTMENT', 'BLOCK']),
    block_title: z.string().optional(),
    membership_id: z.string().optional().nullable(),
    session_type: z.enum(['normal', 'option1', 'option2', 'option3']),
})

type AppointmentForm = z.infer<typeof appointmentSchema>

type Props = {
    isOpen: boolean
    onClose: () => void
    initialData?: { date: string; start_time: string; end_time?: string; instructor_id?: string } | null
    editingAppointment?: Appointment | null
}

type ModalStep = 'TYPE_SELECT' | 'PATIENT_SEARCH' | 'QUICK_CREATE' | 'DETAIL_FORM'

export default function AppointmentModal({ isOpen, onClose, initialData, editingAppointment }: Props) {
    const { profile: myProfile } = useAuth()
    const { data: clients } = useClients()
    const { data: profiles } = useProfiles(myProfile?.system_id)
    const createMutation = useCreateAppointment()
    const updateMutation = useUpdateAppointment()


    const [step, setStep] = useState<ModalStep>('TYPE_SELECT')
    const [selectedClient, setselectedClient] = useState<Client | null>(null)
    const [searchQuery, setSearchQuery] = useState('')

    // Quick Package Purchase State
    const [showPackageForm, setShowPackageForm] = useState(false)
    const [selectedPackageId, setSelectedPackageId] = useState('')
    const [packageDiscount, setPackageDiscount] = useState<number>(0)
    const [isPurchasingPackage, setIsPurchasingPackage] = useState(false)
    const queryClient = useQueryClient()

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
            session_type: 'normal',
        }
    })

    const eventType = watch('event_type')
    const watchStartTime = watch('start_time')
    const watchEndTime = watch('end_time')

    // 시간 유효성 검증: 종료시간이 시작시간보다 앞서면 true
    const isTimeInvalid = (() => {
        if (!watchStartTime || !watchEndTime) return false
        const [sh, sm] = watchStartTime.trim().split(':').map(Number)
        const [eh, em] = watchEndTime.trim().split(':').map(Number)
        if (isNaN(sh) || isNaN(sm) || isNaN(eh) || isNaN(em)) return false
        return (eh * 60 + em) <= (sh * 60 + sm)
    })()

    useEffect(() => {
        if (isOpen) {
            if (editingAppointment) {
                // ... (existing logic)
                setStep('DETAIL_FORM')
                setselectedClient(editingAppointment.client || null)
                setValue('event_type', editingAppointment.event_type)
                setValue('block_title', editingAppointment.block_title || '')
                setValue('memo', editingAppointment.note || '')
                setValue('instructor_id', editingAppointment.instructor_id)
                setValue('membership_id', editingAppointment.membership_id || '')
                setValue('session_type', editingAppointment.session_type || 'normal')

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
                setselectedClient(null)
                setSearchQuery('')

                reset({
                    event_type: initialData ? 'APPOINTMENT' : 'APPOINTMENT',
                    block_title: '',
                    memo: '',
                    membership_id: '',
                    session_type: 'normal',
                })
                setShowPackageForm(false)
                setSelectedPackageId('')
                setPackageDiscount(0)

                if (initialData) {
                    // ... (existing initialData logic)
                    setValue('date', initialData.date)
                    setValue('instructor_id', initialData.instructor_id || myProfile?.id || '')
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


    const { data: clientHistory } = useClientAppointments(selectedClient?.id)

    // 선택된 고객의 ACTIVE 회원권 목록 조회
    const { data: activeMemberships } = useQuery({
        queryKey: ['activeMemberships', selectedClient?.id],
        queryFn: () => getActiveMemberships(selectedClient!.id),
        enabled: !!selectedClient?.id,
    })

    // 시스템의 전체 회원권 패키지 조회
    const { data: membershipPackages } = useMembershipPackages(myProfile?.system_id)

    // 회원권 즉시 발급 핸들러
    const handlePurchasePackage = async () => {
        if (!selectedClient || !selectedPackageId || !myProfile?.system_id) return
        const pkg = membershipPackages?.find(p => p.id === selectedPackageId)
        if (!pkg) return

        setIsPurchasingPackage(true)
        try {
            const finalPrice = Math.max(0, pkg.default_price - packageDiscount)

            // Calculate expiration date if valid_days exists
            let expirationDate = null;
            if (pkg.valid_days) {
                const date = new Date();
                date.setDate(date.getDate() + pkg.valid_days);
                expirationDate = date.toISOString().split('T')[0];
            }

            const { data, error } = await supabase
                .from('client_memberships')
                .insert({
                    system_id: myProfile.system_id,
                    client_id: selectedClient.id,
                    name: pkg.name,
                    total_sessions: pkg.total_sessions,
                    used_sessions: 0,
                    amount_paid: finalPrice,
                    payment_date: new Date().toISOString().split('T')[0],
                    expiration_date: expirationDate,
                    status: 'ACTIVE'
                })
                .select('id')
                .single()

            if (error) throw error

            // 발급 성공 시, activeMemberships 캐시 무효화 및 해당 회원권 자동 선택
            await queryClient.invalidateQueries({ queryKey: ['activeMemberships', selectedClient.id] })
            setValue('membership_id', data.id)
            setShowPackageForm(false)
            setSelectedPackageId('')
            setPackageDiscount(0)

        } catch (error) {
            console.error('Package purchase error:', error)
            alert('회원권 발급에 실패했습니다.')
        } finally {
            setIsPurchasingPackage(false)
        }
    }

    const onSubmit = async (data: AppointmentForm) => {
        if (!myProfile?.system_id) {
            alert('시스템 정보가 없습니다. 관리자에게 문의하여 소속 시스템을 설정해주세요.')
            return
        }

        try {
            const startDateTime = parseKSTDateTime(data.date, data.start_time)
            const endDateTime = parseKSTDateTime(data.date, data.end_time)

            // 안전장치: 종료시간이 시작시간보다 앞서면 저장 차단
            if (endDateTime <= startDateTime) {
                alert('종료 시간은 시작 시간 이후여야 합니다.')
                return
            }

            // 24시(자정) 넘기 방지: 24:00으로 클램핑
            const dayEnd = new Date(startDateTime)
            dayEnd.setHours(24, 0, 0, 0)
            if (endDateTime > dayEnd) {
                endDateTime.setTime(dayEnd.getTime())
            }

            if (editingAppointment) {
                await updateMutation.mutateAsync({
                    id: editingAppointment.id,
                    updates: {
                        event_type: data.event_type,
                        client_id: data.event_type === 'APPOINTMENT' ? selectedClient?.id || null : null,
                        instructor_id: data.instructor_id,
                        start_time: startDateTime.toISOString(),
                        end_time: endDateTime.toISOString(),
                        note: data.memo, // 예약 메모에도 저장 (선택 사항)
                        block_title: data.block_title,
                        membership_id: data.membership_id || null,
                        session_type: data.session_type,
                        version: editingAppointment.version,
                    }
                })
            } else {
                await createMutation.mutateAsync({
                    event_type: data.event_type,
                    client_id: data.event_type === 'APPOINTMENT' ? selectedClient?.id || null : null,
                    instructor_id: data.instructor_id,
                    start_time: startDateTime.toISOString(),
                    end_time: endDateTime.toISOString(),
                    status: 'PENDING',
                    note: data.memo, // 예약 메모에도 저장
                    block_title: data.block_title,
                    membership_id: data.membership_id || null,
                    session_type: data.session_type,
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

    // Filtered clients for search
    const ClientList = (clients ?? []) as Client[]
    const filteredClients = ClientList.filter((p: Client) =>
        p.name.includes(searchQuery) || p.phone?.includes(searchQuery) || p.client_no.toString().includes(searchQuery)
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
                                    <div className="text-lg font-bold text-gray-900 mb-0.5 leading-none">수업 예약 (재방문/기본)</div>
                                    <div className="text-xs text-gray-500 font-medium">기존 고객 또는 신규 고객 예약</div>
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

                {/* Client Search Step... (Existing logic remains) */}
                {step === 'PATIENT_SEARCH' && (
                    <div className="p-6">
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-xl font-black text-gray-900">고객 검색</h2>
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
                                <span>+ 신규 고객으로 등록하기</span>
                                <CheckCircle className="w-4 h-4" />
                            </button>
                            {filteredClients.map((p: Client) => (
                                <button
                                    key={p.id}
                                    onClick={() => { setselectedClient(p); setStep('DETAIL_FORM') }}
                                    className="w-full flex items-center gap-3 p-3 border border-gray-100 rounded-xl hover:bg-gray-50 hover:border-gray-300 transition-all text-left group"
                                >
                                    <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center text-gray-500 group-hover:bg-blue-100 group-hover:text-blue-600 transition-colors">
                                        <User className="w-4 h-4" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="font-black text-gray-900 text-sm truncate">{p.name} <span className="text-gray-400 text-[10px] font-bold">{p.is_manual_no ? '' : '#'}{p.client_no}</span></div>
                                        <div className="text-[10px] text-gray-500 font-medium truncate">{p.birth_date ? `${new Date().getFullYear() - parseInt(p.birth_date.substring(0, 4))}세` : '나이 정보 없음'} · {p.phone || '연락처 없음'}</div>
                                    </div>
                                </button>
                            ))}
                            {filteredClients.length === 0 && searchQuery && (
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
                                신규 고객 등록
                            </h2>
                            <button onClick={() => setStep('PATIENT_SEARCH')} className="text-gray-400 hover:text-gray-600 transition-colors"><X className="w-5 h-5" /></button>
                        </div>

                        <ClientForm
                            initialData={null}
                            defaultName={searchQuery}
                            onSuccess={(newClient) => {
                                setselectedClient(newClient)
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

                            {/* Row 1: Client/Title & Instructor */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {/* Col 1 */}
                                <div>
                                    <label className="block text-[10px] font-black text-gray-500 mb-1 ml-1">
                                        {eventType === 'BLOCK' ? '잠금 제목' : '고객 정보'}
                                    </label>
                                    {eventType === 'APPOINTMENT' ? (
                                        <div className="space-y-2">
                                            <div className="bg-blue-50/50 p-2.5 rounded-xl border border-blue-100 flex items-center gap-2.5 h-[42px]">
                                                <div className="w-6 h-6 bg-white rounded-full shadow-sm flex items-center justify-center text-blue-600 shrink-0">
                                                    <User className="w-3.5 h-3.5" />
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <div className="text-sm font-black text-gray-900 truncate leading-none">
                                                        {selectedClient ? selectedClient.name : '신규'}
                                                    </div>
                                                    <div className="flex items-center gap-1.5">
                                                        {selectedClient && <span className="text-[10px] text-gray-500 font-medium truncate">{selectedClient.is_manual_no ? '' : '#'}{selectedClient.client_no}</span>}
                                                        {editingAppointment?.visit_count && (
                                                            <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">
                                                                {editingAppointment.visit_count}회차
                                                            </span>
                                                        )}
                                                        {editingAppointment?.membership && (
                                                            <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                                                                🎟️ {editingAppointment.membership.total_sessions - editingAppointment.membership.used_sessions}/{editingAppointment.membership.total_sessions}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                                {!editingAppointment && (
                                                    <button type="button" onClick={() => setStep('PATIENT_SEARCH')} className="text-[10px] font-bold text-blue-600 hover:bg-blue-100 px-2 py-1 rounded-lg">변경</button>
                                                )}
                                            </div>
                                            {/* 회원권 선택 (고객이 활성화된 회원권이 있을 경우) */}
                                            {selectedClient && (
                                                <div className="animate-in fade-in slide-in-from-top-2 duration-300 bg-amber-50/50 p-2.5 rounded-xl border border-amber-100">
                                                    <div className="flex justify-between items-center mb-1 ml-1">
                                                        <label className="block text-[10px] font-black text-amber-600 flex items-center gap-1">🎟️ 회원권 적용</label>
                                                        {!editingAppointment && membershipPackages && membershipPackages.length > 0 && (
                                                            <button
                                                                type="button"
                                                                onClick={() => setShowPackageForm(!showPackageForm)}
                                                                className={`text-[10px] font-bold px-2 py-1 rounded transition-colors ${showPackageForm ? 'bg-gray-200 text-gray-700' : 'bg-amber-100 text-amber-700 hover:bg-amber-200'}`}
                                                            >
                                                                {showPackageForm ? '취소' : '+ 새 회원권 발급'}
                                                            </button>
                                                        )}
                                                    </div>

                                                    {showPackageForm ? (
                                                        <div className="space-y-2 mt-2 p-3 bg-white border border-amber-200 rounded-lg animate-in slide-in-from-top-1">
                                                            <div>
                                                                <label className="block text-[10px] font-bold text-gray-500 mb-1">패키지 상품 선택</label>
                                                                <select
                                                                    value={selectedPackageId}
                                                                    onChange={e => {
                                                                        setSelectedPackageId(e.target.value)
                                                                        setPackageDiscount(0) // 새 상품 선택시 할인 초기화
                                                                    }}
                                                                    className="w-full px-2 py-1.5 bg-gray-50 border border-gray-200 rounded-md text-xs font-bold focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                                                                >
                                                                    <option value="">패키지를 선택하세요</option>
                                                                    {membershipPackages?.filter(p => p.is_active).map(pkg => (
                                                                        <option key={pkg.id} value={pkg.id}>
                                                                            {pkg.name} ({pkg.total_sessions}회 / {pkg.default_price.toLocaleString()}원)
                                                                        </option>
                                                                    ))}
                                                                </select>
                                                            </div>

                                                            {selectedPackageId && membershipPackages?.find(p => p.id === selectedPackageId) && (() => {
                                                                const pkg = membershipPackages.find(p => p.id === selectedPackageId)!
                                                                const finalPrice = Math.max(0, pkg.default_price - packageDiscount)
                                                                return (
                                                                    <div className="bg-amber-50/50 p-2 rounded border border-amber-100/50 space-y-2">
                                                                        <div className="flex justify-between text-[10px]">
                                                                            <span className="text-gray-500 font-bold">기본 금액:</span>
                                                                            <span className="font-bold text-gray-900">{pkg.default_price.toLocaleString()}원</span>
                                                                        </div>
                                                                        <div className="flex justify-between items-center text-[10px]">
                                                                            <span className="text-gray-500 font-bold">현장 할인:</span>
                                                                            <div className="flex items-center gap-1">
                                                                                <input
                                                                                    type="number"
                                                                                    value={packageDiscount || ''}
                                                                                    onChange={e => setPackageDiscount(parseInt(e.target.value) || 0)}
                                                                                    className="w-20 px-1.5 py-1 text-right border border-gray-200 rounded text-xs font-bold outline-none focus:border-amber-400"
                                                                                    placeholder="0"
                                                                                />
                                                                                <span className="font-bold text-gray-600">원</span>
                                                                            </div>
                                                                        </div>
                                                                        <div className="flex justify-between text-[11px] pt-1 border-t border-amber-100">
                                                                            <span className="text-amber-700 font-black">최종 결제:</span>
                                                                            <span className="font-black text-amber-700">{finalPrice.toLocaleString()}원</span>
                                                                        </div>

                                                                        <button
                                                                            type="button"
                                                                            onClick={handlePurchasePackage}
                                                                            disabled={isPurchasingPackage}
                                                                            className="w-full mt-2 py-1.5 bg-amber-500 hover:bg-amber-600 text-white font-bold text-[11px] rounded transition-colors flex items-center justify-center gap-1 disabled:opacity-50"
                                                                        >
                                                                            {isPurchasingPackage ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                                                                            즉시 발급 및 적용
                                                                        </button>
                                                                    </div>
                                                                )
                                                            })()}
                                                        </div>
                                                    ) : (
                                                        <select
                                                            {...register('membership_id')}
                                                            className="w-full px-3 py-2 bg-white border border-amber-200 text-amber-800 rounded-xl focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none font-bold text-xs h-[42px] cursor-pointer shadow-sm"
                                                        >
                                                            <option value="">적용 안 함 (일반 예약)</option>
                                                            {activeMemberships?.map(m => (
                                                                <option key={m.id} value={m.id}>
                                                                    {m.name} ({m.total_sessions - m.used_sessions}회 남음)
                                                                </option>
                                                            ))}
                                                        </select>
                                                    )}
                                                </div>
                                            )}

                                            {/* 수업 종류(Session Type) 선택 */}
                                            {eventType === 'APPOINTMENT' && (
                                                <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                                                    <label className="block text-[10px] font-black text-blue-600 mb-1 ml-1 flex items-center gap-1">🏷️ 수업 종류</label>
                                                    <select
                                                        {...register('session_type')}
                                                        className="w-full px-3 py-2 bg-blue-50 border border-blue-200 text-blue-800 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none font-bold text-xs h-[42px] cursor-pointer"
                                                    >
                                                        <option value="normal">일반 수업</option>
                                                        {myProfile?.option1_name && <option value="option1">{myProfile.option1_name}</option>}
                                                        {myProfile?.option2_name && <option value="option2">{myProfile.option2_name}</option>}
                                                        {myProfile?.option3_name && <option value="option3">{myProfile.option3_name}</option>}
                                                    </select>
                                                </div>
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
                                    <label className="block text-[10px] font-black text-gray-500 mb-1 ml-1">담당 선생님</label>
                                    <select
                                        {...register('instructor_id')}
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
                                            <span className={`block text-[9px] font-bold mb-0.5 ml-1 ${isTimeInvalid ? 'text-red-500' : 'text-gray-400'}`}>종료 {isTimeInvalid && '⚠️'}</span>
                                            <div className="flex gap-1">
                                                <select
                                                    value={watch('end_time')?.split(':')[0] || '10'}
                                                    onChange={(e) => {
                                                        const h = e.target.value
                                                        const m = watch('end_time')?.split(':')[1] || '00'
                                                        setValue('end_time', `${h}:${m}`)
                                                    }}
                                                    className={`w-full px-1 py-2.5 rounded-xl outline-none font-bold cursor-pointer transition-all text-xs h-[42px] text-center appearance-none ${isTimeInvalid
                                                        ? 'bg-red-50 border-2 border-red-400 text-red-600 focus:ring-2 focus:ring-red-500/20 focus:border-red-500'
                                                        : 'bg-gray-50 border border-gray-200 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500'
                                                        }`}
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
                                                    className={`w-full px-1 py-2.5 rounded-xl outline-none font-bold cursor-pointer transition-all text-xs h-[42px] text-center appearance-none ${isTimeInvalid
                                                        ? 'bg-red-50 border-2 border-red-400 text-red-600 focus:ring-2 focus:ring-red-500/20 focus:border-red-500'
                                                        : 'bg-gray-50 border border-gray-200 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500'
                                                        }`}
                                                >
                                                    {['00', '10', '20', '30', '40', '50'].map(m => (
                                                        <option key={m} value={m}>{m}분</option>
                                                    ))}
                                                </select>
                                            </div>
                                            {isTimeInvalid && (
                                                <p className="text-[10px] text-red-500 font-bold mt-1 ml-1 animate-in fade-in slide-in-from-top-1 duration-200">
                                                    종료 시간은 시작 시간 이후여야 합니다.
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Row 3: Memo (History & New) */}
                            <div className="space-y-2">
                                <label className="block text-[10px] font-black text-gray-500 ml-1">메모 (고객 히스토리)</label>

                                {/* 1. History View (Appointment Notes) */}
                                {selectedClient && clientHistory && (
                                    <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 max-h-[120px] overflow-y-auto text-xs text-gray-700 whitespace-pre-wrap mb-2 space-y-2 scrollbar-thin scrollbar-thumb-amber-200">
                                        <div className="text-[9px] text-amber-500 font-bold mb-1 sticky top-0 bg-amber-50 pb-1 border-b border-amber-100">이전 기록</div>
                                        {clientHistory.filter(app => app.note).map(app => (
                                            <div key={app.id} className="border-b border-amber-100 last:border-0 pb-1 last:pb-0">
                                                <span className="text-[10px] text-amber-600 font-bold block mb-0.5">
                                                    [{formatKST(new Date(app.start_time), 'yyyy-MM-dd HH:mm')}]
                                                </span>
                                                {app.note}
                                            </div>
                                        ))}
                                        {clientHistory.filter(app => app.note).length === 0 && (
                                            <div className="text-gray-400 text-center py-2">기록 없음</div>
                                        )}
                                    </div>
                                )}

                                {/* 2. New Memo Input */}
                                <textarea
                                    {...register('memo')}
                                    rows={3}
                                    placeholder={selectedClient ? "새로운 메모를 입력하세요 (저장 시 날짜와 함께 상단에 추가됩니다)" : "메모 입력..."}
                                    className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none font-bold text-xs resize-none transition-all placeholder:font-medium"
                                />
                            </div>

                            {/* Footer Info */}
                            <div className="text-[10px] text-gray-400 bg-gray-50 p-3 rounded-lg text-center leading-relaxed">
                                고객정보, 담당 선생님 정보는 예약완료 후<br />고객 관리에서도 수정가능합니다.
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
                                disabled={isSubmitting || isTimeInvalid}
                                className={`flex-[2] py-3 rounded-xl font-black shadow-lg transition-all flex items-center justify-center gap-2 text-sm ${isTimeInvalid
                                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed shadow-none'
                                    : 'bg-blue-600 text-white hover:bg-blue-700 shadow-blue-500/20'
                                    }`}
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
