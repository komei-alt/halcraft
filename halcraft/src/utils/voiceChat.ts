// ============================================
// VoiceChat — WebRTC ベースのボイスチャット
// P2P Mesh トポロジー（最大10人、音声のみ）
// Socket.IO をシグナリングサーバーとして利用
//
// モード:
//   - listener: スピーカーのみ（マイクなし、受信専用）
//   - full: マイク＋スピーカー（送受信）
// ============================================

import { getSocket } from './socket';

/** WebRTC の STUN/TURN サーバー設定 */
const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ],
};

/** 発話検出の閾値 */
const SPEAKING_THRESHOLD = 0.015;
/** 発話検出のチェック間隔 (ms) */
const SPEAKING_CHECK_INTERVAL = 100;

/** ピア接続の状態 */
interface PeerConnection {
  pc: RTCPeerConnection;
  /** リモートオーディオの再生要素 */
  audioElement: HTMLAudioElement;
}

/** ボイスチャットのコールバック */
export interface VoiceChatCallbacks {
  /** 接続状態が変わった時 */
  onStateChange?: (state: VoiceChatState) => void;
  /** マイク状態が変わった時 */
  onMicChange?: (micEnabled: boolean) => void;
  /** スピーカー（リスナー）状態が変わった時 */
  onSpeakerChange?: (speakerEnabled: boolean) => void;
  /** 自分の発話状態が変わった時 */
  onSpeakingChange?: (speaking: boolean) => void;
  /** リモートプレイヤーの発話状態が変わった時 */
  onRemoteSpeaking?: (playerId: string, speaking: boolean) => void;
  /** エラーが発生した時 */
  onError?: (error: string) => void;
}

export type VoiceChatState = 'disconnected' | 'connecting' | 'connected' | 'error';

/**
 * ボイスチャットマネージャー
 * WebRTC Mesh トポロジーで P2P 音声通信を管理
 *
 * 起動フロー:
 * 1. マルチプレイ接続時に joinAsListener() → 受信専用で自動参加
 * 2. ユーザーがマイクON → enableMicrophone() → 既存のピア接続にトラック追加
 * 3. マイクOFF → disableMicrophone() → トラックを無効化（接続は維持）
 */
class VoiceChatManager {
  private peers: Map<string, PeerConnection> = new Map();
  private localStream: MediaStream | null = null;
  private callbacks: VoiceChatCallbacks = {};
  private state: VoiceChatState = 'disconnected';
  private isMicEnabled = false;
  private isMuted = false;
  private isSpeakerEnabled = false;
  private speakingTimer: ReturnType<typeof setInterval> | null = null;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private isSpeaking = false;
  private socketListenersAttached = false;

  /** 現在の状態を取得 */
  getState(): VoiceChatState {
    return this.state;
  }

  /** マイクが有効かどうか */
  getMicEnabled(): boolean {
    return this.isMicEnabled;
  }

  /** ミュート状態を取得 */
  getMuted(): boolean {
    return this.isMuted;
  }

  /** スピーカー（リスナー）が有効かどうか */
  getSpeakerEnabled(): boolean {
    return this.isSpeakerEnabled;
  }

  /** 接続中のピア数を取得 */
  getPeerCount(): number {
    return this.peers.size;
  }

  /** コールバックを設定 */
  setCallbacks(cb: VoiceChatCallbacks) {
    this.callbacks = cb;
  }

  /** 状態を更新 */
  private setState(state: VoiceChatState) {
    this.state = state;
    this.callbacks.onStateChange?.(state);
  }

  /**
   * リスナーモードで参加（スピーカーのみ、マイク不要）
   * マルチプレイ接続時に自動で呼ばれる
   */
  async joinAsListener(): Promise<void> {
    if (this.state !== 'disconnected') return;

    const socket = getSocket();
    if (!socket?.connected) {
      return; // サーバー未接続の場合はサイレントに無視
    }

    this.setState('connecting');

    try {
      // Socket.IO シグナリングイベントを登録（受信用）
      this.attachSocketListeners();

      // ボイスチャット参加を通知 → 他のピアからオファーを受け取る
      socket.emit('voice:joined');

      this.isSpeakerEnabled = true;
      this.callbacks.onSpeakerChange?.(true);
      this.setState('connected');
    } catch (err) {
      console.error('[VoiceChat] リスナー参加に失敗:', err);
      this.setState('error');
    }
  }

