import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, User, Settings, LogOut, HelpCircle, Menu, X } from 'lucide-react';
import { generateUserInitials, getUserDisplayName } from '../utils/authUtils';
import { useNavigate } from 'react-router-dom';

// Add global styles for animations
const addGlobalStyles = () => {
  if (typeof document !== 'undefined' && !document.getElementById('profile-dropdown-styles')) {
    const style = document.createElement('style');
    style.id = 'profile-dropdown-styles';
    style.textContent = `
      @keyframes fadeIn {
        from { opacity: 0; transform: translateY(-5px); }
        to { opacity: 1; transform: translateY(0); }
      }
      
      .profile-dropdown-enter {
        animation: fadeIn 0.15s ease-out forwards;
      }
      
      .profile-dropdown-exit {
        animation: fadeIn 0.15s ease-out reverse;
      }
    `;
    document.head.appendChild(style);
  }
};

// Initialize styles when component is imported
if (typeof window !== 'undefined') {
  addGlobalStyles();
}

interface UserProfile {
  name: string;
  email: string;
  picture?: string;
  mobile?: string;
}

interface ProfileDropdownProps {
  userProfile: UserProfile;
  onLogout: () => void;
  onProfileClick?: () => void;
  onSettingsClick?: () => void;
  organizationCode?: string;
}

const ProfileDropdown: React.FC<ProfileDropdownProps> = ({
  userProfile,
  onLogout,
  onProfileClick,
  onSettingsClick,
  organizationCode
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const userInitials = generateUserInitials(userProfile.email, userProfile.name);
  const displayName = getUserDisplayName(userProfile.email, userProfile.name);

  const handleProfileClick = () => {
    setIsOpen(false);
    onProfileClick?.();
  };

  const handleSettingsClick = () => {
    setIsOpen(false);
    onSettingsClick?.();
  };

  const handleLogoutClick = () => {
    setIsOpen(false);
    onLogout();
  };

  const navigate = useNavigate();

  // Initialize styles on component mount
  useEffect(() => {
    addGlobalStyles();
  }, []);

  // Fetch latest organization details from localStorage.profileOrganizationDetails to match Profile page logic
  let showAccountSettings = false;
  try {
    const orgDetails = JSON.parse(localStorage.getItem('profileOrganizationDetails') || '{}');
    if (orgDetails.organizationCode) {
      showAccountSettings = true;
    }
  } catch (e) {}

  return (
    <div className="relative inline-block" ref={dropdownRef} style={{ position: 'relative' }}>
      {/* Mobile Menu Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="md:hidden p-2 rounded-full hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50"
        aria-expanded={isOpen}
        aria-haspopup="true"
        aria-label="Toggle user menu"
      >
        {isOpen ? (
          <X className="h-6 w-6 text-gray-700" />
        ) : (
          <Menu className="h-6 w-6 text-gray-700" />
        )}
      </button>

      {/* Desktop Profile Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="hidden md:flex items-center justify-center p-1 rounded-full hover:bg-blue-50 transition-all duration-200 group focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50"
        aria-expanded={isOpen}
        aria-haspopup="true"
        aria-label="User menu"
      >
        {/* Avatar */}
        <div className="relative">
          <div className="relative h-10 w-10 rounded-full overflow-hidden flex items-center justify-center bg-white border-2 border-gray-200 group-hover:border-blue-300 transition-colors duration-200">
            {userProfile.picture ? (
              <img
                src={userProfile.picture}
                alt={displayName}
                className="h-full w-full object-cover"
                onError={(e) => {
                  // Fallback to initials if image fails to load
                  const target = e.target as HTMLImageElement;
                  target.style.display = 'none';
                  target.nextElementSibling?.classList.remove('hidden');
                }}
              />
            ) : null}
            <div 
              className={`${userProfile.picture ? 'hidden' : 'flex'} h-full w-full items-center justify-center bg-white`}
              style={{
                background: 'linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%)',
              }}
            >
              <span className="text-sm font-semibold text-gray-700">
                {userInitials}
              </span>
            </div>
          </div>
        </div>

        {/* Dropdown Arrow */}
        <ChevronDown 
          className={`h-4 w-4 text-gray-400 transition-transform duration-200 ${
            isOpen ? 'rotate-180 text-blue-500' : 'group-hover:text-gray-600'
          }`}
          aria-hidden="true"
        />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <>
          {/* Mobile Backdrop */}
          <div 
            className="fixed inset-0 bg-black bg-opacity-50 z-40 md:hidden"
            onClick={() => setIsOpen(false)}
            aria-hidden="true"
          />
          
          {/* Dropdown Content */}
          <div 
            className="fixed bottom-0 left-0 right-0 md:absolute md:left-auto md:right-0 md:bottom-auto md:top-full md:mt-2 w-full md:w-56 lg:w-64 rounded-t-2xl md:rounded-lg shadow-2xl md:shadow-xl bg-white ring-1 ring-gray-100 overflow-hidden z-50 animate-fadeIn transform md:translate-x-0 md:translate-y-0 transition-transform duration-200 ease-in-out"
            style={{
              right: '-10px',  // Adjust this value to move dropdown more to the left
              transformOrigin: 'top right',
              maxWidth: 'calc(100vw - 1rem)'
            }}
            role="menu"
            aria-orientation="vertical"
            aria-labelledby="user-menu-button"
            tabIndex={-1}
          >
          <div className="py-1.5">
            {/* Menu Items */}
            <div className="py-1.5">
              {/* User Info Section */}
              <div className="px-4 py-2 border-b border-gray-100">
                <div className="font-medium text-gray-900">{displayName}</div>
                <div className="text-xs text-gray-500">{userProfile.email}</div>
              </div>

              <button
                onClick={() => {
                  handleProfileClick();
                  navigate('/profile');
                  setIsOpen(false);
                }}
                className="flex w-full items-center px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors duration-150"
                role="menuitem"
                tabIndex={-1}
              >
                <User className="mr-3 h-5 w-5 text-blue-500" />
                <span>Your Profile</span>
              </button>
              {showAccountSettings && (
                <button
                  onClick={() => {
                    handleSettingsClick();
                    navigate('/settings');
                    setIsOpen(false);
                  }}
                  className="flex w-full items-center px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors duration-150"
                  role="menuitem"
                  tabIndex={-1}
                >
                  <Settings className="mr-3 h-5 w-5 text-purple-500" />
                  <span>Account Settings</span>
                </button>
              )}
              
              
              
              <div className="border-t border-gray-100 my-1"></div>
              
              <button
                onClick={handleLogoutClick}
                className="flex w-full items-center px-6 py-3 text-base md:text-sm text-red-600 hover:bg-red-50 transition-colors duration-150 group"
                role="menuitem"
                tabIndex={-1}
              >
                <span className="p-1 mr-2.5 rounded-full bg-red-50 group-hover:bg-red-100 transition-colors">
                  <LogOut className="h-4 w-4 text-red-500" />
                </span>
                <span className="font-medium">Sign out</span>
              </button>
            </div>
          </div>
        </div>
      </>
      )}
    </div>
  );
};

// Add global styles for animations
const styles = `
  .animate-fadeIn {
    animation: fadeIn 0.2s ease-out forwards;
  }
  
  @keyframes fadeIn {
    from { 
      opacity: 0;
      transform: translateY(10px);
    }
    to { 
      opacity: 1;
      transform: translateY(0);
    }
  }
`;

// Add styles to the document head
if (typeof document !== 'undefined') {
  const styleElement = document.createElement('style');
  styleElement.textContent = styles;
  document.head.appendChild(styleElement);
}

export default ProfileDropdown;