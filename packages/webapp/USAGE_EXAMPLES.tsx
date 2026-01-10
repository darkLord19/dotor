/**
 * Example Usage Patterns for the New Design System
 * 
 * This file demonstrates how to use the new components and animations
 * across your Dotor webapp.
 */

// @ts-nocheck
// This is a documentation/reference file, not production code

// ============================================================================
// ANIMATIONS
// ============================================================================

import { motion } from 'framer-motion';
import { 
  fadeVariants, 
  slideUpVariants, 
  staggerContainer, 
  staggerItem,
  hoverLift 
} from '@/lib/animations';

// Example 1: Simple fade-in page
export function SimplePage() {
  return (
    <motion.div
      variants={fadeVariants}
      initial="hidden"
      animate="visible"
    >
      <h1>Content fades in</h1>
    </motion.div>
  );
}

// Example 2: Staggered list animation
export function StaggeredList({ items }: { items: string[] }) {
  return (
    <motion.ul
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
    >
      {items.map((item, i) => (
        <motion.li key={i} variants={staggerItem}>
          {item}
        </motion.li>
      ))}
    </motion.ul>
  );
}

// Example 3: Hover lift effect (inline)
export function HoverCard() {
  return (
    <motion.div {...hoverLift}>
      <p>Lifts on hover</p>
    </motion.div>
  );
}

