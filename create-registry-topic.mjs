/**
 * Create a real HCS-10 registry topic for the Apex marketplace.
 * This is needed because 0.0.7311321 doesn't exist on testnet.
 */
import { readFileSync, writeFileSync } from 'fs';
import { Client, PrivateKey, TopicCreateTransaction, TopicMessageSubmitTransaction } from '@hashgraph/sdk';

const creds = JSON.parse(readFileSync('/home/agent/credentials/hedera-testnet-keys.json', 'utf-8'));
const accountId = creds.accountId;
const privateKeyDer = creds.privateKeyDer;

console.log('Creating registry topic for account:', accountId);

let client;
let privateKey;
try {
  client = Client.forTestnet();
  privateKey = PrivateKey.fromStringECDSA(privateKeyDer);
  client.setOperator(accountId, privateKey);
  console.log('✓ Client initialized');
} catch (err) {
  console.error('✗ Client failed:', err.message);
  process.exit(1);
}

// Create the registry topic
let registryTopicId;
try {
  const tx = await new TopicCreateTransaction()
    .setTopicMemo('hcs-10:agent-registry:hedera-apex-marketplace:opspawn')
    .execute(client);
  const receipt = await tx.getReceipt(client);
  registryTopicId = receipt.topicId.toString();
  console.log('✓ Registry topic created:', registryTopicId);
  console.log('  https://hashscan.io/testnet/topic/' + registryTopicId);
} catch (err) {
  console.error('✗ Failed:', err.message);
  await client.close();
  process.exit(1);
}

// Submit an initialization message
try {
  const initMsg = JSON.stringify({
    type: 'hcs-10-registry-init',
    name: 'Hedera Agent Marketplace Registry',
    operator: accountId,
    version: '1.0',
    description: 'OpenConvAI agent registry for the Hedera Apex hackathon marketplace',
    timestamp: new Date().toISOString(),
  });
  const tx = await new TopicMessageSubmitTransaction()
    .setTopicId(registryTopicId)
    .setMessage(initMsg)
    .execute(client);
  const receipt = await tx.getReceipt(client);
  console.log('✓ Init message submitted, seq:', receipt.topicSequenceNumber?.toNumber());
} catch (err) {
  console.warn('Warning: Init message failed:', err.message);
}

await client.close();

// Update .env with the new registry topic ID
const envPath = '/home/agent/projects/hedera-apex-marketplace/.env';
let envContent = readFileSync(envPath, 'utf-8');

if (envContent.includes('REGISTRY_TOPIC_ID=')) {
  envContent = envContent.replace(/REGISTRY_TOPIC_ID=.*/, `REGISTRY_TOPIC_ID=${registryTopicId}`);
} else {
  envContent += `\nREGISTRY_TOPIC_ID=${registryTopicId}\n`;
}
writeFileSync(envPath, envContent);
console.log('✓ Updated .env with REGISTRY_TOPIC_ID=' + registryTopicId);

console.log('\nNew registry topic:', registryTopicId);
console.log('Hashscan: https://hashscan.io/testnet/topic/' + registryTopicId);
