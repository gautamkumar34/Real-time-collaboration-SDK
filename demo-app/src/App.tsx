import { Routes, Route } from 'react-router-dom';
import LandingLayout from './landing/LandingLayout';
import HeroPage from './landing/HeroPage';
import FeaturesPage from './landing/FeaturesPage';
import PricingPage from './landing/PricingPage';
import DemoPlayground from './landing/DemoPlayground';
import AppLayout from './app/AppLayout';
import Dashboard from './app/Dashboard';
import DocumentEditor from './app/DocumentEditor';
import './App.css';

function App() {
  return (
    <Routes>
      {/* Public landing pages */}
      <Route element={<LandingLayout />}>
        <Route path="/" element={<HeroPage />} />
        <Route path="/features" element={<FeaturesPage />} />
        <Route path="/pricing" element={<PricingPage />} />
        <Route path="/demo" element={<DemoPlayground />} />
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