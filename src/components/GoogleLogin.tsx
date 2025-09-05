import React, { useState, useEffect } from 'react';
import { GoogleLogin as GoogleLoginButton } from '@react-oauth/google';
import { storeUserCredentials, getUserByEmail, queryUserByEmail } from '../config/dynamodb';
import { jwtDecode as jwt_decode } from 'jwt-decode';

interface GoogleLoginProps {
  onSuccess: (credentialResponse: any) => void;
  onError: () => void;
}

interface GoogleUserData {
  email: string;
  name: string;
  picture: string;
  sub: string;
}

const GoogleLogin: React.FC<GoogleLoginProps> = ({ onSuccess, onError }) => {
  const [isFedCMDisabled, setIsFedCMDisabled] = useState(false);

  // Check if FedCM is disabled
  useEffect(() => {
    const checkFedCM = () => {
      try {
        if ('IdentityCredential' in window) {
          const testCredential = new (window as any).IdentityCredential();
          return false; // FedCM is available
        }
        return true; // FedCM is not available
      } catch (e) {
        return true; // FedCM is disabled
      }
    };
    
    setIsFedCMDisabled(checkFedCM());
  }, []);

  const handleSuccess = async (credentialResponse: any) => {
    try {
      const decoded: GoogleUserData = jwt_decode(credentialResponse.credential);
      
      // Check if user already exists using both methods
      let existingUser = await getUserByEmail(decoded.email);
      
      if (!existingUser) {
        existingUser = await queryUserByEmail(decoded.email);
      }
      
      // Check if there was a pending action before login
      const pendingAction = localStorage.getItem('pendingAction');
      const role = pendingAction === 'createEvent' ? 'organizer' : 'attendee';
      
      console.log('GoogleLogin: User exists:', !!existingUser, 'Setting role:', role);
      
      // Get the phone number from the form if it exists
      const phoneNumber = localStorage.getItem('pendingPhoneNumber') || '';
      
      if (!existingUser) {
        // Create new user with role as organizer if pendingAction is createEvent, otherwise attendee
        await storeUserCredentials({
          userId: decoded.email, // Always use email as userId for consistency
          email: decoded.email,
          name: decoded.name,
          mobile: phoneNumber, // Use the phone number from the form
          role: role
        });
      } else if (pendingAction === 'createEvent') {
        // If user exists but they're creating an event, update their role
        await storeUserCredentials({
          userId: decoded.email, // Always use email as userId for consistency
          email: decoded.email,
          name: decoded.name,
          mobile: existingUser.mobile || phoneNumber, // Keep existing phone or use new one
          role: 'organizer'
        });
      }

      // Clear the pending phone number
      localStorage.removeItem('pendingPhoneNumber');

      // Call the original onSuccess callback
      onSuccess(credentialResponse);
    } catch (error) {
      console.error('Error processing Google login:', error);
      onError();
    }
  };

  const handleError = () => {
    console.error('Google login error');
    onError();
  };

  // Fallback authentication method
  const handleFallbackAuth = () => {
    console.log('Using fallback authentication method');
    // Open Google OAuth in a new window/tab
    const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${process.env.VITE_GOOGLE_CLIENT_ID}&redirect_uri=${encodeURIComponent(window.location.origin)}&response_type=token&scope=email profile&prompt=select_account`;
    window.open(googleAuthUrl, '_blank', 'width=500,height=600');
  };

  return (
    <div className="flex justify-center p-2 rounded-lg hover:bg-blue-50 transition-all duration-300">
      <div className="w-full max-w-xs bg-white shadow-lg rounded-lg overflow-hidden hover:shadow-xl transition-all duration-300 border border-blue-100">
        <div id="google-login-container">
          <GoogleLoginButton
            onSuccess={handleSuccess}
            onError={handleError}
            useOneTap={false}
            theme="outline"
            size="large"
            text="continue_with"
            shape="rectangular"
            width="100%"
            logo_alignment="left"
            fedcm={false}
            auto_select={false}
            cancel_on_tap_outside={true}
            prompt_parent_id="google-login-container"
          />
        </div>
        
        {/* Fallback button if FedCM is causing issues */}
        {isFedCMDisabled && (
          <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded">
            <p className="text-xs text-yellow-700 mb-2">Having trouble with Google Sign-In?</p>
            <button
              onClick={handleFallbackAuth}
              className="w-full px-3 py-2 bg-yellow-600 text-white text-sm rounded hover:bg-yellow-700 transition-colors"
            >
              Try Alternative Sign-In
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default GoogleLogin;