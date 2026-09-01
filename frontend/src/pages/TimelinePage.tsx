import { CalendarDays, ExternalLink, Filter } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge, Banner, Button, Card, Field, PageHeader, Select } from "../components/ui";
import { useAppContext } from "../context/AppContext";
import { useApiResource } from "../hooks/useApiResource";
import { api } from "../services/api";
import { formatDate } from "../utils/format";

export function TimelinePage() {
  const { activeCaseId } = useAppContext();
  const { data, loading, error } = useApiResource(() => api.timeline(activeCaseId), [activeCaseId]);
  const [type, setType] = useState("ALL EVENTS");
  const events = data?.items ?? [];
  const types = ["ALL EVENTS", ...new Set(events.map((event) => event.event_type))];
  const filtered = useMemo(() => type === "ALL EVENTS" ? events : events.filter((event) => event.event_type === type), [type, events]);
  const dateRange = events.length ? `${formatDate(events[0].timestamp)}–${formatDate(events.at(-1)?.timestamp)}` : "No events";
  return <div className="page"><PageHeader title="Case Timeline" description={`Chronological source records for ${activeCaseId}.`} actions={<Button icon={<CalendarDays />}>{dateRange}</Button>} />{error && <Banner tone="warning" title="Could not load timeline">{error}</Banner>}<Card className="filter-bar"><Filter /><Field label="Event type"><Select value={type} onChange={(event) => setType(event.target.value)}>{types.map((item) => <option key={item}>{item}</option>)}</Select></Field><span>{loading ? "Loading events…" : `${filtered.length} events shown`}</span></Card><Card className="timeline-card"><ol className="timeline-list">{filtered.map((event) => <li key={`${event.timestamp}-${event.source_id}`}><div className={`timeline-marker timeline-marker--${event.event_type.toLowerCase()}`} aria-hidden="true" /><time>{formatDate(event.timestamp, true)}</time><div><Badge tone="neutral">{event.event_type}</Badge><h2>{event.description}</h2><p>Source: <span className="mono">{event.source_id}</span>{event.evidence_id && <> · Evidence <span className="mono">{event.evidence_id}</span></>}</p></div><Button size="sm" variant="ghost" icon={<ExternalLink />} aria-label={`Open evidence ${event.evidence_id ?? event.source_id}`}>Evidence</Button></li>)}</ol></Card></div>;
}
