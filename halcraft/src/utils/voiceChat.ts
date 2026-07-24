// ============================================
// VoiceChat — WebRTC ベースのボイスチャット
// P2P Mesh トポロジー（最大10人、音声のみ）
// Socket.IO をシグナリングサーバーとして利用
//
// モード:
//   - listener: スピーカーのみ（マイクなし、受信専用）
//   - full: マイク＋スピーカー（送受信）
//
// 接続安定化の方針（一部の人で繋がらない/不安定への対策）:
//   - ICE設定をサーバー(/api/voice/ice)から動的取得。TURNサーバーで対称NAT/CGNATを越える
//   - Perfect Negotiation パターンで同時オファー衝突(Glare)を解消
//   - onnegotiationneeded 駆動でマイクON/OFFの再ネゴシエーションを安全に処理
//   - ICE candidate はリモート記述が入るまでキューイングして取りこぼしを防止
//   - リスナーでも recvonly transceiver で音声経路(m-line)を先に確保
// ============================================

import { getSocket, getServerUrl } from './socket';
import { audioEngine } from '../audio';

/** フォールバック用の ICE 設定（サーバーから取得できなかった場合） */
const FALLBACK_ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
];

/** 発話検出の閾値 */
const SPEAKING_THRESHOLD = 0.015;
/** 発話検出のチェック間隔 (ms) */
const SPEAKING_CHECK_INTERVAL = 100;

/** ピア接続の状態 */
interface PeerConnection {
  pc: RTCPeerConnection;
  /** リモートオーディオの再生要素 */
  audioElement: HTMLAudioElement;
  /** 共有ミキサーへ接続するリモート音声ノード */
  mediaSource: MediaElementAudioSourceNode | null;
  /** Perfect Negotiation: 衝突時に自分が譲るか（politeなら譲る） */
  polite: boolean;
  /** 自分がオファー作成中か */
  makingOffer: boolean;
  /** 衝突で受信オファーを無視中か */
  ignoreOffer: boolean;
  /** リモート記述が入る前に届いた ICE candidate のキュー */
  pendingCandidates: RTCIceCandidateInit[];
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
  private speakingSource: MediaStreamAudioSourceNode | null = null;
  private isSpeaking = false;
  private remoteSpeakers = new Set<string>();
  private voiceDuckRelease: (() => void) | null = null;
  private socketListenersAttached = false;
  /** サーバーから取得した ICE 設定 */
  private iceConfig: RTCConfiguration = { iceServers: FALLBACK_ICE_SERVERS };
  /** ICE 設定を取得済みか */
  private iceLoaded = false;

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

  /** サーバーから ICE 設定（STUN/TURN）を取得 */
  private async loadIceConfig(): Promise<void> {
    if (this.iceLoaded) return;
    try {
      const res = await fetch(`${getServerUrl()}/api/voice/ice`, {
        method: 'GET',
        cache: 'no-store',
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.iceServers) && data.iceServers.length > 0) {
          this.iceConfig = { iceServers: data.iceServers };
          this.iceLoaded = true;
          return;
        }
      }
    } catch (err) {
      console.warn('[VoiceChat] ICE設定の取得に失敗（STUNのみで継続）:', err);
    }
    // 失敗時はフォールバック（STUNのみ）
    this.iceConfig = { iceServers: FALLBACK_ICE_SERVERS };
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
      // 先に ICE 設定（TURN含む）を取得してからピア接続を張る
      await this.loadIceConfig();

      // Socket.IO シグナリングイベントを登録（受信用）
      this.attachSocketListeners();

