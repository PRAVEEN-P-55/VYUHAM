import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./layout/AppShell";
import { useAppContext } from "./context/AppContext";

const OverviewPage = lazy(() => import("./pages/OverviewPage").then((module) => ({ default: module.OverviewPage })));
const DocumentIntakePage = lazy(() => import("./pages/DocumentIntakePage").then((module) => ({ default: module.DocumentIntakePage })));
const SearchPage = lazy(() => import("./pages/SearchPage").then((module) => ({ default: module.SearchPage })));
const NetworkPage = lazy(() => import("./pages/NetworkPage").then((module) => ({ default: module.NetworkPage })));
const TimelinePage = lazy(() => import("./pages/TimelinePage").then((module) => ({ default: module.TimelinePage })));
const PatternsPage = lazy(() => import("./pages/PatternsPage").then((module) => ({ default: module.PatternsPage })));
const MOComparisonPage = lazy(() => import("./pages/MOComparisonPage").then((module) => ({ default: module.MOComparisonPage })));
const IdentityReviewPage = lazy(() => import("./pages/IdentityReviewPage").then((module) => ({ default: module.IdentityReviewPage })));
const EvidenceGapsPage = lazy(() => import("./pages/EvidenceGapsPage").then((module) => ({ default: module.EvidenceGapsPage })));
const CaseRegistryPage = lazy(() => import("./pages/CaseRegistryPage").then((module) => ({ default: module.CaseRegistryPage })));
const AuditLogPage = lazy(() => import("./pages/AuditLogPage").then((module) => ({ default: module.AuditLogPage })));
const SignInPage = lazy(() => import("./pages/SignInPage").then((module) => ({ default: module.SignInPage })));

export default function App() {
  return (
    <Suspense fallback={<div className="route-loading" role="status" aria-live="polite"><div /><div /><div /><span className="sr-only">Loading page</span></div>}>
      <Routes>
        <Route path="/sign-in" element={<SignInRoute />} />
        <Route element={<RequireAuth><AppShell /></RequireAuth>}>
          <Route path="/overview" element={<OverviewPage />} />
          <Route path="/document-intake" element={<DocumentIntakePage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/network" element={<NetworkPage />} />
          <Route path="/timeline" element={<TimelinePage />} />
          <Route path="/patterns" element={<PatternsPage />} />
          <Route path="/mo-comparison" element={<MOComparisonPage />} />
          <Route path="/identity-review" element={<IdentityReviewPage />} />
          <Route path="/evidence-gaps" element={<EvidenceGapsPage />} />
          <Route path="/cases" element={<CaseRegistryPage />} />
          <Route path="/audit-log" element={<AuditLogPage />} />
        </Route>
        <Route path="/" element={<Navigate to="/overview" replace />} />
        <Route path="*" element={<Navigate to="/overview" replace />} />
      </Routes>
    </Suspense>
  );
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { authenticated } = useAppContext();
  return authenticated ? children : <Navigate to="/sign-in" replace />;
}

function SignInRoute() {
  const { authenticated } = useAppContext();
  return authenticated ? <Navigate to="/overview" replace /> : <SignInPage />;
}
