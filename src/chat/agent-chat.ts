/**
 * Natural Language Chat Agent
 *
 * A lightweight function-calling chat agent that maps natural language
 * to marketplace operations: register, search, vector search, connect,
 * send messages, and get feedback.
 *
 * Sprint 18 — required for HOL bounty (conversational agent pattern).
 *
 * Tools:
 *  - RegisterAgentTool: Register with capabilities/tags
 *  - FindRegistrationsTool: Search agents by account/tags
 *  - VectorSearchTool: Semantic agent search
 *  - InitiateConnectionTool: Request HCS-10 connection
 *  - SendMessageTool: Send P2P message on a connection
 *  - CheckMessagesTool: Poll for new messages
 *  - GetFeedbackTool: Retrieve agent feedback/ratings
 */

import { RegistryBroker, BrokerAgentEntry, ChatRelaySession } from '../hol/registry-broker';
import { ConnectionHandler, ActiveConnection, ConnectionMessage } from '../hol/connection-handler';
import { AgentFeedbackManager } from '../hol/agent-feedback';

// ---------------------------------------------------------------------------
// Tool definitions — each maps to a marketplace operation
// ---------------------------------------------------------------------------

export interface ChatTool {
  name: string;
  description: string;
  keywords: string[];
  execute: (args: Record<string, unknown>) => Promise<ToolResult>;
}

export interface ToolResult {
  success: boolean;
  data?: unknown;
  message: string;
}

export interface ChatAgentConfig {
  registryBroker: RegistryBroker;
  connectionHandler: ConnectionHandler;
  feedbackManager?: AgentFeedbackManager;
}

export interface AgentChatMessage {
  role: 'user' | 'agent';
  content: string;
  toolCalls?: Array<{ name: string; args: Record<string, unknown>; output: string }>;
  timestamp: string;
}

export interface AgentChatResponse {
  response: string;
  actions: Array<{ tool: string; args: Record<string, unknown>; result: ToolResult }>;
  sessionId: string;
}

// ---------------------------------------------------------------------------
// Intent detection — lightweight keyword-based routing
// ---------------------------------------------------------------------------

interface DetectedIntent {
  tool: string;
  args: Record<string, unknown>;
  confidence: number;
}

