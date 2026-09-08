const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "") ?? "/api/v1";
const TOKEN_KEY = "vyuham.auth.token";
const INVESTIGATOR_KEY = "vyuham.auth.investigator";

export type Investigator = {
  id: string;
  name: string;
  role: string;
  case_ids: string[];
};

export type LoginResponse = { token: string; investigator: Investigator };
export type PageResponse<T> = { items: T[]; total: number; page: number; page_size: number };
export type ItemsResponse<T> = { items: T[]; total?: number };

export type CaseRecord = {
  case_id: string;
  case_title: string;
  district: string;
  investigating_officer: string;
  opened_date: string;
  status: string;
  review_status: string;
};

export type CaseSummary = {
  case: CaseRecord & { state: string };
  kpis: {
    entities_indexed: number;
    evidence_records: number;
    relationships: number;
    open_evidence_gaps: number;
  };
  activity_timeseries: Array<{ date: string; relationships_added: number; evidence_added: number }>;
  priority_follow_ups: Array<{
    gap_id: string;
    entity_id: string;
    issue_title: string;
    reason: string;
    status: string;
    severity: string;
  }>;
};

export type CaseDocument = {
  document_id: string;
  status: string;
  detected_language: string | null;
  extracted_entity_count: number | null;
  view_url: string;
};

export type JobStatus = {
  job_id: string;
  document_id: string;
  stage: string;
  status: string;
  detected_language: string | null;
  extracted_entity_count: number | null;
  extracted_entity_ids: string[];
  error: string | null;
};

export type DocumentEntityResult = {
  document_id: string;
  case_id: string;
  entity_ids: string[];
  total: number;
};

export type GraphNode = {
  entity_id: string;
  entity_type: string;
  label: string;
  case_ids: string[];
  risk_indicators: string[];
  confidence: number;
};

export type Evidence = {
  evidence_id: string;
  source_type: string;
  source_record_id: string;
  text_excerpt: string;
  reliability: string;
  document_id: string | null;
  bounding_box: { x: number; y: number; width: number; height: number } | null;
};

export type GraphEdge = {
  edge_id: string;
  source_entity_id: string;
  target_entity_id: string;
  relationship_type: string;
  review_status: string;
  confidence: number;
  valid_from: string | null;
  valid_to: string | null;
  relationship_ids: string[];
  evidence_summary: { count: number; source_types: string[]; key_dates: string[]; explanation: string };
  evidence: Evidence[];
};

export type GraphResponse = { nodes: GraphNode[]; edges: GraphEdge[] };
export type EntitySearchResult = GraphNode & {
  matched_field: string;
  matched_value: string;
  preferred_case_id: string;
  relationship_count: number;
};
export type TimelineEvent = { timestamp: string; event_type: string; description: string; source_id: string; evidence_id: string | null };
export type Pattern = {
  hypothesis_id: string;
  pattern_type: string;
  priority: string;
  reason: string;
  entity_ids: string[];
  evidence_record_count: number;
  cross_case: boolean;
  linked_case_ids: string[];
  review_status: string;
  confidence: number;
};

export type EvidenceGap = {
  gap_id: string;
  entity_id: string;
  missing_evidence_type: string;
  reason_it_matters: string;
  time_from: string | null;
  time_to: string | null;
  expected_priority: string;
};

export type IdentityPerson = {
  person_id: string;
  full_name: string | null;
  alias: string | null;
  full_name_transliterated: string | null;
  date_of_birth: string | null;
  district: string | null;
  state: string | null;
  language: string | null;
};

export type IdentityCandidate = {
  candidate_id: string;
  record_a: IdentityPerson;
  record_b: IdentityPerson;
  match_confidence: number;
  supporting: string[];
  conflicting: string[];
  recommended_action: "ACCEPT" | "REJECT";
};

export type MoMatch = {
  incident_id: string;
  case_id: string;
  crime_type: string;
  incident_time: string;
  similarity_pct: number;
  matching_features: string[];
  non_matching_features: string[];
  review_status: string;
};

export type AuditEntry = {
  timestamp: string;
  investigator_id: string;
  role: string;
  action: string;
  description: string;
  resource: string;
  outcome: string;
};

export type EntitySummary = {
  entity_id: string;
  entity_type: string;
  name: string;
  aliases: string[];
  identity_fields: Record<string, string[]>;
  summary_text: string;
  confidence: number;
  review_status: string;
  risk_indicators: string[];
  evidence_connections: Array<{
    chain: string;
    source_type: string | null;
    timestamp: string | null;
    confidence: number;
    evidence_id: string | null;
  }>;
};

export type DocumentMention = {
  document_id: string;
  image_path: string;
  bounding_box: { x: number; y: number; width: number; height: number };
  matched_text: string;
};

