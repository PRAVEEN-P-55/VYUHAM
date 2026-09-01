import { Background, BackgroundVariant, Controls, Handle, MarkerType, MiniMap, Position, ReactFlow, type Edge, type Node, type NodeProps, useReactFlow } from "@xyflow/react";
import { Building2, Car, Clock3, Download, Eye, Focus, Info, Landmark, MapPin, Network, Pause, Phone, Pin, Play, RotateCcw, Route as RouteIcon, Search, Siren, SlidersHorizontal, UserRound } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Badge, Banner, Button, Card, ConfidenceMeter, Drawer, EvidenceCard, Field, GraphLegend, PageHeader, Select } from "../components/ui";
import { useAppContext } from "../context/AppContext";
import { useApiResource } from "../hooks/useApiResource";
import { api, type DocumentMention, type EntitySummary } from "../services/api";
import { asPercent, formatDate, titleCase } from "../utils/format";

type GraphNodeData = { label: string; type: string; date: number; important?: boolean; root?: boolean; pinned?: boolean; depth: number };
type GraphEdgeData = { date: number; relation: string; confidence: number; explanation: string; evidence: string[]; reviewStatus: string };

const entityClass = (type: string) => type.toLowerCase().replaceAll(" ", "-");
const entityLabel = (type: string) => ({ ACCOUNT: "Bank Account", ORG: "Organization" }[type] ?? titleCase(type));
const relationColour = (relation: string) => {
  if (relation === "CALLED" || relation === "USES_PHONE") return "var(--relation-communication)";
  if (relation === "TRANSFERRED_TO" || relation === "OWNS_ACCOUNT") return "var(--relation-financial)";
  if (relation === "OWNS_VEHICLE") return "var(--relation-vehicle)";
  if (relation === "MEMBER_OF" || relation === "ASSOCIATED_WITH") return "var(--relation-association)";
  if (relation === "CO_LOCATED_WITH") return "var(--relation-location)";
  if (relation === "PARTICIPATED_IN") return "var(--relation-incident)";
  return "var(--relation-other)";
};

function InvestigationNode({ data, selected }: NodeProps<Node<GraphNodeData>>) {
  const person = data.type === "Person";
  const Icon = data.type === "Person" ? UserRound
    : data.type === "Phone" ? Phone
    : data.type === "Bank Account" ? Landmark
    : data.type === "Organization" ? Building2
    : data.type === "Location" ? MapPin
    : data.type === "Vehicle" ? Car
    : data.type === "Incident" ? Siren
    : Network;
  return <div className={`investigation-node investigation-node--${entityClass(data.type)} ${selected ? "investigation-node--selected" : ""} ${data.important ? "investigation-node--important" : ""} ${data.root ? "investigation-node--root" : ""} ${data.pinned ? "investigation-node--pinned" : ""} ${person && !data.root ? "investigation-node--connected-person" : ""}`}>
    <Handle type="target" position={Position.Top} />
    <span className="investigation-node__orb"><Icon aria-hidden="true" />{data.pinned && <i className="node-pin"><Pin aria-hidden="true" /></i>}</span>
    <div className="investigation-node__label"><strong>{data.label}</strong><small>{data.root ? "SEARCH FOCUS" : data.type}</small></div>
    <Handle type="source" position={Position.Bottom} />
  </div>;
}
const nodeTypes = { investigation: InvestigationNode };

