import { motion } from "motion/react";
import { ReactNode } from "react";

interface GlassCardProps {
  children: ReactNode;
  className?: string;
  hover?: boolean;
  onClick?: () => void;
}

export function GlassCard({ children, className = "", hover = false, onClick }: GlassCardProps) {
  const Component = onClick ? motion.button : motion.div;

  return (
    <Component
      onClick={onClick}
      whileHover={hover ? { scale: 1.01, y: -2 } : undefined}
      transition={{ duration: 0.2 }}
      className={`bg-[var(--glass-background)] backdrop-blur-md border border-[var(--glass-border)] rounded-2xl shadow-[var(--shadow-soft)] ${hover ? "cursor-pointer study-card-hover" : ""} ${className}`}
    >
      {children}
    </Component>
  );
}
