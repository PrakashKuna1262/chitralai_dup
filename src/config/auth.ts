import { jwtDecode } from 'jwt-decode';

interface DecodedToken {
  email: string;
  exp: number;
  [key: string]: any;
}

// Session timeout: 10 hours (in milliseconds)
const SESSION_TIMEOUT = 10 * 60 * 60 * 1000;

// Token refresh interval: Check every 5 minutes
const TOKEN_REFRESH_INTERVAL = 5 * 60 * 1000;

// Function to check if token needs refresh
export const shouldRefreshToken = (token: string): boolean => {
  try {
    const decoded = jwtDecode<DecodedToken>(token);
    const exp = decoded.exp * 1000; // Convert to milliseconds
    const now = Date.now();
    // Refresh if token expires in less than 30 minutes
    return exp - now < 30 * 60 * 1000;
  } catch {
    return true;
  }
};

// Function to check if session is still valid
export const isSessionValid = (): boolean => {
  try {
    const lastActivity = localStorage.getItem('lastActivity');
    if (!lastActivity) {
      console.log('[Session] No last activity timestamp found');
      return false;
    }
    
    const lastActivityTime = parseInt(lastActivity);
    const now = Date.now();
    const timeDiff = now - lastActivityTime;
    const hoursRemaining = (SESSION_TIMEOUT - timeDiff) / (1000 * 60 * 60);
    
    console.log(`[Session] Last activity: ${new Date(lastActivityTime).toLocaleString()}`);
    console.log(`[Session] Time since last activity: ${Math.round(timeDiff / (1000 * 60))} minutes`);
    console.log(`[Session] Hours remaining: ${hoursRemaining.toFixed(2)}`);
    
    // Check if session has expired (10 hours)
    const isValid = timeDiff < SESSION_TIMEOUT;
    console.log(`[Session] Session valid: ${isValid}`);
    
    return isValid;
  } catch (error) {
    console.error('[Session] Error checking session validity:', error);
    return false;
  }
};

// Function to update last activity timestamp
export const updateLastActivity = (): void => {
  const timestamp = Date.now();
  localStorage.setItem('lastActivity', timestamp.toString());
  console.log(`[Session] Updated last activity: ${new Date(timestamp).toLocaleString()}`);
};

// Function to refresh token
export const refreshAuthToken = async (refreshTokenValue: string): Promise<{ token: string; expiresIn: number }> => {
  try {
    const response = await fetch('/api/refresh-token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ refreshToken: refreshTokenValue }),
    });

    if (!response.ok) {
      throw new Error('Failed to refresh token');
    }

    const data = await response.json();
    return {
      token: data.token,
      expiresIn: data.expiresIn,
    };
  } catch (error) {
    console.error('Error refreshing token:', error);
    throw error;
  }
};

// Function to set up token refresh interval
export const setupTokenRefresh = (currentToken: string, refreshTokenValue: string) => {
  const interval = setInterval(async () => {
    // Check if session is still valid first
    if (!isSessionValid()) {
      console.log('Session expired, clearing token refresh');
      clearInterval(interval);
      return;
    }
    
    if (shouldRefreshToken(currentToken)) {
      try {
        const { token: newToken, expiresIn } = await refreshAuthToken(refreshTokenValue);
        
        // Update token in cookie
        const expirationDate = new Date();
        expirationDate.setTime(expirationDate.getTime() + expiresIn * 1000);
        document.cookie = `auth_token=${newToken}; expires=${expirationDate.toUTCString()}; path=/; secure; samesite=strict`;
        
        // Update token in localStorage
        localStorage.setItem('googleToken', newToken);
        
        // Update last activity
        updateLastActivity();
      } catch (error) {
        console.error('Failed to refresh token:', error);
        // Don't clear interval on refresh failure, just log the error
        // This prevents automatic logout when refresh fails
      }
    }
  }, TOKEN_REFRESH_INTERVAL);

  return interval;
};

// Function to clear token refresh interval
export const clearTokenRefresh = (interval: NodeJS.Timeout) => {
  clearInterval(interval);
}; 
