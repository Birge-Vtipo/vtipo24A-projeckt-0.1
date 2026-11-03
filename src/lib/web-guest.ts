import {Platform} from 'react-native';

// Only the published browser build enters anonymously. Native login is intact.
export const webGuestMode=Platform.OS==='web'&&process.env.EXPO_PUBLIC_WEB_GUEST==='1';
