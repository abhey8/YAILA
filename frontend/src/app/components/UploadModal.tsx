import { X, Upload, FileText } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useState } from "react";
import { toast } from "sonner";
import { documentApi } from "../../services/api";

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function UploadModal({ isOpen, onClose, onSuccess }: UploadModalProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const appendFiles = (filesList: FileList | File[]) => {
    const validFiles = Array.from(filesList).filter(f => f.type === "application/pdf");
    if (validFiles.length < filesList.length) {
      toast.error("Some files were skipped. Please only upload PDFs.");
    }
    if (validFiles.length > 0) {
      setUploadedFiles(prev => [...prev, ...validFiles]);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files) {
      appendFiles(e.dataTransfer.files);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      appendFiles(e.target.files);
    }
  };

  const removeFile = (index: number) => {
    setUploadedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleUpload = async () => {
    if (uploadedFiles.length === 0) return;

    setIsUploading(true);

    try {
      const uploadPromises = uploadedFiles.map(file => documentApi.upload(file));
      await Promise.all(uploadPromises);

      toast.success(`${uploadedFiles.length} document(s) uploaded successfully!`);
      if (onSuccess) onSuccess();
      onClose();
      setUploadedFiles([]);
    } catch (error) {
      toast.error("Failed to upload documents. Please try again.");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/35 backdrop-blur-sm"
          />
          
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            onClick={(e) => e.stopPropagation()}
            className="relative study-panel rounded-2xl w-full max-w-lg p-6 max-h-[90vh] flex flex-col"
          >
            <button
              onClick={onClose}
              className="absolute top-4 right-4 p-2 rounded-lg hover:bg-[var(--hover-tint)] transition-colors"
            >
              <X className="w-5 h-5 text-[var(--muted-foreground)]" />
            </button>

            <h2 className="text-2xl font-bold text-[var(--foreground)] mb-6">Upload Documents</h2>

            <div className="flex-1 overflow-y-auto pr-2 pb-2">
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`border-2 border-dashed rounded-xl p-8 text-center transition-all ${
                  isDragging
                    ? "border-[var(--accent-primary)] bg-[var(--accent-soft)]"
                    : "border-[var(--border)] hover:border-[var(--accent-primary)]"
                }`}
              >
                 <Upload className="w-12 h-12 text-[var(--muted-foreground)] mx-auto mb-4" />
                 <p className="text-[var(--foreground-soft)] font-medium mb-2">
                   Drag and drop your PDFs here
                 </p>
                 <p className="text-sm text-[var(--muted-foreground)] mb-4">or</p>
                 <label className="inline-block">
                   <input
                     type="file"
                     accept=".pdf"
                     multiple
                     onChange={handleFileSelect}
                     className="hidden"
                   />
                   <span className="px-6 py-2.5 study-button-primary rounded-lg cursor-pointer inline-block font-medium">
                     Browse Files
                   </span>
                 </label>
                 <p className="text-xs text-[var(--muted-foreground)] mt-4">Multiple files allowed. Max 10MB per file.</p>
              </div>

              {uploadedFiles.length > 0 && (
                <div className="mt-6 space-y-3">
                  <h3 className="text-sm font-semibold text-[var(--foreground-soft)]">Selected Files ({uploadedFiles.length})</h3>
                  <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                    {uploadedFiles.map((f, i) => (
                       <div key={i} className="flex items-center justify-between p-3 study-panel-quiet rounded-lg">
                         <div className="flex items-center space-x-3 overflow-hidden">
                           <FileText className="w-6 h-6 text-[var(--accent-primary)] flex-shrink-0" />
                           <div className="truncate">
                             <p className="text-sm font-medium text-[var(--foreground)] truncate">{f.name}</p>
                             <p className="text-xs text-[var(--muted-foreground)]">{(f.size / 1024 / 1024).toFixed(2)} MB</p>
                           </div>
                         </div>
                         <button onClick={() => removeFile(i)} className="p-1 rounded-md text-[var(--muted-foreground)] hover:bg-[var(--hover-tint)] hover:text-[var(--weak)] transition-colors">
                           <X className="w-4 h-4" />
                         </button>
                       </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {uploadedFiles.length > 0 && (
              <button
                onClick={handleUpload}
                disabled={isUploading}
                className="w-full mt-6 px-6 py-3 study-button-primary rounded-xl font-medium flex items-center justify-center space-x-2"
              >
                {isUploading ? (
                  <span>Uploading {uploadedFiles.length} file(s)...</span>
                ) : (
                  <span>Upload {uploadedFiles.length} Document{uploadedFiles.length !== 1 ? 's' : ''}</span>
                )}
              </button>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
