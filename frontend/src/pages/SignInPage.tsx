import { Eye, EyeOff, LockKeyhole, ShieldCheck } from "lucide-react";
import { type FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Banner, Button, Field, Input } from "../components/ui";
import { useAppContext } from "../context/AppContext";

export function SignInPage() {
  const navigate = useNavigate();
  const { signIn } = useAppContext();
  const [showPassword, setShowPassword] = useState(false);
  const [investigatorId, setInvestigatorId] = useState("INV001");
  const [password, setPassword] = useState("vyuham123");
  const [persistent, setPersistent] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!investigatorId.trim() || !password) {
      setError("Enter your authorised investigator ID and password.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      await signIn(investigatorId.trim().toUpperCase(), password, persistent);
      navigate("/overview", { replace: true });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to sign in. Check the backend connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="signin-page">
      <div className="signin-header"><div className="brand__mark"><ShieldCheck /></div><div><strong>VYUHAM</strong><span>Criminal Network Intelligence Platform</span></div></div>
      <section className="signin-card" aria-labelledby="signin-title">
        <div><BadgeLine /><h1 id="signin-title">Authorised access</h1><p>Sign in with your departmental credentials to access assigned investigations.</p></div>
        {error && <Banner tone="warning">{error}</Banner>}
        <form onSubmit={submit} noValidate>
          <Field label="Investigator ID" hint="Demo access: INV001"><Input type="text" autoComplete="username" value={investigatorId} onChange={(event) => setInvestigatorId(event.target.value)} aria-invalid={Boolean(error)} /></Field>
          <Field label="Password"><div className="password-field"><Input type={showPassword ? "text" : "password"} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} aria-invalid={Boolean(error)} /><button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? <EyeOff /> : <Eye />}</button></div></Field>
          <div className="signin-options"><label><input type="checkbox" checked={persistent} onChange={(event) => setPersistent(event.target.checked)} /> Keep me signed in on this device</label><span className="mono">Secure Bearer session</span></div>
          <Button type="submit" variant="primary" disabled={loading}>{loading ? "Verifying access…" : "Sign in securely"}</Button>
        </form>
        <div className="signin-security"><LockKeyhole /><span><strong>Restricted government system</strong> Access and actions are audited. Unauthorised use may result in disciplinary or legal action.</span></div>
      </section>
      <footer>Government of Tamil Nadu · Police Department · VYUHAM authorised access</footer>
    </main>
  );
}

function BadgeLine() { return <span className="signin-org">TAMIL NADU POLICE · INVESTIGATION SERVICES</span>; }
