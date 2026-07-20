'use client';

import React from 'react';
import * as Sentry from '@sentry/nextjs';
import { Button } from '@/components/ui/button';
import { logger } from '@/lib/utils/logger';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Sentry로 에러 전송
    Sentry.captureException(error, {
      extra: {
        errorInfo,
        componentStack: errorInfo.componentStack,
      },
    });

    // 콘솔에도 출력 (개발 환경)
    logger.error('Error Boundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-card border border-border rounded-3xl p-8 text-center space-y-6">
            <div className="text-6xl">😵</div>
            <h1 className="text-2xl font-black text-foreground">
              문제가 발생했습니다
            </h1>
            <p className="text-muted-foreground">
              죄송합니다. 예상치 못한 오류가 발생했습니다.
              <br />
              잠시 후 다시 시도해주세요.
            </p>

            {process.env.NODE_ENV === 'development' && this.state.error && (
              <details className="text-left bg-card rounded-xl border border-border p-4 text-xs text-red-400 overflow-auto">
                <summary className="cursor-pointer font-bold mb-2">
                  에러 상세 (개발 모드)
                </summary>
                <pre className="whitespace-pre-wrap break-words">
                  {this.state.error.toString()}
                  {'\n\n'}
                  {this.state.error.stack}
                </pre>
              </details>
            )}

            <div className="flex gap-3">
              <Button
                onClick={() => window.location.reload()}
                className="flex-1 bg-inverse text-inverse-foreground font-black hover:opacity-90"
              >
                새로고침
              </Button>
              <Button
                onClick={() => (window.location.href = '/')}
                variant="outline"
                className="flex-1 border-border text-foreground hover:bg-card"
              >
                홈으로
              </Button>
            </div>

            <p className="text-xs text-muted-foreground">
              문제가 계속되면 고객센터로 문의해주세요.
              <br />
              maddawids@gmail.com
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
