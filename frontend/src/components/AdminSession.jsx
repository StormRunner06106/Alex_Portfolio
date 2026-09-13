import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { getAdminSession, loginAdmin } from "../api";
import Modal from "./Modal";
import Icon from "./Icon";

const TOKEN_KEY = "alex-journal-admin";
const AdminContext = createContext(null);
export const useAdmin = () => useContext(AdminContext);

export default function AdminProvider({ children }) {
  const [token, setToken] = useState(() => sessionStorage.getItem(TOKEN_KEY) ?? "");
  const [checking, setChecking] = useState(Boolean(token));
  const [role, setRole] = useState(null);
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sessionRevision, setSessionRevision] = useState(0);
  const [checkAttempt, setCheckAttempt] = useState(0);
  const tokenRef = useRef(token);
  const verifiedToken = useRef("");

  const signOut = useCallback(() => {
    tokenRef.current = "";
    verifiedToken.current = "";
    sessionStorage.removeItem(TOKEN_KEY);
    setToken("");
    setRole(null);
    setChecking(false);
    setPassword("");
    setOpen(false);
  }, []);

  useEffect(() => {
    if (!token || verifiedToken.current === token) return;
    const controller = new AbortController();
    setChecking(true);
    getAdminSession(token, controller.signal)
      .then((session) => {
        if (!controller.signal.aborted && tokenRef.current === token) {
          verifiedToken.current = token;
          setRole(session.role);
          setError("");
          setSessionRevision((current) => current + 1);
        }
      })
      .catch((requestError) => {
        if (!controller.signal.aborted && tokenRef.current === token) {
          if (requestError.status === 401) signOut();
          setError(requestError.status === 401 ? requestError.message : "Could not check your session. Retry when your connection is back, or sign in again.");
        }
      })
      .finally(() => { if (!controller.signal.aborted) setChecking(false); });
    return () => controller.abort();
  }, [token, checkAttempt, signOut]);

  useEffect(() => {
    const retry = () => { if (tokenRef.current && !verifiedToken.current) setCheckAttempt((current) => current + 1); };
    window.addEventListener("online", retry);
    window.addEventListener("focus", retry);
    return () => { window.removeEventListener("online", retry); window.removeEventListener("focus", retry); };
  }, []);

  useEffect(() => {
    const expire = (event) => {
      const expiredToken = event?.detail?.token ?? token;
      if (!expiredToken || expiredToken !== tokenRef.current) return;
      signOut();
      setError("Your session ended. Sign in again to manage articles.");
    };
    window.addEventListener("journal-session-expired", expire);
    const expiresAt = Number(token.split(".")[0]) * 1000;
    const timer = token ? setTimeout(expire, Math.max(0, expiresAt - Date.now())) : null;
    return () => {
      window.removeEventListener("journal-session-expired", expire);
      if (timer !== null) clearTimeout(timer);
    };
  }, [token, signOut]);

  async function signIn(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const session = await loginAdmin(password);
      sessionStorage.setItem(TOKEN_KEY, session.access_token);
      tokenRef.current = session.access_token;
      verifiedToken.current = session.access_token;
      setToken(session.access_token);
      setRole(session.role);
      setChecking(false);
      setSessionRevision((current) => current + 1);
      setPassword("");
      setOpen(false);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  const isAdmin = role === "admin" && Boolean(token) && !checking;
  const close = () => { setOpen(false); setPassword(""); };
  return <AdminContext.Provider value={{ token, checking, isAdmin, sessionRevision, signOut, openSignIn: () => setOpen(true) }}>
    {children}
    {open && <Modal title={isAdmin ? "Admin account" : "Admin sign in"} onClose={close} busy={busy}>
      {isAdmin ? <div className="admin-account">
        <span className="publisher-badge"><span /> Admin</span>
        <p>Manage your articles, experience, and skills.</p>
        <Link className="button button--primary" to="/blog/manage" onClick={close}><Icon name="plus" size={18} /> New article</Link>
        <Link className="button" to="/blog" onClick={close}>Manage articles</Link>
        <Link className="button" to="/experience" onClick={close}>Manage experience</Link>
        <Link className="button" to="/skills" onClick={close}>Manage skills</Link>
        <button className="text-button" type="button" onClick={signOut}><Icon name="logout" size={18} /> Sign out</button>
      </div> : <form className="admin-signin" onSubmit={signIn}>
        <p>Enter the admin password to manage your website content.</p>
        <label className="publisher-field">
          <span>Admin password</span>
          <input autoFocus autoComplete="current-password" type="password" required maxLength={200}
            value={password} onChange={(event) => setPassword(event.target.value)} />
        </label>
        {error && <p className="form-status form-status--error" role="alert">{error}</p>}
        {token && !checking && <button className="text-button" type="button" onClick={() => setCheckAttempt((current) => current + 1)}>Retry session check</button>}
        <button className="button button--primary" type="submit" disabled={busy || checking}>{busy ? "Signing in…" : "Sign in"}</button>
      </form>}
    </Modal>}
  </AdminContext.Provider>;
}
