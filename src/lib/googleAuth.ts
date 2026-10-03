import { auth } from './firebase';
import {
  GoogleAuthProvider,
  signInWithPopup,
  onAuthStateChanged,
  User,
  signOut,
} from 'firebase/auth';

export const WORKSPACE_SCOPES = [
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/spreadsheets.readonly',
];

const provider = new GoogleAuthProvider();
WORKSPACE_SCOPES.forEach((scope) => provider.addScope(scope));
provider.setCustomParameters({
  prompt: 'consent',
});

// Flag to indicate if sign-in is underway
let isSigningIn = false;

// Strictly keep access token in memory (never localStorage/sessionStorage as required)
let cachedAccessToken: string | null = null;
let cachedGoogleUser: User | null = null;

export const initGoogleAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    cachedGoogleUser = user;
    if (user && cachedAccessToken) {
      if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
    } else {
      if (!isSigningIn) {
        cachedAccessToken = null;
        if (onAuthFailure) onAuthFailure();
      }
    }
  });
};

export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Google sign-in succeeded, but no access token was returned for Google Workspace APIs.');
    }

    cachedAccessToken = credential.accessToken;
    cachedGoogleUser = result.user;
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    console.error('Google Workspace Sign-In Error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const getAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken;
};

export const getGoogleUser = (): User | null => {
  return cachedGoogleUser || auth.currentUser;
};

export const logoutGoogle = async () => {
  try {
    await signOut(auth);
  } catch (e) {
    console.error('Error during Google sign out:', e);
  } finally {
    cachedAccessToken = null;
    cachedGoogleUser = null;
  }
};
