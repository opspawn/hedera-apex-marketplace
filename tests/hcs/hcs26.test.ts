import { HCS26SkillRegistry } from '../../src/hcs/hcs26';
import { SkillManifest, AgentSkill } from '../../src/types';

describe('HCS26SkillRegistry', () => {
  let registry: HCS26SkillRegistry;

  const validManifest: SkillManifest = {
    name: 'screenshot-service',
    version: '1.0.0',
    description: 'Browser screenshot capture service',
    author: 'OpSpawn',
    license: 'MIT',
    skills: [
      {
        name: 'Screenshot URL',
        description: 'Capture a screenshot of any URL',
        category: 'tools',
        tags: ['screenshot', 'browser', 'capture'],
        input_schema: { type: 'object', properties: { url: { type: 'string' } } },
        output_schema: { type: 'object', properties: { image_url: { type: 'string' } } },
      },
    ],
    tags: ['screenshot', 'browser'],
  };

  const mockAgentSkills: AgentSkill[] = [
    {
      id: 'screenshot-url',
      name: 'Screenshot URL',
      description: 'Capture a screenshot of any URL',
      category: 'tools',
      tags: ['screenshot', 'browser'],
      input_schema: { type: 'object', properties: { url: { type: 'string' } } },
      output_schema: { type: 'object', properties: { image_url: { type: 'string' } } },
      pricing: { amount: 100, token: 'OPSPAWN', unit: 'per_call' },
    },
    {
      id: 'full-page-screenshot',
      name: 'Full Page Screenshot',
      description: 'Capture full-page screenshot with scrolling',
      category: 'tools',
      tags: ['screenshot', 'full-page'],
      input_schema: { type: 'object', properties: { url: { type: 'string' }, fullPage: { type: 'boolean' } } },
      output_schema: { type: 'object', properties: { image_url: { type: 'string' } } },
      pricing: { amount: 200, token: 'OPSPAWN', unit: 'per_call' },
    },
  ];

  beforeEach(() => {
    registry = new HCS26SkillRegistry({
      accountId: '0.0.7854018',
      privateKey: 'test-key',
      network: 'testnet',
    });
  });

  // --- Manifest Validation ---

  describe('validateManifest', () => {
    test('should validate a correct manifest', () => {
      const result = registry.validateManifest(validManifest);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('should reject manifest missing name', () => {
      const manifest = { ...validManifest, name: '' };
      const result = registry.validateManifest(manifest);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing name');
    });

    test('should reject manifest missing version', () => {
      const manifest = { ...validManifest, version: '' };
      const result = registry.validateManifest(manifest);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing version');
    });

    test('should reject manifest missing description', () => {
      const manifest = { ...validManifest, description: '' };
      const result = registry.validateManifest(manifest);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing description');
    });

    test('should reject manifest missing author', () => {
      const manifest = { ...validManifest, author: '' };
      const result = registry.validateManifest(manifest);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing author');
    });

    test('should reject manifest missing license', () => {
      const manifest = { ...validManifest, license: '' };
      const result = registry.validateManifest(manifest);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing license');
    });

    test('should reject manifest with no skills', () => {
      const manifest = { ...validManifest, skills: [] };
      const result = registry.validateManifest(manifest);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Must have at least one skill definition');
    });

    test('should reject invalid semver version', () => {
      const manifest = { ...validManifest, version: '1.0' };
      const result = registry.validateManifest(manifest);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Version must be in semver format (e.g., 1.0.0)');
    });

    test('should reject skill missing required fields', () => {
      const manifest = {
        ...validManifest,
        skills: [{
          name: '',
          description: '',
          category: '',
          tags: [],
          input_schema: {},
          output_schema: {},
        }],
      };
      const result = registry.validateManifest(manifest);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('skills[0]: missing name');
      expect(result.errors).toContain('skills[0]: missing description');
      expect(result.errors).toContain('skills[0]: missing category');
    });
  });

  // --- Publish Flow ---

  describe('publishSkill', () => {
    test('should publish a valid manifest and return PublishedSkill', async () => {
      const published = await registry.publishSkill(validManifest);
      expect(published.topic_id).toMatch(/^0\.0\.\d+$/);
      expect(published.manifest).toEqual(validManifest);
      expect(published.publisher).toBe('0.0.7854018');
      expect(published.status).toBe('published');
      expect(published.published_at).toBeTruthy();
    });

    test('should throw on invalid manifest', async () => {
      const invalid = { ...validManifest, name: '', version: '' };
      await expect(registry.publishSkill(invalid)).rejects.toThrow('Invalid skill manifest');
    });

    test('should increment published count', async () => {
      expect(registry.getPublishedCount()).toBe(0);
      await registry.publishSkill(validManifest);
      expect(registry.getPublishedCount()).toBe(1);
    });

    test('should generate different topic IDs for different versions', async () => {
      const v1 = await registry.publishSkill(validManifest);
      const v2Manifest = { ...validManifest, version: '2.0.0' };
      const v2 = await registry.publishSkill(v2Manifest);
      expect(v1.topic_id).not.toBe(v2.topic_id);
    });
  });

  // --- Discovery ---

  describe('discoverSkills', () => {
    beforeEach(async () => {
      await registry.publishSkill(validManifest);
      await registry.publishSkill({
        ...validManifest,
        name: 'code-review-agent',
        version: '1.0.0',
        description: 'Automated code review and quality analysis',
        skills: [{
          name: 'Code Review',
          description: 'Review code for bugs and quality issues',
          category: 'development',
          tags: ['code', 'review', 'quality'],
          input_schema: { type: 'object' },
          output_schema: { type: 'object' },
        }],
        tags: ['code', 'review'],
      });
    });

    test('should find skills by name', async () => {
      const result = await registry.discoverSkills('screenshot');
      expect(result.total).toBe(1);
      expect(result.skills[0].manifest.name).toBe('screenshot-service');
      expect(result.query).toBe('screenshot');
    });

    test('should find skills by description', async () => {
      const result = await registry.discoverSkills('code review');
      expect(result.total).toBe(1);
      expect(result.skills[0].manifest.name).toBe('code-review-agent');
    });

    test('should find skills by tag', async () => {
      const result = await registry.discoverSkills('browser');
      expect(result.total).toBe(1);
      expect(result.skills[0].manifest.name).toBe('screenshot-service');
    });

    test('should find skills by skill category', async () => {
      const result = await registry.discoverSkills('development');
      expect(result.total).toBe(1);
      expect(result.skills[0].manifest.name).toBe('code-review-agent');
    });

    test('should return empty results for no match', async () => {
      const result = await registry.discoverSkills('nonexistent');
      expect(result.total).toBe(0);
      expect(result.skills).toHaveLength(0);
    });

    test('should be case-insensitive', async () => {
      const result = await registry.discoverSkills('SCREENSHOT');
      expect(result.total).toBe(1);
    });
  });

  // --- Get by Topic ---

  describe('getSkillByTopic', () => {
    test('should retrieve a published skill by topic ID', async () => {
      const published = await registry.publishSkill(validManifest);
      const retrieved = await registry.getSkillByTopic(published.topic_id);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.manifest.name).toBe('screenshot-service');
    });

    test('should return null for unknown topic ID', async () => {
      const result = await registry.getSkillByTopic('0.0.999999');
      expect(result).toBeNull();
    });
  });

  // --- Build Manifest from AgentSkills ---

  describe('buildManifestFromSkills', () => {
    test('should convert AgentSkills to SkillManifest', () => {
      const manifest = registry.buildManifestFromSkills(
        'screenshot-service',
        '1.0.0',
        'Screenshot service skills',
        'OpSpawn',
        mockAgentSkills
      );
      expect(manifest.name).toBe('screenshot-service');
      expect(manifest.version).toBe('1.0.0');
      expect(manifest.author).toBe('OpSpawn');
      expect(manifest.license).toBe('MIT');
      expect(manifest.skills).toHaveLength(2);
      expect(manifest.skills[0].name).toBe('Screenshot URL');
      expect(manifest.skills[1].name).toBe('Full Page Screenshot');
    });

    test('should deduplicate tags across skills', () => {
      const manifest = registry.buildManifestFromSkills(
        'test',
        '1.0.0',
        'Test',
        'Test',
        mockAgentSkills
      );
      // Both skills have 'screenshot' tag — should appear once
      const screenshotCount = manifest.tags!.filter(t => t === 'screenshot').length;
      expect(screenshotCount).toBe(1);
    });

    test('should use first skill pricing as manifest pricing', () => {
      const manifest = registry.buildManifestFromSkills(
        'test',
        '1.0.0',
        'Test',
        'Test',
        mockAgentSkills
      );
      expect(manifest.pricing?.amount).toBe(100);
      expect(manifest.pricing?.token).toBe('OPSPAWN');
    });

    test('should produce a valid manifest', () => {
      const manifest = registry.buildManifestFromSkills(
        'screenshot-service',
        '1.0.0',
        'Screenshot service',
        'OpSpawn',
        mockAgentSkills
      );
      const result = registry.validateManifest(manifest);
      expect(result.valid).toBe(true);
    });
  });

  // --- List & Count ---

  describe('listPublishedSkills', () => {
    test('should list all published skills', async () => {
      await registry.publishSkill(validManifest);
      const list = await registry.listPublishedSkills();
      expect(list).toHaveLength(1);
      expect(list[0].manifest.name).toBe('screenshot-service');
    });
  });

  // --- Config ---

  describe('configuration', () => {
    test('should use default broker URL', () => {
      expect(registry.getBrokerUrl()).toBe('https://broker.hol.org');
    });

    test('should accept custom broker URL', () => {
      const custom = new HCS26SkillRegistry({
        accountId: '0.0.1',
        privateKey: 'key',
        network: 'testnet',
        brokerBaseUrl: 'https://custom.broker.com',
      });
      expect(custom.getBrokerUrl()).toBe('https://custom.broker.com');
    });
  });
});
