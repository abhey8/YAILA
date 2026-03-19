import { X, Upload, FileText, CheckCircle } from "lucide-react";
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
      console.error("Upload failed:", error);
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
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
          />
          
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            onClick={(e) => e.stopPropagation()}
            className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg p-6 max-h-[90vh] flex flex-col"
          >
            <button
              onClick={onClose}
              className="absolute top-4 right-4 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
            </button>

            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Upload Documents</h2>

            <div className="flex-1 overflow-y-auto pr-2 pb-2">
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`border-2 border-dashed rounded-xl p-8 text-center transition-all ${
                  isDragging
                    ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30"
                    : "border-gray-300 dark:border-gray-600 hover:border-indigo-400"
                }`}
              >
                 <Upload className="w-12 h-12 text-gray-400 dark:text-gray-500 mx-auto mb-4" />
                 <p className="text-gray-700 dark:text-gray-300 font-medium mb-2">
                   Drag and drop your PDFs here
                 </p>
                 <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">or</p>
                 <label className="inline-block">
                   <input
                     type="file"
                     accept=".pdf"
                     multiple
                     onChange={handleFileSelect}
                     className="hidden"
                   />
                   <span className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg cursor-pointer transition-colors inline-block font-medium">
                     Browse Files
                   </span>
                 </label>
                 <p className="text-xs text-gray-500 dark:text-gray-400 mt-4">Multiple files allowed. Max 10MB per file.</p>
              </div>

              {uploadedFiles.length > 0 && (
                <div className="mt-6 space-y-3">
                  <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Selected Files ({uploadedFiles.length})</h3>
                  <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                    {uploadedFiles.map((f, i) => (
                       <div key={i} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-100 dark:border-gray-600">
                         <div className="flex items-center space-x-3 overflow-hidden">
                           <FileText className="w-6 h-6 text-indigo-500 flex-shrink-0" />
                           <div className="truncate">
                             <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{f.name}</p>
                             <p className="text-xs text-gray-500 dark:text-gray-400">{(f.size / 1024 / 1024).toFixed(2)} MB</p>
                           </div>
                         </div>
                         <button onClick={() => removeFile(i)} className="p-1 hover:bg-white dark:hover:bg-gray-600 rounded-md text-gray-400 hover:text-red-500 transition-colors">
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
                className="w-full mt-6 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 dark:disabled:bg-gray-700 text-white rounded-xl font-medium transition-colors flex items-center justify-center space-x-2"
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
