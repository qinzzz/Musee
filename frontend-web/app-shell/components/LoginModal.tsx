import React from 'react';
import GoogleLogin from '../../components/GoogleLogin';

type Props = {
  open: boolean;
  onClose: () => void;
  onLoginSuccess: (user: any) => void;
  onLoginError?: () => void;
};

const LoginModal: React.FC<Props> = ({
  open,
  onClose,
  onLoginSuccess,
  onLoginError,
}) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-sm overflow-hidden rounded-2xl border border-neutral-200 bg-white p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        <h3 className="mb-2 text-lg font-bold text-neutral-900">Sign in to Musee</h3>
        <p className="mb-6 text-[13px] leading-relaxed text-neutral-500">
          Sign in to save your collections, view your aesthetic taste profile, and access your artwork analysis history.
        </p>
        <div className="flex justify-center">
          <GoogleLogin
            onLoginSuccess={onLoginSuccess}
            onLoginError={onLoginError || (() => {})}
          />
        </div>
      </div>
    </div>
  );
};

export default LoginModal;
