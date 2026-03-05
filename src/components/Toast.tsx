import { useEffect } from 'react';
import { CheckCircle2, AlertCircle, X } from 'lucide-react';

export type ToastVariant = 'success' | 'error' | 'info';

export interface ToastMessage {
  id: string;
  message: string;
  variant: ToastVariant;
}

interface ToastProps {
  toast: ToastMessage;
  onDismiss: (id: string) => void;
}

export default function Toast({ toast, onDismiss }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onDismiss(toast.id);
    }, 4000); // Auto-dismiss after 4 seconds
    return () => clearTimeout(timer);
  }, [toast.id, onDismiss]);

  const variants = {
    success: {
      bg: 'bg-emerald-50 border-emerald-200',
      icon: <CheckCircle2 className="text-emerald-500" size={20} />,
      text: 'text-emerald-800',
    },
    error: {
      bg: 'bg-red-50 border-red-200',
      icon: <AlertCircle className="text-red-500" size={20} />,
      text: 'text-red-800',
    },
    info: {
      bg: 'bg-blue-50 border-blue-200',
      icon: <CheckCircle2 className="text-blue-500" size={20} />,
      text: 'text-blue-800',
    },
  };

  const style = variants[toast.variant];

  return (
    <div
      className={`
        animate-slide-up
        flex items-start gap-3 p-4 rounded-xl shadow-lg border pointer-events-auto
        ${style.bg}
      `}
    >
      <div className="shrink-0 mt-0.5">{style.icon}</div>
      <div className={`flex-1 text-sm font-medium ${style.text}`}>
        {toast.message}
      </div>
      <button
        onClick={() => onDismiss(toast.id)}
        className="shrink-0 text-gray-400 hover:text-gray-600 transition-colors ml-2"
      >
        <X size={16} />
      </button>
    </div>
  );
}
