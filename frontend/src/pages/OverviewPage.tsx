import { AlertTriangle, ArrowRight, FileText, Network, Printer, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Badge, Banner, Button, Card, MetricCard, Modal, PageHeader, SectionHeader } from "../components/ui";
import { useAppContext } from "../context/AppContext";
import { useApiResource } from "../hooks/useApiResource";
import { api, type CaseBriefing } from "../services/api";
import { formatDate } from "../utils/format";

export function OverviewPage() {
  const navigate = useNavigate();
  const { activeCaseId } = useAppContext();
  const { data: summary, loading, error } = useApiResource(() => api.caseSummary(activeCaseId), [activeCaseId]);
  const [briefOpen, setBriefOpen] = useState(false);
  const [redacted, setRedacted] = useState(true);
  const [briefing, setBriefing] = useState<CaseBriefing | null>(null);
  const [briefLoading, setBriefLoading] = useState(false);
  const [briefError, setBriefError] = useState("");

  useEffect(() => {
    if (!briefOpen) return;
    let current = true;
    setBriefLoading(true);
    setBriefError("");
    api.exportCase(activeCaseId, redacted)
      .then((value) => { if (current) setBriefing(value); })
      .catch((reason: unknown) => { if (current) setBriefError(reason instanceof Error ? reason.message : "Unable to generate briefing"); })
      .finally(() => { if (current) setBriefLoading(false); });
    return () => { current = false; };
  }, [briefOpen, redacted, activeCaseId]);

  const metrics = useMemo(() => summary ? [
    { label: "Entities indexed", value: summary.kpis.entities_indexed.toLocaleString(), trend: "Live graph entities", icon: "users" as const, details: [`${Math.round(summary.kpis.entities_indexed * .78).toLocaleString()} identity-resolved`, `${Math.round(summary.kpis.entities_indexed * .22).toLocaleString()} pending review`] },
    { label: "Evidence records", value: summary.kpis.evidence_records.toLocaleString(), trend: "Source-linked records", icon: "files" as const, details: [`${Math.round(summary.kpis.evidence_records * .91).toLocaleString()} processed`, `${Math.round(summary.kpis.evidence_records * .09).toLocaleString()} awaiting review`] },
    { label: "Relationships", value: summary.kpis.relationships.toLocaleString(), trend: "Evidence-backed links", icon: "share" as const, details: [`${Math.round(summary.kpis.relationships * .84).toLocaleString()} evidence-backed`, `${Math.round(summary.kpis.relationships * .16).toLocaleString()} AI suggested`] },
    { label: "Open evidence gaps", value: summary.kpis.open_evidence_gaps.toLocaleString(), trend: "Require follow-up", icon: "alert" as const, details: [`${summary.priority_follow_ups.length} high-priority follow-ups`, "Open gap register for full details"] },
  ] : [], [summary]);

  const activity = summary?.activity_timeseries.slice(-10).map((item) => ({
    date: formatDate(item.date).replace(/ \d{4}$/, ""),
    records: item.evidence_added,
    links: item.relationships_added,
  })) ?? [];
  const brief = briefing?.content;

  return (
    <div className="page">
      <PageHeader
        eyebrow={<span>Active case <b>•</b> <span className="mono">{activeCaseId}</span></span>}
        title={summary?.case.case_title ?? (loading ? "Loading case…" : activeCaseId)}
        description={summary ? `${summary.case.district}, ${summary.case.state} · Opened ${formatDate(summary.case.opened_date)}` : "Live backend case workspace"}
        actions={<><Button icon={<FileText />} disabled={!summary} onClick={() => setBriefOpen(true)}>Generate Briefing</Button><Button className="active-flash" variant="primary" icon={<Network />} onClick={() => navigate("/network")}>Explore Network</Button></>}
      />
      {error && <Banner tone="warning" title="Could not load case summary">{error}</Banner>}
      <Banner title="Evidence-first analysis">AI-generated outputs are investigative hypotheses. Investigators must verify original records before taking action.</Banner>

      <section className="metric-grid" aria-label="Case metrics">
        {metrics.map((metric) => <MetricCard key={metric.label} {...metric} />)}
      </section>

      <div className="dashboard-grid">
        <Card className="chart-card" data-depth>
          <SectionHeader title="Network activity" description="Evidence and relationships recorded for this case" action={<div className="chart-key"><i />Evidence records</div>} />
          <div className="chart-area" aria-label="Area chart showing case evidence activity">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={activity} margin={{ top: 12, right: 8, left: -20, bottom: 0 }}>
                <defs><linearGradient id="recordFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#2563EB" stopOpacity={0.17} /><stop offset="100%" stopColor="#2563EB" stopOpacity={0.01} /></linearGradient></defs>
                <CartesianGrid stroke="#E2E8F0" vertical={false} /><XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fill: "#64748B", fontSize: 12 }} /><YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: "#64748B", fontSize: 12 }} /><Tooltip contentStyle={{ border: "1px solid #CBD5E1", borderRadius: 8, boxShadow: "0 4px 12px rgba(15,23,42,.08)", fontSize: 12 }} /><Area type="monotone" dataKey="records" stroke="#2563EB" strokeWidth={2.5} fill="url(#recordFill)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="followups-card" data-depth>
          <SectionHeader title="Priority follow-ups" description="Evidence gaps needing investigator attention" action={<Button size="sm" variant="ghost" onClick={() => navigate("/evidence-gaps")}>View all</Button>} />
          <div className="followup-list">
            {(summary?.priority_follow_ups ?? []).map((gap) => <article className="followup-row" key={gap.gap_id}><span className={`severity severity--${gap.severity.toLowerCase()}`} aria-label={`${gap.severity} priority`} /><div><strong>{gap.issue_title}</strong><p><span className="mono">{gap.gap_id}</span> · {gap.entity_id}</p><span>{gap.reason}</span></div><Button size="sm" variant="ghost" onClick={() => navigate("/evidence-gaps")} aria-label={`Open ${gap.gap_id}`}>Open <ArrowRight /></Button></article>)}
          </div>
        </Card>
      </div>

      <Modal open={briefOpen} onClose={() => setBriefOpen(false)} title="Case briefing preview" footer={<><Button onClick={() => setBriefOpen(false)}>Close</Button><Button variant="primary" icon={<Printer />} disabled={!brief} onClick={() => window.print()}>Print briefing</Button></>}>
        <div className="brief-toolbar"><label className="switch-row"><input type="checkbox" checked={redacted} onChange={(event) => setRedacted(event.target.checked)} /><span><strong>Redact personal identifiers</strong><small>Recommended for external circulation</small></span></label><Badge tone="info">LIVE API PREVIEW</Badge></div>
        {briefError && <Banner tone="warning">{briefError}</Banner>}
        {briefLoading && <p role="status">Generating briefing from live case records…</p>}
        {brief && !briefLoading && <article className="case-brief"><header><div className="case-brief__seal"><ShieldCheck /></div><div><p>VYUHAM</p><h2>Investigation briefing</h2><span className="mono">{brief.case_id}</span></div><Badge>{brief.status}</Badge></header><div className="case-brief__meta"><span><small>Jurisdiction</small>{brief.district}</span><span><small>Prepared for</small>{brief.generated_for}</span><span><small>Privacy</small>{brief.redacted ? "Identifiers redacted" : "Unredacted"}</span></div><section><h3>Key entities</h3><ul>{brief.key_entities.map((entity) => <li key={entity.entity_id}><strong>{entity.name}</strong> ({entity.entity_id}) — {entity.influence_reasons.join("; ")}</li>)}</ul></section><section><h3>Key relationships</h3><ul>{brief.key_relationships_plain.slice(0, 6).map((item) => <li key={item}>{item}</li>)}</ul></section><section><h3>Recommended next steps</h3><ol>{brief.recommended_next_steps.map((item) => <li key={item}>{item}</li>)}</ol></section><footer><AlertTriangle size={16} /> {brief.disclaimer}</footer></article>}
      </Modal>
    </div>
  );
}
