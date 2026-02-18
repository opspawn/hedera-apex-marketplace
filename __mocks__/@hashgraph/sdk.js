// Mock @hashgraph/sdk to prevent Client.forTestnet() from making real network calls.
// The real SDK schedules a network update on construction which times out in CI/test.

const mockClient = {
  setOperator: jest.fn().mockReturnThis(),
  close: jest.fn().mockResolvedValue(undefined),
};

const Client = {
  forTestnet: jest.fn(() => ({ ...mockClient })),
  forMainnet: jest.fn(() => ({ ...mockClient })),
};

class MockPrivateKey {
  constructor() {}
  static fromStringECDSA(key) { return new MockPrivateKey(); }
  static fromStringED25519(key) { return new MockPrivateKey(); }
  static fromString(key) { return new MockPrivateKey(); }
}

class TopicCreateTransaction {
  setTopicMemo() { return this; }
  async execute() {
    return {
      getReceipt: async () => ({
        topicId: { toString: () => '0.0.9999999' },
      }),
    };
  }
}

class TopicMessageSubmitTransaction {
  setTopicId() { return this; }
  setMessage() { return this; }
  async execute() {
    return {
      getReceipt: async () => ({
        topicSequenceNumber: { toNumber: () => 1 },
      }),
    };
  }
}

class AccountBalanceQuery {
  setAccountId() { return this; }
  async execute() {
    return {
      hbars: { toBigNumber: () => ({ toNumber: () => 10000 }) },
    };
  }
}

module.exports = {
  Client,
  PrivateKey: MockPrivateKey,
  TopicCreateTransaction,
  TopicMessageSubmitTransaction,
  AccountBalanceQuery,
};
