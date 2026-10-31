/**
 * Список серверов
 * Можно расширять своими любимыми или загружать из API
 */

export interface Server {
  name: string;
  ip: string;
  port?: number;
  description?: string;
  version?: string;
  icon?: string;
}

export const DEFAULT_SERVERS: Server[] = [
  {
    name: 'Hypixel',
    ip: 'mc.hypixel.net',
    description: 'Самый популярный мини-игровой сервер',
    version: '1.8+',
  },
  {
    name: 'MineHut',
    ip: 'minehut.com',
    description: 'Бесплатный хостинг серверов',
  },
  {
    name: 'CubeCraft',
    ip: 'play.cubecraft.net',
    description: 'Мини-игры и выживание',
  },
];

export function getServers(): Server[] {
  // В будущем — загрузка из конфига / API
  return DEFAULT_SERVERS;
}
