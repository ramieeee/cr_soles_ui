"use client";

import { useRef, useState } from "react";
import styles from "./page.module.css";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000";
const PROCESS_PATH =
  process.env.NEXT_PUBLIC_PROCESS_PATH ?? "/api/v1/document/process";

type UploadStatus = "idle" | "uploading" | "success" | "error";

const isPdfFile = (file: File) => {
  return (
    file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")
  );
};

export default function Home() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [prompt, setPrompt] = useState("Describe the document");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [status, setStatus] = useState<UploadStatus>("idle");
  const [message, setMessage] = useState("");
  const [isDragging, setIsDragging] = useState(false);

  const handleFile = (file: File | null) => {
    if (!file) return;
    if (!isPdfFile(file)) {
      setStatus("error");
      setMessage("Only PDF files are supported.");
      setSelectedFile(null);
      return;
    }
    setSelectedFile(file);
    setStatus("idle");
    setMessage("");
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files?.[0] ?? null;
    handleFile(file);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedFile) {
      setStatus("error");
      setMessage("Add a PDF before uploading.");
      return;
    }

    const formData = new FormData();
    formData.append("pdf", selectedFile);
    formData.append("prompt", prompt || "Describe the document");

    setStatus("uploading");
    setMessage("Uploading to the processing API...");

    try {
      const response = await fetch(`${API_BASE}${PROCESS_PATH}`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || "Upload failed.");
      }

      const contentType = response.headers.get("content-type") || "";
      const payload = contentType.includes("application/json")
        ? JSON.stringify(await response.json(), null, 2)
        : await response.text();

      setStatus("success");
      setMessage(payload || "Upload completed.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Upload failed.";
      setStatus("error");
      setMessage(message);
    }
  };

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <header className={styles.header}>
          <p className={styles.kicker}>CR Soles</p>
          <h1>Send a PDF straight to your processing API.</h1>
          <p className={styles.subhead}>
            Drag and drop a file, add a prompt, and we will post it to the
            backend running on localhost:8000.
          </p>
        </header>

        <section className={styles.card}>
          <form className={styles.form} onSubmit={handleSubmit}>
            <div
              className={`${styles.dropzone} ${
                isDragging ? styles.dragging : ""
              }`}
              onDragOver={(event) => {
                event.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              role="button"
              tabIndex={0}
              onClick={() => inputRef.current?.click()}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  inputRef.current?.click();
                }
              }}
            >
              <input
                ref={inputRef}
                className={styles.fileInput}
                type="file"
                accept="application/pdf"
                onChange={(event) =>
                  handleFile(event.target.files?.[0] ?? null)
                }
              />
              <div className={styles.dropContent}>
                <div className={styles.dropIcon} aria-hidden="true">
                  <span />
                </div>
                <div>
                  <p className={styles.dropTitle}>Drop your PDF here</p>
                  <p className={styles.dropHint}>
                    or click to browse from your device
                  </p>
                </div>
              </div>
            </div>

            <div className={styles.meta}>
              <div>
                <p className={styles.metaLabel}>Selected file</p>
                <p className={styles.metaValue}>
                  {selectedFile ? selectedFile.name : "No file chosen yet."}
                </p>
              </div>
              <span className={styles.badge}>PDF only</span>
            </div>

            <div className={styles.controls}>
              <label className={styles.field}>
                <span>Prompt</span>
                <input
                  type="text"
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  placeholder="Describe the document"
                />
              </label>
              <button
                className={styles.button}
                type="submit"
                disabled={status === "uploading"}
              >
                {status === "uploading" ? "Uploading..." : "Upload PDF"}
              </button>
            </div>
          </form>

          <div
            className={`${styles.status} ${
              status === "error"
                ? styles.error
                : status === "success"
                ? styles.success
                : ""
            }`}
            role="status"
          >
            {message || "Your response will appear here after upload."}
          </div>
        </section>
      </main>
    </div>
  );
}
