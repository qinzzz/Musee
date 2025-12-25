import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type Identity = 'gamified' | 'art_historian' | 'museum_narrator';

interface IdentityContextType {
    identity: Identity;
    setIdentity: (identity: Identity) => void;
}

const IdentityContext = createContext<IdentityContextType | undefined>(undefined);

const IDENTITY_STORAGE_KEY = '@musee_identity';

interface IdentityProviderProps {
    children: ReactNode;
}

export const IdentityProvider: React.FC<IdentityProviderProps> = ({ children }) => {
    const [identity, setIdentityState] = useState<Identity>('museum_narrator');

    // Load saved identity preference on mount
    useEffect(() => {
        const loadIdentity = async () => {
            try {
                const savedIdentity = await AsyncStorage.getItem(IDENTITY_STORAGE_KEY);
                if (savedIdentity === 'gamified' || savedIdentity === 'art_historian' || savedIdentity === 'museum_narrator') {
                    setIdentityState(savedIdentity as Identity);
                }
            } catch (error) {
                console.error('[IdentityContext] Failed to load identity preference:', error);
            }
        };

        loadIdentity();
    }, []);

    // Save identity preference when it changes
    const setIdentity = async (newIdentity: Identity) => {
        try {
            await AsyncStorage.setItem(IDENTITY_STORAGE_KEY, newIdentity);
            setIdentityState(newIdentity);
            console.log('[IdentityContext] Identity set to:', newIdentity);
        } catch (error) {
            console.error('[IdentityContext] Failed to save identity preference:', error);
        }
    };

    return (
        <IdentityContext.Provider value={{ identity, setIdentity }}>
            {children}
        </IdentityContext.Provider>
    );
};

export const useIdentity = (): IdentityContextType => {
    const context = useContext(IdentityContext);
    if (context === undefined) {
        throw new Error('useIdentity must be used within an IdentityProvider');
    }
    return context;
};
