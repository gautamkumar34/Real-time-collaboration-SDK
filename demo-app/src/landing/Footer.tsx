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
            <a href="/#features">Features</a>
            <a href="/#pricing">Pricing</a>
            <a href="/#demo">Live Demo</a>
          </div>
          <div className="footer-col">
            <h4>Resources</h4>
            <a href="https://github.com/gautamkumar34/Real-time-collaboration-SDK" target="_blank" rel="noopener">GitHub</a>
            <Link to="/docs">Documentation</Link>
            <a href="https://www.npmjs.com/package/collabdoc-sdk" target="_blank" rel="noopener">NPM Package</a>
          </div>
          <div className="footer-col">
            <h4>Community</h4>
            <a href="https://github.com/gautamkumar34/Real-time-collaboration-SDK/issues" target="_blank" rel="noopener">Issues</a>
            <a href="https://github.com/gautamkumar34/Real-time-collaboration-SDK/discussions" target="_blank" rel="noopener">Discussions</a>
            <a href="https://x.com" target="_blank" rel="noopener">Twitter</a>
          </div>
        </div>

        <div className="footer-bottom">
          <p>© {new Date().getFullYear()} CollabDoc. MIT License.</p>
        </div>
      </div>
    </footer>
  );
}
