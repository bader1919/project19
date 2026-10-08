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
      <div className="border-s-4 border-danger bg-danger/10 p-5" role="alert">
        <h2 className="text-h2">This page couldn't be shown</h2>
        <p className="mt-1 text-body text-ink-2">{this.state.error.message}</p>
        <button className="btn-outline mt-4" onClick={() => this.setState({ error: null })}>Try again</button>
      </div>
    );
  }
}
