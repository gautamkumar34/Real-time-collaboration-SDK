import { Link } from 'react-router-dom';

export default function Footer() {
  return (
    <footer className="footer">
      <div className="container footer-inner">
        <div className="footer-brand">
          <span className="brand-icon">⚡</span>
          <span className="brand-text">CollabDoc</span>
          <p className="footer-tagline">Open-source real-time collaboration SDK</p>
        </div>

        <div className="footer-links">
          <div className="footer-col">
            <h4>Product</h4>
            <Link to="/features">Features</Link>
            <Link to="/pricing">Pricing</Link>
            <Link to="/demo">Live Demo</Link>
          </div>
          <div className="footer-col">
            <h4>Resources</h4>
            <a href="https://github.com" target="_blank" rel="noopener">GitHub</a>
            <a href="#docs">Documentation</a>
            <a href="#changelog">Changelog</a>
          </div>
          <div className="footer-col">
            <h4>Community</h4>
            <a href="#discord">Discord</a>
            <a href="#twitter">Twitter</a>
            <a href="#blog">Blog</a>
          </div>
        </div>

        <div className="footer-bottom">
          <p>© {new Date().getFullYear()} CollabDoc. MIT License.</p>
        </div>
      </div>
    </footer>
  );
}
