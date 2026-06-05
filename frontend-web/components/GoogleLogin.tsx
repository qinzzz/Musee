import React from 'react';
import { GoogleLogin as GoogleOAuthButton, CredentialResponse } from '@react-oauth/google';
import { loginWithGoogle, getOrCreateUserId } from '../api/auth';

interface GoogleLoginProps {
    onLoginSuccess: (user: any) => void;
    onLoginError: (error: string) => void;
}

const GoogleLogin: React.FC<GoogleLoginProps> = ({ onLoginSuccess, onLoginError }) => {
    const handleSuccess = async (response: CredentialResponse) => {
        if (!response.credential) {
            onLoginError('No credential received from Google');
            return;
        }

        try {
            const anonymousId = getOrCreateUserId();
            const result = await loginWithGoogle(response.credential, anonymousId);
            onLoginSuccess(result.user);
        } catch (error) {
            console.error('Google login error:', error);
            onLoginError(error instanceof Error ? error.message : 'Login failed');
        }
    };

    const handleError = () => {
        onLoginError('Google Login failed');
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