  /**
   * マイクを有効化
   * リスナーモードから送信モードにアップグレード
   */
  async enableMicrophone(): Promise<void> {
    if (this.isMicEnabled) return;

    if (this.state !== 'connected') {
      // まだ接続していない場合は先にリスナーとして参加
      await this.joinAsListener();
    }

    try {
      // マイクの許可を取得
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });

      // 既存のピア接続にローカルトラックを追加
      for (const [peerId, peer] of this.peers) {
        this.localStream.getTracks().forEach((track) => {
          try {
            peer.pc.addTrack(track, this.localStream!);
          } catch (e) {
            console.warn(`[VoiceChat] ピア ${peerId} にトラック追加失敗:`, e);
          }
        });

        // 再ネゴシエーション: 新しいトラックを通知するためにオファーを再送
        try {
          const offer = await peer.pc.createOffer();
          await peer.pc.setLocalDescription(offer);
          const socket = getSocket();
          socket?.emit('voice:offer', { targetId: peerId, offer });
        } catch (e) {
          console.warn(`[VoiceChat] ピア ${peerId} 再ネゴシエーション失敗:`, e);
        }
      }

      // 発話検出の設定
      await this.setupSpeakingDetection();

      this.isMicEnabled = true;
      this.isMuted = false;
      this.callbacks.onMicChange?.(true);

