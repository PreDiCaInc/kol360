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
import { fromSSO } from '@aws-sdk/credential-providers';

// Create client lazily to pick up fresh credentials on each request
// This ensures SSO token refresh is respected
function getClient(): CognitoIdentityProviderClient {
  return new CognitoIdentityProviderClient({
    region: process.env.COGNITO_REGION || 'us-east-1',
    credentials: process.env.AWS_PROFILE
      ? fromSSO({ profile: process.env.AWS_PROFILE })
      : undefined, // Use default credential chain (env vars, etc.)
  });
}

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

    const result = await getClient().send(command);
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
    await getClient().send(command);
  }

  /**
   * Disable a user
   */
  async disableUser(username: string) {
    const command = new AdminDisableUserCommand({
      UserPoolId: USER_POOL_ID,
      Username: username,
    });
    await getClient().send(command);
  }

  /**
   * Update user's custom attributes
   * Note: Role is managed via Cognito groups, not custom attributes
   */
  async updateUserAttributes(username: string, attributes: { tenantId?: string }) {
    const userAttributes = [];

    if (attributes.tenantId) {
      // Use hyphen as per the Cognito schema: custom:tenant-id
      userAttributes.push({ Name: 'custom:tenant-id', Value: attributes.tenantId });
    }

    if (userAttributes.length === 0) return;

    const command = new AdminUpdateUserAttributesCommand({
      UserPoolId: USER_POOL_ID,
      Username: username,
      UserAttributes: userAttributes,
    });
    await getClient().send(command);
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
    await getClient().send(command);
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
    await getClient().send(command);
  }

  /**
   * Get user details
   */
  async getUser(username: string) {
    const command = new AdminGetUserCommand({
      UserPoolId: USER_POOL_ID,
      Username: username,
    });
    return getClient().send(command);
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
