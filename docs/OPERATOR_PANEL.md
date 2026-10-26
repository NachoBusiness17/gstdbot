# GSTD 3.7 — панель оператора / Operator dashboard

## Русский

Откройте адрес панели из установщика, обычно `http://localhost:8080`. У текущей машины — `http://100.93.119.75:8081` через Tailscale. Войдите с существующим PIN. Для первого входа используйте токен `~/.config/gstdbot/setup-token` на машине и новый PIN из 8–12 цифр. Секреты не отправляйте в чат.

### Выбор и установка модели

1. Откройте «Локальные модели» → «Выберите модель из интернета».
2. В списке доступны проверенные локальные варианты Qwen 3.5, Gemma 4, Qwen 3 Coder, GPT OSS и небольшие модели предыдущего поколения для слабых машин.
3. Для выбранной модели показаны размер загрузки, оценка RAM и совместимость: подходит по ресурсам, нужно освободить RAM, недостаточно RAM/диска либо ресурсы удалённого Ollama неизвестны.
4. Нажмите «Скачать модель» и дождитесь прогресса. После загрузки модель появляется в списке чата.
5. «Проверить каталог в интернете» сверяет размеры с официальным реестром Ollama; частота ограничена одним обновлением в 6 часов. Обычное открытие каталога не обращается к реестру.
6. В расширенном разделе можно указать другую локальную модель по имени. Теги cloud не разрешены.

Оценка предусматривает запас для ОС и короткий текстовый контекст. Она не гарантирует скорость, совместимость драйверов или запуск большого контекста. Для неизвестного удалённого Ollama не используются характеристики этой машины как доказательство совместимости. GPU без подтверждённых драйверов не выдаётся за гарантированное ускорение; VRAM разных машин не складывается.

