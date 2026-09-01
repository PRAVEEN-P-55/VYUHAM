import { ArrowDownUp, FileText, Search, SlidersHorizontal } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Badge, Banner, Button, Card, Field, Input, Modal, PageHeader, Select, TableWrap } from "../components/ui";
import { useAppContext } from "../context/AppContext";
import { useApiResource } from "../hooks/useApiResource";
import { api, type CaseRecord } from "../services/api";
import { formatDate, titleCase } from "../utils/format";

export function CaseRegistryPage() {
  const navigate = useNavigate();
  const { setActiveCaseId } = useAppContext();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("ALL STATUSES");
  const [ascending, setAscending] = useState(true);
  const [page, setPage] = useState(1);
  const [briefCase, setBriefCase] = useState<CaseRecord | null>(null);
  const [redacted, setRedacted] = useState(true);
  const [briefing, setBriefing] = useState<string[]>([]);
  const [briefError, setBriefError] = useState("");
  const { data, loading, error } = useApiResource(() => api.listCases({ page, page_size: 25, search: query || undefined, status: status === "ALL STATUSES" ? undefined : status }), [page, query, status]);
  const visible = useMemo(() => [...(data?.items ?? [])].sort((a, b) => ascending ? a.case_id.localeCompare(b.case_id) : b.case_id.localeCompare(a.case_id)), [data, ascending]);
  const generate = async () => {
    if (!briefCase) return;
    setBriefError("");
    try { const result = await api.exportCase(briefCase.case_id, redacted); setBriefing(result.content.recommended_next_steps); }
    catch (reason) { setBriefError(reason instanceof Error ? reason.message : "Could not generate briefing"); }
  };
  const openCase = (caseId: string) => { setActiveCaseId(caseId); navigate("/overview"); };
  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / 25));
  return <div className="page"><PageHeader title="Case Registry" description="Search and review case records within your assigned jurisdictions." />{error && <Banner tone="warning" title="Could not load case registry">{error}</Banner>}<Card className="filter-bar case-filters"><SlidersHorizontal /><Field label="Search registry"><div className="input-with-icon"><Search /><Input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Case, jurisdiction or officer" /></div></Field><Field label="Status"><Select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option>ALL STATUSES</option><option value="OPEN">OPEN</option><option value="UNDER_INVESTIGATION">UNDER INVESTIGATION</option><option value="CHARGESHEET_FILED">CHARGESHEET FILED</option><option value="CLOSED">CLOSED</option><option value="COLD">COLD</option></Select></Field><Button icon={<ArrowDownUp />} onClick={() => setAscending((value) => !value)}>Sort {ascending ? "ascending" : "descending"}</Button></Card><Card><TableWrap label="Case registry records"><table><thead><tr><th>Case</th><th>Jurisdiction</th><th>Officer</th><th>Opened</th><th>Status</th><th>Review</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{visible.map((item) => <tr key={item.case_id}><td><div><strong>{item.case_title}</strong><small className="mono table-subline">{item.case_id}</small></div></td><td>{item.district}</td><td>{item.investigating_officer}</td><td>{formatDate(item.opened_date)}</td><td><Badge>{titleCase(item.status)}</Badge></td><td><Badge>{titleCase(item.review_status)}</Badge></td><td><Button size="sm" variant="ghost" onClick={() => openCase(item.case_id)}>Open</Button><Button size="sm" variant="ghost" icon={<FileText />} onClick={() => { setBriefCase(item); setBriefing([]); }}>Briefing</Button></td></tr>)}</tbody></table></TableWrap><div className="table-footer"><span>{loading ? "Loading cases…" : `Showing ${visible.length} of ${data?.total ?? 0} cases`}</span><div><Button size="sm" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</Button><Badge tone="info">Page {page} of {totalPages}</Badge><Button size="sm" disabled={page >= totalPages} onClick={() => setPage((value) => value + 1)}>Next</Button></div></div></Card><Modal open={Boolean(briefCase)} onClose={() => setBriefCase(null)} title="Generate case briefing" footer={<><Button onClick={() => setBriefCase(null)}>Close</Button><Button variant="primary" onClick={briefing.length ? () => window.print() : generate}>{briefing.length ? "Open print preview" : "Generate from API"}</Button></>}>{briefCase && <div className="brief-request"><Badge tone="info">{briefCase.case_id}</Badge><h3>{briefCase.case_title}</h3><p>The briefing includes key entities, evidence-backed relationships, open gaps and recommended next steps.</p><label className="switch-row"><input type="checkbox" checked={redacted} onChange={(event) => setRedacted(event.target.checked)} /><span><strong>Redact personal identifiers</strong><small>Replace personal identifiers where supported by the source record.</small></span></label>{briefError && <Banner tone="warning">{briefError}</Banner>}{briefing.length > 0 && <ol>{briefing.map((item) => <li key={item}>{item}</li>)}</ol>}</div>}</Modal></div>;
}
