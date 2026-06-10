import type { AgentInfo, AppConfig } from '../types';

export type AmrSendPreflightIssueKind =
  | 'byok-incomplete'
  | 'agent-unselected'
  | 'agent-unavailable'
  | 'agent-auth-missing'
  | 'model-unavailable';

export interface AmrSendPreflightIssue {
  kind: AmrSendPreflightIssueKind;
  agentId?: string | null;
}

export function resolveAmrSendPreflightIssue(
  config: AppConfig | undefined,
  agents: readonly AgentInfo[] | undefined,
): AmrSendPreflightIssue | null {
  if (!config) return null;

  if (config.mode === 'api') {
    if (!config.apiKey.trim() || !config.baseUrl.trim() || !config.model.trim()) {
      return { kind: 'byok-incomplete' };
    }
    return null;
  }

  if (config.mode !== 'daemon') return null;

  const agentId = config.agentId;
  if (!agentId) return { kind: 'agent-unselected' };
  if (agentId === 'amr') return null;

  const selectedAgent = agents?.find((agent) => agent.id === agentId);
  if (!selectedAgent) return { kind: 'agent-unavailable', agentId };

  if (selectedAgent.authStatus === 'missing') {
    return { kind: 'agent-auth-missing', agentId };
  }

  if (!selectedAgent.available || hasBlockingAgentDiagnostic(selectedAgent)) {
    const authMissing = selectedAgent.diagnostics?.some(
      (diagnostic) => diagnostic.reason === 'auth-missing',
    );
    return {
      kind: authMissing ? 'agent-auth-missing' : 'agent-unavailable',
      agentId,
    };
  }

  const selectedModel = config.agentModels?.[agentId]?.model?.trim();
  if (
    selectedModel
    && selectedModel !== 'default'
    && selectedAgent.supportsCustomModel === false
    && Array.isArray(selectedAgent.models)
    && selectedAgent.models.length > 0
    && !selectedAgent.models.some((model) => model.id === selectedModel)
  ) {
    return { kind: 'model-unavailable', agentId };
  }

  return null;
}

function hasBlockingAgentDiagnostic(agent: AgentInfo): boolean {
  return (agent.diagnostics ?? []).some((diagnostic) =>
    diagnostic.severity === 'error'
    || diagnostic.reason === 'not-on-path'
    || diagnostic.reason === 'not-executable'
    || diagnostic.reason === 'shim-broken'
    || diagnostic.reason === 'configured-bin-invalid'
    || diagnostic.reason === 'auth-missing',
  );
}
