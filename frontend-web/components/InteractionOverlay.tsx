
import React from 'react';

export interface InteractionButton {
    label: string;
    onClick: (e: React.MouseEvent) => void;
    primary?: boolean;
}

interface InteractionOverlayProps {
    buttons: InteractionButton[];
    secondaryText?: string;
    isVisible: boolean;
    className?: string;
}

const InteractionOverlay: React.FC<InteractionOverlayProps> = ({
    buttons,
    secondaryText,
    isVisible,
    className = ""
}) => {
    return (
        <div className={`absolute inset-0 flex flex-col items-center justify-center gap-4 transition-all duration-500 z-20 ${isVisible ? 'pointer-events-auto' : 'opacity-0 pointer-events-none'
            } ${className}`}>


            {buttons.map((btn, idx) => (
                <button
                    key={idx}
                    onClick={btn.onClick}
                    className={`${btn.primary
                        ? 'bg-white/90 text-neutral-900'
                        : 'bg-neutral-900/90 text-white border border-white/10'
                        } backdrop-blur px-5 py-2 rounded-full text-[9px] tracking-[0.3em] uppercase font-bold shadow-xl hover:scale-105 active:scale-95 transition-all duration-300 min-w-[160px]`}
                >
                    {btn.label}
                </button>
            ))}

            {secondaryText && (
                <p className="mt-6 text-[8px] tracking-[0.3em] text-white/50 uppercase font-light animate-pulse">
                    {secondaryText}
                </p>
            )}
        </div>
    );
};

export default InteractionOverlay;
