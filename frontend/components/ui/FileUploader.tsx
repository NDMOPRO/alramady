"use client";

import React, { useState, useCallback } from "react";
import { useDropzone, type Accept } from "react-dropzone";
import {
  Upload,
  File,
  X,
  CheckCircle,
  AlertCircle,
  Loader2,
} from "lucide-react";

interface UploadedFile {
  id: string;
  file: File;
  progress: number;
  status: "pending" | "uploading" | "success" | "error";
  error?: string;
}

interface FileUploaderProps {
  accept?: Accept;
  maxFiles?: number;
  maxSize?: number;
  onUpload?: (files: File[]) => void | Promise<void>;
  label?: string;
  labelAr?: string;
  description?: string;
  descriptionAr?: string;
}

export default function FileUploader({
  accept,
  maxFiles = 5,
  maxSize = 50 * 1024 * 1024,
  onUpload,
  label = "Upload Files",
  labelAr = "رفع الملفات",
  description = "Drag and drop files here, or click to browse",
  descriptionAr = "اسحب الملفات وأفلتها هنا، أو انقر للتصفح",
}: FileUploaderProps) {
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      const newFiles: UploadedFile[] = acceptedFiles.map((file) => ({
        id: `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
        file,
        progress: 0,
        status: "pending" as const,
      }));

      setUploadedFiles((prev) => [...prev, ...newFiles]);

      if (onUpload) {
        setIsUploading(true);

        // Simulate progress for each file
        for (const uf of newFiles) {
          setUploadedFiles((prev) =>
            prev.map((f) =>
              f.id === uf.id ? { ...f, status: "uploading", progress: 0 } : f
            )
          );

          // Simulate progressive upload
          const progressInterval = setInterval(() => {
            setUploadedFiles((prev) =>
              prev.map((f) =>
                f.id === uf.id && f.progress < 90
                  ? { ...f, progress: f.progress + 10 }
                  : f
              )
            );
          }, 200);

          try {
            await onUpload([uf.file]);
            clearInterval(progressInterval);
            setUploadedFiles((prev) =>
              prev.map((f) =>
                f.id === uf.id
                  ? { ...f, status: "success", progress: 100 }
                  : f
              )
            );
          } catch (err) {
            clearInterval(progressInterval);
            setUploadedFiles((prev) =>
              prev.map((f) =>
                f.id === uf.id
                  ? {
                      ...f,
                      status: "error",
                      error:
                        err instanceof Error
                          ? err.message
                          : "Upload failed",
                    }
                  : f
              )
            );
          }
        }

        setIsUploading(false);
      } else {
        // If no onUpload handler, mark all as success immediately
        setUploadedFiles((prev) =>
          prev.map((f) =>
            newFiles.find((nf) => nf.id === f.id)
              ? { ...f, status: "success", progress: 100 }
              : f
          )
        );
      }
    },
    [onUpload]
  );

  const removeFile = (id: string) => {
    setUploadedFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const { getRootProps, getInputProps, isDragActive, fileRejections } =
    useDropzone({
      onDrop,
      accept,
      maxFiles,
      maxSize,
      disabled: isUploading,
    });

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  return (
    <div className="w-full">
      <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
        {labelAr}
      </label>

      {/* Drop zone */}
      <div
        {...getRootProps()}
        className={`
          cursor-pointer rounded-xl border-2 border-dashed p-8 text-center transition-colors
          ${
            isDragActive
              ? "border-rasid-500 bg-rasid-50 dark:bg-rasid-950/20"
              : "border-gray-300 bg-gray-50 hover:border-rasid-400 hover:bg-gray-100 dark:border-gray-600 dark:bg-gray-800 dark:hover:border-rasid-500"
          }
          ${isUploading ? "pointer-events-none opacity-60" : ""}
        `}
      >
        <input {...getInputProps({ className: "hidden", "aria-label": labelAr })} />
        <div className="flex flex-col items-center gap-3">
          <div
            className={`rounded-full p-3 ${
              isDragActive
                ? "bg-rasid-100 dark:bg-rasid-900/30"
                : "bg-gray-200 dark:bg-gray-700"
            }`}
          >
            <Upload
              className={`h-6 w-6 ${
                isDragActive
                  ? "text-rasid-600"
                  : "text-gray-400 dark:text-gray-500"
              }`}
            />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {descriptionAr}
            </p>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {`الحد الأقصى: ${maxFiles} ملفات، ${formatFileSize(maxSize)} لكل ملف`}
            </p>
          </div>
          <div className="inline-flex items-center rounded-full border border-gray-200 bg-white px-4 py-2 text-xs font-bold text-gray-700 shadow-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200">
            اختر الملفات
          </div>
        </div>
      </div>

      {/* Rejections */}
      {fileRejections.length > 0 && (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-900/20">
          {fileRejections.map(({ file, errors }) => (
            <div key={file.name} className="text-xs text-red-700 dark:text-red-400">
              <span className="font-medium">{file.name}:</span>{" "}
              {errors.map((e) => e.message).join(", ")}
            </div>
          ))}
        </div>
      )}

      {/* File list */}
      {uploadedFiles.length > 0 && (
        <div className="mt-4 space-y-2">
          {uploadedFiles.map((uf) => (
            <div
              key={uf.id}
              className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800"
            >
              <File className="h-5 w-5 shrink-0 text-gray-400" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-700 dark:text-gray-300">
                  {uf.file.name}
                </p>
                <p className="text-xs text-gray-400">
                  {formatFileSize(uf.file.size)}
                </p>
                {uf.status === "uploading" && (
                  <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                    <div
                      className="h-full rounded-full bg-rasid-600 transition-all duration-300"
                      style={{ width: `${uf.progress}%` }}
                    />
                  </div>
                )}
                {uf.status === "error" && (
                  <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                    {uf.error}
                  </p>
                )}
              </div>
              <div className="shrink-0">
                {uf.status === "uploading" && (
                  <Loader2 className="h-4 w-4 animate-spin text-rasid-600" />
                )}
                {uf.status === "success" && (
                  <CheckCircle className="h-4 w-4 text-green-500" />
                )}
                {uf.status === "error" && (
                  <AlertCircle className="h-4 w-4 text-red-500" />
                )}
                {(uf.status === "pending" || uf.status === "success" || uf.status === "error") && (
                  <button
                    onClick={() => removeFile(uf.id)}
                    className="ms-2 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
