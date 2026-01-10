'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { staggerContainer, staggerItem, fadeVariants, hoverLift } from '@/lib/animations';
import styles from './page.module.css';

export default function Home() {
  return (
    <motion.main 
      className={styles.main}
      initial="hidden"
      animate="visible"
      variants={fadeVariants}
    >
      <motion.div 
        className={styles.hero}
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
      >
        <motion.div variants={staggerItem}>
          <div className={styles.badge}>
            <span className={styles.badgeIcon}>✦</span>
            Privacy-First
          </div>
        </motion.div>
        
        <motion.h1 className={styles.title} variants={staggerItem}>
          Your personal assistant that
          <span className={styles.gradient}> never stores your data</span>
        </motion.h1>
        
        <motion.p className={styles.description} variants={staggerItem}>
          Search across your emails, calendar, LinkedIn, and WhatsApp messages.
          All processing happens in real-time. Nothing is stored.
        </motion.p>
        
        <motion.div className={styles.cta} variants={staggerItem}>
          <Link href="/login" className={styles.primaryButton}>
            <motion.span {...hoverLift} style={{ display: 'inline-block' }}>
              Get Started
            </motion.span>
          </Link>
          <Link href="#features" className={styles.secondaryButton}>
            <motion.span {...hoverLift} style={{ display: 'inline-block' }}>
              Learn More
            </motion.span>
          </Link>
        </motion.div>
      </motion.div>

      <motion.div 
        id="features" 
        className={styles.features}
        variants={staggerContainer}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-100px" }}
      >
        <motion.div className={styles.feature} variants={staggerItem}>
          <div className={styles.featureIcon}>🔒</div>
          <h3>Zero Storage</h3>
          <p>Your queries and data are processed in-memory only. Nothing is saved to any database.</p>
        </motion.div>
        
        <motion.div className={styles.feature} variants={staggerItem}>
          <div className={styles.featureIcon}>📧</div>
          <h3>Gmail & Calendar</h3>
          <p>Search your emails and schedule with natural language questions.</p>
        </motion.div>
        
        <motion.div className={styles.feature} variants={staggerItem}>
          <div className={styles.featureIcon}>💬</div>
          <h3>Messages</h3>
          <p>Search LinkedIn and WhatsApp messages through our browser extension.</p>
        </motion.div>
        
        <motion.div className={styles.feature} variants={staggerItem}>
          <div className={styles.featureIcon}>🤖</div>
          <h3>AI-Powered</h3>
          <p>Get synthesized answers with cited sources, not just search results.</p>
        </motion.div>
      </motion.div>

      <motion.footer 
        className={styles.footer}
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5 }}
      >
        <p>Built with privacy in mind. Your data stays yours.</p>
      </motion.footer>
    </motion.main>
  );
}
