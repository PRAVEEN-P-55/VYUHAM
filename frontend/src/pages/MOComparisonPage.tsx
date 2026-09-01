import { AlertTriangle, ArrowRight, Check, FileSearch, ShieldQuestion } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge, Banner, Button, Card, ConfidenceMeter, Field, PageHeader, SectionHeader, Select } from "../components/ui";
import { useAppContext } from "../context/AppContext";
import { useApiResource } from "../hooks/useApiResource";
import { api } from "../services/api";
import { asPercent, formatDate, titleCase } from "../utils/format";

const features = ["entry_method", "target_type", "weapon_or_tool", "escape_method", "distinctive_action", "vehicle_description"];

export function MOComparisonPage() {
  const { activeCaseId } = useAppContext();
  const { data: timeline, error: timelineError } = useApiResource(() => api.timeline(activeCaseId), [activeCaseId]);
  const incidents = (timeline?.items ?? []).filter((event) => event.event_type === "INCIDENT");
  const [incidentId, setIncidentId] = useState("");
  useEffect(() => { setIncidentId(incidents[0]?.source_id ?? ""); }, [activeCaseId, incidents[0]?.source_id]);
  const { data, loading, error } = useApiResource(() => incidentId ? api.similarMo(incidentId) : Promise.resolve({ items: [] }), [incidentId]);
  const match = data?.items[0];

  return <div className="page"><PageHeader title="Modus Operandi Similarity" description="Compare incident features and inspect why records were suggested as similar." actions={<Field label="Source incident"><Select value={incidentId} onChange={(event) => setIncidentId(event.target.value)}>{incidents.map((incident) => <option value={incident.source_id} key={incident.source_id}>{incident.source_id}</option>)}</Select></Field>} />{(error || timelineError) && <Banner tone="warning" title="Could not load MO comparison">{error || timelineError}</Banner>}<Banner title="Similarity is a review signal">A high similarity score does not establish common authorship. Check matching and conflicting evidence independently.</Banner>{!match && !loading ? <Card><SectionHeader title="No similar incidents returned" description="Choose another incident or review the source data." /></Card> : match && <><div className="mo-summary"><Card className="incident-card"><Badge tone="info">SOURCE INCIDENT</Badge><h2>Incident {incidentId}</h2><span className="mono">{incidentId} · {activeCaseId}</span><dl><div><dt>Record source</dt><dd>Unified case timeline</dd></div><div><dt>Feature model</dt><dd>Six-factor MO comparison</dd></div></dl></Card><div className="similarity-bridge"><ShieldQuestion /><strong>{asPercent(match.similarity_pct)}%</strong><span>feature similarity</span><ArrowRight /></div><Card className="incident-card"><Badge tone="warning">COMPARISON</Badge><h2>{titleCase(match.crime_type)} incident</h2><span className="mono">{match.incident_id} · {match.case_id}</span><dl><div><dt>Date</dt><dd>{formatDate(match.incident_time, true)}</dd></div><div><dt>Review</dt><dd>{titleCase(match.review_status)}</dd></div></dl></Card></div><Card className="feature-comparison"><SectionHeader title="Feature-level comparison" description={`${match.matching_features.length} matching features and ${match.non_matching_features.length} differences`} action={<ConfidenceMeter value={asPercent(match.similarity_pct)} />} /><div className="feature-table" role="table" aria-label="Modus operandi feature comparison"><div className="feature-row feature-row--header" role="row"><span role="columnheader">Feature</span><span role="columnheader">Assessment</span><span role="columnheader">API signal</span><span role="columnheader">Review</span></div>{features.map((feature) => { const matching = match.matching_features.includes(feature); return <div className="feature-row" role="row" key={feature}><strong role="cell">{titleCase(feature)}</strong><span role="cell">{matching ? "Same coded feature" : "Different or unavailable"}</span><span role="cell" className="mono">{feature}</span><span role="cell" className={matching ? "match" : "conflict"}>{matching ? <><Check /> Matching</> : <><AlertTriangle /> Non-matching</>}</span></div>; })}</div></Card></>}</div>;
}
