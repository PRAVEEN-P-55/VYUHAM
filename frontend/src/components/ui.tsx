import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Circle,
  FileText,
  Files,
  Info,
  Network,
  Share2,
  Users,
  X,
} from "lucide-react";
import {
  type ButtonHTMLAttributes,
  type CSSProperties,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md";
  icon?: ReactNode;
};

export function Button({ variant = "secondary", size = "md", icon, className = "", children, ...props }: ButtonProps) {
  return (
    <button className={`button button--${variant} button--${size} ${className}`} {...props}>
      {icon}
      <span>{children}</span>
    </button>
  );
}

const badgeTone = (label: string) => {
  const normalized = label.toUpperCase();
  if (["CONFIRMED", "COMPLETED", "SUCCESS", "VERIFIED", "RECORDED"].includes(normalized)) return "success";
  if (["CRITICAL", "FAILED", "DISPUTED", "REJECTED"].includes(normalized)) return "danger";
  if (["AI SUGGESTED", "PENDING REVIEW", "REVIEW", "HIGH", "DEFERRED", "REQUIRES REVIEW"].includes(normalized)) return "warning";
  return "info";
};

export function Badge({ children, tone }: { children: ReactNode; tone?: "success" | "warning" | "danger" | "info" | "neutral" }) {
  const label = String(children);
  return <span className={`badge badge--${tone ?? badgeTone(label)}`}>{children}</span>;
}

export function Card({ className = "", children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`card ${className}`} {...props}>{children}</div>;
}

export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      {children}
      {hint && <span className="field__hint">{hint}</span>}
      {error && <span className="field__error" role="alert">{error}</span>}
    </label>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input className="input" {...props} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className="select" {...props} />;
}

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: ReactNode; title: string; description?: string; actions?: ReactNode }) {
  return (
    <header className="page-header">
      <div>
        {eyebrow && <div className="page-header__eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="page-header__actions">{actions}</div>}
    </header>
  );
}

export function SectionHeader({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="section-header">
      <div>
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function Banner({ tone = "info", title, children }: { tone?: "info" | "warning" | "success"; title?: string; children: ReactNode }) {
  const Icon = tone === "warning" ? AlertTriangle : tone === "success" ? CheckCircle2 : Info;
  return (
    <div className={`banner banner--${tone}`} role={tone === "warning" ? "alert" : "status"}>
      <Icon size={19} aria-hidden="true" />
      <div>{title && <strong>{title}</strong>}<p>{children}</p></div>
    </div>
  );
}

const metricIcons = { users: Users, files: Files, share: Share2, alert: AlertTriangle };

export function MetricCard({ label, value, trend, icon, details = [] }: { label: string; value: string; trend: string; icon: keyof typeof metricIcons; details?: string[] }) {
  const Icon = metricIcons[icon];
  const [expanded, setExpanded] = useState(false);
  return (
    <Card className={`metric-card ${expanded ? "metric-card--expanded" : ""}`} data-depth>
      <div className="metric-card__icon"><Icon size={20} aria-hidden="true" /></div>
      <div className="metric-card__body">
        <p className="metric-card__label">{label}</p>
        <strong>{value}</strong>
        <p className="metric-card__trend">{trend}</p>
        <div className="metric-card__details" aria-hidden={!expanded}>{details.map((detail) => <span key={detail}>{detail}</span>)}</div>
      </div>
      <button className="metric-card__toggle" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded} aria-label={`${expanded ? "Hide" : "Show"} details for ${label}`}>{expanded ? "Less" : "Details"}</button>
    </Card>
  );
}

export function TableWrap({ label, children }: { label: string; children: ReactNode }) {
  return <div className="table-wrap" role="region" aria-label={label} tabIndex={0}>{children}</div>;
}

type OverlayProps = { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode };

function useOverlayFocus(open: boolean, onClose: () => void) {
  const containerRef = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    previousFocus.current = document.activeElement as HTMLElement;
    const container = containerRef.current;
    const focusable = container?.querySelector<HTMLElement>("button, input, select, textarea, [href], [tabindex]:not([tabindex='-1'])");
    focusable?.focus();

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseRef.current();
      if (event.key !== "Tab" || !container) return;
      const items = [...container.querySelectorAll<HTMLElement>("button, input, select, textarea, [href], [tabindex]:not([tabindex='-1'])")].filter((el) => !el.hasAttribute("disabled"));
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", handleKey);
    document.body.classList.add("overlay-open");
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.classList.remove("overlay-open");
      previousFocus.current?.focus();
    };
  }, [open]);

  return containerRef;
}