      // ボイスチャット参加を通知 → 既存メンバー一覧(voice:peers)とオファーを受け取る
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
      // recvonly で確保済みの transceiver があれば addTrack がそれを sendrecv に再利用するため、
      // onnegotiationneeded が発火して再ネゴシエーションが自動で走る（手動オファー不要）
      for (const [peerId, peer] of this.peers) {
        this.localStream.getTracks().forEach((track) => {
          try {
            this.attachLocalTrack(peer.pc, track);
          } catch (e) {
            console.warn(`[VoiceChat] ピア ${peerId} にトラック追加失敗:`, e);
          }
        });
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

      let errorMessage = 'マイクの接続に失敗しました。';
      if (err instanceof DOMException) {
        if (err.name === 'NotAllowedError' || err.name === 'SecurityError') {
          errorMessage = 'マイクの使用が許可されていません。ブラウザの設定から許可してください。';
        } else if (err.name === 'NotFoundError' || err.name === 'OverconstrainedError') {
          errorMessage = 'マイクが見つかりません。デバイスを確認してください。';
        } else if (err.name === 'NotReadableError') {
          errorMessage = 'マイクが他のアプリで使用中の可能性があります。';
        }
      }

      this.callbacks.onError?.(errorMessage);
    }
  }

  /**
   * ローカルの音声トラックをピア接続へ載せる
   * recvonly で待機している sender があれば replaceTrack で再利用し、無ければ addTrack する
   */
  private attachLocalTrack(pc: RTCPeerConnection, track: MediaStreamTrack): void {
    // 既に同じトラックを送信中なら何もしない
    const senders = pc.getSenders();
    const sendingSame = senders.some((s) => s.track === track);
    if (sendingSame) return;

    // recvonly で確保済みの transceiver（sender が空）を再利用してトラックを載せる
    const transceiver = pc.getTransceivers().find((t) => t.sender.track === null);
    if (transceiver) {
      void transceiver.sender.replaceTrack(track);
      // replaceTrack だけでは onnegotiationneeded が発火しない。direction が recvonly の
      // ままだと SDP 上は受信専用扱いになり、相手にこちらの音声が届かない。sendrecv へ
      // 変更して再ネゴシエーションを明示的に駆動する（マイクON後に声が届かない主因の修正）。
      if (transceiver.direction === 'recvonly' || transceiver.direction === 'inactive') {
        transceiver.direction = 'sendrecv';
      }
      return;
    }

    if (this.localStream) {
      pc.addTrack(track, this.localStream);
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
      const localTracks = this.localStream.getTracks();
      localTracks.forEach((track) => track.stop());

      // ピア接続から送信トラックを外す（接続は維持。replaceTrack(null) で再ネゴシエーションを最小化）
      for (const [, peer] of this.peers) {
        for (const sender of peer.pc.getSenders()) {
          if (sender.track && localTracks.includes(sender.track)) {
            try {
              void sender.replaceTrack(null);
            } catch (e) {
              console.warn('[VoiceChat] トラック解除失敗:', e);
            }
          }
        }
      }

      this.localStream = null;
    }

    // ゲーム共有 AudioContext は閉じず、マイク解析ノードだけ外す
    this.speakingSource?.disconnect();
    this.analyser?.disconnect();
    this.speakingSource = null;
    this.audioContext = null;
    this.analyser = null;

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
      peer.mediaSource?.disconnect();
      peer.audioElement.srcObject = null;
      peer.audioElement.remove();
      this.peers.delete(peerId);
    }

    this.detachSocketListeners();
    this.clearRemoteSpeaking();
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
    this.updateVoiceDuck();

    this.callbacks.onSpeakerChange?.(this.isSpeakerEnabled);
    return this.isSpeakerEnabled;
  }

  // ── 発話検出 ──

  /** 発話検出用の AudioContext + Analyser をセットアップ */
  private async setupSpeakingDetection(): Promise<void> {
    if (!this.localStream) return;

    // iOS Safari: AudioContext はユーザーインタラクション内で resume が必要
    this.audioContext = audioEngine.getContext();
    if (!this.audioContext) return;
    await audioEngine.unlock();
    const source = this.audioContext.createMediaStreamSource(this.localStream);
    this.speakingSource = source;
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

  private handleRemoteSpeaking(playerId: string, speaking: boolean): void {
    if (speaking) this.remoteSpeakers.add(playerId);
    else this.remoteSpeakers.delete(playerId);
    this.updateVoiceDuck();
    this.callbacks.onRemoteSpeaking?.(playerId, speaking);
  }

  private updateVoiceDuck(): void {
    const shouldDuck = this.isSpeakerEnabled && this.remoteSpeakers.size > 0;
    if (shouldDuck && !this.voiceDuckRelease) {
      this.voiceDuckRelease = audioEngine.beginDuck();
    } else if (!shouldDuck && this.voiceDuckRelease) {
      this.voiceDuckRelease();
      this.voiceDuckRelease = null;
    }
  }

  private clearRemoteSpeaking(): void {
    this.remoteSpeakers.clear();
    this.updateVoiceDuck();
  }

  // ── Socket.IO シグナリング ──

  private socketHandlers: Record<string, (data: Record<string, unknown>) => void> = {};

  /** Socket.IO のシグナリングイベントをリスン */
  private attachSocketListeners(): void {
    const socket = getSocket();
    if (!socket || this.socketListenersAttached) return;

    this.socketHandlers = {
      'voice:peers': (data) => this.handlePeerList((data.peerIds as string[]) || []),
      'voice:peer-joined': (data) => this.handlePeerJoined(data.peerId as string),
      'voice:peer-left': (data) => this.handlePeerLeft(data.peerId as string),
      'voice:offer': (data) => this.handleOffer(data.fromId as string, data.offer as RTCSessionDescriptionInit),
      'voice:answer': (data) => this.handleAnswer(data.fromId as string, data.answer as RTCSessionDescriptionInit),
      'voice:ice-candidate': (data) => this.handleIceCandidate(data.fromId as string, data.candidate as RTCIceCandidateInit),
      'voice:speaking': (data) => this.handleRemoteSpeaking(data.id as string, data.speaking as boolean),
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

  /** 既存ボイス参加者の一覧を受信 → 各ピアと接続を確立 */
  private handlePeerList(peerIds: string[]): void {
    for (const peerId of peerIds) {
      if (peerId && peerId !== getSocket()?.id) {
        this.ensurePeer(peerId);
      }
    }
  }

  /** 新しいピアが参加 → ピア接続を用意（オファーは onnegotiationneeded が駆動） */
  private handlePeerJoined(peerId: string): void {
    if (!peerId || peerId === getSocket()?.id) return;
    console.log(`[VoiceChat] ピア参加: ${peerId}`);
    this.ensurePeer(peerId);
  }

  /** ピアが退出 → 接続をクリーンアップ */
  private handlePeerLeft(peerId: string): void {
    console.log(`[VoiceChat] ピア退出: ${peerId}`);
    const peer = this.peers.get(peerId);
    if (peer) {
      peer.pc.close();
      peer.mediaSource?.disconnect();
      peer.audioElement.srcObject = null;
      peer.audioElement.remove();
      this.peers.delete(peerId);
    }
    this.remoteSpeakers.delete(peerId);
    this.updateVoiceDuck();
  }

  /** オファーを受信 → Perfect Negotiation で衝突を裁定しつつアンサーを返す */
  private async handleOffer(fromId: string, offer: RTCSessionDescriptionInit): Promise<void> {
    if (!fromId) return;
    const peer = this.ensurePeer(fromId);
    const pc = peer.pc;

    // 衝突判定: 自分がオファー中、または stable でない状態でオファーが来たら衝突
    const offerCollision = peer.makingOffer || pc.signalingState !== 'stable';
    peer.ignoreOffer = !peer.polite && offerCollision;
    if (peer.ignoreOffer) {
      // impolite 側は自分のオファーを優先し、相手のオファーを無視
      return;
    }

    try {
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      await this.flushCandidates(peer);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      const socket = getSocket();
      socket?.emit('voice:answer', { targetId: fromId, answer: pc.localDescription });
    } catch (err) {
      console.warn('[VoiceChat] オファー処理失敗:', err);
    }
  }

  /** アンサーを受信 */
  private async handleAnswer(fromId: string, answer: RTCSessionDescriptionInit): Promise<void> {
    const peer = this.peers.get(fromId);
    if (!peer) return;

    try {
      await peer.pc.setRemoteDescription(new RTCSessionDescription(answer));
      await this.flushCandidates(peer);
    } catch (err) {
      console.warn('[VoiceChat] アンサー設定失敗:', err);
    }
  }

  /** ICE candidate を受信（リモート記述が未設定ならキューイング） */
  private async handleIceCandidate(fromId: string, candidate: RTCIceCandidateInit): Promise<void> {
    const peer = this.peers.get(fromId);
    if (!peer) return;

    // リモート記述が入る前の candidate は追加できないのでキューに退避
    if (!peer.pc.remoteDescription || !peer.pc.remoteDescription.type) {
      peer.pendingCandidates.push(candidate);
      return;
    }

    try {
      await peer.pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
      // 衝突で無視中のオファーに紐づく candidate はエラーになり得るが無害
      if (!peer.ignoreOffer) {
        console.warn('[VoiceChat] ICE candidate 追加失敗:', err);
      }
    }
  }

  /** キュー済みの ICE candidate をまとめて適用 */
  private async flushCandidates(peer: PeerConnection): Promise<void> {
    if (peer.pendingCandidates.length === 0) return;
    const pending = peer.pendingCandidates;
    peer.pendingCandidates = [];
    for (const candidate of pending) {
      try {
        await peer.pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.warn('[VoiceChat] キュー candidate 適用失敗:', err);
      }
    }
  }

  /** ピア接続を取得（無ければ作成）。双方が対称的に作成し Perfect Negotiation で衝突を解消 */
  private ensurePeer(peerId: string): PeerConnection {
    const existing = this.peers.get(peerId);
    if (existing) return existing;

    const pc = new RTCPeerConnection(this.iceConfig);

    // politeness: socket.id の比較で双方が一意に決まる（id が大きい側を polite=譲る側に）
    const myId = getSocket()?.id ?? '';
    const polite = myId > peerId;

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

    const context = audioEngine.getContext();
    let mediaSource: MediaElementAudioSourceNode | null = null;
    if (context) {
      try {
        mediaSource = context.createMediaElementSource(audioElement);
        mediaSource.connect(audioEngine.getBusInput('voiceChat'));
      } catch {
        mediaSource = null;
      }
    }

    const peer: PeerConnection = {
      pc,
      audioElement,
      mediaSource,
      polite,
      makingOffer: false,
      ignoreOffer: false,
      pendingCandidates: [],
    };

    // ローカルの音声トラックを追加（マイクが有効な場合）。
    // 未有効なら recvonly transceiver で受信用の m-line を先に確保しておく。
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => pc.addTrack(track, this.localStream!));
    } else {
      try {
        pc.addTransceiver('audio', { direction: 'recvonly' });
      } catch (e) {
        console.warn('[VoiceChat] recvonly transceiver 追加失敗:', e);
      }
    }

    // Perfect Negotiation: ネゴシエーションが必要になったらオファーを作って送る
    pc.onnegotiationneeded = async () => {
      try {
        peer.makingOffer = true;
        // 引数なし setLocalDescription は createOffer + setLocalDescription を原子的に行い、
        // createOffer の await 中に状態が変わってオファーを取りこぼす競合を防ぐ（Perfect
        // Negotiation 推奨形）。マイクON時の direction 変更でここが確実に走る必要がある。
        await pc.setLocalDescription();
        const socket = getSocket();
        socket?.emit('voice:offer', { targetId: peerId, offer: pc.localDescription });
      } catch (err) {
        console.warn('[VoiceChat] ネゴシエーション失敗:', err);
      } finally {
        peer.makingOffer = false;
      }
    };

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

    pc.ontrack = (event) => {
      console.log(`[VoiceChat] リモート音声受信: ${peerId}, tracks: ${event.streams[0]?.getTracks().length}`);
      // iOS Safari 互換性: 新しい MediaStream を明示的に作成
      const remoteStream = new MediaStream();
      const tracks = event.streams[0] ? event.streams[0].getTracks() : [event.track];
      tracks.forEach((track) => {
        if (track) remoteStream.addTrack(track);
      });
      audioElement.srcObject = remoteStream;
      // 再生試行
      const playPromise = audioElement.play();
      if (playPromise) {
        playPromise
          .then(() => {
            console.log(`[VoiceChat] 音声再生開始: ${peerId}`);
          })
          .catch((err) => {
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

    // ICE 接続が切れた/失敗した場合は ICE リスタートを試み、回復不能なら片付ける
    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'failed') {
        console.warn(`[VoiceChat] ピア ${peerId} ICE失敗 → リスタート試行`);
        try {
          pc.restartIce();
        } catch {
          this.handlePeerLeft(peerId);
        }
      }
    };

    pc.onconnectionstatechange = () => {
      console.log(`[VoiceChat] ピア ${peerId} 接続状態: ${pc.connectionState}`);
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        this.handlePeerLeft(peerId);
      }
    };

    this.peers.set(peerId, peer);
    return peer;
  }
}

// シングルトンインスタンス
export const voiceChat = new VoiceChatManager();
