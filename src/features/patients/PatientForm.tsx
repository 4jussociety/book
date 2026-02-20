// PatientForm: 환자 등록/수정 폼 컴포넌트
// 환자번호 수동입력 지원, 미입력 시 자동 넘버링

import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createPatient, updatePatient } from './api'
import { Loader2 } from 'lucide-react'
import type { Patient } from '@/types/db'
import { useAuth } from '@/features/auth/AuthContext'
import clsx from 'clsx'

const patientSchema = z.object({
    name: z.string().min(1, '이름을 입력해주세요.'),
    patient_no: z.string().optional(),
    gender: z.enum(['M', 'F']),
    birth_date: z.string().optional(),
    phone: z.string().optional(),

})

type PatientFormInputs = z.infer<typeof patientSchema>

type Props = {
    initialData: Patient | null
    defaultName?: string
    onSuccess: (patient: Patient) => void
    onCancel: () => void
}

export default function PatientForm({ initialData, defaultName, onSuccess, onCancel }: Props) {
    const queryClient = useQueryClient()
    const { profile } = useAuth()

    const {
        register,
        handleSubmit,
        reset,
        watch,
        setValue,
        formState: { errors, isSubmitting },
    } = useForm<PatientFormInputs>({
        resolver: zodResolver(patientSchema),
        defaultValues: {
            gender: 'M',
            name: defaultName || '',
            patient_no: '',
            birth_date: '',
            phone: '',

        }
    })

    const gender = watch('gender')

    // Reset form when initialData changes
    useEffect(() => {
        if (initialData) {
            const normalizedGender = (initialData.gender === 'MALE' || initialData.gender === 'M') ? 'M' as const : 'F' as const
            reset({
                name: initialData.name,
                patient_no: initialData.patient_no?.toString() || '',
                gender: normalizedGender,
                birth_date: initialData.birth_date ? initialData.birth_date.substring(0, 4) : '',
                phone: initialData.phone || '',

            })
        } else {
            reset({
                name: defaultName || '',
                patient_no: '',
                gender: 'M',
                birth_date: '',
                phone: '',

            })
        }
    }, [initialData, reset, defaultName])

    const mutation = useMutation({
        mutationFn: async (data: PatientFormInputs) => {
            // 생년(4자리)을 DB DATE 타입에 맞게 변환 (YYYY-01-01)
            let birthDateValue: string | null = null
            if (data.birth_date && data.birth_date.length === 4) {
                birthDateValue = `${data.birth_date}-01-01`
            }


            // system_id 주입 (RLS 정책 준수)

            const payload = {
                ...data,
                birth_date: birthDateValue,
                phone: data.phone || null,
                patient_no: data.patient_no ? parseInt(data.patient_no) : undefined,
                system_id: profile?.system_id,

            }

            if (initialData) {
                return await updatePatient(initialData.id, payload)
            } else {
                return await createPatient(payload)
            }
        },
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ['patients'] })
            onSuccess(data as unknown as Patient)
            if (!initialData) reset()
        },
        onError: (error) => {
            console.error(error)
            alert('저장 실패: ' + (error instanceof Error ? error.message : '알 수 없는 오류'))
        }
    })

    const onSubmit = (data: PatientFormInputs) => {
        mutation.mutate(data)
    }

    return (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {/* Row 1: 이름 + 환자번호 */}
            <div className="grid grid-cols-2 gap-3">
                <div className="col-span-1">
                    <label className="block text-[10px] font-black text-gray-500 mb-1 ml-1">이름</label>
                    <input
                        type="text"
                        {...register('name')}
                        placeholder="홍길동"
                        className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none font-bold text-sm"
                    />
                    {errors.name && <p className="text-red-500 text-[10px] ml-1 mt-0.5">{errors.name.message}</p>}
                </div>
                <div className="col-span-1">
                    <label className="block text-[10px] font-black text-gray-500 mb-1 ml-1">환자번호</label>
                    <input
                        type="text"
                        {...register('patient_no')}
                        onChange={(e) => {
                            const val = e.target.value.replace(/[^0-9]/g, '')
                            setValue('patient_no', val)
                        }}
                        placeholder="미입력시 자동부여"
                        className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none font-bold text-sm"
                    />
                </div>
            </div>

            {/* Row 2: 성별 + 생년 + 연락처 */}
            <div className="grid grid-cols-3 gap-3">
                <div className="col-span-1">
                    <label className="block text-[10px] font-black text-gray-500 mb-1 ml-1">성별</label>
                    <div className="flex gap-1 p-1 bg-gray-50 rounded-xl border border-gray-200 h-[42px]">
                        <label className={clsx(
                            "flex-1 flex items-center justify-center gap-1 rounded-lg cursor-pointer transition-all font-bold text-xs select-none",
                            gender === 'M' ? "bg-white text-blue-600 shadow-sm border border-blue-100" : "text-gray-400 hover:bg-gray-100/50"
                        )}>
                            <input type="radio" value="M" {...register('gender')} className="hidden" />
                            남성
                        </label>
                        <label className={clsx(
                            "flex-1 flex items-center justify-center gap-1 rounded-lg cursor-pointer transition-all font-bold text-xs select-none",
                            gender === 'F' ? "bg-white text-pink-500 shadow-sm border border-pink-100" : "text-gray-400 hover:bg-gray-100/50"
                        )}>
                            <input type="radio" value="F" {...register('gender')} className="hidden" />
                            여성
                        </label>
                    </div>
                </div>
                <div className="col-span-1">
                    <label className="block text-[10px] font-black text-gray-500 mb-1 ml-1">생년</label>
                    <input
                        type="text"
                        {...register('birth_date')}
                        onChange={(e) => {
                            const val = e.target.value.replace(/[^0-9]/g, '')
                            if (val.length <= 4) setValue('birth_date', val)
                        }}
                        placeholder="YYYY (4자리)"
                        maxLength={4}
                        className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none font-bold text-sm"
                    />
                </div>
                <div className="col-span-1">
                    <label className="block text-[10px] font-black text-gray-500 mb-1 ml-1">연락처</label>
                    <input
                        type="tel"
                        {...register('phone')}
                        placeholder="010-1234-5678"
                        className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none font-bold text-sm"
                    />
                </div>
            </div>



            {/* Buttons */}
            <div className="flex justify-end gap-2 pt-2">
                <button
                    type="button"
                    onClick={onCancel}
                    className="px-4 py-2.5 text-xs font-bold text-gray-500 hover:bg-gray-100 rounded-xl transition-colors"
                >
                    취소
                </button>
                <button
                    type="submit"
                    disabled={isSubmitting || mutation.isPending}
                    className="px-6 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 flex items-center gap-2 font-bold text-xs transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-blue-500/20"
                >
                    {(isSubmitting || mutation.isPending) && <Loader2 className="w-3 h-3 animate-spin" />}
                    저장
                </button>
            </div>
        </form>
    )
}
