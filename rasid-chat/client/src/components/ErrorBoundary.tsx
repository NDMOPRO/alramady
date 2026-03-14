import MaterialIcon from './MaterialIcon';
import { CHARACTERS } from '@/lib/assets';
import { Component, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center min-h-screen p-8 bg-background" dir="rtl">
          <div className="flex flex-col items-center w-full max-w-lg p-8 text-center">
            <img
              src={CHARACTERS.char5_arms_crossed}
              alt="راصد"
              className="w-24 h-24 object-contain mb-4"
            />

            <h2 className="text-[18px] font-bold text-foreground mb-2">حدث خطأ غير متوقع</h2>
            <p className="text-[13px] text-muted-foreground mb-4">
              يبدو أن هناك مشكلة تقنية. يرجى إعادة تحميل الصفحة أو المحاولة لاحقاً.
            </p>

            {this.state.error && (
              <div className="p-3 w-full rounded-xl bg-muted overflow-auto mb-4 text-left" dir="ltr">
                <pre className="text-[10px] text-muted-foreground whitespace-break-spaces leading-relaxed">
                  {this.state.error.message}
                </pre>
              </div>
            )}

            <button
              onClick={() => window.location.reload()}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-[13px] font-medium hover:opacity-90 transition-all active:scale-[0.97]"
            >
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>refresh</span>
              إعادة تحميل
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
