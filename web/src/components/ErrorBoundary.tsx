import { Component, type ErrorInfo, type ReactNode } from "react";

/** Catches render errors so one broken screen shows a message instead of a blank page. */
export class ErrorBoundary extends Component<{ children: ReactNode; label?: string; onError?: () => void }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[${this.props.label ?? "screen"}]`, error, info.componentStack);
    this.props.onError?.(); // e.g. drop a loading screen the crashed view would have cleared
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <section className="card crash" role="alert">
        <h2>Something went wrong{this.props.label ? ` in ${this.props.label}` : ""}.</h2>
        <p className="muted">Your data is safe. Reload to try again.</p>
        <button className="btn primary" onClick={() => window.location.reload()}>
          Reload
        </button>
      </section>
    );
  }
}
