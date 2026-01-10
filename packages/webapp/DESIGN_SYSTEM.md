# Design System Documentation

## Overview
The Dotor webapp now features a modern design system inspired by Linear, Figma, and Notion, emphasizing smooth animations, refined dark mode aesthetics, and polished interactions.

## Design Principles

### 1. **Color System**
- **Refined Dark Theme**: Updated color palette with better contrast ratios
- **Surface Hierarchy**: Multiple surface levels for depth
- **Semantic Colors**: Consistent use of success, warning, error, and info colors
- **Accent Gradients**: Beautiful purple gradient for primary actions

### 2. **Typography**
- **Font**: Switched to Inter for better readability and modern feel
- **Scale**: Consistent font sizing using CSS variables (--text-xs to --text-6xl)
- **Line Heights**: Optimized for readability (tight, snug, normal, relaxed, loose)
- **Letter Spacing**: Negative tracking for headings, improved legibility

### 3. **Spacing**
- **Base Unit**: 4px (0.25rem)
- **Scale**: --space-1 through --space-24
- **Consistent**: Applied throughout all components

### 4. **Animations**
All animations use Framer Motion with carefully crafted variants:

#### Available Animation Variants:
- `fadeVariants` - Simple fade in/out
- `slideUpVariants` - Slide up with spring physics
- `scaleVariants` - Scale with hover effects
- `staggerContainer` & `staggerItem` - Staggered children animations
- `cardHoverVariants` - Card lift effects
- `dialogContentVariants` - Modal animations
- `toastVariants` - Notification animations

#### Transitions:
- Fast: 150ms - for instant feedback
- Base: 200ms - standard transitions
- Slow: 300ms - for complex animations
- Spring: Physics-based for natural feel

### 5. **Components**

#### Button Component
```tsx
import { Button } from '@/components/ui';

<Button variant="primary" size="md" loading={false}>
  Click me
</Button>
```
Variants: primary, secondary, ghost, danger
Sizes: sm, md, lg

#### Input Component
```tsx
import { Input } from '@/components/ui';

<Input 
  label="Email" 
  error="Invalid email" 
  fullWidth 
/>
```

#### Card Component
```tsx
import { Card } from '@/components/ui';

<Card hover padding="md">
  Content here
</Card>
```

### 6. **Shadows**
- `--shadow-sm`: Subtle elevation
- `--shadow-md`: Standard cards
- `--shadow-lg`: Elevated modals
- `--shadow-xl`: High elevation
- `--shadow-glow`: Accent glow effect

### 7. **Border Radius**
- `--radius-sm`: 6px - small elements
- `--radius-md`: 8px - standard
- `--radius-lg`: 12px - cards
- `--radius-xl`: 16px - containers
- `--radius-full`: 9999px - pills

## Key Features

### Landing Page
- Staggered animations on scroll
- Gradient text effects
- Hover lift animations on cards
- Smooth transitions between states

### Ask Page (Chat Interface)
- Enhanced input with focus states
- Smooth message animations
- Better scrollbar styling
- Improved message bubbles
- Animated confidence bars with shimmer effect

### Login Page
- Centered card with backdrop blur
- Animated form fields
- Smooth state transitions
- Enhanced focus states

### Components
- **AnswerCard**: Improved citation links, better source cards with slide effect
- **ConfidenceBar**: Animated progress with glow effects
- **All Buttons**: Hover lift, focus rings, active states

## Usage Guidelines

### Adding Animations
```tsx
import { motion } from 'framer-motion';
import { fadeVariants, staggerContainer } from '@/lib/animations';

<motion.div
  variants={fadeVariants}
  initial="hidden"
  animate="visible"
>
  Content
</motion.div>
```

### Using CSS Variables
```css
.myComponent {
  padding: var(--space-4);
  background: var(--surface-secondary);
  border: 1px solid var(--border-primary);
  border-radius: var(--radius-lg);
  transition: all var(--transition-base);
}
```

### Hover Effects
Standard pattern for interactive elements:
```css
.element {
  transition: all var(--transition-base);
}

.element:hover {
  transform: translateY(-2px);
  border-color: var(--border-hover);
}
```

## Accessibility

- Focus-visible states on all interactive elements
- Proper focus ring styling with offset
- Reduced motion support via `prefers-reduced-motion`
- Semantic color contrast ratios
- ARIA-compliant interactive components

## Performance

- Hardware-accelerated animations using `transform` and `opacity`
- Framer Motion with optimized spring physics
- Minimal repaints with CSS containment
- Lazy loading of heavy components

## Future Enhancements

- Light mode implementation
- More Radix UI primitives (Dropdown, Select, Tooltip, Toast)
- Advanced animations (page transitions, shared layout)
- Micro-interactions for all user actions
- Loading skeletons for async content

## Browser Support

- Modern browsers (Chrome 90+, Firefox 88+, Safari 14+, Edge 90+)
- Full support for CSS custom properties
- Hardware acceleration for transforms
- Backdrop blur where supported

---

Last updated: January 10, 2026
