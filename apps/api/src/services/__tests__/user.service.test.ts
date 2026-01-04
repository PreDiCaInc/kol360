import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import { UserService } from '../user.service';

// Mock prisma
vi.mock('../../lib/prisma', () => ({
  prisma: {
    user: {
      count: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

// Mock cognito service
vi.mock('../cognito.service', () => ({
  cognitoService: {
    createUser: vi.fn(),
    updateUserAttributes: vi.fn(),
    addUserToGroup: vi.fn(),
    removeUserFromGroup: vi.fn(),
    enableUser: vi.fn(),
    disableUser: vi.fn(),
    getRoleGroup: vi.fn((role: string) => `${role.toLowerCase().replace('_', '-')}s`),
  },
}));

import { prisma } from '../../lib/prisma';
import { cognitoService } from '../cognito.service';

describe('UserService', () => {
  let userService: UserService;

  beforeEach(() => {
    userService = new UserService();
    vi.clearAllMocks();
  });

  describe('list', () => {
    it('should return paginated users', async () => {
      const mockUsers = [
        { id: 'user-1', email: 'test1@example.com', role: 'TEAM_MEMBER' },
        { id: 'user-2', email: 'test2@example.com', role: 'CLIENT_ADMIN' },
      ];

      (prisma.user.count as Mock).mockResolvedValue(2);
      (prisma.user.findMany as Mock).mockResolvedValue(mockUsers);

      const result = await userService.list({ page: 1, limit: 10 });

      expect(result.items).toEqual(mockUsers);
      expect(result.pagination).toEqual({
        page: 1,
        limit: 10,
        total: 2,
        pages: 1,
      });
    });

    it('should filter by clientId', async () => {
      (prisma.user.count as Mock).mockResolvedValue(1);
      (prisma.user.findMany as Mock).mockResolvedValue([]);

      await userService.list({ page: 1, limit: 10, clientId: 'client-1' });

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ clientId: 'client-1' }),
        })
      );
    });

    it('should filter by role', async () => {
      (prisma.user.count as Mock).mockResolvedValue(0);
      (prisma.user.findMany as Mock).mockResolvedValue([]);

      await userService.list({ page: 1, limit: 10, role: 'PLATFORM_ADMIN' });

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ role: 'PLATFORM_ADMIN' }),
        })
      );
    });

    it('should filter by status', async () => {
      (prisma.user.count as Mock).mockResolvedValue(0);
      (prisma.user.findMany as Mock).mockResolvedValue([]);

      await userService.list({ page: 1, limit: 10, status: 'ACTIVE' });

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'ACTIVE' }),
        })
      );
    });

    it('should handle pagination correctly', async () => {
      (prisma.user.count as Mock).mockResolvedValue(25);
      (prisma.user.findMany as Mock).mockResolvedValue([]);

      const result = await userService.list({ page: 3, limit: 10 });

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 20,
          take: 10,
        })
      );
      expect(result.pagination.pages).toBe(3);
    });
  });

  describe('getById', () => {
    it('should return user with details', async () => {
      const mockUser = {
        id: 'user-1',
        email: 'test@example.com',
        role: 'TEAM_MEMBER',
        client: { id: 'client-1', name: 'Test Client' },
        auditLogs: [],
      };

      (prisma.user.findUnique as Mock).mockResolvedValue(mockUser);

      const result = await userService.getById('user-1');

      expect(result).toEqual(mockUser);
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        include: expect.objectContaining({
          client: true,
          auditLogs: expect.any(Object),
        }),
      });
    });

    it('should return null for non-existent user', async () => {
      (prisma.user.findUnique as Mock).mockResolvedValue(null);

      const result = await userService.getById('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('invite', () => {
    it('should create user in Cognito and database', async () => {
      const mockCognitoUser = { Username: 'cognito-sub-123' };
      const mockDbUser = {
        id: 'user-1',
        cognitoSub: 'cognito-sub-123',
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
        role: 'TEAM_MEMBER',
        status: 'PENDING_VERIFICATION',
      };

      (cognitoService.createUser as Mock).mockResolvedValue(mockCognitoUser);
      (cognitoService.updateUserAttributes as Mock).mockResolvedValue(undefined);
      (cognitoService.addUserToGroup as Mock).mockResolvedValue(undefined);
      (prisma.user.create as Mock).mockResolvedValue(mockDbUser);

      const result = await userService.invite({
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
        role: 'TEAM_MEMBER',
        clientId: 'client-1',
      });

      expect(cognitoService.createUser).toHaveBeenCalledWith('test@example.com');
      expect(cognitoService.updateUserAttributes).toHaveBeenCalledWith(
        'test@example.com',
        { tenantId: 'client-1' }
      );
      expect(result).toEqual(mockDbUser);
    });

    it('should throw error if Cognito creation fails', async () => {
      (cognitoService.createUser as Mock).mockResolvedValue(null);

      await expect(
        userService.invite({
          email: 'test@example.com',
          firstName: 'John',
          lastName: 'Doe',
          role: 'TEAM_MEMBER',
        })
      ).rejects.toThrow('Failed to create user in Cognito');
    });

    it('should not set tenantId if no clientId provided', async () => {
      const mockCognitoUser = { Username: 'cognito-sub-123' };

      (cognitoService.createUser as Mock).mockResolvedValue(mockCognitoUser);
      (prisma.user.create as Mock).mockResolvedValue({});

      await userService.invite({
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
        role: 'PLATFORM_ADMIN',
      });

      expect(cognitoService.updateUserAttributes).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('should update user', async () => {
      const existingUser = {
        id: 'user-1',
        email: 'test@example.com',
        role: 'TEAM_MEMBER',
      };

      (prisma.user.findUnique as Mock).mockResolvedValue(existingUser);
      (prisma.user.update as Mock).mockResolvedValue({
        ...existingUser,
        firstName: 'Jane',
      });

      await userService.update('user-1', { firstName: 'Jane' });

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: expect.objectContaining({ firstName: 'Jane' }),
      });
    });

    it('should update Cognito groups when role changes', async () => {
      const existingUser = {
        id: 'user-1',
        email: 'test@example.com',
        role: 'TEAM_MEMBER',
      };

      (prisma.user.findUnique as Mock).mockResolvedValue(existingUser);
      (prisma.user.update as Mock).mockResolvedValue({});

      await userService.update('user-1', { role: 'CLIENT_ADMIN' });

      expect(cognitoService.removeUserFromGroup).toHaveBeenCalledWith(
        'test@example.com',
        expect.any(String)
      );
      expect(cognitoService.addUserToGroup).toHaveBeenCalledWith(
        'test@example.com',
        expect.any(String)
      );
    });

    it('should throw error if user not found', async () => {
      (prisma.user.findUnique as Mock).mockResolvedValue(null);

      await expect(
        userService.update('non-existent', { firstName: 'Jane' })
      ).rejects.toThrow('User not found');
    });
  });

  describe('approve', () => {
    it('should approve user and enable in Cognito', async () => {
      const existingUser = {
        id: 'user-1',
        email: 'test@example.com',
        status: 'PENDING_VERIFICATION',
      };

      (prisma.user.findUnique as Mock).mockResolvedValue(existingUser);
      (prisma.user.update as Mock).mockResolvedValue({
        ...existingUser,
        status: 'ACTIVE',
      });

      await userService.approve('user-1', 'admin-user');

      expect(cognitoService.enableUser).toHaveBeenCalledWith('test@example.com');
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: expect.objectContaining({
          status: 'ACTIVE',
          approvedBy: 'admin-user',
        }),
      });
    });

    it('should throw error if user not found', async () => {
      (prisma.user.findUnique as Mock).mockResolvedValue(null);

      await expect(userService.approve('non-existent', 'admin')).rejects.toThrow(
        'User not found'
      );
    });
  });

  describe('disable', () => {
    it('should disable user in database and Cognito', async () => {
      const existingUser = {
        id: 'user-1',
        email: 'test@example.com',
        status: 'ACTIVE',
      };

      (prisma.user.findUnique as Mock).mockResolvedValue(existingUser);
      (prisma.user.update as Mock).mockResolvedValue({
        ...existingUser,
        status: 'DISABLED',
      });

      await userService.disable('user-1');

      expect(cognitoService.disableUser).toHaveBeenCalledWith('test@example.com');
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { status: 'DISABLED' },
      });
    });

    it('should throw error if user not found', async () => {
      (prisma.user.findUnique as Mock).mockResolvedValue(null);

      await expect(userService.disable('non-existent')).rejects.toThrow(
        'User not found'
      );
    });
  });

  describe('enable', () => {
    it('should enable user in database and Cognito', async () => {
      const existingUser = {
        id: 'user-1',
        email: 'test@example.com',
        status: 'DISABLED',
      };

      (prisma.user.findUnique as Mock).mockResolvedValue(existingUser);
      (prisma.user.update as Mock).mockResolvedValue({
        ...existingUser,
        status: 'ACTIVE',
      });

      await userService.enable('user-1');

      expect(cognitoService.enableUser).toHaveBeenCalledWith('test@example.com');
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { status: 'ACTIVE' },
      });
    });

    it('should throw error if user not found', async () => {
      (prisma.user.findUnique as Mock).mockResolvedValue(null);

      await expect(userService.enable('non-existent')).rejects.toThrow(
        'User not found'
      );
    });
  });
});
