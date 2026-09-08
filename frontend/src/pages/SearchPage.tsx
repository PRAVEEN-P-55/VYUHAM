import {
  ArrowRight, Building2, Car, ClipboardCheck, Clock3,
  FileSearch, FileUp, Landmark, MapPin, Network,
  Phone, Search, ScanSearch, ShieldCheck, UserRound,
} from "lucide-react";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Badge, Banner, Button, Card, EmptyState,
  Field, Input, PageHeader, Select,
} from "../components/ui";
import { useAppContext } from "../context/AppContext";
import { api, type EntitySearchResult } from "../services/api";
import { titleCase } from "../utils/format";

const entityOptions = [
  { value: "", label: "All entity types" },
  { value: "PERSON", label: "People" },
  { value: "PHONE", label: "Phone numbers" },
  { value: "VEHICLE", label: "Vehicles" },
  { value: "ACCOUNT", label: "Bank accounts" },
  { value: "ORGANIZATION", label: "Organizations" },
  { value: "LOCATION", label: "Locations" },
];

const iconFor = (type: string) => {
  if (type === "PERSON") return UserRound;
  if (type === "PHONE") return Phone;
  if (type === "VEHICLE") return Car;
  if (type === "ACCOUNT") return Landmark;
  if (type === "ORGANIZATION") return Building2;
  if (type === "LOCATION") return MapPin;
  return Search;
};

/** Contextual quick-action buttons based on entity type */
function EntityActions({
  result,
  onNavigate,
}: {
  result: EntitySearchResult;
  onNavigate: (page: string, params?: Record<string, string>) => void;
}) {
  const type = result.entity_type;
  const caseId = result.preferred_case_id;
  const entityId = result.entity_id;

  // Every entity always gets "Explore Network"
  const actions: { label: string; icon: React.ReactNode; page: string; params?: Record<string, string> }[] = [
    {
      label: "Explore network",
      icon: <Network size={14} />,
      page: "/network",
      params: { case: caseId, root: entityId },
    },
  ];

  if (type === "PERSON") {
    actions.push(
      { label: "Timeline", icon: <Clock3 size={14} />, page: "/timeline", params: { case: caseId } },
      { label: "Check identity", icon: <ClipboardCheck size={14} />, page: "/identity-review", params: { case: caseId } },
    );
  }
  if (type === "PHONE" || type === "ACCOUNT") {
    actions.push(
      { label: "Patterns", icon: <ScanSearch size={14} />, page: "/patterns", params: { case: caseId } },
    );
  }
  if (type === "ACCOUNT" || type === "ORGANIZATION") {
    actions.push(
      { label: "MO comparison", icon: <ArrowRight size={14} />, page: "/mo-comparison", params: { case: caseId } },
    );
  }
  if (type === "LOCATION") {
    actions.push(
      { label: "Timeline", icon: <Clock3 size={14} />, page: "/timeline", params: { case: caseId } },
    );
  }
  // Evidence gaps always available
  actions.push({
    label: "Evidence gaps",
    icon: <FileSearch size={14} />,
    page: "/evidence-gaps",
    params: { case: caseId },
  });

  return (
    <div className="result-actions">
      {actions.map((action) => (
        <Button
          key={action.label}
          size="sm"
          variant={action.page === "/network" ? "primary" : "secondary"}
          icon={action.icon}
          onClick={() => onNavigate(action.page, action.params)}
          aria-label={`${action.label} for ${result.label}`}
        >
          {action.label}
          {action.page === "/network" && <ArrowRight size={12} />}
        </Button>
      ))}
    </div>
  );
}

