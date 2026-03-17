
import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastProps {
  message: string;
  type: 'info' | 'success';
  action?: ToastAction;
  onClose: () => void;
  duration?: number;
}

const Toast: React.FC<ToastProps> = ({ message, type, action, onClose, duration = 4000 }) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, action ? duration + 2000 : duration);

    return () => clearTimeout(timer);
  }, [message, onClose, action, duration]);

  return createPortal(
    <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[300] animate-in fade-in slide-in-from-top-4 duration-300 pointer-events-none">
      <div className={`px-5 py-2.5 rounded-full shadow-2xl backdrop-blur-md flex items-center gap-3 border pointer-events-auto ${
        type === 'success' ? 'bg-black/90 border-neutral-700' : 'bg-white/90 border-neutral-200'
      }`}>
        <div className={`w-1.5 h-1.5 rounded-full ${type === 'success' ? 'bg-green-400 animate-pulse' : 'bg-neutral-800'}`} />
        <span className={`text-[10px] tracking-[0.1em] font-bold uppercase ${type === 'success' ? 'text-white' : 'text-neutral-800'}`}>
          {message}
        </span>
        {action && (
          <button
            onClick={(e) => { 
              e.stopPropagation(); 
              action.onClick(); 
              onClose(); 
            }}
            className={`ml-1 px-3 py-1 rounded-full text-[9px] font-bold uppercase tracking-widest transition-all ${
              type === 'success' ? 'bg-white text-black hover:bg-neutral-200' : 'bg-black text-white hover:bg-neutral-800'
            }`}
          >
            {action.label}
          </button>
        )}
      </div>
    </div>,
    document.body
  );
};

export default Toast;
