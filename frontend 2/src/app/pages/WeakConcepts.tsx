import { AlertTriangle } from "lucide-react";
import { ComingSoon } from "../components/ComingSoon";

export default function WeakConcepts() {
  return (
    <ComingSoon
      title="Weak Concepts"
      description="This module is temporarily disabled while core study flow is being stabilized."
      icon={AlertTriangle}
    />
  );
}

