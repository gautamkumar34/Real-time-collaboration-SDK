import { Routes, Route, Navigate, useLocation, useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useEffect } from 'react';
import LandingLayout from './landing/LandingLayout';
import LandingPage from './landing/LandingPage';
import AppLayout from './app/AppLayout';
import Dashboard from './app/Dashboard';
import DocumentEditor from './app/DocumentEditor';
import Login from './app/Login';
import { AuthProvider, useAuth } from './app/AuthContext';
import './App.css';

function AuthOrchestrator() {
  const { user, pendingRedirect, clearPendingRedirect } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const location = useLocation();

  // Forward Supabase OAuth errors from root URL to the login page
  useEffect(() => {
    if (location.pathname === '/' && searchParams.get('error')) {
      const error = encodeURIComponent(searchParams.get('error') || '');
      const desc = encodeURIComponent(searchParams.get('error_description') || '');
      navigate(`/login?error=${error}&error_description=${desc}`, { replace: true });
    }
  }, [location.pathname, searchParams]);

  // Navigate to intended destination after Google OAuth
  useEffect(() => {
    if (user && pendingRedirect) {
      clearPendingRedirect();
      navigate(pendingRedirect, { replace: true });
    }
  }, [user, pendingRedirect]);

  return null;
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center' }}>Loading...</div>;
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}

function App() {
  return (
    <AuthProvider>
      <AuthOrchestrator />
      <Routes>
        <Route element={<LandingLayout />}>
          <Route path="/" element={<LandingPage />} />
        </Route>

        <Route path="/login" element={<Login />} />

        <Route path="/app" element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
          <Route index element={<Dashboard />} />
          <Route path="doc/:id" element={<DocumentEditorWrapper />} />
        </Route>
      </Routes>
    </AuthProvider>
  );
}

function DocumentEditorWrapper() {
  const { id } = useParams<{ id: string }>();
  return <DocumentEditor key={id} />;
}

export default App;
