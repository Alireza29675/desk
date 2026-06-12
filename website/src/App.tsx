import { Logo } from './components/Logo';
import { ThemeToggle } from './components/ThemeToggle';
import { Footer } from './sections/Footer';
import { Hero } from './sections/Hero';
import { ProofOfLife } from './sections/ProofOfLife';
import { Renders } from './sections/Renders';
import { RoundTrip } from './sections/RoundTrip';

export function App() {
  return (
    <div className="site" id="top">
      <nav className="nav">
        <div className="nav__inner container">
          <Logo />
          <div className="nav__links">
            <a className="nav__link" href="#install">
              Install
            </a>
            <a className="nav__link" href="https://github.com/Alireza29675/desk">
              GitHub
            </a>
            <ThemeToggle />
          </div>
        </div>
      </nav>

      <main>
        <Hero />
        <RoundTrip />
        <Renders />
        <ProofOfLife />
      </main>

      <Footer />
    </div>
  );
}
