// scripts/build-material-atlas.mjs が生成。直接編集しない。
export const MATERIAL_ATLAS_SIZE = 2048 as const;
export const MATERIAL_ATLAS_CELL_SIZE = 256 as const;
export const MATERIAL_ATLAS_SLOTS = {
  "grass_top": {
    "u0": 0.003173828125,
    "v0": 0.878173828125,
    "u1": 0.121826171875,
    "v1": 0.996826171875
  },
  "grass_side": {
    "u0": 0.128173828125,
    "v0": 0.878173828125,
    "u1": 0.246826171875,
    "v1": 0.996826171875
  },
  "dirt": {
    "u0": 0.253173828125,
    "v0": 0.878173828125,
    "u1": 0.371826171875,
    "v1": 0.996826171875
  },
  "oak_bark": {
    "u0": 0.378173828125,
    "v0": 0.878173828125,
    "u1": 0.496826171875,
    "v1": 0.996826171875
  },
  "wood_planks": {
    "u0": 0.503173828125,
    "v0": 0.878173828125,
    "u1": 0.621826171875,
    "v1": 0.996826171875
  },
  "leaves": {
    "u0": 0.628173828125,
    "v0": 0.878173828125,
    "u1": 0.746826171875,
    "v1": 0.996826171875
  },
  "stone": {
    "u0": 0.753173828125,
    "v0": 0.878173828125,
    "u1": 0.871826171875,
    "v1": 0.996826171875
  },
  "bedrock": {
    "u0": 0.878173828125,
    "v0": 0.878173828125,
    "u1": 0.996826171875,
    "v1": 0.996826171875
  },
  "sandstone": {
    "u0": 0.003173828125,
    "v0": 0.753173828125,
    "u1": 0.121826171875,
    "v1": 0.871826171875
  },
  "sand": {
    "u0": 0.128173828125,
    "v0": 0.753173828125,
    "u1": 0.246826171875,
    "v1": 0.871826171875
  },
  "terracotta": {
    "u0": 0.253173828125,
    "v0": 0.753173828125,
    "u1": 0.371826171875,
    "v1": 0.871826171875
  },
  "snow_top": {
    "u0": 0.378173828125,
    "v0": 0.753173828125,
    "u1": 0.496826171875,
    "v1": 0.871826171875
  },
  "snow_side": {
    "u0": 0.503173828125,
    "v0": 0.753173828125,
    "u1": 0.621826171875,
    "v1": 0.871826171875
  },
  "ice": {
    "u0": 0.628173828125,
    "v0": 0.753173828125,
    "u1": 0.746826171875,
    "v1": 0.871826171875
  },
  "netherrack": {
    "u0": 0.753173828125,
    "v0": 0.753173828125,
    "u1": 0.871826171875,
    "v1": 0.871826171875
  },
  "soul_sand": {
    "u0": 0.878173828125,
    "v0": 0.753173828125,
    "u1": 0.996826171875,
    "v1": 0.871826171875
  },
  "iron": {
    "u0": 0.003173828125,
    "v0": 0.628173828125,
    "u1": 0.121826171875,
    "v1": 0.746826171875
  },
  "iron_cracked": {
    "u0": 0.128173828125,
    "v0": 0.628173828125,
    "u1": 0.246826171875,
    "v1": 0.746826171875
  },
  "iron_mossy": {
    "u0": 0.253173828125,
    "v0": 0.628173828125,
    "u1": 0.371826171875,
    "v1": 0.746826171875
  },
  "iron_ingot": {
    "u0": 0.378173828125,
    "v0": 0.628173828125,
    "u1": 0.496826171875,
    "v1": 0.746826171875
  },
  "glass": {
    "u0": 0.503173828125,
    "v0": 0.628173828125,
    "u1": 0.621826171875,
    "v1": 0.746826171875
  },
  "coal_ore": {
    "u0": 0.628173828125,
    "v0": 0.628173828125,
    "u1": 0.746826171875,
    "v1": 0.746826171875
  },
  "iron_ore": {
    "u0": 0.753173828125,
    "v0": 0.628173828125,
    "u1": 0.871826171875,
    "v1": 0.746826171875
  },
  "gold_ore": {
    "u0": 0.878173828125,
    "v0": 0.628173828125,
    "u1": 0.996826171875,
    "v1": 0.746826171875
  },
  "diamond_ore": {
    "u0": 0.003173828125,
    "v0": 0.503173828125,
    "u1": 0.121826171875,
    "v1": 0.621826171875
  },
  "gold_ingot": {
    "u0": 0.128173828125,
    "v0": 0.503173828125,
    "u1": 0.246826171875,
    "v1": 0.621826171875
  },
  "diamond_gem": {
    "u0": 0.253173828125,
    "v0": 0.503173828125,
    "u1": 0.371826171875,
    "v1": 0.621826171875
  },
  "enchant": {
    "u0": 0.378173828125,
    "v0": 0.503173828125,
    "u1": 0.496826171875,
    "v1": 0.621826171875
  },
  "electric": {
    "u0": 0.503173828125,
    "v0": 0.503173828125,
    "u1": 0.621826171875,
    "v1": 0.621826171875
  },
  "glowstone": {
    "u0": 0.628173828125,
    "v0": 0.503173828125,
    "u1": 0.746826171875,
    "v1": 0.621826171875
  },
  "nether_portal": {
    "u0": 0.753173828125,
    "v0": 0.503173828125,
    "u1": 0.871826171875,
    "v1": 0.621826171875
  },
  "chest": {
    "u0": 0.878173828125,
    "v0": 0.503173828125,
    "u1": 0.996826171875,
    "v1": 0.621826171875
  },
  "furnace": {
    "u0": 0.003173828125,
    "v0": 0.378173828125,
    "u1": 0.121826171875,
    "v1": 0.496826171875
  },
  "tnt": {
    "u0": 0.128173828125,
    "v0": 0.378173828125,
    "u1": 0.246826171875,
    "v1": 0.496826171875
  },
  "spawner": {
    "u0": 0.253173828125,
    "v0": 0.378173828125,
    "u1": 0.371826171875,
    "v1": 0.496826171875
  },
  "farmland": {
    "u0": 0.378173828125,
    "v0": 0.378173828125,
    "u1": 0.496826171875,
    "v1": 0.496826171875
  },
  "cactus": {
    "u0": 0.503173828125,
    "v0": 0.378173828125,
    "u1": 0.621826171875,
    "v1": 0.496826171875
  }
} as const;

