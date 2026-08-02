export type PaperRow = Record<string, unknown>;
const EDITABLE_KEYS = [
  "title",
  "authors",
  "journal",
  "year",
  "abstract",
  "pdf_url",
  "source_type",
] as const;

const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000"
).replace(/\/+$/g, "");
const API_PREFIX = process.env.NEXT_PUBLIC_API_PREFIX ?? "/api/v1";

const joinPath = (...parts: string[]) => {
  const joined = parts
    .map((part) => part.trim().replace(/^\/+|\/+$/g, ""))
    .filter(Boolean)
    .join("/");
  return `/${joined}`;
};

const apiPath = (...parts: string[]) => joinPath(API_PREFIX, ...parts);

const UPLOAD_PATH = apiPath("multimodal_extraction", "extract");
const FETCH_PAPERS_PATH = apiPath("paper_review", "fetch", "papers");
const FETCH_EXTRACTION_PATH = apiPath("paper_review", "fetch", "extraction");
const UPDATE_PAPERS_PATH = apiPath("paper_review", "update", "paper");
const FETCH_JOBS_PATH = apiPath("jobs");
const FETCH_JOB_PATH = (jobId: string) => apiPath("jobs", jobId);

/** Absolute (http://...) or same-origin relative (/api/v1/...). */
const buildUrl = (path: string) => {
  const normalized = joinPath(path);
  return API_BASE_URL ? `${API_BASE_URL}${normalized}` : normalized;
};

const withQuery = (
  path: string,
  query: Record<string, string | number>,
): string => {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    params.set(key, String(value));
  });
  const qs = params.toString();
  const base = buildUrl(path);
  return qs ? `${base}?${qs}` : base;
};

const getWithQuery = async (
  path: string,
  query: Record<string, string | number>,
) => {
  const response = await fetch(withQuery(path, query), {
    method: "GET",
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  const contentType = response.headers.get("content-type") ?? "";
  return contentType.includes("application/json")
    ? response.json()
    : response.text();
};

const postForm = async (
  path: string,
  fields: Record<string, string | number | Blob>,
) => {
  const form = new FormData();
  Object.entries(fields).forEach(([key, value]) => {
    form.append(key, value instanceof Blob ? value : String(value));
  });

  const response = await fetch(buildUrl(path), {
    method: "POST",
    body: form,
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  const contentType = response.headers.get("content-type") ?? "";
  return contentType.includes("application/json")
    ? response.json()
    : response.text();
};

const postJsonWithQuery = async (
  path: string,
  query: Record<string, string | number>,
  body: unknown,
) => {
  const response = await fetch(withQuery(path, query), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  const contentType = response.headers.get("content-type") ?? "";
  return contentType.includes("application/json")
    ? response.json()
    : response.text();
};

const toRows = (payload: unknown): PaperRow[] => {
  if (Array.isArray(payload)) {
    return payload.filter(
      (row): row is PaperRow => typeof row === "object" && row !== null,
    );
  }

  if (payload && typeof payload === "object") {
    const objectPayload = payload as Record<string, unknown>;
    const candidates = [
      objectPayload.items,
      objectPayload.results,
      objectPayload.data,
    ];

    for (const candidate of candidates) {
      if (Array.isArray(candidate)) {
        return candidate.filter(
          (row): row is PaperRow => typeof row === "object" && row !== null,
        );
      }
    }
  }

  return [];
};

export const uploadDocument = async (params: {
  pdf: File;
  vllmBaseUrl?: string;
  vllmPort?: string;
}) => {
  const fields: Record<string, string | Blob> = {
    pdf: params.pdf,
  };
  const trimmedUrl = params.vllmBaseUrl?.trim();
  if (trimmedUrl) {
    fields.vllm_base_url = trimmedUrl;
  }
  const trimmedPort = params.vllmPort?.trim();
  if (trimmedPort) {
    fields.vllm_port = trimmedPort;
  }
  return postForm(UPLOAD_PATH, fields);
};

export const fetchPapers = async (offset: number, limit: number) => {
  const payload = await getWithQuery(FETCH_PAPERS_PATH, {
    offset,
    limit,
    table_type: "papers",
  });
  return toRows(payload);
};

export type ExtractionRow = {
  id?: string;
  paper_id?: string;
  run_id?: string | null;
  extraction_version?: string;
  is_current?: boolean;
  meets_target_criteria?: boolean | null;
  eligibility_confidence?: number | null;
  exclusion_reason?: string | null;
  brain_measure_present?: boolean | null;
  brain_measure_description?: string | null;
  brain_measure_category?: string | null;
  cognition_measure_present?: boolean | null;
  cognition_measure_description?: string | null;
  cognitive_domain?: string | null;
  moderator_present?: boolean | null;
  moderator_description?: string | null;
  moderator_category?: string | null;
  interaction_tested?: boolean | null;
  interaction_description?: string | null;
  sample_size?: number | null;
  population_description?: string | null;
  study_design?: string | null;
  country?: string | null;
  statistical_approach?: string | null;
  main_finding_summary?: string | null;
  overall_confidence?: number | null;
  human_review_status?: string;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  raw_output_json?: Record<string, unknown> | null;
  created_at?: string;
  updated_at?: string;
};

export const fetchPaperExtraction = async (
  paperId: string,
): Promise<ExtractionRow | null> => {
  const payload = await getWithQuery(FETCH_EXTRACTION_PATH, {
    paper_id: paperId,
  });
  if (payload && typeof payload === "object") {
    const extraction = (payload as Record<string, unknown>).extraction;
    if (extraction && typeof extraction === "object") {
      return extraction as ExtractionRow;
    }
  }
  return null;
};

export type JobRow = Record<string, unknown>;

export const fetchJobs = async (
  offset: number,
  limit: number,
  status?: string,
) => {
  const query: Record<string, string | number> = { offset, limit };
  if (status) query.status = status;
  const payload = await getWithQuery(FETCH_JOBS_PATH, query);
  return toRows(payload) as JobRow[];
};

export const fetchJob = async (jobId: string) => {
  const response = await fetch(buildUrl(FETCH_JOB_PATH(jobId)), {
    method: "GET",
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json() as Promise<JobRow>;
};

const resolveId = (row: PaperRow) => {
  const candidates = [
    row.id,
    row.paper_id,
    row.idx,
    row.uuid,
    row._id,
  ];
  const value = candidates.find(
    (item) => item !== undefined && item !== null && item !== "",
  );
  return value ? String(value) : "";
};

const sanitizeEditablePayload = (row: PaperRow): PaperRow => {
  const payload: PaperRow = {};
  EDITABLE_KEYS.forEach((key) => {
    payload[key] = row[key];
  });
  return payload;
};

export const updatePaper = async (row: PaperRow) => {
  const id = resolveId(row);
  const payload = sanitizeEditablePayload(row);
  return postJsonWithQuery(UPDATE_PAPERS_PATH, { id }, payload);
};
