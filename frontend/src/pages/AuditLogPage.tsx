import { Download, LockKeyhole, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge, Banner, Button, Card, Field, Input, PageHeader, TableWrap } from "../components/ui";
import { useApiResource } from "../hooks/useApiResource";
import { api } from "../services/api";
import { formatDate, titleCase } from "../utils/format";

export function AuditLogPage() {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const { data, loading, error } = useApiResource(() => api.auditLog({ page, page_size: 25 }), [page]);
  const visible = useMemo(() => (data?.items ?? []).filter((row) => !query || Object.values(row).join(" ").toLowerCase().includes(query.toLowerCase())), [data, query]);
  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / 25));
  return <div className="page"><PageHeader title="Audit Log" description="Immutable activity history for authorised case actions and system updates." actions={<><Badge tone="success">AUDIT CAPTURE ACTIVE</Badge><Button icon={<Download />} onClick={() => window.print()}>Export log</Button></>} />{error && <Banner tone="warning" title="Could not load audit events">{error}</Banner>}<Card className="audit-notice"><LockKeyhole /><div><strong>Official activity record</strong><p>Audit events cannot be edited or deleted from this interface. Export access is logged by the backend.</p></div></Card><Card className="audit-table-card"><div className="table-toolbar"><Field label="Search current page"><div className="input-with-icon"><Search /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="User, action, resource or outcome" /></div></Field><span>{loading ? "Loading events…" : `${visible.length} events shown`}</span></div><TableWrap label="Audit log events"><table><thead><tr><th>Timestamp</th><th>Investigator</th><th>Role</th><th>Action</th><th>Description</th><th>Resource</th><th>Outcome</th></tr></thead><tbody>{visible.map((row) => <tr key={`${row.timestamp}-${row.action}-${row.resource}`}><td className="mono">{formatDate(row.timestamp, true)}</td><td><strong>{row.investigator_id}</strong></td><td>{titleCase(row.role)}</td><td className="mono">{row.action}</td><td>{row.description}</td><td className="mono">{row.resource}</td><td><Badge>{row.outcome}</Badge></td></tr>)}</tbody></table></TableWrap><div className="table-footer"><span>{data?.total ?? 0} total events</span><div><Button size="sm" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</Button><Badge tone="info">Page {page} of {totalPages}</Badge><Button size="sm" disabled={page >= totalPages} onClick={() => setPage((value) => value + 1)}>Next</Button></div></div></Card></div>;
}
