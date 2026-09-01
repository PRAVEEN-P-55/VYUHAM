import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from "react";
import { api, clearSession, getStoredSession, storeSession, type CaseRecord, type Investigator } from "../services/api";

type AppContextValue = {
  investigator: Investigator | null;
  authenticated: boolean;
  cases: CaseRecord[];
  casesLoading: boolean;
  activeCaseId: string;
  activeCase: CaseRecord | null;
  setActiveCaseId: (caseId: string) => void;
  signIn: (investigatorId: string, password: string, persistent: boolean) => Promise<void>;
  signOut: () => void;
};

const ACTIVE_CASE_KEY = "vyuham.active.case";
const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const initial = getStoredSession();
  const [investigator, setInvestigator] = useState<Investigator | null>(initial?.investigator ?? null);
  const [cases, setCases] = useState<CaseRecord[]>([]);
  const [casesLoading, setCasesLoading] = useState(Boolean(initial));
  const [activeCaseId, setActiveCaseIdState] = useState(() => localStorage.getItem(ACTIVE_CASE_KEY) ?? "CASE0001");

  const signOut = () => {
    clearSession();
    setInvestigator(null);
    setCases([]);
  };

  useEffect(() => {
    const unauthorized = () => signOut();
    window.addEventListener("vyuham:unauthorized", unauthorized);
    return () => window.removeEventListener("vyuham:unauthorized", unauthorized);
  }, []);

  useEffect(() => {
    if (!investigator) { setCasesLoading(false); return; }
    let current = true;
    setCasesLoading(true);
    api.listCases({ page_size: 1000 })
      .then((response) => {
        if (!current) return;
        setCases(response.items);
        if (response.items.length && !response.items.some((item) => item.case_id === activeCaseId)) {
          setActiveCaseIdState(response.items[0].case_id);
        }
      })
      .catch(() => { if (current) setCases([]); })
      .finally(() => { if (current) setCasesLoading(false); });
    return () => { current = false; };
  }, [investigator]);

  const setActiveCaseId = (caseId: string) => {
    setActiveCaseIdState(caseId);
    localStorage.setItem(ACTIVE_CASE_KEY, caseId);
  };

  const signIn = async (investigatorId: string, password: string, persistent: boolean) => {
    const response = await api.login({ investigator_id: investigatorId, password });
    storeSession(response, persistent);
    setInvestigator(response.investigator);
  };

  const value = useMemo<AppContextValue>(() => ({
    investigator,
    authenticated: Boolean(investigator),
    cases,
    casesLoading,
    activeCaseId,
    activeCase: cases.find((item) => item.case_id === activeCaseId) ?? null,
    setActiveCaseId,
    signIn,
    signOut,
  }), [investigator, cases, casesLoading, activeCaseId]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppContext() {
  const value = useContext(AppContext);
  if (!value) throw new Error("useAppContext must be used within AppProvider");
  return value;
}
