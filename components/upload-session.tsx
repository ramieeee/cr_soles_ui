"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

import { useSnackbar } from "@/components/snackbar";
import { uploadDocument } from "@/lib/paper-review-api";

type UploadStatus = "idle" | "uploading" | "success" | "error";

type UploadSessionContextValue = {
  status: UploadStatus;
  message: string;
  vllmBaseUrl: string;
  vllmPort: string;
  setVllmBaseUrl: (value: string) => void;
  setVllmPort: (value: string) => void;
  startUpload: (params: {
    pdf: File;
    vllmBaseUrl?: string;
    vllmPort?: string;
  }) => Promise<void>;
};

const UploadSessionContext = createContext<UploadSessionContextValue | null>(null);

export function UploadSessionProvider({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const [status, setStatus] = useState<UploadStatus>("idle");
  const [message, setMessage] = useState("");
  const [vllmBaseUrl, setVllmBaseUrl] = useState("");
  const [vllmPort, setVllmPort] = useState("");
  const { showSnackbar } = useSnackbar();

  const startUpload = useCallback(
    async (params: {
      pdf: File;
      vllmBaseUrl?: string;
      vllmPort?: string;
    }) => {
      setStatus("uploading");
      setMessage("Uploading to Python server...");

      try {
        const payload = await uploadDocument(params);
        setStatus("success");
        setMessage(
          typeof payload === "string" ? payload : JSON.stringify(payload, null, 2),
        );
        showSnackbar("PDF uploaded and queued for extraction.", "success");
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Upload failed.";
        setStatus("error");
        setMessage(errorMessage);
        showSnackbar(errorMessage, "error");
      }
    },
    [showSnackbar],
  );

  const value = useMemo(
    () => ({
      status,
      message,
      vllmBaseUrl,
      vllmPort,
      setVllmBaseUrl,
      setVllmPort,
      startUpload,
    }),
    [status, message, vllmBaseUrl, vllmPort, startUpload],
  );

  return (
    <UploadSessionContext.Provider value={value}>
      {children}
    </UploadSessionContext.Provider>
  );
}

export const useUploadSession = () => {
  const context = useContext(UploadSessionContext);
  if (!context) {
    throw new Error("useUploadSession must be used inside UploadSessionProvider");
  }
  return context;
};

export function UploadStatusCard() {
  const { status, message } = useUploadSession();

  const toneClass =
    status === "error"
      ? "text-[#ffdad6] bg-[#7f1d1d]/35"
      : status === "success"
        ? "text-[#bfdbfe] bg-[#1f2937]"
        : status === "uploading"
          ? "text-[#93c5fd] bg-[#1f2937]"
          : "text-[#9ca3af] bg-[#111827]";

  const statusLabel =
    status === "idle"
      ? "Idle"
      : status === "uploading"
        ? "Uploading"
        : status === "success"
          ? "Success"
          : "Error";

  return (
    <div
      className={`mx-3 min-w-[10.75rem] rounded-lg p-3 transition-colors duration-200 ease-out ${
        status === "uploading" ? "animate-pulse" : ""
      } ${toneClass}`}
    >
      <p className="soales-mono uppercase">Upload Status</p>
      <p className="mt-2 text-sm font-medium tracking-[-0.01em]">{statusLabel}</p>
      {status === "error" && message ? (
        <p className="mt-1 line-clamp-2 text-xs leading-5 opacity-80">{message}</p>
      ) : null}
    </div>
  );
}
