import { CalendarClock, Check, Clipboard, Filter, Lightbulb, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge, Banner, Button, Card, Field, Input, PageHeader, Select } from "../components/ui";
import { useAppContext } from "../context/AppContext";
import { useApiResource } from "../hooks/useApiResource";
import { api } from "../services/api";
import { formatDate, titleCase } from "../utils/format";

export function EvidenceGapsPage() {
  const { activeCaseId } = useAppContext();
  const { data, loading, error } = useApiResource(() => api.evidenceGaps(activeCaseId), [activeCaseId]);
  const [query, setQuery] = useState("");
  const [priority, setPriority] = useState("ALL PRIORITIES");
  const [copied, setCopied] = useState<string | null>(null);
  const gaps = data?.items ?? [];
  const visible = useMemo(() => gaps.filter((gap) => (!query || `${gap.gap_id} ${gap.missing_evidence_type} ${gap.entity_id}`.toLowerCase().includes(query.toLowerCase())) && (priority === "ALL PRIORITIES" || gap.expected_priority === priority)), [query, priority, gaps]);
  const copyBrief = async (id: string, text: string) => { await navigator.clipboard?.writeText(text); setCopied(id); window.setTimeout(() => setCopied(null), 1800); };
  return <div className="page"><PageHeader title="Evidence Gaps" description={`Missing records that limit confidence in ${activeCaseId}.`} actions={<Badge tone="warning">{loading ? "LOADING" : `${gaps.length} OPEN GAPS`}</Badge>} />{error && <Banner tone="warning" title="Could not load evidence gaps">{error}</Banner>}<Banner tone="warning" title="Missing evidence affects interpretation">Prioritise source collection before acting on an incomplete relationship or timeline.</Banner><Card className="filter-bar"><Filter /><Field label="Search gaps"><div className="input-with-icon"><Search /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Gap, entity or record ID" /></div></Field><Field label="Priority"><Select value={priority} onChange={(event) => setPriority(event.target.value)}><option>ALL PRIORITIES</option><option>HIGH</option><option>MEDIUM</option><option>LOW</option></Select></Field><span>{visible.length} shown</span></Card><div className="gap-grid">{visible.map((gap) => { const followUp = `Collect and independently verify ${titleCase(gap.missing_evidence_type)} for ${gap.entity_id} covering ${formatDate(gap.time_from, true)} to ${formatDate(gap.time_to, true)}.`; return <Card className="gap-card" key={gap.gap_id}><div className="gap-card__header"><div className="gap-card__icon"><Lightbulb /></div><div><Badge tone={gap.expected_priority === "HIGH" ? "danger" : "warning"}>{gap.expected_priority} PRIORITY</Badge><span className="mono">{gap.gap_id}</span></div></div><h2>{titleCase(gap.missing_evidence_type)}</h2><p className="gap-card__entity">Entity <span className="mono">{gap.entity_id}</span></p><dl><div><dt>Why it matters</dt><dd>{gap.reason_it_matters}</dd></div><div><dt><CalendarClock /> Missing window</dt><dd>{formatDate(gap.time_from, true)}–{formatDate(gap.time_to, true)}</dd></div></dl><div className="followup-brief"><strong>Recommended follow-up</strong><p>{followUp}</p></div><Button icon={copied === gap.gap_id ? <Check /> : <Clipboard />} onClick={() => copyBrief(gap.gap_id, `${gap.gap_id}: ${followUp}`)}>{copied === gap.gap_id ? "Brief copied" : "Copy follow-up brief"}</Button></Card>; })}</div></div>;
}
