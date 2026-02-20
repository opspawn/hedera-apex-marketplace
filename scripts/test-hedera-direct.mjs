/**
 * Direct Hedera testnet diagnostic script.
 * Tests if we can create a topic and submit a message using the SDK.
 */
import { Client, PrivateKey, TopicCreateTransaction, TopicMessageSubmitTransaction, AccountBalanceQuery } from '@hashgraph/sdk';

const ACCOUNT_ID = '0.0.7854018';
const RAW_KEY = 'e564ac3d08f9e3fd04842698b80aa80c5e2c76919f483b745e62479abcc87738';
const DER_PREFIX_ECDSA = '3030020100300706052b8104000a04220420';

async function main() {
  console.log('=== Hedera Direct Diagnostic ===');
  console.log(`Account: ${ACCOUNT_ID}`);
  console.log(`Key (first 8): ${RAW_KEY.substring(0, 8)}...`);

  // Try each key format
  let privateKey = null;
  const attempts = [];

  // Attempt 1: fromStringECDSA with raw key
  try {
    privateKey = PrivateKey.fromStringECDSA(RAW_KEY);
    attempts.push({ method: 'fromStringECDSA(raw)', success: true });
    console.log('✓ fromStringECDSA(raw) succeeded');
  } catch (e) {
    attempts.push({ method: 'fromStringECDSA(raw)', success: false, error: e.message });
    console.log(`✗ fromStringECDSA(raw): ${e.message}`);
  }

  // Attempt 2: fromStringED25519
  if (!privateKey) {
    try {
      privateKey = PrivateKey.fromStringED25519(RAW_KEY);
      attempts.push({ method: 'fromStringED25519', success: true });
      console.log('✓ fromStringED25519 succeeded');
    } catch (e) {
      attempts.push({ method: 'fromStringED25519', success: false, error: e.message });
      console.log(`✗ fromStringED25519: ${e.message}`);
    }
  }

  // Attempt 3: fromStringECDSA with DER prefix
  if (!privateKey) {
    try {
      privateKey = PrivateKey.fromStringECDSA(DER_PREFIX_ECDSA + RAW_KEY);
      attempts.push({ method: 'fromStringECDSA(DER+raw)', success: true });
      console.log('✓ fromStringECDSA(DER+raw) succeeded');
    } catch (e) {
      attempts.push({ method: 'fromStringECDSA(DER+raw)', success: false, error: e.message });
      console.log(`✗ fromStringECDSA(DER+raw): ${e.message}`);
    }
  }

  // Attempt 4: fromString (generic)
  if (!privateKey) {
    try {
      privateKey = PrivateKey.fromString(RAW_KEY);
      attempts.push({ method: 'fromString', success: true });
      console.log('✓ fromString succeeded');
    } catch (e) {
      attempts.push({ method: 'fromString', success: false, error: e.message });
      console.log(`✗ fromString: ${e.message}`);
    }
  }

  if (!privateKey) {
    console.error('\n✗✗✗ ALL key formats failed! Cannot proceed.');
    console.log('Attempts:', JSON.stringify(attempts, null, 2));
    process.exit(1);
  }

  console.log(`\nKey type: ${privateKey._key?.constructor?.name || 'unknown'}`);
  console.log(`Public key: ${privateKey.publicKey.toString().substring(0, 20)}...`);

  // Create client
  const client = Client.forTestnet();
  client.setOperator(ACCOUNT_ID, privateKey);
  console.log('\n✓ Client created and operator set');

  // Check balance
  try {
    const balance = await new AccountBalanceQuery()
      .setAccountId(ACCOUNT_ID)
      .execute(client);
    console.log(`✓ Account balance: ${balance.hbars.toString()} HBAR`);
  } catch (e) {
    console.error(`✗ Balance query failed: ${e.message}`);
    client.close();
    process.exit(1);
  }

  // Create a topic
  console.log('\n--- Creating topic ---');
  let topicId;
  try {
    const tx = new TopicCreateTransaction()
      .setTopicMemo('hcs10:test:diagnostic-sprint50');
    const response = await tx.execute(client);
    const receipt = await response.getReceipt(client);
    topicId = receipt.topicId.toString();
    console.log(`✓ Topic created: ${topicId}`);
    console.log(`  Hashscan: https://hashscan.io/testnet/topic/${topicId}`);
  } catch (e) {
    console.error(`✗ Topic creation failed: ${e.message}`);
    console.error(`  Full error:`, e);
    client.close();
    process.exit(1);
  }

  // Submit a message
  console.log('\n--- Submitting message ---');
  try {
    const msg = JSON.stringify({
      type: 'hcs-10-test',
      agent: 'opspawn-diagnostic',
      timestamp: new Date().toISOString(),
    });
    const tx = new TopicMessageSubmitTransaction()
      .setTopicId(topicId)
      .setMessage(msg);
    const response = await tx.execute(client);
    const receipt = await response.getReceipt(client);
    console.log(`✓ Message submitted to ${topicId}`);
    console.log(`  Sequence: ${receipt.topicSequenceNumber?.toString()}`);
  } catch (e) {
    console.error(`✗ Message submission failed: ${e.message}`);
  }

  // Verify via mirror node
  console.log('\n--- Verifying via mirror node (waiting 5s) ---');
  await new Promise(r => setTimeout(r, 5000));
  try {
    const res = await fetch(`https://testnet.mirrornode.hedera.com/api/v1/topics/${topicId}/messages?limit=5`);
    const data = await res.json();
    console.log(`✓ Mirror node: ${data.messages?.length || 0} messages found`);
    if (data.messages?.[0]) {
      const decoded = Buffer.from(data.messages[0].message, 'base64').toString('utf-8');
      console.log(`  Content: ${decoded}`);
    }
  } catch (e) {
    console.log(`  Mirror node query failed (may need more time): ${e.message}`);
  }

  // Check account transactions
  try {
    const res = await fetch(`https://testnet.mirrornode.hedera.com/api/v1/transactions?account.id=${ACCOUNT_ID}&limit=5&order=desc`);
    const data = await res.json();
    console.log(`\n✓ Recent transactions for ${ACCOUNT_ID}: ${data.transactions?.length || 0}`);
    for (const tx of (data.transactions || []).slice(0, 3)) {
      console.log(`  ${tx.name} at ${tx.consensus_timestamp} - ${tx.result}`);
    }
  } catch (e) {
    console.log(`  Transaction query failed: ${e.message}`);
  }

  console.log('\n=== Diagnostic complete ===');
  client.close();
}

main().catch(e => {
  console.error('Fatal:', e);
  process.exit(1);
});
