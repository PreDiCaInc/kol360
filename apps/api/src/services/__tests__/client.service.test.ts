import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import { ClientService } from '../client.service';

// Mock prisma
vi.mock('../../lib/prisma', () => ({
  prisma: {
    client: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    liteClientDiseaseArea: {
      create: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

import { prisma } from '../../lib/prisma';

describe('ClientService', () => {
  let clientService: ClientService;

  beforeEach(() => {
    clientService = new ClientService();
    vi.clearAllMocks();
  });

  describe('list', () => {
    it('should return active clients by default', async () => {
      const mockClients = [
        { id: 'client-1', name: 'Client A', isActive: true, _count: { users: 5, campaigns: 3, liteClientDiseaseAreas: 0 } },
        { id: 'client-2', name: 'Client B', isActive: true, _count: { users: 3, campaigns: 1, liteClientDiseaseAreas: 2 } },
      ];

      (prisma.client.findMany as Mock).mockResolvedValue(mockClients);

      const result = await clientService.list();

      expect(result).toEqual(mockClients);
      expect(prisma.client.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { isActive: true },
        })
      );
    });

    it('should include inactive clients when requested', async () => {
      (prisma.client.findMany as Mock).mockResolvedValue([]);

      await clientService.list(true);

      expect(prisma.client.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {},
        })
      );
    });

    it('should order clients by name ascending', async () => {
      (prisma.client.findMany as Mock).mockResolvedValue([]);

      await clientService.list();

      expect(prisma.client.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { name: 'asc' },
        })
      );
    });
  });

  describe('getById', () => {
    it('should return client with related data', async () => {
      const mockClient = {
        id: 'client-1',
        name: 'Test Client',
        isActive: true,
        users: [{ id: 'user-1', email: 'test@example.com', firstName: 'John', lastName: 'Doe', role: 'CLIENT_ADMIN', status: 'ACTIVE' }],
        campaigns: [{ id: 'campaign-1', name: 'Campaign 1', status: 'ACTIVE', diseaseArea: { name: 'Oncology' } }],
        liteClientDiseaseAreas: [],
        _count: { users: 1, campaigns: 1 },
      };

      (prisma.client.findUnique as Mock).mockResolvedValue(mockClient);

      const result = await clientService.getById('client-1');

      expect(result).toEqual(mockClient);
      expect(prisma.client.findUnique).toHaveBeenCalledWith({
        where: { id: 'client-1' },
        include: expect.objectContaining({
          users: expect.any(Object),
          campaigns: expect.any(Object),
        }),
      });
    });

    it('should return null for non-existent client', async () => {
      (prisma.client.findUnique as Mock).mockResolvedValue(null);

      const result = await clientService.getById('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    it('should create a new client', async () => {
      const mockClient = {
        id: 'client-1',
        name: 'New Client',
        type: 'FULL',
        primaryColor: '#0066CC',
      };

      (prisma.client.create as Mock).mockResolvedValue(mockClient);

      const result = await clientService.create(
        { name: 'New Client', type: 'FULL', primaryColor: '#0066CC' },
        'admin-user'
      );

      expect(result).toEqual(mockClient);
      expect(prisma.client.create).toHaveBeenCalledWith({
        data: { name: 'New Client', type: 'FULL', primaryColor: '#0066CC' },
      });
    });

    it('should create client with minimal data', async () => {
      const mockClient = { id: 'client-1', name: 'Minimal Client' };

      (prisma.client.create as Mock).mockResolvedValue(mockClient);

      const result = await clientService.create({ name: 'Minimal Client' }, 'admin-user');

      expect(result).toEqual(mockClient);
    });
  });

  describe('update', () => {
    it('should update client data', async () => {
      const mockUpdatedClient = {
        id: 'client-1',
        name: 'Updated Client',
        primaryColor: '#FF5733',
      };

      (prisma.client.update as Mock).mockResolvedValue(mockUpdatedClient);

      const result = await clientService.update('client-1', {
        name: 'Updated Client',
        primaryColor: '#FF5733',
      });

      expect(result).toEqual(mockUpdatedClient);
      expect(prisma.client.update).toHaveBeenCalledWith({
        where: { id: 'client-1' },
        data: { name: 'Updated Client', primaryColor: '#FF5733' },
      });
    });

    it('should handle partial updates', async () => {
      (prisma.client.update as Mock).mockResolvedValue({ id: 'client-1', name: 'Updated' });

      await clientService.update('client-1', { name: 'Updated' });

      expect(prisma.client.update).toHaveBeenCalledWith({
        where: { id: 'client-1' },
        data: { name: 'Updated' },
      });
    });
  });

  describe('deactivate', () => {
    it('should set isActive to false', async () => {
      const mockDeactivatedClient = { id: 'client-1', name: 'Client', isActive: false };

      (prisma.client.update as Mock).mockResolvedValue(mockDeactivatedClient);

      const result = await clientService.deactivate('client-1');

      expect(result.isActive).toBe(false);
      expect(prisma.client.update).toHaveBeenCalledWith({
        where: { id: 'client-1' },
        data: { isActive: false },
      });
    });
  });

  describe('grantDiseaseAreaAccess', () => {
    it('should create lite client disease area access', async () => {
      const mockAccess = {
        id: 'access-1',
        clientId: 'client-1',
        diseaseAreaId: 'da-1',
        grantedBy: 'admin-user',
      };

      (prisma.liteClientDiseaseArea.create as Mock).mockResolvedValue(mockAccess);

      const result = await clientService.grantDiseaseAreaAccess('client-1', 'da-1', 'admin-user');

      expect(result).toEqual(mockAccess);
      expect(prisma.liteClientDiseaseArea.create).toHaveBeenCalledWith({
        data: {
          clientId: 'client-1',
          diseaseAreaId: 'da-1',
          grantedBy: 'admin-user',
        },
      });
    });
  });

  describe('revokeDiseaseAreaAccess', () => {
    it('should delete lite client disease area access', async () => {
      (prisma.liteClientDiseaseArea.deleteMany as Mock).mockResolvedValue({ count: 1 });

      const result = await clientService.revokeDiseaseAreaAccess('client-1', 'da-1');

      expect(result).toEqual({ count: 1 });
      expect(prisma.liteClientDiseaseArea.deleteMany).toHaveBeenCalledWith({
        where: { clientId: 'client-1', diseaseAreaId: 'da-1' },
      });
    });

    it('should handle case where access does not exist', async () => {
      (prisma.liteClientDiseaseArea.deleteMany as Mock).mockResolvedValue({ count: 0 });

      const result = await clientService.revokeDiseaseAreaAccess('client-1', 'non-existent');

      expect(result).toEqual({ count: 0 });
    });
  });
});
