import { ArrowRight, GitBranch, Link2, ScanSearch } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge, Banner, Button, Card, PageHeader } from "../components/ui";
import { useAppContext } from "../context/AppContext";
import { useApiResource } from "../hooks/useApiResource";
import { api } from "../services/api";
import { titleCase } from "../utils/format";

export function PatternsPage() {
  const { activeCaseId } = useAppContext();
  const { data, loading, error } = useApiResource(() => api.patterns(activeCaseId), [activeCaseId]);
  const [active, setActive] = useState("ALL");
  const patterns = data?.items ?? [];
  const filters = ["ALL", ...new Set(patterns.map((pattern) => pattern.pattern_type))];
  const visible = useMemo(() => active === "ALL" ? patterns : patterns.filter((pattern) => pattern.pattern_type === active), [active, patterns]);
  return <div className="page"><PageHeader title="Suspicious Pattern Hypotheses" description={`Prioritised patterns returned for ${activeCaseId}.`} actions={<Badge tone="warning">{loading ? "LOADING" : `${patterns.length} REQUIRE REVIEW`}</Badge>} />{error && <Banner tone="warning" title="Could not load patterns">{error}</Banner>}<Banner tone="warning" title="Human review required">Patterns prioritise records for human review. They are not findings or proof.</Banner><div className="tabs" role="group" aria-label="Pattern type filters">{filters.map((filter) => <button aria-pressed={active === filter} className={active === filter ? "is-active" : ""} onClick={() => setActive(filter)} key={filter}>{filter === "ALL" ? filter : titleCase(filter)}</button>)}</div><div className="pattern-list">{visible.map((pattern) => <Card className={`pattern-card ${pattern.cross_case ? "pattern-card--cross" : ""}`} key={pattern.hypothesis_id}><div className="pattern-card__icon">{pattern.cross_case ? <GitBranch /> : <ScanSearch />}</div><div className="pattern-card__body"><div className="pattern-card__meta"><Badge tone="warning">{pattern.review_status.replaceAll("_", " ")}</Badge><span className="mono">{pattern.hypothesis_id}</span><Badge tone={pattern.priority === "HIGH" ? "danger" : "warning"}>{pattern.priority} PRIORITY</Badge></div><h2>{titleCase(pattern.pattern_type)}</h2><p>{pattern.reason}</p>{pattern.cross_case && <div className="case-links"><Link2 />{pattern.linked_case_ids.slice(0, 8).map((id) => <button className="mono" key={id}>{id}</button>)}</div>}</div><div className="pattern-card__stats"><span><strong>{pattern.entity_ids.length}</strong> entities</span><span><strong>{pattern.evidence_record_count}</strong> evidence records</span></div><Button variant="ghost">Inspect evidence <ArrowRight /></Button></Card>)}</div></div>;
}
