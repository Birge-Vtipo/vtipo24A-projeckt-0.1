import { Feed } from '../src/components/feed';
import { useLocalSearchParams } from 'expo-router';
export default function Search() { const params = useLocalSearchParams(); return <Feed key={JSON.stringify(params)} />; }
