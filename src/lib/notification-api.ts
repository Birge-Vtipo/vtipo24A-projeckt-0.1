import { socialRequest } from './social-api';

export type NotificationPreferences = { messages: boolean; follows: boolean; logins: boolean };
export type BirgeNotification = {
  id: string; type: 'message' | 'follow' | 'login'; actor_id?: string; actor_name?: string;
  actor_avatar_url?: string; conversation_id?: string; message_id?: string;
  message_kind?: string; preview?: string; device_label?: string; session_id?: string;
  created_at: string; read_at: string | null;
};
export type NotificationInbox = { notifications: BirgeNotification[]; unread_count: number; preferences: NotificationPreferences };
export const defaultNotificationPreferences: NotificationPreferences = { messages: true, follows: true, logins: true };
export function notificationInbox() { return socialRequest<NotificationInbox>('notifications'); }
export function markNotificationsRead(ids?: string[]) { return socialRequest('notifications-read', ids ? { ids } : { all: true }); }
export function saveNotificationPreferences(preferences: NotificationPreferences) {
  return socialRequest<{ preferences: NotificationPreferences }>('notification-preferences', preferences);
}
