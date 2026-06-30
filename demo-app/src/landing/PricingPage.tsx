
export default function PricingPage() {
  const plans = [
    {
      name: 'Open Source',
      price: 'Free',
      period: 'forever',
      desc: 'Self-host on your own infrastructure',
      features: [
        'Unlimited documents',
        'Unlimited users',
        'Yjs CRDT engine',
        'Live cursors & presence',
        'PostgreSQL persistence',
        'Redis multi-instance',
        'JWT authentication',
        'Docker deployment',
        'MIT License',
      ],
      cta: 'Get Started',
      ctaLink: '#demo',
      highlighted: true,
    },
    {
      name: 'Cloud (Coming Soon)',
      price: '$0',
      period: 'during beta',
      desc: 'Managed hosting — zero ops',
      features: [
        'Everything in Open Source',
        'Managed infrastructure',
        'Auto-scaling',
        'Global edge network',
        '99.9% uptime SLA',
        'Dashboard & analytics',
        'Priority support',
      ],
      cta: 'Join Waitlist',
      ctaLink: '#waitlist',
      highlighted: false,
    },
  ];

  return (
    <div className="pricing-page">
      <section className="section container">
        <div className="section-header animate-in-up">
          <span className="badge">Pricing</span>
          <h1>Free and <span className="gradient-text">open source</span></h1>
          <p className="section-subtitle">
            No hidden fees, no usage limits, no vendor lock-in.
            Self-host it yourself or wait for managed cloud.
          </p>
        </div>

        <div className="pricing-grid stagger">
          {plans.map(plan => (
            <div
              key={plan.name}
              className={`pricing-card animate-in ${plan.highlighted ? 'highlighted' : ''}`}
            >

              <h3 className="pricing-name">{plan.name}</h3>
              <div className="pricing-price">
                <span className="price-amount">{plan.price}</span>
                <span className="price-period">/{plan.period}</span>
              </div>
              <p className="pricing-desc">{plan.desc}</p>

              <ul className="pricing-features">
                {plan.features.map(f => (
                  <li key={f}>
                    <span className="check-icon">✓</span>
                    {f}
                  </li>
                ))}
              </ul>

              <a
                href={plan.ctaLink}
                className={`btn ${plan.highlighted ? 'btn-primary' : 'btn-secondary'} btn-full`}
              >
                {plan.cta}
              </a>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
