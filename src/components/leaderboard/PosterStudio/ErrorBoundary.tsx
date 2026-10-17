import React, { Component, ErrorInfo, ReactNode } from 'react';
import { useTemplateStore } from './Stores/templateStore';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });
    console.error('PosterStudio Runtime Error:', error, errorInfo);
    
    // Attempt emergency draft save
    try {
      useTemplateStore.getState().saveDraft();
      console.log('Emergency draft saved successfully.');
    } catch (e) {
      console.error('Emergency draft save failed:', e);
    }
  }

  private handleReload = () => {
    window.location.reload();
  };

  private copyLogs = () => {
    const logs = `Error: ${this.state.error?.message}\n\nStack: ${this.state.error?.stack}\n\nComponent Stack: ${this.state.errorInfo?.componentStack}`;
    navigator.clipboard.writeText(logs);
    alert('Logs copied to clipboard.');
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div style={styles.container}>
          <div style={styles.box}>
            <h2 style={styles.title}>Studio Encountered an Error</h2>
            <p style={styles.message}>
              A critical rendering or memory error occurred. Your work has been emergency-saved to the local draft if possible.
            </p>
            <div style={styles.actions}>
              <button onClick={this.handleReload} style={styles.primaryBtn}>Reload Studio</button>
              <button onClick={this.copyLogs} style={styles.secondaryBtn}>Copy Error Logs</button>
            </div>
            {this.state.error && (
              <pre style={styles.errorText}>{this.state.error.message}</pre>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    width: '100%',
    backgroundColor: '#F3F8FB',
    padding: 24,
  },
  box: {
    backgroundColor: '#FFFFFF',
    padding: 32,
    borderRadius: 16,
    boxShadow: '0 8px 32px rgba(0,0,0,0.1)',
    maxWidth: 500,
    width: '100%',
  },
  title: {
    fontSize: 20,
    fontWeight: 700,
    color: '#0F172A',
    marginBottom: 12,
    fontFamily: 'Inter, sans-serif',
  },
  message: {
    fontSize: 14,
    color: '#475569',
    marginBottom: 24,
    lineHeight: 1.5,
    fontFamily: 'Inter, sans-serif',
  },
  actions: {
    display: 'flex',
    gap: 12,
    marginBottom: 24,
  },
  primaryBtn: {
    padding: '10px 16px',
    backgroundColor: '#0F766E',
    color: '#FFFFFF',
    border: 'none',
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'Inter, sans-serif',
  },
  secondaryBtn: {
    padding: '10px 16px',
    backgroundColor: '#F1F5F9',
    color: '#0F172A',
    border: '1px solid #CBD5E1',
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'Inter, sans-serif',
  },
  errorText: {
    backgroundColor: '#FEF2F2',
    color: '#991B1B',
    padding: 12,
    borderRadius: 8,
    fontSize: 12,
    overflowX: 'auto',
    fontFamily: 'monospace',
    border: '1px solid #FECACA',
  },
};
