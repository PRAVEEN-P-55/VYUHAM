import { CheckCircle2, Info, RotateCcw, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";

type Toast = { id: number; message: string; tone: "success" | "info"; action?: { label: string; onClick: () => void } };
type ToastDetail = Omit<Toast, "id">;

export function notify(message: string, options: Partial<Omit<ToastDetail, "message">> = {}) {
  window.dispatchEvent(new CustomEvent<ToastDetail>("vyuham:toast", { detail: { message, tone: options.tone ?? "success", action: options.action } }));
}

export function InteractionLayer() {
  const location = useLocation();
  const [progress, setProgress] = useState(0);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef(new Map<number, number>());

  useEffect(() => {
    const onToast = (event: Event) => {
      const detail = (event as CustomEvent<ToastDetail>).detail;
      const id = Date.now() + Math.round(Math.random() * 1000);
      setToasts((items) => [...items.slice(-2), { id, ...detail }]);
      const timer = window.setTimeout(() => setToasts((items) => items.filter((item) => item.id !== id)), 4200);
      timers.current.set(id, timer);
    };
    window.addEventListener("vyuham:toast", onToast);
    return () => window.removeEventListener("vyuham:toast", onToast);
  }, []);

  useEffect(() => () => timers.current.forEach((timer) => window.clearTimeout(timer)), []);

  useEffect(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const candidates = [...document.querySelectorAll<HTMLElement>(".page > :not(.page-header), .metric-grid > *, .dashboard-grid > *, .search-results > *, .gap-grid > *, .pattern-list > *")];
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("reveal--visible");
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.08, rootMargin: "0px 0px -24px" });
    candidates.forEach((element, index) => {
      element.classList.add("reveal-item");
      element.style.setProperty("--reveal-delay", `${Math.min(index % 8, 7) * 52}ms`);
      if (reduceMotion) element.classList.add("reveal--visible");
      else observer.observe(element);
    });
    return () => observer.disconnect();
  }, [location.pathname, location.search]);

  useEffect(() => {
    const update = () => {
      const root = document.documentElement;
      const available = root.scrollHeight - root.clientHeight;
      setProgress(available > 0 ? Math.min(100, Math.max(0, (root.scrollTop / available) * 100)) : 0);
      document.body.classList.toggle("is-scrolled", root.scrollTop > 24);
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, [location.pathname]);

  useEffect(() => {
    let moveFrame = 0;
    const onPointerDown = (event: PointerEvent) => {
      const target = (event.target as HTMLElement).closest<HTMLElement>(".button:not(:disabled), .icon-button:not(:disabled), .nav-item, .filter-chip, .graph-quick-actions button");
      if (!target || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      const rect = target.getBoundingClientRect();
      const ripple = document.createElement("span");
      const size = Math.max(rect.width, rect.height) * 1.4;
      ripple.className = "ink-ripple";
      ripple.style.width = ripple.style.height = `${size}px`;
      ripple.style.left = `${event.clientX - rect.left - size / 2}px`;
      ripple.style.top = `${event.clientY - rect.top - size / 2}px`;
      target.appendChild(ripple);
      window.setTimeout(() => ripple.remove(), 520);
    };
    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      const row = target.closest<HTMLTableRowElement>("tbody tr");
      if (row && !target.closest("button, a, input, select")) {
        row.closest("tbody")?.querySelectorAll("tr.is-selected").forEach((item) => item !== row && item.classList.remove("is-selected"));
        row.classList.toggle("is-selected");
      }
    };
    const onMove = (event: PointerEvent) => {
      const card = (event.target as HTMLElement).closest<HTMLElement>("[data-depth]");
      if (!card || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      window.cancelAnimationFrame(moveFrame);
      moveFrame = window.requestAnimationFrame(() => {
        const rect = card.getBoundingClientRect();
        card.style.setProperty("--depth-x", `${((event.clientX - rect.left) / rect.width - .5) * 2}px`);
        card.style.setProperty("--depth-y", `${((event.clientY - rect.top) / rect.height - .5) * 2}px`);
      });
    };
    const onLeave = (event: PointerEvent) => {
      const card = (event.target as HTMLElement).closest<HTMLElement>("[data-depth]");
      card?.style.setProperty("--depth-x", "0px");
      card?.style.setProperty("--depth-y", "0px");
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("click", onClick);
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerout", onLeave);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("click", onClick);
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerout", onLeave);
      window.cancelAnimationFrame(moveFrame);
    };
  }, []);

  const dismiss = (id: number) => {
    const timer = timers.current.get(id);
    if (timer) window.clearTimeout(timer);
    setToasts((items) => items.filter((item) => item.id !== id));
  };

  return <>
    <div className="section-progress" aria-hidden="true"><i style={{ width: `${progress}%` }} /></div>
    <div className="toast-region" role="region" aria-label="Action notifications" aria-live="polite">
      {toasts.map((toast) => <div className={`toast toast--${toast.tone}`} key={toast.id}>
        {toast.tone === "success" ? <CheckCircle2 aria-hidden="true" /> : <Info aria-hidden="true" />}
        <span>{toast.message}</span>
        {toast.action && <button onClick={() => { toast.action?.onClick(); dismiss(toast.id); }}><RotateCcw aria-hidden="true" />{toast.action.label}</button>}
        <button className="toast__close" onClick={() => dismiss(toast.id)} aria-label="Dismiss notification"><X /></button>
      </div>)}
    </div>
  </>;
}
