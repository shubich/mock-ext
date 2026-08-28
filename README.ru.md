[English](README.md) | **Русский**

# MockWeave (расширение для Chrome)

**MockWeave** перехватывает HTTP-трафик страницы через **Chrome DevTools Protocol** (домен `Fetch`) и `chrome.debugger`. Работает **на каждую вкладку отдельно**, пока включён перехват.

## Два режима работы с HTTP

1. **Подмена ответа (по умолчанию)**  
   Для совпадающих URL браузер **не ходит** на реальный сервер. Вы задаёте **status, заголовки и body ответа** (CDP: `Fetch.fulfillRequest`). Удобно для сквозной симуляции API в приложении.

2. **Переопределение исходящего запроса**  
   Запрос **меняется** (method, URL, заголовки, body) и **уходит на реальный сервер**; приложение получает **настоящий** ответ (CDP: `Fetch.continueRequest`). Удобно для другого path, проверки заголовков/body или A/B одного и того же вызова.

**Сопоставление URL** одинаковое: полный `https://…`, regex, префиксы `re:` / `lit:` (ниже). Включите **Included**, чтобы URL считался совпавшим, если **содержит** ваш текст как подстроку (без regex).

**Порядок правил** важен: срабатывает **первое** включённое правило, которое подошло по URL.

## Установка (unpacked)

1. Откройте `chrome://extensions`
2. Включите **Режим разработчика**
3. **Загрузить распакованное расширение** → выберите папку `mock-ext`

## Включение

1. Откройте нужную вкладку с сайтом
2. Откройте **DevTools** (F12) и выберите вкладку **MockWeave** в верхней панели — в одном ряду с **Elements**, **Console**, **Network**, **Redux** и т.д. Если не видно — нажмите **>>** и закрепите MockWeave.
3. Включите **Intercept HTTP for the inspected page** (Chrome запросит разрешение на debugger)

Popup в toolbar по-прежнему доступен для быстрых правок; вкладка DevTools использует всю высоту панели (split view: список слева, редактор справа).

## Правила в popup

- **Режим**
  - **Fake response to the app** — status, **заголовки ответа**, **body ответа**
  - **Override outgoing request** — опционально **method**, **URL**, **заголовки запроса** (JSON, поверх реального запроса), **body запроса** (если body пустой и в правиле не было `requestBody`, остаётся оригинальный body страницы)
- **URL** — полный URL, `re:` / `lit:` / regex, или с **Included**: подстрока (например `hello/world` совпадёт с `https://api.example/hello/world/123`)

## Вкладка DevTools «MockWeave»

Панель на всю высоту (как Redux DevTools): **Captured**, **Rules** и **Send**. На Captured/Rules можно тянуть разделитель.

- **Captured requests** — трафик, пока открыты DevTools. Клик по строке — превью; двойной клик или **Replay in Send** — в Send; **Create mock** — правило из захваченного ответа.
- **Active rules** — **RES** = подмена ответа, **REQ** = переопределение запроса, **INC** = подстрока («included»). Клик по строке — редактирование body/headers на всю высоту.
- **Send** — ручной HTTP-клиент (Postman-lite):
  - **Direct** — расширение вызывает реальный API (моки **не** применяются; CORS страницы не мешает).
  - **Via page** — `fetch` во вкладке страницы (моки и cookies работают; сначала включите intercept).
  - **Create mock from response** — после успешного send.
  - **Saved requests** — боковая панель на Send; **Save** / **Save as…** / **Delete**; хранится в `chrome.storage.local` (JWT в headers сохраняется вместе с запросом).
  - **Import from curl** — вставьте **Copy as cURL** из Network; **Import** или **Import & Send** (`-H`, `-d`, `--json`, `-X`, `-u`, cookies). В DevTools clipboard API заблокирован — используйте **⌘V / Ctrl+V** в поле или кнопку **Paste**.

## Сопоставление URL

- **Included** (чекбокс) — URL как **обычный текст** в любом месте адреса запроса (подстрока). При Included не используются `re:`, `lit:` и regex.
- Начинается с `http(s)://` → **литерал** полного URL (`?` и `.` не ловушки regex).
- Префикс **`re:`** — regex после префикса
- Префикс **`lit:`** — принудительный литерал
- Иначе — трактуется как regex

## CORS и `OPTIONS`

- Для **response**-моков расширение добавляет CORS-заголовки и при credentialed `fetch` отражает **`Origin`** и **`Access-Control-Allow-Credentials`**. Preflight `OPTIONS` отвечает **204**, чтобы приложение могло прочитать (подменённый) ответ.
- Для **request** override отвечает **реальный** сервер — CORS как у сервера.

## Network vs подменённые ответы

При **Fake response** запросы **остаются** на вкладке **Network** DevTools. Это нормально: страница инициировала запрос, DevTools его залогировал; MockWeave меняет только **тело ответа** для приложения (`Fetch.fulfillRequest`), строку не скрывает.

Часто в **Response** / **Preview** Network:

> Failed to load response data — No data found for resource with given identifier

Это **ограничение Chrome DevTools**, а не признак того, что mock не сработал. Network хранит body реальных HTTP-ответов; у CDP-mock такого body в кэше DevTools нет.

| Где смотреть | Что видно |
| --- | --- |
| **Network → Response** | Часто пусто или ошибка выше |
| **Приложение / UI** | Mock-данные (если правило совпало) |
| **MockWeave → Captured** | Запрос + body при успешном захвате |
| **MockWeave → Rules** | Совпал ли URL, включено ли правило |

Для **Override outgoing request** (`REQ`) трафик идёт на сервер — в Network обычный запрос и ответ.

## Плашка «started debugging this browser»

При включённом intercept Chrome показывает жёлтую плашку, что расширение отладило браузер. Это **нельзя убрать** из кода расширения — требование безопасности Chrome для `chrome.debugger`. **Отмена** отключает перехват. Для локальной разработки можно запустить Chrome с флагом `--silent-debugger-extension-api` (скрывает предупреждение для всех debugger-расширений).

## После изменения кода

`chrome://extensions` → **Reload**. Снова включите mock на вкладке; переоткройте DevTools, если пропала вкладка панели.

## Идеи названий (если переименовывать)

- **MockWeave** (текущее) — «плетение» контроля запроса и ответа  
- **OverWire** — переопределение того, что на проводе  
- **CDP Tuner** — явно про DevTools Protocol  
- **NetFork** — разветвление трафика без выхода из DevTools  
- **ReqRes Rigger** — хуки в обе стороны  
- **TraceShift** — смена поведения при трассировке  
- **HTTP Braid** — несколько обработчиков / правил

## Ограничения

- **На вкладку**; debugger привязан к активной вкладке.  
- Только **первое** совпавшее правило.  
- **Request** и **response** для одного URL — **два** правила и **порядок** (более специфичное выше); одним правилом нельзя и fulfill ответ, и изменить запрос.  
- Невалидный regex → правило пропускается.  
- Очень большие body в панели **обрезаются** при захвате (~1 MB).  
- **Network → Response** может быть пустым для **fake response** (см. [Network vs подменённые ответы](#network-vs-подменённые-ответы)).

## Технически

- `Fetch.enable` на `*`, `Fetch.requestPaused` → `fulfillRequest` (response) или `continueRequest` (request)  
- Правила и saved requests в `chrome.storage.local`
