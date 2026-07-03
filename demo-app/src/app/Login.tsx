import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { useAuth } from './AuthContext';

const POST_AUTH_REDIRECT_KEY = 'post_auth_redirect';

const EyeIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const EyeOffIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
    <line x1="1" y1="1" x2="23" y2="23" />
  </svg>
);

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLogin, setIsLogin] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();

  // Where to go after login — set by ProtectedRoute when redirecting here
  const rawFrom: string = (location.state as any)?.from?.pathname || '/app';
  const from: string = rawFrom.startsWith('/') && !rawFrom.startsWith('//') ? rawFrom : '/app';

  // If already logged in, redirect immediately
  useEffect(() => {
    if (user) {
      navigate(from, { replace: true });
    }
  }, [user, from, navigate]);

  // Show OAuth errors forwarded from the root URL via AuthOrchestrator
  useEffect(() => {
    const urlError = searchParams.get('error');
    const urlErrorDescription = searchParams.get('error_description');
    if (urlError) {
      const msg = urlErrorDescription
        ? decodeURIComponent(urlErrorDescription).replace(/\+/g, ' ')
        : 'Sign in failed. Please try again.';
      setError(msg);
    }
  }, [searchParams]);

  const handleGoogleLogin = async () => {
    setError(null);
    // Store intended destination in sessionStorage — AuthOrchestrator reads this after SIGNED_IN
    if (from.startsWith('/') && !from.startsWith('//')) {
      sessionStorage.setItem(POST_AUTH_REDIRECT_KEY, from);
    }
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        // Use origin (Site URL) — always whitelisted by Supabase, no dashboard config needed
        redirectTo: window.location.origin,
      },
    });
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setInfo(null);
    // Clear any stale Google OAuth redirect so AuthOrchestrator doesn't double-navigate
    sessionStorage.removeItem(POST_AUTH_REDIRECT_KEY);

    try {
      if (isLogin) {
        const { data: signInData, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;

        // If the user signed up before name fields existed, update metadata now
        const meta = signInData.user?.user_metadata;
        const hasName = meta?.full_name && typeof meta.full_name === 'string' && meta.full_name.trim();
        if (!hasName && signInData.user) {
          const emailName = email.split('@')[0] || 'User';
          await supabase.auth.updateUser({
            data: {
              full_name: emailName,
              first_name: emailName,
              last_name: '',
            },
          });
        }

        navigate(from, { replace: true });
      } else {
        // Validate name fields for sign-up
        if (!firstName.trim()) {
          setError('First name is required.');
          return;
        }

        const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin + '/app',
            data: {
              full_name: fullName,
              first_name: firstName.trim(),
              last_name: lastName.trim(),
            },
          },
        });
        if (error) throw error;

        // Supabase silently succeeds for existing emails but returns user with no identities
        if (data.user && (data.user.identities?.length ?? 0) === 0) {
          setError('An account with this email already exists — please sign in instead.');
          return;
        }

        setInfo('Check your email for a confirmation link to complete sign up.');
      }
    } catch (err: any) {
      // Extract a human-readable message from the error.
      // Supabase 500s return err.message = '{}' (stringified empty JSON body),
      // which is technically a non-empty string but completely unhelpful.
      let msg: string;
      if (typeof err === 'string' && err.trim() && !err.trim().startsWith('{') && !err.trim().startsWith('[')) {
        msg = err;
      } else if (typeof err?.message === 'string' && err.message.trim() && !err.message.trim().startsWith('{') && !err.message.trim().startsWith('[')) {
        msg = err.message;
      } else if (typeof err?.error_description === 'string' && err.error_description.trim()) {
        msg = err.error_description;
      } else {
        msg = 'Authentication failed. The server returned an unexpected error. Please try again in a moment.';
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    padding: '0.75rem',
    borderRadius: '8px',
    border: '1px solid rgba(255,255,255,0.1)',
    background: 'rgba(0,0,0,0.2)',
    color: '#fff',
    fontSize: '0.95rem',
    width: '100%',
    boxSizing: 'border-box',
  };

  return (
    <div className="landing-page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: '1rem' }}>
      <div className="glass-panel" style={{ padding: '3rem', maxWidth: '420px', width: '100%', textAlign: 'center', background: 'rgba(25, 25, 25, 0.65)' }}>
        <h2 style={{ marginBottom: '0.5rem', color: '#fff' }}>
          {isLogin ? 'Welcome Back' : 'Create Your Account'}
        </h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem', fontSize: '0.9rem' }}>
          {isLogin ? 'Sign in to access your collaborative workspace.' : 'Join CollabDoc and start collaborating in real time.'}
        </p>

        {error && (
          <div style={{ marginBottom: '1rem', padding: '0.75rem', borderRadius: '8px', background: 'rgba(255, 68, 68, 0.15)', border: '1px solid rgba(255,68,68,0.3)', color: '#ff6b6b', fontSize: '0.875rem', textAlign: 'left' }}>
            {error}
          </div>
        )}

        {info && (
          <div style={{ marginBottom: '1rem', padding: '0.75rem', borderRadius: '8px', background: 'rgba(52, 168, 83, 0.15)', border: '1px solid rgba(52,168,83,0.3)', color: '#5cb85c', fontSize: '0.875rem', textAlign: 'left' }}>
            {info}
          </div>
        )}

        <form onSubmit={handleEmailAuth} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', marginBottom: '2rem' }}>
          {/* First Name / Last Name — only for Sign Up */}
          {!isLogin && (
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <input
                type="text"
                placeholder="First name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                style={inputStyle}
                required
                autoComplete="given-name"
              />
              <input
                type="text"
                placeholder="Last name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                style={inputStyle}
                autoComplete="family-name"
              />
            </div>
          )}

          <input
            type="email"
            placeholder="Email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={inputStyle}
            required
            autoComplete="email"
          />

          {/* Password field with eye toggle */}
          <div style={{ position: 'relative', width: '100%' }}>
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{ ...inputStyle, paddingRight: '2.75rem' }}
              required
              autoComplete={isLogin ? 'current-password' : 'new-password'}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              style={{
                position: 'absolute',
                right: '0.5rem',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'rgba(255,255,255,0.4)',
                padding: '0.25rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'color 0.2s',
              }}
              onMouseOver={(e) => (e.currentTarget.style.color = 'rgba(255,255,255,0.8)')}
              onMouseOut={(e) => (e.currentTarget.style.color = 'rgba(255,255,255,0.4)')}
            >
              {showPassword ? <EyeOffIcon /> : <EyeIcon />}
            </button>
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            disabled={loading}
            style={{ width: '100%', padding: '0.75rem' }}
          >
            {loading ? 'Processing...' : (isLogin ? 'Sign In' : 'Create Account')}
          </button>
        </form>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
          <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.1)' }}></div>
          <span style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>OR</span>
          <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.1)' }}></div>
        </div>

        <button
          type="button"
          onClick={handleGoogleLogin}
          style={{
            width: '100%',
            padding: '0.75rem',
            fontSize: '1rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem',
            background: '#fff',
            color: '#000',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontWeight: 500,
            transition: 'background 0.2s',
          }}
          onMouseOver={(e) => e.currentTarget.style.background = '#f0f0f0'}
          onMouseOut={(e) => e.currentTarget.style.background = '#fff'}
        >
          <svg viewBox="0 0 24 24" width="20" height="20" xmlns="http://www.w3.org/2000/svg">
            <g transform="matrix(1, 0, 0, 1, 27.009001, -39.238998)">
              <path fill="#4285F4" d="M -3.264 51.509 C -3.264 50.719 -3.334 49.969 -3.454 49.239 L -14.754 49.239 L -14.754 53.749 L -8.284 53.749 C -8.574 55.229 -9.424 56.479 -10.684 57.329 L -10.684 60.329 L -6.824 60.329 C -4.564 58.239 -3.264 55.159 -3.264 51.509 Z"/>
              <path fill="#34A853" d="M -14.754 63.239 C -11.514 63.239 -8.804 62.159 -6.824 60.329 L -10.684 57.329 C -11.764 58.049 -13.134 58.489 -14.754 58.489 C -17.884 58.489 -20.534 56.379 -21.484 53.529 L -25.464 53.529 L -25.464 56.619 C -23.494 60.539 -19.444 63.239 -14.754 63.239 Z"/>
              <path fill="#FBBC05" d="M -21.484 53.529 C -21.734 52.809 -21.864 52.039 -21.864 51.239 C -21.864 50.439 -21.724 49.669 -21.484 48.949 L -21.484 45.859 L -25.464 45.859 C -26.284 47.479 -26.754 49.299 -26.754 51.239 C -26.754 53.179 -26.284 54.999 -25.464 56.619 L -21.484 53.529 Z"/>
              <path fill="#EA4335" d="M -14.754 43.989 C -12.984 43.989 -11.404 44.599 -10.154 45.789 L -6.734 42.369 C -8.804 40.429 -11.514 39.239 -14.754 39.239 C -19.444 39.239 -23.494 41.939 -25.464 45.859 L -21.484 48.949 C -20.534 46.099 -17.884 43.989 -14.754 43.989 Z"/>
            </g>
          </svg>
          Continue with Google
        </button>

        <div style={{ marginTop: '2rem' }}>
          <button
            type="button"
            onClick={() => { setIsLogin(!isLogin); setError(null); setInfo(null); }}
            style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: '0.875rem' }}
          >
            {isLogin ? "Don't have an account? Sign up" : "Already have an account? Sign in"}
          </button>
        </div>
      </div>
    </div>
  );
}
