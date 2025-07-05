import { jwtDecode } from 'jwt-decode';

interface DecodedToken {
  email: string;
  exp: number;
  [key: string]: any;
}

// Token refresh interval (10000 minutes)
const TOKEN_REFRESH_INTERVAL = 10000 * 60 * 1000;

// Function to check if token needs refresh
export const shouldRefreshToken = (token: string): boolean => {
  try {
    const decoded = jwtDecode<DecodedToken>(token);
    const exp = decoded.exp * 1000; // Convert to milliseconds
    const now = Date.now();
    // Refresh if token expires in less than 10 minutes
    return exp - now < 10 * 60 * 1000;
  } catch {
    return true;
  }
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
    if (shouldRefreshToken(currentToken)) {
      try {
        const { token: newToken, expiresIn } = await refreshAuthToken(refreshTokenValue);
        
        // Update token in cookie
        const expirationDate = new Date();
        expirationDate.setTime(expirationDate.getTime() + expiresIn * 1000);
        document.cookie = `auth_token=${newToken}; expires=${expirationDate.toUTCString()}; path=/; secure; samesite=strict`;
        
        // Update token in localStorage
        localStorage.setItem('googleToken', newToken);
      } catch (error) {
        console.error('Failed to refresh token:', error);
        clearInterval(interval);
        // Handle logout or retry logic here
      }
    }
  }, TOKEN_REFRESH_INTERVAL);

  return interval;
};

// Function to clear token refresh interval
export const clearTokenRefresh = (interval: NodeJS.Timeout) => {
  clearInterval(interval);
}; 
