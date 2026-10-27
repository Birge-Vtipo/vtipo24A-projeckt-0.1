import React, { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useApp } from '../src/store';
import { Button, Icon, Notice, Txt } from '../src/components/ui';
import { ConnectionProof } from '../src/lib/connection-link';
import { webGuestMode } from '../src/lib/web-guest';

export default function Connect() {
  const params = useLocalSearchParams();
  if (webGuestMode) return <Redirect href="/" />;
  const proof = { server: params.server, issued: params.issued, signature: params.signature };
  return <Connection key={JSON.stringify(proof)} proof={proof as ConnectionProof} />;
}
function Connection({ proof }: { proof: ConnectionProof }) {
  const app = useApp(), kk = app.language === 'kk';
  const apply = useRef(app.changePhoneServer);
  const [input] = useState(proof);
  const request = useRef<Promise<void> | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    // Signature verification happens before any request to the linked server.
    request.current ??= apply.current(input);
    void request.current.then(() => { if (active) setState('ready'); }).catch(e => {
      if (active) { setError((e as Error).message); setState('error'); }
    });
    return () => { active = false; };
  }, [input]);
  return <View style={{ maxWidth: 460, width: '100%', alignSelf: 'center', padding: 24, gap: 20, borderRadius: 24, backgroundColor: app.colors.surface }}>
    <Icon name={state === 'ready' ? 'check' : 'wifi'} size={36} color={app.colors.primary} />
    <Txt bold size={26}>{state === 'ready' ? (kk ? 'Қосылым дайын' : 'Подключение готово') : (kk ? 'Birge-ге қосылу' : 'Подключение к Birge')}</Txt>
    {state === 'loading' && <Txt>{kk ? 'Қосылып жатыр…' : 'Подключаемся…'}</Txt>}
    {state === 'error' && <Notice error>{error}</Notice>}
    {state === 'ready' && <Notice>{kk ? 'Қосылым автоматты түрде сақталды. Енді логин мен құпиясөз арқылы кіруге болады.' : 'Подключение сохранено автоматически. Можно войти с логином и паролем.'}</Notice>}
    <Button disabled={state === 'loading'} onPress={() => router.replace(app.phoneUser ? '/profile' : '/auth')}>{kk ? 'Жалғастыру' : 'Продолжить'}</Button>
  </View>;
}
