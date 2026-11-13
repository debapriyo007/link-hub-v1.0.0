import React from 'react';
import { ShieldAlert, RefreshCw } from 'lucide-react';
import { LinkHubLogo } from './LinkHubLogo.tsx';
import { Button } from './ui/Button.tsx';

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error.message || 'An unexpected error occurred.',
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('LINKHUB ErrorBoundary caught error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      let parsedError: { error?: string; operationType?: string; path?: string } | null = null;
      try {
        parsedError = JSON.parse(this.state.errorMessage);
      } catch {
        parsedError = null;
      }

      return (
        <div className="min-h-screen bg-[#0c0c0c] text-white flex items-center justify-center p-6 font-sans">
          <div className="max-w-md w-full bg-[#141414] border border-[#262626] rounded-2xl p-8 text-center shadow-2xl">
            <div className="mb-5 flex justify-center">
              <LinkHubLogo size="lg" />
            </div>
            <div className="w-12 h-12 rounded-xl bg-red-500/15 text-red-400 border border-red-500/30 flex items-center justify-center mx-auto mb-4">
              <ShieldAlert size={24} />
            </div>
            <h2 className="font-title font-bold text-lg text-white mb-2">
              Cloud Vault Sync Interrupted
            </h2>
            <p className="text-xs text-zinc-400 leading-relaxed mb-5">
              {parsedError?.error
                ? `Cloud Error (${parsedError.operationType || 'request'} on ${parsedError.path || 'vault'}): ${parsedError.error}`
                : this.state.errorMessage}
            </p>
            <Button
              color="primary"
              variant="solid"
              size="md"
              onClick={() => window.location.reload()}
              className="w-full font-bold uppercase tracking-wider"
              startContent={<RefreshCw size={14} />}
            >
              Reload LINKHUB Vault
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
