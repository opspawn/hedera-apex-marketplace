#!/usr/bin/env node
/**
 * HOL Registry Broker Registration Script
 *
 * Registers the HederaConnect agent in the HOL Registry Broker so it's
 * discoverable and chat-reachable. Idempotent — checks for existing
 * registration before attempting a new one.
 *
 * Usage:
 *   node scripts/register-registry-broker.mjs
 *   node scripts/register-registry-broker.mjs --force   # re-register even if exists
 *
 * Environment:
 *   HEDERA_ACCOUNT_ID  — Hedera testnet account (default: 0.0.7854018)
 *   HEDERA_PRIVATE_KEY  — Hedera private key (required for metered endpoints)
 *   HEDERA_NETWORK      — testnet or mainnet (default: testnet)
 *   HOL_API_KEY         — Optional API key for metered endpoints
 *   STAGING_URL         — Public endpoint (default: https://hedera.opspawn.com)
 */

import { config } from 'dotenv';
config();

const HOL_BASE_URL = 'https://hol.org/registry/api/v1';
const AGENT_NAME = 'HederaConnect';
const STAGING_URL = process.env.STAGING_URL || 'https://hedera.opspawn.com';
const ACCOUNT_ID = process.env.HEDERA_ACCOUNT_ID || '0.0.7854018';
const NETWORK = process.env.HEDERA_NETWORK || 'testnet';
const API_KEY = process.env.HOL_API_KEY || '';
const FORCE = process.argv.includes('--force');

