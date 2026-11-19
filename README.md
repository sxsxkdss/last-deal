# Last Deal

[English](#english) · [Русский](#русский) · [MIT License](LICENSE)

## English

Last Deal is a browser card game for 2–6 seats. Open a local table against bots or create an online room for people and bots. Cards have day and night faces. Play a single round or try a debt match with contracts, shops, and collectors.

### How to play

1. Select **Open table** to create an online room. Send your friends the room code or copy the invitation link. Use **Local table** to play offline. Choose a mode and rules preset, add bots if needed, then select **Deal**.
2. Everyone starts with seven cards. On your turn, match the top discard by colour or symbol, or play a legal wild card. Click a card or drag it onto the discard pile.
3. If you cannot play, click the deck to draw. Play an eligible card or pass when the table allows it. With **Draw till colour**, keep drawing until you find the required colour or a wild.
4. **Shift** flips the cards between day and night. **Eclipse** switches the phase for one turn. With stacking enabled, answer a draw attack with an equal or stronger draw card. When group plays are enabled, right-click or Shift-click to select cards for a multi-discard or poker combination.
5. An empty hand wins the round. If **Last Call** is enabled and triggers, the smallest hand wins. In a **debt match**, pass two cards to a neighbour before each round, then settle debt and spend chips in the shops between rounds. Collectors can eliminate players who exceed their debt limit. The last remaining player wins the match.

The in-game **Rules** panel describes the active options. See the [detailed rule reference in Russian](RULES.md) for card effects, contracts, items, and debt scoring.

### Run locally

Use Node.js 22.18 or newer with npm.

```sh
npm ci
npm run dev
```

Open the URL printed by Vite. Use `npm run build` for a production build in `dist/` or `npm test` to run the rule tests.

For online play, run `npm start` in a second terminal. Vite proxies `/ws` to the Node server on local port 3000. Open a table in one browser profile and join by code in the other. See the [network protocol](docs/network-protocol.md) and [server deployment steps](deploy/README.md#websocket-server--сетевой-сервер).

### Deploy to your VPS

These steps assume Ubuntu or Debian with systemd, root access, and a domain pointing to the VPS. Replace `game.example.com` with your domain. Check which service owns ports 80 and 443 before configuring HTTPS.

```sh
ssh root@game.example.com
ss -ltnp '( sport = :80 or sport = :443 )'
apt-get update
apt-get install -y git ca-certificates util-linux
env PATH=/usr/local/bin:/usr/bin:/bin node --version
env PATH=/usr/local/bin:/usr/bin:/bin npm --version
```

1. Install [Node.js 22.18 or newer](https://nodejs.org/en/download) with npm if Node.js is older or either version check fails. Install it system-wide so the updater can find it in `/usr/local/bin` or `/usr/bin`.
2. Install the updater and build the first release.

   ```sh
   cd /opt
   git clone --depth 1 https://github.com/sxsxkdss/last-deal.git last-deal-setup
   cd last-deal-setup
   id last-deal >/dev/null 2>&1 || useradd --system --user-group \
     --home-dir /var/lib/last-deal --shell /usr/sbin/nologin last-deal
   install -D -m 0755 deploy/update.sh /usr/local/libexec/last-deal-update
   install -m 0644 deploy/last-deal-update.service deploy/last-deal-update.timer /etc/systemd/system/
   systemctl daemon-reload
   systemctl start last-deal-update.service
   readlink /var/lib/last-deal/current
   ```

3. Use an existing TLS certificate for your domain or [obtain one with Certbot](deploy/README.md#tls-certificate--сертификат-tls). For a new certificate, standalone validation needs public TCP 80 and an available listener on that port. Use DNS validation if port 80 is occupied by Xray or 3X-UI. Keep certificate renewal configured.
4. Configure Nginx. For a fresh Nginx install, use the [installation commands](deploy/README.md#fresh-nginx-install--первая-установка-nginx). If Xray or 3X-UI owns port 443, choose a free port such as 8443 in the template and append it to the site URL. An existing Nginx can serve another hostname on 443. Check for an existing configuration for your domain before adding one.

   ```sh
   # From /opt/last-deal-setup, after installing Nginx and obtaining the certificate.
   domain=game.example.com
   sed "s/game\.example\.com/$domain/g" deploy/nginx.conf.example \
     > /etc/nginx/conf.d/last-deal.conf
   nginx -t && systemctl enable --now nginx && systemctl reload nginx
   ```

   If the certificate files are elsewhere, edit both paths in `last-deal.conf` before reloading. Enable the chosen TCP port in your VPS firewall. If the domain has an AAAA record pointing to this VPS, also add the corresponding IPv6 `listen` directive, for example `listen [::]:443 ssl;`.

5. Open `https://game.example.com/` and start a round. Enable automatic updates once the site works.

   ```sh
   systemctl enable --now last-deal-update.timer
   systemctl list-timers last-deal-update.timer
   ```

The timer checks `main` about every three minutes. The previous release stays online if a new build fails. Run `systemctl start last-deal-update.service` to check immediately, or `journalctl -u last-deal-update.service -n 40 --no-pager` to inspect the build log.

### Music and license

Put MP3, OGG, WAV, M4A, or FLAC files in [`src/classic/tracks/`](src/classic/tracks/). The player uses the filename by default. To supply a display title and artist, add an entry to [`playlist.json`](src/classic/tracks/playlist.json), such as `"night-table.mp3": { "title": "Night Table", "artist": "Artist name" }`. Rebuild after adding tracks.

Project code and documentation are released under the [MIT License](LICENSE). Third-party dependencies and any added music retain their own licenses. The classic table builds on the [legacy Last Deal project](https://github.com/sxsxkdss/last-deal-legacy).

## Русский

Last Deal — браузерная карточная игра на 2–6 мест. Можно открыть локальный стол против ботов или создать сетевую комнату для людей и ботов. У карт есть дневная и ночная стороны. Сыграй одну раздачу или матч на долг со сделками, лавками и коллекторами.

### Как играть

1. Нажми **Открыть стол**, чтобы создать сетевую комнату. Отправь друзьям код или скопируй ссылку-приглашение. Для игры без сервера выбери **Локальный стол**. Выбери режим и пресет правил, при необходимости добавь ботов и нажми **Сдать**.
2. Все начинают с семью картами. В свой ход положи карту того же цвета или символа, что и верхняя карта сброса, либо допустимого джокера. Карту можно сыграть кликом или перетащить в сброс.
3. Если ходить нечем, нажми на колоду. Сыграй подходящую карту или передай ход, когда стол это разрешит. При правиле **Тянуть до цвета** добирай, пока не найдёшь нужный цвет или джокера.
4. **Смена** переворачивает карты и переключает день и ночь. **Затмение** меняет фазу на один ход. При включённых стопках на атаку добором можно ответить равной или более сильной картой добора. Если разрешён групповой розыгрыш, отмечай карты правым кликом или кликом с Shift для мультисброса или покерной комбинации.
5. В раздаче выигрывает тот, кто первым опустошил руку. Если включён и сработал **Последний звонок**, побеждает игрок с наименьшим числом карт. В **матче на долг** перед каждой раздачей передай две карты соседу. Между раздачами начисляется долг и открываются лавки, где можно потратить фишки. Коллекторы могут вывести из матча игроков, превысивших лимит долга. Побеждает последний оставшийся игрок.

В меню **Правила** описаны настройки стола. Эффекты карт, сделки, предметы и расчёт долга собраны в [подробном справочнике](RULES.md).

### Локальный запуск

Нужен Node.js 22.18 или новее с npm.

```sh
npm ci
npm run dev
```

Открой адрес, который покажет Vite. Команда `npm run build` собирает сайт в `dist/`, а `npm test` запускает тесты правил.

Для сетевой игры запусти `npm start` во втором терминале. Vite направляет `/ws` на локальный порт 3000. В одном профиле браузера открой стол, в другом войди по коду. См. [сетевой протокол](docs/network-protocol.md) и [установку серверной службы](deploy/README.md#websocket-server--сетевой-сервер).

### Установка на свой VPS

Нужны Ubuntu или Debian с systemd, доступ под root и домен, указывающий на VPS. Замени `game.example.com` на свой домен. Перед настройкой HTTPS проверь, какие сервисы слушают порты 80 и 443.

```sh
ssh root@game.example.com
ss -ltnp '( sport = :80 or sport = :443 )'
apt-get update
apt-get install -y git ca-certificates util-linux
env PATH=/usr/local/bin:/usr/bin:/bin node --version
env PATH=/usr/local/bin:/usr/bin:/bin npm --version
```

1. Если версия Node.js ниже или одна из команд не работает, установи [Node.js 22.18 или новее](https://nodejs.org/en/download) с npm. Для службы нужна системная установка в `/usr/local/bin` или `/usr/bin`.
2. Установи обновлятор и собери первый релиз.

   ```sh
   cd /opt
   git clone --depth 1 https://github.com/sxsxkdss/last-deal.git last-deal-setup
   cd last-deal-setup
   id last-deal >/dev/null 2>&1 || useradd --system --user-group \
     --home-dir /var/lib/last-deal --shell /usr/sbin/nologin last-deal
   install -D -m 0755 deploy/update.sh /usr/local/libexec/last-deal-update
   install -m 0644 deploy/last-deal-update.service deploy/last-deal-update.timer /etc/systemd/system/
   systemctl daemon-reload
   systemctl start last-deal-update.service
   readlink /var/lib/last-deal/current
   ```

3. Используй действующий TLS-сертификат домена или [выпусти его с помощью Certbot](deploy/README.md#tls-certificate--сертификат-tls). Для проверки в режиме standalone нужен свободный TCP 80, доступный из интернета. Если 80 занят Xray или 3X-UI, используй проверку через DNS. Настрой продление сертификата.
4. Настрой Nginx. Для первой установки Nginx используй [отдельный блок команд](deploy/README.md#fresh-nginx-install--первая-установка-nginx). Если порт 443 занят Xray или 3X-UI, укажи в шаблоне свободный порт, например 8443, и добавь его к адресу сайта. Уже работающий Nginx может обслуживать ещё один домен на 443. Проверь, нет ли готового блока для твоего домена.

   ```sh
   # Из /opt/last-deal-setup после установки Nginx и получения сертификата.
   domain=game.example.com
   sed "s/game\.example\.com/$domain/g" deploy/nginx.conf.example \
     > /etc/nginx/conf.d/last-deal.conf
   nginx -t && systemctl enable --now nginx && systemctl reload nginx
   ```

   Если сертификат и ключ лежат в другой папке, исправь оба пути в `last-deal.conf` перед применением. Разреши выбранный TCP-порт в сетевом экране VPS. Если домен имеет запись AAAA для этого VPS, добавь соответствующую строку для IPv6, например `listen [::]:443 ssl;`.

5. Открой `https://game.example.com/` и начни раздачу. Когда сайт заработает, включи автообновление.

   ```sh
   systemctl enable --now last-deal-update.timer
   systemctl list-timers last-deal-update.timer
   ```

Таймер проверяет ветку `main` примерно раз в три минуты. Если новая сборка не удалась, VPS продолжит отдавать предыдущий релиз. Для немедленной проверки выполни `systemctl start last-deal-update.service`, для просмотра журнала — `journalctl -u last-deal-update.service -n 40 --no-pager`.

### Музыка и лицензия

Добавляй MP3, OGG, WAV, M4A или FLAC в [`src/classic/tracks/`](src/classic/tracks/). По умолчанию плеер показывает имя файла. Название и исполнителя можно задать в [`playlist.json`](src/classic/tracks/playlist.json), например `"night-table.mp3": { "title": "Ночной стол", "artist": "Имя исполнителя" }`. После добавления треков пересобери игру.

Код и документация проекта распространяются по [лицензии MIT](LICENSE). Сторонние зависимости и добавленная музыка сохраняют свои лицензии. Классический стол основан на [предыдущей версии Last Deal](https://github.com/sxsxkdss/last-deal-legacy).
