import React from 'react';
import { GoogleLogin as GoogleOAuthButton, CredentialResponse } from '@react-oauth/google';
import { AuthDiagnosticError, loginWithGoogle } from '../api/auth';

interface GoogleLoginProps {
    onLoginSuccess: (user: any) => void;
    onLoginError: (error: AuthDiagnosticError) => void;
}

const GoogleLogin: React.FC<GoogleLoginProps> = ({ onLoginSuccess, onLoginError }) => {
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
                useOneTap
                theme="outline"
                shape="pill"
            />
        </div>
    );
};

export default GoogleLogin;