async function fetchJSON(url, opts = {}) {
  const headers = { 'Accept': 'application/json', ...opts.headers };
  if (opts.body) headers['Content-Type'] = 'application/json';
  if (API_KEY) headers['x-api-key'] = API_KEY;
  if (ACCOUNT_ID) headers['x-account-id'] = ACCOUNT_ID;

  const response = await fetch(url, {
    method: opts.method || 'GET',
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    signal: AbortSignal.timeout(15000),
  });

  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${text.slice(0, 200)}`);
  }

  return data;
}

/**
 * Search for existing HederaConnect registration.
 */
async function checkExistingRegistration() {
  console.log(`Searching for existing "${AGENT_NAME}" registration...`);
  try {
    const result = await fetchJSON(`${HOL_BASE_URL}/search?q=${encodeURIComponent(AGENT_NAME)}&limit=10`);
    const agents = result.agents || result.results || [];
    const match = agents.find(a =>
      (a.name || a.display_name || '').toLowerCase().includes('hederaconnect') ||
      (a.name || a.display_name || '').toLowerCase().includes('hedera-connect')
    );
    if (match) {
      console.log(`  Found existing registration: UAID=${match.uaid || match.id}`);
      console.log(`  Name: ${match.name || match.display_name}`);
      return match;
    }
    console.log('  No existing registration found.');
    return null;
  } catch (err) {
    console.log(`  Search failed (non-fatal): ${err.message}`);
    return null;
  }
}

/**
 * Build the HederaConnect registration payload.
 */
function buildPayload() {
  return {
    name: AGENT_NAME,
    description: 'AI Agent Marketplace with multi-protocol discovery, trust analytics, and privacy-preserving agent interaction',
    capabilities: ['marketplace', 'discovery', 'chat', 'trust-analytics', 'privacy'],
    protocols: ['hcs-10', 'a2a'],
    endpoints: {
      a2a: `${STAGING_URL}/api/agents/marketplace`,
      chat: `${STAGING_URL}/api/chat`,
      hire: `${STAGING_URL}/api/marketplace/hire`,
    },
    profile: {
      type: 'ai_agent',
      version: '1.0',
      display_name: AGENT_NAME,
      bio: 'AI Agent Marketplace with multi-protocol discovery, trust analytics, and privacy-preserving agent interaction',
      aiAgent: {
        type: 'autonomous',
        model: 'claude-opus-4-6',
        capabilities: ['marketplace', 'discovery', 'chat', 'trust-analytics', 'privacy'],
        creator: 'OpSpawn',
      },
      properties: {
        tags: ['marketplace', 'discovery', 'chat', 'trust-analytics', 'privacy', 'hedera', 'hcs-10'],
      },
      socials: [
        { platform: 'twitter', handle: '@opspawn' },
        { platform: 'github', handle: 'opspawn' },
      ],
    },
    communicationProtocol: 'hcs-10',
    registry: 'hashgraph-online',
    metadata: {
      provider: 'opspawn',
      version: '0.43.0',
      standards: ['HCS-10', 'HCS-11', 'HCS-14', 'HCS-19', 'HCS-20', 'HCS-26'],
      accountId: ACCOUNT_ID,
      network: NETWORK,
    },
  };
}

/**
 * Register the agent with the HOL Registry Broker.
 */
async function registerAgent() {
  const payload = buildPayload();
  console.log('Registering agent with HOL Registry Broker...');
  console.log(`  Name: ${payload.name}`);
  console.log(`  Endpoint: ${STAGING_URL}`);
  console.log(`  Protocol: ${payload.communicationProtocol}`);

  try {
    const result = await fetchJSON(`${HOL_BASE_URL}/register`, {
      method: 'POST',
      body: payload,
    });

    console.log('  Registration response:', JSON.stringify(result, null, 2));
    return result;
  } catch (err) {
    console.error(`  Registration failed: ${err.message}`);
    return { success: false, error: err.message };
  }
}

/**
 * Verify registration by searching again.
 */
async function verifyRegistration() {
  console.log('\nVerifying registration...');
  // Wait a moment for indexing
  await new Promise(r => setTimeout(r, 2000));

  try {
    const result = await fetchJSON(`${HOL_BASE_URL}/search?q=${encodeURIComponent(AGENT_NAME)}&limit=5`);
    const agents = result.agents || result.results || [];
    const match = agents.find(a =>
      (a.name || a.display_name || '').toLowerCase().includes('hederaconnect') ||
      (a.name || a.display_name || '').toLowerCase().includes('hedera-connect')
    );

    if (match) {
      console.log(`  Verified: Agent "${match.name || match.display_name}" found in registry!`);
      console.log(`  UAID: ${match.uaid || match.id}`);
      console.log(`  Communication: ${match.communicationSupported ? 'supported' : 'check needed'}`);
      return true;
    }

    console.log('  Agent not yet visible in search (may need indexing time).');
    return false;
  } catch (err) {
    console.log(`  Verification search failed: ${err.message}`);
    return false;
  }
}

/**
 * Test chat relay end-to-end.
 */
async function testChatRelay(agentUaid) {
  if (!agentUaid) {
    console.log('\nSkipping chat relay test (no UAID available).');
    return false;
  }

  console.log(`\nTesting chat relay with agent UAID: ${agentUaid}...`);

  try {
    // 1. Create session
    console.log('  Creating chat session...');
    const session = await fetchJSON(`${HOL_BASE_URL}/chat/session`, {
      method: 'POST',
      body: { uaid: agentUaid },
    });
    const sessionId = session.sessionId || session.id;
    console.log(`  Session created: ${sessionId}`);

    // 2. Send test message
    console.log('  Sending test message...');
    const response = await fetchJSON(`${HOL_BASE_URL}/chat/message`, {
      method: 'POST',
      body: { sessionId, message: 'Hello, this is a test message from the registration script.' },
    });
    console.log(`  Response received: ${JSON.stringify(response).slice(0, 200)}`);

    // 3. End session
    console.log('  Ending chat session...');
    try {
      await fetchJSON(`${HOL_BASE_URL}/chat/session/${encodeURIComponent(sessionId)}`, {
        method: 'DELETE',
      });
      console.log('  Session ended successfully.');
    } catch (err) {
      console.log(`  Session end note: ${err.message}`);
    }

    return true;
  } catch (err) {
    console.log(`  Chat relay test failed: ${err.message}`);
    return false;
  }
}

/**
 * Get platform stats for context.
 */
async function showStats() {
  try {
    const stats = await fetchJSON(`${HOL_BASE_URL}/stats`);
    console.log(`\nRegistry Stats:`);
    console.log(`  Total Agents: ${stats.totalAgents || stats.total_agents || 'N/A'}`);
    console.log(`  Registries: ${stats.totalRegistries || stats.total_registries || 'N/A'}`);
    console.log(`  Protocols: ${stats.totalProtocols || stats.total_protocols || 'N/A'}`);
  } catch {
    console.log('\nCould not fetch registry stats.');
  }
}

// ── Main ──────────────────────────────────────────────────────────────

async function main() {
  console.log('=== HOL Registry Broker Registration ===');
  console.log(`Agent: ${AGENT_NAME}`);
  console.log(`Account: ${ACCOUNT_ID}`);
  console.log(`Network: ${NETWORK}`);
  console.log(`Staging: ${STAGING_URL}`);
  console.log(`Broker: ${HOL_BASE_URL}`);
  console.log(`Force: ${FORCE}`);
  console.log();

  // Step 0: Show stats
  await showStats();
  console.log();

  // Step 1: Check existing registration (idempotent)
  const existing = await checkExistingRegistration();
  if (existing && !FORCE) {
    console.log('\nAgent is already registered. Use --force to re-register.');
    console.log(`UAID: ${existing.uaid || existing.id}`);

    // Still test chat relay with existing agent
    await testChatRelay(existing.uaid || existing.id);
    console.log('\n=== Done (already registered) ===');
    return;
  }

  // Step 2: Register
  console.log();
  const regResult = await registerAgent();
  const uaid = regResult?.uaid || regResult?.agentId || regResult?.id;

  // Step 3: Verify
  const verified = await verifyRegistration();

  // Step 4: Test chat relay
  if (uaid) {
    await testChatRelay(uaid);
  }

  // Summary
  console.log('\n=== Registration Summary ===');
  console.log(`  Success: ${regResult?.success !== false}`);
  console.log(`  UAID: ${uaid || 'pending'}`);
  console.log(`  Verified: ${verified}`);
  console.log(`  Timestamp: ${new Date().toISOString()}`);
  console.log('=== Done ===');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
