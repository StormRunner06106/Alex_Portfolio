import { useCallback, useEffect, useState } from "react";
import { getPost, getPosts } from "./api";
import { useAdmin } from "./components/AdminSession";

// Article reads are public. Sign-in only triggers a fresh read, never gates it.
export default function useJournalResource(slug = null) {
  const { sessionRevision } = useAdmin();
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState({ key: slug, data: null, loading: true, error: "" });
  const reload = useCallback(() => setAttempt((current) => current + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    setState((current) => ({ key: slug, data: current.key === slug ? current.data : null, loading: true, error: "" }));
    const request = slug === null ? getPosts(controller.signal) : getPost(slug, controller.signal);
    request.then((data) => {
      if (!controller.signal.aborted) setState({ key: slug, data, loading: false, error: "" });
    }).catch((error) => {
      if (!controller.signal.aborted) setState((current) => ({ ...current, loading: false, error: error.message }));
    });
    return () => controller.abort();
  }, [slug, sessionRevision, attempt]);

  useEffect(() => {
    if (!state.error) return;
    const visible = () => { if (document.visibilityState === "visible") reload(); };
    window.addEventListener("online", reload);
    window.addEventListener("focus", reload);
    document.addEventListener("visibilitychange", visible);
    return () => {
      window.removeEventListener("online", reload);
      window.removeEventListener("focus", reload);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [state.error, reload]);

  const setData = useCallback((update) => {
    setState((current) => ({ ...current, data: typeof update === "function" ? update(current.data) : update }));
  }, []);
  return { ...state, loading: state.key !== slug || state.loading, data: state.key === slug ? state.data : null, reload, setData };
}
