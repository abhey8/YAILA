import { X, Upload, FileText, RotateCcw } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { documentApi } from "../../services/api";

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

interface UploadItem {
  id: string;
  file: File;
  progress: number;
  status: "queued" | "uploading" | "uploaded" | "failed";
}

const createUploadItem = (file: File): UploadItem => ({
  id: `${file.name}-${file.size}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  file,
  progress: 0,
  status: "queued",
});

export function UploadModal({ isOpen, onClose, onSuccess }: UploadModalProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<UploadItem[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  const openFilePicker = () => {
    inputRef.current?.click();
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const appendFiles = (filesList: FileList | File[]) => {
    const validFiles = Array.from(filesList).filter((file) => file.type === "application/pdf");
    if (validFiles.length < filesList.length) {
      toast.error("Some files were skipped. Please only upload PDFs.");
    }

    if (validFiles.length > 0) {
      setUploadedFiles((prev) => [...prev, ...validFiles.map(createUploadItem)]);
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
      e.target.value = "";
    }
  };

  const removeFile = (id: string) => {
    setUploadedFiles((prev) => prev.filter((item) => item.id !== id));
  };

  const updateItem = (id: string, patch: Partial<UploadItem>) => {
    setUploadedFiles((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  const uploadItem = async (item: UploadItem) => {
    updateItem(item.id, { status: "uploading", progress: 0 });
    try {
      await documentApi.upload(item.file, (progress) => {
        updateItem(item.id, { progress, status: "uploading" });
      });
      updateItem(item.id, { status: "uploaded", progress: 100 });
      return true;
    } catch (error) {
      updateItem(item.id, { status: "failed" });
      return false;
    }
  };

  const handleUpload = async () => {
    const queue = uploadedFiles.filter((item) => item.status === "queued" || item.status === "failed");
    if (queue.length === 0) return;

    setIsUploading(true);
    let successCount = 0;
    let failureCount = 0;

    for (const item of queue) {
      const ok = await uploadItem(item);
      if (ok) {
        successCount += 1;
      } else {
        failureCount += 1;
      }
    }

    setIsUploading(false);

    if (successCount > 0) {
      toast.success(`${successCount} document(s) uploaded successfully!`);
      onSuccess?.();
    }

    if (failureCount === 0) {
      onClose();
      setUploadedFiles([]);
    } else if (successCount === 0) {
      toast.error("Upload failed. Retry the failed files.");
    }
  };

  const handleRetry = async (item: UploadItem) => {
    setIsUploading(true);
    const ok = await uploadItem(item);
    setIsUploading(false);
    if (ok) {
      toast.success(`${item.file.name} uploaded successfully`);
      onSuccess?.();
    } else {
      toast.error(`Retry failed for ${item.file.name}`);
    }
  };

  const pendingCount = uploadedFiles.filter((item) => item.status !== "uploaded").length;

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

            <input
              ref={inputRef}
              type="file"
              accept=".pdf"
              multiple
              onChange={handleFileSelect}
              className="hidden"
            />

            <h2 className="text-2xl font-bold text-[var(--foreground)] mb-6">Upload Documents</h2>

            <div className="flex-1 overflow-y-auto pr-2 pb-2">
              <button
                type="button"
                onClick={openFilePicker}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`w-full border-2 border-dashed rounded-xl p-8 text-center transition-all ${
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
                <span className="px-6 py-2.5 study-button-primary rounded-lg inline-block font-medium">
                  Browse Files
                </span>
                <p className="text-xs text-[var(--muted-foreground)] mt-4">
                  Multiple files allowed. Max 10MB per file.
                </p>
              </button>

              {uploadedFiles.length > 0 && (
                <div className="mt-6 space-y-3">
                  <h3 className="text-sm font-semibold text-[var(--foreground-soft)]">
                    Selected Files ({uploadedFiles.length})
                  </h3>
                  <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                    {uploadedFiles.map((item) => (
                      <div key={item.id} className="p-3 study-panel-quiet rounded-lg">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center space-x-3 overflow-hidden">
                            <FileText className="w-6 h-6 text-[var(--accent-primary)] flex-shrink-0" />
                            <div className="truncate">
                              <p className="text-sm font-medium text-[var(--foreground)] truncate">{item.file.name}</p>
                              <p className="text-xs text-[var(--muted-foreground)]">
                                {(item.file.size / 1024 / 1024).toFixed(2)} MB
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {item.status === "failed" ? (
                              <button
                                onClick={() => handleRetry(item)}
                                className="p-1.5 rounded-md study-button-secondary"
                                disabled={isUploading}
                              >
                                <RotateCcw className="w-4 h-4" />
                              </button>
                            ) : null}
                            <button
                              onClick={() => removeFile(item.id)}
                              className="p-1 rounded-md text-[var(--muted-foreground)] hover:bg-[var(--hover-tint)] hover:text-[var(--weak)] transition-colors"
                              disabled={item.status === "uploading"}
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                        <div className="mt-3">
                          <div className="h-2 rounded-full bg-[var(--surface-3)] overflow-hidden">
                            <div
                              className={`h-full transition-all ${
                                item.status === "failed" ? "bg-[var(--weak)]" : "bg-[var(--accent-primary)]"
                              }`}
                              style={{ width: `${item.progress}%` }}
                            />
                          </div>
                          <div className="mt-1 text-xs text-[var(--muted-foreground)]">
                            {item.status === "uploaded" && "Uploaded"}
                            {item.status === "uploading" && `Uploading... ${item.progress}%`}
                            {item.status === "failed" && "Upload failed. Retry available."}
                            {item.status === "queued" && "Ready to upload"}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {uploadedFiles.length > 0 && (
              <button
                onClick={handleUpload}
                disabled={isUploading || pendingCount === 0}
                className="w-full mt-6 px-6 py-3 study-button-primary rounded-xl font-medium flex items-center justify-center space-x-2"
              >
                <span>
                  {isUploading ? "Uploading..." : pendingCount ? `Upload ${pendingCount} Pending File${pendingCount !== 1 ? "s" : ""}` : "All files uploaded"}
                </span>
              </button>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
