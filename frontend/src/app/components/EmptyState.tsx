import { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      <div className="w-20 h-20 rounded-full flex items-center justify-center mb-6 bg-[var(--accent-soft)] border border-[var(--border)]">
        <Icon className="w-10 h-10 text-[var(--accent-primary)]" />
      </div>
      <h3 className="text-xl font-semibold text-[var(--foreground)] mb-2">{title}</h3>
      <p className="text-[var(--muted-foreground)] text-center max-w-md mb-6 leading-7">{description}</p>
      {action && (
        <button
          onClick={action.onClick}
          className="px-6 py-2.5 study-button-primary rounded-lg"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
