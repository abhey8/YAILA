import { Upload } from "lucide-react";
import { motion } from "motion/react";

interface UploadButtonProps {
  onClick: () => void;
}

export function UploadButton({ onClick }: UploadButtonProps) {
  return (
    <motion.button
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
      className="fixed bottom-8 right-8 w-14 h-14 study-button-primary rounded-full transition-all flex items-center justify-center z-50"
    >
      <Upload className="w-6 h-6" />
    </motion.button>
  );
}
