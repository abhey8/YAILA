export function SkeletonLoader({ type = "card" }: { type?: "card" | "list" | "text" }) {
  if (type === "card") {
    return (
      <div className="study-skeleton rounded-xl p-5 animate-pulse">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 study-progress-track rounded-lg" />
          <div className="flex-1">
            <div className="h-5 study-progress-track rounded w-3/4 mb-2" />
            <div className="h-4 study-progress-track rounded w-1/2" />
          </div>
        </div>
      </div>
    );
  }

  if (type === "list") {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-16 study-progress-track rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  return <div className="h-4 study-progress-track rounded w-full animate-pulse" />;
}
