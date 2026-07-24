import { useEffect, useMemo, useState } from 'react';
import {
  audioEngine,
  getRecordedAudioDiagnostics,
  playRecordedCue,
  preloadRecordedAudio,
  RECORDED_CUE_IDS,
  type AudioEngineSnapshot,
  type RecordedCueId,
} from '../../audio';
import {
  getBGMState,
  previewBGMTrack,
  stopBGM,
  type BGMTrackId,
} from '../../utils/musicManager';

const GROUP_LABELS: Record<string, string> = {
  footstep: '足音',
  impact: '衝撃・材質',
  ui: 'UI',
  scifi: 'SF・乗り物',
  jingle: '報酬・クリア',
};

const BGM_TRACKS: Array<{ id: BGMTrackId; label: string }> = [
  { id: 'exploration', label: '探索' },
  { id: 'forest', label: '森林' },
  { id: 'battle', label: '戦闘' },
  { id: 'boss', label: 'ボス' },
];

export default function AudioLab() {
  const [snapshot, setSnapshot] = useState<AudioEngineSnapshot>(() => audioEngine.getSnapshot());
  const [loaded, setLoaded] = useState(false);
  const [underwater, setUnderwater] = useState(false);
  const [underground, setUnderground] = useState(false);
  const groups = useMemo(() => Object.entries(
    RECORDED_CUE_IDS.reduce<Record<string, RecordedCueId[]>>((result, id) => {
      const group = id.split('.')[0];
      (result[group] ??= []).push(id);
      return result;
    }, {}),
  ), []);

  useEffect(() => {
    const timer = window.setInterval(() => setSnapshot(audioEngine.getSnapshot()), 250);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    audioEngine.setEnvironment({ underwater, underground, dimension: 'overworld' });
  }, [underwater, underground]);

  const unlock = async (): Promise<void> => {
    const ok = await audioEngine.unlock();
    if (!ok) return;
    await preloadRecordedAudio(RECORDED_CUE_IDS);
    setLoaded(true);
    setSnapshot(audioEngine.getSnapshot());
  };

  const diagnostics = getRecordedAudioDiagnostics();
  const bgmState = getBGMState();

  return (
    <main style={{ minHeight: '100vh', padding: '24px clamp(16px, 4vw, 54px)', color: '#f7fbff', background: 'radial-gradient(circle at top, #17314a 0%, #081019 48%, #04070b 100%)', fontFamily: 'system-ui, sans-serif' }}>
      <header style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 22 }}>
        <div>
          <div style={{ color: '#7edcff', fontWeight: 900, letterSpacing: '0.12em', fontSize: 12 }}>HALCRAFT AUDIO LAB</div>
          <h1 style={{ margin: '5px 0 0', fontSize: 'clamp(28px, 5vw, 52px)' }}>手描き冒険映画の音を磨く</h1>
          <p style={{ maxWidth: 760, color: '#b9c8d5', lineHeight: 1.6 }}>録音テイク、素材差、ダッキング、洞窟・水中フィルターを一つずつ確認する開発専用サーフェスです。</p>
        </div>
        <button type="button" onClick={() => void unlock()} style={{ minHeight: 48, padding: '10px 20px', borderRadius: 14, border: '1px solid #7edcff88', background: loaded ? '#1f6b4a' : '#14517a', color: '#fff', fontWeight: 900, cursor: 'pointer' }}>
          {loaded ? '✓ 全バンク読込済み' : '音響を開始して全テイク読込'}
        </button>
      </header>

      <section aria-label="音響状態" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10, marginBottom: 20 }}>
        {[
          ['AudioContext', snapshot.state],
          ['録音キュー', String(diagnostics.cueCount)],
          ['読込バッファ', String(diagnostics.cachedBuffers)],
          ['同時発音', String(diagnostics.activeVoices)],
          ['ダッキング', String(snapshot.activeDucks)],
        ].map(([label, value]) => (
          <div key={label} style={{ padding: 14, borderRadius: 13, border: '1px solid #ffffff16', background: '#ffffff0b' }}>
            <div style={{ color: '#8fa8bb', fontSize: 11, fontWeight: 800 }}>{label}</div>
            <div style={{ fontSize: 20, fontWeight: 900, marginTop: 4 }}>{value}</div>
          </div>
        ))}
      </section>

      <section style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 22 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 12, background: '#ffffff0b' }}>
          <input type="checkbox" checked={underground} onChange={(event) => setUnderground(event.currentTarget.checked)} /> 洞窟の残響
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 12, background: '#ffffff0b' }}>
          <input type="checkbox" checked={underwater} onChange={(event) => setUnderwater(event.currentTarget.checked)} /> 水中フィルター
        </label>
      </section>

      <section aria-label="適応型BGM" style={{ padding: 16, borderRadius: 17, border: '1px solid #ffffff16', background: '#07111bcc', marginBottom: 16 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 12 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18 }}>適応型 BGM</h2>
            <div style={{ marginTop: 4, color: '#8fa8bb', fontSize: 12 }}>
              再生中: {bgmState.title ?? '停止'}
            </div>
          </div>
          <button type="button" onClick={stopBGM} style={{ minHeight: 40, padding: '7px 13px', borderRadius: 10, border: '1px solid #ff9f9f55', background: '#52222c', color: '#fff', cursor: 'pointer' }}>
            ■ 停止
          </button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8 }}>
          {BGM_TRACKS.map((track) => (
            <button
              key={track.id}
              type="button"
              aria-pressed={bgmState.currentTrack === track.id}
              onClick={() => previewBGMTrack(track.id)}
              style={{ minHeight: 42, padding: '8px 11px', borderRadius: 10, border: '1px solid #bfa6ff55', background: bgmState.currentTrack === track.id ? '#5a3d82' : '#2b2440', color: '#f4edff', cursor: 'pointer' }}
            >
              ▶ {track.label}
            </button>
          ))}
        </div>
      </section>

      <div style={{ display: 'grid', gap: 16 }}>
        {groups.map(([group, ids]) => (
          <section key={group} style={{ padding: 16, borderRadius: 17, border: '1px solid #ffffff16', background: '#07111bcc' }}>
            <h2 style={{ margin: '0 0 12px', fontSize: 18 }}>{GROUP_LABELS[group] ?? group}</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8 }}>
              {ids.map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => playRecordedCue(id, id.startsWith('impact') || id.startsWith('scifi') ? { position: { x: Math.random() * 10 - 5, y: 1, z: -5 } } : undefined)}
                  style={{ minHeight: 42, padding: '8px 11px', borderRadius: 10, border: '1px solid #7edcff33', background: '#12324a', color: '#eaf8ff', fontFamily: 'monospace', fontSize: 12, cursor: 'pointer', textAlign: 'left' }}
                >
                  ▶ {id}
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
