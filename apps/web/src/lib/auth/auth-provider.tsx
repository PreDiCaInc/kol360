'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { Amplify } from 'aws-amplify';
import {
  signIn as amplifySignIn,
  signOut as amplifySignOut,
  signUp as amplifySignUp,
  confirmSignUp as amplifyConfirmSignUp,
  resetPassword as amplifyResetPassword,
  confirmResetPassword as amplifyConfirmResetPassword,
  confirmSignIn as amplifyConfirmSignIn,
  getCurrentUser,
  fetchAuthSession,
  fetchUserAttributes,
} from 'aws-amplify/auth';

// Configure Amplify
Amplify.configure({
  Auth: {
    Cognito: {
      userPoolId: process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID!,
      userPoolClientId: process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID!,
    },
  },
});

export interface AuthUser {
  sub: string;
  email: string;
  role: string;
  tenantId?: string;
  firstName?: string;
  lastName?: string;
}

interface SignInResult {
  isSignedIn: boolean;
  nextStep: 'DONE' | 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED' | string;
}

interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  signIn: (email: string, password: string) => Promise<SignInResult>;
  completeNewPassword: (newPassword: string, email: string) => Promise<void>;
  signUp: (email: string, password: string, firstName: string, lastName: string) => Promise<void>;
  confirmSignUp: (email: string, code: string) => Promise<void>;
  signOut: () => Promise<void>;
  getAccessToken: () => Promise<string | null>;
  forgotPassword: (email: string) => Promise<void>;
  resetPassword: (email: string, code: string, newPassword: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    checkAuth();
  }, []);

  async function checkAuth() {
    try {
      const currentUser = await getCurrentUser();
      const session = await fetchAuthSession();
      const attributes = await fetchUserAttributes();

      const accessToken = session.tokens?.accessToken;

      // Get role from custom attribute or from Cognito groups
      let role = accessToken?.payload['custom:role'] as string;

      if (!role) {
        // Check Cognito groups in the token
        const groups = accessToken?.payload['cognito:groups'] as string[] | undefined;
        if (groups?.includes('PLATFORM_ADMIN') || groups?.includes('platform-admins')) {
          role = 'PLATFORM_ADMIN';
        } else if (groups?.includes('CLIENT_ADMIN') || groups?.includes('client-admins')) {
          role = 'CLIENT_ADMIN';
        } else if (groups?.includes('TEAM_MEMBER') || groups?.includes('team-members')) {
          role = 'TEAM_MEMBER';
        } else {
          role = 'TEAM_MEMBER';
        }
      }

      setUser({
        sub: currentUser.userId,
        email: attributes.email || '',
        role,
        tenantId: accessToken?.payload['custom:tenant_id'] as string,
        firstName: attributes.given_name,
        lastName: attributes.family_name,
      });
    } catch {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }

  async function signIn(email: string, password: string): Promise<SignInResult> {
    try {
      // Clear any existing session before signing in to avoid conflicts
      try {
        await amplifySignOut();
      } catch {
        // Ignore errors if no session exists
      }

      const result = await amplifySignIn({ username: email, password });

      // Amplify v6 always returns { isSignedIn: boolean, nextStep: { signInStep: string, ... } }
      const signInStep = result.nextStep?.signInStep;

      // Check if user needs to set a new password (first login with temp password)
      if (signInStep === 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED') {
        return {
          isSignedIn: false,
          nextStep: 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED',
        };
      }

      // If sign-in is complete
      if (result.isSignedIn || signInStep === 'DONE') {
        await checkAuth();
        return {
          isSignedIn: true,
          nextStep: 'DONE',
        };
      }

      // Handle other challenge types - return the step so UI can handle if needed
      return {
        isSignedIn: result.isSignedIn,
        nextStep: signInStep || 'DONE',
      };
    } catch (error) {
      console.error('Sign in error:', error);
      throw error;
    }
  }

  async function completeNewPassword(newPassword: string, email: string) {
    try {
      // Fetch user's name from the API using email
      const apiUrl = process.env.NEXT_PUBLIC_API_URL;
      let userName = email.split('@')[0]; // Default fallback to email prefix

      try {
        const response = await fetch(`${apiUrl}/users/by-email/${encodeURIComponent(email)}`);
        if (response.ok) {
          const userData = await response.json();
          if (userData.firstName && userData.lastName) {
            userName = `${userData.firstName} ${userData.lastName}`;
          } else if (userData.firstName) {
            userName = userData.firstName;
          }
        }
      } catch {
        // If API call fails, use email prefix as fallback
        console.log('Could not fetch user name, using email prefix');
      }

      await amplifyConfirmSignIn({
        challengeResponse: newPassword,
        options: { userAttributes: { name: userName } },
      });
      await checkAuth();
    } catch (error) {
      console.error('Complete new password error:', error);
      throw error;
    }
  }

  async function signUp(email: string, password: string, firstName: string, lastName: string) {
    try {
      await amplifySignUp({
        username: email,
        password,
        options: {
          userAttributes: {
            email,
            given_name: firstName,
            family_name: lastName,
          },
        },
      });
    } catch (error) {
      console.error('Sign up error:', error);
      throw error;
    }
  }

  async function confirmSignUp(email: string, code: string) {
    try {
      await amplifyConfirmSignUp({ username: email, confirmationCode: code });
    } catch (error) {
      console.error('Confirm sign up error:', error);
      throw error;
    }
  }

  async function signOut() {
    try {
      await amplifySignOut();
      setUser(null);
    } catch (error) {
      console.error('Sign out error:', error);
      throw error;
    }
  }

  async function getAccessToken(): Promise<string | null> {
    try {
      const session = await fetchAuthSession();
      return session.tokens?.accessToken?.toString() || null;
    } catch {
      return null;
    }
  }

  async function forgotPassword(email: string) {
    try {
      await amplifyResetPassword({ username: email });
    } catch (error) {
      console.error('Forgot password error:', error);
      throw error;
    }
  }

  async function resetPassword(email: string, code: string, newPassword: string) {
    try {
      await amplifyConfirmResetPassword({
        username: email,
        confirmationCode: code,
        newPassword,
      });
    } catch (error) {
      console.error('Reset password error:', error);
      throw error;
    }
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        signIn,
        completeNewPassword,
        signUp,
        confirmSignUp,
        signOut,
        getAccessToken,
        forgotPassword,
        resetPassword,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
