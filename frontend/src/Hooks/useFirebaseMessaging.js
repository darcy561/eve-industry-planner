import { useState, useEffect } from 'react';
import { getRegistrationToken, onForegroundMessage } from '../firebase/messaging';

/**
 * Custom hook that provides Firebase Cloud Messaging (FCM) functionality for EVE Online industry planning.
 * 
 * This hook handles push notification management:
 * - Notification permission checking and requesting
 * - Registration token management for push notifications
 * - Foreground message handling and processing
 * - Browser compatibility checking for notifications
 * - Service worker integration for background messages
 * 
 * The messaging process:
 * 1. Checks browser support for notifications and service workers
 * 2. Requests notification permission from user
 * 3. Gets registration token for push notifications
 * 4. Sets up foreground message listener
 * 5. Handles incoming messages and notifications
 * 
 * @returns {Object} Object containing Firebase messaging functions
 * @returns {string|null} returns.token - Registration token for push notifications
 * @returns {string} returns.permission - Current notification permission status
 * @returns {boolean} returns.isSupported - Whether messaging is supported by browser
 * @returns {Function} returns.requestPermission - Manually request notification permission
 * 
 * @example
 * function NotificationManager() {
 *   const { token, permission, isSupported, requestPermission } = useFirebaseMessaging();
 * 
 *   const handleRequestPermission = async () => {
 *     const granted = await requestPermission();
 *     if (granted) {
 *       console.log("Notifications enabled");
 *     }
 *   };
 * 
 *   return (
 *     <div>
 *       <p>Permission: {permission}</p>
 *       <p>Supported: {isSupported ? "Yes" : "No"}</p>
 *       <button onClick={handleRequestPermission}>Enable Notifications</button>
 *     </div>
 *   );
 * }
 */
export const useFirebaseMessaging = () => {
  const [token, setToken] = useState(null);
  const [permission, setPermission] = useState('default');
  const [isSupported, setIsSupported] = useState(false);

  useEffect(() => {
    // Check if messaging is supported
    if ('Notification' in window && 'serviceWorker' in navigator) {
      setIsSupported(true);
      
      // Request notification permission
      const requestPermission = async () => {
        try {
          const permission = await Notification.requestPermission();
          setPermission(permission);
          
          if (permission === 'granted') {
            // Get registration token
            const token = await getRegistrationToken();
            setToken(token);
          }
        } catch (error) {
          console.error('Error requesting notification permission:', error);
        }
      };

      requestPermission();
    }
  }, []);

  // Handle foreground messages
  useEffect(() => {
    if (isSupported && permission === 'granted') {
      const unsubscribe = onForegroundMessage((payload) => {
        console.log('Message received in foreground:', payload);
        
        // You can customize how to handle foreground messages here
        // For example, show a toast notification or update UI
        if (payload.notification) {
          // Show a custom notification or update the UI
          console.log('Foreground notification:', payload.notification);
        }
      });

      return () => unsubscribe();
    }
  }, [isSupported, permission]);

  const requestPermission = async () => {
    if (!isSupported) return false;
    
    try {
      const permission = await Notification.requestPermission();
      setPermission(permission);
      
      if (permission === 'granted') {
        const token = await getRegistrationToken();
        setToken(token);
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error requesting notification permission:', error);
      return false;
    }
  };

  return {
    token,
    permission,
    isSupported,
    requestPermission
  };
};
