import React from 'react';
import { useNavigate } from 'react-router-dom';
import GoogleLogin from './GoogleLogin';
import { jwtDecode } from 'jwt-decode';

const Login = () => {
  const navigate = useNavigate();

  const handleLoginSuccess = async (credentialResponse: any) => {
    try {
      console.log('Login Success:', credentialResponse);
      
      // Check if user has events and redirect accordingly
      const decoded: any = jwtDecode(credentialResponse.credential);
      const email = decoded.email || '';
      
      try {
        const { getUserEvents } = await import('../config/eventStorage');
        const userEvents = await getUserEvents(email);
        if (userEvents && userEvents.length > 0) {
          navigate('/events');
        } else {
          navigate('/attendee-dashboard');
        }
      } catch (err) {
        console.error('Error fetching user events after login:', err);
        navigate('/attendee-dashboard');
      }
    } catch (error) {
      console.error('Error during login:', error);
      navigate('/attendee-dashboard');
    }
  };

  const handleLoginError = () => {
    console.error('Login Failed');
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-blue-50 flex items-center justify-center px-4">
      <div className="max-w-md w-full space-y-8 bg-white p-8 rounded-2xl shadow-xl">
        <div className="text-center">
          <h2 className="text-3xl font-bold text-gray-900">Welcome Back</h2>
          <p className="mt-2 text-sm text-gray-600">
            Sign in to continue to your account
          </p>
        </div>
        <div className="mt-8">
          <GoogleLogin onSuccess={handleLoginSuccess} onError={handleLoginError} />
        </div>
      </div>
    </div>
  );
};

export default Login; 