import { Component, type ErrorInfo, type ReactNode } from "react";

/** Keeps one broken screen from blanking the whole app. */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info.componentStack);
  }

  componentDidUpdate(prev: { resetKey?: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="card p-6 text-sm" role="alert">
        <h2 className="mb-1 font-semibold">Something went wrong on this page</h2>
        <p className="text-slate-500">{this.state.error.message}</p>
        <button className="btn-outline mt-4" onClick={() => this.setState({ error: null })}>Try again</button>
      </div>
    );
  }
}
