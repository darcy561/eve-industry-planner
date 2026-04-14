import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import useUsersStore from '../../../Zustand/usersStore';
import { Tooltip, Box } from '@mui/material';

export default function OfflineNotificationIcon() {
  const eveServerStatus = useUsersStore((state) => state.worldData.eveServerStatus);
  const isLoggedIn = useUsersStore((state) => state.account.isLoggedIn);

  if (isLoggedIn && !eveServerStatus) {
    return (
      <Tooltip
        title={
          <Box component="div" sx={{ textAlign: 'center' }}>
            Unable to connect to the Eve Online servers.
            <br />
            ESI data may be missing or outdated.
          </Box>
        }
        arrow
        placement="bottom"
      >
        <WarningAmberIcon
          color="error"
          sx={{
            animation: 'blink 1s infinite',
            '@keyframes blink': {
              '0%, 100%': { opacity: 1 },
              '50%': { opacity: 0.3 }
            }
          }}
        />
      </Tooltip>
    );
  }
  return null;
}