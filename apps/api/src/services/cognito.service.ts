import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminEnableUserCommand,
  AdminDisableUserCommand,
  AdminUpdateUserAttributesCommand,
  AdminAddUserToGroupCommand,
  AdminRemoveUserFromGroupCommand,
  AdminGetUserCommand,
} from '@aws-sdk/client-cognito-identity-provider';

const client = new CognitoIdentityProviderClient({
  region: process.env.COGNITO_REGION || 'us-east-1',
});

const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID!;

export class CognitoService {
  /**
   * Create a new user in Cognito (disabled by default)
   */
  async createUser(email: string, tempPassword?: string) {
    const command = new AdminCreateUserCommand({
      UserPoolId: USER_POOL_ID,
      Username: email,
      UserAttributes: [
        { Name: 'email', Value: email },
        { Name: 'email_verified', Value: 'true' },
      ],
      TemporaryPassword: tempPassword,
      MessageAction: tempPassword ? 'SUPPRESS' : undefined,
    });

    const result = await client.send(command);
    return result.User;
  }

  /**
   * Enable a user (after approval)
   */
  async enableUser(username: string) {
    const command = new AdminEnableUserCommand({
      UserPoolId: USER_POOL_ID,
      Username: username,
    });
    await client.send(command);
  }

  /**
   * Disable a user
   */
  async disableUser(username: string) {
    const command = new AdminDisableUserCommand({
      UserPoolId: USER_POOL_ID,
      Username: username,
    });
    await client.send(command);
  }

  /**
   * Update user's custom attributes
   */
  async updateUserAttributes(username: string, attributes: { role?: string; tenantId?: string }) {
    const userAttributes = [];

    if (attributes.role) {
      userAttributes.push({ Name: 'custom:role', Value: attributes.role });
    }
    if (attributes.tenantId) {
      userAttributes.push({ Name: 'custom:tenant_id', Value: attributes.tenantId });
    }

    if (userAttributes.length === 0) return;

    const command = new AdminUpdateUserAttributesCommand({
      UserPoolId: USER_POOL_ID,
      Username: username,
      UserAttributes: userAttributes,
    });
    await client.send(command);
  }

  /**
   * Add user to a Cognito group
   */
  async addUserToGroup(username: string, groupName: string) {
    const command = new AdminAddUserToGroupCommand({
      UserPoolId: USER_POOL_ID,
      Username: username,
      GroupName: groupName,
    });
    await client.send(command);
  }

  /**
   * Remove user from a Cognito group
   */
  async removeUserFromGroup(username: string, groupName: string) {
    const command = new AdminRemoveUserFromGroupCommand({
      UserPoolId: USER_POOL_ID,
      Username: username,
      GroupName: groupName,
    });
    await client.send(command);
  }

  /**
   * Get user details
   */
  async getUser(username: string) {
    const command = new AdminGetUserCommand({
      UserPoolId: USER_POOL_ID,
      Username: username,
    });
    return client.send(command);
  }

  /**
   * Map role to Cognito group
   */
  getRoleGroup(role: string): string {
    const groupMap: Record<string, string> = {
      PLATFORM_ADMIN: 'platform-admins',
      CLIENT_ADMIN: 'client-admins',
      TEAM_MEMBER: 'team-members',
    };
    return groupMap[role] || 'team-members';
  }
}

export const cognitoService = new CognitoService();
