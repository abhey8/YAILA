import { Bot, User } from "lucide-react";
import { motion } from "motion/react";

interface ChatMessageProps {
  role: "user" | "assistant";
  content: string;
  citations?: { documentTitle?: string; sectionTitle?: string }[];
}

export function ChatMessage({ role, content, citations = [] }: ChatMessageProps) {
  const isUser = role === "user";

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex gap-3 ${isUser ? "flex-row-reverse" : "flex-row"}`}
    >
      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 shadow-sm ${
        isUser ? "bg-[var(--accent-primary)] text-[var(--primary-foreground)]" : "bg-[var(--surface-3)] text-[var(--accent-secondary)] border border-[var(--border)]"
      }`}>
        {isUser ? (
          <User className="w-5 h-5" />
        ) : (
          <Bot className="w-5 h-5" />
        )}
      </div>

      <div className={`max-w-[70%] ${isUser ? "items-end" : "items-start"} flex flex-col`}>
        <div className={`rounded-2xl px-4 py-3 ${
          isUser 
            ? "bg-[var(--accent-primary)] text-[var(--primary-foreground)]"
            : "study-panel text-[var(--foreground)]"
        }`}>
          <p className="text-sm leading-7 whitespace-pre-wrap">{content}</p>
          {!isUser && citations.length ? (
            <div className="mt-3 pt-3 border-t border-[var(--border)] text-xs text-[var(--muted-foreground)]">
              Sources: {citations.map((citation, index) => (
                <span key={`${citation.documentTitle}-${citation.sectionTitle}-${index}`}>
                  {index ? ", " : ""}
                  {(citation.documentTitle || "Uploaded Document")}{citation.sectionTitle ? ` - ${citation.sectionTitle}` : ""}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </motion.div>
  );
}