function GraphActions({ selectedNode, pinned, onReset, onView, onTrace, onPin, onDepth, onTimeline }: { selectedNode: string | null; pinned: boolean; onReset: () => void; onView: () => void; onTrace: () => void; onPin: () => void; onDepth: () => void; onTimeline: () => void }) {
  const { fitView, getNode } = useReactFlow();
  useEffect(() => {
    if (!selectedNode) return;
    const node = getNode(selectedNode);
    if (node) void fitView({ nodes: [node], padding: 1.5, duration: 380, maxZoom: 1.25 });
  }, [fitView, getNode, selectedNode]);
  return <div className={`graph-quick-actions ${selectedNode ? "graph-quick-actions--context" : ""}`}>
    {selectedNode ? <>
      <span className="graph-context-label"><Focus />Selected</span>
      <Button size="sm" icon={<Eye />} onClick={onView}>View evidence</Button>
      <Button size="sm" icon={<RouteIcon />} onClick={onTrace}>Trace path</Button>
      <Button size="sm" icon={<Clock3 />} onClick={onTimeline}>Timeline</Button>
      <Button size="sm" icon={<Network />} onClick={onDepth}>Expand 2 hops</Button>
      <Button size="sm" variant={pinned ? "primary" : "secondary"} icon={<Pin />} onClick={onPin}>{pinned ? "Pinned" : "Pin node"}</Button>
    </> : <><Button size="sm" icon={<RotateCcw />} onClick={onReset}>Clear selection</Button><Button size="sm" icon={<Focus />} onClick={() => fitView({ padding: 0.18, duration: 300 })}>Fit focused network</Button></>}
  </div>;
}

function radialPositions(rootId: string | null, nodes: string[], edges: Edge<GraphEdgeData>[]) {
  const positions = new Map<string, { x: number; y: number; depth: number }>();
  if (!rootId || !nodes.includes(rootId)) {
    const columns = Math.max(6, Math.ceil(Math.sqrt(nodes.length || 1)));
    nodes.forEach((id, index) => positions.set(id, { x: (index % columns) * 190, y: Math.floor(index / columns) * 120, depth: 0 }));
    return positions;
  }

  const adjacency = new Map<string, Set<string>>();
  nodes.forEach((id) => adjacency.set(id, new Set()));
  edges.forEach((edge) => {
    adjacency.get(edge.source)?.add(edge.target);
    adjacency.get(edge.target)?.add(edge.source);
  });
  const depth = new Map<string, number>([[rootId, 0]]);
  const queue = [rootId];
  while (queue.length) {
    const current = queue.shift()!;
    for (const neighbour of adjacency.get(current) ?? []) {
      if (!depth.has(neighbour)) { depth.set(neighbour, (depth.get(current) ?? 0) + 1); queue.push(neighbour); }
    }
  }
  positions.set(rootId, { x: 0, y: 0, depth: 0 });
  const groups = new Map<number, string[]>();
  nodes.filter((id) => id !== rootId).forEach((id) => {
    const ring = depth.get(id) ?? 1;
    groups.set(ring, [...(groups.get(ring) ?? []), id]);
  });
  groups.forEach((ids, ring) => {
    const radius = 270 + (ring - 1) * 300;
    ids.forEach((id, index) => {
      const angle = -Math.PI / 2 + (index * Math.PI * 2) / ids.length;
      positions.set(id, { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius * 0.72, depth: ring });
    });
  });
  return positions;
}

