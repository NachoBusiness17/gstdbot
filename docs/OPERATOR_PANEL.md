# GSTD node operator dashboard / Панель оператора

## Русский

Откройте адрес панели, который напечатал установщик. Обычно это `http://localhost:8080`; на существующей установке может быть другой порт. Для текущей операторской машины используется порт 8081. Через Tailscale используйте адрес машины и её порт.

1. **Вход.** Существующий PIN сохраняется при обновлении. Для первого запуска выберите PIN из 8–12 цифр и введите локальный токен из `~/.config/gstdbot/setup-token`. Токен и PIN не публикуйте и не отправляйте в чат.
2. **Кошелёк начислений.** Если адрес ещё не задан, введите публичный TON-адрес вашего кошелька. Сохранение адреса и подтверждённая регистрация показаны отдельно. Seed-фраза и приватный ключ не нужны. Указание адреса не является доказательством владения. Уже закреплённый адрес показывается без возможности замены: безопасная миграция существующей ноды пока не реализована. Старые балансы автоматически не переносятся.
3. **Модели.** Раздел «Локальные модели» показывает модели, установленные в Ollama, их размер и наличие в памяти. Введите имя модели (например, `qwen2.5:0.5b` или `llama3.2:3b`) и нажмите «Скачать модель». Дождитесь завершения прогресса. Скачивание требует интернета и места на диске. Для запуска нужна подходящая RAM. Если Ollama недоступна, панель сообщает об этом, а не показывает выдуманные модели. Удаление моделей из панели не добавлено.
4. **Проверка.** Выберите установленную модель и отправьте вопрос. По умолчанию используется только эта нода. Передача вопроса другим нодам требует явного выбора сетевого режима.
5. **Нагрузка.** CPU, RAM, активные вычислительные слоты, HTTP-запросы после запуска, время работы и последний успешный heartbeat показываются в верхней карточке. Отдельно показана регистрация на платформе. Счётчики запросов и uptime обнуляются после перезапуска; это не денежная статистика.
6. **Награды.** Учёт, авторизация кошелька и вывод находятся на [платформе](https://app.gstdtoken.com/payments). Только принятая оплаченная работа делится 85/10/5. Бесплатный и локальный чат не создают токены. Вывод подписывает владелец кошелька обеспечения; это не автоматический расчёт ноды в блокчейне.
7. **Обновление.** Нажмите «Проверить версию», изучите список изменений, затем подтвердите установку и перезапуск. Обновление Git-установки использует fast-forward, `npm ci` и полную сборку; при изменённых tracked-файлах оно отказывается их перезаписывать. Во время вычисления обновление отклоняется. После перезапуска потребуется новый вход. Процесс должен запускаться через PM2 или systemd, чтобы автоматически подняться после выхода.
8. **Docker.** Обновляйте из checkout на машине: `git pull --ff-only`, `docker compose build`, `docker compose up -d`. Не применяйте Git-обновление панели внутри контейнера.

Панель не открывает SSH, shell, установку приложений и произвольные инструменты хоста. Обновление показателей раз в 30 секунд обращается только к локальной ноде и приостанавливается в скрытой вкладке. Проверка обновлений, установка моделей и открытие платёжного интерфейса выполняются по вашему действию.

## English

Open the dashboard address printed by the installer, normally `http://localhost:8080`. Existing installations may use a different port; this operator machine uses 8081. Tailscale access uses the machine address and its configured port.

- **Sign in:** existing PINs survive updates. First setup uses an 8–12 digit PIN and the local `~/.config/gstdbot/setup-token`. Keep both private.
- **Earning wallet:** enter a public TON address if none is configured. The panel distinguishes local persistence from confirmed platform registration. No seed or private key is requested. Entering an address is not proof of ownership. Replacing an existing bound address requires a separate migration that is not implemented; old balances do not move automatically.
- **Models:** view installed Ollama models, disk sizes and loaded state. Download a model by its Ollama name and wait for progress to finish. Check disk space, bandwidth and RAM. An unavailable Ollama service is reported explicitly. Model deletion is not provided by this panel.
- **Test:** select an installed model and ask a question. Local-only is the default; routing to another GSTD node requires explicit selection.
- **Load:** view CPU, RAM, active compute slots, HTTP request count since start, uptime and last successful heartbeat. Registration is shown separately. Restart resets request count and uptime; these are not financial figures.
- **Rewards:** open [platform payments](https://app.gstdtoken.com/payments) for accounting, wallet authentication and withdrawals. Only funded accepted work is split 85/10/5. Local and promotional requests create no rewards. The custody owner signs blockchain payouts.
- **Source updates:** check manually, review changes, then confirm update and restart. Updates use fast-forward Git, locked dependencies and a full build; tracked local changes are not overwritten. Busy compute blocks an update. PM2/systemd must restart the process. Sign in again after restart.
- **Docker:** update the checkout with `git pull --ff-only`, then `docker compose build` and `docker compose up -d`. Do not use the dashboard Git updater inside a container.

Local measurements refresh every 30 seconds only while visible; this does not poll Cloudflare. No shell, SSH or arbitrary host applications are exposed.
