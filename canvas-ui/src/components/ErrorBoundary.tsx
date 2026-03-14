import { Component, type ReactNode, type ErrorInfo } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({ errorInfo });
    console.error('[ErrorBoundary]', error, errorInfo.componentStack);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="flex items-center justify-center min-h-screen p-8 bg-background text-foreground" dir="rtl">
          <div className="max-w-lg w-full space-y-6 text-center">
            <div className="flex justify-center">
              <div className="flex size-16 items-center justify-center rounded-full bg-destructive/10">
                <AlertTriangle className="size-8 text-destructive" />
              </div>
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-semibold tracking-tight">حدث خطأ غير متوقع</h2>
              <p className="text-muted-foreground text-sm">
                {this.state.error?.message || 'خطأ غير معروف في التطبيق'}
              </p>
            </div>
            {this.state.error?.stack && (
              <details className="text-right">
                <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
                  تفاصيل الخطأ
                </summary>
                <pre className="mt-2 max-h-[200px] overflow-auto rounded-md bg-muted p-3 text-[10px] text-muted-foreground font-mono text-left" dir="ltr">
                  {this.state.error.stack}
                </pre>
              </details>
            )}
            <button
              onClick={() => this.setState({ hasError: false, error: null, errorInfo: null })}
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              <RefreshCw className="size-4" />
              إعادة المحاولة
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
