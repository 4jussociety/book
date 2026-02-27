// ClientForm: 고객 등록/수정 폼 컴포넌트
// 고객번호 수동입력 지원, 미입력 시 자동 넘버링

import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient, updateClient } from './api'
import { Loader2 } from 'lucide-react'
import type { Client } from '@/types/db'
import { useAuth } from '@/features/auth/AuthContext'
import clsx from 'clsx'

const clientSchema = z.object({
    name: z.string().min(1, '이름을 입력해주세요.'),
    client_no: z.string().optional(),
    gender: z.enum(['M', 'F']),
    birth_date: z.string().length(8, '생년월일 8자리를 입력해주세요. (예: 19900101)').refine((val) => {
        const year = parseInt(val.substring(0, 4), 10);
        const month = parseInt(val.substring(4, 6), 10);
        const day = parseInt(val.substring(6, 8), 10);
        const currentYear = new Date().getFullYear();
        if (year < 1900 || year > currentYear) return false;
        if (month < 1 || month > 12) return false;
        if (day < 1 || day > 31) return false;
        return true;
    }, { message: '유효한 생년월일을 입력해주세요. (예: 19900101)' }),
    phone: z.string().min(1, '연락처를 입력해주세요.'),

})

type ClientFormInputs = z.infer<typeof clientSchema>

type Props = {
    initialData: Client | null
    defaultName?: string
    onSuccess: (Client: Client) => void
    onCancel: () => void
}

export default function ClientForm({ initialData, defaultName, onSuccess, onCancel }: Props) {
    const queryClient = useQueryClient()
    const { profile } = useAuth()

    const {
        register,
        handleSubmit,
        reset,
        watch,
        setValue,
        formState: { errors, isSubmitting },
    } = useForm<ClientFormInputs>({
        resolver: zodResolver(clientSchema),
        defaultValues: {
            gender: 'M',
            name: defaultName || '',
            client_no: '',
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
                client_no: initialData.client_no?.toString() || '',
                gender: normalizedGender,
                birth_date: initialData.birth_date ? initialData.birth_date.replace(/-/g, '') : '',
                phone: initialData.phone || '',

            })
        } else {
            reset({
                name: defaultName || '',
                client_no: '',
                gender: 'M',
                birth_date: '',
                phone: '',

            })
        }
    }, [initialData, reset, defaultName])

    const mutation = useMutation({
        mutationFn: async (data: ClientFormInputs) => {
            // 생년월일(8자리)을 DB DATE 타입에 맞게 변환 (YYYY-MM-DD)
            let birthDateValue: string | null = null
            if (data.birth_date) {
                if (data.birth_date.length === 8) {
                    const year = data.birth_date.substring(0, 4)
                    const month = data.birth_date.substring(4, 6)
                    const day = data.birth_date.substring(6, 8)
                    birthDateValue = `${year}-${month}-${day}`
                } else if (data.birth_date.length === 4) {
                    // 혹시나 여전히 4자리만 적는 경우 호환성 지원
                    birthDateValue = `${data.birth_date}-01-01`
                }
            }


            // system_id 주입 (RLS 정책 준수)
            let isManualNo = false
            if (!initialData) {
                if (data.client_no) isManualNo = true
            } else {
                if (data.client_no !== initialData.client_no?.toString()) {
                    isManualNo = !!data.client_no
                } else {
                    isManualNo = !!initialData.is_manual_no
                }
            }

            const payload = {
                ...data,
                birth_date: birthDateValue,
                phone: data.phone || null,
                client_no: data.client_no ? parseInt(data.client_no) : undefined,
                is_manual_no: isManualNo,
                system_id: profile?.system_id,

            }

            if (initialData) {
                return await updateClient(initialData.id, payload)
            } else {
                return await createClient(payload)
            }
        },
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ['clients'] })
            onSuccess(data as unknown as Client)
            if (!initialData) reset()
        },
        onError: (error) => {
            console.error(error)
            alert('저장 실패: ' + (error instanceof Error ? error.message : '알 수 없는 오류'))
        }
    })

    const onSubmit = (data: ClientFormInputs) => {
        mutation.mutate(data)
    }

    return (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {/* Row 1: 이름 + 고객번호 */}
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
                    <label className="block text-[10px] font-black text-gray-500 mb-1 ml-1">고객번호</label>
                    <input
                        type="text"
                        {...register('client_no')}
                        onChange={(e) => {
                            const val = e.target.value.replace(/[^0-9]/g, '')
                            setValue('client_no', val)
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
                    <label className="block text-[10px] font-black text-gray-500 mb-1 ml-1">생년월일</label>
                    <input
                        type="text"
                        {...register('birth_date')}
                        onChange={(e) => {
                            const val = e.target.value.replace(/[^0-9]/g, '')
                            if (val.length <= 8) setValue('birth_date', val)
                        }}
                        placeholder="YYYYMMDD (8자리)"
                        maxLength={8}
                        className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none font-bold text-sm"
                    />
                    {errors.birth_date && <p className="text-red-500 text-[10px] ml-1 mt-0.5">{errors.birth_date.message}</p>}
                </div>
                <div className="col-span-1">
                    <label className="block text-[10px] font-black text-gray-500 mb-1 ml-1">연락처</label>
                    <input
                        type="tel"
                        {...register('phone')}
                        placeholder="010-1234-5678"
                        className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none font-bold text-sm"
                    />
                    {errors.phone && <p className="text-red-500 text-[10px] ml-1 mt-0.5">{errors.phone.message}</p>}
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
