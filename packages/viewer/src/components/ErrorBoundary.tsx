import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  fallback: ReactNode;
  /** When this changes, a previously-caught error is cleared (retry on new data). */
  resetKey?: unknown;
  children: ReactNode;
}

/**
 * Catches render errors in its subtree so one misbehaving component (a renderer
 * bug, or data that slipped past validation) degrades to a small fallback
 * instead of blanking the whole artifact. React error boundaries must be class
 * components.
 */
export class ErrorBoundary extends Component<Props, { error: Error | null }> {
  override state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[desk] render error:', error, info.componentStack);
  }

  override componentDidUpdate(prev: Props) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  override render() {
    return this.state.error ? this.props.fallback : this.props.children;
  }
}
