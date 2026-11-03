import { router } from 'expo-router';
import { Button, Empty } from '../src/components/ui';
export default function NotFound() { return <Empty title="404" subtitle="Бет табылмады / Страница не найдена"><Button onPress={() => router.replace('/')}>Birge →</Button></Empty>; }
