// E07-0113: Motion tokens — durations
export const durations = {
  micro: 0.12,
  short: 0.18,
  base: 0.24,
  long: 0.36,
} as const;

// E07-0114: easing
export const easings = {
  default: [0.33, 1, 0.68, 1] as const, // easeOutCubic
  emphasis: { type: 'spring' as const, stiffness: 380, damping: 32 },
} as const;

// E07-0106: Reduced motion variants — instant transitions
export const reducedMotionTransition = { duration: 0.01 };

function withReducedMotion<T extends Record<string, unknown>>(variants: T): T {
  const mq = typeof window !== 'undefined'
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : null;
  if (mq?.matches) {
    const reduced = {} as Record<string, unknown>;
    for (const key of Object.keys(variants)) {
      const val = variants[key];
      if (typeof val === 'object' && val !== null) {
        reduced[key] = { ...val, transition: reducedMotionTransition };
      } else {
        reduced[key] = val;
      }
    }
    return reduced as T;
  }
  return variants;
}

// E07-0116: FileCard animation
export const fileCardVariants = {
  initial: { opacity: 0, scale: 0.98 },
  animate: { opacity: 1, scale: 1, transition: { duration: durations.base, ease: easings.default } },
  exit: { opacity: 0, scale: 0.98, transition: { duration: durations.short } },
};

// E07-0117: ContextActionsCard animation
export const contextActionsVariants = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: { duration: durations.base, ease: easings.default } },
  exit: { opacity: 0, y: -8, transition: { duration: durations.short } },
};

// E07-0118: RunCard animation
export const runCardVariants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: { duration: durations.base, ease: easings.default } },
};

// E07-0119: ResultCard success reveal
export const resultCardVariants = {
  initial: { opacity: 0, scale: 0.97 },
  animate: {
    opacity: 1,
    scale: 1,
    transition: { duration: durations.long, ease: easings.default },
  },
};

// E07-0120: Focus Stage expand
export const focusStageVariants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: durations.long, ease: easings.default } },
  exit: { opacity: 0, transition: { duration: durations.base } },
};

// E07-0131: hover micro-lift
export const hoverLift = {
  whileHover: { y: -2, transition: { duration: durations.micro } },
  whileTap: { scale: 0.98, transition: { duration: durations.micro } },
};

// Stagger children
export const staggerContainer = {
  animate: {
    transition: {
      staggerChildren: 0.06,
    },
  },
};

export const staggerItem = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: { duration: durations.base, ease: easings.default } },
};

// E07-0132: Card entrance — slide-from-right for RTL
export const cardEntranceRTL = {
  initial: { opacity: 0, x: 20 },
  animate: { opacity: 1, x: 0, transition: { duration: durations.base, ease: easings.default } },
  exit: { opacity: 0, x: -20, transition: { duration: durations.short } },
};

// E07-0133: Shimmer loading animation
export const shimmerVariants = {
  initial: { backgroundPosition: '-200% 0' },
  animate: {
    backgroundPosition: '200% 0',
    transition: { duration: 2, repeat: Infinity, ease: 'easeInOut' },
  },
};

// Sidebar animation
export const sidebarVariants = {
  hidden: { width: 0, opacity: 0 },
  peek: { width: 64, opacity: 1 },
  full: { width: 320, opacity: 1 },
};

// E07-0106: Global reduce-motion utility
export function getAnimationProps(variants: Record<string, unknown>) {
  return withReducedMotion(variants);
}
