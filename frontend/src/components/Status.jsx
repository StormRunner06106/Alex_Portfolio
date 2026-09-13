export function LoadingState({ label = "Loading" }) {
  return (
    <div className="state-card" role="status">
      <span className="loader" aria-hidden="true" />
      <p>{label}…</p>
    </div>
  );
}

export function ErrorState({ message, onRetry, retrying = false }) {
  return (
    <div className="state-card state-card--error" role="alert">
      <span className="state-icon">!</span>
      <div>
        <strong>That didn’t load.</strong>
        <p>{message}</p>
        {onRetry && <button className="button" type="button" disabled={retrying} onClick={onRetry}>{retrying ? "Retrying..." : "Try again"}</button>}
      </div>
    </div>
  );
}
