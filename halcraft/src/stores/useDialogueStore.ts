import { create } from 'zustand';
import { audioEngine, playRecordedCue } from '../audio';
import { DIALOGUE_CATALOG, type DialogueCueId } from '../audio/dialogueCatalog';

export interface ActiveDialogue {
  id: DialogueCueId;
  speaker: string;
  text: string;
  tone: 'guide' | 'ally' | 'warning' | 'victory';
  startedAt: number;
}

interface DialogueState {
  active: ActiveDialogue | null;
  announce: (id: DialogueCueId) => void;
  dismiss: () => void;
}

const lastAnnouncedAt = new Map<DialogueCueId, number>();
let dismissTimer: ReturnType<typeof setTimeout> | null = null;
let releaseDuck: (() => void) | null = null;
let activeSource: AudioBufferSourceNode | null = null;
const pendingDialogue: DialogueCueId[] = [];
const MAX_PENDING_DIALOGUE = 4;

function stopActiveAudio(): void {
  const source = activeSource;
  activeSource = null;
  if (source) {
    source.onended = null;
    try {
      source.stop();
    } catch {
      // 終了済みなら何もしない。
    }
    source.disconnect();
  }
  releaseDuck?.();
  releaseDuck = null;
}

function playDialogueFile(path: string, id: DialogueCueId, get: () => DialogueState): void {
  const context = audioEngine.getContext();
  if (!context) return;
  void fetch(path)
    .then((response) => {
      if (!response.ok) throw new Error('dialogue asset unavailable');
      return response.arrayBuffer();
    })
    .then((data) => context.decodeAudioData(data))
    .then((buffer) => {
      if (get().active?.id !== id) return;
      stopActiveAudio();
      const source = context.createBufferSource();
      const gain = context.createGain();
      gain.gain.value = 1;
      source.buffer = buffer;
      source.connect(gain);
      gain.connect(audioEngine.getBusInput('dialogue'));
      const sourceDuck = audioEngine.beginDuck();
      releaseDuck = sourceDuck;
      activeSource = source;
      source.onended = () => {
        source.disconnect();
        gain.disconnect();
        if (activeSource === source) {
          activeSource = null;
          if (releaseDuck === sourceDuck) releaseDuck = null;
          sourceDuck();
        }
      };
      source.start();
    })
    .catch(() => {
      // 字幕と録音済み合図音が情報を保持する。
    });
}

function enqueueDialogue(id: DialogueCueId, front = false): void {
  if (pendingDialogue.includes(id)) return;
  if (front) pendingDialogue.unshift(id);
  else pendingDialogue.push(id);
  if (pendingDialogue.length > MAX_PENDING_DIALOGUE) pendingDialogue.pop();
}

function startDialogue(
  id: DialogueCueId,
  set: (state: Partial<DialogueState>) => void,
  get: () => DialogueState,
): void {
  const definition = DIALOGUE_CATALOG[id];
  if (dismissTimer) clearTimeout(dismissTimer);
  stopActiveAudio();
  const startedAt = Date.now();
  set({
    active: {
      id,
      speaker: definition.speaker,
      text: definition.text,
      tone: definition.tone,
      startedAt,
    },
  });

  if (definition.audioPath) {
    playDialogueFile(definition.audioPath, id, get);
  } else {
    const cue = definition.tone === 'warning'
      ? 'ui.error'
      : definition.tone === 'victory'
        ? 'jingle.reward'
        : 'ui.open';
    playRecordedCue(cue, { gain: definition.tone === 'warning' ? 0.56 : 0.42 });
    releaseDuck = audioEngine.beginDuck();
  }

  dismissTimer = setTimeout(() => {
    if (get().active?.id !== id) return;
    stopActiveAudio();
    set({ active: null });
    dismissTimer = null;
    const next = pendingDialogue.shift();
    if (next) startDialogue(next, set, get);
  }, definition.durationMs);
}

export const useDialogueStore = create<DialogueState>((set, get) => ({
  active: null,
  announce: (id) => {
    const definition = DIALOGUE_CATALOG[id];
    const now = Date.now();
    if (now - (lastAnnouncedAt.get(id) ?? 0) < definition.cooldownMs) return;
    lastAnnouncedAt.set(id, now);

    const activeId = get().active?.id;
    if (activeId) {
      const activeDefinition = DIALOGUE_CATALOG[activeId];
      if (definition.priority > activeDefinition.priority) {
        enqueueDialogue(activeId, true);
        startDialogue(id, set, get);
      } else {
        enqueueDialogue(id);
      }
      return;
    }
    startDialogue(id, set, get);
  },
  dismiss: () => {
    if (dismissTimer) clearTimeout(dismissTimer);
    dismissTimer = null;
    pendingDialogue.length = 0;
    stopActiveAudio();
    set({ active: null });
  },
}));