Источники моделей: [Qwen 3.5](https://ollama.com/library/qwen3.5), [Gemma 4](https://ollama.com/library/gemma4), [оборудование Ollama](https://docs.ollama.com/gpu), [память и контекст](https://docs.ollama.com/faq). Если Ollama сообщает о старой версии, обновите её отдельно; драйверы установщик GSTD не заменяет.

### Привязка своего кошелька

В разделе «Кошелёк начислений» вставьте публичный адрес своего TON-кошелька (Tonkeeper и т. п.), отметьте применение к новым заданиям и нажмите **«Привязать мой кошелёк»**. Дождитесь подтверждения платформы. Seed-фраза и приватный ключ не нужны.

Адрес идентичности ноды показан отдельно и остаётся прежним. Привязка определяет получателя будущей принятой оплаченной работы; уже назначенные задания и ранее начисленные средства сохраняют прежнего получателя. Это не перевод старых балансов. Подмена адреса и повтор старой команды блокируются подписью и ревизией.

Указание публичного адреса не доказывает владение кошельком. Для доступа к его балансу нужна авторизация на [платформе](https://app.gstdtoken.com/payments). Получение и вывод не удерживают дополнительную комиссию GSTD; газ TON оплачивает подписант выплаты. Только принятая оплаченная работа делится 85/10/5; локальный и бесплатный чат не создают токены.

### Нагрузка и обновление

Панель показывает CPU, RAM, вычислительные слоты, HTTP-запросы с момента запуска, uptime, регистрацию и последний heartbeat. Это локальные измерения, не денежная статистика. Обновление раз в 30 секунд работает только в видимой вкладке и не опрашивает Cloudflare.

Обновление ноды запускается вручную: проверьте версию, изучите изменения, подтвердите установку/перезапуск. Git fast-forward, npm ci и полная сборка сохраняют ключи и конфигурацию; изменённые tracked-файлы не перезаписываются. Во время вычисления обновление отклоняется. Процесс должен запускаться через PM2/systemd для автоматического возврата после перезапуска.

Docker обновляется на машине: `git pull --ff-only`, `docker compose build`, `docker compose up -d`. Не используйте Git-обновление панели внутри контейнера.

### Linux и несколько машин

Проверка среды без установки:

```bash
curl -fsSL https://raw.githubusercontent.com/gstdcoin/gstdbot/main/install.sh | bash -s -- --check
```

Установка с автоматическим выбором небольшой стартовой модели:

```bash
curl -fsSL https://raw.githubusercontent.com/gstdcoin/gstdbot/main/install.sh | bash
```

Вместо автоматического выбора доступны `--model=qwen3.5:0.8b` и `--no-model`. Основные цели — Linux x86-64/ARM64 и WSL2. 32-битные ARM и нативный Windows не поддерживаются этим Bash-установщиком; для Windows нужен WSL2. macOS — best-effort и не подтверждён чистой установкой. На неизвестном дистрибутиве заранее установите Node.js 20+, npm, git и curl. Отдельные CPU, GPU и драйверы требуют проверки Ollama. Поддержка буквально любого устройства не заявляется.

Для нескольких Linux-хостов создайте `hosts.txt` (один SSH-адрес в строке) и используйте [пакетный установщик](../scripts/install-cluster.sh):

```bash
bash scripts/install-cluster.sh --hosts hosts.txt --wallet PUBLIC_TON_ADDRESS --plan
bash scripts/install-cluster.sh --hosts hosts.txt --wallet PUBLIC_TON_ADDRESS
```

SSH-доступ и записи known_hosts должны быть настроены заранее. Ключи нод создаются отдельно на каждой машине и не копируются. Существующие адреса/балансы не перезаписываются. Текущий лимит платформы — 10 живых идентичностей на один регистрационный кошелёк. Каждая машина — отдельная нода; это распределение запросов, а не объединение RAM/GPU для одной большой модели. Для публичного платного инференса каждой ноде нужен доступный HTTPS endpoint; пакетный установщик не создаёт туннели автоматически. Живого кластера для end-to-end проверки сейчас нет.

## English

Open the dashboard printed by the installer (normally port 8080; this machine uses 8081). Sign in with the existing PIN. First setup uses the local setup token and an 8–12 digit PIN.

- **Models:** select a reviewed local Ollama model from the internet catalog. Read the download size, estimated RAM, resource status and metadata date, then download. Installed models appear in the chat selector. Online metadata refresh is manual and limited to once per 6 hours. The advanced field accepts other local model names; cloud tags are blocked.
- **Compatibility:** estimates include OS headroom and short text context. They do not guarantee runtime, driver support or speed. Remote Ollama hardware is not inferred from the gateway machine. Memory across machines is not pooled.
- **Your wallet:** paste your public TON address, acknowledge that the change applies to new work, and press **Bind my wallet**. Wait for platform confirmation. Node identity is preserved. Previously assigned work and existing balances keep their old recipient; no balances move. Changes use node signatures and revisions. Wallet authentication on the platform is still required to access balances and withdrawals.
- **Load:** CPU, RAM, slots, request count, uptime and heartbeat are local measurements. Visible-tab refresh does not poll Cloudflare.
- **Updates:** manual Git source updates require npm, a successful build and PM2/systemd. Docker uses an image rebuild.
- **Hardware:** Linux x86-64/ARM64 and WSL2 are primary targets. Use `bash install.sh --check` before installation. Native Windows and 32-bit ARM are unsupported by this Bash installer; macOS is best-effort. Model runtime and GPU drivers need validation.
- **Multiple Linux machines:** use `scripts/install-cluster.sh --hosts hosts.txt --wallet PUBLIC_TON_ADDRESS --plan` to validate an inventory before installation. SSH and known_hosts must already be configured. Each host gets an independent identity. The current platform cap is 10 live identities per registration wallet. Public paid inference requires a reachable HTTPS endpoint per node; automatic tunnels and tensor-parallel multi-host execution are not provided. No physical cluster was available for an end-to-end deployment test.
