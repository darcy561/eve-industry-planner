import React from 'react';
import { useFirebaseMessaging } from '../Hooks/useFirebaseMessaging';
import { Button, Card, CardContent, Typography, Alert, Chip } from '@mui/material';
import { Notifications, NotificationsOff } from '@mui/icons-material';

const NotificationSettings = () => {
  const { token, permission, isSupported, requestPermission } = useFirebaseMessaging();

  const handleRequestPermission = async () => {
    const success = await requestPermission();
    if (success) {
      console.log('Notification permission granted!');
    } else {
      console.log('Notification permission denied.');
    }
  };

  const testNotification = () => {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('Test Notification', {
        body: 'This is a test notification from your app!',
        icon: '/images/icon-192x192.png',
        tag: 'test-notification'
      });
    }
  };

  if (!isSupported) {
    return (
      <Card>
        <CardContent>
          <Alert severity="warning">
            Push notifications are not supported in this browser.
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          Push Notifications
        </Typography>
        
        <div style={{ marginBottom: '16px' }}>
          <Typography variant="body2" color="textSecondary">
            Permission Status:
          </Typography>
          <Chip 
            label={permission} 
            color={permission === 'granted' ? 'success' : permission === 'denied' ? 'error' : 'default'}
            size="small"
            style={{ marginLeft: '8px' }}
          />
        </div>

        {permission !== 'granted' && (
          <Button
            variant="contained"
            startIcon={<Notifications />}
            onClick={handleRequestPermission}
            style={{ marginBottom: '16px' }}
          >
            Enable Notifications
          </Button>
        )}

        {permission === 'granted' && (
          <Alert severity="success" style={{ marginBottom: '16px' }}>
            <Notifications />
            Notifications are enabled!
          </Alert>
        )}

        {permission === 'granted' && (
          <Button
            variant="outlined"
            onClick={testNotification}
            style={{ marginBottom: '16px' }}
          >
            Test Notification
          </Button>
        )}

        {token && (
          <div>
            <Typography variant="body2" color="textSecondary">
              Registration Token:
            </Typography>
            <Typography 
              variant="body2" 
              style={{ 
                wordBreak: 'break-all', 
                fontSize: '0.75rem',
                marginTop: '4px',
                padding: '8px',
                backgroundColor: '#f5f5f5',
                borderRadius: '4px'
              }}
            >
              {token}
            </Typography>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default NotificationSettings;
