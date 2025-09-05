import React, { createContext, useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, useParams, Navigate } from 'react-router-dom';
import { GoogleAuthConfig } from './config/GoogleAuthConfig';
import { Helmet } from 'react-helmet-async';
import SEO from './components/SEO';

import Navbar from './components/Navbar';
import Hero from './components/Hero';

import HowItWorks from './components/HowItWorks';
import FAQ from './components/FAQ';
import Footer from './components/Footer';
import UploadImage from './components/UploadImage';

import EventDashboard from './components/EventDashboard';
import EventDetail from './components/EventDetail';
import ViewEvent from './components/ViewEvent';
import AttendeeDashboard from './components/AttendeeDashboard';
import EventPhotos from './components/EventPhotos';
import MyPhotos from './components/MyPhotos';
import MyOrganizations from './components/MyOrganizations';
import OrganizationEvents from './components/OrganizationEvents';
import Profile from './components/Profile';
import Settings from './components/Settings';
import { queryUserByEmail, storeUserCredentials } from './config/dynamodb';
import { migrateLocalStorageToDb } from './config/eventStorage';
import { isSessionValid, updateLastActivity } from './config/auth';
import Login from './components/Login';
import Terms from './pages/Terms';
import PrivacyPolicy from './pages/PrivacyPolicy';


// Create a user context to manage authentication state
export const UserContext = createContext<{
  userEmail: string | null;
  userRole: string | null;
  setUserEmail: (email: string | null) => void;
  setUserRole: (role: string | null) => void;
}>({
  userEmail: null,
  userRole: null,
  setUserEmail: () => {},
  setUserRole: () => {}
});

