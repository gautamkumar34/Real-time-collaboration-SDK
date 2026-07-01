import React, { createContext, useContext, useCallback, useEffect, useState } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

const POST_AUTH_REDIRECT_KEY = 'post_auth_redirect';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  pendingRedirect: string | null;
  clearPendingRedirect: () => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  isLoading: true,
  pendingRedirect: null,
  clearPendingRedirect: () => {},
  signOut: async () => {},
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [pendingRedirect, setPendingRedirect] = useState<string | null>(null);

  useEffect(() => {
    const consumePendingRedirect = () => {
      const stored = sessionStorage.getItem(POST_AUTH_REDIRECT_KEY);
      if (stored && stored.startsWith('/') && !stored.startsWith('//')) {
        sessionStorage.removeItem(POST_AUTH_REDIRECT_KEY);
        setPendingRedirect(stored);
      }
    };

    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        setSession(session);
        setUser(session?.user ?? null);
        setIsLoading(false);
        // Supabase JS v2 fires INITIAL_SESSION (not SIGNED_IN) when onAuthStateChange
        // subscribes after the client has already processed the OAuth token from the URL.
        // Reading sessionStorage here covers that timing gap.
        if (session) consumePendingRedirect();
      })
      .catch(() => setIsLoading(false));

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setIsLoading(false);

      if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session) {
        consumePendingRedirect();
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const clearPendingRedirect = useCallback(() => setPendingRedirect(null), []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, session, isLoading, pendingRedirect, clearPendingRedirect, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