export const MATERIAL_ATLAS_SPECS = {
  "grass_top": {
    "id": "grass_top",
    "family": "flora",
    "roughness": 0.9,
    "metalness": 0,
    "normalStrength": 1.15
  },
  "grass_side": {
    "id": "grass_side",
    "family": "soil",
    "roughness": 0.94,
    "metalness": 0,
    "normalStrength": 1.05
  },
  "dirt": {
    "id": "dirt",
    "family": "soil",
    "roughness": 0.98,
    "metalness": 0,
    "normalStrength": 1.15
  },
  "oak_bark": {
    "id": "oak_bark",
    "family": "wood",
    "roughness": 0.9,
    "metalness": 0,
    "normalStrength": 1.3
  },
  "wood_planks": {
    "id": "wood_planks",
    "family": "wood",
    "roughness": 0.84,
    "metalness": 0,
    "normalStrength": 1.05
  },
  "leaves": {
    "id": "leaves",
    "family": "flora",
    "roughness": 0.86,
    "metalness": 0,
    "normalStrength": 1.2,
    "alphaMode": "cutout"
  },
  "stone": {
    "id": "stone",
    "family": "stone",
    "roughness": 0.92,
    "metalness": 0,
    "normalStrength": 1.25
  },
  "bedrock": {
    "id": "bedrock",
    "family": "stone",
    "roughness": 0.96,
    "metalness": 0.02,
    "normalStrength": 1.35
  },
  "sandstone": {
    "id": "sandstone",
    "family": "sand",
    "roughness": 0.94,
    "metalness": 0,
    "normalStrength": 0.9
  },
  "sand": {
    "id": "sand",
    "family": "sand",
    "roughness": 0.98,
    "metalness": 0,
    "normalStrength": 0.7
  },
  "terracotta": {
    "id": "terracotta",
    "family": "terracotta",
    "roughness": 0.91,
    "metalness": 0,
    "normalStrength": 0.95
  },
  "snow_top": {
    "id": "snow_top",
    "family": "snow",
    "roughness": 0.8,
    "metalness": 0,
    "normalStrength": 0.65
  },
  "snow_side": {
    "id": "snow_side",
    "family": "snow",
    "roughness": 0.86,
    "metalness": 0,
    "normalStrength": 0.75
  },
  "ice": {
    "id": "ice",
    "family": "ice",
    "roughness": 0.22,
    "metalness": 0.02,
    "normalStrength": 0.45,
    "alphaMode": "blend"
  },
  "netherrack": {
    "id": "netherrack",
    "family": "nether",
    "roughness": 0.88,
    "metalness": 0,
    "normalStrength": 1.25,
    "emissive": 0.2
  },
  "soul_sand": {
    "id": "soul_sand",
    "family": "nether",
    "roughness": 0.97,
    "metalness": 0,
    "normalStrength": 1.1,
    "emissive": 0.08
  },
  "iron": {
    "id": "iron",
    "family": "metal",
    "roughness": 0.36,
    "metalness": 0.8,
    "normalStrength": 0.7
  },
  "iron_cracked": {
    "id": "iron_cracked",
    "family": "metal",
    "roughness": 0.52,
    "metalness": 0.65,
    "normalStrength": 1.05
  },
  "iron_mossy": {
    "id": "iron_mossy",
    "family": "metal",
    "roughness": 0.66,
    "metalness": 0.48,
    "normalStrength": 1
  },
  "iron_ingot": {
    "id": "iron_ingot",
    "family": "metal",
    "roughness": 0.28,
    "metalness": 0.92,
    "normalStrength": 0.55
  },
  "glass": {
    "id": "glass",
    "family": "glass",
    "roughness": 0.12,
    "metalness": 0.03,
    "normalStrength": 0.28,
    "alphaMode": "blend"
  },
  "coal_ore": {
    "id": "coal_ore",
    "family": "ore",
    "roughness": 0.9,
    "metalness": 0.06,
    "normalStrength": 1.2
  },
  "iron_ore": {
    "id": "iron_ore",
    "family": "ore",
    "roughness": 0.76,
    "metalness": 0.28,
    "normalStrength": 1.2
  },
  "gold_ore": {
    "id": "gold_ore",
    "family": "ore",
    "roughness": 0.52,
    "metalness": 0.5,
    "normalStrength": 1.25,
    "emissive": 0.08
  },
  "diamond_ore": {
    "id": "diamond_ore",
    "family": "ore",
    "roughness": 0.38,
    "metalness": 0.26,
    "normalStrength": 1.3,
    "emissive": 0.3
  },
  "gold_ingot": {
    "id": "gold_ingot",
    "family": "metal",
    "roughness": 0.24,
    "metalness": 0.94,
    "normalStrength": 0.55,
    "emissive": 0.08
  },
  "diamond_gem": {
    "id": "diamond_gem",
    "family": "crystal",
    "roughness": 0.18,
    "metalness": 0.12,
    "normalStrength": 0.75,
    "emissive": 0.42
  },
  "enchant": {
    "id": "enchant",
    "family": "magic",
    "roughness": 0.48,
    "metalness": 0.08,
    "normalStrength": 0.9,
    "emissive": 0.78
  },
  "electric": {
    "id": "electric",
    "family": "magic",
    "roughness": 0.34,
    "metalness": 0.4,
    "normalStrength": 0.75,
    "emissive": 0.92
  },
  "glowstone": {
    "id": "glowstone",
    "family": "magic",
    "roughness": 0.44,
    "metalness": 0.02,
    "normalStrength": 1,
    "emissive": 1
  },
  "nether_portal": {
    "id": "nether_portal",
    "family": "magic",
    "roughness": 0.26,
    "metalness": 0.04,
    "normalStrength": 0.55,
    "emissive": 1,
    "alphaMode": "blend"
  },
  "chest": {
    "id": "chest",
    "family": "wood",
    "roughness": 0.66,
    "metalness": 0.2,
    "normalStrength": 0.9
  },
  "furnace": {
    "id": "furnace",
    "family": "stone",
    "roughness": 0.82,
    "metalness": 0.12,
    "normalStrength": 1.1,
    "emissive": 0.42
  },
  "tnt": {
    "id": "tnt",
    "family": "functional",
    "roughness": 0.72,
    "metalness": 0.04,
    "normalStrength": 0.8
  },
  "spawner": {
    "id": "spawner",
    "family": "functional",
    "roughness": 0.46,
    "metalness": 0.56,
    "normalStrength": 0.9,
    "emissive": 0.62
  },
  "farmland": {
    "id": "farmland",
    "family": "soil",
    "roughness": 0.99,
    "metalness": 0,
    "normalStrength": 1.2
  },
  "cactus": {
    "id": "cactus",
    "family": "flora",
    "roughness": 0.82,
    "metalness": 0,
    "normalStrength": 0.9
  }
} as const;

