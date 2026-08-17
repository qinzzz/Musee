import React from 'react';
import { GoogleLogin as GoogleOAuthButton, CredentialResponse } from '@react-oauth/google';
import { AuthDiagnosticError, loginWithGoogle } from '../api/auth';
import { API_BASE_URL } from '../api/core';

interface GoogleLoginProps {
    onLoginSuccess: (user: any) => void;
    onLoginError: (error: AuthDiagnosticError) => void;
}

const MOBILE_USER_AGENT_PATTERN = /Android|iPhone|iPad|iPod|IEMobile|Opera Mini/i;
const GOOGLE_REDIRECT_PATH = '/auth/google/redirect';

export function shouldUseMobileGoogleRedirect(
    userAgent: string,
    platform = '',
    maxTouchPoints = 0,
): boolean {
    return MOBILE_USER_AGENT_PATTERN.test(userAgent)
        || (platform === 'MacIntel' && maxTouchPoints > 1);
}

function googleRedirectUri(): string {
    return new URL(
        `${API_BASE_URL}${GOOGLE_REDIRECT_PATH}`,
        window.location.origin,
    ).toString();
}

const GoogleLogin: React.FC<GoogleLoginProps> = ({ onLoginSuccess, onLoginError }) => {
    const useMobileRedirect = shouldUseMobileGoogleRedirect(
        navigator.userAgent,
        navigator.platform,
        navigator.maxTouchPoints,
    );

    const handleSuccess = async (response: CredentialResponse) => {
        if (!response.credential) {
            onLoginError(new AuthDiagnosticError('google_interrupted'));
            return;
        }

        try {
            const result = await loginWithGoogle(response.credential);
            onLoginSuccess({
                ...result.user,
                is_new_user: Boolean(result.is_new_user),
            });
        } catch (error) {
            console.error('Google login error:', error);
            onLoginError(error instanceof AuthDiagnosticError
                ? error
                : new AuthDiagnosticError('google_credential_rejected', { detail: error }));
        }
    };

    const handleError = () => {
        onLoginError(new AuthDiagnosticError('google_interrupted'));
    };

    return (
        <div className="google-login-container">
            <GoogleOAuthButton
                onSuccess={handleSuccess}
                onError={handleError}
                useOneTap={!useMobileRedirect}
                ux_mode={useMobileRedirect ? 'redirect' : 'popup'}
                login_uri={useMobileRedirect ? googleRedirectUri() : undefined}
                theme="outline"
                shape="pill"
            />
        </div>
    );
};

export default GoogleLogin;
