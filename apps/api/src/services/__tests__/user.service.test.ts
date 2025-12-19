import { describe, it, expect, vi, beforeEach } from 'vitest';

// Use vi.hoisted for variables needed in vi.mock factories
const mockCognitoService = vi.hoisted(() => ({
  createUser: vi.fn(),
  updateUserAttributes: vi.fn(),
  addUserToGroup: vi.fn(),
  removeUserFromGroup: vi.fn(),
  enableUser: vi.fn(),
  disableUser: vi.fn(),
  getRoleGroup: vi.fn((role: string) => {
    const map: Record<string, string> = {
      PLATFORM_ADMIN: 'platform-admins',
      CLIENT_ADMIN: 'client-admins',
      TEAM_MEMBER: 'team-members',
    };
    return map[role] || 'team-members';
  }),
}));

// Mock prisma with inline mock object
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
  cognitoService: mockCognitoService,
}));

import { UserService } from '../user.service';
import { prisma } from '../../lib/prisma';

// Helper functions
function createMockUser(overrides = {}) {
  return {
    id: 'user-1',
    email: 'user@example.com',
    firstName: 'Test',
    lastName: 'User',
    role: 'TEAM_MEMBER',
    status: 'ACTIVE',
    clientId: 'client-1',
    cognitoSub: 'cognito-sub-123',
    createdAt: new Date(),
    ...overrides,
  };
}

function createMockClient(overrides = {}) {
  return {
    id: 'client-1',
    name: 'Test Client',
    ...overrides,
  };
}

