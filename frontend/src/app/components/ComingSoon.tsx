import { Sparkles } from "lucide-react";
import { motion } from "motion/react";
import { GlassCard } from "./GlassCard";

interface ComingSoonProps {
  title: string;
  description: string;
  icon?: React.ElementType;
}

export function ComingSoon({ title, description, icon: Icon }: ComingSoonProps) {
  return (
    <div className="max-w-4xl mx-auto py-20 px-6">
      <GlassCard className="p-12 text-center">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", duration: 0.6 }}
          className="w-24 h-24 mx-auto mb-6 rounded-3xl flex items-center justify-center shadow-[var(--shadow-soft)] border border-[var(--border)]"
          style={{ background: "linear-gradient(155deg, color-mix(in srgb, var(--accent-primary) 24%, var(--surface-2)) 0%, color-mix(in srgb, var(--accent-secondary) 14%, var(--surface-1)) 100%)" }}
        >
          {Icon ? <Icon className="w-12 h-12 text-[var(--accent-primary)]" /> : <Sparkles className="w-12 h-12 text-[var(--accent-primary)]" />}
        </motion.div>

        <h2 className="text-3xl font-bold mb-4 text-[var(--foreground)]">
          {title}
        </h2>

        <p className="text-[var(--muted-foreground)] text-lg mb-8 max-w-2xl mx-auto">
          {description}
        </p>

        <div className="inline-flex items-center gap-2 px-6 py-3 study-chip rounded-full font-medium">
          <Sparkles className="w-4 h-4" />
          Coming Soon
        </div>
      </GlassCard>
    </div>
  );
}
