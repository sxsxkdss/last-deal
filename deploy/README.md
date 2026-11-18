# Автообновление Last Deal на VPS

`update.sh` забирает ветку `main` из `sxsxkdss/last-deal`, выполняет `npm ci` и собирает Vite в отдельном каталоге. Только успешная сборка переключает `/var/lib/last-deal/current` на новый коммит. Предыдущие релизы хранятся в `/var/lib/last-deal/releases`. Таймер systemd проверяет обновления каждые три минуты.

## Перед установкой

- Проверьте `ss -ltnp 'sport = :8443'` на VPS. Если порт уже занят Xray, 3X-UI или другим сервисом, сначала выберите с владельцем схему размещения. Второй процесс на том же IP и порту запустить нельзя.
- DNS домена должен указывать на VPS. Для HTTPS нужен сертификат этого домена. Сверьте пути в `nginx.conf.example` с реальными путями сертификата и ключа.
- Обновлятору нужны Git, Bash, tar, flock и Node.js 22.18+ с npm. Для обычной установки systemd использует Node.js из `/usr/local/bin` или `/usr/bin`.
- Опубликуйте целевую ревизию в Git, прежде чем включать обновления. Для другой ветки задайте `LAST_DEAL_BRANCH` в `/etc/default/last-deal`.

## Установка на Linux с systemd

Из каталога с этой версией репозитория выполните с административными правами

```sh
id last-deal >/dev/null 2>&1 || useradd --system --user-group --home-dir /var/lib/last-deal --shell /usr/sbin/nologin last-deal
install -D -m 0755 deploy/update.sh /usr/local/libexec/last-deal-update
install -m 0644 deploy/last-deal-update.service deploy/last-deal-update.timer /etc/systemd/system/
systemctl daemon-reload
systemctl start last-deal-update.service
journalctl -u last-deal-update.service -n 40 --no-pager
readlink /var/lib/last-deal/current
```

После успешной сборки добавьте блок из `nginx.conf.example` в активную конфигурацию Nginx. Подставьте домен и сертификат. Проверьте конфигурацию через `nginx -t`, затем примените её через `systemctl reload nginx`. Откройте `https://ВАШ-ДОМЕН:8443/` и проверьте загрузку файлов из `assets/` и локальную раздачу. При необходимости разрешите входящий TCP 8443 в действующих правилах хостинга и сервера.

```sh
systemctl enable --now last-deal-update.timer
systemctl list-timers last-deal-update.timer
```

Чтобы откатиться, остановите таймер, дождитесь завершения текущего обновления и атомарно замените ссылку `current` на проверенный каталог из `releases/`. Перед повторным включением таймера укажите исправленную ветку или исправьте её вершину.
