import { AlertTriangle, Check, ChevronLeft, ChevronRight, Clock3, Link2Off, RotateCcw, ShieldCheck, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge, Banner, Button, Card, ConfidenceMeter, Modal, PageHeader, SectionHeader } from "../components/ui";
import { useAppContext } from "../context/AppContext";
import { useApiResource } from "../hooks/useApiResource";
import { api } from "../services/api";
import { asPercent, formatDate, titleCase } from "../utils/format";
import { notify } from "../components/InteractionLayer";

type Decision = "ACCEPT" | "DEFER" | "REJECT";

export function IdentityReviewPage() {
  const { activeCaseId } = useAppContext();
  const { data, loading, error } = useApiResource(() => api.resolutionCandidates(activeCaseId), [activeCaseId]);
  const candidates = data?.items ?? [];
  const [index, setIndex] = useState(0);
  const [decision, setDecision] = useState<Decision | null>(null);
  const [recorded, setRecorded] = useState<{ candidateId: string; action: Decision } | null>(null);
  const [actionError, setActionError] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => { setIndex(0); setRecorded(null); }, [activeCaseId]);
  const candidate = candidates[index];

  const confirm = async () => {
    if (!decision || !candidate) return;
    setSaving(true);
    setActionError("");
    try {
      await api.resolveIdentity(activeCaseId, candidate.candidate_id, decision);
      setRecorded({ candidateId: candidate.candidate_id, action: decision });
      const recordedId = candidate.candidate_id;
      notify(`Identity review saved: ${decision.toLowerCase()}`, { action: { label: "Undo", onClick: () => { void api.reverseIdentity(activeCaseId, recordedId).then(() => setRecorded(null)); } } });
      setDecision(null);
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : "Could not record the decision");
    } finally { setSaving(false); }
  };
  const reverse = async () => {
    if (!recorded) return;
    setSaving(true);
    setActionError("");
    try { await api.reverseIdentity(activeCaseId, recorded.candidateId); setRecorded(null); }
    catch (reason) { setActionError(reason instanceof Error ? reason.message : "Could not reverse the decision"); }
    finally { setSaving(false); }
  };

  return <div className="page"><PageHeader title="Identity Resolution Review" description="Review supporting and conflicting evidence before linking records." actions={<Badge tone="warning">{loading ? "LOADING" : `${candidates.length} PENDING`}</Badge>} />{(error || actionError) && <Banner tone="warning" title="Identity review error">{error || actionError}</Banner>}<Banner tone="warning" title="Reversible human decision">Accepting a candidate links records but does not delete the originals. Every action is logged and can be reversed by an authorised reviewer.</Banner>{recorded && <Banner tone="success" title="Decision recorded">Candidate {recorded.candidateId} was marked {recorded.action.toLowerCase()}. <Button size="sm" icon={<RotateCcw />} disabled={saving} onClick={reverse}>Reverse action</Button></Banner>}{!candidate && !loading ? <Card><SectionHeader title="No identity candidates" description="The backend returned no candidates for this case." /></Card> : candidate && <Card className="resolution-card"><SectionHeader title={`Candidate ${candidate.candidate_id}`} description={`Recommended action: ${candidate.recommended_action}`} action={<ConfidenceMeter value={asPercent(candidate.match_confidence)} />} /><div className="record-comparison"><PersonRecord label="RECORD A" person={candidate.record_a} /><div className="record-link"><span>{asPercent(candidate.match_confidence)}%</span><Link2Off /><small>possible identity</small></div><PersonRecord label="RECORD B" secondary person={candidate.record_b} /></div><div className="evidence-columns"><section className="evidence-list evidence-list--support"><h3><Check /> Supporting evidence</h3><ul>{candidate.supporting.length ? candidate.supporting.map((item) => <li key={item}><strong>{titleCase(item)}</strong><span>Signal returned by the identity-resolution service.</span></li>) : <li><strong>No supporting signals</strong><span>Do not accept without independent evidence.</span></li>}</ul></section><section className="evidence-list evidence-list--conflict"><h3><AlertTriangle /> Conflicting evidence</h3><ul>{candidate.conflicting.length ? candidate.conflicting.map((item) => <li key={item}><strong>{titleCase(item)}</strong><span>Resolve this conflict against the original record.</span></li>) : <li><strong>No coded conflicts</strong><span>Absence of a coded conflict is not proof of identity.</span></li>}</ul></section></div><div className="decision-bar"><div><strong>Investigator decision</strong><span>Review all source records before choosing an action.</span></div><Button variant="danger" icon={<X />} onClick={() => setDecision("REJECT")}>Reject</Button><Button icon={<Clock3 />} onClick={() => setDecision("DEFER")}>Defer</Button><Button variant="primary" icon={<ShieldCheck />} onClick={() => setDecision("ACCEPT")}>Accept link</Button></div></Card>}<div className="review-pagination"><Button size="sm" icon={<ChevronLeft />} disabled={index === 0} onClick={() => { setIndex((value) => value - 1); setRecorded(null); }}>Previous</Button><span>{candidates.length ? `Candidate ${index + 1} of ${candidates.length}` : "No candidates"}</span><Button size="sm" disabled={index >= candidates.length - 1} onClick={() => { setIndex((value) => value + 1); setRecorded(null); }}>Next <ChevronRight /></Button></div><Modal open={Boolean(decision)} onClose={() => setDecision(null)} title={`${decision?.slice(0, 1)}${decision?.slice(1).toLowerCase()} identity candidate?`} footer={<><Button onClick={() => setDecision(null)}>Cancel</Button><Button variant={decision === "REJECT" ? "danger" : decision === "ACCEPT" ? "primary" : "secondary"} disabled={saving} onClick={confirm}>{saving ? "Recording…" : `Confirm ${decision?.toLowerCase()}`}</Button></>}><p>{decision === "ACCEPT" ? `This will link ${candidate?.record_a.person_id} and ${candidate?.record_b.person_id}. Original records remain available and the action can be reversed.` : decision === "REJECT" ? "This marks the candidate as not the same identity. The evidence and decision remain in the audit history." : "This keeps the candidate open for later review without changing either identity record."}</p></Modal></div>;
}

function PersonRecord({ label, person, secondary = false }: { label: string; person: { person_id: string; full_name: string | null; alias: string | null; full_name_transliterated: string | null; date_of_birth: string | null; district: string | null; state: string | null; language: string | null }; secondary?: boolean }) {
  const name = person.full_name ?? person.full_name_transliterated ?? person.person_id;
  const initials = name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
  return <article><div className={`record-avatar ${secondary ? "record-avatar--secondary" : ""}`}>{initials}</div><Badge tone="info">{label}</Badge><h2>{name}</h2><span className="mono">{person.person_id}</span><dl><div><dt>Alias</dt><dd>{person.alias ?? "Not recorded"}</dd></div><div><dt>Transliteration</dt><dd>{person.full_name_transliterated ?? "Not recorded"}</dd></div><div><dt>Date of birth</dt><dd>{formatDate(person.date_of_birth)}</dd></div><div><dt>Location</dt><dd>{[person.district, person.state].filter(Boolean).join(", ") || "Not recorded"}</dd></div></dl></article>;
}
