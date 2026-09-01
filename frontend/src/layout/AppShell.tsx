import {
  Bell,
  BookOpenCheck,
  BriefcaseBusiness,
  ChevronDown,
  ClipboardCheck,
  Clock3,
  FileClock,
  FileSearch,
  Files,
  GitCompareArrows,
  LayoutDashboard,
  Menu,
  Network,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  ScanSearch,
  Search,
  ShieldCheck,
  UploadCloud,
  X,
} from "lucide-react";
import { Suspense, useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAppContext } from "../context/AppContext";
import { InteractionLayer } from "../components/InteractionLayer";

const navGroups = [
  {
    label: "Workspace",
    items: [
      { to: "/overview", label: "Overview", icon: LayoutDashboard },
      { to: "/document-intake", label: "Document Intake", icon: UploadCloud },
      { to: "/search", label: "Search", icon: Search },
    ],
  },
  {
    label: "Analysis",
    items: [
      { to: "/network", label: "Network Explorer", icon: Network },
      { to: "/timeline", label: "Timeline", icon: Clock3 },
      { to: "/patterns", label: "Pattern Detection", icon: ScanSearch },
      { to: "/mo-comparison", label: "MO Comparison", icon: GitCompareArrows },
      { to: "/identity-review", label: "Identity Review", icon: ClipboardCheck },
      { to: "/evidence-gaps", label: "Evidence Gaps", icon: FileSearch },
    ],
  },
  {
    label: "Governance",
    items: [
      { to: "/cases", label: "Case Registry", icon: BriefcaseBusiness },
      { to: "/audit-log", label: "Audit Log", icon: FileClock },
    ],
  },
];

