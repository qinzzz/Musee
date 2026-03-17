
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
                <p className={`${buttons.length > 0 ? 'mt-6' : ''} text-[11px] tracking-[0.35em] text-white/75 uppercase font-medium`}>
                    {secondaryText}
                </p>
            )}
        </div>
    );
};

export default InteractionOverlay;
