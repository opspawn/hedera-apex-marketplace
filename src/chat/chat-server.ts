/**
 * Chat Server — Express routes for conversational agent interface.
 *
 * Provides session management and message processing via
 * @hashgraphonline/conversational-agent's ConversationalAgent.
 */

import { Router, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import { ChatAgent, ChatAgentConfig, AgentChatResponse } from './agent-chat';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChatMessage {
  id: string;
  role: 'user' | 'agent';
  content: string;
  timestamp: string;
  toolCalls?: Array<{ name: string; args: Record<string, unknown>; output?: string }>;
  error?: string;
}

interface ChatSession {
  id: string;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
}

type ChatHistoryItem = { type: 'human' | 'ai'; content: string };

// ---------------------------------------------------------------------------
// Session store (in-memory)
// ---------------------------------------------------------------------------

const sessions = new Map<string, ChatSession>();

function getOrCreateSession(sessionId?: string): ChatSession {
  if (sessionId && sessions.has(sessionId)) {
    return sessions.get(sessionId)!;
  }
  const id = sessionId ?? uuid();
  const session: ChatSession = {
    id,
    messages: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  sessions.set(id, session);
  return session;
}

// ---------------------------------------------------------------------------
// Agent singleton (lazy-initialized)
// ---------------------------------------------------------------------------

let agentInstance: any = null;
let agentInitPromise: Promise<void> | null = null;
let agentError: string | null = null;

function getApiKeyConfig(): { apiKey: string; provider: 'openai' | 'anthropic' } | null {
  if (process.env.OPENAI_API_KEY) {
    return { apiKey: process.env.OPENAI_API_KEY, provider: 'openai' };
  }
  if (process.env.ANTHROPIC_API_KEY) {
    return { apiKey: process.env.ANTHROPIC_API_KEY, provider: 'anthropic' };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Smart rule-based fallback (no LLM needed)
// ---------------------------------------------------------------------------

const HCS_STANDARDS = [
  { id: 'HCS-1', name: 'Topic Reference Standard', description: 'Standard for referencing HCS topics across protocols' },
  { id: 'HCS-2', name: 'Token Metadata', description: 'On-chain metadata for fungible and non-fungible tokens' },
  { id: 'HCS-3', name: 'Recursion Standard', description: 'Recursive topic references for composable data structures' },
  { id: 'HCS-5', name: 'Topic Auditing', description: 'Audit trails and compliance logging via HCS topics' },
  { id: 'HCS-10', name: 'Agent Communication', description: 'OpenConversation standard for agent-to-agent messaging via HCS topics' },
  { id: 'HCS-11', name: 'Agent Profile', description: 'On-chain agent profiles with capabilities, bio, and metadata' },
  { id: 'HCS-14', name: 'Agent Identity & Verification', description: 'DID-based identity verification for agents' },
  { id: 'HCS-19', name: 'Privacy & Consent', description: 'Privacy consent management for data sharing between agents' },
  { id: 'HCS-20', name: 'Points & Reputation', description: 'On-chain reputation points tracking and leaderboards' },
  { id: 'HCS-26', name: 'Skill Publishing', description: 'Skill manifest publishing and discovery for agent capabilities' },
];

interface SmartFallbackOptions {
  baseUrl?: string;
}

export function getSmartFallbackResponse(message: string, opts?: SmartFallbackOptions): { content: string; intent: string; queryEndpoint?: string } {
  const lower = message.toLowerCase().trim();
  const baseUrl = opts?.baseUrl || '';

  // Trust scores (check BEFORE list_agents since both mention "agent")
  if ((/\b(trust|score|reputation|rating)\b/i.test(lower) &&
      /\b(show|get|what|display|dashboard|view|have)\b/i.test(lower)) ||
      /\bshow\b.*\btrust\b/i.test(lower)) {
    return {
      intent: 'trust_scores',
      queryEndpoint: `${baseUrl}/api/analytics/charts`,
      content: `**Trust Scores** are a key feature of the Hedera Agent Marketplace!\n\nEach agent has a trust score from 0-100, calculated from:\n- **Task completion rate** — How reliably they complete work\n- **Response quality** — Ratings from other agents and users\n- **On-chain activity** — HCS-20 reputation points\n- **Identity verification** — HCS-14 DID verification status\n- **ERC-8004 dual identity** — Cross-chain identity linking\n\n**Trust Levels:**\n- 🆕 **New** (0-20) — Recently registered\n- 📘 **Basic** (21-40) — Some activity\n- ✅ **Trusted** (41-60) — Reliable track record\n- 🏅 **Verified** (61-80) — Strong reputation\n- 🏆 **Elite** (81-100) — Top-tier agents\n\nView the trust dashboard:\n- \`GET /api/agents/:id/trust\` — Individual agent trust\n- \`GET /api/analytics/charts\` — Trust distribution dashboard\n- \`GET /api/reachability\` — Agent connectivity status`,
    };
  }

  // What standards do you support? (check BEFORE list_agents)
  if (/\b(standards?|hcs|protocols?|specifications?|specs?)\b/i.test(lower) &&
      /\b(support|use|implement|which|what|list)\b/i.test(lower)) {
    const standardsList = HCS_STANDARDS
      .map(s => `- **${s.id}**: ${s.name} — ${s.description}`)
      .join('\n');
    return {
      intent: 'standards',
      content: `The Hedera Agent Marketplace implements **10 HCS standards** plus multi-protocol interop:\n\n**Hedera Consensus Service Standards:**\n${standardsList}\n\n**Additional Protocols:**\n- **A2A** — Google Agent-to-Agent protocol for task delegation\n- **MCP** — Model Context Protocol with 5 marketplace tools\n- **ERC-8004** — Cross-chain dual identity (Hedera ↔ EVM)\n\nAll agent data is anchored to Hedera Consensus Service topics for verifiable, tamper-proof records.`,
    };
  }

  // How to hire an agent? (check BEFORE list_agents)
  if (/\b(how|steps?|process|guide)\b.*\b(hire|book|use|engage|employ)\b/i.test(lower) ||
      /\b(hire|book|engage|employ)\b.*\b(agent|how|guide|steps?)\b/i.test(lower)) {
    return {
      intent: 'hire_guide',
      content: `Here's how to **hire an agent** on the Hedera Agent Marketplace:\n\n**Step 1: Discover Agents**\nBrowse available agents on the dashboard or use:\n\`GET /api/marketplace/discover?q=data+analysis\`\n\n**Step 2: Review Profiles**\nCheck each agent's capabilities, trust score, and reputation:\n\`GET /api/marketplace/agent/:id\`\n\n**Step 3: Hire the Agent**\nSend a hire request with your task description:\n\`POST /api/marketplace/hire\`\n\`\`\`json\n{ "agent_id": "agent-001", "task": "Analyze my dataset" }\n\`\`\`\n\n**Step 4: Communicate**\nOnce hired, communicate via HCS-10 connections or the chat relay:\n- "Connect to agent 0.0.12345"\n- "Send message to the analyst"\n\n**Step 5: Rate & Review**\nAfter the task is complete, leave feedback to update the agent's reputation score.\n\nReputation points (HCS-20) are awarded for successful interactions!`,
    };
  }

  // What agents are available?
  if (/\b(what|which|list|show|available|all)\b.*\bagent/i.test(lower) ||
      /\bagent\b.*\b(available|list|show)\b/i.test(lower)) {
    return {
      intent: 'list_agents',
      queryEndpoint: `${baseUrl}/api/agents`,
      content: `I can look up the available agents for you! Here's what our marketplace offers:\n\nThe Hedera Agent Marketplace hosts AI agents that you can discover, hire, and interact with. Each agent is registered on-chain using HCS-10/11/14 standards.\n\nTo see live agents, visit the **Marketplace Dashboard** or use the API:\n- \`GET /api/agents\` — List all registered agents\n- \`GET /api/marketplace/discover\` — Discovery with filtering\n\nYou can also search for specific capabilities like "data analysis" or "code review".`,
    };
  }

  // What is this marketplace?
  if (/\b(what is|describe|about|explain)\b.*\b(this|the)?\s*(marketplace|platform|service)\b/i.test(lower) ||
      /\bmarketplace\b.*\b(about|what|describe)\b/i.test(lower) ||
      /\bhello\b|\bhi\b|\bhey\b|\bhelp\b/i.test(lower)) {
    return {
      intent: 'about_marketplace',
      content: `Welcome to the **Hedera Agent Marketplace**! 🏪\n\nThis is a decentralized marketplace for AI agents built on the **Hedera Hashgraph** network. Here's what makes it special:\n\n**Core Features:**\n- **Agent Registration** — Register AI agents with on-chain identity (HCS-11, HCS-14)\n- **Agent Discovery** — Find agents by capability, reputation, and trust scores\n- **Secure Communication** — Peer-to-peer messaging via HCS-10 topics\n- **Privacy Consent** — GDPR-compliant data sharing (HCS-19)\n- **Reputation System** — On-chain points and trust scores (HCS-20)\n- **Skill Publishing** — Publish and discover agent skills (HCS-26)\n\n**Multi-Protocol Support:**\n- **HCS-10** — Hedera Consensus Service for agent communication\n- **A2A** — Google Agent-to-Agent protocol\n- **MCP** — Model Context Protocol (5 tools)\n\nTry asking me "What agents are available?" or "How do I hire an agent?"`,
    };
  }

  // Reachability / connectivity
  if ((/\breach/i.test(lower) || /\b(connect|protocol|endpoint|api|status)\b/i.test(lower)) &&
      /\b(check|test|verify|how|available)\b/i.test(lower)) {
    return {
      intent: 'reachability',
      queryEndpoint: `${baseUrl}/api/reachability/test`,
      content: `The marketplace is reachable via **3 protocols**:\n\n1. **HCS-10** (Hedera Consensus Service)\n   - Agent-to-agent messaging via HCS topics\n   - Auto-accept connections enabled\n   - Endpoint: \`/api/connections\`\n\n2. **A2A** (Agent-to-Agent Protocol)\n   - Discovery card: \`/.well-known/agent.json\`\n   - Task delegation: \`/api/a2a/tasks\`\n\n3. **MCP** (Model Context Protocol)\n   - 5 marketplace tools available\n   - Endpoint: \`/mcp\`\n   - Tools: \`/api/mcp/tools\`\n\nCheck reachability: \`GET /api/reachability/test\``,
    };
  }

  // Registration / sign up
  if (/\b(register|sign ?up|create)\b.*\b(agent|account|profile)\b/i.test(lower)) {
    return {
      intent: 'register_guide',
      content: `To **register a new agent** on the Hedera Agent Marketplace:\n\n**Quick Registration (API):**\n\`\`\`bash\nPOST /api/marketplace/register\n{\n  "name": "My AI Agent",\n  "description": "A data analysis specialist",\n  "endpoint": "https://my-agent.example.com",\n  "skills": ["data-analysis", "visualization"],\n  "tags": ["ai", "analytics"]\n}\n\`\`\`\n\n**What happens on registration:**\n1. Agent profile created (HCS-11)\n2. Identity verified (HCS-14)\n3. Listed in the marketplace for discovery\n4. Registered in HOL Universal Agent Index\n5. Initial trust score assigned\n\n**AWS KMS Registration (Enterprise):**\n\`POST /api/kms/register-agent\` — Register with hardware-backed keys\n\nAfter registration, your agent is discoverable via HCS-10, A2A, and MCP protocols.`,
    };
  }

  // Default — helpful response with suggestions
  return {
    intent: 'general',
    content: `I'm the **Hedera Agent Marketplace** assistant! I can help you with:\n\n💡 **Try asking:**\n- "What agents are available?" — Browse registered agents\n- "What is this marketplace?" — Learn about the platform\n- "How do I hire an agent?" — Step-by-step hiring guide\n- "Show me trust scores" — View agent reputation data\n- "What standards do you support?" — See all 10 HCS standards\n- "How do I register an agent?" — Registration guide\n- "Check reachability" — Verify protocol connectivity\n\n**Quick Links:**\n- [Marketplace Dashboard](/)\n- [Agent Chat](/chat)\n- [API Health](/health)\n- [Agent Card](/.well-known/agent.json)`,
  };
}

async function getAgent(): Promise<any> {
  if (agentInstance) return agentInstance;
  if (agentError) throw new Error(agentError);
  if (agentInitPromise) {
    await agentInitPromise;
    if (agentInstance) return agentInstance;
    throw new Error(agentError ?? 'Agent initialization failed');
  }

  const keyConfig = getApiKeyConfig();
  if (!keyConfig) return null; // No API key — caller should handle gracefully

  agentInitPromise = (async () => {
    try {
      const { ConversationalAgent } = await import('@hashgraphonline/conversational-agent');
      const agent = new ConversationalAgent({
        accountId: process.env.HEDERA_ACCOUNT_ID || '0.0.0',
        privateKey: process.env.HEDERA_PRIVATE_KEY || '',
        openAIApiKey: keyConfig.apiKey,
        llmProvider: keyConfig.provider,
        network: (process.env.HEDERA_NETWORK as any) || 'testnet',
        operationalMode: 'autonomous',
        verbose: false,
        disableLogging: true,
      });
      await agent.initialize();
      agentInstance = agent;
    } catch (err: any) {
      agentError = `Failed to initialize ConversationalAgent: ${err.message}`;
      throw new Error(agentError);
    }
  })();

  await agentInitPromise;
  return agentInstance;
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export interface ChatRouterOptions {
  chatAgentConfig?: ChatAgentConfig;
  getAgentCount?: () => number;
  getAgentList?: () => Array<{ name: string; agent_id: string; description?: string; trust_score?: number }>;
}

let chatAgentInstance: ChatAgent | null = null;

function getChatAgent(options?: ChatRouterOptions): ChatAgent | null {
  if (chatAgentInstance) return chatAgentInstance;
  if (options?.chatAgentConfig) {
    chatAgentInstance = new ChatAgent(options.chatAgentConfig);
  }
  return chatAgentInstance;
}

export function createChatRouter(options?: ChatRouterOptions): Router {
  const router = Router();

  // --- Serve chat UI -------------------------------------------------
  router.get('/chat', (_req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/html');
    res.send(getChatHTML());
  });

  // --- Create new session --------------------------------------------
  router.post('/api/chat/session', (_req: Request, res: Response) => {
    const session = getOrCreateSession();
    res.json({ sessionId: session.id, createdAt: session.createdAt });
  });

  // --- Get message history -------------------------------------------
  router.get('/api/chat/history/:sessionId', (req: Request, res: Response) => {
    const sessionId = req.params.sessionId as string;
    const session = sessions.get(sessionId);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    res.json({ sessionId: session.id, messages: session.messages });
  });

  // --- Send message --------------------------------------------------
  router.post('/api/chat/message', async (req: Request, res: Response) => {
    const { sessionId, message } = req.body as { sessionId?: string; message?: string };

    if (!message || typeof message !== 'string' || !message.trim()) {
      res.status(400).json({ error: 'validation_error', message: 'Message is required' });
      return;
    }

    if (message.length > 10000) {
      res.status(400).json({ error: 'validation_error', message: 'Message too long (max 10,000 characters)' });
      return;
    }

    const session = getOrCreateSession(sessionId);

    // Record user message
    const userMsg: ChatMessage = {
      id: uuid(),
      role: 'user',
      content: message.trim(),
      timestamp: new Date().toISOString(),
    };
    session.messages.push(userMsg);
    session.updatedAt = new Date().toISOString();

    // Check API key — use smart fallback if no LLM configured
    const keyConfig = getApiKeyConfig();
    if (!keyConfig) {
      const fallback = getSmartFallbackResponse(message.trim());
      const fallbackMsg: ChatMessage = {
        id: uuid(),
        role: 'agent',
        content: fallback.content,
        timestamp: new Date().toISOString(),
      };
      session.messages.push(fallbackMsg);
      session.updatedAt = new Date().toISOString();
      res.json({ sessionId: session.id, userMessage: userMsg, agentMessage: fallbackMsg, intent: fallback.intent, fallback: true });
      return;
    }

    // Process with agent
    try {
      const agent = await getAgent();
      if (!agent) {
        throw new Error('Agent not available');
      }

      // Build chat history from session (exclude current message)
      const chatHistory: ChatHistoryItem[] = session.messages
        .slice(0, -1) // exclude the user message we just added
        .map((m) => ({
          type: (m.role === 'user' ? 'human' : 'ai') as 'human' | 'ai',
          content: m.content,
        }));

      const response = await agent.processMessage(message.trim(), chatHistory);

      const agentMsg: ChatMessage = {
        id: uuid(),
        role: 'agent',
        content: response.output || response.message || 'No response generated.',
        timestamp: new Date().toISOString(),
        toolCalls: response.tool_calls?.map((tc: any) => ({
          name: tc.name,
          args: tc.args,
          output: tc.output,
        })),
      };
      session.messages.push(agentMsg);
      session.updatedAt = new Date().toISOString();

      res.json({ sessionId: session.id, userMessage: userMsg, agentMessage: agentMsg });
    } catch (err: any) {
      const errorMsg: ChatMessage = {
        id: uuid(),
        role: 'agent',
        content: 'Sorry, I encountered an error processing your message.',
        timestamp: new Date().toISOString(),
        error: err.message,
      };
      session.messages.push(errorMsg);
      session.updatedAt = new Date().toISOString();

      res.status(500).json({ sessionId: session.id, userMessage: userMsg, agentMessage: errorMsg });
    }
  });

  // --- Chat status (API key check) -----------------------------------
  router.get('/api/chat/status', (_req: Request, res: Response) => {
    const keyConfig = getApiKeyConfig();
    const agent = getChatAgent(options);
    res.json({
      configured: !!keyConfig,
      provider: keyConfig?.provider ?? null,
      hederaConfigured: !!(process.env.HEDERA_ACCOUNT_ID && process.env.HEDERA_PRIVATE_KEY),
      agentReady: !!agentInstance,
      chatAgentReady: !!agent,
      error: agentError,
    });
  });

  // --- POST /api/chat/agent — Natural language chat agent endpoint ---
  // Uses our lightweight ChatAgent with tool calling (no external LLM needed)
  router.post('/api/chat/agent', async (req: Request, res: Response) => {
    const { message, sessionId } = req.body as { message?: string; sessionId?: string };

    if (!message || typeof message !== 'string' || !message.trim()) {
      res.status(400).json({ error: 'Message is required' });
      return;
    }

    const agent = getChatAgent(options);
    if (!agent) {
      res.status(503).json({
        error: 'Chat agent not configured',
        message: 'The natural language chat agent requires RegistryBroker and ConnectionHandler to be initialized.',
      });
      return;
    }

    try {
      const sid = sessionId || uuid();
      const result: AgentChatResponse = await agent.processMessage(message.trim(), sid);
      res.json(result);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Unknown error';
      res.status(500).json({ error: 'chat_agent_failed', message: errMsg });
    }
  });

  // --- POST /api/chat/smart — Smart endpoint that enriches fallback with live data ---
  router.post('/api/chat/smart', async (req: Request, res: Response) => {
    const { message, sessionId } = req.body as { message?: string; sessionId?: string };

    if (!message || typeof message !== 'string' || !message.trim()) {
      res.status(400).json({ error: 'validation_error', message: 'Message is required' });
      return;
    }

    const session = getOrCreateSession(sessionId);
    const userMsg: ChatMessage = {
      id: uuid(),
      role: 'user',
      content: message.trim(),
      timestamp: new Date().toISOString(),
    };
    session.messages.push(userMsg);
    session.updatedAt = new Date().toISOString();

    // First try the ChatAgent (tool-calling) if available
    const agent = getChatAgent(options);
    if (agent) {
      try {
        const sid = session.id;
        const result: AgentChatResponse = await agent.processMessage(message.trim(), sid);
        const agentMsg: ChatMessage = {
          id: uuid(),
          role: 'agent',
          content: result.response,
          timestamp: new Date().toISOString(),
          toolCalls: result.actions.map(a => ({
            name: a.tool,
            args: a.args,
            output: a.result.message,
          })),
        };
        session.messages.push(agentMsg);
        session.updatedAt = new Date().toISOString();
        res.json({
          sessionId: session.id,
          userMessage: userMsg,
          agentMessage: agentMsg,
          source: 'chat_agent',
          actions: result.actions,
        });
        return;
      } catch {
        // Fall through to smart fallback
      }
    }

    // Smart fallback with live data enrichment
    const fallback = getSmartFallbackResponse(message.trim());
    let enrichedContent = fallback.content;

    // Enrich with live agent list data if applicable
    if (fallback.intent === 'list_agents' && options?.getAgentList) {
      const agents = options.getAgentList();
      if (agents.length > 0) {
        const agentList = agents.slice(0, 10).map((a, i) =>
          `${i + 1}. **${a.name}** (${a.agent_id})${a.description ? ` — ${a.description}` : ''}${a.trust_score !== undefined ? ` [Trust: ${a.trust_score}]` : ''}`
        ).join('\n');
        enrichedContent += `\n\n**Currently registered agents (${agents.length} total):**\n${agentList}`;
      }
    }

    // Enrich with live agent count
    if (fallback.intent === 'about_marketplace' && options?.getAgentCount) {
      const count = options.getAgentCount();
      if (count > 0) {
        enrichedContent += `\n\n**Currently hosting ${count} registered agents.**`;
      }
    }

    const agentMsg: ChatMessage = {
      id: uuid(),
      role: 'agent',
      content: enrichedContent,
      timestamp: new Date().toISOString(),
    };
    session.messages.push(agentMsg);
    session.updatedAt = new Date().toISOString();

    res.json({
      sessionId: session.id,
      userMessage: userMsg,
      agentMessage: agentMsg,
      source: 'smart_fallback',
      intent: fallback.intent,
      fallback: true,
    });
  });

  // --- GET /api/chat/agent/tools — List available chat agent tools ---
  router.get('/api/chat/agent/tools', (_req: Request, res: Response) => {
    const agent = getChatAgent(options);
    if (!agent) {
      res.json({ tools: [], available: false });
      return;
    }
    res.json({ tools: agent.getAvailableTools(), available: true });
  });

  // --- GET /api/chat/agent/history/:sessionId — Chat agent history ---
  router.get('/api/chat/agent/history/:sessionId', (req: Request, res: Response) => {
    const agent = getChatAgent(options);
    if (!agent) {
      res.status(503).json({ error: 'Chat agent not configured' });
      return;
    }
    const sid = String(req.params.sessionId);
    const history = agent.getHistory(sid);
    res.json({ sessionId: sid, messages: history });
  });

  return router;
}

// ---------------------------------------------------------------------------
// Chat HTML (inline CSS/JS — matches marketplace dashboard theme)
// ---------------------------------------------------------------------------

function getChatHTML(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Hedera Agent Chat</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #080c14; color: #e0e0e0; height: 100vh; display: flex; flex-direction: column; }

    @keyframes fadeInUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
    @keyframes spin { to { transform: rotate(360deg); } }
    @keyframes slideIn { from { opacity: 0; transform: translateX(-8px); } to { opacity: 1; transform: translateX(0); } }
    @keyframes glowPulse { 0%, 100% { box-shadow: 0 0 4px rgba(0,212,255,0.2); } 50% { box-shadow: 0 0 12px rgba(0,212,255,0.4); } }
    @keyframes typeIn { from { opacity: 0; max-height: 0; } to { opacity: 1; max-height: 500px; } }

    /* Header */
    .header { background: linear-gradient(135deg, #0d1528 0%, #131b30 50%, #0f1a2e 100%); padding: 1rem 1.5rem; border-bottom: 1px solid #1e2a4a; display: flex; align-items: center; justify-content: space-between; flex-shrink: 0; }
    .header-left { display: flex; align-items: center; gap: 0.75rem; }
    .logo { width: 36px; height: 36px; background: linear-gradient(135deg, #00d4ff, #0088cc); border-radius: 10px; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 1rem; color: #fff; }
    .header h1 { font-size: 1.2rem; color: #fff; font-weight: 600; }
    .header h1 span { color: #00d4ff; }
    .header-actions { display: flex; gap: 0.5rem; align-items: center; }
    .header-link { padding: 0.4rem 0.8rem; background: rgba(0, 212, 255, 0.1); border: 1px solid rgba(0, 212, 255, 0.3); border-radius: 6px; font-size: 0.75rem; color: #00d4ff; text-decoration: none; transition: background 0.2s; }
    .header-link:hover { background: rgba(0, 212, 255, 0.2); }

    /* Status bar */
    .status-bar { background: #0d1528; padding: 0.5rem 1.5rem; border-bottom: 1px solid #1e2a4a; display: flex; align-items: center; gap: 0.75rem; font-size: 0.8rem; flex-shrink: 0; }
    .status-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
    .status-dot.ok { background: #00c853; animation: glowPulse 2s ease infinite; }
    .status-dot.warn { background: #ffaa00; animation: pulse 1.5s ease infinite; }
    .status-dot.error { background: #ff4444; }
    .status-text { color: #6a7a9a; }
    .status-text strong { color: #a0b0d0; }

    /* Chat area */
    .chat-container { flex: 1; overflow-y: auto; padding: 1.5rem; display: flex; flex-direction: column; gap: 1rem; scroll-behavior: smooth; }

    /* Welcome screen */
    .welcome { text-align: center; margin: auto; max-width: 600px; animation: fadeInUp 0.5s ease; }
    .welcome-icon { font-size: 3rem; margin-bottom: 1rem; }
    .welcome h2 { font-size: 1.5rem; color: #fff; margin-bottom: 0.75rem; }
    .welcome p { color: #6a7a9a; font-size: 0.95rem; line-height: 1.6; margin-bottom: 1.5rem; }
    .suggestions { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 0.75rem; }
    .suggestion { padding: 0.85rem 1rem; background: #111827; border: 1px solid #1e2a4a; border-radius: 10px; color: #a0b0d0; font-size: 0.85rem; cursor: pointer; transition: all 0.25s ease; text-align: left; }
    .suggestion:hover { border-color: rgba(0, 212, 255, 0.5); background: rgba(0, 212, 255, 0.08); color: #00d4ff; transform: translateY(-2px); box-shadow: 0 4px 16px rgba(0, 212, 255, 0.1); }
    .suggestion .suggestion-label { font-size: 0.7rem; color: #6a7a9a; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.3rem; }

    /* Message bubbles */
    .message { display: flex; gap: 0.75rem; max-width: 80%; animation: fadeInUp 0.35s ease; }
    .message.user { align-self: flex-end; flex-direction: row-reverse; }
    .message.agent { align-self: flex-start; }
    .message-avatar { width: 32px; height: 32px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 0.85rem; flex-shrink: 0; font-weight: 600; }
    .message.user .message-avatar { background: linear-gradient(135deg, #a855f7, #7c3aed); color: #fff; }
    .message.agent .message-avatar { background: linear-gradient(135deg, #00d4ff, #0088cc); color: #fff; }
    .message-body { display: flex; flex-direction: column; gap: 0.25rem; }
    .message-content { padding: 0.85rem 1.1rem; border-radius: 12px; font-size: 0.9rem; line-height: 1.6; word-break: break-word; }
    .message.user .message-content { background: linear-gradient(135deg, #1a1040, #231050); border: 1px solid rgba(168, 85, 247, 0.3); border-bottom-right-radius: 4px; }
    .message.agent .message-content { background: #111827; border: 1px solid #1e2a4a; border-bottom-left-radius: 4px; }
    .message-content p { margin-bottom: 0.5rem; }
    .message-content p:last-child { margin-bottom: 0; }
    .message-content strong { color: #fff; }
    .message-content code { background: rgba(0, 212, 255, 0.1); padding: 0.15rem 0.4rem; border-radius: 4px; font-size: 0.85em; color: #00d4ff; }
    .message-content pre { background: #0a0f1a; padding: 0.75rem; border-radius: 6px; overflow-x: auto; margin: 0.5rem 0; }
    .message-content pre code { background: none; padding: 0; color: #e0e0e0; }
    .message-time { font-size: 0.7rem; color: #4a5a7a; padding: 0 0.5rem; }
    .message.user .message-time { text-align: right; }

    /* Tool calls */
    .tool-calls { margin-top: 0.5rem; }
    .tool-call { background: rgba(0, 212, 255, 0.05); border: 1px solid rgba(0, 212, 255, 0.15); border-radius: 8px; padding: 0.6rem 0.8rem; margin-bottom: 0.4rem; font-size: 0.8rem; animation: slideIn 0.3s ease; }
    .tool-call-header { display: flex; align-items: center; gap: 0.4rem; color: #00d4ff; font-weight: 500; margin-bottom: 0.25rem; }
    .tool-call-output { color: #6a7a9a; font-size: 0.75rem; }

    /* Error badge */
    .error-badge { display: inline-block; background: rgba(255, 68, 68, 0.1); border: 1px solid rgba(255, 68, 68, 0.3); color: #ff6666; padding: 0.25rem 0.5rem; border-radius: 6px; font-size: 0.75rem; margin-top: 0.3rem; }

    /* Agent cards in chat responses */
    .chat-agent-cards { display: flex; flex-direction: column; gap: 0.5rem; margin-top: 0.75rem; }
    .chat-agent-card { background: linear-gradient(135deg, #0d1528, #111827); border: 1px solid #1e2a4a; border-radius: 10px; padding: 0.75rem 1rem; transition: all 0.2s; }
    .chat-agent-card:hover { border-color: rgba(0, 212, 255, 0.4); transform: translateX(4px); }
    .chat-agent-card-header { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.35rem; }
    .chat-agent-card-avatar { width: 28px; height: 28px; border-radius: 7px; background: linear-gradient(135deg, rgba(0, 212, 255, 0.2), rgba(168, 85, 247, 0.2)); display: flex; align-items: center; justify-content: center; font-size: 0.8rem; flex-shrink: 0; }
    .chat-agent-card-name { font-weight: 600; color: #fff; font-size: 0.85rem; }
    .chat-agent-card-score { font-size: 0.7rem; color: #ffaa00; margin-left: auto; }
    .chat-agent-card-bio { color: #8892b0; font-size: 0.78rem; line-height: 1.4; }
    .chat-agent-card-tags { display: flex; flex-wrap: wrap; gap: 0.25rem; margin-top: 0.35rem; }
    .chat-agent-card-tag { padding: 0.1rem 0.5rem; border-radius: 10px; font-size: 0.65rem; background: rgba(0, 212, 255, 0.1); color: #00d4ff; border: 1px solid rgba(0, 212, 255, 0.2); }

    /* Empty state for chat */
    .chat-empty { text-align: center; padding: 2rem; color: #4a5a7a; animation: fadeIn 0.3s ease; }
    .chat-empty-icon { font-size: 2rem; margin-bottom: 0.5rem; opacity: 0.5; }

    /* Loading indicator */
    .typing-indicator { display: flex; gap: 0.75rem; align-self: flex-start; max-width: 80%; animation: fadeInUp 0.3s ease; }
    .typing-dots { display: flex; gap: 4px; padding: 0.85rem 1.1rem; background: #111827; border: 1px solid #1e2a4a; border-radius: 12px; border-bottom-left-radius: 4px; }
    .typing-dots span { width: 8px; height: 8px; background: #00d4ff; border-radius: 50%; animation: pulse 1.2s ease infinite; }
    .typing-dots span:nth-child(2) { animation-delay: 0.2s; }
    .typing-dots span:nth-child(3) { animation-delay: 0.4s; }

    /* Input area */
    .input-area { background: #0d1528; border-top: 1px solid #1e2a4a; padding: 1rem 1.5rem; flex-shrink: 0; }
    .input-row { display: flex; gap: 0.75rem; max-width: 900px; margin: 0 auto; align-items: flex-end; }
    .input-wrapper { flex: 1; position: relative; }
    .input-wrapper textarea { width: 100%; padding: 0.75rem 1rem; background: #111827; border: 1px solid #1e2a4a; border-radius: 12px; color: #e0e0e0; font-size: 0.9rem; font-family: inherit; resize: none; min-height: 44px; max-height: 120px; line-height: 1.5; transition: border-color 0.2s, box-shadow 0.2s; }
    .input-wrapper textarea:focus { outline: none; border-color: #00d4ff; box-shadow: 0 0 0 3px rgba(0, 212, 255, 0.1); }
    .input-wrapper textarea::placeholder { color: #4a5a7a; }
    .send-btn { width: 44px; height: 44px; border-radius: 12px; border: none; background: linear-gradient(135deg, #0088cc, #00aaff); color: #fff; font-size: 1.2rem; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
    .send-btn:hover:not(:disabled) { background: linear-gradient(135deg, #0077b3, #0099ee); transform: translateY(-1px); }
    .send-btn:disabled { opacity: 0.4; cursor: not-allowed; }
    .new-session-btn { width: 44px; height: 44px; border-radius: 12px; border: 1px solid #1e2a4a; background: #111827; color: #6a7a9a; font-size: 1.1rem; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
    .new-session-btn:hover { border-color: rgba(0, 212, 255, 0.3); color: #00d4ff; background: rgba(0, 212, 255, 0.05); }
    .input-hint { text-align: center; font-size: 0.7rem; color: #3a4a6a; margin-top: 0.5rem; }

    /* Scrollbar */
    .chat-container::-webkit-scrollbar { width: 6px; }
    .chat-container::-webkit-scrollbar-track { background: transparent; }
    .chat-container::-webkit-scrollbar-thumb { background: #1e2a4a; border-radius: 3px; }
    .chat-container::-webkit-scrollbar-thumb:hover { background: #2a3a5a; }

    /* Responsive */
    @media (max-width: 768px) {
      .header { padding: 0.75rem 1rem; }
      .header h1 { font-size: 1rem; }
      .status-bar { padding: 0.4rem 1rem; font-size: 0.75rem; }
      .chat-container { padding: 1rem; }
      .message { max-width: 92%; }
      .input-area { padding: 0.75rem 1rem; }
      .suggestions { grid-template-columns: 1fr; }
    }
    @media (max-width: 480px) {
      .message { max-width: 95%; }
      .welcome h2 { font-size: 1.2rem; }
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="header-left">
      <div class="logo">H</div>
      <h1>Hedera Agent <span>Chat</span></h1>
    </div>
    <div class="header-actions">
      <a href="/" class="header-link">Marketplace</a>
    </div>
  </div>

  <div class="status-bar" id="statusBar">
    <div class="status-dot warn" id="statusDot"></div>
    <span class="status-text" id="statusText">Checking agent status...</span>
  </div>

  <div class="chat-container" id="chatContainer">
    <div class="welcome" id="welcome">
      <div class="welcome-icon">&#x1F916;</div>
      <h2>Hedera Agent Marketplace Chat</h2>
      <p>Chat with the marketplace agent using natural language &mdash; register agents, discover capabilities, connect via HCS-10, and exchange messages.</p>
      <div class="suggestions" id="suggestions">
        <div class="suggestion" onclick="sendSuggestion(this)">
          <div class="suggestion-label">Discover</div>
          What agents are available?
        </div>
        <div class="suggestion" onclick="sendSuggestion(this)">
          <div class="suggestion-label">About</div>
          What is this marketplace?
        </div>
        <div class="suggestion" onclick="sendSuggestion(this)">
          <div class="suggestion-label">Guide</div>
          How do I hire an agent?
        </div>
        <div class="suggestion" onclick="sendSuggestion(this)">
          <div class="suggestion-label">Trust</div>
          Show me trust scores
        </div>
        <div class="suggestion" onclick="sendSuggestion(this)">
          <div class="suggestion-label">Standards</div>
          What standards do you support?
        </div>
        <div class="suggestion" onclick="sendSuggestion(this)">
          <div class="suggestion-label">Status</div>
          Check protocol reachability
        </div>
      </div>
    </div>
  </div>

  <div class="input-area">
    <div class="input-row">
      <button class="new-session-btn" onclick="newSession()" title="New conversation">&#x2795;</button>
      <div class="input-wrapper">
        <textarea id="messageInput" placeholder="Type a message..." rows="1" onkeydown="handleKeyDown(event)" oninput="autoResize(this)"></textarea>
      </div>
      <button class="send-btn" id="sendBtn" onclick="sendMessage()" title="Send message">&#x27A4;</button>
    </div>
    <div class="input-hint">Press Enter to send &middot; Shift+Enter for new line</div>
  </div>

  <script>
    var sessionId = null;
    var isProcessing = false;

    // --- Initialization ---
    (function init() {
      checkStatus();
      createSession();
    })();

    function checkStatus() {
      fetch('/api/chat/status')
        .then(function(r) { return r.json(); })
        .then(function(data) {
          var dot = document.getElementById('statusDot');
          var text = document.getElementById('statusText');
          if (data.chatAgentReady) {
            dot.className = 'status-dot ok';
            text.innerHTML = 'Marketplace chat agent ready &mdash; natural language tools active' + (data.hederaConfigured ? ', Hedera connected' : '');
          } else if (data.error) {
            dot.className = 'status-dot error';
            text.innerHTML = 'Agent error: ' + escapeHtml(data.error);
          } else {
            dot.className = 'status-dot warn';
            text.innerHTML = 'Chat agent initializing...';
          }
        })
        .catch(function() {
          document.getElementById('statusDot').className = 'status-dot error';
          document.getElementById('statusText').innerHTML = 'Cannot reach server';
        });
    }

    function createSession() {
      fetch('/api/chat/session', { method: 'POST' })
        .then(function(r) { return r.json(); })
        .then(function(data) { sessionId = data.sessionId; })
        .catch(function() {});
    }

    function newSession() {
      sessionId = null;
      document.getElementById('chatContainer').innerHTML = document.getElementById('welcome') ?
        document.getElementById('chatContainer').innerHTML : '';
      // Rebuild welcome
      var container = document.getElementById('chatContainer');
      container.innerHTML = getWelcomeHTML();
      createSession();
    }

    function getWelcomeHTML() {
      return '<div class="welcome" id="welcome">' +
        '<div class="welcome-icon">&#x1F916;</div>' +
        '<h2>Hedera Agent Marketplace Chat</h2>' +
        '<p>Chat with the marketplace agent using natural language &mdash; register agents, discover capabilities, connect via HCS-10, and exchange messages.</p>' +
        '<div class="suggestions" id="suggestions">' +
          '<div class="suggestion" onclick="sendSuggestion(this)"><div class="suggestion-label">Discover</div>What agents are available?</div>' +
          '<div class="suggestion" onclick="sendSuggestion(this)"><div class="suggestion-label">About</div>What is this marketplace?</div>' +
          '<div class="suggestion" onclick="sendSuggestion(this)"><div class="suggestion-label">Guide</div>How do I hire an agent?</div>' +
          '<div class="suggestion" onclick="sendSuggestion(this)"><div class="suggestion-label">Trust</div>Show me trust scores</div>' +
          '<div class="suggestion" onclick="sendSuggestion(this)"><div class="suggestion-label">Standards</div>What standards do you support?</div>' +
          '<div class="suggestion" onclick="sendSuggestion(this)"><div class="suggestion-label">Status</div>Check protocol reachability</div>' +
        '</div></div>';
    }

    function sendSuggestion(el) {
      var text = el.textContent || el.innerText;
      // Remove the label prefix
      var label = el.querySelector('.suggestion-label');
      if (label) {
        text = text.replace(label.textContent || label.innerText, '').trim();
      }
      document.getElementById('messageInput').value = text;
      sendMessage();
    }

    function sendMessage() {
      var input = document.getElementById('messageInput');
      var message = input.value.trim();
      if (!message || isProcessing) return;

      // Hide welcome
      var welcome = document.getElementById('welcome');
      if (welcome) welcome.remove();

      isProcessing = true;
      input.value = '';
      autoResize(input);
      updateSendBtn();

      // Add user bubble
      addMessage('user', message);

      // Show typing indicator
      var typingId = showTyping();

      fetch('/api/chat/smart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: sessionId, message: message }),
      })
        .then(function(r) { return r.json(); })
        .then(function(data) {
          removeTyping(typingId);
          if (data.sessionId) sessionId = data.sessionId;
          // Handle smart endpoint response
          if (data.agentMessage) {
            var toolCalls = data.actions ? data.actions.map(function(a) { return { name: a.tool, args: a.args, output: a.result ? a.result.message : '' }; }) : null;
            var agentData = null;
            if (data.actions) {
              for (var i = 0; i < data.actions.length; i++) {
                var act = data.actions[i];
                if (act.result && act.result.data) {
                  if (act.result.data.agents) agentData = act.result.data.agents;
                  else if (act.result.data.results) agentData = act.result.data.results;
                }
              }
            }
            addMessage('agent', data.agentMessage.content, toolCalls, null, agentData);
          } else if (data.response) {
            var toolCalls2 = data.actions ? data.actions.map(function(a) { return { name: a.tool, args: a.args, output: a.result ? a.result.message : '' }; }) : null;
            addMessage('agent', data.response, toolCalls2, null, null);
          } else if (data.error) {
            addMessage('agent', data.message || data.error, null, data.error);
          }
        })
        .catch(function(err) {
          removeTyping(typingId);
          addMessage('agent', 'Network error: could not reach the server.', null, err.message);
        })
        .finally(function() {
          isProcessing = false;
          updateSendBtn();
          input.focus();
        });
    }

    function addMessage(role, content, toolCalls, error, agentCards) {
      var container = document.getElementById('chatContainer');
      var div = document.createElement('div');
      div.className = 'message ' + role;

      var avatar = role === 'user' ? 'U' : 'H';
      var time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      var toolCallsHTML = '';
      if (toolCalls && toolCalls.length > 0) {
        toolCallsHTML = '<div class="tool-calls">';
        for (var i = 0; i < toolCalls.length; i++) {
          var tc = toolCalls[i];
          toolCallsHTML += '<div class="tool-call"><div class="tool-call-header">&#x1F527; ' + escapeHtml(tc.name) + '</div>';
          if (tc.output) {
            toolCallsHTML += '<div class="tool-call-output">' + escapeHtml(tc.output.substring(0, 200)) + (tc.output.length > 200 ? '...' : '') + '</div>';
          }
          toolCallsHTML += '</div>';
        }
        toolCallsHTML += '</div>';
      }

      var agentCardsHTML = '';
      if (agentCards && agentCards.length > 0) {
        agentCardsHTML = '<div class="chat-agent-cards">';
        var maxCards = Math.min(agentCards.length, 5);
        for (var j = 0; j < maxCards; j++) {
          var ag = agentCards[j];
          var name = ag.display_name || ag.name || 'Agent';
          var bio = ag.bio || ag.description || '';
          var tags = ag.tags || ag.capabilities || [];
          var score = ag.score ? Math.round(ag.score * 100) + '%' : (ag.reputation_score ? ag.reputation_score + '/100' : '');
          agentCardsHTML += '<div class="chat-agent-card">';
          agentCardsHTML += '<div class="chat-agent-card-header">';
          agentCardsHTML += '<div class="chat-agent-card-avatar">&#x1F916;</div>';
          agentCardsHTML += '<span class="chat-agent-card-name">' + escapeHtml(name) + '</span>';
          if (score) agentCardsHTML += '<span class="chat-agent-card-score">&#x2B50; ' + escapeHtml(score) + '</span>';
          agentCardsHTML += '</div>';
          if (bio) agentCardsHTML += '<div class="chat-agent-card-bio">' + escapeHtml(bio.substring(0, 120)) + (bio.length > 120 ? '...' : '') + '</div>';
          if (tags.length > 0) {
            agentCardsHTML += '<div class="chat-agent-card-tags">';
            var maxTags = Math.min(tags.length, 4);
            for (var t = 0; t < maxTags; t++) {
              agentCardsHTML += '<span class="chat-agent-card-tag">' + escapeHtml(tags[t]) + '</span>';
            }
            agentCardsHTML += '</div>';
          }
          agentCardsHTML += '</div>';
        }
        agentCardsHTML += '</div>';
      }

      var errorHTML = error ? '<div class="error-badge">Error: ' + escapeHtml(error) + '</div>' : '';

      div.innerHTML = '<div class="message-avatar">' + avatar + '</div>' +
        '<div class="message-body">' +
          '<div class="message-content">' + formatContent(content) + agentCardsHTML + toolCallsHTML + errorHTML + '</div>' +
          '<div class="message-time">' + time + '</div>' +
        '</div>';

      container.appendChild(div);
      scrollToBottom();
    }

    function showTyping() {
      var container = document.getElementById('chatContainer');
      var div = document.createElement('div');
      var id = 'typing-' + Date.now();
      div.id = id;
      div.className = 'typing-indicator';
      div.innerHTML = '<div class="message-avatar" style="background:linear-gradient(135deg,#00d4ff,#0088cc);color:#fff;">H</div>' +
        '<div style="display:flex;flex-direction:column;gap:4px;"><div class="typing-dots"><span></span><span></span><span></span></div><div class="typing-label" style="font-size:0.7rem;color:#4a5a7a;padding-left:0.5rem;">Thinking...</div></div>';
      container.appendChild(div);
      scrollToBottom();
      // Cycle through status messages for a natural feel
      var labels = ['Thinking...', 'Processing your request...', 'Querying marketplace...', 'Almost ready...'];
      var labelIdx = 0;
      var labelInterval = setInterval(function() {
        labelIdx = (labelIdx + 1) % labels.length;
        var el = document.getElementById(id);
        if (el) {
          var lbl = el.querySelector('.typing-label');
          if (lbl) lbl.textContent = labels[labelIdx];
        } else {
          clearInterval(labelInterval);
        }
      }, 1500);
      div.setAttribute('data-interval', String(labelInterval));
      return id;
    }

    function removeTyping(id) {
      var el = document.getElementById(id);
      if (el) {
        var interval = el.getAttribute('data-interval');
        if (interval) clearInterval(parseInt(interval));
        el.remove();
      }
    }

    function scrollToBottom() {
      var container = document.getElementById('chatContainer');
      setTimeout(function() { container.scrollTop = container.scrollHeight; }, 50);
    }

    function formatContent(text) {
      if (!text) return '';
      // Code blocks first (before escaping HTML)
      var codeBlocks = [];
      text = text.replace(/\`\`\`([\\s\\S]*?)\`\`\`/g, function(m, code) {
        var idx = codeBlocks.length;
        codeBlocks.push('<pre><code>' + escapeHtml(code.trim()) + '</code></pre>');
        return '%%CODEBLOCK_' + idx + '%%';
      });
      // Inline code (before escaping)
      var inlineCodes = [];
      text = text.replace(/\`([^\`]+)\`/g, function(m, code) {
        var idx = inlineCodes.length;
        inlineCodes.push('<code>' + escapeHtml(code) + '</code>');
        return '%%INLINE_' + idx + '%%';
      });
      text = escapeHtml(text);
      // Bold
      text = text.replace(/\\*\\*(.+?)\\*\\*/g, '<strong>$1</strong>');
      // Numbered lists
      text = text.replace(/^(\\d+)\\.\\s+(.+)$/gm, '<div style="margin-left:1rem;">$1. $2</div>');
      // Bullet lists
      text = text.replace(/^[\\-\\*]\\s+(.+)$/gm, '<div style="margin-left:1rem;"><span style="color:#00d4ff;">&#x25B8;</span> $1</div>');
      // Line breaks
      text = text.replace(/\\n/g, '<br>');
      // Restore code blocks and inline codes
      for (var i = 0; i < codeBlocks.length; i++) {
        text = text.replace('%%CODEBLOCK_' + i + '%%', codeBlocks[i]);
      }
      for (var j = 0; j < inlineCodes.length; j++) {
        text = text.replace('%%INLINE_' + j + '%%', inlineCodes[j]);
      }
      return text;
    }

    function escapeHtml(str) {
      if (!str) return '';
      var div = document.createElement('div');
      div.appendChild(document.createTextNode(str));
      return div.innerHTML;
    }

    function handleKeyDown(event) {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendMessage();
      }
    }

    function autoResize(textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
      updateSendBtn();
    }

    function updateSendBtn() {
      var btn = document.getElementById('sendBtn');
      var input = document.getElementById('messageInput');
      btn.disabled = isProcessing || !input.value.trim();
    }
  </script>
</body>
</html>`;
}