export function AppShell() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [sidebarMini, setSidebarMini] = useState(() => localStorage.getItem("vyuham.sidebar.mini") === "true");
  const [caseSwitching, setCaseSwitching] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const searchDialogRef = useRef<HTMLDivElement>(null);
  const searchPreviousFocus = useRef<HTMLElement | null>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const { investigator, cases, casesLoading, activeCaseId, setActiveCaseId, signOut } = useAppContext();
  const initials = investigator?.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase() ?? "--";
  const commands = [
    { group: "Workspace", label: "Search people, phones and identifiers", hint: "Open clue search", to: "/search" },
    { group: "Analysis", label: "Explore current case network", hint: activeCaseId, to: "/network" },
    { group: "Evidence", label: "Upload a document or image", hint: "Document intake", to: "/document-intake" },
    { group: "Governance", label: "Open case registry", hint: "Authorised cases", to: "/cases" },
  ].filter((item) => !query || `${item.label} ${item.group} ${item.hint}`.toLowerCase().includes(query.toLowerCase()));

  useEffect(() => setSidebarOpen(false), [location.pathname]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
      }
      if (event.key === "Escape") setSearchOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!searchOpen) return;
    searchPreviousFocus.current = document.activeElement as HTMLElement;
    searchRef.current?.focus();
    return () => searchPreviousFocus.current?.focus();
  }, [searchOpen]);

  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    if (!query.trim()) return;
    setSearchOpen(false);
    navigate("/search", { state: { query: query.trim() } });
  };

  const changeCase = (caseId: string) => {
    setCaseSwitching(true);
    setActiveCaseId(caseId);
    window.setTimeout(() => setCaseSwitching(false), 360);
  };

  const toggleMini = () => {
    const next = !sidebarMini;
    setSidebarMini(next);
    localStorage.setItem("vyuham.sidebar.mini", String(next));
  };

  return (
    <div className={`app-shell ${sidebarMini ? "app-shell--mini" : ""} ${caseSwitching ? "app-shell--case-switching" : ""}`}>
      <InteractionLayer />
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <button className="mobile-menu" onClick={() => setSidebarOpen(true)} aria-label="Open navigation" aria-expanded={sidebarOpen}><Menu /></button>
      {sidebarOpen && <button className="sidebar-backdrop" aria-label="Close navigation" onClick={() => setSidebarOpen(false)} />}
      <aside className={`sidebar ${sidebarOpen ? "sidebar--open" : ""}`} aria-label="Primary navigation">
        <div className="brand">
          <div className="brand__mark"><ShieldCheck size={23} strokeWidth={1.9} aria-hidden="true" /></div>
          <div><strong>VYUHAM</strong><span>Criminal Network Intelligence</span></div>
          <button className="sidebar__close" onClick={() => setSidebarOpen(false)} aria-label="Close navigation"><X /></button>
        </div>
        <nav>
          {navGroups.map((group) => (
            <div className="nav-group" key={group.label}>
              <p>{group.label}</p>
              {group.items.map(({ to, label, icon: Icon }) => (
                <NavLink key={to} to={to} aria-label={label} title={sidebarMini ? label : undefined} className={({ isActive }) => `nav-item ${isActive ? "nav-item--active" : ""}`}>
                  <Icon size={19} strokeWidth={1.85} aria-hidden="true" /><span>{label}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <button className="sidebar-toggle" onClick={toggleMini} aria-label={sidebarMini ? "Expand sidebar" : "Collapse sidebar"} title={sidebarMini ? "Expand sidebar" : "Collapse sidebar"}>{sidebarMini ? <PanelLeftOpen /> : <PanelLeftClose />}<span>{sidebarMini ? "Expand" : "Mini mode"}</span></button>
        <div className="sidebar__footer">
          <BookOpenCheck size={18} aria-hidden="true" />
          <div><strong>Evidence-first system</strong><span>Human review is required</span></div>
        </div>
      </aside>

      <header className="topbar">
        <label className="case-switcher">
          <span><small>Active case</small><strong>{casesLoading ? "Loading…" : activeCaseId}</strong></span>
          <select value={activeCaseId} onChange={(event) => changeCase(event.target.value)} aria-label="Change active case" disabled={casesLoading || !cases.length}>
            {cases.length ? cases.map((item) => <option value={item.case_id} key={item.case_id}>{item.case_id} — {item.case_title}</option>) : <option value={activeCaseId}>{activeCaseId}</option>}
          </select>
          <ChevronDown size={16} aria-hidden="true" />
        </label>
        <button className="global-search" onClick={() => setSearchOpen(true)} aria-label="Search entities, evidence or cases">
          <Search size={17} aria-hidden="true" /><span>Search entities, evidence or cases</span><kbd>Ctrl K</kbd>
        </button>
        <div className="topbar__actions">
          <button className="icon-button notification-button" aria-label="Notifications, 3 unread"><Bell /><span>3</span></button>
          <div className="investigator"><span className="investigator__avatar" aria-hidden="true">{initials}</span><div><strong>{investigator?.name}</strong><small>{investigator?.role.replaceAll("_", " ")}</small></div></div>
          <button className="icon-button" aria-label="Sign out" title="Sign out" onClick={() => { signOut(); navigate("/sign-in", { replace: true }); }}><LogOut /></button>
        </div>
      </header>

      <main id="main-content" className="workspace" tabIndex={-1}>
        <Suspense fallback={<div className="workspace-loading" role="status"><div /><div /><div /><span className="sr-only">Loading page</span></div>}><Outlet /></Suspense>
      </main>

      {searchOpen && (
        <div className="search-overlay" role="dialog" aria-modal="true" aria-label="Global search" onMouseDown={(event) => event.target === event.currentTarget && setSearchOpen(false)}>
          <div className="command-search" ref={searchDialogRef} onKeyDown={(event) => {
            if (event.key !== "Tab") return;
            const items = [...(searchDialogRef.current?.querySelectorAll<HTMLElement>("input, button") ?? [])];
            if (!items.length) return;
            const first = items[0];
            const last = items[items.length - 1];
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
          }}>
            <form onSubmit={submitSearch}><Search aria-hidden="true" /><label className="sr-only" htmlFor="global-search-input">Search all case records</label><input id="global-search-input" ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by name, phone, vehicle, ID or evidence source" /><kbd>Esc</kbd></form>
            <div className="command-search__hints"><span>Try: <button onClick={() => setQuery("PH0061")}>PH0061</button></span><span>Results stay within your authorised cases.</span></div>
            <div className="command-results" aria-label="Quick commands">
              {commands.map((item) => <button key={item.to} onClick={() => { setSearchOpen(false); navigate(item.to); }}><span><small>{item.group}</small><strong>{item.label}</strong></span><kbd>{item.hint}</kbd></button>)}
              {query && <button onClick={() => { setSearchOpen(false); navigate("/search", { state: { query: query.trim() } }); }}><span><small>Search all records</small><strong>Find “{query}”</strong></span><kbd>Enter</kbd></button>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
