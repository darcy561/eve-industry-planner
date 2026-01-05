// Import Firebase scripts for service worker
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

// Firebase configuration - these will be replaced at runtime by start.sh
// If values are missing, Firebase initialization will be skipped
const firebaseConfig = {
  apiKey: "__FIREBASE_API_KEY__",
  authDomain: "__FIREBASE_AUTH_DOMAIN__",
  databaseURL: "__FIREBASE_DATABASE_URL__", 
  projectId: "__FIREBASE_PROJECT_ID__",
  storageBucket: "__FIREBASE_STORAGE_BUCKET__",
  messagingSenderId: "__FIREBASE_MESSAGING_SENDER_ID__",
  appId: "__FIREBASE_APP_ID__",
  measurementId: "__FIREBASE_MEASUREMENT_ID__",
  vapidKey: "__FIREBASE_VAPID_KEY__",
};

// Initialize Firebase only if config is valid
let app = null;
let messaging = null;

// Check if config has required values (not undefined, null, or empty string)
// After runtime replacement, undefined becomes the string "undefined" or empty string ""
const hasValidConfig = firebaseConfig.apiKey && 
                       firebaseConfig.projectId && 
                       firebaseConfig.appId &&
                       typeof firebaseConfig.apiKey === 'string' &&
                       typeof firebaseConfig.projectId === 'string' &&
                       typeof firebaseConfig.appId === 'string' &&
                       firebaseConfig.apiKey.trim().length > 0 &&
                       firebaseConfig.projectId.trim().length > 0 &&
                       firebaseConfig.appId.trim().length > 0 &&
                       firebaseConfig.apiKey !== 'undefined' &&
                       firebaseConfig.projectId !== 'undefined' &&
                       firebaseConfig.appId !== 'undefined';

if (hasValidConfig) {
  try {
    app = firebase.initializeApp(firebaseConfig);
    messaging = firebase.messaging();
  } catch (error) {
    console.error('[firebase-messaging-sw.js] Failed to initialize Firebase:', error);
  }
} else {
  console.warn('[firebase-messaging-sw.js] Firebase config missing or invalid, skipping initialization');
}

// Handle background messages (only if messaging is initialized)
if (messaging) {
  messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message:', payload);
  
  const notificationTitle = payload.notification?.title || 'New Message';
  const notificationOptions = {
    body: payload.notification?.body || 'You have a new message',
    icon: '/images/icon-192x192.png',
    badge: '/images/badge-72x72.png',
    tag: 'notification-tag',
    requireInteraction: true,
    actions: [
      {
        action: 'open',
        title: 'Open App'
      },
      {
        action: 'close',
        title: 'Close'
      }
    ]
  };

    self.registration.showNotification(notificationTitle, notificationOptions);
  });
}

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  console.log('[firebase-messaging-sw.js] Notification click received.');
  
  event.notification.close();
  
  if (event.action === 'open' || !event.action) {
    // Open the app
    event.waitUntil(
      clients.openWindow('/')
    );
  }
});

// Handle push events (fallback for non-FCM push messages)
self.addEventListener('push', (event) => {
  console.log('[firebase-messaging-sw.js] Push event received.');
  
  if (event.data) {
    const data = event.data.json();
    console.log('[firebase-messaging-sw.js] Push data:', data);
    
    const notificationTitle = data.notification?.title || 'New Message';
    const notificationOptions = {
      body: data.notification?.body || 'You have a new message',
      icon: '/images/icon-192x192.png',
      badge: '/images/badge-72x72.png',
      tag: 'notification-tag',
      requireInteraction: true,
      actions: [
        {
          action: 'open',
          title: 'Open App'
        },
        {
          action: 'close',
          title: 'Close'
        }
      ]
    };
    
    event.waitUntil(
      self.registration.showNotification(notificationTitle, notificationOptions)
    );
  }
});
