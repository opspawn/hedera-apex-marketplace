/**
 * Hedera Live Client Diagnostic Script
 * Tests if we can actually create a topic and submit a message on testnet.
 */
import { readFileSync } from 'fs';
import { Client, PrivateKey, TopicCreateTransaction, TopicMessageSubmitTransaction } from '@hashgraph/sdk';

// Load env
const envContent = readFileSync('.env', 'utf-8');
const env = {};
for (const line of envContent.split('\n')) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) env[m[1].trim()] = m[2].trim();
}

const accountId = env.HEDERA_ACCOUNT_ID;
const privateKeyStr = env.HEDERA_PRIVATE_KEY;

console.log('=== Hedera Live Client Diagnostic ===');
console.log('Account ID:', accountId);
console.log('Key length:', privateKeyStr?.length || 0);
console.log('');

// Step 1: Initialize client
let client;
let privateKey;
try {
  client = Client.forTestnet();
  privateKey = PrivateKey.fromStringECDSA(privateKeyStr);
  client.setOperator(accountId, privateKey);
  console.log('✓ Client initialized (ECDSA key)');
  console.log('  Public key:', privateKey.publicKey.toString().substring(0, 40) + '...');
} catch (err) {
  console.error('✗ Client initialization failed:', err.message);
  process.exit(1);
}

// Step 2: Create a test topic
console.log('');
console.log('Step 2: Creating test topic...');
let topicId;
try {
  const tx = new TopicCreateTransaction().setTopicMemo('hedera-apex-marketplace:diagnostic-test');
  const response = await tx.execute(client);
  const receipt = await response.getReceipt(client);
  topicId = receipt.topicId.toString();
  console.log('✓ Topic created:', topicId);
  console.log('  Hashscan URL: https://hashscan.io/testnet/topic/' + topicId);
} catch (err) {
  console.error('✗ Topic creation failed:', err.message);
  console.error('  Full error:', err);
  await client.close();
  process.exit(1);
}

// Step 3: Submit a test message
console.log('');
console.log('Step 3: Submitting test message...');
try {
  const message = JSON.stringify({
    type: 'diagnostic-test',
    timestamp: new Date().toISOString(),
    account: accountId,
    purpose: 'Verifying live Hedera HCS connectivity for Apex hackathon',
  });
  const tx = new TopicMessageSubmitTransaction()
    .setTopicId(topicId)
    .setMessage(message);
  const response = await tx.execute(client);
  const receipt = await response.getReceipt(client);
  console.log('✓ Message submitted, sequence:', receipt.topicSequenceNumber?.toNumber());
} catch (err) {
  console.error('✗ Message submission failed:', err.message);
}

// Step 4: Close
await client.close();
console.log('');
console.log('=== Diagnostic Complete ===');
console.log('Topic ID for verification:', topicId);
console.log('Check on Hashscan: https://hashscan.io/testnet/topic/' + topicId);
