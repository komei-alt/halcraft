// 防具システムの型定義
// マイクラ風の防具スロット（ヘルメット・チェストプレート・レギンス・ブーツ）

/** 防具スロット */
export type ArmorSlot = 'helmet' | 'chestplate' | 'leggings' | 'boots';

/** 防具素材ティア */
export type ArmorMaterial = 'leather' | 'iron' | 'diamond';

/** 防具の固有ID */
export type ArmorId = `${ArmorMaterial}_${ArmorSlot}`;

/** 防具定義 */
export interface ArmorDef {
  id: ArmorId;
  name: string;
  slot: ArmorSlot;
  material: ArmorMaterial;
  /** 防御ポイント（0-20） */
  defense: number;
  /** 最大耐久値 */
  maxDurability: number;
  /** 表示用の絵文字 */
  emoji: string;
  /** テーマカラー（HUD用） */
  color: string;
}

/** 素材別の基本防御値 */
const MATERIAL_DEFENSE: Record<ArmorMaterial, Record<ArmorSlot, number>> = {
  leather: { helmet: 1, chestplate: 3, leggings: 2, boots: 1 },
  iron:    { helmet: 2, chestplate: 6, leggings: 5, boots: 2 },
  diamond: { helmet: 3, chestplate: 8, leggings: 6, boots: 3 },
};

/** 素材別の耐久値 */
const MATERIAL_DURABILITY: Record<ArmorMaterial, Record<ArmorSlot, number>> = {
  leather: { helmet: 55, chestplate: 80, leggings: 75, boots: 65 },
  iron:    { helmet: 165, chestplate: 240, leggings: 225, boots: 195 },
  diamond: { helmet: 363, chestplate: 528, leggings: 495, boots: 429 },
};

/** スロットの日本語名 */
const SLOT_NAMES: Record<ArmorSlot, string> = {
  helmet: 'ヘルメット',
  chestplate: 'チェストプレート',
  leggings: 'レギンス',
  boots: 'ブーツ',
};

/** 素材の日本語名 */
const MATERIAL_NAMES: Record<ArmorMaterial, string> = {
  leather: '革',
  iron: '鉄',
  diamond: 'ダイヤ',
};

/** 素材の絵文字 */
const MATERIAL_EMOJI: Record<ArmorSlot, string> = {
  helmet: '⛑️',
  chestplate: '🦺',
  leggings: '👖',
  boots: '👢',
};

/** 素材のカラー */
const MATERIAL_COLORS: Record<ArmorMaterial, string> = {
  leather: '#8B4513',
  iron: '#C0C0C0',
  diamond: '#00CED1',
};

/** 全防具定義を自動生成 */
function generateArmorDefs(): Record<ArmorId, ArmorDef> {
  const defs: Record<string, ArmorDef> = {};
  const materials: ArmorMaterial[] = ['leather', 'iron', 'diamond'];
  const slots: ArmorSlot[] = ['helmet', 'chestplate', 'leggings', 'boots'];

  for (const material of materials) {
    for (const slot of slots) {
      const id = `${material}_${slot}` as ArmorId;
      defs[id] = {
        id,
        name: `${MATERIAL_NAMES[material]}の${SLOT_NAMES[slot]}`,
        slot,
        material,
        defense: MATERIAL_DEFENSE[material][slot],
        maxDurability: MATERIAL_DURABILITY[material][slot],
        emoji: MATERIAL_EMOJI[slot],
        color: MATERIAL_COLORS[material],
      };
    }
  }

  return defs as Record<ArmorId, ArmorDef>;
}

/** 全防具定義 */
export const ARMOR_DEFS = generateArmorDefs();

/** 防具の総防御力を計算 */
export function calculateTotalDefense(equipped: Partial<Record<ArmorSlot, ArmorId | null>>): number {
  let total = 0;
  for (const armorId of Object.values(equipped)) {
    if (armorId) {
      const def = ARMOR_DEFS[armorId];
      if (def) total += def.defense;
    }
  }
  return total;
}

/** 防御力によるダメージ軽減計算（Minecraft 準拠） */
export function calculateDamageReduction(totalDefense: number): number {
  // Minecraft: ダメージ軽減 = defense * 4% (最大80%)
  return Math.min(0.8, totalDefense * 0.04);
}
