import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Platform, Pressable, View } from 'react-native';
import { AudioModule, RecordingPresets, setAudioModeAsync, useAudioRecorder, useAudioRecorderState } from 'expo-audio';
import type { RecordingStatus } from 'expo-audio';
import { useApp } from '../store';
import { Icon, IconName, Txt, useAction } from './ui';
import { MediaView } from './media-view';
import { VoiceWaveform } from './voice-waveform';
import { browserVoiceFormat, preferredBrowserVoiceMime } from '../lib/voice-format';

export type VoiceDraft = { uri: string; mime: string; fileName?: string; kind: 'audio'; waveform: number[]; durationMs: number };
type Phase = 'starting' | 'recording' | 'paused' | 'stopping' | 'ready' | 'sending' | 'error' | 'discarding';
const LIMIT_MS = 60_000;
const OPTIONS = { ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true };

function downsample(levels: number[]) {
  if (levels.length <= 64) return [...levels];
  return Array.from({ length: 64 }, (_, index) => {
    const start = Math.floor(index * levels.length / 64);
    const end = Math.max(start + 1, Math.floor((index + 1) * levels.length / 64));
    return Math.max(...levels.slice(start, end));
  });
}
function clock(duration: number) {
  const seconds = Math.floor(Math.max(0, duration) / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
function RecorderControl({ icon, label, onPress, disabled = false, send = false }: { icon: IconName; label: string; onPress: () => void; disabled?: boolean; send?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => ({ width: 42, height: 42, borderRadius: send ? 16 : 21, alignItems: 'center', justifyContent: 'center', backgroundColor: send ? '#D2AE6D' : '#FFFFFF12', borderWidth: 1, borderColor: send ? '#D2AE6D' : '#FFFFFF25', opacity: disabled ? .4 : pressed ? .65 : 1 })}><Icon name={icon} color={send ? '#2D2464' : '#FFFFFF'} size={19}/></Pressable>;
}

export function VoiceRecorder({ onSend, onCancel }: { onSend: (draft: VoiceDraft) => Promise<void>; onCancel: () => void }) {
  const { colors, language, setError } = useApp(), kk = language === 'kk';
  const { busy, run } = useAction();
  const [phase, setPhase] = useState<Phase>('starting');
  const [elapsed, setElapsed] = useState(0), [levels, setLevels] = useState<number[]>([]);
  const [draft, setDraft] = useState<VoiceDraft | null>(null);
  const alive = useRef(true), phaseRef = useRef<Phase>('starting'), locked = useRef(false), prepared = useRef(false);
  const duration = useRef(0), samples = useRef<number[]>([]), lastSample = useRef(-1), sawRecording = useRef(false);
  const draftRef = useRef<VoiceDraft | null>(null), completedUrl = useRef<string | null>(null);
  const statusListener = useRef<(status: RecordingStatus) => void>(() => {});
  const [options] = useState(() => Platform.OS === 'web' && typeof MediaRecorder !== 'undefined'
    ? { ...OPTIONS, web: { ...OPTIONS.web, mimeType: preferredBrowserVoiceMime(mime => MediaRecorder.isTypeSupported(mime)) } }
    : OPTIONS);
  const recorder = useAudioRecorder(options, status => statusListener.current(status));
  const recording = useAudioRecorderState(recorder, 100);

  function transition(next: Phase) { phaseRef.current = next; if (alive.current) setPhase(next); }
  function rememberDuration(value: number) {
    if (Number.isFinite(value)) duration.current = Math.min(LIMIT_MS, Math.max(duration.current, value));
    if (alive.current) setElapsed(duration.current);
  }
  function makeDraft(uri: string): VoiceDraft {
    const result: VoiceDraft = { uri, mime: Platform.OS === 'web' ? 'audio/webm' : 'audio/mp4', kind: 'audio', waveform: downsample(samples.current), durationMs: Math.max(1, Math.round(duration.current)) };
    draftRef.current = result;
    if (alive.current) setDraft(result);
    return result;
  }
  async function completedDraft(result: VoiceDraft): Promise<VoiceDraft> {
    if (Platform.OS !== 'web') return result;
    const response = await fetch(result.uri);
    if (!response.ok) throw new Error(kk ? 'Дыбыс сақталмады. Қайта жазып көр.' : 'Аудио не сохранилось. Попробуйте ещё раз.');
    const blob = await response.blob();
    const format = browserVoiceFormat(blob.type, new Uint8Array(await blob.slice(0, 12).arrayBuffer()));
    if (!format) throw new Error(kk ? 'Бұл браузердің дыбыс пішімі қолдау таппайды. Басқа браузерде жазып көр.' : 'Формат записи этого браузера не поддерживается. Попробуйте другой браузер.');
    const completed = { ...result, ...format };
    draftRef.current = completed;
    if (alive.current) setDraft(completed);
    return completed;
  }
  async function releaseAudio() { await setAudioModeAsync({ allowsRecording: false }); }

  useEffect(() => { statusListener.current = status => {
    if (!alive.current || phaseRef.current === 'discarding') return;
    if (status.url) completedUrl.current = status.url;
    if (status.hasError || status.mediaServicesDidReset) {
      if (phaseRef.current === 'stopping') return;
      transition('error');
      setError(kk ? 'Дыбыс жазу үзілді. Қайта жазып көр.' : 'Запись прервалась. Попробуйте записать заново.');
      void releaseAudio().catch(() => {});
      return;
    }
    // Only an explicit finished event finalizes a capture. A pause never does.
    if (status.isFinished && status.url && (phaseRef.current === 'recording' || phaseRef.current === 'paused')) {
      if (duration.current >= LIMIT_MS - 1000) rememberDuration(LIMIT_MS);
      makeDraft(status.url);
      prepared.current = false;
      transition('ready');
      void releaseAudio().catch(() => {});
    }
  }; });

  async function start() {
    if (locked.current) return;
    locked.current = true;
    transition('starting');
    try {
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (!permission.granted) throw new Error(kk ? 'Микрофонға рұқсат қажет.' : 'Разрешите доступ к микрофону.');
      if (!alive.current) return;
      if (prepared.current) { await recorder.stop().catch(() => {}); prepared.current = false; }
      duration.current = 0; samples.current = []; lastSample.current = -1; sawRecording.current = false;
      draftRef.current = null; completedUrl.current = null;
      setDraft(null); setLevels([]); setElapsed(0);
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      if (!alive.current) { await releaseAudio(); return; }
      await recorder.prepareToRecordAsync();
      prepared.current = true;
      if (!alive.current) { await recorder.stop().catch(() => {}); await releaseAudio(); return; }
      recorder.record({ forDuration: LIMIT_MS / 1000 });
      if (AppState.currentState !== 'active') { recorder.pause(); transition('paused'); }
      else transition('recording');
    } catch (error) {
      transition('error');
      await releaseAudio().catch(() => {});
      throw error;
    } finally { locked.current = false; }
  }

  useEffect(() => {
    alive.current = true;
    void run(start);
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active' || phaseRef.current !== 'recording') return;
      // Preserve the same recording on interruption; resume requires a user tap.
      try { const current = recorder.getStatus(); rememberDuration(current.durationMillis); transition('paused'); if (current.isRecording) recorder.pause(); }
      catch { transition('error'); void releaseAudio().catch(() => {}); }
    });
    return () => {
      alive.current = false;
      phaseRef.current = 'discarding';
      subscription.remove();
      if (prepared.current) {
        try { void recorder.stop().catch(() => {}).finally(() => releaseAudio().catch(() => {})); }
        catch { void releaseAudio().catch(() => {}); }
      } else void releaseAudio().catch(() => {});
    };
  }, [recorder]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (phaseRef.current !== 'recording') return;
    if (recording.isRecording) {
      sawRecording.current = true;
      rememberDuration(recording.durationMillis);
      if (Number.isFinite(recording.metering) && recording.durationMillis > lastSample.current) {
        // Convert the recorder's real dBFS reading to a display level. Silence stays flat.
        const level = Math.min(1, Math.max(0, ((recording.metering ?? -60) + 60) / 60));
        samples.current = [...samples.current, level].slice(-600);
        lastSample.current = recording.durationMillis;
        setLevels(samples.current.slice(-48));
      }
    } else if (sawRecording.current && recording.durationMillis > 0) {
      rememberDuration(recording.durationMillis);
      // OS interruptions may pause without sending a completion event.
      transition('paused');
    }
  }, [recording]);

  async function togglePause() {
    if (locked.current) return;
    locked.current = true;
    try {
      if (phaseRef.current === 'recording') {
        const current = recorder.getStatus();
        rememberDuration(current.durationMillis);
        if (current.isRecording) recorder.pause();
        transition('paused');
      } else if (phaseRef.current === 'paused') {
        if (duration.current >= LIMIT_MS) return;
        await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
        if (!alive.current || AppState.currentState !== 'active') return;
        // Expo 58 resumes the same capture with its remaining original 60 s allowance.
        recorder.record();
        transition('recording');
      }
    } finally { locked.current = false; }
  }

  async function finish(): Promise<VoiceDraft> {
    if (draftRef.current) return completedDraft(draftRef.current);
    rememberDuration(recorder.getStatus().durationMillis);
    transition('stopping');
    await recorder.stop();
    prepared.current = false;
    await releaseAudio();
    const uri = completedUrl.current || recorder.uri;
    if (!uri) throw new Error(kk ? 'Дыбыс сақталмады. Қайта жазып көр.' : 'Аудио не сохранилось. Попробуйте ещё раз.');
    return completedDraft(makeDraft(uri));
  }
  async function send() {
    if (locked.current) return;
    locked.current = true;
    try {
      const result = await finish();
      if (!alive.current) return;
      transition('sending');
      await onSend(result);
      // Parent removes this recorder after successful upload; retain a safe fallback state.
      transition('ready');
    } catch (error) {
      transition(draftRef.current ? 'ready' : 'error');
      await releaseAudio().catch(() => {});
      throw error;
    } finally { locked.current = false; }
  }
  async function cancel() {
    if (locked.current) return;
    locked.current = true;
    transition('discarding');
    try {
      if (prepared.current) await recorder.stop().catch(() => {});
      prepared.current = false;
      await releaseAudio().catch(() => {});
      if (alive.current) onCancel();
    } finally { locked.current = false; }
  }

  const waiting = busy || phase === 'starting' || phase === 'stopping' || phase === 'sending' || phase === 'discarding';
  const canSend = !waiting && (phase === 'ready' || ((phase === 'recording' || phase === 'paused') && elapsed >= 350));

  return <View style={{ gap: 9, padding: 11, backgroundColor: '#30265E', borderRadius: 22, borderWidth: 1, borderColor: '#D2AE6D66' }}>
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
      <Txt bold size={10} color="#D2AE6D" style={{ letterSpacing: 2 }}>BIRGE / VOICE</Txt>
      <Txt size={10} color="#DDD6ED">{phase === 'recording' ? (kk ? 'Жазылып жатыр' : 'Идёт запись') : phase === 'paused' ? (kk ? 'Кідіртілді' : 'Пауза') : phase === 'ready' ? (kk ? 'Жіберуге дайын' : 'Готово к отправке') : phase === 'error' ? (kk ? 'Қайта жазу' : 'Повторите запись') : phase === 'sending' ? (kk ? 'Жіберілуде' : 'Отправка') : kk ? 'Дайындалуда' : 'Подготовка'}</Txt>
    </View>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
      <RecorderControl icon="trash" label={kk ? 'Дауыстық хабарламаны өшіру' : 'Удалить голосовое сообщение'} onPress={() => void run(cancel)} disabled={waiting}/>
      <View style={{ gap: 4, alignItems: 'center', minWidth: 36 }}>
        <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: phase === 'recording' ? '#F48D9F' : '#D2AE6D' }}/>
        <Txt bold size={12} color="#FFFFFF" style={{ fontVariant: ['tabular-nums'] }}>{clock(elapsed)}</Txt>
      </View>
      <View style={{ flex: 1, minWidth: 24 }}><VoiceWaveform levels={draft?.waveform || levels} progress={1} color="#D2AE6D" mutedColor="#8C80B0" height={34}/></View>
      {phase === 'error' ? <RecorderControl icon="mic" label={kk ? 'Дыбысты қайта жазу' : 'Записать заново'} onPress={() => void run(start)} disabled={waiting}/> : phase === 'ready' ? <View style={{ width: 42, alignItems: 'center' }}><Icon name="check" color="#D2AE6D" size={20}/></View> : waiting ? <View style={{ width: 42, alignItems: 'center' }}><ActivityIndicator size="small" color="#D2AE6D"/></View> : <RecorderControl icon={phase === 'recording' ? 'pause' : 'play'} label={phase === 'recording' ? (kk ? 'Дыбыс жазуды кідірту' : 'Приостановить запись') : (kk ? 'Дыбыс жазуды жалғастыру' : 'Продолжить запись')} onPress={() => void run(togglePause)}/>}
      <RecorderControl icon="send" label={kk ? 'Дауыстық хабарламаны жіберу' : 'Отправить голосовое сообщение'} onPress={() => void run(send)} disabled={!canSend} send/>
    </View>
    {draft && (phase === 'ready' || phase === 'sending') && <View style={{ borderRadius: 14, padding: 10, backgroundColor: colors.surface }}><MediaView uri={draft.uri} kind="audio" waveform={draft.waveform} durationMs={draft.durationMs}/></View>}
    <Txt size={10} color="#CFC5E4">{kk ? '60 секундқа дейін · кідіртіп, жалғастыруға болады' : 'До 60 секунд · можно поставить на паузу и продолжить'}</Txt>
  </View>;
}
