import { ArrowRight, Car, FileText, Landmark, Search, UserRound } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Badge, Banner, Button, Card, EmptyState, Field, Input, PageHeader, Select } from "../components/ui";
import { useAppContext } from "../context/AppContext";
import { useApiResource } from "../hooks/useApiResource";
import { api } from "../services/api";
import { titleCase } from "../utils/format";

export function SearchPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { activeCaseId, setActiveCaseId } = useAppContext();
  const incomingQuery = (location.state as { query?: string } | null)?.query ?? "";
  const [query, setQuery] = useState(incomingQuery);
  const [type, setType] = useState("All records");
  useEffect(() => { if (incomingQuery) setQuery(incomingQuery); }, [incomingQuery]);
  const { data, loading, error } = useApiResource(async () => {
    const [graph, cases] = await Promise.all([api.graphQuery(activeCaseId, { hops: 2 }), api.listCases({ page_size: 1000 })]);
    return { graph, cases };
  }, [activeCaseId]);
  const records = useMemo(() => {
    const entityRecords = (data?.graph.nodes ?? []).map((node) => ({ id: node.entity_id, title: node.label, type: titleCase(node.entity_type), detail: `${node.case_ids.length} linked case(s) · ${node.risk_indicators.map(titleCase).join(", ") || "No coded risk indicators"}`, status: node.confidence >= .85 ? "CONFIRMED" : "AI SUGGESTED", target: "entity" as const }));
    const evidenceMap = new Map<string, { id: string; title: string; type: string; detail: string; status: string; target: "evidence" }>();
    (data?.graph.edges ?? []).forEach((edge) => edge.evidence.forEach((evidence) => evidenceMap.set(evidence.evidence_id, { id: evidence.evidence_id, title: evidence.source_type.replaceAll("_", " "), type: "Evidence", detail: `${evidence.source_record_id} · ${evidence.text_excerpt}`, status: edge.review_status.replaceAll("_", " "), target: "evidence" })));
    const caseRecords = (data?.cases.items ?? []).map((item) => ({ id: item.case_id, title: item.case_title, type: "Case", detail: `${item.district} · ${item.investigating_officer}`, status: item.review_status.replaceAll("_", " "), target: "case" as const }));
    return [...entityRecords, ...evidenceMap.values(), ...caseRecords];
  }, [data]);
  const types = ["All records", ...new Set(records.map((item) => item.type))];
  const results = useMemo(() => records.filter((item) => { const matchesQuery = !query || `${item.id} ${item.title} ${item.detail}`.toLowerCase().includes(query.toLowerCase()); return matchesQuery && (type === "All records" || item.type === type); }).slice(0, 100), [records, query, type]);
  const open = (item: (typeof results)[number]) => { if (item.target === "case") { setActiveCaseId(item.id); navigate("/overview"); } else { navigate("/network", { state: { entityId: item.target === "entity" ? item.id : undefined } }); } };
  return <div className="page"><PageHeader title="Search" description={`Live entities, evidence and authorised cases for ${activeCaseId}.`} />{error && <Banner tone="warning" title="Could not search backend records">{error}</Banner>}<Card className="search-panel"><form onSubmit={(event) => event.preventDefault()} className="search-form"><Field label="Search case records"><div className="input-with-icon"><Search /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name, phone, vehicle, ID or evidence source" /></div></Field><Field label="Record type"><Select value={type} onChange={(event) => setType(event.target.value)}>{types.map((item) => <option key={item}>{item}</option>)}</Select></Field><Button type="submit" variant="primary">Search records</Button></form></Card><div className="result-heading"><p><strong>{results.length}</strong> records {loading ? "loading…" : "found"} {query && <>for “{query}”</>}</p><span>Restricted to authorised cases.</span></div>{results.length ? <div className="search-results">{results.map((item) => { const Icon = item.type === "Person" ? UserRound : item.type === "Vehicle" ? Car : item.type === "Account" ? Landmark : FileText; return <Card className="search-result" key={`${item.type}-${item.id}`}><div className="search-result__icon"><Icon /></div><div><div><Badge tone="neutral">{item.type}</Badge><span className="mono">{item.id}</span></div><h2>{item.title}</h2><p>{item.detail}</p></div><Badge>{item.status}</Badge><Button variant="ghost" size="sm" aria-label={`Open ${item.title}`} onClick={() => open(item)}>Open <ArrowRight /></Button></Card>; })}</div> : !loading && <EmptyState title="No matching records">Try a broader term or choose a different record type.</EmptyState>}</div>;
}
