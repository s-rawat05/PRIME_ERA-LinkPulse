"use client";

import { MotionConfig, motion } from "motion/react";
import { useSyncExternalStore, type ReactNode } from "react";

const noopSubscribe = () => () => {};

/**
 * Scroll-triggered entrance for below-the-fold sections. The server HTML renders the content
 * fully visible; the animation is attached only after hydration, so slow or script-less clients
 * never see blank sections. Disabled for users who prefer reduced motion.
 */
export function FadeUp({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) {
  // false during SSR and hydration, true afterwards
  const enhanced = useSyncExternalStore(noopSubscribe, () => true, () => false);
  if (!enhanced) return <div className={className}>{children}</div>;
  return (
    <MotionConfig reducedMotion="user">
      <motion.div
        className={className}
        initial={{ opacity: 0, y: 18 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "0px 0px -40px 0px" }}
        transition={{ duration: 0.7, delay, ease: [0.22, 1, 0.36, 1] }}
      >
        {children}
      </motion.div>
    </MotionConfig>
  );
}
