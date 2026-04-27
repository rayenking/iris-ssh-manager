export type TunnelType = 'local' | 'remote' | 'dynamic';

export type TunnelStatus = 'active' | 'stopped' | 'error';

export interface Tunnel {
  id: string;
  sessionId: string;
  type: TunnelType;
  localPort?: number;
  remoteHost?: string;
  remotePort?: number;
  localHost?: string;
  status: TunnelStatus;
  bytesTransferred: number;
  errorMessage?: string;
}

export type TunnelConfig =
  | {
      type: 'local';
      localPort: number;
      remoteHost: string;
      remotePort: number;
    }
  | {
      type: 'remote';
      remotePort: number;
      localHost: string;
      localPort: number;
    }
  | {
      type: 'dynamic';
      localPort: number;
    };
