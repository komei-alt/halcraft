// 設定メニュー
// 描画負荷・ライティング・HUD表示をゲーム内で調整する

import { useEffect, type ChangeEvent, type CSSProperties } from 'react';
import {
  useSettingsStore,
  type AtmosphereQuality,
  type GraphicsPreset,
  type HudDensity,
  type LightingQuality,
  type ResolutionScale,
  type ShadowQuality,
} from '../../stores/useSettingsStore';
import { useVehicleStore } from '../../stores/useVehicleStore';
import { useCoasterStore } from '../../stores/useCoasterStore';
import { isTouchDevice } from '../../utils/device';
import { getPerformanceProfile, type PerformanceTier } from '../../utils/performance';
import { audioEngine, type DynamicRangeMode } from '../../audio';
import { SG } from './startScreenTheme';

interface SettingsButtonProps {
  variant: 'menu' | 'hud';
  onClick: () => void;
}

interface SettingsMenuProps {
  open: boolean;
  onClose: () => void;
}

interface SegmentOption<T extends string> {
  value: T;
  label: string;
  icon: string;
}

const panelStyle: CSSProperties = {
  width: 'min(720px, calc(100vw - 28px))',
  maxHeight: 'min(720px, calc(100vh - 28px))',
  overflowY: 'auto',
  borderRadius: 22,
  border: '1px solid rgba(255, 255, 255, 0.14)',
  background: 'rgba(11, 15, 23, 0.92)',
  color: '#fff',
  boxShadow: 'var(--sg-shadow)',
  backdropFilter: 'blur(16px)',
  WebkitBackdropFilter: 'blur(16px)',
  fontFamily: SG.font,
};

const sectionStyle: CSSProperties = {
  display: 'grid',
  gap: 10,
  padding: '12px 16px',
  borderTop: '1px solid rgba(255, 255, 255, 0.08)',
};

const labelStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  color: 'rgba(255, 255, 255, 0.82)',
  fontSize: 13,
  fontWeight: 800,
  letterSpacing: '0.04em',
};

const valueStyle: CSSProperties = {
  color: SG.gold,
  fontSize: 12,
  fontWeight: 800,
  fontFamily: 'monospace',
};

const presetOptions: Array<SegmentOption<GraphicsPreset>> = [
  { value: 'auto', label: '自動', icon: 'A' },
  { value: 'light', label: '軽量', icon: 'L' },
  { value: 'balanced', label: '標準', icon: 'B' },
  { value: 'quality', label: '高画質', icon: 'Q' },
];

const lightingOptions: Array<SegmentOption<LightingQuality>> = [
  { value: 'simple', label: '軽い', icon: '1' },
  { value: 'standard', label: '標準', icon: '2' },
  { value: 'rich', label: 'リッチ', icon: '3' },
];

const atmosphereOptions: Array<SegmentOption<AtmosphereQuality>> = [
  { value: 'off', label: 'なし', icon: '0' },
  { value: 'simple', label: '軽い', icon: '1' },
  { value: 'standard', label: '標準', icon: '2' },
  { value: 'rich', label: '深い', icon: '3' },
];

const shadowOptions: Array<SegmentOption<ShadowQuality>> = [
  { value: 'off', label: 'なし', icon: '0' },
  { value: 'low', label: '低', icon: '1' },
  { value: 'standard', label: '標準', icon: '2' },
  { value: 'high', label: '高', icon: '3' },
];

const resolutionOptions: Array<SegmentOption<ResolutionScale>> = [
  { value: 'performance', label: '軽い', icon: 'S' },
  { value: 'balanced', label: '標準', icon: 'M' },
  { value: 'crisp', label: 'くっきり', icon: 'H' },
];

const hudDensityOptions: Array<SegmentOption<HudDensity>> = [
  { value: 'simple', label: 'シンプル', icon: 'S' },
  { value: 'detailed', label: '詳細', icon: 'D' },
];

const dynamicRangeOptions: Array<SegmentOption<DynamicRangeMode>> = [
  { value: 'night', label: '夜間', icon: 'N' },
  { value: 'standard', label: '標準', icon: 'S' },
  { value: 'wide', label: 'ワイド', icon: 'W' },
];

const tierLabels: Record<PerformanceTier, string> = {
  low: '軽量',
  balanced: '標準',
  high: '高画質',
};

const quickButtonStyle: CSSProperties = {
  minHeight: 38,
  padding: '8px 14px',
  borderRadius: 11,
  border: `1px solid ${SG.build}99`,
  background: `linear-gradient(160deg, ${SG.build}3a, ${SG.build}1a)`,
  color: '#fff',
  fontWeight: 900,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  fontFamily: SG.font,
};