export type CaseBriefing = {
  content: {
    case_title: string;
    case_id: string;
    status: string;
    district: string;
    generated_for: string;
    redacted: boolean;
    key_entities: Array<{ entity_id: string; name: string; entity_type: string; influence_reasons: string[]; confidence: number }>;
    key_relationships_plain: string[];
    open_evidence_gaps: EvidenceGap[];
    recommended_next_steps: string[];
    disclaimer: string;
  };
};

// ---- enhancement layer types -------------------------------------------
export type PoleNode = GraphNode & { pole_category?: string };

export type PathHop = {
  source_entity_id: string;
  target_entity_id: string;
  relationship_types: string[];
  edges: GraphEdge[];
};
export type ConnectionPath = {
  length: number;
  entity_ids: string[];
  nodes: PoleNode[];
  hops: PathHop[];
};
export type ConnectionPathResult = {
  found: boolean;
  reason: string | null;
  shortest_length: number | null;
  paths: ConnectionPath[];
};

export type SuggestedLink = {
  pair_id: string;
  source_entity_id: string;
  target_entity_id: string;
  nodes: PoleNode[];
  score: number;
  shared_connections: string[];
  shared_count: number;
  same_community: boolean;
  reason: string;
  review_status: string;
  confidence: number;
};

export type PersonOfInterest = {
  entity_id: string;
  name: string;
  suspect_neighbour_count: number;
  suspect_neighbours: string[];
  degree_in_case: number;
  also_in_cases: string[];
  reason: string;
  review_status: string;
  confidence: number;
};

export type EntitiesNearResult = {
  anchor: { location_id: string | null; name: string | null; lat: number; lon: number; radius_m?: number } | null;
  reason: string | null;
  locations: Array<{
    location_id: string;
    location_name: string;
    location_type: string;
    distance_m: number;
    is_incident_site: boolean;
    observed_entities: Array<{ entity_id: string; timestamp: string | null; source_type: string | null }>;
  }>;
};

export type EntityRisk = {
  entity_id: string;
  risk_score: number;
  risk_band: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  components: { pattern_signal: number; network_centrality: number; risk_indicators: number };
  contributing_factors: Array<{
    pattern_type: string;
    descriptor: string;
    base_weight: number;
    recency_factor: number;
    contribution: number;
  }>;
  risk_indicators: string[];
  narrative: string;
  review_status: string;
  confidence: number;
};

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

export function getStoredSession(): { token: string; investigator: Investigator } | null {
  const token = localStorage.getItem(TOKEN_KEY) ?? sessionStorage.getItem(TOKEN_KEY);
  const raw = localStorage.getItem(INVESTIGATOR_KEY) ?? sessionStorage.getItem(INVESTIGATOR_KEY);
  if (!token || !raw) return null;
  try { return { token, investigator: JSON.parse(raw) as Investigator }; } catch { return null; }
}

export function storeSession(session: LoginResponse, persistent: boolean) {
  clearSession();
  const storage = persistent ? localStorage : sessionStorage;
  storage.setItem(TOKEN_KEY, session.token);
  storage.setItem(INVESTIGATOR_KEY, JSON.stringify(session.investigator));
}

export function clearSession() {
  for (const storage of [localStorage, sessionStorage]) {
    storage.removeItem(TOKEN_KEY);
    storage.removeItem(INVESTIGATOR_KEY);
  }
}

function token() { return localStorage.getItem(TOKEN_KEY) ?? sessionStorage.getItem(TOKEN_KEY); }

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const authToken = token();
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      ...(init?.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      ...init?.headers,
    },
  });
  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;
    try {
      const body = await response.json() as { detail?: string; message?: string };
      message = body.detail ?? body.message ?? message;
    } catch { /* Response was not JSON. */ }
    if (response.status === 401 && path !== "/auth/login") window.dispatchEvent(new Event("vyuham:unauthorized"));
    throw new ApiError(response.status, message);
  }
  return response.status === 204 ? undefined as T : response.json() as Promise<T>;
}

const params = (values: Record<string, string | number | undefined>) => {
  const query = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => { if (value !== undefined && value !== "") query.set(key, String(value)); });
  const encoded = query.toString();
  return encoded ? `?${encoded}` : "";
};

