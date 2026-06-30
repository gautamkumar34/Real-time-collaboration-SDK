import { Routes, Route } from 'react-router-dom';
import LandingLayout from './landing/LandingLayout';
import LandingPage from './landing/LandingPage';
import AppLayout from './app/AppLayout';
import Dashboard from './app/Dashboard';
import DocumentEditor from './app/DocumentEditor';
import './App.css';

function App() {
  return (
    <Routes>
      {/* Public landing pages consolidated under / */}
      <Route element={<LandingLayout />}>
        <Route path="/" element={<LandingPage />} />
      </Route>

      {/* App workspace (demo — no real auth) */}
      <Route path="/app" element={<AppLayout />}>
        <Route index element={<Dashboard />} />
        <Route path="doc/:id" element={<DocumentEditor />} />
      </Route>
    </Routes>
  );
}

export default App;