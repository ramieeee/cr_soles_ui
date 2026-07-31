"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { LoadingSignal } from "@/components/loading-signal";
import { useSnackbar } from "@/components/snackbar";
import {
  fetchPaperExtraction,
  fetchPapers,
  type ExtractionRow,
  type PaperRow,
  updatePaper,
} from "@/lib/paper-review-api";

type TableManagerProps = {
  title: string;
  description: string;
};

const PAGE_SIZE_OPTIONS = [30, 50, 100] as const;
type PageSize = (typeof PAGE_SIZE_OPTIONS)[number];

const VISIBLE_KEYS = [
  "title",
  "authors",
  "journal",
  "year",
  "abstract",
  "pdf_url",
  "source_type",
  "extraction_completed_at",
] as const;

const DATE_KEYS: ReadonlySet<string> = new Set([
  "extraction_completed_at",
  "created_at",
]);

const EXTRACTION_SUMMARY_FIELDS: readonly {
  key: string;
  label: string;
}[] = [
  { key: "extraction_version", label: "Version" },
  { key: "created_at", label: "Extracted at" },
  { key: "human_review_status", label: "Review status" },
  { key: "overall_confidence", label: "Overall confidence" },
  { key: "population_description", label: "Population" },
  { key: "country", label: "Country" },
  { key: "sample_size", label: "Sample size" },
  { key: "study_design", label: "Study design" },
  { key: "main_finding_summary", label: "Main finding" },
];

type EditForm = {
  title: string;
  authorsText: string;
  journal: string;
  year: string;
  abstract: string;
  pdfUrl: string;
  sourceType: string;
};

const EMPTY_EDIT_FORM: EditForm = {
  title: "",
  authorsText: "",
  journal: "",
  year: "",
  abstract: "",
  pdfUrl: "",
  sourceType: "",
};

const toCellText = (value: unknown) => {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "string") return value;
  return JSON.stringify(value);
};

