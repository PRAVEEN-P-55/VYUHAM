import {
  Background, BackgroundVariant, Controls, Handle, MarkerType,
  Position, ReactFlow,
  type Edge, type Node, type NodeProps, useReactFlow,
} from "@xyflow/react";
import {
  ArrowLeft, Building2, Car, ChevronDown, ChevronUp, Clock3, Download,
  Eye, FileText, Focus, Landmark, MapPin, Network, Pause, Phone,
  Pin, Play, RotateCcw, Route as RouteIcon, Search, Siren,
  SlidersHorizontal, UserRound, X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import {
  Badge, Banner, Button, Card, ConfidenceMeter,
  Drawer, EvidenceCard, Field, PageHeader, Select,
} from "../components/ui";
import { useAppContext } from "../context/AppContext";
import { useApiResource } from "../hooks/useApiResource";
import { api, type DocumentMention, type EntitySummary, type GraphNode as ApiGraphNode } from "../services/api";
import { asPercent, formatDate, titleCase } from "../utils/format";

// ─── types ───────────────────────────────────────────────────────────────────
type GraphNodeData = {
  label: string; type: string; date: number;
  important?: boolean; root?: boolean; pinned?: boolean;
  depth: number; isSeed?: boolean; isDoc?: boolean; rootCaption?: string;
};
type GraphEdgeData = {
  date: number; relation: string; confidence: number;
  explanation: string; evidence: string[]; reviewStatus: string;
};

// ─── helpers ─────────────────────────────────────────────────────────────────
const entityClass = (type: string) => type.toLowerCase().replaceAll(" ", "-");
const entityLabel = (type: string) =>
  ({ ACCOUNT: "Bank Account", ORG: "Organization", DOCUMENT: "Evidence" }[type] ?? titleCase(type));

const relationColour = (relation: string) => {
  if (relation === "CALLED" || relation === "CALLS" || relation === "USES_PHONE") return "var(--relation-communication)";
  if (relation === "TRANSFERRED_TO" || relation === "TRANSFERS_TO") return "var(--relation-association)";
  if (relation === "MEMBER_OF" || relation === "ASSOCIATED_WITH") return "var(--relation-association)";
  if (relation === "CO_LOCATED_WITH") return "var(--relation-location)";
  if (relation === "PARTICIPATED_IN") return "var(--relation-incident)";
  return "var(--relation-other)";
};

const iconFor = (type: string) => {
  if (type === "Person") return UserRound;
  if (type === "Phone") return Phone;
  if (type === "Bank Account") return Landmark;
  if (type === "Organization") return Building2;
  if (type === "Location") return MapPin;
  if (type === "Vehicle") return Car;
  if (type === "Incident") return Siren;
  if (type === "Evidence") return FileText;
  return Network;
};

// ─── radial layout ────────────────────────────────────────────────────────────
// ─── custom node ─────────────────────────────────────────────────────────────
function investigationPositions(
  rootId: string | null,
  nodes: Array<{ id: string; type: string }>,
  edges: Edge<GraphEdgeData>[],
): Map<string, { x: number; y: number; depth: number }> {
  const positions = new Map<string, { x: number; y: number; depth: number }>();
  const nodeIds = nodes.map((node) => node.id);

  if (!rootId || !nodeIds.includes(rootId)) {
    const cols = Math.max(5, Math.ceil(Math.sqrt(nodeIds.length || 1)));
    nodes.forEach((node, index) => positions.set(node.id, {
      x: (index % cols) * 170,
      y: Math.floor(index / cols) * 112,
      depth: 0,
    }));
    return positions;
  }

  const adjacency = new Map<string, Set<string>>();
  nodeIds.forEach((id) => adjacency.set(id, new Set()));
  edges.forEach((edge) => {
    adjacency.get(edge.source)?.add(edge.target);
    adjacency.get(edge.target)?.add(edge.source);
  });
  const depth = new Map<string, number>([[rootId, 0]]);
  const queue = [rootId];
  while (queue.length) {
    const current = queue.shift()!;
    for (const neighbour of adjacency.get(current) ?? []) {
      if (!depth.has(neighbour)) {
        depth.set(neighbour, (depth.get(current) ?? 0) + 1);
        queue.push(neighbour);
      }
    }
  }
  positions.set(rootId, { x: 0, y: 0, depth: 0 });

  const sectors: Record<string, { angle: number; spread: number }> = {
    "bank-account": { angle: -1.48, spread: 0.56 },
    vehicle: { angle: -2.42, spread: 0.58 },
    phone: { angle: 2.9, spread: 0.82 },
    person: { angle: 1.28, spread: 1.58 },
    location: { angle: -0.48, spread: 0.34 },
    incident: { angle: -0.48, spread: 0.34 },
    organization: { angle: 0.04, spread: 0.38 },
    evidence: { angle: -1.57, spread: 0.35 },
    unknown: { angle: 0.55, spread: 0.7 },
  };
  const xScale = 1.34;
  const yScale = 0.62;
  const angles = new Map<string, number>([[rootId, 0]]);
  const directGroups = new Map<string, Array<{ id: string; type: string }>>();
  nodes.filter((node) => depth.get(node.id) === 1).forEach((node) => {
    const key = entityClass(entityLabel(node.type));
    directGroups.set(key, [...(directGroups.get(key) ?? []), node]);
  });

  directGroups.forEach((items, key) => {
    const sector = sectors[key] ?? sectors.unknown;
    items
      .sort((a, b) => a.id.localeCompare(b.id))
      .forEach((node, index) => {
        const offset = items.length === 1 ? 0 : index / (items.length - 1) - 0.5;
        const angle = sector.angle + offset * sector.spread;
        const radius = 258 + (index % 2) * 10;
        angles.set(node.id, angle);
        positions.set(node.id, {
          x: Math.cos(angle) * radius * xScale,
          y: Math.sin(angle) * radius * yScale,
          depth: 1,
        });
      });
  });

  // Place indirect entities beside the neighbours that led to them. This keeps
  // branches local instead of forcing second-hop links back through the centre.
  const usedAngleBuckets = new Map<string, number>();
  nodes
    .filter((node) => (depth.get(node.id) ?? 99) > 1)
    .sort((a, b) => (depth.get(a.id) ?? 99) - (depth.get(b.id) ?? 99) || a.id.localeCompare(b.id))
    .forEach((node) => {
      const neighbourAngles = [...(adjacency.get(node.id) ?? [])]
        .map((id) => angles.get(id))
        .filter((angle): angle is number => angle !== undefined);
      const fallback = sectors[entityClass(entityLabel(node.type))] ?? sectors.unknown;
      let angle = fallback.angle;
      if (neighbourAngles.length) {
        const x = neighbourAngles.reduce((sum, value) => sum + Math.cos(value), 0);
        const y = neighbourAngles.reduce((sum, value) => sum + Math.sin(value), 0);
        angle = Math.atan2(y, x);
      }
      const bucket = (Math.round(angle * 5) / 5).toFixed(1);
      const used = usedAngleBuckets.get(bucket) ?? 0;
      if (used > 0) {
        const direction = used % 2 ? 1 : -1;
        angle += direction * Math.ceil(used / 2) * 0.18;
      }
      usedAngleBuckets.set(bucket, used + 1);
      const ring = Math.min(depth.get(node.id) ?? 2, 3);
      const radius = 430 + (ring - 2) * 116;
      angles.set(node.id, angle);
      positions.set(node.id, {
        x: Math.cos(angle) * radius * xScale,
        y: Math.sin(angle) * radius * yScale,
        depth: ring,
      });
    });

  // Disconnected results remain visible without disturbing the investigation tree.
  nodes.filter((node) => !positions.has(node.id)).forEach((node, index) => {
    const angle = index * 0.72;
    positions.set(node.id, {
      x: Math.cos(angle) * 570 * xScale,
      y: Math.sin(angle) * 570 * yScale,
      depth: 3,
    });
  });

  return positions;
}

type HandleSide = "top" | "right" | "bottom" | "left";
const nearestHandle = (
  from: { x: number; y: number },
  to: { x: number; y: number },
): HandleSide => {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? "right" : "left";
  return dy > 0 ? "bottom" : "top";
};

function InvestigationNode({ data, selected }: NodeProps<Node<GraphNodeData>>) {
  const Icon = iconFor(data.type);
  const isDoc = data.isDoc;
  const isSeed = data.isSeed && !isDoc;
  return (
    <div
      className={[
        "investigation-node",
        `investigation-node--${entityClass(data.type)}`,
        selected ? "investigation-node--selected" : "",
        data.important ? "investigation-node--important" : "",
        data.root ? "investigation-node--root" : "",
        data.pinned ? "investigation-node--pinned" : "",
        isDoc ? "investigation-node--document" : "",
        isSeed ? "investigation-node--seed" : "",
        data.type === "Person" && !data.root && !isSeed ? "investigation-node--connected-person" : "",
      ].filter(Boolean).join(" ")}
    >
      <Handle id="target-top" type="target" position={Position.Top} />
      <Handle id="target-right" type="target" position={Position.Right} />
      <Handle id="target-bottom" type="target" position={Position.Bottom} />
      <Handle id="target-left" type="target" position={Position.Left} />
      <Handle id="source-top" type="source" position={Position.Top} />
      <Handle id="source-right" type="source" position={Position.Right} />
      <Handle id="source-bottom" type="source" position={Position.Bottom} />
      <Handle id="source-left" type="source" position={Position.Left} />
      <span className="investigation-node__orb">
        <Icon aria-hidden="true" />
        {data.pinned && <i className="node-pin"><Pin aria-hidden="true" /></i>}
        {isDoc && <i className="node-doc-badge" aria-hidden="true" />}
      </span>
      <div className="investigation-node__label">
        <strong>{data.label}</strong>
        <small>{data.root ? (data.rootCaption ?? "CENTRAL FOCUS") : isSeed ? "FROM DOCUMENT" : data.type}</small>
      </div>
    </div>
  );
}
const nodeTypes = { investigation: InvestigationNode };

// ─── graph actions toolbar ────────────────────────────────────────────────────
function GraphActions({
  selectedNode, pinned, onReset, onView, onTrace, onPin, onDepth, onTimeline,
}: {
  selectedNode: string | null; pinned: boolean;
  onReset: () => void; onView: () => void; onTrace: () => void;
  onPin: () => void; onDepth: () => void; onTimeline: () => void;
}) {
  const { fitView, getNode } = useReactFlow();
  useEffect(() => {
    if (!selectedNode) return;
    const node = getNode(selectedNode);
    if (node) void fitView({ nodes: [node], padding: 1.5, duration: 380, maxZoom: 1.25 });
  }, [fitView, getNode, selectedNode]);

  return (
    <div className={`graph-quick-actions ${selectedNode ? "graph-quick-actions--context" : ""}`}>
      {selectedNode ? (
        <>
          <span className="graph-context-label"><Focus />Selected</span>
          <Button size="sm" icon={<Eye />} onClick={onView}>View evidence</Button>
          <Button size="sm" icon={<RouteIcon />} onClick={onTrace}>Trace path</Button>
          <Button size="sm" icon={<Clock3 />} onClick={onTimeline}>Timeline</Button>
          <Button size="sm" icon={<Network />} onClick={onDepth}>Expand 2 hops</Button>
          <Button size="sm" variant={pinned ? "primary" : "secondary"} icon={<Pin />} onClick={onPin}>
            {pinned ? "Pinned" : "Pin node"}
          </Button>
        </>
      ) : (
        <>
          <Button size="sm" icon={<RotateCcw />} onClick={onReset}>Clear selection</Button>
          <Button size="sm" icon={<Focus />} onClick={() => fitView({ padding: 0.18, duration: 300 })}>
            Fit network
          </Button>
        </>
      )}
    </div>
  );
}

// ─── table view ──────────────────────────────────────────────────────────────
type SortDir = "asc" | "desc";

function NetworkTable({
  nodes, edges, onSelectNode,
}: {
  nodes: ApiGraphNode[];
  edges: { edge_id: string; source_entity_id: string; target_entity_id: string; relationship_type: string; confidence: number; review_status: string }[];
  onSelectNode: (id: string) => void;
}) {
  const [tab, setTab] = useState<"nodes" | "edges">("nodes");
  const [nodeSort, setNodeSort] = useState<{ col: string; dir: SortDir }>({ col: "label", dir: "asc" });
  const [edgeSort, setEdgeSort] = useState<{ col: string; dir: SortDir }>({ col: "relationship_type", dir: "asc" });
  const [nodeSearch, setNodeSearch] = useState("");
  const [edgeSearch, setEdgeSearch] = useState("");

  const sortIcon = (col: string, current: { col: string; dir: SortDir }) =>
    current.col === col ? (current.dir === "asc" ? <ChevronUp size={13} /> : <ChevronDown size={13} />) : null;

  const toggleSort = (
    col: string,
    current: { col: string; dir: SortDir },
    set: (v: { col: string; dir: SortDir }) => void,
  ) => set(current.col === col ? { col, dir: current.dir === "asc" ? "desc" : "asc" } : { col, dir: "asc" });

  const filteredNodes = useMemo(() => {
    const q = nodeSearch.toLowerCase();
    return nodes
      .filter((n) => !q || n.label.toLowerCase().includes(q) || n.entity_id.toLowerCase().includes(q) || n.entity_type.toLowerCase().includes(q))
      .sort((a, b) => {
        const [av, bv] = [a, b].map((n) => {
          if (nodeSort.col === "label") return n.label;
          if (nodeSort.col === "entity_type") return n.entity_type;
          if (nodeSort.col === "confidence") return String(n.confidence);
          return n.entity_id;
        });
        return nodeSort.dir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      });
  }, [nodes, nodeSearch, nodeSort]);

  const filteredEdges = useMemo(() => {
    const q = edgeSearch.toLowerCase();
    return edges
      .filter((e) => !q || e.source_entity_id.toLowerCase().includes(q) || e.target_entity_id.toLowerCase().includes(q) || e.relationship_type.toLowerCase().includes(q))
      .sort((a, b) => {
        const col = edgeSort.col as keyof typeof a;
        const av = String(a[col] ?? "");
        const bv = String(b[col] ?? "");
        return edgeSort.dir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      });
  }, [edges, edgeSearch, edgeSort]);

  return (
    <Card className="network-table-card">
      <div className="network-table-header">
        <div className="network-table-tabs">
          <button
            className={`network-table-tab ${tab === "nodes" ? "network-table-tab--active" : ""}`}
            onClick={() => setTab("nodes")}
          >
            <Network size={15} /> Entities <span className="network-table-count">{nodes.length}</span>
          </button>
          <button
            className={`network-table-tab ${tab === "edges" ? "network-table-tab--active" : ""}`}
            onClick={() => setTab("edges")}
          >
            <RouteIcon size={15} /> Connections <span className="network-table-count">{edges.length}</span>
          </button>
        </div>
        <input
          className="network-table-search"
          placeholder={tab === "nodes" ? "Filter entities…" : "Filter connections…"}
          value={tab === "nodes" ? nodeSearch : edgeSearch}
          onChange={(e) => tab === "nodes" ? setNodeSearch(e.target.value) : setEdgeSearch(e.target.value)}
        />
      </div>

      {tab === "nodes" && (
        <div className="network-table-wrap">
          <table className="network-table">
            <thead>
              <tr>
                <th onClick={() => toggleSort("entity_id", nodeSort, setNodeSort)}>ID {sortIcon("entity_id", nodeSort)}</th>
                <th onClick={() => toggleSort("label", nodeSort, setNodeSort)}>Name {sortIcon("label", nodeSort)}</th>
                <th onClick={() => toggleSort("entity_type", nodeSort, setNodeSort)}>Type {sortIcon("entity_type", nodeSort)}</th>
                <th onClick={() => toggleSort("confidence", nodeSort, setNodeSort)}>Confidence {sortIcon("confidence", nodeSort)}</th>
                <th>Risk flags</th>
                <th><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {filteredNodes.map((n) => {
                const Icon = iconFor(entityLabel(n.entity_type));
                return (
                  <tr key={n.entity_id} onClick={() => onSelectNode(n.entity_id)} className="network-table-row">
                    <td><code className="mono">{n.entity_id}</code></td>
                    <td>
                      <span className="network-table-entity">
                        <span className={`entity-dot entity-dot--${entityClass(entityLabel(n.entity_type))}`}><Icon size={12} /></span>
                        {n.label}
                      </span>
                    </td>
                    <td><Badge tone="neutral">{entityLabel(n.entity_type)}</Badge></td>
                    <td><ConfidenceMeter value={asPercent(n.confidence)} /></td>
                    <td>
                      {n.risk_indicators.length > 0
                        ? <Badge tone="warning">{n.risk_indicators.length} flag{n.risk_indicators.length > 1 ? "s" : ""}</Badge>
                        : <span className="text-muted">—</span>}
                    </td>
                    <td>
                      <Button size="sm" variant="ghost" icon={<Eye />} onClick={(ev) => { ev.stopPropagation(); onSelectNode(n.entity_id); }}>
                        Focus
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {tab === "edges" && (
        <div className="network-table-wrap">
          <table className="network-table">
            <thead>
              <tr>
                <th onClick={() => toggleSort("source_entity_id", edgeSort, setEdgeSort)}>From {sortIcon("source_entity_id", edgeSort)}</th>
                <th onClick={() => toggleSort("relationship_type", edgeSort, setEdgeSort)}>Relationship {sortIcon("relationship_type", edgeSort)}</th>
                <th onClick={() => toggleSort("target_entity_id", edgeSort, setEdgeSort)}>To {sortIcon("target_entity_id", edgeSort)}</th>
                <th onClick={() => toggleSort("confidence", edgeSort, setEdgeSort)}>Confidence {sortIcon("confidence", edgeSort)}</th>
                <th onClick={() => toggleSort("review_status", edgeSort, setEdgeSort)}>Status {sortIcon("review_status", edgeSort)}</th>
              </tr>
            </thead>
            <tbody>
              {filteredEdges.map((e) => (
                <tr key={e.edge_id} className="network-table-row">
                  <td><code className="mono">{e.source_entity_id}</code></td>
                  <td>
                    <span className="network-table-relation" style={{ color: relationColour(e.relationship_type) }}>
                      {titleCase(e.relationship_type)}
                    </span>
                  </td>
                  <td><code className="mono">{e.target_entity_id}</code></td>
                  <td><ConfidenceMeter value={Math.round(e.confidence * 100)} /></td>
                  <td>
                    <Badge tone={e.review_status === "CONFIRMED" ? "info" : e.review_status === "DISPUTED" ? "warning" : "neutral"}>
                      {e.review_status}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

// ─── main page ────────────────────────────────────────────────────────────────
export function NetworkPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { activeCaseId, setActiveCaseId } = useAppContext();

  // URL params
  const incomingEntity = searchParams.get("root") ?? (location.state as { entityId?: string } | null)?.entityId ?? null;
  const incomingCase = searchParams.get("case");
  const incomingDocument = searchParams.get("document") ?? null; // document-mode

  const [rootEntityId, setRootEntityId] = useState<string | null>(incomingEntity);
  const [documentId, setDocumentId] = useState<string | null>(incomingDocument);
  const [hops, setHops] = useState(incomingDocument ? 2 : incomingEntity ? 2 : 2);
  const [showTable, setShowTable] = useState(false);

  // Build graph query payload
  const graphPayload = useMemo(() => ({
    root_entity_id: documentId ? undefined : (rootEntityId ?? undefined),
    hops,
    document_id: documentId ?? undefined,
  }), [rootEntityId, hops, documentId]);

  const { data, loading, error } = useApiResource(
    () => api.graphQuery(activeCaseId, graphPayload),
    [activeCaseId, graphPayload],
  );

  // Interaction state
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
  const [tracedEdges, setTracedEdges] = useState<Set<string>>(new Set());
  const [hoveredEdge, setHoveredEdge] = useState<{ edge: Edge<GraphEdgeData>; x: number; y: number } | null>(null);

  // Sync URL params
  useEffect(() => {
    if (incomingCase && incomingCase !== activeCaseId) setActiveCaseId(incomingCase);
    if (incomingEntity) setRootEntityId(incomingEntity);
    if (incomingDocument) setDocumentId(incomingDocument);
  }, [incomingCase, incomingEntity, incomingDocument]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => { setReducedMotion(media.matches); if (media.matches) setPlaying(false); };
    update(); media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => setTime((v) => v >= 12 ? 1 : v + 1), 700);
    return () => window.clearInterval(timer);
  }, [playing]);

  useEffect(() => {
    if (!selectedNode) { setProfile(null); setMentions([]); return; }
    let current = true;
    setProfile(null); setMentions([]); setProfileError("");
    Promise.all([
      api.entitySummary(activeCaseId, selectedNode),
      api.documentMentions(activeCaseId, selectedNode),
    ])
      .then(([entity, found]) => { if (current) { setProfile(entity); setMentions(found); } })
      .catch((reason: unknown) => { if (current) setProfileError(reason instanceof Error ? reason.message : "Unable to load entity profile"); });
    return () => { current = false; };
  }, [activeCaseId, selectedNode]);

  const dates = useMemo(() =>
    [...new Set((data?.edges ?? []).map((e) => e.valid_from).filter(Boolean) as string[])].sort(),
    [data]);
  const dateStep = (date: string | null) =>
    date && dates.length ? Math.max(1, Math.ceil(((dates.indexOf(date) + 1) / dates.length) * 12)) : 1;

  const graphEdges = useMemo<Edge<GraphEdgeData>[]>(() =>
    (data?.edges ?? []).map((edge) => ({
      id: edge.edge_id,
      source: edge.source_entity_id,
      target: edge.target_entity_id,
      label: titleCase(edge.relationship_type),
      data: {
        date: dateStep(edge.valid_from),
        relation: edge.relationship_type,
        confidence: asPercent(edge.confidence),
        explanation: edge.evidence_summary.explanation,
        evidence: edge.evidence.map((item) => item.evidence_id),
        reviewStatus: edge.review_status,
      },
    })), [data, dates]);

  // Positions — use concentric rings
  const positions = useMemo(() => investigationPositions(
    rootEntityId,
    (data?.nodes ?? []).map((node) => ({ id: node.entity_id, type: node.entity_type })),
    graphEdges,
  ), [data, graphEdges, rootEntityId]);

  const graphNodes = useMemo<Node<GraphNodeData>[]>(() =>
    (data?.nodes ?? []).map((node) => {
      const connectedDates = graphEdges
        .filter((e) => e.source === node.entity_id || e.target === node.entity_id)
        .map((e) => e.data?.date ?? 1);
      const pos = positions.get(node.entity_id) ?? { x: 0, y: 0, depth: 0 };
      const isSeed = (node as ApiGraphNode & { is_seed?: boolean }).is_seed ?? false;
      return {
        id: node.entity_id,
        position: pos,
        ariaLabel: `${node.label}, ${entityLabel(node.entity_type)}`,
        data: {
          label: node.label,
          type: entityLabel(node.entity_type),
          date: connectedDates.length ? Math.min(...connectedDates) : 1,
          important: node.risk_indicators.length > 0,
          root: node.entity_id === rootEntityId,
          pinned: pinnedNodes.has(node.entity_id),
          depth: pos.depth,
          isSeed,
          isDoc: false,
        },
        type: "investigation",
      };
    }), [data, graphEdges, positions, rootEntityId, pinnedNodes]);

  const filteredEdges = useMemo(() =>
    graphEdges.filter((e) =>
      (e.data?.date ?? 0) <= time &&
      (relation === "All relationships" || e.data?.relation === relation)
    ), [graphEdges, relation, time]);

  const visibleNodeIds = useMemo(() =>
    new Set([
      ...(rootEntityId ? [rootEntityId] : []),
      ...filteredEdges.flatMap((e) => [e.source, e.target]),
    ]), [filteredEdges, rootEntityId]);

  const visibleNodes = useMemo(() =>
    graphNodes
      .filter((n) => !rootEntityId || visibleNodeIds.has(n.id))
      .map((n) => ({ ...n, selected: n.id === selectedNode })),
    [graphNodes, rootEntityId, selectedNode, visibleNodeIds]);

  const selectedNeighbourIds = useMemo(() =>
    selectedNode
      ? new Set(filteredEdges
          .filter((e) => e.source === selectedNode || e.target === selectedNode)
          .flatMap((e) => [e.source, e.target]))
      : null,
    [filteredEdges, selectedNode]);

  const focusedNodes = useMemo(() =>
    visibleNodes.map((n) => ({
      ...n,
      style: {
        opacity: selectedNeighbourIds && !selectedNeighbourIds.has(n.id) && !pinnedNodes.has(n.id) ? 0.2 : 1,
      },
    })), [visibleNodes, selectedNeighbourIds, pinnedNodes]);

  const visibleEdges = useMemo(() =>
    filteredEdges.map((edge) => {
      const selected = selectedEdge?.id === edge.id;
      const traced = tracedEdges.has(edge.id);
      const related = !selectedNode || edge.source === selectedNode || edge.target === selectedNode;
      const colour = relationColour(edge.data?.relation ?? "");
      const sourcePosition = positions.get(edge.source) ?? { x: 0, y: 0 };
      const targetPosition = positions.get(edge.target) ?? { x: 0, y: 0 };
      const sourceSide = nearestHandle(sourcePosition, targetPosition);
      const targetSide = nearestHandle(targetPosition, sourcePosition);
      return {
        ...edge,
        sourceHandle: `source-${sourceSide}`,
        targetHandle: `target-${targetSide}`,
        type: "default",
        animated: (selected && playing) || traced,
        markerEnd: { type: MarkerType.ArrowClosed, color: colour, width: 11, height: 11 },
        labelStyle: { fill: colour, fontSize: 9, fontWeight: 700 },
        labelBgStyle: { fill: "#ffffff", fillOpacity: 0.92 },
        labelBgPadding: [4, 2] as [number, number],
        labelBgBorderRadius: 3,
        style: {
          stroke: traced ? "#2563eb" : colour,
          strokeWidth: traced ? 4 : selected ? 3.5 : 1.8,
          strokeDasharray: edge.data?.reviewStatus === "AI_SUGGESTED" || edge.data?.relation === "PARTICIPATED_IN" ? "3 6" : undefined,
          opacity: selectedEdge && !selected ? 0.2 : related ? 0.84 : 0.1,
        },
      };
    }), [filteredEdges, playing, positions, selectedEdge, selectedNode, tracedEdges]);

  const rootNode = data?.nodes.find((n) => n.entity_id === rootEntityId);
  const mention = mentions[0];

  const selectNode = (nodeId: string) => {
    setSelectedNode(nodeId);
    setSelectedEdge(null);
  };

  const tracePath = () => {
    if (!selectedNode || !rootEntityId) return;
    const parent = new Map<string, { node: string; edge: string }>();
    const seen = new Set([rootEntityId]);
    const queue = [rootEntityId];
    while (queue.length && !seen.has(selectedNode)) {
      const cur = queue.shift()!;
      filteredEdges
        .filter((e) => e.source === cur || e.target === cur)
        .forEach((e) => {
          const next = e.source === cur ? e.target : e.source;
          if (!seen.has(next)) { seen.add(next); parent.set(next, { node: cur, edge: e.id }); queue.push(next); }
        });
    }
    const path: string[] = [];
    let cursor = selectedNode;
    while (cursor !== rootEntityId && parent.has(cursor)) { const step = parent.get(cursor)!; path.unshift(step.edge); cursor = step.node; }
    setTracedEdges(new Set());
    path.forEach((eid, i) => window.setTimeout(() => setTracedEdges((s) => new Set([...s, eid])), reducedMotion ? 0 : i * 330));
  };

  const clearDocumentMode = () => {
    setDocumentId(null);
    const params = new URLSearchParams(searchParams);
    params.delete("document");
    navigate(`/network?${params.toString()}`, { replace: true });
  };

  return (
    <div className="page page--network">
      {/* Compact page header */}
      <PageHeader
        title="Network Explorer"
        description={
          documentId
            ? "Evidence-centered — the document is the origin."
            : rootNode
            ? `Focused on ${rootNode.label} · ${hops} hop${hops > 1 ? "s" : ""} · ${activeCaseId}`
            : "Trace connections back to the evidence behind them."
        }
        actions={
          <>
            <Button size="sm" icon={<Search />} onClick={() => navigate("/search")}>Search clue</Button>
            <Button size="sm" icon={<Download />} onClick={() => window.print()}>Export</Button>
          </>
        }
      />

      {error && <Banner tone="warning" title="Could not load graph">{error}</Banner>}

      {/* Document-mode banner */}
      {documentId && (
        <Banner tone="info" title={`Evidence filter: ${documentId}`}>
          Inner ring = document entities · Outer rings = connections.{" "}
          <Button size="sm" icon={<X />} onClick={clearDocumentMode}>Clear filter</Button>
        </Banner>
      )}

      {/* Toolbar */}
      <Card className="graph-toolbar">
        <div className="graph-scope">
          {documentId ? <FileText /> : <Network />}
          <span>
            <strong>{documentId ? "Evidence-centered network" : rootEntityId ? "Focused network" : "Case network"}</strong>
            <small>{documentId ? `Origin: ${documentId}` : rootEntityId ? "Unrelated entities are excluded" : `${activeCaseId} overview`}</small>
          </span>
        </div>
        <Field label="Connection depth">
          <Select value={hops} onChange={(e) => setHops(Number(e.target.value))}>
            <option value="1">Direct links only</option>
            <option value="2">Up to 2 hops</option>
            <option value="3">Up to 3 hops</option>
            <option value="4">Up to 4 hops</option>
          </Select>
        </Field>
        <Field label="Relationship">
          <Select value={relation} onChange={(e) => { setRelation(e.target.value); setSelectedEdge(null); }}>
            <option>All relationships</option>
            {[...new Set(graphEdges.map((e) => e.data?.relation).filter(Boolean))].map((item) => (
              <option value={item} key={item}>{titleCase(item!)}</option>
            ))}
          </Select>
        </Field>
        <Badge tone="info">{visibleNodes.length} visible</Badge>
        <Button
          size="sm"
          variant={showTable ? "primary" : "secondary"}
          icon={showTable ? <ChevronUp /> : <ChevronDown />}
          onClick={() => setShowTable((v) => !v)}
        >
          {showTable ? "Hide table" : "Table view"}
        </Button>
      </Card>

      {/* Time slider */}
      <Card className="time-control">
        <div className="time-control__label">
          <SlidersHorizontal />
          <span>
            <strong>Network history</strong>
            <small>{dates.length ? `${formatDate(dates[0])}–${formatDate(dates.at(-1))}` : "No dated links"}</small>
          </span>
        </div>
        <Button
          size="sm"
          variant={playing ? "primary" : "secondary"}
          icon={playing ? <Pause /> : <Play />}
          disabled={reducedMotion}
          onClick={() => setPlaying((v) => !v)}
          aria-pressed={playing}
        >
          {playing ? "Pause" : "Play"}
        </Button>
        <div className="time-slider">
          <label htmlFor="network-time">
            Evidence window <strong>{time} of 12</strong>
          </label>
          <input
            id="network-time"
            type="range" min="1" max="12" value={time}
            onFocus={() => setPlaying(false)}
            onChange={(e) => { setTime(Number(e.target.value)); setPlaying(false); }}
          />
          <div><span>Earliest</span><span>Midpoint</span><span>Latest</span></div>
        </div>
        <Badge tone="neutral">Solid = confirmed · Dashed = suggested</Badge>
      </Card>

      {/* Graph canvas — fills all remaining space */}
      <div className="graph-layout">
        <Card className="graph-canvas" aria-label="Interactive focused relationship network">
          {loading ? (
            <p className="workspace-loading" role="status">Building network…</p>
          ) : (
            <ReactFlow
              key={`${activeCaseId}-${rootEntityId}-${documentId}-${hops}`}
              nodes={focusedNodes}
              edges={visibleEdges}
              nodeTypes={nodeTypes}
              onNodeClick={(_, node) => selectNode(node.id)}
              onEdgeClick={(_, edge) => { setSelectedEdge(edge as Edge<GraphEdgeData>); setSelectedNode(null); }}
              onEdgeMouseEnter={(event, edge) => setHoveredEdge({ edge: edge as Edge<GraphEdgeData>, x: event.clientX, y: event.clientY })}
              onEdgeMouseMove={(event, edge) => setHoveredEdge({ edge: edge as Edge<GraphEdgeData>, x: event.clientX, y: event.clientY })}
              onEdgeMouseLeave={() => setHoveredEdge(null)}
              onPaneClick={() => { setSelectedNode(null); setSelectedEdge(null); setTracedEdges(new Set()); }}
              fitView
              fitViewOptions={{ padding: 0.08, maxZoom: 1.35 }}
              minZoom={0.18}
              maxZoom={2.5}
              colorMode="light"
              onlyRenderVisibleElements
            >
              <Background variant={BackgroundVariant.Dots} gap={16} size={0.9} color="#d8e2ee" />
              <Controls showInteractive={false} />
              <GraphActions
                selectedNode={selectedNode}
                pinned={Boolean(selectedNode && pinnedNodes.has(selectedNode))}
                onView={() => document.querySelector(".entity-profile section:last-of-type")?.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" })}
                onTrace={tracePath}
                onPin={() => selectedNode && setPinnedNodes((items) => {
                  const next = new Set(items);
                  if (next.has(selectedNode)) next.delete(selectedNode); else next.add(selectedNode);
                  return next;
                })}
                onDepth={() => setHops((v) => Math.max(2, v))}
                onTimeline={() => navigate("/timeline", { state: { entityId: selectedNode } })}
                onReset={() => { setSelectedNode(null); setSelectedEdge(null); setRelation("All relationships"); setTime(12); setTracedEdges(new Set()); }}
              />
            </ReactFlow>
          )}

          {!rootEntityId && !documentId && !loading && (
            <div className="canvas-hint">
              <Network size={16} />
              <span>
                Search a clue or upload a document to make evidence the center of this network
              </span>
            </div>
          )}

          {hoveredEdge?.edge.data && (
            <div className="edge-hover-preview" style={{ left: hoveredEdge.x + 12, top: hoveredEdge.y + 12 }}>
              <strong>{titleCase(hoveredEdge.edge.data.relation)}</strong>
              <span>{hoveredEdge.edge.data.evidence.length} source records · {hoveredEdge.edge.data.confidence}% confidence</span>
            </div>
          )}
          {!loading && (rootEntityId || documentId) && visibleEdges.length === 0 && (
            <div className="graph-no-links">
              <Network />
              <strong>No links in this filter</strong>
              <span>Expand the time window, choose all relationships, or increase connection depth.</span>
            </div>
          )}
          {selectedEdge?.data && (
            <aside className="edge-explanation" aria-live="polite">
              <div>
                <span className="mono">{selectedEdge.id}</span>
                <button onClick={() => setSelectedEdge(null)} aria-label="Close connection explanation">×</button>
              </div>
              <Badge tone={selectedEdge.data.confidence < 75 ? "warning" : "info"}>{titleCase(selectedEdge.data.relation)}</Badge>
              <h2>Explain this connection</h2>
              <p>{selectedEdge.data.explanation}</p>
              <ConfidenceMeter value={selectedEdge.data.confidence} />
              <strong>Supporting evidence</strong>
              <ul>{selectedEdge.data.evidence.map((item) => <li key={item} className="mono">{item}</li>)}</ul>
            </aside>
          )}
        </Card>
      </div>

      {/* Table view */}
      {showTable && data && (
        <NetworkTable
          nodes={data.nodes}
          edges={data.edges.map((e) => ({
            edge_id: e.edge_id,
            source_entity_id: e.source_entity_id,
            target_entity_id: e.target_entity_id,
            relationship_type: e.relationship_type,
            confidence: e.confidence,
            review_status: e.review_status,
          }))}
          onSelectNode={selectNode}
        />
      )}

      {/* Entity profile drawer */}
      <Drawer open={Boolean(selectedNode)} onClose={() => setSelectedNode(null)} title="Entity profile">
        {profileError && <Banner tone="warning">{profileError}</Banner>}
        {selectedNode && !profile && !profileError && <p role="status">Loading source profile…</p>}
        {profile && (
          <div className="entity-profile">
            <header>
              <div className={`entity-avatar entity-avatar--${entityClass(entityLabel(profile.entity_type))}`}>
                {profile.entity_type.slice(0, 1)}
              </div>
              <div>
                <Badge tone="neutral">{entityLabel(profile.entity_type)}</Badge>
                <h3>{profile.name}</h3>
                <span className="mono">{profile.entity_id}</span>
              </div>
            </header>
            <p>{profile.summary_text}</p>
            {profile.aliases.length > 0 && (
              <section>
                <h4>Known aliases</h4>
                <div className="alias-list">
                  {profile.aliases.map((alias) => <Badge tone="neutral" key={alias}>{alias}</Badge>)}
                </div>
              </section>
            )}
            <section>
              <h4>Identity fields</h4>
              <div className="identity-fields">
                {Object.entries(profile.identity_fields).filter(([, values]) => values.length).map(([label, values]) => (
                  <article key={label}>
                    <div>
                      <span>{titleCase(label)}</span>
                      <strong>{values.join(", ")}</strong>
                    </div>
                    <ConfidenceMeter value={asPercent(profile.confidence)} verified={profile.review_status === "CONFIRMED"} />
                  </article>
                ))}
              </div>
            </section>
            <section>
              <h4>Evidence connections</h4>
              {profile.evidence_connections.slice(0, 6).map((connection, index) => (
                <EvidenceCard
                  key={`${connection.evidence_id}-${index}`}
                  id={connection.evidence_id ?? "No evidence ID"}
                  source={connection.source_type ?? "Record"}
                  time={formatDate(connection.timestamp, true)}
                >
                  {connection.chain}
                </EvidenceCard>
              ))}
            </section>
            {mention && (
              <section>
                <h4>Source document match</h4>
                <p className="section-note">Exact source excerpt and pixel bounding box returned by the backend.</p>
                <div className="evidence-viewer">
                  <div className="evidence-paper">
                    <div className="paper-heading">SOURCE DOCUMENT {mention.document_id}</div>
                    <div className="paper-meta">{mention.image_path}</div>
                    <div className="source-highlight">{mention.matched_text}</div>
                  </div>
                  <div className="evidence-viewer__caption">
                    <Badge tone="warning">OCR MATCH</Badge>
                    <span>Bounding box: x {mention.bounding_box.x}, y {mention.bounding_box.y}, w {mention.bounding_box.width}, h {mention.bounding_box.height}</span>
                  </div>
                </div>
              </section>
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
}
