// Telegram webhook: admin panel for the landing calculator (base price + add-on options).
import { getPricing, savePricing, kv } from '../lib/store.js';

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMINS = new Set((process.env.ADMIN_IDS || '').split(',').map((s) => s.trim()).filter(Boolean));
const ID = /^[\w-]{1,16}$/;

const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
const rub = (n) => `${Number(n).toLocaleString('ru-RU')} ₽`;
const uid = () => Math.random().toString(36).slice(2, 8);
const btn = (text, data) => ({ text, callback_data: data });
const parsePrice = (s) => {
  const n = Number(String(s).replace(/[\s ₽]|руб\.?/gi, ''));
  return Number.isInteger(n) && n >= 0 && n <= 1e8 ? n : null;
};
const cleanName = (s) => {
  const v = String(s ?? '').replace(/\s+/g, ' ').trim();
  return v && v.length <= 40 ? v : null;
};

async function tg(method, body) {
  const res = await fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!json.ok && !/not modified/.test(json.description)) console.error(method, json.description);
  return json;
}

export async function POST(request) {
  if (!process.env.TELEGRAM_WEBHOOK_SECRET || request.headers.get('x-telegram-bot-api-secret-token') !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return new Response('forbidden', { status: 403 });
  }
  await handleUpdate(await request.json());
  return new Response('ok');
}

export async function handleUpdate(update) {
  const msg = update.message, cb = update.callback_query;
  const from = (msg || cb)?.from;
  if (!from) return;
  const chat = msg ? msg.chat.id : cb.message.chat.id;
  if (!ADMINS.has(String(from.id))) {
    if (cb) return tg('answerCallbackQuery', { callback_query_id: cb.id });
    return send(chat, `Это админ-панель сайта justice.\nВаш Telegram ID: <code>${from.id}</code> — добавьте его в ADMIN_IDS.`);
  }
  try {
    await (cb ? onButton(chat, cb) : onMessage(chat, msg));
  } catch (e) {
    console.error(e);
    if (cb) await tg('answerCallbackQuery', { callback_query_id: cb.id });
    await send(chat, `Ошибка: ${esc(e.message)}`);
  }
}

/* ---------- data ---------- */

// kind "b" is the base landing price, kind "o" an add-on option
const find = (p, kind, id) => (kind === 'b' ? p.base : p.options.find((o) => o.id === id));

function normalize(raw) {
  const name = cleanName(raw?.base?.name) || 'Лендинг', price = parsePrice(raw?.base?.price);
  if (price == null) throw new Error('в JSON нет base.price — базовой цены лендинга');
  if (raw.options != null && !Array.isArray(raw.options)) throw new Error('options должен быть массивом');
  return {
    base: { name, price },
    options: (raw.options || []).map((x) => {
      const n = cleanName(x?.name), pr = parsePrice(x?.price);
      if (!n || pr == null) throw new Error(`неверная опция ${esc(JSON.stringify(x)).slice(0, 80)}`);
      return { id: ID.test(x.id) ? x.id : uid(), name: n, price: pr };
    }),
  };
}

/* ---------- views ---------- */

function menuView(p) {
  return {
    text: [
      '<b>Калькулятор лендинга</b>',
      `База: ${esc(p.base.name)} — от ${rub(p.base.price)}`, '',
      '<b>Опции</b> — прибавляются к базе:',
      ...(p.options.length ? p.options.map((o) => `• ${esc(o.name)} — +${rub(o.price)}`) : ['—']), '',
      'Заменить всё сразу: пришлите JSON-файл (текущий — кнопка «Экспорт»).',
    ].join('\n'),
    kb: [
      [btn(`Базовая цена · ${rub(p.base.price)}`, 'e:b::p'), btn('Название', 'e:b::n')],
      ...p.options.map((o) => [btn(`+ ${o.name} · ${rub(o.price)}`, `v:o:${o.id}`)]),
      [btn('＋ Опция', 'add:o'), btn('Экспорт JSON', 'exp')],
    ],
  };
}

function optionView(p, id) {
  const o = find(p, 'o', id);
  if (!o) return menuView(p);
  return {
    text: `<b>${esc(o.name)}</b>\nОпция, позиция ${p.options.indexOf(o) + 1} из ${p.options.length}\nЦена: +${rub(o.price)}`,
    kb: [
      [btn('Цена', `e:o:${id}:p`), btn('Название', `e:o:${id}:n`)],
      [btn('↑ Выше', `mv:o:${id}:-1`), btn('↓ Ниже', `mv:o:${id}:1`), btn('Удалить', `del:o:${id}`)],
      [btn('← Назад', 'm')],
    ],
  };
}

function prompt(p, { act, kind, id, arg }) {
  if (act === 'add') return 'Название опции и цена через тире, например:\n<code>SEO-оптимизация — 5000</code>';
  const x = find(p, kind, id);
  if (!x) return 'Позиция не найдена.';
  return arg === 'p' ? `Новая цена для «${esc(x.name)}» (сейчас ${rub(x.price)}). Отправьте число.` : `Новое название для «${esc(x.name)}».`;
}