const formatDateText = (value: unknown) => {
  if (typeof value !== "string" || !value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const toDisplayText = (column: string, value: unknown) =>
  DATE_KEYS.has(column) ? formatDateText(value) : toCellText(value);

const toEditForm = (row: PaperRow): EditForm => {
  const authors =
    Array.isArray(row.authors) &&
    row.authors.every((item) => typeof item === "string")
      ? (row.authors as string[])
      : [];

  return {
    title: typeof row.title === "string" ? row.title : "",
    authorsText: authors.join("\n"),
    journal: typeof row.journal === "string" ? row.journal : "",
    year:
      row.year === null || row.year === undefined
        ? ""
        : typeof row.year === "number"
          ? String(row.year)
          : String(row.year),
    abstract: typeof row.abstract === "string" ? row.abstract : "",
    pdfUrl: typeof row.pdf_url === "string" ? row.pdf_url : "",
    sourceType: typeof row.source_type === "string" ? row.source_type : "",
  };
};

export default function PapersTableManager({
  title,
  description,
}: TableManagerProps) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSize>(30);
  const [rows, setRows] = useState<PaperRow[]>([]);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [detailIndex, setDetailIndex] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmSaveOpen, setConfirmSaveOpen] = useState(false);
  const [pendingSaveRow, setPendingSaveRow] = useState<PaperRow | null>(null);
  const [extraction, setExtraction] = useState<ExtractionRow | null>(null);
  const [extractionLoading, setExtractionLoading] = useState(false);
  const [extractionError, setExtractionError] = useState("");
  const saveInFlightRef = useRef(false);
  const { showSnackbar } = useSnackbar();
  const [editForm, setEditForm] = useState<EditForm>(EMPTY_EDIT_FORM);

  const columns = useMemo(() => Array.from(VISIBLE_KEYS), []);

  const load = async (nextPage = page, nextPageSize = pageSize) => {
    setLoading(true);
    setError("");

    try {
      const offset = (nextPage - 1) * nextPageSize;
      const payload = await fetchPapers(offset, nextPageSize);
      setRows(payload);
      setHasNextPage(payload.length === nextPageSize);
      setDetailIndex(null);
    } catch (fetchError) {
      setError(
        fetchError instanceof Error ? fetchError.message : "Failed to fetch",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load(page, pageSize);
    // Reload only when page or page size changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize]);

  const onPageSizeChange = (value: PageSize) => {
    setPageSize(value);
    setPage(1);
  };

  useEffect(() => {
    if (detailIndex === null && !confirmSaveOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (confirmSaveOpen) {
        if (!saving) {
          setConfirmSaveOpen(false);
          setPendingSaveRow(null);
        }
        return;
      }
      setDetailIndex(null);
      setExtraction(null);
      setExtractionError("");
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [detailIndex, confirmSaveOpen, saving]);

  const openDetail = (index: number) => {
    const row = rows[index];
    setDetailIndex(index);
    setEditForm(toEditForm(row));
    setExtraction(null);
    setExtractionError("");

    const paperId = row.id ? String(row.id) : "";
    if (!paperId) {
      setExtractionError("Paper id is missing.");
      return;
    }

    setExtractionLoading(true);
    fetchPaperExtraction(paperId)
      .then((payload) => setExtraction(payload))
      .catch((fetchError) =>
        setExtractionError(
          fetchError instanceof Error
            ? fetchError.message
            : "Failed to fetch extraction",
        ),
      )
      .finally(() => setExtractionLoading(false));
  };

  const closeDetail = () => {
    setDetailIndex(null);
    setExtraction(null);
    setExtractionError("");
  };

  const executeSave = async (row: PaperRow) => {
    if (saveInFlightRef.current) return;
    saveInFlightRef.current = true;
    setSaving(true);
    try {
      await updatePaper(row);
      showSnackbar("Paper updated successfully.", "success");
      await load();
    } catch (saveError) {
      const message =
        saveError instanceof Error ? saveError.message : "Update failed";
      setError(message);
      showSnackbar(message, "error");
    } finally {
      saveInFlightRef.current = false;
      setSaving(false);
    }
  };

  const save = async () => {
    if (detailIndex === null) return;

    const source = rows[detailIndex];
    const nextRow: PaperRow = {
      ...source,
      title: editForm.title,
      authors: editForm.authorsText
        .split("\n")
        .map((author) => author.trim())
        .filter(Boolean),
      journal: editForm.journal,
      year: editForm.year.trim() ? Number(editForm.year) : null,
      abstract: editForm.abstract,
      pdf_url: editForm.pdfUrl.trim() || null,
      source_type: editForm.sourceType,
    };

    setPendingSaveRow(nextRow);
    setConfirmSaveOpen(true);
  };

  const confirmSave = async () => {
    if (!pendingSaveRow) return;
    await executeSave(pendingSaveRow);
    setConfirmSaveOpen(false);
    setPendingSaveRow(null);
  };

  const cancelSaveConfirm = () => {
    setConfirmSaveOpen(false);
    setPendingSaveRow(null);
  };

  const rangeStart = rows.length ? (page - 1) * pageSize + 1 : 0;
  const rangeEnd = (page - 1) * pageSize + rows.length;

  const detailRow = detailIndex !== null ? rows[detailIndex] : null;
  const rawOutputJson =
    extraction && typeof extraction.raw_output_json === "object"
      ? extraction.raw_output_json
      : null;

  return (
    <section className="grid gap-6">
      {loading ? (
        <LoadingSignal
          label="Fetching Records"
          detail="Loading papers from the review API..."
        />
      ) : null}

      <header className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-end">
        <div>
          <h1 className="soales-subheading mt-3 text-3xl tracking-[-0.02em] text-[#dae2fd] md:text-5xl">
            {title}
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-[#ccc3d8] md:text-base">
            {description}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="grid gap-1 text-sm">
            <span className="soales-mono text-[10px] uppercase text-[#ccc3d8]">
              Rows per page
            </span>
            <select
              value={pageSize}
              onChange={(event) =>
                onPageSizeChange(Number(event.target.value) as PageSize)
              }
              disabled={loading}
              className="soales-input w-28 cursor-pointer appearance-none disabled:opacity-70"
            >
              {PAGE_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
          <div className="soales-panel px-5 py-4">
            <p className="soales-subheading text-3xl text-[#dae2fd]">
              {rows.length}
            </p>
            <p className="soales-mono mt-2 text-[10px] uppercase text-[#ccc3d8]">
              Loaded Rows
            </p>
          </div>
        </div>
      </header>

      {error ? (
        <p className="ui-fade-in rounded bg-[#93000a]/20 px-3 py-2 text-sm text-[#ffdad6]">
          {error}
        </p>
      ) : null}

      <div className="soales-panel overflow-x-auto">
        <table className="soales-table">
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column}>{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr
                key={`${rowIndex}-${toCellText(row.id) || toCellText(row.idx)}`}
                onClick={() => openDetail(rowIndex)}
                className="cursor-pointer transition-colors duration-150 ease-out hover:bg-[#111827]"
              >
                {columns.map((column) => (
                  <td key={column}>
                    <div
                      className="soales-table-cell"
                      title={toDisplayText(column, row[column])}
                    >
                      {toDisplayText(column, row[column])}
                    </div>
                  </td>
                ))}
              </tr>
            ))}
            {!loading && !rows.length ? (
              <tr>
                <td
                  colSpan={Math.max(columns.length, 1)}
                  className="px-3 py-5 text-center text-[#ccc3d8]"
                >
                  No papers found.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="soales-mono text-[10px] uppercase tracking-widest text-[#ccc3d8]">
          {rows.length ? `Showing ${rangeStart}–${rangeEnd}` : "No rows"}
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPage((prev) => Math.max(1, prev - 1))}
            disabled={loading || page <= 1}
            className="soales-button-secondary disabled:opacity-40"
          >
            Previous
          </button>
          <span className="soales-mono min-w-20 px-2 text-center text-xs uppercase text-[#93c5fd]">
            Page {page}
          </span>
          <button
            type="button"
            onClick={() => setPage((prev) => prev + 1)}
            disabled={loading || !hasNextPage}
            className="soales-button-secondary disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>

      {detailRow
        ? createPortal(
            <div
              className="ui-fade-in fixed inset-0 z-40 grid place-items-center bg-[#060e20]/50 px-4 py-6 backdrop-blur-[2px]"
              onClick={closeDetail}
            >
              <div
                className="soales-panel ui-pop flex max-h-[88vh] w-full max-w-6xl flex-col overflow-hidden"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="flex items-start justify-between gap-4 border-b border-[#1f2937] bg-[#1f2937]/50 px-6 py-4">
                  <div className="min-w-0">
                    <p className="soales-mono text-[10px] uppercase tracking-widest text-[#93c5fd]">
                      Paper Detail
                    </p>
                    <h2 className="mt-1 truncate text-lg text-[#dae2fd]">
                      {toCellText(detailRow.title) || "Untitled paper"}
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={closeDetail}
                    aria-label="Close detail"
                    className="material-symbols-outlined shrink-0 text-[#ccc3d8] transition-colors hover:text-[#dae2fd]"
                  >
                    close
                  </button>
                </div>

                <div className="grid min-h-0 flex-1 gap-0 overflow-y-auto md:auto-rows-fr md:grid-cols-2 md:overflow-hidden">
                  <section className="grid content-start gap-4 border-b border-[#1f2937] p-6 md:border-b-0 md:border-r md:overflow-y-auto">
                    <p className="soales-mono uppercase text-[#93c5fd]">
                      Bibliographic Info
                    </p>

                    <label className="grid gap-1 text-sm">
                      <span className="text-[#ccc3d8]">title</span>
                      <input
                        type="text"
                        value={editForm.title}
                        onChange={(event) =>
                          setEditForm((prev) => ({
                            ...prev,
                            title: event.target.value,
                          }))
                        }
                        className="soales-input"
                      />
                    </label>

                    <label className="grid gap-1 text-sm">
                      <span className="text-[#ccc3d8]">
                        authors (one per line)
                      </span>
                      <textarea
                        value={editForm.authorsText}
                        onChange={(event) =>
                          setEditForm((prev) => ({
                            ...prev,
                            authorsText: event.target.value,
                          }))
                        }
                        className="soales-input min-h-20 text-xs"
                      />
                    </label>

                    <label className="grid gap-1 text-sm">
                      <span className="text-[#ccc3d8]">journal</span>
                      <input
                        type="text"
                        value={editForm.journal}
                        onChange={(event) =>
                          setEditForm((prev) => ({
                            ...prev,
                            journal: event.target.value,
                          }))
                        }
                        className="soales-input"
                      />
                    </label>

                    <label className="grid gap-1 text-sm">
                      <span className="text-[#ccc3d8]">year</span>
                      <input
                        type="number"
                        value={editForm.year}
                        onChange={(event) =>
                          setEditForm((prev) => ({
                            ...prev,
                            year: event.target.value,
                          }))
                        }
                        className="soales-input"
                      />
                    </label>

                    <label className="grid gap-1 text-sm">
                      <span className="text-[#ccc3d8]">abstract</span>
                      <textarea
                        value={editForm.abstract}
                        onChange={(event) =>
                          setEditForm((prev) => ({
                            ...prev,
                            abstract: event.target.value,
                          }))
                        }
                        className="soales-input min-h-32 text-xs"
                      />
                    </label>

                    <label className="grid gap-1 text-sm">
                      <span className="text-[#ccc3d8]">pdf_url</span>
                      <input
                        type="text"
                        value={editForm.pdfUrl}
                        onChange={(event) =>
                          setEditForm((prev) => ({
                            ...prev,
                            pdfUrl: event.target.value,
                          }))
                        }
                        className="soales-input"
                      />
                    </label>

                    <label className="grid gap-1 text-sm">
                      <span className="text-[#ccc3d8]">source_type</span>
                      <input
                        type="text"
                        value={editForm.sourceType}
                        onChange={(event) =>
                          setEditForm((prev) => ({
                            ...prev,
                            sourceType: event.target.value,
                          }))
                        }
                        className="soales-input"
                      />
                    </label>

                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={save}
                        disabled={saving}
                        className="soales-button-primary disabled:opacity-70"
                      >
                        {saving ? "Saving..." : "Save"}
                      </button>
                      <button
                        type="button"
                        onClick={closeDetail}
                        className="soales-button-secondary"
                      >
                        Close
                      </button>
                    </div>
                  </section>

                  <section className="grid content-start gap-4 p-6 md:overflow-y-auto">
                    <p className="soales-mono uppercase text-[#ffb95f]">
                      Extractions
                    </p>

                    {extractionLoading ? (
                      <p className="text-sm text-[#ccc3d8]">
                        Loading extraction...
                      </p>
                    ) : extractionError ? (
                      <p className="rounded bg-[#93000a]/20 px-3 py-2 text-sm text-[#ffdad6]">
                        {extractionError}
                      </p>
                    ) : extraction ? (
                      <>
                        <dl className="grid gap-3">
                          {EXTRACTION_SUMMARY_FIELDS.map(({ key, label }) => {
                            const value = extraction[key];
                            if (
                              value === null ||
                              value === undefined ||
                              value === ""
                            ) {
                              return null;
                            }
                            return (
                              <div key={key} className="grid gap-1">
                                <dt className="soales-mono text-[10px] uppercase tracking-widest text-[#ccc3d8]">
                                  {label}
                                </dt>
                                <dd className="text-sm leading-6 text-[#dae2fd]">
                                  {DATE_KEYS.has(key)
                                    ? formatDateText(value)
                                    : toCellText(value)}
                                </dd>
                              </div>
                            );
                          })}
                        </dl>

                        {rawOutputJson ? (
                          <div className="grid gap-1">
                            <p className="soales-mono text-[10px] uppercase tracking-widest text-[#ccc3d8]">
                              Raw output
                            </p>
                            <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded bg-[#01030b]/60 p-4 font-mono text-xs leading-5 text-[#dae2fd]">
                              {JSON.stringify(rawOutputJson, null, 2)}
                            </pre>
                          </div>
                        ) : null}
                      </>
                    ) : (
                      <p className="text-sm text-[#ccc3d8]">
                        No extraction found for this paper yet.
                      </p>
                    )}
                  </section>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      {confirmSaveOpen
        ? createPortal(
            <div className="ui-fade-in fixed inset-0 z-50 grid place-items-center bg-[#060e20]/25 px-4 backdrop-blur-[2px]">
              <div className="soales-panel ui-pop w-full max-w-md p-5">
                <p className="text-sm text-[#dae2fd]">
                  Approve the edited data?
                </p>
                <div className="mt-4 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={confirmSave}
                    disabled={saving}
                    className="soales-button-primary disabled:opacity-70"
                  >
                    {saving ? "Saving..." : "Approve"}
                  </button>
                  <button
                    type="button"
                    onClick={cancelSaveConfirm}
                    disabled={saving}
                    className="soales-button-secondary disabled:opacity-70"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </section>
  );
}