describe('UserService', () => {
  let service: UserService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new UserService();
  });

  describe('list', () => {
    it('should return paginated users', async () => {
      vi.mocked(prisma.user.count).mockResolvedValue(50);
      vi.mocked(prisma.user.findMany).mockResolvedValue([
        {
          ...createMockUser(),
          client: { id: 'client-1', name: 'Test Client' },
        },
      ] as any);

      const result = await service.list({
        page: 1,
        limit: 20,
      });

      expect(result.items).toHaveLength(1);
      expect(result.pagination).toEqual({
        page: 1,
        limit: 20,
        total: 50,
        pages: 3,
      });
    });

    it('should filter by clientId', async () => {
      vi.mocked(prisma.user.count).mockResolvedValue(10);
      vi.mocked(prisma.user.findMany).mockResolvedValue([]);

      await service.list({
        clientId: 'client-1',
        page: 1,
        limit: 20,
      });

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { clientId: 'client-1' },
        })
      );
    });

    it('should filter by role', async () => {
      vi.mocked(prisma.user.count).mockResolvedValue(5);
      vi.mocked(prisma.user.findMany).mockResolvedValue([]);

      await service.list({
        role: 'CLIENT_ADMIN',
        page: 1,
        limit: 20,
      });

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { role: 'CLIENT_ADMIN' },
        })
      );
    });

    it('should filter by status', async () => {
      vi.mocked(prisma.user.count).mockResolvedValue(8);
      vi.mocked(prisma.user.findMany).mockResolvedValue([]);

      await service.list({
        status: 'ACTIVE',
        page: 1,
        limit: 20,
      });

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: 'ACTIVE' },
        })
      );
    });
  });

  describe('getById', () => {
    it('should return user with client and audit logs', async () => {
      const user = {
        ...createMockUser(),
        client: createMockClient(),
        auditLogs: [{ id: 'log-1', action: 'user.created' }],
      };

      vi.mocked(prisma.user.findUnique).mockResolvedValue(user as any);

      const result = await service.getById('user-1');

      expect(result).toEqual(user);
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        include: expect.objectContaining({
          client: true,
          auditLogs: expect.any(Object),
        }),
      });
    });

    it('should return null for non-existent user', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

      const result = await service.getById('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('invite', () => {
    const inviteData = {
      email: 'newuser@example.com',
      firstName: 'New',
      lastName: 'User',
      role: 'CLIENT_ADMIN' as const,
      clientId: 'client-1',
    };

    it('should create user in Cognito and database', async () => {
      mockCognitoService.createUser.mockResolvedValue({ Username: 'cognito-sub-123' });
      mockCognitoService.updateUserAttributes.mockResolvedValue({});
      mockCognitoService.addUserToGroup.mockResolvedValue({});
      vi.mocked(prisma.user.create).mockResolvedValue(
        createMockUser({
          email: inviteData.email,
          cognitoSub: 'cognito-sub-123',
          status: 'PENDING_VERIFICATION',
        }) as any
      );

      const result = await service.invite(inviteData);

      expect(mockCognitoService.createUser).toHaveBeenCalledWith('newuser@example.com');
      expect(mockCognitoService.updateUserAttributes).toHaveBeenCalledWith(
        'newuser@example.com',
        { tenantId: 'client-1' }
      );
      expect(mockCognitoService.addUserToGroup).toHaveBeenCalledWith(
        'newuser@example.com',
        'client-admins'
      );
      expect(result.status).toBe('PENDING_VERIFICATION');
    });

    it('should throw error if Cognito user creation fails', async () => {
      mockCognitoService.createUser.mockResolvedValue(null);

      await expect(service.invite(inviteData)).rejects.toThrow(
        'Failed to create user in Cognito'
      );
    });

    it('should not update tenant attribute for users without clientId', async () => {
      mockCognitoService.createUser.mockResolvedValue({ Username: 'cognito-sub-123' });
      mockCognitoService.addUserToGroup.mockResolvedValue({});
      vi.mocked(prisma.user.create).mockResolvedValue(createMockUser() as any);

      await service.invite({
        ...inviteData,
        clientId: undefined,
        role: 'PLATFORM_ADMIN',
      });

      expect(mockCognitoService.updateUserAttributes).not.toHaveBeenCalled();
    });

    it('should add user to correct role group', async () => {
      mockCognitoService.createUser.mockResolvedValue({ Username: 'cognito-sub-123' });
      mockCognitoService.addUserToGroup.mockResolvedValue({});
      vi.mocked(prisma.user.create).mockResolvedValue(createMockUser() as any);

      await service.invite({
        ...inviteData,
        role: 'PLATFORM_ADMIN',
        clientId: undefined,
      });

      expect(mockCognitoService.addUserToGroup).toHaveBeenCalledWith(
        'newuser@example.com',
        'platform-admins'
      );
    });
  });

  describe('update', () => {
    it('should throw error for non-existent user', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

      await expect(
        service.update('nonexistent', { firstName: 'Updated' })
      ).rejects.toThrow('User not found');
    });

    it('should update user without changing role', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(
        createMockUser({ role: 'TEAM_MEMBER' }) as any
      );
      vi.mocked(prisma.user.update).mockResolvedValue(
        createMockUser({ firstName: 'Updated' }) as any
      );

      await service.update('user-1', { firstName: 'Updated' });

      expect(mockCognitoService.removeUserFromGroup).not.toHaveBeenCalled();
      expect(mockCognitoService.addUserToGroup).not.toHaveBeenCalled();
      expect(prisma.user.update).toHaveBeenCalled();
    });

    it('should update Cognito groups when role changes', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(
        createMockUser({ email: 'user@example.com', role: 'TEAM_MEMBER' }) as any
      );
      mockCognitoService.removeUserFromGroup.mockResolvedValue({});
      mockCognitoService.addUserToGroup.mockResolvedValue({});
      vi.mocked(prisma.user.update).mockResolvedValue(
        createMockUser({ role: 'CLIENT_ADMIN' }) as any
      );

      await service.update('user-1', { role: 'CLIENT_ADMIN' });

      expect(mockCognitoService.removeUserFromGroup).toHaveBeenCalledWith(
        'user@example.com',
        'team-members'
      );
      expect(mockCognitoService.addUserToGroup).toHaveBeenCalledWith(
        'user@example.com',
        'client-admins'
      );
    });
  });

  describe('approve', () => {
    it('should throw error for non-existent user', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

      await expect(service.approve('nonexistent', 'admin-1')).rejects.toThrow(
        'User not found'
      );
    });

    it('should enable user in Cognito and update status', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(
        createMockUser({ email: 'user@example.com', status: 'PENDING_VERIFICATION' }) as any
      );
      mockCognitoService.enableUser.mockResolvedValue({});
      vi.mocked(prisma.user.update).mockResolvedValue(
        createMockUser({ status: 'ACTIVE', approvedBy: 'admin-1' }) as any
      );

      const result = await service.approve('user-1', 'admin-1');

      expect(mockCognitoService.enableUser).toHaveBeenCalledWith('user@example.com');
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: {
          status: 'ACTIVE',
          approvedAt: expect.any(Date),
          approvedBy: 'admin-1',
        },
      });
      expect(result.status).toBe('ACTIVE');
    });
  });

  describe('disable', () => {
    it('should throw error for non-existent user', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

      await expect(service.disable('nonexistent')).rejects.toThrow('User not found');
    });

    it('should disable user in Cognito and update status', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(
        createMockUser({ email: 'user@example.com', status: 'ACTIVE' }) as any
      );
      mockCognitoService.disableUser.mockResolvedValue({});
      vi.mocked(prisma.user.update).mockResolvedValue(
        createMockUser({ status: 'DISABLED' }) as any
      );

      const result = await service.disable('user-1');

      expect(mockCognitoService.disableUser).toHaveBeenCalledWith('user@example.com');
      expect(result.status).toBe('DISABLED');
    });
  });

  describe('enable', () => {
    it('should throw error for non-existent user', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

      await expect(service.enable('nonexistent')).rejects.toThrow('User not found');
    });

    it('should enable user in Cognito and update status', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(
        createMockUser({ email: 'user@example.com', status: 'DISABLED' }) as any
      );
      mockCognitoService.enableUser.mockResolvedValue({});
      vi.mocked(prisma.user.update).mockResolvedValue(
        createMockUser({ status: 'ACTIVE' }) as any
      );

      const result = await service.enable('user-1');

      expect(mockCognitoService.enableUser).toHaveBeenCalledWith('user@example.com');
      expect(result.status).toBe('ACTIVE');
    });
  });
});
