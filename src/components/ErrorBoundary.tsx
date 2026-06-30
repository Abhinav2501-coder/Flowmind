import React, { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  private handleReload = () => {
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-full min-h-[400px] p-6 text-center">
          <div className="w-16 h-16 bg-rose-500/10 rounded-full flex items-center justify-center mb-6">
            <AlertTriangle className="w-8 h-8 text-rose-500" />
          </div>
          <h2 className="text-xl font-bold font-display text-text mb-2">
            Something went wrong
          </h2>
          <p className="text-muted text-sm max-w-md mb-8">
            An unexpected error occurred in this section. Our system has logged
            the issue.
          </p>

          {this.state.error && (
            <div className="mb-8 p-4 bg-surface rounded-xl text-left max-w-2xl w-full overflow-x-auto border border-surface">
              <p className="text-xs font-mono text-rose-400">
                {this.state.error.message}
              </p>
            </div>
          )}

          <button
            onClick={this.handleReload}
            className="flex items-center gap-2 px-6 py-3 bg-primary hover:bg-primary-hover text-white rounded-xl font-semibold transition shadow-lg shadow-primary/20 hover:-translate-y-1"
          >
            <RefreshCw className="w-4 h-4" />
            Reload Page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
