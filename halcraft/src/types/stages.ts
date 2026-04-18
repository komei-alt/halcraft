// ゲームのステージ（ワールド）とミッションの定義

export type MissionType = 'defeat_zombie' | 'place_block' | 'survive_night' | 'defend_core' | 'defeat_boss';

export interface Mission {
  type: MissionType;
  title: string;
  target: number;
  description: string;
}

export interface StageDefinition {
  id: string;
  name: string;
  description: string;
  mission: Mission;
  color: string;
}

export const STAGES: StageDefinition[] = [
  {
    id: 'world-1',
    name: 'はじまりの平原',
    description: '初めて遊ぶときにぴったりの場所。',
    mission: {
      type: 'defeat_zombie',
      title: 'ゾンビを倒せ！',
      target: 5,
      description: 'ゾンビを5匹倒そう',
    },
    color: '#8bc34a',
  },
  {
    id: 'world-2',
    name: '建築の森',
    description: '静かな森。家を建ててみよう！',
    mission: {
      type: 'place_block',
      title: '家を建てよう！',
      target: 20,
      description: 'ブロックを20個置こう',
    },
    color: '#4caf50',
  },
  {
    id: 'world-3',
    name: 'サバイバルの夜',
    description: '危険がいっぱいの世界...',
    mission: {
      type: 'survive_night',
      title: '朝まで生き残れ！',
      target: 1,
      description: '夜を越えて朝を迎えよう',
    },
    color: '#7b1fa2',
  },
  {
    id: 'world-4',
    name: 'クリスタル防衛戦',
    description: '迫りくるゾンビからクリスタルを守れ！',
    mission: {
      type: 'defend_core',
      title: '朝までクリスタルを防衛せよ',
      target: 1,
      description: 'コアが破壊される前に朝を迎えよう',
    },
    color: '#00bcd4',
  },
  {
    id: 'world-5',
    name: '巨大ボスの巣',
    description: '超巨大な敵が待ち受けている...',
    mission: {
      type: 'defeat_boss',
      title: '巨大ボスを討伐せよ！',
      target: 1,
      description: '巨大なボスを倒そう',
    },
    color: '#f44336',
  },
];
