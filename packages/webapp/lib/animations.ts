/**
 * Animation variants and utilities for Framer Motion
 * Inspired by Linear, Figma, and Notion's smooth animations
 */

import { Variants, Transition } from 'framer-motion';

// Easing curves matching Linear's feel
export const easings = {
  easeOut: [0.4, 0, 0.2, 1],
  easeIn: [0.4, 0, 1, 1],
  easeInOut: [0.4, 0, 0.2, 1],
  spring: [0.34, 1.56, 0.64, 1],
} as const;

// Standard transitions
export const transitions = {
  fast: {
    duration: 0.15,
    ease: easings.easeOut,
  },
  base: {
    duration: 0.2,
    ease: easings.easeOut,
  },
  slow: {
    duration: 0.3,
    ease: easings.easeOut,
  },
  spring: {
    type: 'spring',
    stiffness: 400,
    damping: 30,
  },
  springBouncy: {
    type: 'spring',
    stiffness: 300,
    damping: 20,
  },
} as const;

// Page transitions
export const pageVariants: Variants = {
  initial: {
    opacity: 0,
    y: 8,
  },
  animate: {
    opacity: 1,
    y: 0,
    transition: transitions.base,
  },
  exit: {
    opacity: 0,
    y: -8,
    transition: transitions.fast,
  },
};

// Fade in/out
export const fadeVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: transitions.base,
  },
  exit: {
    opacity: 0,
    transition: transitions.fast,
  },
};

// Slide up (for modals, cards appearing from bottom)
export const slideUpVariants: Variants = {
  hidden: {
    y: 20,
    opacity: 0,
  },
  visible: {
    y: 0,
    opacity: 1,
    transition: transitions.spring,
  },
  exit: {
    y: 20,
    opacity: 0,
    transition: transitions.fast,
  },
};

// Scale (for buttons, interactive elements)
export const scaleVariants: Variants = {
  initial: { scale: 0.95, opacity: 0 },
  animate: {
    scale: 1,
    opacity: 1,
    transition: transitions.spring,
  },
  exit: {
    scale: 0.95,
    opacity: 0,
    transition: transitions.fast,
  },
  tap: { scale: 0.97 },
  hover: { scale: 1.02 },
};

// Stagger children
export const staggerContainer: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05,
      delayChildren: 0.1,
    },
  },
};

export const staggerItem: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: {
    opacity: 1,
    y: 0,
    transition: transitions.base,
  },
};

// Card hover effects (Linear-style)
export const cardHoverVariants: Variants = {
  initial: {},
  hover: {
    y: -4,
    transition: transitions.spring,
  },
  tap: {
    scale: 0.98,
  },
};

// Backdrop blur (for modals/dialogs)
export const backdropVariants: Variants = {
  hidden: {
    opacity: 0,
    backdropFilter: 'blur(0px)',
  },
  visible: {
    opacity: 1,
    backdropFilter: 'blur(8px)',
    transition: transitions.base,
  },
  exit: {
    opacity: 0,
    backdropFilter: 'blur(0px)',
    transition: transitions.fast,
  },
};

// Modal/Dialog content
export const dialogContentVariants: Variants = {
  hidden: {
    opacity: 0,
    scale: 0.95,
    y: 8,
  },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: transitions.spring,
  },
  exit: {
    opacity: 0,
    scale: 0.95,
    y: 8,
    transition: transitions.fast,
  },
};

// Slide in from side (for sidebars, drawers)
export const slideFromRightVariants: Variants = {
  hidden: {
    x: '100%',
    opacity: 0,
  },
  visible: {
    x: 0,
    opacity: 1,
    transition: transitions.spring,
  },
  exit: {
    x: '100%',
    opacity: 0,
    transition: transitions.base,
  },
};

export const slideFromLeftVariants: Variants = {
  hidden: {
    x: '-100%',
    opacity: 0,
  },
  visible: {
    x: 0,
    opacity: 1,
    transition: transitions.spring,
  },
  exit: {
    x: '-100%',
    opacity: 0,
    transition: transitions.base,
  },
};

// Expand/collapse
export const expandVariants: Variants = {
  collapsed: {
    height: 0,
    opacity: 0,
    transition: transitions.fast,
  },
  expanded: {
    height: 'auto',
    opacity: 1,
    transition: transitions.base,
  },
};

// Rotate (for icons, buttons)
export const rotateVariants: Variants = {
  initial: { rotate: 0 },
  rotated: {
    rotate: 180,
    transition: transitions.base,
  },
};

// Skeleton loading pulse
export const skeletonVariants: Variants = {
  initial: { opacity: 0.4 },
  animate: {
    opacity: [0.4, 0.8, 0.4],
    transition: {
      duration: 1.5,
      repeat: Infinity,
      ease: 'easeInOut',
    },
  },
};

// Toast notifications (slide in from top)
export const toastVariants: Variants = {
  hidden: {
    y: -100,
    opacity: 0,
    scale: 0.95,
  },
  visible: {
    y: 0,
    opacity: 1,
    scale: 1,
    transition: transitions.spring,
  },
  exit: {
    y: -100,
    opacity: 0,
    scale: 0.95,
    transition: transitions.base,
  },
};

// Utility function to create custom stagger
export const createStagger = (
  staggerDelay: number = 0.05,
  delayChildren: number = 0
): Transition => ({
  staggerChildren: staggerDelay,
  delayChildren,
});

// Utility for hover lift effect
export const hoverLift = {
  whileHover: { y: -2, transition: transitions.fast },
  whileTap: { scale: 0.98 },
};

// Utility for glow effect on hover
export const glowOnHover = {
  whileHover: {
    boxShadow: '0 0 24px rgba(139, 92, 246, 0.3)',
    transition: transitions.base,
  },
};