function detectIntent(message: string): DetectedIntent {
  const lower = message.toLowerCase().trim();

  // Registration intent
  if (
    /\b(register|sign ?up|create (?:my |an? )?(?:agent|profile|account))\b/.test(lower)
  ) {
    // Extract description from the message
    const descMatch = lower.match(/(?:as (?:a|an) )(.+?)(?:\.|$)/);
    const capabilities = extractCapabilities(lower);
    return {
      tool: 'register_agent',
      args: {
        description: descMatch ? descMatch[1].trim() : message,
        capabilities,
      },
      confidence: 0.9,
    };
  }

  // Connection intent
  if (
    /\b(connect|connection|link|pair|reach out)\b.*\b(to|with)\b/.test(lower) ||
    /\binitiate\b.*\bconnection\b/.test(lower)
  ) {
    const accountMatch = lower.match(/(?:to|with)\s+([\w.]+)/);
    return {
      tool: 'initiate_connection',
      args: { targetAccount: accountMatch ? accountMatch[1] : '' },
      confidence: 0.85,
    };
  }

  // Chat relay: start session with an agent (must be before send_message)
  if (
    /\b(chat|talk|converse|start (?:a )?(?:chat|conversation|session))\b.*\b(with|to)\b/.test(lower) ||
    /\bopen\b.*\b(session|chat)\b.*\b(with|to)\b/.test(lower)
  ) {
    const agentMatch = lower.match(/(?:with|to)\s+([\w.-]+)/);
    return {
      tool: 'create_chat_session',
      args: { agentId: agentMatch ? agentMatch[1] : '' },
      confidence: 0.9,
    };
  }

  // Chat relay: send message in relay session (must be before send_message)
  if (
    /\b(relay|forward)\b.*\b(message|to)\b/.test(lower) ||
    /\bin (?:the |my )?(?:chat |relay )?session\b/.test(lower)
  ) {
    const contentMatch = message.match(/(?:["'](.+?)["']|:\s*(.+?)$)/);
    return {
      tool: 'relay_message',
      args: {
        content: contentMatch ? (contentMatch[1] || contentMatch[2] || message) : message,
      },
      confidence: 0.85,
    };
  }

  // Chat relay: get relay history (must be before check_messages)
  if (
    /\brelay\b.*\b(history|transcript|log)\b/.test(lower) ||
    /\bsession\b.*\b(history|messages)\b/.test(lower) ||
    /\bchat\b.*\b(history|transcript)\b/.test(lower)
  ) {
    return {
      tool: 'get_relay_history',
      args: {},
      confidence: 0.85,
    };
  }

  // Send message intent
  if (
    /\b(send|message|tell|ask|request)\b.*\b(to|agent|connection)\b/.test(lower) ||
    /\bask\b.*\bto\b/.test(lower)
  ) {
    const contentMatch = message.match(/(?:["'](.+?)["']|:\s*(.+?)$)/);
    return {
      tool: 'send_message',
      args: {
        content: contentMatch ? (contentMatch[1] || contentMatch[2] || message) : message,
      },
      confidence: 0.8,
    };
  }

  // Check messages intent
  if (
    /\b(check|read|poll|get|any new)\b.*\b(messages?|inbox|notifications?)\b/.test(lower) ||
    /\b(messages? from|new messages?)\b/.test(lower)
  ) {
    return { tool: 'check_messages', args: {}, confidence: 0.85 };
  }

  // Trust score intent
  if (
    /\b(trust)\b.*\b(score|level|rating)\b/.test(lower) ||
    /\b(score|rating)\b.*\b(trust)\b/.test(lower) ||
    /\bshow\b.*\btrust\b/.test(lower)
  ) {
    const agentMatch = lower.match(/(?:for|of|about)\s+([\w.-]+)/);
    return {
      tool: 'get_trust_scores',
      args: { agentId: agentMatch ? agentMatch[1] : '' },
      confidence: 0.9,
    };
  }

  // Feedback intent
  if (
    /\b(feedback|rating|review|reputation|score)\b/.test(lower)
  ) {
    const agentMatch = lower.match(/(?:for|of|about)\s+([\w-]+)/);
    return {
      tool: 'get_feedback',
      args: { agentId: agentMatch ? agentMatch[1] : '' },
      confidence: 0.8,
    };
  }

  // Agent details intent (get info about a specific agent by ID/UAID)
  if (
    /\b(details?|info|profile|about|describe|who is)\b.*\b(agent|uaid)\b/.test(lower) ||
    /\bagent\b.*\b(details?|info|profile)\b/.test(lower) ||
    /\bget\b.*\bagent\b.*\b[\w.-]+\b/.test(lower)
  ) {
    const idMatch = lower.match(/(?:agent|uaid)\s+([\w.-]+)/) || lower.match(/([\d]+\.[\d]+\.[\d]+)/);
    return {
      tool: 'get_agent_details',
      args: { agentId: idMatch ? idMatch[1] : '' },
      confidence: 0.85,
    };
  }

  // Vector search intent (semantic / natural language queries)
  if (
    /\b(find|search|discover|look ?for|who can|which agent)\b.*\b(agent|that can|who|capable|able)\b/.test(lower) ||
    /\bwhich\b.*\bagent\b.*\bcan\b/.test(lower)
  ) {
    return { tool: 'vector_search', args: { text: message }, confidence: 0.85 };
  }

  // Skills listing intent
  if (
    /\b(skills?|capabilities|tools|what can)\b/.test(lower) &&
    /\b(show|list|available|have|support)\b/.test(lower)
  ) {
    return { tool: 'list_skills', args: {}, confidence: 0.85 };
  }

  // General search intent
  if (
    /\b(find|search|list|show|browse|discover|look)\b/.test(lower)
  ) {
    return {
      tool: 'find_registrations',
      args: { query: message },
      confidence: 0.7,
    };
  }

  // Default: help / general
  return { tool: 'help', args: {}, confidence: 0.5 };
}

function extractCapabilities(text: string): string[] {
  const caps: string[] = [];
  const capMap: Record<string, string> = {
    'data analyst': 'TEXT_GENERATION',
    'code': 'CODE_GENERATION',
    'text': 'TEXT_GENERATION',
    'image': 'IMAGE_GENERATION',
    'summariz': 'TEXT_GENERATION',
    'analyz': 'TEXT_GENERATION',
    'translat': 'TEXT_GENERATION',
    'generat': 'TEXT_GENERATION',
  };
  for (const [keyword, cap] of Object.entries(capMap)) {
    if (text.includes(keyword) && !caps.includes(cap)) {
      caps.push(cap);
    }
  }
  if (caps.length === 0) caps.push('TEXT_GENERATION');
  return caps;
}

// ---------------------------------------------------------------------------
// ChatAgent class
// ---------------------------------------------------------------------------

export class ChatAgent {
  private broker: RegistryBroker;
  private connectionHandler: ConnectionHandler;
  private feedbackManager?: AgentFeedbackManager;
  private sessions: Map<string, AgentChatMessage[]> = new Map();

  constructor(config: ChatAgentConfig) {
    this.broker = config.registryBroker;
    this.connectionHandler = config.connectionHandler;
    this.feedbackManager = config.feedbackManager;
  }

  /**
   * Process a user message and return a response with any tool actions taken.
   */
  async processMessage(message: string, sessionId: string): Promise<AgentChatResponse> {
    const history = this.sessions.get(sessionId) || [];

    // Record user message
    history.push({
      role: 'user',
      content: message,
      timestamp: new Date().toISOString(),
    });

    const intent = detectIntent(message);
    const actions: AgentChatResponse['actions'] = [];
    let response: string;

    try {
      switch (intent.tool) {
        case 'register_agent': {
          const result = await this.executeRegister(intent.args);
          actions.push({ tool: 'register_agent', args: intent.args, result });
          response = result.message;
          break;
        }
        case 'find_registrations': {
          const result = await this.executeFindRegistrations(intent.args);
          actions.push({ tool: 'find_registrations', args: intent.args, result });
          response = result.message;
          break;
        }
        case 'vector_search': {
          const result = await this.executeVectorSearch(intent.args);
          actions.push({ tool: 'vector_search', args: intent.args, result });
          response = result.message;
          break;
        }
        case 'initiate_connection': {
          const result = await this.executeInitiateConnection(intent.args);
          actions.push({ tool: 'initiate_connection', args: intent.args, result });
          response = result.message;
          break;
        }
        case 'send_message': {
          const result = await this.executeSendMessage(intent.args);
          actions.push({ tool: 'send_message', args: intent.args, result });
          response = result.message;
          break;
        }
        case 'check_messages': {
          const result = await this.executeCheckMessages();
          actions.push({ tool: 'check_messages', args: {}, result });
          response = result.message;
          break;
        }
        case 'get_feedback': {
          const result = await this.executeGetFeedback(intent.args);
          actions.push({ tool: 'get_feedback', args: intent.args, result });
          response = result.message;
          break;
        }
        case 'get_agent_details': {
          const result = await this.executeGetAgentDetails(intent.args);
          actions.push({ tool: 'get_agent_details', args: intent.args, result });
          response = result.message;
          break;
        }
        case 'create_chat_session': {
          const result = await this.executeCreateChatSession(intent.args);
          actions.push({ tool: 'create_chat_session', args: intent.args, result });
          response = result.message;
          break;
        }
        case 'relay_message': {
          const result = await this.executeRelayMessage(intent.args);
          actions.push({ tool: 'relay_message', args: intent.args, result });
          response = result.message;
          break;
        }
        case 'get_relay_history': {
          const result = await this.executeGetRelayHistory();
          actions.push({ tool: 'get_relay_history', args: {}, result });
          response = result.message;
          break;
        }
        case 'list_skills': {
          const result = await this.executeListSkills();
          actions.push({ tool: 'list_skills', args: {}, result });
          response = result.message;
          break;
        }
        case 'get_trust_scores': {
          const result = await this.executeGetTrustScores(intent.args);
          actions.push({ tool: 'get_trust_scores', args: intent.args, result });
          response = result.message;
          break;
        }
        default: {
          response = this.getHelpResponse();
          break;
        }
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Unknown error';
      response = `I encountered an error: ${errMsg}. Please try again.`;
    }

    // Record agent response
    const toolCalls = actions.map(a => ({
      name: a.tool,
      args: a.args,
      output: a.result.message,
    }));

    history.push({
      role: 'agent',
      content: response,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      timestamp: new Date().toISOString(),
    });

    this.sessions.set(sessionId, history);

    return { response, actions, sessionId };
  }

  /**
   * Get chat history for a session.
   */
  getHistory(sessionId: string): AgentChatMessage[] {
    return this.sessions.get(sessionId) || [];
  }

  /**
   * Get active tool names.
   */
  getAvailableTools(): string[] {
    return [
      'register_agent',
      'find_registrations',
      'vector_search',
      'get_agent_details',
      'initiate_connection',
      'send_message',
      'check_messages',
      'get_feedback',
      'create_chat_session',
      'relay_message',
      'get_relay_history',
      'list_skills',
      'get_trust_scores',
    ];
  }

  // ---------------------------------------------------------------------------
  // Tool implementations
  // ---------------------------------------------------------------------------

  private async executeRegister(args: Record<string, unknown>): Promise<ToolResult> {
    const result = await this.broker.register();
    if (result.success) {
      return {
        success: true,
        data: { uaid: result.uaid, agentId: result.agentId },
        message: `Successfully registered with the Registry Broker! Your UAID is ${result.uaid || 'pending'} and agent ID is ${result.agentId || 'pending'}. You're now discoverable in the universal agent index.`,
      };
    }
    return {
      success: false,
      message: `Registration failed: ${result.error || 'Unknown error'}. Please check your Hedera credentials and try again.`,
    };
  }

  private async executeFindRegistrations(args: Record<string, unknown>): Promise<ToolResult> {
    const query = String(args.query || '');
    const result = await this.broker.searchAgents({ q: query, limit: 10 });
    if (result.agents.length === 0) {
      return {
        success: true,
        data: { agents: [], total: 0 },
        message: `No agents found matching "${query}". Try broadening your search or use different keywords.`,
      };
    }
    const agentList = result.agents
      .map((a: BrokerAgentEntry, i: number) => `${i + 1}. **${a.display_name}** ${a.bio ? `— ${a.bio}` : ''} ${a.tags?.length ? `[${a.tags.join(', ')}]` : ''}`)
      .join('\n');
    return {
      success: true,
      data: { agents: result.agents, total: result.total },
      message: `Found ${result.total} agent(s):\n${agentList}`,
    };
  }

  private async executeVectorSearch(args: Record<string, unknown>): Promise<ToolResult> {
    const text = String(args.text || '');
    const result = await this.broker.vectorSearch({ text, topK: 5 });
    if (result.results.length === 0) {
      return {
        success: true,
        data: { results: [], total: 0 },
        message: `No agents found matching your description. Try rephrasing your query.`,
      };
    }
    const agentList = result.results
      .map((a: BrokerAgentEntry, i: number) => {
        const score = a.score ? ` (relevance: ${Math.round(a.score * 100)}%)` : '';
        return `${i + 1}. **${a.display_name}**${score} ${a.bio ? `— ${a.bio}` : ''} ${a.tags?.length ? `[${a.tags.join(', ')}]` : ''}`;
      })
      .join('\n');
    return {
      success: true,
      data: { results: result.results, total: result.total },
      message: `Found ${result.total} matching agent(s) via semantic search:\n${agentList}`,
    };
  }

  private async executeGetAgentDetails(args: Record<string, unknown>): Promise<ToolResult> {
    const agentId = String(args.agentId || '');
    if (!agentId) {
      return {
        success: false,
        message: 'Please specify an agent ID or UAID to look up (e.g., "Details for agent 0.0.12345").',
      };
    }

    const profile = await this.broker.getAgentProfile(agentId);
    if (!profile) {
      return {
        success: true,
        data: null,
        message: `No agent found with ID "${agentId}". Check the ID and try again, or use search to find agents.`,
      };
    }

    const details = [
      `**${profile.display_name}**`,
      profile.bio ? `Bio: ${profile.bio}` : null,
      profile.tags?.length ? `Tags: ${profile.tags.join(', ')}` : null,
      profile.capabilities?.length ? `Capabilities: ${profile.capabilities.join(', ')}` : null,
      profile.protocol ? `Protocol: ${profile.protocol}` : null,
    ].filter(Boolean).join('\n');

    return {
      success: true,
      data: profile,
      message: `Agent details:\n${details}`,
    };
  }

  private async executeInitiateConnection(args: Record<string, unknown>): Promise<ToolResult> {
    const targetAccount = String(args.targetAccount || '');
    if (!targetAccount) {
      return {
        success: false,
        message: 'Please specify which agent you want to connect to (e.g., "Connect to 0.0.12345").',
      };
    }

    // Check pending requests for this account
    const pending = this.connectionHandler.getPendingRequests();
    const matchingRequest = pending.find(r => r.from_account === targetAccount);
    if (matchingRequest) {
      const connection = await this.connectionHandler.acceptConnection(matchingRequest.id);
      return {
        success: true,
        data: connection,
        message: `Connection established with ${targetAccount}! Connection ID: ${connection.id}. You can now send messages on this connection.`,
      };
    }

    // No pending request — inform user
    return {
      success: true,
      data: { targetAccount, status: 'awaiting_request' },
      message: `No pending connection request from ${targetAccount}. The agent needs to send a connection request first via your inbound topic, then you can accept it.`,
    };
  }

  private async executeSendMessage(args: Record<string, unknown>): Promise<ToolResult> {
    const content = String(args.content || '');
    if (!content) {
      return { success: false, message: 'Please provide a message to send.' };
    }

    const activeConnections = this.connectionHandler.getActiveConnections();
    if (activeConnections.length === 0) {
      return {
        success: false,
        message: 'No active connections. You need to establish a connection first. Try "Connect to [agent account]".',
      };
    }

    // Send to the most recent active connection
    const connection = activeConnections[activeConnections.length - 1];
    const message = await this.connectionHandler.sendMessage(connection.id, content);
    return {
      success: true,
      data: message,
      message: `Message sent to ${connection.remote_account} on connection ${connection.id}.`,
    };
  }

  private async executeCheckMessages(): Promise<ToolResult> {
    const activeConnections = this.connectionHandler.getActiveConnections();
    if (activeConnections.length === 0) {
      return {
        success: true,
        data: { messages: [] },
        message: 'No active connections to check messages on.',
      };
    }

    const allMessages: ConnectionMessage[] = [];
    for (const conn of activeConnections) {
      const messages = await this.connectionHandler.readConnectionMessages(conn.id, 5);
      allMessages.push(...messages);
    }

    if (allMessages.length === 0) {
      return {
        success: true,
        data: { messages: [] },
        message: 'No new messages on any active connections.',
      };
    }

    const msgList = allMessages
      .map((m, i) => `${i + 1}. From ${m.from}: "${m.content}" (${m.timestamp})`)
      .join('\n');
    return {
      success: true,
      data: { messages: allMessages },
      message: `Found ${allMessages.length} message(s):\n${msgList}`,
    };
  }

  private async executeGetFeedback(args: Record<string, unknown>): Promise<ToolResult> {
    const agentId = String(args.agentId || '');
    if (!agentId) {
      return { success: false, message: 'Please specify an agent ID to get feedback for.' };
    }

    if (!this.feedbackManager) {
      return {
        success: false,
        message: 'Feedback system is not configured. The ERC-8004 feedback manager is not available.',
      };
    }

    const summary = await this.feedbackManager.getAgentFeedback({ agentId, limit: 10 });
    if (summary.totalFeedback === 0) {
      return {
        success: true,
        data: summary,
        message: `No feedback found for agent ${agentId}. This agent hasn't received any ratings yet.`,
      };
    }

    return {
      success: true,
      data: summary,
      message: `Agent ${agentId} has ${summary.totalFeedback} feedback entries with an average rating of ${summary.averageRating}/5.`,
    };
  }

  private async executeCreateChatSession(args: Record<string, unknown>): Promise<ToolResult> {
    const agentId = String(args.agentId || '');
    if (!agentId) {
      return {
        success: false,
        message: 'Please specify an agent ID to start a chat session with (e.g., "Chat with agent 0.0.12345").',
      };
    }

    const session = await this.broker.createSession(agentId);
    return {
      success: true,
      data: session,
      message: `Chat session created with agent ${agentId}! Session ID: ${session.sessionId}. You can now relay messages to this agent.`,
    };
  }

  private async executeRelayMessage(args: Record<string, unknown>): Promise<ToolResult> {
    const content = String(args.content || '');
    if (!content) {
      return { success: false, message: 'Please provide a message to relay.' };
    }

    const activeSessions = this.broker.getActiveRelaySessions();
    if (activeSessions.length === 0) {
      return {
        success: false,
        message: 'No active chat relay sessions. Start one first with "Chat with agent [id]".',
      };
    }

    // Send to most recent active session
    const session = activeSessions[activeSessions.length - 1];
    const response = await this.broker.sendRelayMessage(session.sessionId, content);
    const agentReply = response.agentResponse
      ? response.agentResponse.content
      : 'Message sent (awaiting response)';
    return {
      success: true,
      data: response,
      message: `Message relayed to agent ${session.agentId}. Response: ${agentReply}`,
    };
  }

  private async executeGetRelayHistory(): Promise<ToolResult> {
    const activeSessions = this.broker.getActiveRelaySessions();
    if (activeSessions.length === 0) {
      return {
        success: true,
        data: { sessions: [], messages: [] },
        message: 'No active chat relay sessions.',
      };
    }

    const session = activeSessions[activeSessions.length - 1];
    const history = this.broker.getRelayHistory(session.sessionId);
    if (history.length === 0) {
      return {
        success: true,
        data: { sessionId: session.sessionId, messages: [] },
        message: `Chat session ${session.sessionId} has no messages yet.`,
      };
    }

    const msgList = history
      .map((m, i) => `${i + 1}. [${m.role}] ${m.content} (${m.timestamp})`)
      .join('\n');
    return {
      success: true,
      data: { sessionId: session.sessionId, messages: history },
      message: `Chat relay history (${history.length} messages):\n${msgList}`,
    };
  }

  private async executeListSkills(): Promise<ToolResult> {
    const result = await this.broker.searchAgents({ limit: 20 });
    const skillSet = new Set<string>();
    for (const agent of result.agents) {
      if (agent.capabilities) {
        for (const cap of agent.capabilities) {
          skillSet.add(cap);
        }
      }
      if (agent.tags) {
        for (const tag of agent.tags) {
          skillSet.add(tag);
        }
      }
    }
    const skills = Array.from(skillSet).slice(0, 20);
    if (skills.length === 0) {
      return {
        success: true,
        data: { skills: [] },
        message: 'No skills found in the marketplace yet. Register an agent with skills to get started!',
      };
    }
    const skillList = skills.map((s, i) => `${i + 1}. **${s}**`).join('\n');
    return {
      success: true,
      data: { skills, agentCount: result.total },
      message: `Available skills across ${result.total} agents:\n${skillList}`,
    };
  }

  private async executeGetTrustScores(args: Record<string, unknown>): Promise<ToolResult> {
    const result = await this.broker.searchAgents({ limit: 10 });
    if (result.agents.length === 0) {
      return {
        success: true,
        data: { agents: [] },
        message: 'No agents found in the marketplace. Register an agent to get started!',
      };
    }

    const agentList = result.agents
      .map((a: BrokerAgentEntry, i: number) => {
        const trust = a.trust_score ?? a.reputation_score ?? 'N/A';
        const level = a.trust_level || 'unrated';
        return `${i + 1}. **${a.display_name}** — Trust: ${trust}/100 (${level})`;
      })
      .join('\n');

    return {
      success: true,
      data: { agents: result.agents, total: result.total },
      message: `Trust scores for ${result.total} agent(s):\n${agentList}\n\nTrust levels: new (0-20) → basic (21-40) → trusted (41-60) → verified (61-80) → elite (81-100)`,
    };
  }

  private getHelpResponse(): string {
    return `I'm the Hedera Agent Marketplace assistant. Here's what I can help you with:

**Agent Registration**
- "Register me as a data analyst agent"
- "Create an agent profile"

**Agent Discovery**
- "Find agents that can analyze financial data"
- "Search for code review agents"
- "List all available agents"

**Agent Details**
- "Details for agent 0.0.12345"
- "Info about agent sentinel-ai"
- "Who is agent 0.0.99999"

**Connections (HCS-10)**
- "Connect to agent 0.0.12345"
- "Initiate connection with the analyst"

**Chat Relay (Registry Broker)**
- "Chat with agent 0.0.12345"
- "Start a conversation with the analyst"
- "Relay message: hello, can you help?"
- "Show chat relay history"

**Messaging**
- "Send a message to the analyst: review this dataset"
- "Check my messages"

**Trust Scores**
- "Show trust scores for available agents"
- "What's the trust score for agent-001?"

**Feedback & Ratings**
- "Show feedback for agent-001"
- "What's the rating for the code reviewer?"

All operations use Hedera Consensus Service (HCS-10) for communication and the HOL Registry Broker for cross-protocol discovery.`;
  }
}
