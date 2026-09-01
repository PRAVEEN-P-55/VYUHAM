import { Background, BackgroundVariant, Controls, Handle, MiniMap, Position, ReactFlow, type Edge, type Node, type NodeProps, useReactFlow } from "@xyflow/react";
import { Download, Filter, Focus, Info, Pause, Play, RotateCcw, Search, SlidersHorizontal } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { Badge, Banner, Button, Card, ConfidenceMeter, Drawer, EvidenceCard, Field, GraphLegend, Input, PageHeader, Select } from "../components/ui";
import { useAppContext } from "../context/AppContext";
import { useApiResource } from "../hooks/useApiResource";
import { api, type DocumentMention, type EntitySummary } from "../services/api";
import { asPercent, formatDate, titleCase } from "../utils/format";

type GraphNodeData = { label: string; type: string; date: number; important?: boolean };
type GraphEdgeData = { date: number; relation: string; confidence: number; explanation: string; evidence: string[] };
const entityClass = (type: string) => type.toLowerCase().replaceAll(" ", "-");
const entityLabel = (type: string) => ({ ACCOUNT: "Bank Account", ORG: "Organization" }[type] ?? titleCase(type));

function InvestigationNode({ data, selected }: NodeProps<Node<GraphNodeData>>) {
  return <div className={`investigation-node investigation-node--${entityClass(data.type)} ${selected ? "investigation-node--selected" : ""} ${data.important ? "investigation-node--important" : ""}`}><Handle type="target" position={Position.Top} /><span>{data.type.slice(0, 1)}</span><div><strong>{data.label}</strong><small>{data.type}</small></div><Handle type="source" position={Position.Bottom} /></div>;
}
const nodeTypes = { investigation: InvestigationNode };

function GraphActions({ onReset }: { onReset: () => void }) {
  const { fitView } = useReactFlow();
  return <div className="graph-quick-actions"><Button size="sm" icon={<RotateCcw />} onClick={onReset}>Recenter</Button><Button size="sm" icon={<Focus />} onClick={() => fitView({ padding: 0.2 })}>Fit view</Button></div>;
}