function Segment<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: Array<SegmentOption<T>>;
  onChange: (value: T) => void;
}) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))`,
      gap: 6,
      minHeight: 34,
    }}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 5,
              minWidth: 0,
              padding: '8px 6px',
              borderRadius: 10,
              border: active ? `1px solid ${SG.build}` : '1px solid rgba(255, 255, 255, 0.12)',
              background: active ? `linear-gradient(160deg, ${SG.build}44, ${SG.build}1c)` : 'rgba(255, 255, 255, 0.06)',
              color: active ? '#ffffff' : 'rgba(255, 255, 255, 0.72)',
              cursor: 'pointer',
              fontWeight: 800,
              fontSize: 11,
              letterSpacing: 0,
              fontFamily: SG.font,
              transition: 'all 0.18s ease',
              boxShadow: active ? `0 0 18px ${SG.build}33` : 'none',
            }}
          >
            <span style={{
              display: 'inline-grid',
              placeItems: 'center',
              width: 16,
              height: 16,
              borderRadius: '50%',
              background: active ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.08)',
              fontSize: 10,
              fontFamily: 'monospace',
            }}>
              {option.icon}
            </span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {option.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      minHeight: 38,
      color: 'rgba(255, 255, 255, 0.82)',
      fontSize: 13,
      fontWeight: 800,
      cursor: 'pointer',
    }}>
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.currentTarget.checked)}
        style={{
          width: 42,
          height: 22,
          accentColor: '#63c8ff',
          cursor: 'pointer',
        }}
      />
    </label>
  );
}

function VolumeSlider({
  label,
  value,
  color,
  onChange,
}: {
  label: string;
  value: number;
  color: string;
  onChange: (value: number) => void;
}) {
  return (
    <div style={{ display: 'grid', gap: 5 }}>
      <div style={labelStyle}>
        <span>{label}</span>
        <span style={valueStyle}>{Math.round(value * 100)}%</span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={Math.round(value * 100)}
        onChange={(event) => onChange(Number(event.currentTarget.value) / 100)}
        style={{ width: '100%', accentColor: color }}
        aria-label={label}
      />
    </div>
  );
}

export function SettingsButton({ variant, onClick }: SettingsButtonProps) {
  const isMenu = variant === 'menu';
  // ゲーム中は左上に置くが、搭乗中は左上HPと重なるので少し下へ
  const inVehicle = useVehicleStore((s) => s.activeVehicle !== null);
  const onCoaster = useCoasterStore((s) => s.isBoarded);
  const rideMode = !isMenu && (inVehicle || onCoaster);

  return (
    <button
      type="button"
      aria-label="設定"
      title="設定"
      onClick={onClick}
      style={{
        position: 'fixed',
        top: isMenu ? 16 : (rideMode ? 44 : 14),
        right: isMenu ? 16 : 'auto',
        left: isMenu ? 'auto' : 14,
        zIndex: isMenu ? 230 : 145,
        display: 'grid',
        placeItems: 'center',
        width: isTouchDevice() ? 44 : 38,
        height: isTouchDevice() ? 44 : 38,
        borderRadius: '50%',
        border: '1px solid rgba(255, 255, 255, 0.2)',
        background: 'rgba(10, 12, 16, 0.68)',
        color: '#fff',
        fontSize: isTouchDevice() ? 22 : 19,
        cursor: 'pointer',
        boxShadow: '0 10px 28px rgba(0, 0, 0, 0.28)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
      }}
    >
      ⚙
    </button>
  );
}

export function SettingsMenu({ open, onClose }: SettingsMenuProps) {
  const graphicsPreset = useSettingsStore((s) => s.graphicsPreset);
  const renderDistance = useSettingsStore((s) => s.renderDistance);
  const lightingQuality = useSettingsStore((s) => s.lightingQuality);
  const atmosphereQuality = useSettingsStore((s) => s.atmosphereQuality);
  const shadowQuality = useSettingsStore((s) => s.shadowQuality);
  const resolutionScale = useSettingsStore((s) => s.resolutionScale);
  const waterAnimation = useSettingsStore((s) => s.waterAnimation);
  const hudDensity = useSettingsStore((s) => s.hudDensity);
  const showControlsGuide = useSettingsStore((s) => s.showControlsGuide);
  const masterVolume = useSettingsStore((s) => s.masterVolume);
  const bgmVolume = useSettingsStore((s) => s.bgmVolume);
  const ambienceVolume = useSettingsStore((s) => s.ambienceVolume);
  const sfxVolume = useSettingsStore((s) => s.sfxVolume);
  const creatureVolume = useSettingsStore((s) => s.creatureVolume);
  const voiceChatVolume = useSettingsStore((s) => s.voiceChatVolume);
  const audioMuted = useSettingsStore((s) => s.audioMuted);
  const dynamicRange = useSettingsStore((s) => s.dynamicRange);
  const spatialAudio = useSettingsStore((s) => s.spatialAudio);
  const applyGraphicsPreset = useSettingsStore((s) => s.applyGraphicsPreset);
  const setGraphicsPreset = useSettingsStore((s) => s.setGraphicsPreset);
  const setRenderDistance = useSettingsStore((s) => s.setRenderDistance);
  const setLightingQuality = useSettingsStore((s) => s.setLightingQuality);
  const setAtmosphereQuality = useSettingsStore((s) => s.setAtmosphereQuality);
  const setShadowQuality = useSettingsStore((s) => s.setShadowQuality);
  const setResolutionScale = useSettingsStore((s) => s.setResolutionScale);
  const setWaterAnimation = useSettingsStore((s) => s.setWaterAnimation);
  const setHudDensity = useSettingsStore((s) => s.setHudDensity);
  const setShowControlsGuide = useSettingsStore((s) => s.setShowControlsGuide);
  const setMasterVolume = useSettingsStore((s) => s.setMasterVolume);
  const setBgmVolumeSetting = useSettingsStore((s) => s.setBgmVolume);
  const setAmbienceVolume = useSettingsStore((s) => s.setAmbienceVolume);
  const setSfxVolumeSetting = useSettingsStore((s) => s.setSfxVolume);
  const setCreatureVolume = useSettingsStore((s) => s.setCreatureVolume);
  const setVoiceChatVolume = useSettingsStore((s) => s.setVoiceChatVolume);
  const setAudioMuted = useSettingsStore((s) => s.setAudioMuted);
  const setDynamicRange = useSettingsStore((s) => s.setDynamicRange);
  const setSpatialAudio = useSettingsStore((s) => s.setSpatialAudio);
  const resetSettings = useSettingsStore((s) => s.resetSettings);
  const isCompact = isTouchDevice() || window.innerWidth <= 560;
  const performanceProfile = getPerformanceProfile();
  const presetLabel = presetOptions.find((o) => o.value === graphicsPreset)?.label ?? graphicsPreset;
  const presetValueLabel = graphicsPreset === 'auto'
    ? `${presetLabel} / ${tierLabels[performanceProfile.tier]}`
    : presetLabel;
  const renderDistanceLabel = performanceProfile.visibleChunkRadius === renderDistance
    ? `${renderDistance} chunks`
    : `${renderDistance} / 有効 ${performanceProfile.visibleChunkRadius}`;
  const shadowLabel = performanceProfile.shadowsEnabled
    ? shadowOptions.find((o) => o.value === shadowQuality)?.label
    : 'なし';
  const resolutionLabel = `${resolutionOptions.find((o) => o.value === resolutionScale)?.label} ${Math.round(performanceProfile.maxDpr * 100)}%`;

  useEffect(() => {
    if (!open) return undefined;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [open, onClose]);

  // 保存済みのミックスを共有エンジンへ即時反映
  useEffect(() => {
    audioEngine.applyMix({
      masterVolume,
      musicVolume: bgmVolume,
      ambienceVolume,
      sfxVolume,
      creatureVolume,
      voiceChatVolume,
      muted: audioMuted,
      dynamicRange,
      spatialAudio,
    });
  }, [
    ambienceVolume,
    audioMuted,
    bgmVolume,
    creatureVolume,
    dynamicRange,
    masterVolume,
    sfxVolume,
    spatialAudio,
    voiceChatVolume,
  ]);

  if (!open) return null;

  const handleRenderDistanceChange = (e: ChangeEvent<HTMLInputElement>) => {
    setGraphicsPreset('balanced');
    setRenderDistance(Number(e.currentTarget.value));
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="設定"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 340,
        display: 'grid',
        placeItems: 'center',
        padding: 14,
        background: 'rgba(0, 0, 0, 0.58)',
        backdropFilter: 'blur(5px)',
        WebkitBackdropFilter: 'blur(5px)',
      }}
    >
      <div style={panelStyle} onMouseDown={(e) => e.stopPropagation()}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
              padding: isCompact ? '14px 16px 10px' : '15px 20px 11px',
        }}>
          <div>
            <div style={{
              color: '#fff',
              fontSize: isCompact ? 22 : 26,
              fontWeight: 900,
              letterSpacing: '0.08em',
            }}>
              設定
            </div>
            <div style={{
              marginTop: 4,
              color: 'rgba(255, 255, 255, 0.42)',
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.08em',
            }}>
              GRAPHICS / SOUND / HUD
            </div>
          </div>
          <button
            type="button"
            aria-label="閉じる"
            onClick={onClose}
            style={{
              width: 36,
              height: 36,
              borderRadius: '50%',
              border: '1px solid rgba(255,255,255,0.16)',
              background: 'rgba(255,255,255,0.07)',
              color: '#fff',
              fontSize: 20,
              cursor: 'pointer',
            }}
          >
            ×
          </button>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: isCompact ? '1fr' : '1fr auto',
          alignItems: 'center',
          gap: 12,
          padding: '12px 16px',
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          background: 'rgba(255, 255, 255, 0.035)',
        }}>
          <div style={{ minWidth: 0 }}>
            <div style={{
              color: 'rgba(255, 255, 255, 0.74)',
              fontSize: 12,
              fontWeight: 900,
              letterSpacing: '0.06em',
            }}>
              現在の負荷
            </div>
            <div style={{
              marginTop: 4,
              color: '#fff',
              fontSize: isCompact ? 14 : 15,
              fontWeight: 900,
              letterSpacing: 0,
            }}>
              {tierLabels[performanceProfile.tier]} / {performanceProfile.visibleChunkRadius} chunks / {Math.round(performanceProfile.maxDpr * 100)}%
            </div>
          </div>
          <div style={{
            display: 'flex',
            gap: 8,
            flexWrap: 'wrap',
            justifyContent: isCompact ? 'stretch' : 'flex-end',
          }}>
            <button
              type="button"
              onClick={() => applyGraphicsPreset('light')}
              style={{
                ...quickButtonStyle,
                flex: isCompact ? '1 1 130px' : '0 0 auto',
                background: 'rgba(70, 175, 120, 0.30)',
                borderColor: 'rgba(120, 235, 165, 0.70)',
              }}
            >
              快適優先
            </button>
            <button
              type="button"
              onClick={() => applyGraphicsPreset('auto')}
              style={{
                ...quickButtonStyle,
                flex: isCompact ? '1 1 130px' : '0 0 auto',
              }}
            >
              端末に合わせる
            </button>
          </div>
        </div>

        <div style={sectionStyle}>
          <div style={labelStyle}>
            <span>画質プリセット</span>
            <span style={valueStyle}>{presetValueLabel}</span>
          </div>
          <Segment value={graphicsPreset} options={presetOptions} onChange={applyGraphicsPreset} />
        </div>

        <div style={sectionStyle}>
          <div style={labelStyle}>
            <span>表示距離</span>
            <span style={valueStyle}>{renderDistanceLabel}</span>
          </div>
          <input
            type="range"
            min={4}
            max={10}
            step={1}
            value={renderDistance}
            onChange={handleRenderDistanceChange}
            style={{
              width: '100%',
              accentColor: '#63c8ff',
            }}
          />
        </div>

        <div style={{
          ...sectionStyle,
          gridTemplateColumns: '1fr',
        }}>
          <div style={{ display: 'grid', gap: 10 }}>
            <div style={labelStyle}>
              <span>ライティング</span>
              <span style={valueStyle}>{lightingOptions.find((o) => o.value === lightingQuality)?.label}</span>
            </div>
            <Segment
              value={lightingQuality}
              options={lightingOptions}
              onChange={(value) => {
                setGraphicsPreset('balanced');
                setLightingQuality(value);
              }}
            />
          </div>

          <div style={{ display: 'grid', gap: 10 }}>
            <div style={labelStyle}>
              <span>空気感</span>
              <span style={valueStyle}>{atmosphereOptions.find((o) => o.value === atmosphereQuality)?.label}</span>
            </div>
            <Segment
              value={atmosphereQuality}
              options={atmosphereOptions}
              onChange={(value) => {
                setGraphicsPreset('balanced');
                setAtmosphereQuality(value);
              }}
            />
          </div>

          <div style={{ display: 'grid', gap: 10 }}>
            <div style={labelStyle}>
              <span>影</span>
              <span style={valueStyle}>{shadowLabel}</span>
            </div>
            <Segment
              value={shadowQuality}
              options={shadowOptions}
              onChange={(value) => {
                setGraphicsPreset('balanced');
                setShadowQuality(value);
              }}
            />
          </div>
        </div>

        <div style={{
          ...sectionStyle,
          gridTemplateColumns: '1fr',
        }}>
          <div style={{ display: 'grid', gap: 10 }}>
            <div style={labelStyle}>
              <span>解像度</span>
              <span style={valueStyle}>{resolutionLabel}</span>
            </div>
            <Segment
              value={resolutionScale}
              options={resolutionOptions}
              onChange={(value) => {
                setGraphicsPreset('balanced');
                setResolutionScale(value);
              }}
            />
          </div>

          <div style={{
            display: 'grid',
            gap: 8,
            alignContent: 'center',
            minHeight: 72,
          }}>
            <Toggle
              label="水面の波"
              checked={waterAnimation}
              onChange={(checked) => {
                setGraphicsPreset('balanced');
                setWaterAnimation(checked);
              }}
            />
            <Toggle
              label="操作ガイド"
              checked={showControlsGuide}
              onChange={setShowControlsGuide}
            />
          </div>
        </div>

        <div style={sectionStyle}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <div style={{ color: '#fff', fontWeight: 900, fontSize: 14 }}>サウンドミックス</div>
              <div style={{ color: 'rgba(255,255,255,0.48)', fontSize: 11, marginTop: 3 }}>
                冒険の迫力と、生き物の気配を別々に調整できるよ
              </div>
            </div>
            <button
              type="button"
              onClick={() => setAudioMuted(!audioMuted)}
              aria-pressed={audioMuted}
              style={{
                ...quickButtonStyle,
                borderColor: audioMuted ? '#ff8a80aa' : `${SG.build}99`,
                background: audioMuted ? 'rgba(255,80,80,0.18)' : quickButtonStyle.background,
              }}
            >
              {audioMuted ? '🔇 ミュート中' : '🔊 音あり'}
            </button>
          </div>
          <VolumeSlider label="全体" value={masterVolume} color="#ffffff" onChange={setMasterVolume} />
          <div style={{ display: 'grid', gridTemplateColumns: isCompact ? '1fr' : 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
            <VolumeSlider label="音楽" value={bgmVolume} color="#63c8ff" onChange={setBgmVolumeSetting} />
            <VolumeSlider label="環境音" value={ambienceVolume} color="#78d89a" onChange={setAmbienceVolume} />
            <VolumeSlider label="効果音" value={sfxVolume} color="#ffc06d" onChange={setSfxVolumeSetting} />
            <VolumeSlider label="生き物・モブ" value={creatureVolume} color="#d39cff" onChange={setCreatureVolume} />
            <VolumeSlider label="ボイスチャット" value={voiceChatVolume} color="#7edcff" onChange={setVoiceChatVolume} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: isCompact ? '1fr' : '1.2fr 0.8fr', gap: 10, alignItems: 'center' }}>
            <div>
              <div style={{ ...labelStyle, marginBottom: 6 }}><span>音の強弱</span></div>
              <Segment value={dynamicRange} options={dynamicRangeOptions} onChange={setDynamicRange} />
            </div>
            <Toggle label="立体音響" checked={spatialAudio} onChange={setSpatialAudio} />
          </div>
        </div>

        <div style={sectionStyle}>
          <div style={labelStyle}>
            <span>画面の情報量</span>
            <span style={valueStyle}>
              {hudDensityOptions.find((o) => o.value === hudDensity)?.label}
            </span>
          </div>
          <div style={{
            color: 'rgba(255, 255, 255, 0.42)',
            fontSize: 11,
            fontWeight: 700,
            lineHeight: '15px',
            marginTop: -2,
          }}>
            シンプルは目的と体力だけ。詳細は作戦パネルも全部出すよ
          </div>
          <Segment value={hudDensity} options={hudDensityOptions} onChange={setHudDensity} />
        </div>

        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 10,
          padding: '10px 16px 12px',
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
        }}>
          <button
            type="button"
            onClick={resetSettings}
            style={{
              minHeight: 40,
              padding: '9px 16px',
              borderRadius: 12,
              border: '1px solid rgba(255,255,255,0.14)',
              background: 'rgba(255,255,255,0.06)',
              color: 'rgba(255,255,255,0.78)',
              fontWeight: 800,
              cursor: 'pointer',
              fontFamily: SG.font,
            }}
          >
            リセット
          </button>
          <button
            type="button"
            onClick={onClose}
            style={{
              minHeight: 40,
              padding: '9px 24px',
              borderRadius: 12,
              border: `2px solid ${SG.build}99`,
              background: `linear-gradient(160deg, ${SG.build}48, ${SG.build}1f)`,
              color: '#fff',
              fontWeight: 900,
              letterSpacing: 1,
              cursor: 'pointer',
              fontFamily: SG.font,
              boxShadow: `0 5px 18px ${SG.build}33`,
            }}
          >
            完了
          </button>
        </div>
      </div>
    </div>
  );
}
