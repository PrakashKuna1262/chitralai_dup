import React, { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Mail, Phone, Calendar, Building, Hash, Image as ImageIcon, Edit, Save, X, Copy, Check,Camera,Shield,Clock,MapPin,Star,Users,FileText,Settings,ArrowLeft} from 'lucide-react';
import { UserContext } from '../App';
import { getUserByEmail, queryUserByEmail, updateUserData } from '../config/dynamodb';
import { getUserEvents, getEventsByOrganizerId, getEventsByUserId } from '../config/eventStorage';
import { getAllAttendeeImagesByUser } from '../config/attendeeStorage';

interface UserData {
  userId: string;
  email: string;
  name: string;
  mobile: string;
  role?: string;
  createdEvents?: string[];
  organizationName?: string;
  organizationCode?: string;
  organizationLogo?: string;
  createdAt?: string;
  updatedAt?: string;
}

interface EventData {
  id: string;
  name: string;
  date: string;
  description?: string;
  coverImage?: string;
  photoCount: number;
  videoCount: number;
  guestCount: number;
}

interface AttendeeImageData {
  userId: string;
  eventId: string;
  eventName?: string;
  selfieURL: string;
  matchedImages: string[];
  uploadedAt: string;
  lastUpdated: string;
}

const Profile: React.FC = () => {
  const navigate = useNavigate();
  const { userEmail, userRole } = useContext(UserContext);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [userEvents, setUserEvents] = useState<EventData[]>([]);
  const [attendeeImages, setAttendeeImages] = useState<AttendeeImageData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editedValue, setEditedValue] = useState<string>('');
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Statistics
  const [stats, setStats] = useState({
    totalEvents: 0,
    totalPhotos: 0,
    totalOrganizations: 0,
    memberSince: '',
    lastActive: ''
  });

  useEffect(() => {
    const fetchUserData = async () => {
      if (!userEmail) {
        setError('No user email found. Please log in.');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        // Fetch user data from DynamoDB
        let user = await getUserByEmail(userEmail);
        if (!user) {
          user = await queryUserByEmail(userEmail);
        }

        if (!user) {
          setError('User data not found');
          setLoading(false);
          return;
        }

        setUserData(user as UserData);

        // Store organization details in localStorage for use in dropdown and elsewhere
        localStorage.setItem('profileOrganizationDetails', JSON.stringify({
          organizationName: user.organizationName || '',
          organizationCode: user.organizationCode || '',
          organizationLogo: user.organizationLogo || ''
        }));

        // --- NEW LOGIC: Fetch all events for the user as in EventDashboard ---
        let allEvents: EventData[] = [];
        const userEvents = await getUserEvents(userEmail);
        const organizerEvents = await getEventsByOrganizerId(userEmail);
        const userIdEvents = await getEventsByUserId(userEmail);
        allEvents = [...userEvents];
        organizerEvents.forEach(orgEvent => {
          if (!allEvents.some(event => event.id === orgEvent.id)) {
            allEvents.push(orgEvent);
          }
        });
        userIdEvents.forEach(userIdEvent => {
          if (!allEvents.some(event => event.id === userIdEvent.id)) {
            allEvents.push(userIdEvent);
          }
        });
        setUserEvents(allEvents);
        // --- END NEW LOGIC ---

        // Fetch attendee images
        const attendeeData = await getAllAttendeeImagesByUser(userEmail);
        setAttendeeImages(attendeeData);

        // --- NEW LOGIC: Calculate stats from allEvents ---
        const totalEvents = allEvents.length;
        const totalPhotos = allEvents.reduce((sum, event) => sum + (event.photoCount || 0), 0);
        // --- END NEW LOGIC ---
        const totalOrganizations = user.organizationCode ? 1 : 0;
        const memberSince = user.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'Unknown';
        const lastActive = user.updatedAt ? new Date(user.updatedAt).toLocaleDateString() : 'Unknown';

        setStats({
          totalEvents,
          totalPhotos,
          totalOrganizations,
          memberSince,
          lastActive
        });

      } catch (err) {
        console.error('Error fetching user data:', err);
        setError('Failed to load user data');
      } finally {
        setLoading(false);
      }
    };

    fetchUserData();
  }, [userEmail]);

  const handleEdit = (field: string, currentValue: string) => {
    setEditingField(field);
    setEditedValue(currentValue);
  };

  const handleSave = async () => {
    if (!userData || !editingField) return;

    try {
      // Update user data in DynamoDB
      const updates: Partial<UserData> = {};
      if (editingField === 'name' || editingField === 'mobile') {
        updates[editingField] = editedValue;
      }
      
      const success = await updateUserData(userData.userId, updates);
      
      if (success) {
        // Update local state
        setUserData(prev => {
          if (!prev) return null;
          return {
            ...prev,
            ...updates,
            updatedAt: new Date().toISOString()
          };
        });
        
        setEditingField(null);
        setEditedValue('');
      } else {
        setError('Failed to update user data');
      }
    } catch (err) {
      console.error('Error updating user data:', err);
      setError('Failed to update user data');
    }
  };

  const handleCancel = () => {
    setEditingField(null);
    setEditedValue('');
  };

  const handleCopy = async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    } catch (err) {
      console.error('Failed to copy text:', err);
    }
  };

  const getRoleDisplayName = (role?: string) => {
    switch (role) {
      case 'organizer': return 'Event Organizer';
      case 'attendee': return 'Event Attendee';
      default: return 'User';
    }
  };

  const getRoleIcon = (role?: string) => {
    switch (role) {
      case 'organizer': return <Building className="h-4 w-4" />;
      case 'attendee': return <Users className="h-4 w-4" />;
      default: return <User className="h-4 w-4" />;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading your profile...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-500 text-6xl mb-4">⚠️</div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Error Loading Profile</h2>
          <p className="text-gray-600 mb-4">{error}</p>
          <button
            onClick={() => navigate('/')}
            className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors"
          >
            Go Home
          </button>
        </div>
      </div>
    );
  }

  if (!userData) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-gray-500 text-6xl mb-4">👤</div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Profile Not Found</h2>
          <p className="text-gray-600 mb-4">Unable to load your profile data.</p>
          <button
            onClick={() => navigate('/')}
            className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors"
          >
            Go Home
          </button>
        </div>
      </div>
    );
  }

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
              <h1 className="text-2xl font-bold text-gray-900">Your Profile</h1>
            </div>
            {userData.organizationCode && (
              <button
                onClick={() => navigate('/settings')}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <Settings className="h-4 w-4" />
                Settings
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column - Profile Info */}
          <div className="lg:col-span-1">
            {/* Profile Card */}
            <div className="bg-white rounded-xl shadow-sm border p-6 mb-6">
              <div className="text-center mb-6">
                <div className="relative inline-block">
                  <div className="h-24 w-24 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-2xl font-bold mx-auto mb-4">
                    {userData.name ? userData.name.charAt(0).toUpperCase() : userData.email.charAt(0).toUpperCase()}
                  </div>
                </div>
                <h2 className="text-xl font-bold text-gray-900">{userData.name || 'User'}</h2>
                <p className="text-gray-600">{userData.email}</p>
              </div>

              {/* Statistics */}
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="text-center p-3 bg-blue-50 rounded-lg">
                  <div className="text-2xl font-bold text-blue-600">{stats.totalEvents}</div>
                  <div className="text-xs text-gray-600">Events</div>
                </div>
                <div className="text-center p-3 bg-green-50 rounded-lg">
                  <div className="text-2xl font-bold text-green-600">{stats.totalPhotos}</div>
                  <div className="text-xs text-gray-600">Photos</div>
                </div>
                
              </div>

              {/* Member Since */}
              <div className="text-center text-sm text-gray-500">
                <Clock className="h-4 w-4 inline mr-1" />
                Member since {stats.memberSince}
              </div>
            </div>

           {/* Quick Actions */}
           {/*
            <div className="bg-white rounded-xl shadow-sm border p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h3>
              <div className="space-y-3">
                <button
                  onClick={() => navigate('/events')}
                  className="w-full flex items-center gap-3 p-3 text-left rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <Calendar className="h-5 w-5 text-blue-600" />
                  <span className="text-gray-700">My Events</span>
                </button>
                <button
                  onClick={() => navigate('/my-photos')}
                  className="w-full flex items-center gap-3 p-3 text-left rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <ImageIcon className="h-5 w-5 text-green-600" />
                  <span className="text-gray-700">My Photos</span>
                </button>
                <button
                  onClick={() => navigate('/my-organizations')}
                  className="w-full flex items-center gap-3 p-3 text-left rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <Building className="h-5 w-5 text-purple-600" />
                  <span className="text-gray-700">My Organizations</span>
                </button>
              </div>
            </div>
           */}
           </div>

          {/* Right Column - Detailed Information */}
          <div className="lg:col-span-2 space-y-6">
            {/* Personal Information */}
            <div className="bg-white rounded-xl shadow-sm border p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-gray-900">Personal Information</h3>
                <button
                  onClick={() => handleEdit('name', userData.name || '')}
                  className="text-blue-600 hover:text-blue-700 text-sm font-medium"
                >
                  <Edit className="h-4 w-4" />
                </button>
              </div>
              
              <div className="space-y-4">
                <div className="flex items-center justify-between py-3 border-b border-gray-100">
                  <div className="flex items-center gap-3">
                    <User className="h-5 w-5 text-gray-400" />
                    <span className="text-gray-600">Full Name</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {editingField === 'name' ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={editedValue}
                          onChange={(e) => setEditedValue(e.target.value)}
                          className="px-3 py-1 border border-gray-300 rounded-md text-sm"
                          autoFocus
                        />
                        <button
                          onClick={handleSave}
                          className="text-green-600 hover:text-green-700"
                        >
                          <Save className="h-4 w-4" />
                        </button>
                        <button
                          onClick={handleCancel}
                          className="text-red-600 hover:text-red-700"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ) : (
                      <span className="text-gray-900 font-medium">{userData.name || 'Not provided'}</span>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between py-3 border-b border-gray-100">
                  <div className="flex items-center gap-3">
                    <Mail className="h-5 w-5 text-gray-400" />
                    <span className="text-gray-600">Email Address</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-gray-900 font-medium">{userData.email}</span>
                    <button
                      onClick={() => handleCopy(userData.email, 'email')}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      {copiedField === 'email' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between py-3 border-b border-gray-100">
                  <div className="flex items-center gap-3">
                    <Phone className="h-5 w-5 text-gray-400" />
                    <span className="text-gray-600">Phone Number</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {editingField === 'mobile' ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="tel"
                          value={editedValue}
                          onChange={(e) => setEditedValue(e.target.value)}
                          className="px-3 py-1 border border-gray-300 rounded-md text-sm"
                          autoFocus
                        />
                        <button
                          onClick={handleSave}
                          className="text-green-600 hover:text-green-700"
                        >
                          <Save className="h-4 w-4" />
                        </button>
                        <button
                          onClick={handleCancel}
                          className="text-red-600 hover:text-red-700"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <span className="text-gray-900 font-medium">{userData.mobile || 'Not provided'}</span>
                        <button
                          onClick={() => handleEdit('mobile', userData.mobile || '')}
                          className="text-blue-600 hover:text-blue-700"
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/*<div className="flex items-center justify-between py-3 border-b border-gray-100">
                  <div className="flex items-center gap-3">
                    <Shield className="h-5 w-5 text-gray-400" />
                    <span className="text-gray-600">User Role</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {getRoleIcon(userData.role)}
                    <span className="text-gray-900 font-medium">{getRoleDisplayName(userData.role)}</span>
                  </div>
                </div>*/}

                {/* Remove the Last Updated block */}
                {/*
                <div className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-3">
                    <Calendar className="h-5 w-5 text-gray-400" />
                    <span className="text-gray-600">Last Updated</span>
                  </div>
                  <span className="text-gray-900 font-medium">
                    {userData.updatedAt ? new Date(userData.updatedAt).toLocaleDateString() : 'Unknown'}
                  </span>
                </div>
                */}
              </div>
            </div>

            {/* Organization Information */}
            {userData.organizationName || userData.organizationCode ? (
              <div className="bg-white rounded-xl shadow-sm border p-6">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-semibold text-gray-900">Organization</h3>
                  <Building className="h-5 w-5 text-purple-600" />
                </div>
                
                <div className="space-y-4">
                  {userData.organizationName && (
                    <div className="flex items-center justify-between py-3 border-b border-gray-100">
                      <div className="flex items-center gap-3">
                        <Building className="h-5 w-5 text-gray-400" />
                        <span className="text-gray-600">Organization Name</span>
                      </div>
                      <span className="text-gray-900 font-medium">{userData.organizationName}</span>
                    </div>
                  )}

                  {userData.organizationCode && (
                    <div className="flex items-center justify-between py-3 border-b border-gray-100">
                      <div className="flex items-center gap-3">
                        <Hash className="h-5 w-5 text-gray-400" />
                        <span className="text-gray-600">Organization Code</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-gray-900 font-medium">{userData.organizationCode}</span>
                        <button
                          onClick={() => handleCopy(userData.organizationCode!, 'orgCode')}
                          className="text-gray-400 hover:text-gray-600"
                        >
                          {copiedField === 'orgCode' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>
                  )}

                  {userData.organizationLogo && (
                    <div className="flex items-center justify-between py-3">
                      <div className="flex items-center gap-3">
                        <ImageIcon className="h-5 w-5 text-gray-400" />
                        <span className="text-gray-600">Organization Logo</span>
                      </div>
                      <img
                        src={userData.organizationLogo}
                        alt="Organization Logo"
                        className="h-8 w-8 rounded-full object-cover"
                      />
                    </div>
                  )}
                </div>
              </div>
            ) : null}

            

            {/* Raw Data Section (for debugging) */}
            
              
              
              </div>
            </div>
          </div>
        </div>
      
    
  );
};

export default Profile; 