export const api = {
  login: (payload: { investigator_id: string; password: string }) => request<LoginResponse>("/auth/login", { method: "POST", body: JSON.stringify(payload) }),
  listCases: (filters: { page?: number; page_size?: number; status?: string; district?: string; search?: string } = {}) => request<PageResponse<CaseRecord>>(`/cases${params(filters)}`),
  caseSummary: (caseId: string) => request<CaseSummary>(`/cases/${encodeURIComponent(caseId)}/summary`),
  listDocuments: (caseId: string) => request<ItemsResponse<CaseDocument>>(`/cases/${encodeURIComponent(caseId)}/documents`),
  uploadDocument: (caseId: string, body: FormData) => request<{ job_id: string; document_id: string }>(`/cases/${encodeURIComponent(caseId)}/documents`, { method: "POST", body }),
  jobEvents: (jobId: string) => request<JobStatus>(`/jobs/${encodeURIComponent(jobId)}/events`),
  graphQuery: (caseId: string, payload: { root_entity_id?: string; hops?: number; relationship_types?: string[]; time_from?: string; time_to?: string; document_id?: string }) =>
    request<GraphResponse>(`/cases/${encodeURIComponent(caseId)}/graph/query`, { method: "POST", body: JSON.stringify(payload) }),
  searchEntities: (query: string, entityType?: string, limit = 40) =>
    request<ItemsResponse<EntitySearchResult>>(`/search/entities${params({ q: query, entity_type: entityType, limit })}`),
  entitySummary: (caseId: string, entityId: string) => request<EntitySummary>(`/cases/${encodeURIComponent(caseId)}/entities/${encodeURIComponent(entityId)}/summary`),
  relationship: (caseId: string, relationshipId: string) => request<GraphEdge>(`/cases/${encodeURIComponent(caseId)}/relationships/${encodeURIComponent(relationshipId)}`),
  documentMentions: (caseId: string, entityId: string) => request<DocumentMention[]>(`/cases/${encodeURIComponent(caseId)}/entities/${encodeURIComponent(entityId)}/document-mentions`),
  timeline: (caseId: string) => request<ItemsResponse<TimelineEvent>>(`/cases/${encodeURIComponent(caseId)}/timeline`),
  patterns: (caseId: string) => request<ItemsResponse<Pattern>>(`/cases/${encodeURIComponent(caseId)}/patterns`),
  similarMo: (incidentId: string) => request<ItemsResponse<MoMatch>>(`/incidents/${encodeURIComponent(incidentId)}/similar-mo`),
  resolutionCandidates: (caseId: string) => request<ItemsResponse<IdentityCandidate>>(`/cases/${encodeURIComponent(caseId)}/resolution-candidates`),
  resolveIdentity: (caseId: string, candidateId: string, action: "ACCEPT" | "DEFER" | "REJECT") => request<{ candidate_id: string; action: string; reversible: boolean }>(`/cases/${encodeURIComponent(caseId)}/resolution-candidates/${encodeURIComponent(candidateId)}/action`, { method: "POST", body: JSON.stringify({ action }) }),
  reverseIdentity: (caseId: string, candidateId: string) => request<{ candidate_id: string; reversed_action: string }>(`/cases/${encodeURIComponent(caseId)}/resolution-candidates/${encodeURIComponent(candidateId)}/reverse`, { method: "POST" }),
  evidenceGaps: (caseId: string) => request<ItemsResponse<EvidenceGap>>(`/cases/${encodeURIComponent(caseId)}/evidence-gaps`),
  exportCase: (caseId: string, redacted: boolean) => request<CaseBriefing>(`/cases/${encodeURIComponent(caseId)}/export`, { method: "POST", body: JSON.stringify({ redact: redacted }) }),
  auditLog: (filters: { page?: number; page_size?: number; investigator?: string; action?: string } = {}) => request<PageResponse<AuditEntry>>(`/audit-log${params(filters)}`),

  // ---- enhancement layer (roadmap phase 1-3) ----------------------------
  connectionPath: (caseId: string, payload: { source_entity_id: string; target_entity_id: string; max_hops?: number; max_paths?: number }) =>
    request<ConnectionPathResult>(`/cases/${encodeURIComponent(caseId)}/graph/path`, { method: "POST", body: JSON.stringify(payload) }),
  suggestedLinks: (caseId: string, limit = 15) =>
    request<ItemsResponse<SuggestedLink>>(`/cases/${encodeURIComponent(caseId)}/suggested-links${params({ limit })}`),
  personsOfInterest: (caseId: string, limit = 12) =>
    request<ItemsResponse<PersonOfInterest>>(`/cases/${encodeURIComponent(caseId)}/persons-of-interest${params({ limit })}`),
  entitiesNear: (caseId: string, q: { location_id?: string; lat?: number; lon?: number; radius_m?: number } = {}) =>
    request<EntitiesNearResult>(`/cases/${encodeURIComponent(caseId)}/entities/near${params(q)}`),
  entityRisk: (caseId: string, entityId: string) =>
    request<EntityRisk>(`/cases/${encodeURIComponent(caseId)}/entities/${encodeURIComponent(entityId)}/risk`),
  analyticsCapabilities: () => request<Record<string, unknown>>(`/analytics/capabilities`),
  documentEntities: (caseId: string, documentId: string) =>
    request<DocumentEntityResult>(`/cases/${encodeURIComponent(caseId)}/documents/${encodeURIComponent(documentId)}/entities`),
};

export const apiAssetUrl = (path: string) => {
  if (!path || /^https?:\/\//.test(path)) return path;
  const configured = import.meta.env.VITE_API_BASE_URL as string | undefined;
  if (!configured) return path;
  return `${configured.replace(/\/api\/v1\/?$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
};
