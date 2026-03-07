import { EventEmitter } from 'node:events';
import { WebSocketServer, type RawData, type WebSocket } from 'ws';
import type {
  BridgeAnalysisResultMessage,
  BridgeCommandStartedMessage,
  BridgeCommandStepResultMessage,
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
  commandStarted: [message: BridgeCommandStartedMessage];
  commandStep: [message: BridgeCommandStepResultMessage];
  errorMessage: [message: BridgeErrorMessage];
  disconnected: [];
}

interface PendingExecution {
  resolve: (result: ApplyPlanResult) => void;
  timeout: NodeJS.Timeout;
}

export class BridgeServer extends EventEmitter<BridgeServerEvents> {
  private server?: WebSocketServer;
  private socket?: WebSocket;
  private pendingExecution = new Map<string, PendingExecution>();

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
        for (const [planId, pending] of this.pendingExecution.entries()) {
          clearTimeout(pending.timeout);
          pending.resolve({
            planId,
            accepted: false,
            message: 'Ableton bridge disconnected before execution completed.',
            executedCommandIndexes: []
          });
        }
        this.pendingExecution.clear();
        this.emit('disconnected');
      });
    });
  }

  stop(): void {
    this.socket?.close();
    this.server?.close();
    for (const pending of this.pendingExecution.values()) {
      clearTimeout(pending.timeout);
    }
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

    return this.awaitExecution(plan.id, 15000);
  }

  runSelfTest(planId: string): Promise<ApplyPlanResult> {
    this.send({
      type: 'self_test:request',
      planId
    });

    return this.awaitExecution(planId, 20000);
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
      case 'command:started':
        this.emit('commandStarted', message);
        break;
      case 'command:step_result':
        this.emit('commandStep', message);
        break;
      case 'command:result': {
        const pending = this.pendingExecution.get(message.result.planId);
        if (pending) {
          this.pendingExecution.delete(message.result.planId);
          clearTimeout(pending.timeout);
          pending.resolve(message.result);
        }
        break;
      }
      case 'bridge:error':
        this.emit('errorMessage', message);
        break;
    }
  }

  private awaitExecution(planId: string, timeoutMs: number): Promise<ApplyPlanResult> {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        this.pendingExecution.delete(planId);
        resolve({
          planId,
          accepted: false,
          message: 'Bridge execution timed out.',
          executedCommandIndexes: []
        });
      }, timeoutMs);

      this.pendingExecution.set(planId, {
        resolve,
        timeout
      });
    });
  }
}
