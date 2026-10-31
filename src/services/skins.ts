/**
 * Сервис скинов
 * Поддержка официальных скинов Microsoft + Ely.by (популярно в русскоязычном сообществе)
 */

export interface SkinInfo {
  username: string;
  uuid?: string;
  skinUrl: string;
  capeUrl?: string;
  source: 'official' | 'elyby' | 'custom';
}

/**
 * Получить скин с Ely.by (работает и для offline аккаунтов)
 */
export function getElyBySkin(username: string): SkinInfo {
  return {
    username,
    skinUrl: `https://skinsystem.ely.by/skins/${encodeURIComponent(username)}.png`,
    capeUrl: `https://skinsystem.ely.by/capes/${encodeURIComponent(username)}.png`,
    source: 'elyby',
  };
}

/**
 * Официальный скин (требует UUID)
 */
export function getOfficialSkin(uuid: string, username: string): SkinInfo {
  // Используем Crafatar или официальный API
  return {
    username,
    uuid,
    skinUrl: `https://crafatar.com/skins/${uuid}`,
    capeUrl: `https://crafatar.com/capes/${uuid}`,
    source: 'official',
  };
}
