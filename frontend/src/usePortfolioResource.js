import { useCallback, useEffect, useState } from "react";
import { useAdmin } from "./components/AdminSession";

export default function usePortfolioResource(fetchContent) {
  const { sessionRevision } = useAdmin();
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState({ data: null, loading: true, error: "" });
  const reload = useCallback(() => setAttempt((value) => value + 1), []);
  useEffect(() => {
    const controller = new AbortController();
    setState((current) => ({ ...current, loading: true, error: "" }));
    fetchContent(controller.signal).then((data) => {
      if (!controller.signal.aborted) setState({ data, loading: false, error: "" });
    }).catch((error) => {
      if (!controller.signal.aborted) setState((current) => ({ ...current, loading: false, error: error.message }));
    });
    return () => controller.abort();
  }, [fetchContent, sessionRevision, attempt]);
  useEffect(() => {
    if (!state.error) return;
    window.addEventListener("online", reload);
    window.addEventListener("focus", reload);
    return () => { window.removeEventListener("online", reload); window.removeEventListener("focus", reload); };
  }, [state.error, reload]);
  const setData = useCallback((update) => setState((current) => ({ ...current, data: typeof update === "function" ? update(current.data) : update, error: "" })), []);
  return { ...state, reload, setData };
}
