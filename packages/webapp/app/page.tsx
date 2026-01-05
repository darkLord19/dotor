import Link from 'next/link';
import Navbar from '@/components/Navbar';
import styles from './page.module.css';

export default function Home() {
  return (
    <main className={styles.main}>
      {/* Navigation */}
      <Navbar />

      {/* Hero Section */}
      <section className={styles.hero}>
        <div className={styles.heroContent}>
          <h1 className={styles.title}>
            Ask anything across
            <br />
            <span className={styles.gradient}>your conversations</span>
          </h1>
          <p className={styles.description}>
            Unified inbox across email, calendar, and messages. Search, organize, 
            and act on all your conversations in one place. Privacy-first.
          </p>
          <div className={styles.cta}>
            <Link href="/login" className={styles.primaryButton}>
              Get Started
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M12 5l7 7-7 7"/>
              </svg>
            </Link>
            <Link href="#features" className={styles.secondaryButton}>
              See how it works
            </Link>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className={styles.howItWorks}>
        <div className={styles.sectionContent}>
          <h2 className={styles.sectionTitle}>How it works</h2>
          <div className={styles.steps}>
            <div className={styles.step}>
              <div className={styles.stepIcon}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
                </svg>
              </div>
              <h3>1. Connect</h3>
              <p>Link your Gmail, Calendar, and messages in seconds</p>
            </div>
            <div className={styles.step}>
              <div className={styles.stepIcon}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
              </div>
              <h3>2. Ask</h3>
              <p>Ask questions in plain English about your conversations</p>
            </div>
            <div className={styles.step}>
              <div className={styles.stepIcon}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              </div>
              <h3>3. Act</h3>
              <p>Get instant answers and take action across all platforms</p>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className={styles.features}>
        <div className={styles.sectionContent}>
          <h2 className={styles.sectionTitle}>Built for how you work</h2>
          <div className={styles.featureGrid}>
            <div className={styles.feature}>
              <h3>For Founders</h3>
              <p>&quot;Show me all investor conversations from last week&quot; — Stay on top of fundraising without switching between platforms</p>
            </div>
            <div className={styles.feature}>
              <h3>For Sales Teams</h3>
              <p>&quot;Which leads haven&apos;t replied in 3 days?&quot; — Never miss a follow-up across email, LinkedIn, and messaging</p>
            </div>
            <div className={styles.feature}>
              <h3>For Knowledge Workers</h3>
              <p>&quot;Find the proposal Sarah sent last month&quot; — Search across all conversations instantly</p>
            </div>
          </div>
        </div>
      </section>

      {/* Social Proof */}
      <section className={styles.socialProof}>
        <div className={styles.sectionContent}>
          <div className={styles.stats}>
            <div className={styles.stat}>
              <div className={styles.statValue}>3</div>
              <div className={styles.statLabel}>Platforms connected</div>
            </div>
            <div className={styles.stat}>
              <div className={styles.statValue}>Instant</div>
              <div className={styles.statLabel}>Search results</div>
            </div>
            <div className={styles.stat}>
              <div className={styles.statValue}>Private</div>
              <div className={styles.statLabel}>Your data stays yours</div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className={styles.finalCta}>
        <div className={styles.sectionContent}>
          <h2>Ready to unify your inbox?</h2>
          <p>Start organizing your conversations today</p>
          <Link href="/login" className={styles.primaryButton}>
            Get Started
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M12 5l7 7-7 7"/>
            </svg>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className={styles.footer}>
        <div className={styles.footerContent}>
          <div className={styles.footerLogo}>
            <span className={styles.logoIcon}>✦</span>
            <span>Dotor</span>
          </div>
          <div className={styles.footerLinks}>
            <Link href="#">Privacy</Link>
            <Link href="#">Terms</Link>
            <Link href="#">Contact</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