export function Modal({ open, onClose, title, children, footer }: OverlayProps) {
  const titleId = useId();
  const ref = useOverlayFocus(open, onClose);
  if (!open) return null;
  return createPortal(
    <div className="overlay" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby={titleId} ref={ref}>
        <div className="overlay__header"><h2 id={titleId}>{title}</h2><button className="icon-button" onClick={onClose} aria-label="Close dialog"><X /></button></div>
        <div className="modal__body">{children}</div>
        {footer && <div className="modal__footer">{footer}</div>}
      </div>
    </div>, document.body,
  );
}

export function Drawer({ open, onClose, title, children, footer }: OverlayProps) {
  const titleId = useId();
  const ref = useOverlayFocus(open, onClose);
  if (!open) return null;
  return createPortal(
    <div className="overlay overlay--drawer" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <aside className="drawer" role="dialog" aria-modal="true" aria-labelledby={titleId} ref={ref}>
        <div className="overlay__header"><h2 id={titleId}>{title}</h2><button className="icon-button" onClick={onClose} aria-label="Close entity profile"><X /></button></div>
        <div className="drawer__body">{children}</div>
        {footer && <div className="modal__footer">{footer}</div>}
      </aside>
    </div>, document.body,
  );
}

export function ConfidenceMeter({ value, verified = false }: { value: number; verified?: boolean }) {
  const low = value < 75;
  return (
    <div className={`confidence ${verified ? "confidence--verified" : low ? "confidence--low" : ""}`}>
      <div className="confidence__summary">
        {verified ? <CheckCircle2 size={15} aria-hidden="true" /> : <AlertTriangle size={15} aria-hidden="true" />}
        <strong>{value}% confidence</strong>
      </div>
      <span>{verified ? "Independently verified" : low ? "Human review recommended" : "AI suggested, requires review"}</span>
      <i className="confidence__bar" aria-hidden="true"><b style={{ "--confidence-value": `${value}%` } as CSSProperties} /></i>
    </div>
  );
}

export function EvidenceCard({ id, source, time, children }: { id: string; source: string; time: string; children: ReactNode }) {
  return (
    <details className="evidence-card">
      <summary><span className="evidence-card__icon"><FileText size={18} aria-hidden="true" /></span><span><strong>{children}</strong><p><span className="mono">{id}</span> · {source} · {time}</p></span><span className="evidence-card__expand">Inspect</span></summary>
      <div className="evidence-card__detail"><span><b>Source</b>{source}</span><span><b>Evidence record</b><span className="mono">{id}</span></span><span><b>Recorded</b>{time}</span><p>This source supports the displayed relationship. Compare it with the original record before confirming the link.</p></div>
    </details>
  );
}

export function PipelineStepper({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol className="pipeline" aria-label="Document processing progress">
      {steps.map((step, index) => {
        const state = index < current ? "completed" : index === current ? "processing" : "pending";
        return (
          <li key={step} className={`pipeline__step pipeline__step--${state}`} aria-current={state === "processing" ? "step" : undefined}>
            <span className="pipeline__marker">{state === "completed" ? <Check size={14} /> : state === "processing" ? <Circle size={12} fill="currentColor" /> : <Circle size={12} />}</span>
            <div><strong>{step}</strong><span>{state === "completed" ? "Completed" : state === "processing" ? "Processing now" : "Waiting"}</span></div>
          </li>
        );
      })}
    </ol>
  );
}

export function GraphLegend() {
  const items = ["Person", "Phone", "Bank Account", "Vehicle", "Location", "Organization", "Incident"];
  return <div className="graph-legend" aria-label="Graph entity and relationship legend"><div>{items.map((item) => <span key={item}><i className={`legend-dot legend-dot--${item.toLowerCase().replace(" ", "-")}`} />{item}</span>)}</div><div className="graph-legend__links"><span><i className="legend-line" />Evidence-backed</span><span><i className="legend-line legend-line--inferred" />AI suggested</span></div></div>;
}

export function EmptyState({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return <div className="empty-state"><Network size={28} aria-hidden="true" /><h3>{title}</h3><p>{children}</p>{action}</div>;
}