// Example 4: Scroll-triggered animation
export function ScrollTriggered() {
  return (
    <motion.section
      initial={{ opacity: 0, y: 50 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-100px" }}
      transition={{ duration: 0.5 }}
    >
      <h2>Animates when scrolled into view</h2>
    </motion.section>
  );
}

// ============================================================================
// UI COMPONENTS
// ============================================================================

import { Button, Input, Card } from '@/components/ui';

// Example 5: Button variants
export function ButtonExamples() {
  return (
    <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
      <Button variant="primary" size="md">
        Primary Button
      </Button>
      
      <Button variant="secondary" size="md">
        Secondary Button
      </Button>
      
      <Button variant="ghost" size="md">
        Ghost Button
      </Button>
      
      <Button variant="danger" size="md">
        Danger Button
      </Button>
      
      <Button variant="primary" size="md" loading>
        Loading...
      </Button>
      
      <Button variant="primary" size="md" disabled>
        Disabled
      </Button>
    </div>
  );
}

// Example 6: Form with inputs
export function FormExample() {
  return (
    <form style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <Input
        label="Email"
        type="email"
        placeholder="you@example.com"
        fullWidth
      />
      
      <Input
        label="Password"
        type="password"
        placeholder="Enter password"
        error="Password must be at least 8 characters"
        fullWidth
      />
      
      <Button variant="primary" type="submit" fullWidth>
        Sign In
      </Button>
    </form>
  );
}

// Example 7: Cards with different styles
export function CardExamples() {
  return (
    <div style={{ display: 'grid', gap: 'var(--space-4)', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))' }}>
      <Card>
        <h3>Default Card</h3>
        <p>Standard padding and no hover effect</p>
      </Card>
      
      <Card hover>
        <h3>Hover Card</h3>
        <p>Lifts on hover</p>
      </Card>
      
      <Card padding="lg">
        <h3>Large Padding</h3>
        <p>Extra spacious</p>
      </Card>
      
      <Card padding="sm">
        <h3>Small Padding</h3>
        <p>Compact layout</p>
      </Card>
    </div>
  );
}

// ============================================================================
// CSS CUSTOM PROPERTIES
// ============================================================================

// Example 8: Using design tokens in your styles
const exampleStyles = {
  // Spacing
  padding: 'var(--space-4)',
  gap: 'var(--space-2)',
  margin: 'var(--space-8) 0',
  
  // Colors
  background: 'var(--surface-secondary)',
  color: 'var(--text-primary)',
  borderColor: 'var(--border-primary)',
  
  // Typography
  fontSize: 'var(--text-base)',
  lineHeight: 'var(--leading-relaxed)',
  fontWeight: '500',
  
  // Border & Radius
  border: '1px solid var(--border-primary)',
  borderRadius: 'var(--radius-lg)',
  
  // Shadows
  boxShadow: 'var(--shadow-md)',
  
  // Transitions
  transition: 'all var(--transition-base)',
};

// Example 9: Hover states in CSS
const cssExample = `
.myElement {
  background: var(--surface-secondary);
  border: 1px solid var(--border-primary);
  transition: all var(--transition-base);
}

.myElement:hover {
  background: var(--surface-hover);
  border-color: var(--border-hover);
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
}

.myElement:focus-visible {
  outline: 2px solid var(--border-focus);
  outline-offset: 2px;
}
`;

// ============================================================================
// COMPLETE PAGE EXAMPLE
// ============================================================================

export function CompletePageExample() {
  return (
    <motion.main
      variants={fadeVariants}
      initial="hidden"
      animate="visible"
      style={{
        minHeight: '100vh',
        padding: 'var(--space-8)',
        background: 'var(--bg-primary)',
      }}
    >
      {/* Hero Section */}
      <motion.section
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
        style={{
          maxWidth: '1200px',
          margin: '0 auto',
          textAlign: 'center',
        }}
      >
        <motion.h1
          variants={staggerItem}
          style={{
            fontSize: 'var(--text-5xl)',
            fontWeight: '700',
            marginBottom: 'var(--space-6)',
            letterSpacing: '-0.02em',
          }}
        >
          Welcome to <span style={{ background: 'var(--accent-gradient)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Dotor</span>
        </motion.h1>
        
        <motion.p
          variants={staggerItem}
          style={{
            fontSize: 'var(--text-xl)',
            color: 'var(--text-secondary)',
            marginBottom: 'var(--space-8)',
          }}
        >
          Your privacy-first personal assistant
        </motion.p>
        
        <motion.div
          variants={staggerItem}
          style={{ display: 'flex', gap: 'var(--space-4)', justifyContent: 'center' }}
        >
          <Button variant="primary" size="lg">
            Get Started
          </Button>
          <Button variant="secondary" size="lg">
            Learn More
          </Button>
        </motion.div>
      </motion.section>

      {/* Features Grid */}
      <motion.section
        variants={staggerContainer}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-100px" }}
        style={{
          maxWidth: '1200px',
          margin: 'var(--space-20) auto',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: 'var(--space-6)',
        }}
      >
        {['Feature 1', 'Feature 2', 'Feature 3'].map((feature, i) => (
          <motion.div key={i} variants={staggerItem}>
            <Card hover padding="lg">
              <h3 style={{ fontSize: 'var(--text-xl)', marginBottom: 'var(--space-3)' }}>
                {feature}
              </h3>
              <p style={{ color: 'var(--text-secondary)', lineHeight: 'var(--leading-relaxed)' }}>
                Description of the feature with enhanced typography and spacing.
              </p>
            </Card>
          </motion.div>
        ))}
      </motion.section>
    </motion.main>
  );
}

// ============================================================================
// TIPS & BEST PRACTICES
// ============================================================================

/**
 * ANIMATION TIPS:
 * 
 * 1. Use stagger for lists and grids
 * 2. Always provide initial/animate states
 * 3. Use viewport for scroll-triggered animations
 * 4. Keep durations under 500ms for most animations
 * 5. Use spring physics for natural feel
 * 6. Respect prefers-reduced-motion (handled automatically)
 */

/**
 * STYLING TIPS:
 * 
 * 1. Always use CSS custom properties from globals.css
 * 2. Prefer spacing scale over arbitrary values
 * 3. Use semantic color names (--text-secondary vs --text-muted)
 * 4. Apply transitions to :hover states
 * 5. Use transform for performant animations
 * 6. Add focus-visible styles to all interactive elements
 */

/**
 * COMPONENT TIPS:
 * 
 * 1. Import from @/components/ui for shared components
 * 2. Use Button component instead of styled <button>
 * 3. Wrap forms in Card for consistent styling
 * 4. Apply hover prop to Cards that should lift
 * 5. Use Input component with labels and error states
 */
