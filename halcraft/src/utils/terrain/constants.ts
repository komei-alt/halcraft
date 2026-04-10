// 地形モジュール共通定数

/** ヘリポートの中心座標（家の近く、開けた場所） */
export const HELIPORT_CENTER = { x: 15, z: -12 };
/** ヘリポートのサイズ */
export const HELIPORT_SIZE = 9;

/** 村の中心座標（ヘリで飛んでいく先） */
export const VILLAGE_CENTER = { x: 80, z: 80 };

/** 村の建物配置 */
export const VILLAGE_HOUSES = [
  { dx: 0, dz: 0, w: 6, d: 6, h: 4 },   // 中央の大きな家
  { dx: -10, dz: 2, w: 5, d: 5, h: 3 },  // 左の家
  { dx: 10, dz: -2, w: 5, d: 5, h: 3 },  // 右の家
  { dx: -5, dz: -10, w: 4, d: 4, h: 3 }, // 手前左の小屋
  { dx: 5, dz: -10, w: 4, d: 4, h: 3 },  // 手前右の小屋
  { dx: 0, dz: 12, w: 7, d: 5, h: 4 },   // 奥の大きな家
] as const;
