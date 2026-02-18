/**
 * ClawGate Message Module - Types
 * Agent-to-agent communication and handoff
 */

export interface MessageTarget {
  agentId: string;
  channel?: string;
  to?: string;
}

export interface MessagePayload {
  type: "text" | "json" | "template";
  content: string;
  priority?: "low" | "normal" | "high";
  metadata?: Record<string, unknown>;
}

export interface SendOptions {
  requestReply?: boolean;
  timeoutMs?: number;
  dryRun?: boolean;
  verbose?: boolean;
  background?: boolean; // Don't wait for response, fire-and-forget
}

export interface SendResult {
  success: boolean;
  messageId?: string;
  response?: string;
  error?: string;
  durationMs: number;
}

export interface MessageStatus {
  id: string;
  status: "pending" | "sent" | "delivered" | "failed" | "responded";
  agentId: string;
  toAgent?: string;
  sentAt: string;
  deliveredAt?: string;
  responseAt?: string;
  error?: string;
  response?: string;
}

export interface HandoffContext {
  conversationId?: string;
  sessionId?: string;
  userId?: string;
  originalRequest?: string;
  previousAgents?: string[];
  artifacts?: string[];
  data?: Record<string, unknown>;
}

export interface HandoffRequest {
  fromAgent: string;
  toAgent: string;
  message?: string;
  context: HandoffContext;
  deliverTo?: string;
  returnAfter?: boolean;
  returnTimeoutMs?: number;
}

export interface HandoffResult {
  success: boolean;
  handoffLogId?: string;
  response?: string;
  error?: string;
  durationMs: number;
}

export interface HandoffLog {
  id: string;
  fromAgent: string;
  toAgent: string;
  message?: string;
  context: HandoffContext;
  startedAt: string;
  completedAt?: string;
  status: "pending" | "active" | "completed" | "failed" | "returned";
  response?: string;
  error?: string;
}

export interface MessageEntry {
  id: string;
  type: "message" | "handoff";
  agentId?: string;
  toAgent?: string;
  status: string;
  sentAt: string;
}
