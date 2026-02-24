import ClientForm from './ClientForm'
import { X } from 'lucide-react'
import type { Client } from '@/types/db'

type Props = {
    isOpen: boolean
    onClose: () => void
    initialData: Client | null
}

export default function ClientModal({ isOpen, onClose, initialData }: Props) {
    if (!isOpen) return null

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
            <div className="bg-white rounded-xl shadow-lg w-full max-w-md p-6 relative animate-in fade-in zoom-in duration-200" onClick={e => e.stopPropagation()}>
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
                >
                    <X className="w-5 h-5" />
                </button>

                <h2 className="text-xl font-black text-gray-900 mb-6">
                    {initialData ? '고객 정보 수정' : '새 고객 등록'}
                </h2>

                <ClientForm
                    initialData={initialData}
                    onSuccess={() => onClose()}
                    onCancel={onClose}
                />
            </div>
        </div>
    )
}

