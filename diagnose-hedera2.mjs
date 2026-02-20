/**
 * Hedera Live Client Diagnostic v2 - Try DER key format
 */
import { readFileSync } from 'fs';
import { Client, PrivateKey, TopicCreateTransaction, TopicMessageSubmitTransaction, AccountBalanceQuery } from '@hashgraph/sdk';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const creds = JSON.parse(readFileSync('/home/agent/credentials/hedera-testnet-keys.json', 'utf-8'));

const accountId = creds.accountId;
const privateKeyDer = creds.privateKeyDer;
const privateKeyRaw = creds.privateKeyRaw;

console.log('=== Hedera Diagnostic v2 ===');
console.log('Account ID:', accountId);
console.log('Expected pubkey:', creds.publicKeyRaw.substring(0, 20) + '...');
console.log('EVM address:', creds.evmAddress);
console.log('');

// Try DER-encoded key
let client;
let privateKey;
try {
  client = Client.forTestnet();

  // Try DER format first
  try {
    privateKey = PrivateKey.fromStringECDSA(privateKeyDer);
    console.log('DER key public:', privateKey.publicKey.toString().substring(0, 40) + '...');
  } catch (e) {
    console.log('DER ECDSA failed:', e.message.substring(0, 60));
    privateKey = PrivateKey.fromBytesECDSA(Buffer.from(privateKeyRaw, 'hex'));
  }

  client.setOperator(accountId, privateKey);
  console.log('✓ Client initialized');
} catch (err) {
  console.error('✗ Failed:', err.message);
  process.exit(1);
}

// Check balance first
console.log('Checking balance...');
try {
  const balance = await new AccountBalanceQuery().setAccountId(accountId).execute(client);
  console.log('✓ Balance:', balance.hbars.toString());
} catch (e) {
  console.log('Balance check failed:', e.message.substring(0, 80));
}

// Create topic with different approach
console.log('');
console.log('Creating topic...');
let topicId;
try {
  const tx = await new TopicCreateTransaction()
    .setTopicMemo('apex-diagnostic-v2')
    .setMaxTransactionFee(5_000_000_00) // 5 HBAR max
    .execute(client);

  console.log('Transaction ID:', tx.transactionId.toString());

  const receipt = await tx.getReceipt(client);
  topicId = receipt.topicId.toString();
  console.log('✓ Topic created:', topicId);
  console.log('  https://hashscan.io/testnet/topic/' + topicId);
} catch (err) {
  console.error('✗ Topic creation failed:', err.message.substring(0, 200));
  // Check if we can query the account at all
  console.log('Testing with REST API...');
  try {
    const { default: fetch } = await import('node-fetch');
    const r = await fetch(`https://testnet.mirrornode.hedera.com/api/v1/accounts/${accountId}`);
    const d = await r.json();
    console.log('Account key type:', d.key?._type);
    console.log('Account key:', d.key?.key?.substring(0, 20) + '...');
  } catch (e2) {
    console.log('REST check failed:', e2.message);
  }
  await client.close();
  process.exit(1);
}

// Submit message
console.log('');
console.log('Submitting message...');
try {
  const msg = JSON.stringify({ type: 'test', ts: Date.now() });
  const tx = await new TopicMessageSubmitTransaction()
    .setTopicId(topicId)
    .setMessage(msg)
    .execute(client);
  const receipt = await tx.getReceipt(client);
  console.log('✓ Message seq:', receipt.topicSequenceNumber?.toNumber());
} catch (err) {
  console.log('✗ Message failed:', err.message.substring(0, 100));
}

await client.close();
console.log('');
console.log('Done! Topic:', topicId);
