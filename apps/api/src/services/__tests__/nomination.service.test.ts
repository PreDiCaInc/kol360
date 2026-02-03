import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import { NominationService } from '../nomination.service';

// Mock prisma
vi.mock('../../lib/prisma', () => ({
  prisma: {
    nomination: {
      count: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      groupBy: vi.fn(),
    },
    hcp: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    hcpAlias: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
  },
}));

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
          specialty: null,
          city: null,
          state: null,
          aliases: [],
        },
      ]);

      const result = await nominationService.getSuggestions('nom-1');

      // Exact match should come first with higher score
      expect(result[0].hcp.id).toBe('hcp-1');
      expect(result[0].score).toBe(100);
    });
  });

  describe('matchToHcp', () => {
    it('should match nomination to HCP', async () => {
      (prisma.nomination.findUnique as Mock).mockResolvedValue({
        id: 'nom-1',
        rawNameEntered: 'John Doe',
      });
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

    it('should set REVIEW_NEEDED for low confidence matches', async () => {
      (prisma.nomination.findUnique as Mock).mockResolvedValue({
        id: 'nom-1',
        rawNameEntered: 'John',
      });
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
  });

  describe('createHcpAndMatch', () => {
    it('should create HCP and match nomination', async () => {
      (prisma.nomination.findUnique as Mock).mockResolvedValue({
        id: 'nom-1',
        rawNameEntered: 'John Doe',
      });
      (prisma.hcp.findUnique as Mock).mockResolvedValue(null);
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
        { npi: '1234567890', firstName: 'John', lastName: 'Doe' },
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
          { npi: '1234567890', firstName: 'John', lastName: 'Doe' },
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
      (prisma.hcp.create as Mock).mockResolvedValue({ id: 'hcp-new' });
      (prisma.nomination.update as Mock).mockResolvedValue({ id: 'nom-1' });

      await nominationService.createHcpAndMatch(
        'nom-1',
        { npi: '1234567890', firstName: 'John', lastName: 'Doe' },
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
          aliases: [],
          npi: '1234567890',
          specialty: null,
          city: null,
          state: null,
        },
      ]);
      (prisma.nomination.update as Mock).mockResolvedValue({ id: 'nom-1' });

      const result = await nominationService.bulkAutoMatch('campaign-1', 'user-1');

      expect(result.matched).toBeGreaterThanOrEqual(0);
      expect(result.total).toBe(1);
    });
  });
});
