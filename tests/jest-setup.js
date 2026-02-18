// Global Jest setup: mock @hashgraph/sdk to prevent Client.forTestnet() timeouts.
// The real SDK schedules a gRPC network update on construction which hangs in test.

jest.mock('@hashgraph/sdk', () => {
  const mockClient = {
    setOperator: jest.fn().mockReturnThis(),
    close: jest.fn().mockResolvedValue(undefined),
  };

  const Client = {
    forTestnet: jest.fn(() => ({ ...mockClient })),
    forMainnet: jest.fn(() => ({ ...mockClient })),
  };

  class MockPrivateKey {
    static fromStringECDSA() { return new MockPrivateKey(); }
    static fromStringED25519() { return new MockPrivateKey(); }
    static fromString() { return new MockPrivateKey(); }
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

  return {
    Client,
    PrivateKey: MockPrivateKey,
    TopicCreateTransaction,
    TopicMessageSubmitTransaction,
    AccountBalanceQuery,
  };
});
