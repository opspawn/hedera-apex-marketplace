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

import { RegistryBroker, BrokerAgentEntry } from '../hol/registry-broker';
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

**Messaging**
- "Send a message to the analyst: review this dataset"
- "Check my messages"

**Feedback & Ratings**
- "Show feedback for agent-001"
- "What's the rating for the code reviewer?"

All operations use Hedera Consensus Service (HCS-10) for communication and the HOL Registry Broker for cross-protocol discovery.`;
  }
}