const App = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);
  const [showNavbar, setShowNavbar] = React.useState(true);
  const [showSignInModal, setShowSignInModal] = React.useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(localStorage.getItem('userEmail'));
  const [userRole, setUserRole] = useState<string | null>(null);

  // Check session validity on app load
  useEffect(() => {
    const checkSessionValidity = () => {
      const email = localStorage.getItem('userEmail');
      if (email) {
        if (!isSessionValid()) {
          console.log('Initial session check: Session expired, clearing user data');
          localStorage.clear();
          setUserEmail(null);
          setUserRole(null);
        } else {
          console.log('Initial session check: Session valid, updating activity');
          updateLastActivity();
        }
      }
    };

    checkSessionValidity();
  }, []);

  // Ensure user exists in DynamoDB
  const ensureUserInDb = async (email: string) => {
    try {
      // Check if user exists
      const user = await queryUserByEmail(email);
      
      // If user doesn't exist, create default record
      if (!user) {
        console.log('Creating default user record in DynamoDB');
        
        // Get user info from localStorage if available
        let name = '';
        let mobile = '';
        
        const userProfileStr = localStorage.getItem('userProfile');
        if (userProfileStr) {
          try {
            const userProfile = JSON.parse(userProfileStr);
            name = userProfile.name || '';
          } catch (e) {
            console.error('Error parsing user profile from localStorage', e);
          }
        }
        
        mobile = localStorage.getItem('userMobile') || '';
        
        // Check if there was a pending action
        const pendingAction = localStorage.getItem('pendingAction');
        const role = pendingAction === 'createEvent' ? 'organizer' : 'attendee';
        
        // Create user with appropriate role
        await storeUserCredentials({
          userId: email,
          email,
          name,
          mobile,
          role: role
        });
        
        return role;
      }
      
      return user.role || 'attendee'; // Default to attendee if no role exists
    } catch (error) {
      console.error('Error ensuring user in DynamoDB:', error);
      return 'attendee'; // Default to attendee on error
    }
  };

  // Check user role on mount or when email changes
  useEffect(() => {
    const fetchUserRole = async () => {
      if (userEmail) {
        try {
          // Check if session is still valid
          if (!isSessionValid()) {
            console.log('Session expired, logging out user');
            setUserEmail(null);
            setUserRole(null);
            localStorage.clear();
            return;
          }
          
          // Update last activity
          updateLastActivity();
          
          // Migrate any existing localStorage data to DynamoDB
          await migrateLocalStorageToDb(userEmail);
          
          // Ensure user exists in DynamoDB and get role
          const role = await ensureUserInDb(userEmail);
          setUserRole(role);
          
        } catch (error) {
          console.error('Error fetching user role:', error);
          setUserRole('user'); // Default fallback
        }
      }
    };

    fetchUserRole();
  }, [userEmail]);

  return (
    <GoogleAuthConfig>
      <UserContext.Provider value={{ userEmail, userRole, setUserEmail, setUserRole }}>
        <Router>
          <Helmet>
            <title>chitralai</title>
            <meta name="description" content="chitralai helps event organizers and attendees easily upload, discover, and share photos using AI-powered face recognition and smart galleries." />
          </Helmet>
          {showSignInModal && <Login />}
          <div className="min-h-screen bg-white">
            {showNavbar && (
              <Navbar
                mobileMenuOpen={mobileMenuOpen}
                setMobileMenuOpen={setMobileMenuOpen}
                showSignInModal={showSignInModal}
                setShowSignInModal={setShowSignInModal}
              />
            )}
            <Routes>
              <Route path="/" element={
                <div className="animate-slideIn">
                  <SEO
                    title="chitralai - Event photo discovery made easy"
                    description="AI-powered event photo uploads, face recognition, and smart galleries for organizers and attendees."
                    canonicalPath="/"
                    image="/chitralai-t.png"
                  />
                  <Hero onShowSignIn={() => setShowSignInModal(true)} />
                  <HowItWorks />
                  <FAQ />
                </div>
              } />
              <Route path="/events" element={<div className="animate-slideIn"><SEO title="Events" description="Browse and manage your events on chitralai." canonicalPath="/events" /><EventDashboard setShowNavbar={setShowNavbar} /></div>} />
              <Route path="/event/:eventId" element={<div className="animate-slideIn"><SEO title="Event" description="View event details and photos on chitralai." /><EventDetail eventId={useParams().eventId || ''} /></div>} />
              <Route path="/attendee-dashboard" element={<div className="animate-slideIn"><SEO title="Attendee Dashboard" description="Access your personalized event photo dashboard." canonicalPath="/attendee-dashboard" /><AttendeeDashboard setShowSignInModal={setShowSignInModal} /></div>} />
              <Route path="/event-photos/:eventId" element={<div className="animate-slideIn"><SEO title="Event Photos" description="Explore photos from your event." /><EventPhotos /></div>} />
              <Route path="/my-photos" element={<div className="animate-slideIn"><SEO title="My Photos" description="Your personal photo gallery on chitralai." canonicalPath="/my-photos" /><MyPhotos /></div>} />
              <Route path="/upload" element={<div className="animate-slideIn"><SEO title="Upload Photos" description="Upload event photos to chitralai securely and quickly." canonicalPath="/upload" /><UploadImage /></div>} />
              <Route path="/upload-image" element={<div className="animate-slideIn"><SEO title="Upload Photos" description="Upload event photos to chitralai securely and quickly." canonicalPath="/upload-image" /><UploadImage /></div>} />
              
              <Route path="/view-event/:eventId" element={<div className="animate-slideIn"><ViewEventWrapper /></div>} />
              <Route path="/my-organizations" element={<div className="animate-slideIn"><MyOrganizations setShowSignInModal={setShowSignInModal} /></div>} />
              <Route path="/profile" element={<div className="animate-slideIn"><Profile /></div>} />
              <Route path="/settings" element={<div className="animate-slideIn"><Settings /></div>} />
              
              <Route path="/organization/:organizationCode" element={
                <div className="animate-slideIn">
                  <SEO title="Organization" description="View organization events on chitralai." />
                  <OrganizationEvents 
                    organizationCode={useParams().organizationCode || ''} 
                    organizationName="" 
                    onBack={() => window.history.back()} 
                  />
                </div>
              } />
              <Route path="/terms" element={<div className="animate-slideIn"><Terms /></div>} />
              <Route path="/privacy" element={<div className="animate-slideIn"><PrivacyPolicy /></div>} />
            </Routes>
            <Footer />
          </div>
        </Router>
      </UserContext.Provider>
    </GoogleAuthConfig>
  );
};

const ViewEventWrapper = () => {
  const { eventId } = useParams();
  
  // If there's no eventId, redirect to home
  if (!eventId) {
    return <Navigate to="/" replace />;
  }
  
  return <ViewEvent eventId={eventId} />;
};

export default App;
