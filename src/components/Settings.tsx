import React, { useContext, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Settings as SettingsIcon, User, Mail, Lock, Trash2, Bell, Smartphone, Download, Link as LinkIcon, Moon, Globe, Users, Building, HelpCircle, MessageSquare, Shield, Sun, Upload
} from 'lucide-react';
import { UserContext } from '../App';
import { updateUserData, getUserByEmail } from '../config/dynamodb';
import { s3ClientPromise, getOrganizationLogoPath, getOrganizationLogoUrl, ensureFolderStructure, validateEnvVariables, getOrganizationFolderPath } from '../config/aws';
import { PutObjectCommand } from '@aws-sdk/client-s3';

const Settings: React.FC = () => {
  const navigate = useNavigate();
  const { userEmail, userRole, setUserRole } = useContext(UserContext);
  const [showOrgForm, setShowOrgForm] = useState(false);
  const [orgName, setOrgName] = useState('');
  const [orgLogoFile, setOrgLogoFile] = useState<File | null>(null);
  const [orgError, setOrgError] = useState<string | null>(null);
  const [orgSuccess, setOrgSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [branding, setBranding] = useState(false);
  const [brandingLoading, setBrandingLoading] = useState(false);
  const [brandingError, setBrandingError] = useState<string | null>(null);

  // Helper to get branding value safely
  const getBrandingValue = (user: any) => (user && typeof user.branding === 'boolean' ? user.branding : false);

  // Fetch and set branding from DB
  const fetchAndSetBranding = async () => {
    if (!userEmail) {
      setBranding(false);
      return;
    }
    try {
      const user = await getUserByEmail(userEmail);
      setCurrentUser(user);
      const brandingValue = getBrandingValue(user);
      setBranding(brandingValue);
      setBrandingError(null);
      
      // Update localStorage with the branding value from DB
      localStorage.setItem('branding', JSON.stringify(brandingValue));
      
      // Also update userProfile in localStorage if it exists
      const userProfileStr = localStorage.getItem('userProfile');
      if (userProfileStr) {
        try {
          const userProfile = JSON.parse(userProfileStr);
          userProfile.branding = brandingValue;
          localStorage.setItem('userProfile', JSON.stringify(userProfile));
        } catch (e) {
          console.error('Error updating userProfile in localStorage:', e);
        }
      }
    } catch (err) {
      setBrandingError('Failed to fetch branding status.');
      setBranding(false);
    }
  };

  React.useEffect(() => {
    fetchAndSetBranding();
  }, [userEmail, userRole]);

  const isOrganizer = currentUser && currentUser.role === 'organizer';

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.type.startsWith('image/')) {
        setOrgLogoFile(file);
        setOrgError(null);
        // Store logo as data URL in localStorage for watermarking
        const reader = new FileReader();
        reader.onload = function(ev) {
          if (ev.target && typeof ev.target.result === 'string') {
            localStorage.setItem('orgLogoDataUrl', ev.target.result);
          }
        };
        reader.readAsDataURL(file);
      } else {
        setOrgError('Please upload an image file');
      }
    }
  };

  const handleBecomeOrganizer = async (e: React.FormEvent) => {
    e.preventDefault();
    setOrgError(null);
    setOrgSuccess(false);
    setIsSubmitting(true);
    if (!orgName.trim()) {
      setOrgError('Organization name is required.');
      setIsSubmitting(false);
      return;
    }
    if (!orgLogoFile) {
      setOrgError('Organization logo is required.');
      setIsSubmitting(false);
      return;
    }
    try {
      if (!userEmail) throw new Error('No user email');
      // Upload logo to S3
      await ensureFolderStructure(userEmail);
      const s3Key = getOrganizationLogoPath(userEmail, orgLogoFile.name);
      const fileBuffer = await orgLogoFile.arrayBuffer();
      const uploadCommand = new PutObjectCommand({
        Bucket: (await validateEnvVariables()).bucketName,
        Key: s3Key,
        Body: new Uint8Array(fileBuffer),
        ContentType: orgLogoFile.type,
        ACL: 'public-read'
      });
      await (await s3ClientPromise).send(uploadCommand);
      const logoUrl = await getOrganizationLogoUrl(userEmail, orgLogoFile.name);
      // Update user in DynamoDB
      await updateUserData(userEmail, {
        organizationName: orgName.trim(),
        organizationLogo: logoUrl,
        role: 'organizer',
      });
      setUserRole('organizer');
      setOrgSuccess(true);
      setShowOrgForm(false);
      // Re-fetch user data from DynamoDB to update currentUser
      const updatedUser = await getUserByEmail(userEmail);
      setCurrentUser(updatedUser);
    } catch (err: any) {
      setOrgError('Failed to update organization info.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete Organization handler
  const handleDeleteOrganization = async () => {
    if (!userEmail) return;
    setIsSubmitting(true);
    setOrgError(null);
    setOrgSuccess(false);
    try {
      // Remove organization fields and set role to attendee
      await updateUserData(userEmail, {
        organizationName: undefined,
        organizationLogo: undefined,
        role: 'attendee',
      });
      setUserRole('attendee');
      // Re-fetch user data
      const updatedUser = await getUserByEmail(userEmail);
      setCurrentUser(updatedUser);
      setOrgSuccess(true);
    } catch (err) {
      setOrgError('Failed to delete organization.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Remove the custom API call and use direct DB update
  const handleBrandingToggle = async () => {
    if (!userEmail || brandingLoading) return;
    setBrandingLoading(true);
    setBrandingError(null);
    try {
      // Always fetch latest before toggling
      const user = await getUserByEmail(userEmail);
      const currentBranding = getBrandingValue(user);
      const newBranding = !currentBranding;
      console.log('Toggling branding:', { userEmail, currentBranding, newBranding });
      await updateUserData(userEmail, { branding: newBranding });
      // Re-fetch after update
      let updatedUser = await getUserByEmail(userEmail);
      let updatedBranding = getBrandingValue(updatedUser);
      console.log('After update, branding in DB:', updatedBranding, updatedUser);
      // Retry once if not boolean
      if (typeof updatedBranding !== 'boolean') {
        updatedUser = await getUserByEmail(userEmail);
        updatedBranding = getBrandingValue(updatedUser);
      }
      setBranding(updatedBranding);
      
      // Update localStorage userProfile with branding value
      const userProfileStr = localStorage.getItem('userProfile');
      if (userProfileStr) {
        try {
          const userProfile = JSON.parse(userProfileStr);
          userProfile.branding = updatedBranding;
          localStorage.setItem('userProfile', JSON.stringify(userProfile));
        } catch (e) {
          console.error('Error updating userProfile in localStorage:', e);
        }
      }
      
      // Also store branding separately in localStorage for easy access
      localStorage.setItem('branding', JSON.stringify(updatedBranding));
      
    } catch (err) {
      setBrandingError('Failed to update branding status.');
    } finally {
      setBrandingLoading(false);
      // Force a re-fetch to ensure UI is in sync
      fetchAndSetBranding();
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 pt-24">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center">
              <button
                onClick={() => navigate(-1)}
                className="mr-4 p-2 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <ArrowLeft className="h-5 w-5 text-gray-600" />
              </button>
              <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Account Section */}
         

        {/* Notifications Section */}
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2"><Bell className="h-5 w-5" /> Notifications</h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3"><Mail className="h-4 w-4 text-gray-400" /> Email Alerts</div>
              <button className="text-blue-600 hover:underline">Manage</button>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3"><Smartphone className="h-4 w-4 text-gray-400" /> SMS Alerts</div>
              <button className="text-blue-600 hover:underline">Manage</button>
            </div>
          </div>
        </div>

        {/* Privacy Section */}
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2"><Lock className="h-5 w-5" /> Privacy & Security</h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3"><LinkIcon className="h-4 w-4 text-gray-400" /> Connected Accounts</div>
              <button className="text-blue-600 hover:underline">Manage</button>
            </div>
            
            
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3"><Shield className="h-4 w-4 text-gray-400" /> Session Management</div>
              <button className="text-blue-600 hover:underline">View</button>
            </div>
            <div className="flex items-center gap-3"><a href="/privacy" className="text-blue-600 hover:underline flex items-center"><Shield className="h-4 w-4 mr-1" /> Privacy Policy</a></div>
            <div className="flex items-center gap-3"><a href="/terms" className="text-blue-600 hover:underline flex items-center"><Shield className="h-4 w-4 mr-1" /> Terms of Service</a></div>
          </div>
        </div>

       
        {/* Support Section */}
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2"><HelpCircle className="h-5 w-5" /> Branding & Support</h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3"><HelpCircle className="h-4 w-4 text-blue-400" /> Branding</div>
              <button
                className={`relative w-12 h-6 rounded-full border transition-colors duration-200 focus:outline-none ${branding ? 'bg-blue-600 border-blue-600' : 'bg-gray-300 border-gray-300'}`}
                onClick={handleBrandingToggle}
                disabled={brandingLoading}
                aria-pressed={branding}
                aria-label="Toggle branding"
                type="button"
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 ${branding ? 'translate-x-6' : 'translate-x-0'}`}
                  style={{ transform: branding ? 'translateX(24px)' : 'translateX(0)' }}
                />
                {brandingLoading && (
                  <span className="absolute inset-0 flex items-center justify-center">
                    <svg className="animate-spin h-4 w-4 text-blue-800" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                    </svg>
                  </span>
                )}
              </button>
              {brandingError && (
                <div className="text-red-500 text-xs mt-1">{brandingError}</div>
              )}
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3"><MessageSquare className="h-4 w-4 text-gray-400" /> Send Feedback</div>
              <button className="text-blue-600 hover:underline">Send</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;