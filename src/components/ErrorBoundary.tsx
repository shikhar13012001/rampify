import { Component } from 'react';
import {diagnostic} from '@/lib/diagnostics';
import {trackEvent} from '@/lib/analytics';
import type { ReactNode } from 'react';

interface Props { children: ReactNode }
interface State { error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch() {
    console.error('[Rampcut] UI failure',diagnostic('ui_render',__APP_VERSION__));
    trackEvent({name:'ui_error',props:{stage:'ui_render'}});
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', height: '100vh',
          backgroundColor: '#fffaf0', color: '#0a0a0a', gap: 16, padding: 32,
        }}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none"
            stroke="#ff4d8b" strokeWidth="2" strokeLinecap="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <h2 style={{ margin: 0, fontSize: 18, color: '#ff4d8b' }}>Something went wrong</h2>
          <p style={{ margin: 0, fontSize: 13, color: '#4a4a4a', textAlign: 'center', maxWidth: 400 }}>
            {this.state.error.message}
          </p>
          <button
            onClick={() => this.setState({ error: null })}
            style={{
              padding: '8px 20px', borderRadius: 12, fontSize: 13, fontWeight: 600,
              border: '1px solid #e5dfd0', background: '#0a0a0a', color: '#fffaf0', cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
