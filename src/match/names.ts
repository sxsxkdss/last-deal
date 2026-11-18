const NICK = {
  adj: [
    'Тёмный',
    'Кровавый',
    'Злой',
    'Мёртвый',
    'Чёрный',
    'Адский',
    'Безумный',
    'Ночной',
    'Стальной',
    'Ледяной',
    'Бешеный',
    'Тихий',
    'Проклятый',
    'Дикий',
  ],
  noun: [
    'Убийца',
    'Ангел',
    'Демон',
    'Волк',
    'Снайпер',
    'Призрак',
    'Палач',
    'Воин',
    'Рыцарь',
    'Ворон',
    'Охотник',
    'Киллер',
    'Лорд',
    'Монах',
    'Шаман',
    'Кот',
  ],
  of: ['Крови', 'Тьмы', 'Смерти', 'Ночи', 'Ада', 'Боли', 'Хаоса', 'Теней', 'Зла', 'Пустоты'],
  lat: [
    'DarK',
    'KiLLeR',
    'AnGeL',
    'DeMoN',
    'SnIpEr',
    'GhOsT',
    'NiGhT',
    'BlOoD',
    'ReAPeR',
    'WoLf',
    'ShAdOw',
    'ToXiC',
  ],
  num: (random) =>
    ['2003', '2004', '2005', '2002', '2006', '1999', '666', '777', '13', '228', '1337', '007'][
      Math.floor(random() * 12)
    ],
};

export function botNick(random: () => number) {
  const pickN = (a) => a[Math.floor(random() * a.length)];
  const r = random();
  const n =
    r < 0.3
      ? pickN(NICK.noun) + pickN(NICK.of) + NICK.num(random)
      : r < 0.5
        ? pickN(NICK.adj) + pickN(NICK.noun) + (random() < 0.6 ? NICK.num(random) : '')
        : r < 0.65
          ? 'xX_' + pickN(NICK.noun) + '_Xx'
          : r < 0.8
            ? pickN(NICK.lat) + '_' + pickN(NICK.lat)
            : r < 0.9
              ? pickN(NICK.lat) + NICK.num(random)
              : pickN(NICK.noun) + '_' + pickN(NICK.of);
  return n.slice(0, 20);
}