      // サーバーにマイク状態を通知
      const socket = getSocket();
      socket?.emit('voice:mic-status', { micEnabled: true });
    } catch (err) {
      console.error('[VoiceChat] マイクの取得に失敗:', err);

      const errorMessage =
        err instanceof DOMException && err.name === 'NotAllowedError'
          ? 'マイクの使用が許可されていません。設定から許可してください。'
          : 'マイクの接続に失敗しました。';

      this.callbacks.onError?.(errorMessage);
    }
  }

  /**
   * マイクを無効化
   * ローカルストリームを停止するが、リスナーモードは維持
   */
  disableMicrophone(): void {
    if (!this.isMicEnabled) return;

    // 発話検出を停止
    this.stopSpeakingDetection();

    // 発話状態をリセット
    if (this.isSpeaking) {
      this.isSpeaking = false;
      this.callbacks.onSpeakingChange?.(false);
      const socket = getSocket();
      socket?.emit('voice:speaking', { speaking: false });
    }

    // ローカルストリームを停止
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop());

      // ピア接続からローカルトラックを削除
      for (const [, peer] of this.peers) {
        const senders = peer.pc.getSenders();
        for (const sender of senders) {
          if (sender.track && this.localStream.getTracks().includes(sender.track)) {
            try {
              peer.pc.removeTrack(sender);
            } catch (e) {
              // removeTrack が非対応のブラウザ
              console.warn('[VoiceChat] トラック削除失敗:', e);
            }
          }
        }
      }

      this.localStream = null;
    }

    // AudioContext を閉じる
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
      this.analyser = null;
    }

    this.isMicEnabled = false;
    this.isMuted = false;
    this.callbacks.onMicChange?.(false);

    // サーバーにマイク状態を通知
    const socket = getSocket();
    socket?.emit('voice:mic-status', { micEnabled: false });
  }

  /** ボイスチャットから完全に退出（スピーカーも停止） */
  leave(): void {
    // マイクを先に停止
    this.disableMicrophone();

    const socket = getSocket();
    socket?.emit('voice:left');

    // 全ピア接続を切断
    for (const [peerId, peer] of this.peers) {
      peer.pc.close();
      peer.audioElement.srcObject = null;
      peer.audioElement.remove();
      this.peers.delete(peerId);
    }

    this.detachSocketListeners();
    this.isSpeakerEnabled = false;
    this.callbacks.onSpeakerChange?.(false);
    this.setState('disconnected');
  }

  /** マイクのミュート/ミュート解除を切り替え */
  toggleMute(): boolean {
    if (!this.isMicEnabled) return this.isMuted;

    this.isMuted = !this.isMuted;

    if (this.localStream) {
      this.localStream.getAudioTracks().forEach((track) => {
        track.enabled = !this.isMuted;
      });
    }

    // ミュート中は発話していない扱い
    if (this.isMuted && this.isSpeaking) {
      this.isSpeaking = false;
      this.callbacks.onSpeakingChange?.(false);
      const socket = getSocket();
      socket?.emit('voice:speaking', { speaking: false });
    }

    return this.isMuted;
  }

  /** スピーカー（受信音声）のミュート/解除を切り替え */
  toggleSpeaker(): boolean {
    this.isSpeakerEnabled = !this.isSpeakerEnabled;

    // 全ピアの音声要素のボリュームを切り替え
    for (const [, peer] of this.peers) {
      peer.audioElement.muted = !this.isSpeakerEnabled;
    }

    this.callbacks.onSpeakerChange?.(this.isSpeakerEnabled);
    return this.isSpeakerEnabled;
  }

  // ── 発話検出 ──

  /** 発話検出用の AudioContext + Analyser をセットアップ */
  private async setupSpeakingDetection(): Promise<void> {
    if (!this.localStream) return;

    // iOS Safari: AudioContext はユーザーインタラクション内で resume が必要
    this.audioContext = new AudioContext();
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }
    const source = this.audioContext.createMediaStreamSource(this.localStream);
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 256;
    source.connect(this.analyser);

    // 定期的に音量をチェック
    this.speakingTimer = setInterval(() => {
      if (this.isMuted || !this.analyser) return;

      const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
      this.analyser.getByteFrequencyData(dataArray);

      // 平均音量を計算
      const average = dataArray.reduce((sum, val) => sum + val, 0) / dataArray.length / 255;
      const nowSpeaking = average > SPEAKING_THRESHOLD;

      if (nowSpeaking !== this.isSpeaking) {
        this.isSpeaking = nowSpeaking;
        this.callbacks.onSpeakingChange?.(nowSpeaking);

        // サーバーに通知（他プレイヤーの名前タグに反映）
        const socket = getSocket();
        socket?.emit('voice:speaking', { speaking: nowSpeaking });
      }
    }, SPEAKING_CHECK_INTERVAL);
  }

  /** 発話検出を停止 */
  private stopSpeakingDetection(): void {
    if (this.speakingTimer) {
      clearInterval(this.speakingTimer);
      this.speakingTimer = null;
    }
  }

  // ── Socket.IO シグナリング ──

  private socketHandlers: Record<string, (data: Record<string, unknown>) => void> = {};

  /** Socket.IO のシグナリングイベントをリスン */
  private attachSocketListeners(): void {
    const socket = getSocket();
    if (!socket || this.socketListenersAttached) return;

    this.socketHandlers = {
      'voice:peer-joined': (data) => this.handlePeerJoined(data.peerId as string),
      'voice:peer-left': (data) => this.handlePeerLeft(data.peerId as string),
      'voice:offer': (data) => this.handleOffer(data.fromId as string, data.offer as RTCSessionDescriptionInit),
      'voice:answer': (data) => this.handleAnswer(data.fromId as string, data.answer as RTCSessionDescriptionInit),
      'voice:ice-candidate': (data) => this.handleIceCandidate(data.fromId as string, data.candidate as RTCIceCandidateInit),
      'voice:speaking': (data) => this.callbacks.onRemoteSpeaking?.(data.id as string, data.speaking as boolean),
    };

    for (const [event, handler] of Object.entries(this.socketHandlers)) {
      socket.on(event, handler);
    }

    this.socketListenersAttached = true;
  }

  /** Socket.IO のリスンを解除 */
  private detachSocketListeners(): void {
    const socket = getSocket();
    if (!socket) return;

    for (const [event, handler] of Object.entries(this.socketHandlers)) {
      socket.off(event, handler);
    }

    this.socketListenersAttached = false;
    this.socketHandlers = {};
  }

  // ── WebRTC ピア接続管理 ──

  /** 新しいピアが参加 → こちらからオファーを送信 */
  private async handlePeerJoined(peerId: string): Promise<void> {
    console.log(`[VoiceChat] ピア参加: ${peerId}`);
    const pc = this.createPeerConnection(peerId);

    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const socket = getSocket();
      socket?.emit('voice:offer', { targetId: peerId, offer });
    } catch (err) {
      console.error('[VoiceChat] オファー作成失敗:', err);
    }
  }

  /** ピアが退出 → 接続をクリーンアップ */
  private handlePeerLeft(peerId: string): void {
    console.log(`[VoiceChat] ピア退出: ${peerId}`);
    const peer = this.peers.get(peerId);
    if (peer) {
      peer.pc.close();
      peer.audioElement.srcObject = null;
      peer.audioElement.remove();
      this.peers.delete(peerId);
    }
  }

  /** オファーを受信 → アンサーを送信 */
  private async handleOffer(fromId: string, offer: RTCSessionDescriptionInit): Promise<void> {
    console.log(`[VoiceChat] オファー受信: ${fromId}`);
    const pc = this.createPeerConnection(fromId);

    try {
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      const socket = getSocket();
      socket?.emit('voice:answer', { targetId: fromId, answer });
    } catch (err) {
      console.error('[VoiceChat] アンサー作成失敗:', err);
    }
  }

  /** アンサーを受信 */
  private async handleAnswer(fromId: string, answer: RTCSessionDescriptionInit): Promise<void> {
    const peer = this.peers.get(fromId);
    if (!peer) return;

    try {
      await peer.pc.setRemoteDescription(new RTCSessionDescription(answer));
    } catch (err) {
      console.error('[VoiceChat] アンサー設定失敗:', err);
    }
  }

  /** ICE candidate を受信 */
  private async handleIceCandidate(fromId: string, candidate: RTCIceCandidateInit): Promise<void> {
    const peer = this.peers.get(fromId);
    if (!peer) return;

    try {
      await peer.pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
      console.error('[VoiceChat] ICE candidate 追加失敗:', err);
    }
  }

  /** PeerConnection を作成 */
  private createPeerConnection(peerId: string): RTCPeerConnection {
    // 既存の接続があれば閉じる
    const existing = this.peers.get(peerId);
    if (existing) {
      existing.pc.close();
      existing.audioElement.srcObject = null;
      existing.audioElement.remove();
    }

    const pc = new RTCPeerConnection(ICE_SERVERS);

    // ローカルの音声トラックを追加（マイクが有効な場合のみ）
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        pc.addTrack(track, this.localStream!);
      });
    }

    // ICE candidate をシグナリングサーバー経由で送信
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        const socket = getSocket();
        socket?.emit('voice:ice-candidate', {
          targetId: peerId,
          candidate: event.candidate.toJSON(),
        });
      }
    };

    // リモート音声ストリームを受信 → Audio要素で再生
    const audioElement = document.createElement('audio');
    audioElement.autoplay = true;
    // iOS Safari 対応
    audioElement.setAttribute('playsinline', '');
    audioElement.setAttribute('webkit-playsinline', '');
    audioElement.volume = 1.0;
    // スピーカーがOFFの場合はミュート
    audioElement.muted = !this.isSpeakerEnabled;
    // DOM に追加しないと一部ブラウザで再生できない（Mac Safari, Firefox等）
    audioElement.style.display = 'none';
    document.body.appendChild(audioElement);

    pc.ontrack = (event) => {
      console.log(`[VoiceChat] リモート音声受信: ${peerId}, tracks: ${event.streams[0]?.getTracks().length}`);
      // iOS Safari 互換性: 新しい MediaStream を明示的に作成
      const remoteStream = new MediaStream();
      event.streams[0].getTracks().forEach((track) => {
        console.log(`[VoiceChat]   track: ${track.kind} enabled=${track.enabled} muted=${track.muted}`);
        remoteStream.addTrack(track);
      });
      audioElement.srcObject = remoteStream;
      // 再生試行
      const playPromise = audioElement.play();
      if (playPromise) {
        playPromise.then(() => {
          console.log(`[VoiceChat] 音声再生開始: ${peerId}`);
        }).catch((err) => {
          console.warn(`[VoiceChat] 自動再生ブロック: ${peerId}`, err);
          // 次のタッチ/クリックで再試行
          const playHandler = () => {
            audioElement.play().catch(() => {});
            document.removeEventListener('touchstart', playHandler);
            document.removeEventListener('click', playHandler);
          };
          document.addEventListener('touchstart', playHandler, { once: false });
          document.addEventListener('click', playHandler, { once: false });
        });
      }
    };

    pc.onconnectionstatechange = () => {
      console.log(`[VoiceChat] ピア ${peerId} 接続状態: ${pc.connectionState}`);
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        this.handlePeerLeft(peerId);
      }
    };

    this.peers.set(peerId, { pc, audioElement });
    return pc;
  }
}

// シングルトンインスタンス
export const voiceChat = new VoiceChatManager();
