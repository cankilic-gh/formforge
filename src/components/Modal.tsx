'use client';

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { X, AlertCircle, HelpCircle, Edit3 } from 'lucide-react';

type ModalType = 'alert' | 'confirm' | 'prompt';

interface ModalState {
  isOpen: boolean;
  type: ModalType;
  title: string;
  message: string;
  defaultValue?: string;
  placeholder?: string;
  onConfirm?: (value?: string) => void;
  onCancel?: () => void;
}

interface ModalContextType {
  showAlert: (title: string, message: string) => Promise<void>;
  showConfirm: (title: string, message: string) => Promise<boolean>;
  showPrompt: (title: string, message: string, defaultValue?: string, placeholder?: string) => Promise<string | null>;
}

const ModalContext = createContext<ModalContextType | null>(null);

export const useModal = () => {
  const context = useContext(ModalContext);
  if (!context) {
    throw new Error('useModal must be used within a ModalProvider');
  }
  return context;
};

export const ModalProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [modal, setModal] = useState<ModalState>({
    isOpen: false,
    type: 'alert',
    title: '',
    message: '',
  });
  const [inputValue, setInputValue] = useState('');

  const closeModal = useCallback(() => {
    setModal((prev) => ({ ...prev, isOpen: false }));
    setInputValue('');
  }, []);

  const showAlert = useCallback((title: string, message: string): Promise<void> => {
    return new Promise((resolve) => {
      setModal({
        isOpen: true,
        type: 'alert',
        title,
        message,
        onConfirm: () => {
          closeModal();
          resolve();
        },
      });
    });
  }, [closeModal]);

  const showConfirm = useCallback((title: string, message: string): Promise<boolean> => {
    return new Promise((resolve) => {
      setModal({
        isOpen: true,
        type: 'confirm',
        title,
        message,
        onConfirm: () => {
          closeModal();
          resolve(true);
        },
        onCancel: () => {
          closeModal();
          resolve(false);
        },
      });
    });
  }, [closeModal]);

  const showPrompt = useCallback((title: string, message: string, defaultValue = '', placeholder = ''): Promise<string | null> => {
    setInputValue(defaultValue);
    return new Promise((resolve) => {
      setModal({
        isOpen: true,
        type: 'prompt',
        title,
        message,
        defaultValue,
        placeholder,
        onConfirm: (value) => {
          closeModal();
          resolve(value || null);
        },
        onCancel: () => {
          closeModal();
          resolve(null);
        },
      });
    });
  }, [closeModal]);

  const handleConfirm = () => {
    if (modal.type === 'prompt') {
      modal.onConfirm?.(inputValue);
    } else {
      modal.onConfirm?.();
    }
  };

  const handleCancel = () => {
    modal.onCancel?.();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleConfirm();
    } else if (e.key === 'Escape') {
      if (modal.type === 'alert') {
        handleConfirm();
      } else {
        handleCancel();
      }
    }
  };

  const getIcon = () => {
    switch (modal.type) {
      case 'alert':
        return <AlertCircle className="w-6 h-6 text-amber-500" />;
      case 'confirm':
        return <HelpCircle className="w-6 h-6 text-blue-500" />;
      case 'prompt':
        return <Edit3 className="w-6 h-6 text-forge-cyan" />;
    }
  };

  return (
    <ModalContext.Provider value={{ showAlert, showConfirm, showPrompt }}>
      {children}

      {/* Modal Overlay */}
      {modal.isOpen && (
        <div
          className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50"
          onClick={handleCancel}
          onKeyDown={handleKeyDown}
        >
          <div
            className="bg-white rounded-xl shadow-2xl w-[400px] overflow-hidden border border-slate-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100">
              {getIcon()}
              <h3 className="text-lg font-semibold text-slate-800 flex-1">{modal.title}</h3>
              <button
                onClick={modal.type === 'alert' ? handleConfirm : handleCancel}
                className="p-1 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            {/* Content */}
            <div className="px-5 py-4">
              <p className="text-slate-600 text-sm leading-relaxed">{modal.message}</p>

              {modal.type === 'prompt' && (
                <input
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder={modal.placeholder}
                  className="mt-4 w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500"
                  autoFocus
                  onKeyDown={handleKeyDown}
                />
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 px-5 py-4 bg-slate-50 border-t border-slate-100">
              {modal.type !== 'alert' && (
                <button
                  onClick={handleCancel}
                  className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-200 rounded-lg transition-colors"
                >
                  Cancel
                </button>
              )}
              <button
                onClick={handleConfirm}
                className="px-4 py-2 text-sm font-medium text-white bg-cyan-500 hover:bg-cyan-600 rounded-lg transition-colors shadow-sm"
                autoFocus={modal.type !== 'prompt'}
              >
                {modal.type === 'alert' ? 'OK' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ModalContext.Provider>
  );
};
