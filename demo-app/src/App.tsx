import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import LandingLayout from './landing/LandingLayout';
import LandingPage from './landing/LandingPage';
import AppLayout from './app/AppLayout';
import Dashboard from './app/Dashboard';
import DocumentEditor from './app/DocumentEditor';
import Login from './app/Login';
import { AuthProvider, useAuth } from './app/AuthContext';
import './App.css';

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
      <Routes>
        {/* Public landing pages consolidated under / */}
        <Route element={<LandingLayout />}>
          <Route path="/" element={<LandingPage />} />
        </Route>
        
        <Route path="/login" element={<Login />} />

        {/* App workspace (Protected) */}
        <Route path="/app" element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
          <Route index element={<Dashboard />} />
          <Route path="doc/:id" element={<DocumentEditor />} />
        </Route>
      </Routes>
    </AuthProvider>
  );
}

export default App;