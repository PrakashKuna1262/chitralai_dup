// Utility functions for authentication and user profile

/**
 * Generate user initials from email or name
 * @param email - User's email address
 * @param name - User's full name (optional)
 * @returns User initials (e.g., "MA" for "mounikaatmakuri123@gmail.com" or "Mounika Atmakuri")
 */
export const generateUserInitials = (email: string, name?: string): string => {
  // If name is provided, use it to generate initials
  if (name && name.trim()) {
    const nameParts = name.trim().split(' ');
    if (nameParts.length >= 2) {
      // Use first letter of first and last name
      return (nameParts[0][0] + nameParts[nameParts.length - 1][0]).toUpperCase();
    } else if (nameParts.length === 1) {
      // Use first two letters of single name
      return nameParts[0].substring(0, 2).toUpperCase();
    }
  }
  
  // Fallback to email-based initials
  const emailParts = email.split('@')[0]; // Get part before @
  if (emailParts.length >= 2) {
    // Use first two characters of email username
    return emailParts.substring(0, 2).toUpperCase();
  }
  
  // Final fallback
  return email.substring(0, 2).toUpperCase();
};

/**
 * Get user display name from email or full name
 * @param email - User's email address
 * @param name - User's full name (optional)
 * @returns Display name for the user
 */
export const getUserDisplayName = (email: string, name?: string): string => {
  if (name && name.trim()) {
    return name.trim();
  }
  
  // Extract name from email if no name provided
  const emailParts = email.split('@')[0];
  // Convert email username to title case (e.g., "mounikaatmakuri" -> "Mounikaatmakuri")
  return emailParts.charAt(0).toUpperCase() + emailParts.slice(1);
};
