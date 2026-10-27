import { Feed } from '../src/components/feed';
import { PhoneAuth } from '../src/components/phone-auth';
import { useApp } from '../src/store';
import { webGuestMode } from '../src/lib/web-guest';
export default function Home() { const app = useApp(); return !webGuestMode && app.phoneAuthEnabled && !app.phoneUser ? <PhoneAuth /> : <Feed home />; }
