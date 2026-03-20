import { BarChart3 } from "lucide-react";
import { ComingSoon } from "../components/ComingSoon";

export default function Analytics() {
  return (
    <ComingSoon
      title="Advanced Analytics"
      description="The redesigned analytics workspace is ready, but the backend does not yet expose a dedicated analytics page API beyond dashboard stats. This screen is intentionally gated to avoid speculative requests."
      icon={BarChart3}
    />
  );
}
