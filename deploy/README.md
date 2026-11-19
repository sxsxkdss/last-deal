# Last Deal deployment notes

[English VPS tutorial](../README.md#deploy-to-your-vps) · [Установка на VPS](../README.md#установка-на-свой-vps)

## TLS certificate / Сертификат TLS

Use one method if you do not already have a certificate for the domain. Replace `game.example.com` with your domain.

Выбери один способ, если у домена ещё нет сертификата. Подставь свой домен вместо `game.example.com`.

**Standalone** — TCP 80 must be free and reachable from the internet. / TCP 80 должен быть свободен и доступен из интернета.

```sh
apt-get install -y certbot
certbot certonly --standalone --cert-name game.example.com -d game.example.com
```

**DNS** — use this if TCP 80 is busy or blocked. Follow the TXT-record prompt. / Если TCP 80 занят или закрыт, создай TXT-запись по подсказке Certbot.

```sh
apt-get install -y certbot
certbot certonly --manual --preferred-challenges dns \
  --cert-name game.example.com -d game.example.com
```

Standalone renewal still needs TCP 80. Manual DNS renewal requires a new TXT record. A provider-specific Certbot DNS plugin can automate it. Configure a deploy hook to reload Nginx when the certificate renews. [Certbot documentation](https://eff-certbot.readthedocs.io/en/stable/using.html#renewing-certificates)

Для продления через standalone по-прежнему нужен TCP 80. При ручной проверке DNS потребуется новая TXT-запись. Продление можно автоматизировать DNS-плагином провайдера и настроить перезагрузку Nginx после обновления сертификата. [Документация Certbot](https://eff-certbot.readthedocs.io/en/stable/using.html#renewing-certificates)

## Fresh Nginx install / Первая установка Nginx

Run this only if Nginx is not installed. The temporary mask prevents the package from starting the default HTTP site on port 80 during installation.

Выполняй этот блок только при первой установке Nginx. Временная маска не даёт пакету запустить стандартный HTTP-сайт на порту 80 во время установки.

```sh
(
  set -eu
  systemctl mask --runtime nginx.service
  trap 'systemctl unmask --runtime nginx.service' EXIT
  apt-get install -y nginx
  if [ -L /etc/nginx/sites-enabled/default ]; then
    unlink /etc/nginx/sites-enabled/default
  fi
)
```

Continue with step 4 in the main tutorial. / Продолжи с шага 4 основной инструкции.

## WebSocket server / Сетевой сервер

Complete steps 1–4 in the main tutorial first. From a checkout containing the server, install the new service and release helper as root. Replace the existing Nginx block with the updated template. It proxies only `/ws` to `127.0.0.1:3000`. If you use a nonstandard Node.js location, configure the same `PATH` for both systemd services.

Сначала выполни шаги 1–4 основной инструкции. Из копии репозитория с сервером установи новую службу и скрипт публикации от root. Обнови блок Nginx по шаблону, он проксирует только `/ws` на `127.0.0.1:3000`. При нестандартной установке Node.js задай одинаковый `PATH` для обеих служб systemd.

```sh
install -D -m 0755 deploy/update.sh /usr/local/libexec/last-deal-update
install -D -m 0755 deploy/publish.sh /usr/local/libexec/last-deal-publish
install -m 0644 deploy/last-deal-server.service /etc/systemd/system/
install -D -m 0644 deploy/server-update.conf /etc/systemd/system/last-deal-update.service.d/server.conf
systemctl daemon-reload
systemctl start last-deal-update.service
systemctl enable last-deal-server.service
curl -fsS http://127.0.0.1:3000/healthz
nginx -t && systemctl reload nginx
systemctl enable --now last-deal-update.timer
```

The timer builds client and server first. With a ready release, new matches are paused, reconnects still work, and the next timer runs check whether active matches have finished. The new services switch only at zero active matches. If the new runtime fails its health check, the publisher restores the old runtime and the old site remains current. The tracker is `journalctl -u last-deal-update.service -u last-deal-server.service`.

Таймер сначала собирает клиент и сервер. Готовая сборка ставит новые матчи на паузу, переподключение продолжает работать. При следующих запусках таймер проверяет, закончились ли активные матчи. Новая версия включается при нуле активных матчей. Если сервер не проходит проверку, скрипт возвращает старый сервер, прежняя статика остаётся доступной. Журнал: `journalctl -u last-deal-update.service -u last-deal-server.service`.

The publisher checks that `/healthz` reports the same Git commit as the prepared release before switching the site. If the candidate fails, starts resume only after the restored server passes its health check. To enable this on an existing installation, reinstall `deploy/publish.sh` from the updated checkout using the `install` command above. Installing the script alone leaves the game process running.

Перед переключением сайта скрипт сверяет коммит подготовленной сборки с полем `release` в `/healthz`. Если запуск новой версии не удался, новые матчи снова разрешаются после проверки восстановленного сервера. На действующем VPS установи свежий `deploy/publish.sh` из обновлённой копии репозитория командой `install` выше. Установка скрипта сама по себе не перезапускает игру.

Use the local health endpoint for a quick check and open the site from two browsers to verify a real game. TCP 3000 stays local. / Проверь локальный health и сыграй из двух браузеров. Входящий TCP 3000 открывать не нужно.

```sh
curl -fsS http://127.0.0.1:3000/healthz
readlink /var/lib/last-deal/runtime-current
cd /var/lib/last-deal/runtime-current
npm run stats:export -- /var/lib/last-deal/matches.sqlite
```
