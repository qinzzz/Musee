
import React, { useState, useEffect } from 'react';
import { defineAestheticTerm } from '../apiService';

interface Props {
  tag: string;
  onClose: () => void;
}

const TagDefinitionModal: React.FC<Props> = ({ tag, onClose }) => {
  const [data, setData] = useState<{ definition: string, externalResonances: string[] } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      setLoading(true);
      const result = await defineAestheticTerm(tag);
      setData(result);
      setLoading(false);
    };
    fetch();
  }, [tag]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-neutral-900/30 backdrop-blur-md" onClick={onClose} />
      
      <div className="relative w-full max-w-lg bg-white rounded-[2rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-500 flex flex-col">
        <div className="p-8 border-b border-neutral-50 flex justify-between items-center bg-neutral-50/50">
          <h3 className="text-[12px] tracking-[0.5em] uppercase text-neutral-900 font-bold">{tag}</h3>
          <button onClick={onClose} className="text-neutral-300 hover:text-neutral-900 transition-colors text-2xl">✕</button>
        </div>

        <div className="p-10 space-y-8 flex-1 overflow-y-auto">
          {loading ? (
            <div className="space-y-4">
              <div className="h-4 w-3/4 bg-neutral-100 rounded animate-pulse"></div>
              <div className="h-4 w-full bg-neutral-100 rounded animate-pulse delay-75"></div>
              <div className="h-4 w-1/2 bg-neutral-100 rounded animate-pulse delay-150"></div>
            </div>
          ) : (
            <>
              <div>
                <h4 className="text-[9px] tracking-[0.3em] uppercase text-neutral-400 mb-4 font-bold">Lexicon</h4>
                <p className="text-[15px] leading-relaxed text-neutral-800 font-serif italic">
                  "{data?.definition}"
                </p>
              </div>

              {/* Grey Area - External Resonances */}
              <div className="pt-6 border-t border-dashed border-neutral-100">
                <h4 className="text-[9px] tracking-[0.3em] uppercase text-neutral-400 mb-4 font-bold">The Grey Area</h4>
                <p className="text-[11px] text-neutral-400 mb-6 leading-relaxed tracking-wider">
                  Conceptual filaments connecting this term to external movements and creators.
                </p>
                <div className="flex flex-wrap gap-3">
                  {data?.externalResonances.map((res, i) => (
                    <div 
                      key={i} 
                      className="px-4 py-2 bg-neutral-50 border border-neutral-100 rounded-lg text-[10px] tracking-widest text-neutral-600 hover:bg-neutral-900 hover:text-white transition-all cursor-default"
                    >
                      {res}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        <div className="p-8 bg-neutral-50/50 border-t border-neutral-100 flex justify-center">
          <p className="text-[9px] tracking-widest text-neutral-300 uppercase italic">Echoes from the architectural void</p>
        </div>
      </div>
    </div>
  );
};

export default TagDefinitionModal;