export const PLANT_ATLAS_SIZE = 1024 as const;
export const PLANT_ATLAS_SLOTS = {
  "tall_grass": {
    "u0": 0.00048828125,
    "v0": 0.75048828125,
    "u1": 0.24951171875,
    "v1": 0.99951171875
  },
  "wildflower": {
    "u0": 0.25048828125,
    "v0": 0.75048828125,
    "u1": 0.49951171875,
    "v1": 0.99951171875
  },
  "bush": {
    "u0": 0.50048828125,
    "v0": 0.75048828125,
    "u1": 0.74951171875,
    "v1": 0.99951171875
  },
  "reed": {
    "u0": 0.75048828125,
    "v0": 0.75048828125,
    "u1": 0.99951171875,
    "v1": 0.99951171875
  },
  "mushroom": {
    "u0": 0.00048828125,
    "v0": 0.50048828125,
    "u1": 0.24951171875,
    "v1": 0.74951171875
  },
  "dead_bush": {
    "u0": 0.25048828125,
    "v0": 0.50048828125,
    "u1": 0.49951171875,
    "v1": 0.74951171875
  },
  "frost_grass": {
    "u0": 0.50048828125,
    "v0": 0.50048828125,
    "u1": 0.74951171875,
    "v1": 0.74951171875
  },
  "nether_fungus": {
    "u0": 0.75048828125,
    "v0": 0.50048828125,
    "u1": 0.99951171875,
    "v1": 0.74951171875
  },
  "cactus_blossom": {
    "u0": 0.00048828125,
    "v0": 0.25048828125,
    "u1": 0.24951171875,
    "v1": 0.49951171875
  }
} as const;

export type MaterialAtlasId = keyof typeof MATERIAL_ATLAS_SLOTS;
export type PlantAtlasId = keyof typeof PLANT_ATLAS_SLOTS;
