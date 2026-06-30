import HeroPage from './HeroPage';
import FeaturesPage from './FeaturesPage';
import PricingPage from './PricingPage';
import DemoPlayground from './DemoPlayground';

export default function LandingPage() {
  return (
    <div className="landing-page-container">
      <section id="home">
        <HeroPage />
      </section>
      <section id="features">
        <FeaturesPage />
      </section>
      <section id="pricing">
        <PricingPage />
      </section>
      <section id="demo">
        <DemoPlayground />
      </section>
    </div>
  );
}