export function NetworkPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { activeCaseId, setActiveCaseId } = useAppContext();
  const incomingEntity = searchParams.get("root") ?? (location.state as { entityId?: string } | null)?.entityId ?? null;
  const incomingCase = searchParams.get("case");
  const [rootEntityId, setRootEntityId] = useState<string | null>(incomingEntity);
  const [hops, setHops] = useState(incomingEntity ? 1 : 2);
  const { data, loading, error } = useApiResource(() => api.graphQuery(activeCaseId, { root_entity_id: rootEntityId ?? undefined, hops }), [activeCaseId, rootEntityId, hops]);
  const [time, setTime] = useState(12);
  const [playing, setPlaying] = useState(false);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<Edge<GraphEdgeData> | null>(null);
  const [relation, setRelation] = useState("All relationships");
  const [profile, setProfile] = useState<EntitySummary | null>(null);
  const [mentions, setMentions] = useState<DocumentMention[]>([]);
  const [profileError, setProfileError] = useState("");
  const [reducedMotion, setReducedMotion] = useState(false);
  const [pinnedNodes, setPinnedNodes] = useState<Set<string>>(new Set());
  const [focusTrail, setFocusTrail] = useState<string[]>([]);
  const [tracedEdges, setTracedEdges] = useState<Set<string>>(new Set());
  const [hoveredEdge, setHoveredEdge] = useState<{ edge: Edge<GraphEdgeData>; x: number; y: number } | null>(null);

  useEffect(() => {
    if (incomingCase && incomingCase !== activeCaseId) setActiveCaseId(incomingCase);
    if (incomingEntity) setRootEntityId(incomingEntity);
  }, [incomingCase, incomingEntity, activeCaseId, setActiveCaseId]);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => { setReducedMotion(media.matches); if (media.matches) setPlaying(false); };
    update(); media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => setTime((value) => value >= 12 ? 1 : value + 1), 700);
    return () => window.clearInterval(timer);
  }, [playing]);
  useEffect(() => {
    if (!selectedNode) { setProfile(null); setMentions([]); return; }
    let current = true;
    setProfile(null); setMentions([]); setProfileError("");
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
    label: titleCase(edge.relationship_type),
    data: { date: dateStep(edge.valid_from), relation: edge.relationship_type, confidence: asPercent(edge.confidence), explanation: edge.evidence_summary.explanation, evidence: edge.evidence.map((item) => item.evidence_id), reviewStatus: edge.review_status },
  })), [data, dates]);
  const positions = useMemo(() => radialPositions(rootEntityId, (data?.nodes ?? []).map((node) => node.entity_id), graphEdges), [data, graphEdges, rootEntityId]);
  const graphNodes = useMemo<Node<GraphNodeData>[]>(() => (data?.nodes ?? []).map((node) => {
    const connectedDates = graphEdges.filter((edge) => edge.source === node.entity_id || edge.target === node.entity_id).map((edge) => edge.data?.date ?? 1);
    const position = positions.get(node.entity_id) ?? { x: 0, y: 0, depth: 0 };
    return { id: node.entity_id, position, data: { label: node.label, type: entityLabel(node.entity_type), date: connectedDates.length ? Math.min(...connectedDates) : 1, important: node.risk_indicators.length > 0, root: node.entity_id === rootEntityId, pinned: pinnedNodes.has(node.entity_id), depth: position.depth }, type: "investigation" };
  }), [data, graphEdges, positions, rootEntityId, pinnedNodes]);

  const filteredEdges = useMemo(() => graphEdges.filter((edge) => (edge.data?.date ?? 0) <= time && (relation === "All relationships" || edge.data?.relation === relation)), [graphEdges, relation, time]);
  const visibleNodeIds = useMemo(() => new Set([...(rootEntityId ? [rootEntityId] : []), ...filteredEdges.flatMap((edge) => [edge.source, edge.target])]), [filteredEdges, rootEntityId]);
  const visibleNodes = useMemo(() => graphNodes.filter((node) => !rootEntityId || visibleNodeIds.has(node.id)).map((node) => ({ ...node, selected: node.id === selectedNode })), [graphNodes, rootEntityId, selectedNode, visibleNodeIds]);
  const selectedNeighbourIds = useMemo(() => selectedNode ? new Set(filteredEdges.filter((edge) => edge.source === selectedNode || edge.target === selectedNode).flatMap((edge) => [edge.source, edge.target])) : null, [filteredEdges, selectedNode]);
  const focusedNodes = useMemo(() => visibleNodes.map((node) => ({ ...node, style: { opacity: selectedNeighbourIds && !selectedNeighbourIds.has(node.id) && !pinnedNodes.has(node.id) ? .2 : 1 } })), [visibleNodes, selectedNeighbourIds, pinnedNodes]);
  const visibleEdges = useMemo(() => filteredEdges.map((edge) => {
    const selected = selectedEdge?.id === edge.id;
    const traced = tracedEdges.has(edge.id);
    const related = !selectedNode || edge.source === selectedNode || edge.target === selectedNode;
    const colour = relationColour(edge.data?.relation ?? "");
    return { ...edge, animated: (selected && playing) || traced, markerEnd: { type: MarkerType.ArrowClosed, color: colour, width: 14, height: 14 }, labelStyle: { fill: colour, fontSize: 9, fontWeight: 700 }, labelBgStyle: { fill: "#ffffff", fillOpacity: 0.94 }, labelBgPadding: [5, 3] as [number, number], labelBgBorderRadius: 4, style: { stroke: traced ? "#2563eb" : colour, strokeWidth: traced ? 4.5 : selected ? 4 : edge.data?.relation === "CALLED" || edge.data?.relation === "TRANSFERRED_TO" ? 2.8 : 2, strokeDasharray: edge.data?.reviewStatus === "AI_SUGGESTED" ? "4 6" : undefined, opacity: selectedEdge && !selected ? 0.24 : related ? 0.9 : 0.12 } };
  }), [filteredEdges, playing, selectedEdge, selectedNode, tracedEdges]);
  const rootNode = data?.nodes.find((node) => node.entity_id === rootEntityId);
  const mention = mentions[0];

  const selectNode = (nodeId: string) => {
    setSelectedNode(nodeId);
    setSelectedEdge(null);
    setFocusTrail((items) => [...items.filter((item) => item !== nodeId), nodeId].slice(-5));
  };
  const tracePath = () => {
    if (!selectedNode || !rootEntityId) return;
    const parent = new Map<string, { node: string; edge: string }>();
    const seen = new Set([rootEntityId]);
    const queue = [rootEntityId];
    while (queue.length && !seen.has(selectedNode)) {
      const current = queue.shift()!;
      filteredEdges.filter((edge) => edge.source === current || edge.target === current).forEach((edge) => {
        const next = edge.source === current ? edge.target : edge.source;
        if (!seen.has(next)) { seen.add(next); parent.set(next, { node: current, edge: edge.id }); queue.push(next); }
      });
    }
    const path: string[] = [];
    let cursor = selectedNode;
    while (cursor !== rootEntityId && parent.has(cursor)) { const step = parent.get(cursor)!; path.unshift(step.edge); cursor = step.node; }
    setTracedEdges(new Set());
    path.forEach((edgeId, index) => window.setTimeout(() => setTracedEdges((items) => new Set([...items, edgeId])), reducedMotion ? 0 : index * 330));
  };

  return <div className="page page--network">
    <PageHeader title="Network Explorer" description={rootNode ? `Focused on ${rootNode.label}. Only evidence-backed connections within ${hops} ${hops === 1 ? "hop" : "hops"} are shown.` : "Trace possible relationships back to the evidence that created them."} actions={<><Button icon={<Search />} onClick={() => navigate("/search")}>Search another clue</Button><Button icon={<Download />} onClick={() => window.print()}>Export view</Button></>} />
    {error && <Banner tone="warning" title="Could not load graph">{error}</Banner>}
    {rootNode && <Card className="focus-summary"><div className="focus-summary__mark"><Focus /></div><div><span>INVESTIGATION FOCUS</span><strong>{rootNode.label}</strong><small>{rootNode.entity_id} · {entityLabel(rootNode.entity_type)} · {activeCaseId}</small></div><Badge tone="info">CENTERED</Badge><p>{visibleNodes.length - 1} connected entities · {visibleEdges.length} relationship paths</p></Card>}
    {(rootEntityId || focusTrail.length > 0) && <nav className="graph-breadcrumbs" aria-label="Investigation focus trail"><button onClick={() => { setSelectedNode(null); setFocusTrail([]); }}>CASE {activeCaseId}</button>{rootEntityId && <><span>›</span><button onClick={() => selectNode(rootEntityId)}>{rootNode?.label ?? rootEntityId}</button></>}{focusTrail.filter((id) => id !== rootEntityId).map((id) => <span className="breadcrumb-step" key={id}><i>›</i><button onClick={() => selectNode(id)}>{graphNodes.find((node) => node.id === id)?.data.label ?? id}</button></span>)}</nav>}
    {!rootEntityId && <Banner tone="info" title="Showing the case overview">Use “Search another clue” to choose a person, phone, vehicle, account, or identifier and create a noise-free focused network.</Banner>}
    <Card className="graph-toolbar"><div className="graph-scope"><Network /><span><strong>{rootEntityId ? "Focused network" : "Case network"}</strong><small>{rootEntityId ? "Unrelated entities are excluded" : `${activeCaseId} overview`}</small></span></div><Field label="Connection depth"><Select value={hops} onChange={(event) => setHops(Number(event.target.value))}><option value="1">Direct links only</option><option value="2">Up to 2 hops</option><option value="3">Up to 3 hops</option><option value="4">Up to 4 hops</option></Select></Field><Field label="Relationship"><Select value={relation} onChange={(event) => { setRelation(event.target.value); setSelectedEdge(null); }}><option>All relationships</option>{[...new Set(graphEdges.map((edge) => edge.data?.relation).filter(Boolean))].map((item) => <option value={item} key={item}>{titleCase(item!)}</option>)}</Select></Field><Badge tone="info">{visibleNodes.length} visible</Badge></Card>
    <Card className="time-control"><div className="time-control__label"><SlidersHorizontal /><span><strong>Network history</strong><small>{dates.length ? `${formatDate(dates[0])}–${formatDate(dates.at(-1))}` : "No dated links"}</small></span></div><Button size="sm" variant={playing ? "primary" : "secondary"} icon={playing ? <Pause /> : <Play />} disabled={reducedMotion} title={reducedMotion ? "Playback is disabled by reduced-motion preferences" : undefined} onClick={() => setPlaying((value) => !value)} aria-pressed={playing}>{playing ? "Pause" : "Play"}</Button><div className="time-slider"><label htmlFor="network-time">Evidence window <strong>{time} of 12</strong></label><input id="network-time" type="range" min="1" max="12" value={time} onFocus={() => setPlaying(false)} onChange={(event) => { setTime(Number(event.target.value)); setPlaying(false); }} /><div><span>Earliest</span><span>Midpoint</span><span>Latest</span></div></div><Badge tone="neutral">Solid = confirmed · Dashed = suggested</Badge></Card>
    <div className="graph-layout"><Card className="graph-canvas" aria-label="Interactive focused relationship network">{loading ? <p className="workspace-loading" role="status">Building focused network…</p> : <ReactFlow key={`${activeCaseId}-${rootEntityId}-${hops}`} nodes={focusedNodes} edges={visibleEdges} nodeTypes={nodeTypes} onNodeClick={(_, node) => selectNode(node.id)} onEdgeClick={(_, edge) => { setSelectedEdge(edge as Edge<GraphEdgeData>); setSelectedNode(null); }} onEdgeMouseEnter={(event, edge) => setHoveredEdge({ edge: edge as Edge<GraphEdgeData>, x: event.clientX, y: event.clientY })} onEdgeMouseMove={(event, edge) => setHoveredEdge({ edge: edge as Edge<GraphEdgeData>, x: event.clientX, y: event.clientY })} onEdgeMouseLeave={() => setHoveredEdge(null)} onPaneClick={() => { setSelectedNode(null); setSelectedEdge(null); setTracedEdges(new Set()); }} fitView fitViewOptions={{ padding: 0.2 }} minZoom={0.2} maxZoom={1.8} colorMode="light"><Background variant={BackgroundVariant.Dots} gap={18} size={1.2} color="#CBD5E1" /><MiniMap pannable zoomable nodeColor={(node) => node.id === rootEntityId ? "#1d4ed8" : `var(--entity-${entityClass((node.data as GraphNodeData).type)})`} maskColor="rgba(248,250,252,.82)" /><Controls showInteractive={false} /><GraphActions selectedNode={selectedNode} pinned={Boolean(selectedNode && pinnedNodes.has(selectedNode))} onView={() => document.querySelector(".entity-profile section:last-of-type")?.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" })} onTrace={tracePath} onPin={() => selectedNode && setPinnedNodes((items) => { const next = new Set(items); if (next.has(selectedNode)) next.delete(selectedNode); else next.add(selectedNode); return next; })} onDepth={() => setHops((value) => Math.max(2, value))} onTimeline={() => navigate("/timeline", { state: { entityId: selectedNode } })} onReset={() => { setSelectedNode(null); setSelectedEdge(null); setRelation("All relationships"); setTime(12); setTracedEdges(new Set()); }} /></ReactFlow>}<GraphLegend />{hoveredEdge?.edge.data && <div className="edge-hover-preview" style={{ left: hoveredEdge.x + 12, top: hoveredEdge.y + 12 }}><strong>{titleCase(hoveredEdge.edge.data.relation)}</strong><span>{hoveredEdge.edge.data.evidence.length} source records · {hoveredEdge.edge.data.confidence}% confidence</span></div>}<div className="graph-help"><Info /><span>People use a blue circular marker. Select a node for its profile or a labeled line for the evidence behind that connection.</span></div>{!loading && rootEntityId && visibleEdges.length === 0 && <div className="graph-no-links"><Network /><strong>No links in this filter</strong><span>Expand the time window, choose all relationships, or increase connection depth.</span></div>}{selectedEdge?.data && <aside className="edge-explanation" aria-live="polite"><div><span className="mono">{selectedEdge.id}</span><button onClick={() => setSelectedEdge(null)} aria-label="Close connection explanation">×</button></div><Badge tone={selectedEdge.data.confidence < 75 ? "warning" : "info"}>{titleCase(selectedEdge.data.relation)}</Badge><h2>Explain this connection</h2><p>{selectedEdge.data.explanation}</p><ConfidenceMeter value={selectedEdge.data.confidence} /><strong>Supporting evidence</strong><ul>{selectedEdge.data.evidence.map((item) => <li key={item} className="mono">{item}</li>)}</ul></aside>}</Card></div>
    <Drawer open={Boolean(selectedNode)} onClose={() => setSelectedNode(null)} title="Entity profile">{profileError && <Banner tone="warning">{profileError}</Banner>}{selectedNode && !profile && !profileError && <p role="status">Loading source profile…</p>}{profile && <div className="entity-profile"><header><div className={`entity-avatar entity-avatar--${entityClass(entityLabel(profile.entity_type))}`}>{profile.entity_type.slice(0, 1)}</div><div><Badge tone="neutral">{entityLabel(profile.entity_type)}</Badge><h3>{profile.name}</h3><span className="mono">{profile.entity_id}</span></div></header><p>{profile.summary_text}</p>{profile.aliases.length > 0 && <section><h4>Known aliases</h4><div className="alias-list">{profile.aliases.map((alias) => <Badge tone="neutral" key={alias}>{alias}</Badge>)}</div></section>}<section><h4>Identity fields</h4><div className="identity-fields">{Object.entries(profile.identity_fields).filter(([, values]) => values.length).map(([label, values]) => <article key={label}><div><span>{titleCase(label)}</span><strong>{values.join(", ")}</strong></div><ConfidenceMeter value={asPercent(profile.confidence)} verified={profile.review_status === "CONFIRMED"} /></article>)}</div></section><section><h4>Evidence connections</h4>{profile.evidence_connections.slice(0, 6).map((connection, index) => <EvidenceCard key={`${connection.evidence_id}-${index}`} id={connection.evidence_id ?? "No evidence ID"} source={connection.source_type ?? "Record"} time={formatDate(connection.timestamp, true)}>{connection.chain}</EvidenceCard>)}</section>{mention && <section><h4>Source document match</h4><p className="section-note">Exact source excerpt and pixel bounding box returned by the backend.</p><div className="evidence-viewer"><div className="evidence-paper"><div className="paper-heading">SOURCE DOCUMENT {mention.document_id}</div><div className="paper-meta">{mention.image_path}</div><div className="source-highlight">{mention.matched_text}</div></div><div className="evidence-viewer__caption"><Badge tone="warning">OCR MATCH</Badge><span>Bounding box: x {mention.bounding_box.x}, y {mention.bounding_box.y}, w {mention.bounding_box.width}, h {mention.bounding_box.height}</span></div></div></section>}</div>}</Drawer>
  </div>;
}