function apply(p, { act, kind, id, arg }, text) {
  if (act === 'add') {
    const m = text.match(/^(.+?)\s*[—–-]\s*([\d\s ]+)\s*(₽|руб\.?)?$/i);
    const name = m && cleanName(m[1]), price = m && parsePrice(m[2]);
    if (!name || price == null) return 'Формат: Название — 5000';
    p.options.push({ id: uid(), name, price });
    return {};
  }
  const x = find(p, kind, id);
  if (!x) return 'Позиция не найдена — возможно, её удалили.';
  if (arg === 'p') {
    const n = parsePrice(text);
    if (n == null) return 'Цена — целое число от 0, например 15000.';
    x.price = n;
  } else {
    const v = cleanName(text);
    if (!v) return 'От 1 до 40 символов.';
    x.name = v;
  }
  return kind === 'o' ? { id } : {};
}

/* ---------- handlers ---------- */

const send = (chat, text, view) =>
  tg('sendMessage', { chat_id: chat, parse_mode: 'HTML', text: view ? `${text ? text + '\n\n' : ''}${view.text}` : text, reply_markup: view && { inline_keyboard: view.kb } });

async function onButton(chat, cb) {
  const [act, kind, id, arg] = cb.data.split(':');
  const p = await getPricing();
  let view, toast;

  if (act === 'e' || act === 'add') {
    await kv.set(`state:${chat}`, { act, kind, id, arg }, 3600);
    await tg('answerCallbackQuery', { callback_query_id: cb.id });
    return send(chat, `${prompt(p, { act, kind, id, arg })}\n\nОтмена — /cancel`);
  }
  if (act === 'exp') {
    await tg('answerCallbackQuery', { callback_query_id: cb.id });
    return sendJson(chat, p);
  }
  if (act === 'mv') {
    const i = p.options.findIndex((o) => o.id === id), j = i + Number(arg);
    if (i >= 0 && j >= 0 && j < p.options.length) {
      [p.options[i], p.options[j]] = [p.options[j], p.options[i]];
      await savePricing(p);
    }
    view = optionView(p, id);
  } else if (act === 'del') {
    view = { text: `Удалить опцию «${esc(find(p, 'o', id)?.name)}»?`, kb: [[btn('Да, удалить', `DEL:o:${id}`), btn('Отмена', `v:o:${id}`)]] };
  } else if (act === 'DEL') {
    const i = p.options.findIndex((o) => o.id === id);
    if (i >= 0) {
      p.options.splice(i, 1);
      await savePricing(p);
      toast = 'Удалено';
    }
    view = menuView(p);
  } else {
    view = act === 'v' ? optionView(p, id) : menuView(p);
  }

  await tg('answerCallbackQuery', { callback_query_id: cb.id, text: toast });
  await tg('editMessageText', { chat_id: chat, message_id: cb.message.message_id, parse_mode: 'HTML', text: view.text, reply_markup: { inline_keyboard: view.kb } });
}

async function onMessage(chat, msg) {
  const text = (msg.text || '').trim();
  if (text === '/id') return send(chat, `Ваш Telegram ID: <code>${msg.from.id}</code>`);
  if (text === '/start' || text === '/menu' || text === '/cancel') {
    await kv.del(`state:${chat}`);
    return send(chat, text === '/cancel' ? 'Отменено.' : '', menuView(await getPricing()));
  }
  if (msg.document) return importJson(chat, await downloadJson(msg.document));
  if (text.startsWith('{')) return importJson(chat, text);

  const state = await kv.get(`state:${chat}`);
  const p = await getPricing();
  if (!state) return send(chat, '', menuView(p));
  const result = apply(p, state, text);
  if (typeof result === 'string') return send(chat, `${result}\nПопробуйте ещё раз или /cancel.`);
  await savePricing(p);
  await kv.del(`state:${chat}`);
  return send(chat, 'Сохранено. На сайте обновится в течение минуты.', result.id ? optionView(p, result.id) : menuView(p));
}

async function downloadJson(doc) {
  if (doc.file_size > 200_000) throw new Error('файл больше 200 КБ');
  const { result } = await tg('getFile', { file_id: doc.file_id });
  const res = await fetch(`https://api.telegram.org/file/bot${TOKEN}/${result.file_path}`);
  return res.text();
}

async function importJson(chat, text) {
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('это не JSON');
  }
  const p = normalize(raw);
  await savePricing(p);
  await kv.del(`state:${chat}`);
  return send(chat, `Импортировано опций: ${p.options.length}.`, menuView(p));
}

async function sendJson(chat, p) {
  const form = new FormData();
  form.append('chat_id', chat);
  form.append('document', new Blob([JSON.stringify(p, null, 2)], { type: 'application/json' }), 'pricing.json');
  await fetch(`https://api.telegram.org/bot${TOKEN}/sendDocument`, { method: 'POST', body: form });
}
