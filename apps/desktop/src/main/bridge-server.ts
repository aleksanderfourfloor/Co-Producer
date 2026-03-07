import { EventEmitter } from 'node:events';
import { WebSocketServer, type RawData, type WebSocket } from 'ws';
import type {
  BridgeAnalysisResultMessage,
  BridgeErrorMessage,
  BridgeHelloMessage,
  BridgeInboundMessage,
  BridgeOutboundMessage,
  BridgeSnapshotUpdateMessage
} from '@shared/protocol';
import type { ActionPlan, AnalysisRequest, ApplyPlanResult } from '@shared/types';

interface BridgeServerEvents {
  hello: [message: BridgeHelloMessage];
  snapshot: [message: BridgeSnapshotUpdateMessage];
  analysis: [message: BridgeAnalysisResultMessage];
  errorMessage: [message: BridgeErrorMessage];
  disconnected: [];
}

export class BridgeServer extends EventEmitter<BridgeServerEvents> {
  private server?: WebSocketServer;
  private socket?: WebSocket;
  private pendingExecution = new Map<string, (result: ApplyPlanResult) => void>();

  start(port = 49741): void {
    this.server = new WebSocketServer({ host: '127.0.0.1', port });
    this.server.on('connection', (socket: WebSocket) => {
      this.socket = socket;

      socket.on('message', (data: RawData) => {
        this.handleMessage(data.toString());
      });

      socket.on('close', () => {
        if (this.socket === socket) {
          this.socket = undefined;
        }
        this.emit('disconnected');
      });
    });
  }

  stop(): void {
    this.socket?.close();
    this.server?.close();
    this.pendingExecution.clear();
  }

  isConnected(): boolean {
    return Boolean(this.socket && this.socket.readyState === this.socket.OPEN);
  }

  requestSnapshot(): void {
    this.send({ type: 'snapshot:request' });
  }

  requestAnalysis(request: AnalysisRequest): void {
    this.send({
      type: 'analysis:request',
      request
    });
  }

  executePlan(plan: ActionPlan): Promise<ApplyPlanResult> {
    this.send({
      type: 'command:batch',
      plan
    });

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        this.pendingExecution.delete(plan.id);
        resolve({
          planId: plan.id,
          accepted: false,
          message: 'Bridge execution timed out.',
          executedCommandIndexes: []
        });
      }, 15000);

      this.pendingExecution.set(plan.id, (result) => {
        clearTimeout(timeout);
        resolve(result);
      });
    });
  }

  private send(message: BridgeOutboundMessage): void {
    if (!this.socket || this.socket.readyState !== this.socket.OPEN) {
      throw new Error('Ableton bridge is not connected.');
    }

    this.socket.send(JSON.stringify(message));
  }

  private handleMessage(raw: string): void {
    let message: BridgeInboundMessage;

    try {
      message = JSON.parse(raw) as BridgeInboundMessage;
    } catch {
      this.emit('errorMessage', {
        type: 'bridge:error',
        message: 'Received malformed bridge payload.'
      });
      return;
    }

    switch (message.type) {
      case 'bridge:hello':
        this.emit('hello', message);
        break;
      case 'snapshot:update':
        this.emit('snapshot', message);
        break;
      case 'analysis:result':
        this.emit('analysis', message);
        break;
      case 'command:result': {
        const resolver = this.pendingExecution.get(message.result.planId);
        if (resolver) {
          this.pendingExecution.delete(message.result.planId);
          resolver(message.result);
        }
        break;
      }
      case 'bridge:error':
        this.emit('errorMessage', message);
        break;
    }
  }
}
