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
