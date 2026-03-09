'use client';

import React, { useState, useCallback, useRef } from 'react';
import { Upload, X, FileIcon, CheckCircle } from 'lucide-react';

interface UploadedFile {
  file: File;
  progress: number;
  status: 'uploading' | 'done' | 'error';
  error?: string;
}

interface FileUploadProps {
  accept?: string;
  multiple?: boolean;
  maxSize?: number; // in MB
  onUpload?: (files: File[]) => Promise<void>;
  label?: string;
  description?: string;
  className?: string;
}

export default function FileUpload({
  accept,
  multiple = false,
  maxSize = 50,
  onUpload,
  label,
  description,
  className = '',
}: FileUploadProps) {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(
    async (fileList: FileList | null) => {
      if (!fileList) return;
      const newFiles: UploadedFile[] = [];

      for (let i = 0; i < fileList.length; i++) {
        const file = fileList[i];
        if (file.size > maxSize * 1024 * 1024) {
          newFiles.push({
            file,
            progress: 0,
            status: 'error',
            error: `File exceeds ${maxSize}MB limit`,
          });
        } else {
          newFiles.push({ file, progress: 0, status: 'uploading' });
        }
      }

      setFiles((prev) => (multiple ? [...prev, ...newFiles] : newFiles));

      const validFiles = newFiles
        .filter((f) => f.status !== 'error')
        .map((f) => f.file);

      if (validFiles.length > 0 && onUpload) {
        try {
          // Simulate progress
          const interval = setInterval(() => {
            setFiles((prev) =>
              prev.map((f) =>
                f.status === 'uploading' && f.progress < 90
                  ? { ...f, progress: f.progress + 10 }
                  : f
              )
            );
          }, 200);

          await onUpload(validFiles);

          clearInterval(interval);
          setFiles((prev) =>
            prev.map((f) =>
              f.status === 'uploading' ? { ...f, progress: 100, status: 'done' } : f
            )
          );
        } catch {
          setFiles((prev) =>
            prev.map((f) =>
              f.status === 'uploading'
                ? { ...f, status: 'error', error: 'Upload failed' }
                : f
            )
          );
        }
      }
    },
    [maxSize, multiple, onUpload]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      handleFiles(e.dataTransfer.files);
    },
    [handleFiles]
  );

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <div className={className}>
      {label && (
        <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
          {label}
        </label>
      )}

      {/* Drop zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`
          flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 transition-colors
          ${isDragging
            ? 'border-rasid-500 bg-rasid-50 dark:bg-rasid-900/10'
            : 'border-gray-300 bg-gray-50 hover:border-gray-400 dark:border-gray-600 dark:bg-gray-800/50'
          }
        `}
      >
        <Upload className="mb-3 h-10 w-10 text-gray-400" />
        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
          {description || 'Drag & drop files here, or click to browse'}
        </p>
        <p className="mt-1 text-xs text-gray-400">
          Max file size: {maxSize}MB {accept && `| Accepted: ${accept}`}
        </p>
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          onChange={(e) => handleFiles(e.target.files)}
          className="hidden"
        />
      </div>

      {/* File list */}
      {files.length > 0 && (
        <div className="mt-3 space-y-2">
          {files.map((f, idx) => (
            <div
              key={`${f.file.name}-${idx}`}
              className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800"
            >
              <FileIcon className="h-5 w-5 shrink-0 text-gray-400" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-700 dark:text-gray-300">
                  {f.file.name}
                </p>
                <p className="text-xs text-gray-400">
                  {(f.file.size / 1024 / 1024).toFixed(2)} MB
                </p>
                {f.status === 'uploading' && (
                  <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                    <div
                      className="h-full rounded-full bg-rasid-600 transition-all"
                      style={{ width: `${f.progress}%` }}
                    />
                  </div>
                )}
                {f.status === 'error' && (
                  <p className="mt-0.5 text-xs text-red-500">{f.error}</p>
                )}
              </div>
              {f.status === 'done' && <CheckCircle className="h-5 w-5 shrink-0 text-green-500" />}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  removeFile(idx);
                }}
                className="shrink-0 rounded p-1 text-gray-400 hover:text-gray-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