export function SearchPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { setActiveCaseId } = useAppContext();
  const incomingQuery = (location.state as { query?: string } | null)?.query ?? "";
  const [query, setQuery] = useState(incomingQuery);
  const [entityType, setEntityType] = useState("");
  const [results, setResults] = useState<EntitySearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState("");

  const runSearch = async (term = query) => {
    const clean = term.trim();
    if (clean.length < 2) {
      setError("Enter at least two characters so the search can return a useful, focused result.");
      return;
    }
    setLoading(true); setError(""); setSearched(true);
    try {
      const response = await api.searchEntities(clean, entityType || undefined);
      setResults(response.items);
    } catch (reason: unknown) {
      setResults([]);
      setError(reason instanceof Error ? reason.message : "Unable to search authorised records");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!incomingQuery) return;
    setQuery(incomingQuery);
    void runSearch(incomingQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key]);

  const submit = (e: FormEvent) => { e.preventDefault(); void runSearch(); };

  /** Navigate to a page, optionally switching the active case and passing entity state */
  const handleNavigate = (result: EntitySearchResult, page: string, params?: Record<string, string>) => {
    setActiveCaseId(result.preferred_case_id);
    const urlParams = new URLSearchParams(params ?? {});
    // Preserve entity ID for pages that accept it via location state
    navigate(`${page}${urlParams.toString() ? `?${urlParams.toString()}` : ""}`, {
      state: { entityId: result.entity_id, fromSearch: true, caseId: result.preferred_case_id },
    });
  };

  const resultSummary = useMemo(() => {
    if (!searched) return "Search has not started";
    if (loading) return "Searching authorised cases…";
    return `${results.length} matching ${results.length === 1 ? "entity" : "entities"}`;
  }, [loading, results.length, searched]);

  return (
    <div className="page clue-search-page">
      <PageHeader
        title="Start from a clue"
        description="Search a name, alias, phone, vehicle, account, organization, location, or entity ID across every case you are authorised to access."
        actions={
          <Button icon={<FileUp />} onClick={() => navigate("/document-intake")}>
            Upload a file instead
          </Button>
        }
      />

      <Banner tone="info" title="No document required">
        Enter any known detail. VYUHAM will find matching entities first, then open the right investigation
        view — network, timeline, patterns, or identity review — based on what you select.
      </Banner>

      {error && (
        <Banner tone="warning" title="Could not search authorised records">{error}</Banner>
      )}

      <Card className="clue-search-panel">
        <div className="clue-search-panel__intro">
          <div><ShieldCheck /></div>
          <span>
            <strong>Authorised cross-case search</strong>
            <small>Results never include cases outside your assigned access.</small>
          </span>
        </div>
        <form onSubmit={submit} className="search-form clue-search-form">
          <Field label="Known detail" hint="Enter at least 2 characters. Partial names and identifiers are supported.">
            <div className="input-with-icon">
              <Search />
              <Input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="e.g. Asha Khan, 6100501329, TN01, A0175, PH0061"
              />
            </div>
          </Field>
          <Field label="Clue type">
            <Select value={entityType} onChange={(e) => setEntityType(e.target.value)}>
              {entityOptions.map((item) => (
                <option value={item.value} key={item.value || "all"}>{item.label}</option>
              ))}
            </Select>
          </Field>
          <Button
            type="submit" variant="primary" icon={<Search />}
            disabled={query.trim().length < 2 || loading}
          >
            {loading ? "Searching…" : "Search all cases"}
          </Button>
        </form>
        <div className="clue-examples" aria-label="Example searches">
          <span>Try a known clue:</span>
          {["PH0061", "Asha Khan", "TN01", "A0175"].map((example) => (
            <button key={example} type="button" onClick={() => { setQuery(example); void runSearch(example); }}>
              {example}
            </button>
          ))}
        </div>
      </Card>

      <div className="result-heading">
        <p>
          <strong>{resultSummary}</strong>
          {query && searched && <> for "{query.trim()}"</>}
        </p>
        <span>Ranked by match quality and connected evidence.</span>
      </div>

      {results.length > 0 && (
        <div className="search-results">
          {results.map((result) => {
            const Icon = iconFor(result.entity_type);
            return (
              <Card
                className={`search-result search-result--${result.entity_type.toLowerCase()}`}
                key={result.entity_id}
              >
                <div className="search-result__icon"><Icon /></div>
                <div className="search-result__body">
                  <div>
                    <Badge tone={result.entity_type === "PERSON" ? "info" : "neutral"}>
                      {titleCase(result.entity_type)}
                    </Badge>
                    <span className="mono">{result.entity_id}</span>
                  </div>
                  <h2>{result.label}</h2>
                  <p>
                    Matched {titleCase(result.matched_field)}:{" "}
                    <strong>{result.matched_value}</strong>
                  </p>
                  <div className="result-cases">
                    {result.case_ids.slice(0, 6).map((caseId) => (
                      <span
                        className={caseId === result.preferred_case_id ? "is-primary" : ""}
                        key={caseId}
                      >
                        {caseId}
                      </span>
                    ))}
                    {result.case_ids.length > 6 && <span>+{result.case_ids.length - 6}</span>}
                  </div>
                </div>
                <div className="result-strength">
                  <strong>{result.relationship_count}</strong>
                  <span>linked records</span>
                  <small>
                    {result.case_ids.length} authorised{" "}
                    {result.case_ids.length === 1 ? "case" : "cases"}
                  </small>
                </div>
                {/* Contextual actions — different per entity type */}
                <EntityActions
                  result={result}
                  onNavigate={(page, params) => handleNavigate(result, page, params)}
                />
              </Card>
            );
          })}
        </div>
      )}

      {searched && !loading && !results.length && !error && (
        <EmptyState title="No matching connected entities">
          Try a partial spelling, alias, shorter phone or vehicle fragment, or remove the clue-type filter.
        </EmptyState>
      )}

      {!searched && (
        <Card className="clue-empty">
          <Network />
          <div>
            <h2>Your clue becomes the center of the network</h2>
            <p>
              Choose a result to open the network, timeline, patterns or identity review — focused
              only on that entity's evidence-backed connections.
            </p>
          </div>
        </Card>
      )}
    </div>
  );
}
