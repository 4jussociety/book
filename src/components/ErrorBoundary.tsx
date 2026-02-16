import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'

interface Props {
    children?: ReactNode
}

interface State {
    hasError: boolean
    error: Error | null
}

class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        error: null,
    }

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error }
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('Uncaught error:', error, errorInfo)
    }

    public render() {
        if (this.state.hasError) {
            return (
                <div className="p-8 bg-red-50 min-h-screen">
                    <h1 className="text-2xl font-bold text-red-800 mb-4">문제가 발생했습니다.</h1>
                    <pre className="bg-white p-4 rounded shadow text-sm text-red-600 overflow-auto">
                        {this.state.error?.toString()}
                    </pre>
                    <button
                        onClick={() => window.location.reload()}
                        className="mt-4 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
                    >
                        새로고침
                    </button>
                </div>
            )
        }

        return this.props.children
    }
}

export default ErrorBoundary
