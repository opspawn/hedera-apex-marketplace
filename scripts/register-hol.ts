#!/usr/bin/env ts-node
/**
 * HOL Registry Broker Registration Script
 *
 * Manually registers the HireWire Agent Marketplace in the HOL Registry Broker.
 * Run with: npx ts-node scripts/register-hol.ts
 *
 * Prerequisites:
 * - HEDERA_PRIVATE_KEY environment variable set
 * - Hedera testnet account with sufficient HBAR
 *
 * This script:
 * 1. Authenticates with the Registry Broker using Hedera credentials
 * 2. Registers agent with profile (name, bio, capabilities, socials)
 * 3. Verifies registration by searching the broker index
 */

import dotenv from 'dotenv';
dotenv.config();

import { RegistryBroker } from '../src/hol/registry-broker';

async function main() {
  console.log('=== HOL Registry Broker Registration ===\n');

  const accountId = process.env.HEDERA_ACCOUNT_ID || '0.0.7854018';
  const privateKey = process.env.HEDERA_PRIVATE_KEY;
  const network = (process.env.HEDERA_NETWORK as 'testnet' | 'mainnet') || 'testnet';

  if (!privateKey) {
    console.error('ERROR: HEDERA_PRIVATE_KEY environment variable is required');
    console.error('Set it in .env or export HEDERA_PRIVATE_KEY=...');
    process.exit(1);
  }

  console.log(`Account: ${accountId}`);
  console.log(`Network: ${network}`);
  console.log(`Broker: https://hol.org/registry/api/v1\n`);

  const broker = new RegistryBroker({
    accountId,
    privateKey,
    network,
    agentEndpoint: 'https://hedera.opspawn.com/api/agent',
  });

  // Step 1: Register
  console.log('Step 1: Registering with Registry Broker...');
  const result = await broker.register();

  if (result.success) {
    console.log(`  SUCCESS`);
    console.log(`  UAID: ${result.uaid || 'pending'}`);
    console.log(`  Agent ID: ${result.agentId || 'pending'}`);
    console.log(`  Timestamp: ${result.timestamp}\n`);
  } else {
    console.error(`  FAILED: ${result.error}`);
    console.error('  Registration did not succeed. Check credentials and try again.\n');
    process.exit(1);
  }

  // Step 2: Verify
  console.log('Step 2: Verifying registration...');
  const verified = await broker.verifyRegistration();
  console.log(`  Verified: ${verified}\n`);

  // Step 3: Status
  const status = broker.getStatus();
  console.log('Registration Status:');
  console.log(JSON.stringify(status, null, 2));

  console.log('\n=== Registration Complete ===');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
