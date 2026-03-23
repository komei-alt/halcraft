// ============================================
// VoiceChat — WebRTC ベースのボイスチャット
// P2P Mesh トポロジー（最大10人、音声のみ）
// Socket.IO をシグナリングサーバーとして利用
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
 */
class VoiceChatManager {
  private peers: Map<string, PeerConnection> = new Map();
  private localStream: MediaStream | null = null;
  private callbacks: VoiceChatCallbacks = {};
  private state: VoiceChatState = 'disconnected';
  private isMuted = false;
  private speakingTimer: ReturnType<typeof setInterval> | null = null;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private isSpeaking = false;
  private socketListenersAttached = false;

  /** 現在の状態を取得 */
  getState(): VoiceChatState {
    return this.state;
  }

  /** ミュート状態を取得 */
  getMuted(): boolean {
    return this.isMuted;
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
   * ボイスチャットに参加
   * マイクの許可を取得し、既存のピアと接続を確立
   */
  async join(): Promise<void> {
    if (this.state !== 'disconnected') return;

    const socket = getSocket();
    if (!socket?.connected) {
      this.callbacks.onError?.('サーバーに接続されていません');
      return;
    }

    this.setState('connecting');

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

      // 発話検出の設定
      await this.setupSpeakingDetection();

      // Socket.IO シグナリングイベントを登録
      this.attachSocketListeners();

      // ボイスチャット参加を通知
      socket.emit('voice:joined');

      this.setState('connected');
    } catch (err) {
      console.error('[VoiceChat] マイクの取得に失敗:', err);

      const errorMessage =
        err instanceof DOMException && err.name === 'NotAllowedError'
          ? 'マイクの使用が許可されていません。設定から許可してください。'
          : 'マイクの接続に失敗しました。';

      this.callbacks.onError?.(errorMessage);
      this.setState('error');
    }
  }

  /** ボイスチャットから退出 */
  leave(): void {
    const socket = getSocket();
    socket?.emit('voice:left');

    // 発話検出を停止
    this.stopSpeakingDetection();

    // 全ピア接続を切断
    for (const [peerId, peer] of this.peers) {
      peer.pc.close();
      peer.audioElement.srcObject = null;
      peer.audioElement.remove();
      this.peers.delete(peerId);
    }

    // ローカルストリームを停止
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop());
      this.localStream = null;
    }

    // AudioContext を閉じる
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
      this.analyser = null;
    }

    this.detachSocketListeners();
    this.setState('disconnected');
  }

  /** マイクのミュート/ミュート解除を切り替え */
  toggleMute(): boolean {
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

    // ローカルの音声トラックを追加
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
    // iOS: ミュート状態でも再生できるようにボリュームを設定
    audioElement.volume = 1.0;

    pc.ontrack = (event) => {
      console.log(`[VoiceChat] リモート音声受信: ${peerId}`);
      // iOS Safari 互換性: 新しい MediaStream を明示的に作成
      const remoteStream = new MediaStream();
      event.streams[0].getTracks().forEach((track) => remoteStream.addTrack(track));
      audioElement.srcObject = remoteStream;
      // iOS Safari 対策: ユーザーインタラクション後に再生
      const playPromise = audioElement.play();
      if (playPromise) {
        playPromise.catch(() => {
          // 自動再生がブロックされた場合は次のタッチ/クリックで再試行
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
