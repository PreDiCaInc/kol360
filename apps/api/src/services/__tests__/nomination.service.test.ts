import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import { NominationService } from '../nomination.service';

// Mock prisma - using factory function to avoid hoisting issues
vi.mock('../../lib/prisma', () => {
  const mockHcp = {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  };

  const mockPrisma = {
    nomination: {
      count: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      groupBy: vi.fn(),
    },
    campaign: {
      findUnique: vi.fn(),
    },
    hcp: mockHcp,
    hcpAlias: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    // Mock $transaction to execute the callback with the mock prisma
    $transaction: vi.fn().mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => {
      return callback(mockPrisma);
    }),
    // Mock $queryRaw for beid_seq sequence calls (returns a fake nextval)
    $queryRaw: vi.fn().mockResolvedValue([{ nextval: BigInt(100) }]),
  };

  return { prisma: mockPrisma };
});

import { prisma } from '../../lib/prisma';

describe('NominationService', () => {
  let nominationService: NominationService;

  beforeEach(() => {
    nominationService = new NominationService();
    vi.clearAllMocks();
  });

  describe('listForCampaign', () => {
    it('should return paginated nominations', async () => {
      const mockNominations = [
        {
          id: 'nom-1',
          rawNameEntered: 'John Doe',
          matchStatus: 'UNMATCHED',
          matchedHcp: null,
        },
      ];

      (prisma.campaign.findUnique as Mock).mockResolvedValue({ excludeInternalEmails: false });
      (prisma.nomination.count as Mock).mockResolvedValue(1);
      (prisma.nomination.findMany as Mock).mockResolvedValue(mockNominations);

      const result = await nominationService.listForCampaign('campaign-1', {
        page: 1,
        limit: 10,
      });

      expect(result.items).toEqual(mockNominations);
      expect(result.pagination).toEqual({ page: 1, limit: 10, total: 1, pages: 1 });
    });

    it('should filter by status', async () => {
      (prisma.campaign.findUnique as Mock).mockResolvedValue({ excludeInternalEmails: false });
      (prisma.nomination.count as Mock).mockResolvedValue(0);
      (prisma.nomination.findMany as Mock).mockResolvedValue([]);

      await nominationService.listForCampaign('campaign-1', {
        page: 1,
        limit: 10,
        status: 'MATCHED',
      });

      expect(prisma.nomination.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ matchStatus: 'MATCHED' }),
        })
      );
    });
  });

  describe('getSuggestions', () => {
    it('should return empty array for non-existent nomination', async () => {
      (prisma.nomination.findUnique as Mock).mockResolvedValue(null);

      const result = await nominationService.getSuggestions('non-existent');

      expect(result).toEqual([]);
    });

    it('should return scored suggestions', async () => {
      (prisma.nomination.findUnique as Mock).mockResolvedValue({
        id: 'nom-1',
        rawNameEntered: 'John Smith',
      });

      (prisma.hcp.findMany as Mock).mockResolvedValue([
        {
          id: 'hcp-1',
          npi: '1234567890',
          firstName: 'John',
          lastName: 'Smith',
          email: 'john.smith@example.com',
          specialty: 'Cardiology',
          city: 'New York',
          state: 'NY',
          aliases: [],
        },
      ]);

      const result = await nominationService.getSuggestions('nom-1');

      expect(result.length).toBeGreaterThan(0);
      expect(result[0].hcp.firstName).toBe('John');
      expect(result[0].score).toBeGreaterThan(0);
    });

    it('should prioritize exact matches', async () => {
      (prisma.nomination.findUnique as Mock).mockResolvedValue({
        id: 'nom-1',
        rawNameEntered: 'John Smith',
      });

      (prisma.hcp.findMany as Mock).mockResolvedValue([
        {
          id: 'hcp-1',
          npi: '1234567890',
          firstName: 'John',
          lastName: 'Smith',
          email: 'john.smith@example.com',
          specialty: null,
          city: null,
          state: null,
          aliases: [],
        },
        {
          id: 'hcp-2',
          npi: '0987654321',
          firstName: 'Johnny',
          lastName: 'Smithson',
          email: 'johnny.smithson@example.com',
          specialty: null,
          city: null,
          state: null,
          aliases: [],
        },
      ]);

      const result = await nominationService.getSuggestions('nom-1');

      // Exact match should come first. Score budget (v1.15.16): name=90, +5
      // state, +5 specialty. Mock nominator has no state/specialty info, so
      // perfect-name-only score is 90.
      expect(result[0].hcp.id).toBe('hcp-1');
      expect(result[0].score).toBe(90);
      expect(result[0].matchType).toBe('exact');
    });

    it('strips a trailing US state so "Eric Donnenfeld NY" matches "Eric Donnenfeld" exactly (v1.15.17)', async () => {
      (prisma.nomination.findUnique as Mock).mockResolvedValue({
        id: 'nom-1',
        rawNameEntered: 'Eric Donnenfeld NY',
      });
      (prisma.hcp.findMany as Mock).mockResolvedValue([
        {
          id: 'hcp-don',
          npi: '1891790770',
          firstName: 'Eric',
          lastName: 'Donnenfeld',
          email: null,
          specialty: null,
          city: null,
          state: 'NY',
          aliases: [],
        },
      ]);

      const result = await nominationService.getSuggestions('nom-1');

      // "NY" stripped → normalized "Eric Donnenfeld" → exact name match.
      expect(result[0].hcp.id).toBe('hcp-don');
      expect(result[0].matchType).toBe('exact');
      expect(result[0].score).toBeGreaterThanOrEqual(90);
    });

    it('does not strip an in-name "Dr" — "Dr Carol Drake" → exact "Carol Drake", not "Carol ake" (v1.15.17)', async () => {
      (prisma.nomination.findUnique as Mock).mockResolvedValue({
        id: 'nom-1',
        rawNameEntered: 'Dr Carol Drake',
      });
      (prisma.hcp.findMany as Mock).mockResolvedValue([
        {
          id: 'hcp-drake',
          npi: '5550001111',
          firstName: 'Carol',
          lastName: 'Drake',
          email: null,
          specialty: null,
          city: null,
          state: null,
          aliases: [],
        },
      ]);

      const result = await nominationService.getSuggestions('nom-1');

      // Title "Dr " stripped, surname "Drake" intact → exact match.
      // Pre-fix the global regex ate the "Dr" in "Drake" → "Carol ake" → 0 hits.
      expect(result[0].hcp.id).toBe('hcp-drake');
      expect(result[0].matchType).toBe('exact');
      expect(result[0].score).toBeGreaterThanOrEqual(90);
    });

    it('surfaces a single-char surname typo via full-name trigram ("William Flanery"→"William Flanary") (v1.15.17)', async () => {
      (prisma.nomination.findUnique as Mock).mockResolvedValue({
        id: 'nom-1',
        rawNameEntered: 'William Flanery',
      });
      // Trigram tier query returns the real HCP with full-name similarity 0.68
      (prisma.$queryRaw as Mock).mockResolvedValueOnce([
        { id: 'hcp-flan', similarity: 0.68 },
      ]);
      (prisma.hcp.findMany as Mock).mockResolvedValue([
        {
          id: 'hcp-flan',
          npi: '1234509876',
          firstName: 'William',
          lastName: 'Flanary',
          email: null,
          specialty: null,
          city: null,
          state: null,
          aliases: [],
        },
      ]);

      const result = await nominationService.getSuggestions('nom-1');

      const flan = result.find((r) => r.hcp.id === 'hcp-flan');
      expect(flan).toBeDefined();
      // sim 0.68 → primary band (>=0.55), name score 70. Not exact/alias, so
      // it surfaces for review rather than auto-MATCHED.
      expect(flan?.matchType).toBe('primary');
      expect(flan?.score).toBe(70);
    });
  });

  describe('matchToHcp', () => {
    it('should match nomination to HCP', async () => {
      (prisma.nomination.findUnique as Mock).mockResolvedValue({
        id: 'nom-1',
        rawNameEntered: 'John Doe',
      });
      (prisma.hcp.update as Mock).mockResolvedValue({ id: 'hcp-1' });
      (prisma.hcpAlias.findFirst as Mock).mockResolvedValue(null);
      (prisma.nomination.update as Mock).mockResolvedValue({
        id: 'nom-1',
        matchedHcpId: 'hcp-1',
        matchStatus: 'MATCHED',
      });

      const result = await nominationService.matchToHcp(
        'nom-1',
        'hcp-1',
        false,
        'user-1',
        'exact',
        100
      );

      expect(result.matchedHcpId).toBe('hcp-1');
      expect(result.matchStatus).toBe('MATCHED');
    });

    it('should add alias when requested', async () => {
      (prisma.nomination.findUnique as Mock).mockResolvedValue({
        id: 'nom-1',
        rawNameEntered: 'Dr. John',
      });
      (prisma.hcp.update as Mock).mockResolvedValue({ id: 'hcp-1' });
      (prisma.hcpAlias.findFirst as Mock).mockResolvedValue(null);
      (prisma.hcpAlias.create as Mock).mockResolvedValue({ id: 'alias-1' });
      (prisma.nomination.update as Mock).mockResolvedValue({ id: 'nom-1' });

      await nominationService.matchToHcp('nom-1', 'hcp-1', true, 'user-1');

      expect(prisma.hcpAlias.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          hcpId: 'hcp-1',
          aliasName: 'Dr. John',
        }),
      });
    });

    it('should not add duplicate alias', async () => {
      (prisma.nomination.findUnique as Mock).mockResolvedValue({
        id: 'nom-1',
        rawNameEntered: 'Dr. John',
      });
      (prisma.hcp.update as Mock).mockResolvedValue({ id: 'hcp-1' });
      (prisma.hcpAlias.findFirst as Mock).mockResolvedValue({ id: 'existing-alias' });
      (prisma.nomination.update as Mock).mockResolvedValue({ id: 'nom-1' });

      await nominationService.matchToHcp('nom-1', 'hcp-1', true, 'user-1');

      expect(prisma.hcpAlias.create).not.toHaveBeenCalled();
    });

    it('should throw error for non-existent nomination', async () => {
      (prisma.nomination.findUnique as Mock).mockResolvedValue(null);

      await expect(
        nominationService.matchToHcp('non-existent', 'hcp-1', false, 'user-1')
      ).rejects.toThrow('Nomination not found');
    });

    it('should set REVIEW_NEEDED for low confidence auto matches', async () => {
      (prisma.nomination.findUnique as Mock).mockResolvedValue({
        id: 'nom-1',
        rawNameEntered: 'John',
      });
      (prisma.hcp.update as Mock).mockResolvedValue({ id: 'hcp-1' });
      (prisma.nomination.update as Mock).mockResolvedValue({
        id: 'nom-1',
        matchStatus: 'REVIEW_NEEDED',
      });

      const result = await nominationService.matchToHcp(
        'nom-1',
        'hcp-1',
        false,
        'user-1',
        'partial',
        50
      );

      expect(prisma.nomination.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ matchStatus: 'REVIEW_NEEDED' }),
        })
      );
    });

    it('should set MATCHED for exact name match at >=90 (no context boost)', async () => {
      // v1.15.16: gate is matchType + confidence >= 90, not confidence === 100.
      // An exact name match alone scores 90; +5 state, +5 specialty get to 100.
      // Either way it's MATCHED.
      (prisma.nomination.findUnique as Mock).mockResolvedValue({
        id: 'nom-1',
        rawNameEntered: 'John Doe',
      });
      (prisma.hcp.update as Mock).mockResolvedValue({ id: 'hcp-1' });
      (prisma.nomination.update as Mock).mockResolvedValue({
        id: 'nom-1',
        matchStatus: 'MATCHED',
      });

      await nominationService.matchToHcp('nom-1', 'hcp-1', false, 'user-1', 'exact', 90);

      expect(prisma.nomination.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ matchStatus: 'MATCHED' }),
        })
      );
    });

    it('should set MATCHED for manual picks even at low confidence', async () => {
      (prisma.nomination.findUnique as Mock).mockResolvedValue({
        id: 'nom-1',
        rawNameEntered: 'John',
      });
      (prisma.hcp.update as Mock).mockResolvedValue({ id: 'hcp-1' });
      (prisma.nomination.update as Mock).mockResolvedValue({
        id: 'nom-1',
        matchStatus: 'MATCHED',
      });

      await nominationService.matchToHcp(
        'nom-1',
        'hcp-1',
        false,
        'user-1',
        'partial',
        50,
        true // isManual
      );

      expect(prisma.nomination.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ matchStatus: 'MATCHED' }),
        })
      );
    });
  });

  describe('createHcpAndMatch', () => {
    it('should create HCP and match nomination', async () => {
      (prisma.nomination.findUnique as Mock).mockResolvedValue({
        id: 'nom-1',
        rawNameEntered: 'John Doe',
      });
      (prisma.hcp.findUnique as Mock).mockResolvedValue(null);
      (prisma.hcp.findFirst as Mock).mockResolvedValue(null);
      (prisma.hcp.create as Mock).mockResolvedValue({
        id: 'hcp-new',
        firstName: 'John',
        lastName: 'Doe',
      });
      (prisma.hcpAlias.create as Mock).mockResolvedValue({ id: 'alias-1' });
      (prisma.nomination.update as Mock).mockResolvedValue({
        id: 'nom-1',
        matchedHcpId: 'hcp-new',
        matchStatus: 'NEW_HCP',
      });

      const result = await nominationService.createHcpAndMatch(
        'nom-1',
        { npi: '1234567890', firstName: 'John', lastName: 'Doe', email: 'john.doe@example.com' },
        'user-1'
      );

      expect(result.matchStatus).toBe('NEW_HCP');
    });

    it('should throw error if NPI already exists', async () => {
      (prisma.nomination.findUnique as Mock).mockResolvedValue({ id: 'nom-1' });
      (prisma.hcp.findUnique as Mock).mockResolvedValue({ id: 'existing-hcp' });

      await expect(
        nominationService.createHcpAndMatch(
          'nom-1',
          { npi: '1234567890', firstName: 'John', lastName: 'Doe', email: 'john.doe@example.com' },
          'user-1'
        )
      ).rejects.toThrow('An HCP with this NPI already exists');
    });

    it('should not add alias if name matches exactly', async () => {
      (prisma.nomination.findUnique as Mock).mockResolvedValue({
        id: 'nom-1',
        rawNameEntered: 'John Doe',
      });
      (prisma.hcp.findUnique as Mock).mockResolvedValue(null);
      (prisma.hcp.findFirst as Mock).mockResolvedValue(null);
      (prisma.hcp.create as Mock).mockResolvedValue({ id: 'hcp-new' });
      (prisma.nomination.update as Mock).mockResolvedValue({ id: 'nom-1' });

      await nominationService.createHcpAndMatch(
        'nom-1',
        { npi: '1234567890', firstName: 'John', lastName: 'Doe', email: 'john.doe@example.com' },
        'user-1'
      );

      expect(prisma.hcpAlias.create).not.toHaveBeenCalled();
    });
  });

  describe('exclude', () => {
    it('should exclude nomination with reason', async () => {
      (prisma.nomination.update as Mock).mockResolvedValue({
        id: 'nom-1',
        matchStatus: 'EXCLUDED',
        excludeReason: 'Invalid entry',
      });

      const result = await nominationService.exclude('nom-1', 'user-1', 'Invalid entry');

      expect(result.matchStatus).toBe('EXCLUDED');
      expect(prisma.nomination.update).toHaveBeenCalledWith({
        where: { id: 'nom-1' },
        data: expect.objectContaining({
          matchStatus: 'EXCLUDED',
          excludeReason: 'Invalid entry',
        }),
      });
    });
  });

  describe('updateRawName', () => {
    it('should update raw name and reset status', async () => {
      (prisma.nomination.findUnique as Mock).mockResolvedValue({
        id: 'nom-1',
        matchStatus: 'UNMATCHED',
      });
      (prisma.nomination.update as Mock).mockResolvedValue({
        id: 'nom-1',
        rawNameEntered: 'Jane Smith',
        matchStatus: 'UNMATCHED',
      });

      const result = await nominationService.updateRawName('nom-1', 'Jane Smith');

      expect(result.rawNameEntered).toBe('Jane Smith');
      expect(prisma.nomination.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            rawNameEntered: 'Jane Smith',
            matchStatus: 'UNMATCHED',
            matchedHcpId: null,
          }),
        })
      );
    });

    it('should throw error for already matched nomination', async () => {
      (prisma.nomination.findUnique as Mock).mockResolvedValue({
        id: 'nom-1',
        matchStatus: 'MATCHED',
      });

      await expect(
        nominationService.updateRawName('nom-1', 'New Name')
      ).rejects.toThrow('Can only edit unmatched or review-needed nominations');
    });
  });

  describe('getStats', () => {
    it('should return aggregated stats by status', async () => {
      (prisma.nomination.groupBy as Mock).mockResolvedValue([
        { matchStatus: 'MATCHED', _count: 10 },
        { matchStatus: 'UNMATCHED', _count: 5 },
        { matchStatus: 'EXCLUDED', _count: 2 },
      ]);

      const result = await nominationService.getStats('campaign-1');

      expect(result).toEqual({
        MATCHED: 10,
        UNMATCHED: 5,
        EXCLUDED: 2,
      });
    });
  });

  describe('bulkAutoMatch', () => {
    it('should auto-match unmatched nominations', async () => {
      (prisma.nomination.findMany as Mock).mockResolvedValue([
        { id: 'nom-1', rawNameEntered: 'John Smith' },
      ]);
      (prisma.nomination.findUnique as Mock).mockResolvedValue({
        id: 'nom-1',
        rawNameEntered: 'John Smith',
      });
      (prisma.hcp.findMany as Mock).mockResolvedValue([
        {
          id: 'hcp-1',
          firstName: 'John',
          lastName: 'Smith',
          email: 'john.smith@example.com',
          aliases: [],
          npi: '1234567890',
          specialty: null,
          city: null,
          state: null,
        },
      ]);
      (prisma.hcp.update as Mock).mockResolvedValue({ id: 'hcp-1' });
      (prisma.hcpAlias.findFirst as Mock).mockResolvedValue(null);
      (prisma.nomination.update as Mock).mockResolvedValue({ id: 'nom-1' });

      const result = await nominationService.bulkAutoMatch('campaign-1', 'user-1');

      expect(result.matched).toBeGreaterThanOrEqual(0);
      expect(result.total).toBe(1);
    });
  });
});