export function NetworkPage() {
  const location = useLocation();
  const { activeCaseId } = useAppContext();
  const [hops, setHops] = useState(2);
  const { data, loading, error } = useApiResource(() => api.graphQuery(activeCaseId, { hops }), [activeCaseId, hops]);
  const [time, setTime] = useState(12);
  const [playing, setPlaying] = useState(false);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<Edge<GraphEdgeData> | null>(null);
  const [relation, setRelation] = useState("All relationships");
  const [search, setSearch] = useState("");
  const [profile, setProfile] = useState<EntitySummary | null>(null);
  const [mentions, setMentions] = useState<DocumentMention[]>([]);
  const [profileError, setProfileError] = useState("");
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const incoming = (location.state as { entityId?: string } | null)?.entityId;
    if (incoming) setSelectedNode(incoming);
  }, [location.state]);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => { setReducedMotion(media.matches); if (media.matches) setPlaying(false); };
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => { setSelectedNode(null); setSelectedEdge(null); setTime(12); }, [activeCaseId]);
  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => setTime((value) => value >= 12 ? 1 : value + 1), 700);
    return () => window.clearInterval(timer);
  }, [playing]);
  useEffect(() => {
    if (!selectedNode) { setProfile(null); setMentions([]); return; }
    let current = true;
    setProfileError("");
    Promise.all([api.entitySummary(activeCaseId, selectedNode), api.documentMentions(activeCaseId, selectedNode)])
      .then(([entity, foundMentions]) => { if (current) { setProfile(entity); setMentions(foundMentions); } })
      .catch((reason: unknown) => { if (current) setProfileError(reason instanceof Error ? reason.message : "Unable to load entity profile"); });
    return () => { current = false; };
  }, [activeCaseId, selectedNode]);

  const dates = useMemo(() => [...new Set((data?.edges ?? []).map((edge) => edge.valid_from).filter(Boolean) as string[])].sort(), [data]);
  const dateStep = (date: string | null) => date && dates.length ? Math.max(1, Math.ceil(((dates.indexOf(date) + 1) / dates.length) * 12)) : 1;
  const graphEdges = useMemo<Edge<GraphEdgeData>[]>(() => (data?.edges ?? []).map((edge) => ({
    id: edge.edge_id,
    source: edge.source_entity_id,
    target: edge.target_entity_id,
    data: { date: dateStep(edge.valid_from), relation: edge.relationship_type, confidence: asPercent(edge.confidence), explanation: edge.evidence_summary.explanation, evidence: edge.evidence.map((item) => item.evidence_id) },
  })), [data, dates]);
  const graphNodes = useMemo<Node<GraphNodeData>[]>(() => (data?.nodes ?? []).map((node, index) => {
    const columns = Math.max(8, Math.ceil(Math.sqrt(data?.nodes.length ?? 1)));
    const connectedDates = graphEdges.filter((edge) => edge.source === node.entity_id || edge.target === node.entity_id).map((edge) => edge.data?.date ?? 1);
    return { id: node.entity_id, position: { x: (index % columns) * 185, y: Math.floor(index / columns) * 115 }, data: { label: node.label, type: entityLabel(node.entity_type), date: connectedDates.length ? Math.min(...connectedDates) : 1, important: node.risk_indicators.length > 0 }, type: "investigation" };
  }), [data, graphEdges]);

  const visibleNodes = useMemo(() => graphNodes.map((node) => {
    const outsideTime = node.data.date > time;
    const connected = !selectedNode || node.id === selectedNode || graphEdges.some((edge) => (edge.source === selectedNode && edge.target === node.id) || (edge.target === selectedNode && edge.source === node.id));
    const searchMatch = !search || `${node.id} ${node.data.label}`.toLowerCase().includes(search.toLowerCase());
    return { ...node, selected: node.id === selectedNode, style: { opacity: outsideTime || !connected || !searchMatch ? 0.12 : 1, transition: "opacity 180ms ease" } };
  }), [graphNodes, graphEdges, time, selectedNode, search]);
  const visibleEdges = useMemo(() => graphEdges.map((edge) => {
    const outsideTime = (edge.data?.date ?? 0) > time;
    const relationMatch = relation === "All relationships" || edge.data?.relation === relation;
    const connected = !selectedNode || edge.source === selectedNode || edge.target === selectedNode;
    const selected = selectedEdge?.id === edge.id;
    return { ...edge, animated: selected && playing, style: { stroke: selected ? "#2563EB" : edge.data?.confidence && edge.data.confidence < 75 ? "#F59E0B" : "#CBD5E1", strokeWidth: selected ? 3 : 1.7, opacity: outsideTime || !relationMatch || !connected ? 0.08 : 1, transition: "opacity 180ms ease" } };
  }), [graphEdges, time, relation, selectedNode, selectedEdge, playing]);
  const mention = mentions[0];

  return <div className="page page--network">
    <PageHeader title="Network Explorer" description="Trace possible relationships back to the evidence that created them." actions={<Button icon={<Download />} onClick={() => window.print()}>Export view</Button>} />
    {error && <Banner tone="warning" title="Could not load graph">{error}</Banner>}
    <Card className="graph-toolbar"><div className="graph-toolbar__search"><Search /><label className="sr-only" htmlFor="graph-search">Search graph entities</label><Input id="graph-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find an entity" /></div><Field label="Hops"><Select value={hops} onChange={(event) => setHops(Number(event.target.value))}><option value="1">1 hop</option><option value="2">2 hops</option><option value="3">3 hops</option><option value="4">4 hops</option></Select></Field><Field label="Relationship"><Select value={relation} onChange={(event) => setRelation(event.target.value)}><option>All relationships</option>{[...new Set(graphEdges.map((edge) => edge.data?.relation).filter(Boolean))].map((item) => <option key={item}>{item}</option>)}</Select></Field><Button icon={<Filter />}>More filters</Button></Card>
    <Card className="time-control"><div className="time-control__label"><SlidersHorizontal /><span><strong>Network history</strong><small>{dates.length ? `${formatDate(dates[0])}–${formatDate(dates.at(-1))}` : "No dated links"}</small></span></div><Button size="sm" variant={playing ? "primary" : "secondary"} icon={playing ? <Pause /> : <Play />} disabled={reducedMotion} title={reducedMotion ? "Playback is disabled by reduced-motion preferences" : undefined} onClick={() => setPlaying((value) => !value)} aria-pressed={playing}>{playing ? "Pause" : "Play"}</Button><div className="time-slider"><label htmlFor="network-time">Evidence window <strong>{time} of 12</strong></label><input id="network-time" type="range" min="1" max="12" value={time} onFocus={() => setPlaying(false)} onChange={(event) => { setTime(Number(event.target.value)); setPlaying(false); }} /><div><span>Earliest</span><span>Midpoint</span><span>Latest</span></div></div><Badge tone="info">{visibleNodes.filter((node) => Number(node.style?.opacity) === 1).length} entities visible</Badge></Card>
    <div className="graph-layout"><Card className="graph-canvas" aria-label="Interactive relationship network">{loading ? <p className="workspace-loading" role="status">Loading live graph…</p> : <ReactFlow nodes={visibleNodes} edges={visibleEdges} nodeTypes={nodeTypes} onNodeClick={(_, node) => { setSelectedNode(node.id); setSelectedEdge(null); }} onEdgeClick={(_, edge) => setSelectedEdge(edge as Edge<GraphEdgeData>)} onPaneClick={() => { setSelectedNode(null); setSelectedEdge(null); }} fitView minZoom={0.25} maxZoom={1.8} colorMode="light"><Background variant={BackgroundVariant.Dots} gap={18} size={1.2} color="#CBD5E1" /><MiniMap pannable zoomable nodeColor={(node) => `var(--entity-${entityClass((node.data as GraphNodeData).type)})`} maskColor="rgba(248,250,252,.82)" /><Controls showInteractive={false} /><GraphActions onReset={() => { setSelectedNode(null); setSelectedEdge(null); setSearch(""); setRelation("All relationships"); }} /></ReactFlow>}<GraphLegend /><div className="graph-help"><Info /><span>Select a node to inspect its source profile. Select a line to explain the connection.</span></div>{selectedEdge?.data && <aside className="edge-explanation" aria-live="polite"><div><span className="mono">{selectedEdge.id}</span><button onClick={() => setSelectedEdge(null)} aria-label="Close connection explanation">×</button></div><Badge tone={selectedEdge.data.confidence < 75 ? "warning" : "info"}>POSSIBLE RELATIONSHIP</Badge><h2>Explain this connection</h2><p>{selectedEdge.data.explanation}</p><ConfidenceMeter value={selectedEdge.data.confidence} /><strong>Supporting evidence</strong><ul>{selectedEdge.data.evidence.map((item) => <li key={item} className="mono">{item}</li>)}</ul></aside>}</Card></div>
    <Drawer open={Boolean(selectedNode)} onClose={() => setSelectedNode(null)} title="Entity profile">{profileError && <Banner tone="warning">{profileError}</Banner>}{selectedNode && !profile && !profileError && <p role="status">Loading source profile…</p>}{profile && <div className="entity-profile"><header><div className={`entity-avatar entity-avatar--${entityClass(entityLabel(profile.entity_type))}`}>{profile.entity_type.slice(0, 1)}</div><div><Badge tone="neutral">{entityLabel(profile.entity_type)}</Badge><h3>{profile.name}</h3><span className="mono">{profile.entity_id}</span></div></header><p>{profile.summary_text}</p>{profile.aliases.length > 0 && <section><h4>Known aliases</h4><div className="alias-list">{profile.aliases.map((alias) => <Badge tone="neutral" key={alias}>{alias}</Badge>)}</div></section>}<section><h4>Identity fields</h4><div className="identity-fields">{Object.entries(profile.identity_fields).filter(([, values]) => values.length).map(([label, values]) => <article key={label}><div><span>{titleCase(label)}</span><strong>{values.join(", ")}</strong></div><ConfidenceMeter value={asPercent(profile.confidence)} verified={profile.review_status === "CONFIRMED"} /></article>)}</div></section><section><h4>Evidence connections</h4>{profile.evidence_connections.slice(0, 6).map((connection, index) => <EvidenceCard key={`${connection.evidence_id}-${index}`} id={connection.evidence_id ?? "No evidence ID"} source={connection.source_type ?? "Record"} time={formatDate(connection.timestamp, true)}>{connection.chain}</EvidenceCard>)}</section>{mention && <section><h4>Source document match</h4><p className="section-note">Exact source excerpt and pixel bounding box returned by the backend.</p><div className="evidence-viewer"><div className="evidence-paper"><div className="paper-heading">SOURCE DOCUMENT {mention.document_id}</div><div className="paper-meta">{mention.image_path}</div><div className="source-highlight">{mention.matched_text}</div></div><div className="evidence-viewer__caption"><Badge tone="warning">OCR MATCH</Badge><span>Bounding box: x {mention.bounding_box.x}, y {mention.bounding_box.y}, w {mention.bounding_box.width}, h {mention.bounding_box.height}</span></div></div></section>}</div>}</Drawer>
  </div>;
}
