import { Link } from 'react-router-dom';
import { useState, useEffect } from 'react';

const LightningIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '8px' }}>
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
  </svg>
);

export default function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeHash, setActiveHash] = useState('#home');

  const links = [
    { hash: '#home', label: 'Home' },
    { hash: '#features', label: 'Features' },
    { hash: '#pricing', label: 'Pricing' },
    { hash: '#demo', label: 'Demo' },
  ];

  useEffect(() => {
    const handleHashChange = () => {
      setActiveHash(window.location.hash || '#home');
    };
    window.addEventListener('hashchange', handleHashChange);
    handleHashChange();
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const handleLinkClick = (hash: string) => {
    setActiveHash(hash);
    setMenuOpen(false);
  };

  return (
    <nav className="navbar glass">
      <div className="container navbar-inner">
        <a href="#home" className="navbar-brand" onClick={() => handleLinkClick('#home')}>
          <LightningIcon />
          <span className="brand-text">CollabDoc</span>
        </a>

        <div className={`navbar-links ${menuOpen ? 'open' : ''}`}>
          {links.map(({ hash, label }) => (
            <a
              key={hash}
              href={hash}
              className={`nav-link ${activeHash === hash ? 'active' : ''}`}
              onClick={() => handleLinkClick(hash)}
            >
              {label}
            </a>
          ))}
        </div>

        <div className="navbar-actions">
          <Link to="/app" className="btn btn-primary btn-sm">
            Open App →
          </Link>
          <button
            className="mobile-menu-btn"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="Toggle menu"
          >
            <span className={`hamburger ${menuOpen ? 'open' : ''}`} />
          </button>
        </div>
      </div>
    </nav>
  );
}
