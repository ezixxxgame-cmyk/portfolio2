// Telegram webhook: admin panel for the landing calculator (base price + add-on options) and portfolio works.
import { getPricing, savePricing, getWorks, saveWorks, kv } from '../lib/store.js';

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMINS = new Set((process.env.ADMIN_IDS || '').split(',').map((s) => s.trim()).filter(Boolean));
const ID = /^[\w-]{1,16}$/;
const IMAGE = /^image\/(jpeg|png|webp)$/;

const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
const rub = (n) => `${Number(n).toLocaleString('ru-RU')} ₽`;
const uid = () => Math.random().toString(36).slice(2, 8);
const btn = (text, data) => ({ text, callback_data: data });
const parsePrice = (s) => {
  const n = Number(String(s).replace(/[\s ₽]|руб\.?/gi, ''));
  return Number.isInteger(n) && n >= 0 && n <= 1e8 ? n : null;
};
const cleanName = (s, max = 40) => {
  const v = String(s ?? '').replace(/\s+/g, ' ').trim();
  return v && v.length <= max ? v : null;
};
// '' or '-' means no link; a bare domain gets https://
const cleanUrl = (s) => {
  if (!s || s === '-') return '';
  try {
    const u = new URL(/^[a-z]+:/i.test(s) ? s : `https://${s}`);
    return /^https?:$/.test(u.protocol) && u.hostname.includes('.') && s.length <= 300 ? u.href : null;
  } catch {
    return null;
  }
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

// kind "b" is the base landing price, "o" an add-on option, "w" a portfolio work (stored apart, under "works")
const load = async (kind) => (kind === 'w' ? { works: await getWorks() } : getPricing());
const save = (d, kind) => (kind === 'w' ? saveWorks(d.works) : savePricing(d));
const list = (d, kind) => (kind === 'w' ? d.works : d.options);
const find = (d, kind, id) => (kind === 'b' ? d.base : list(d, kind).find((x) => x.id === id));

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
      [btn('Проекты в портфолио →', 'm:w')],
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

function worksView({ works }) {
  return {
    text: [
      '<b>Проекты в портфолио</b>',
      ...(works.length ? works.map((w, i) => `${i + 1}. ${esc(w.name)} — ${esc(w.tag)}`) : ['Пока пусто.']), '',
      'На сайте идут в этом порядке, перед демо-карточками.',
      'Быстрое добавление: пришлите скриншот с подписью в любой момент.',
    ].join('\n'),
    kb: [
      ...works.map((w) => [btn(w.name, `v:w:${w.id}`)]),
      [btn('＋ Проект', 'add:w'), btn('← Калькулятор', 'm')],
    ],
  };
}

function workView(d, id) {
  const w = find(d, 'w', id);
  if (!w) return worksView(d);
  return {
    text: [
      `<b>${esc(w.name)}</b> · ${esc(w.tag)}`, esc(w.desc), w.url ? esc(w.url) : 'Без ссылки', '',
      `Позиция ${d.works.indexOf(w) + 1} из ${d.works.length}`,
    ].join('\n'),
    kb: [
      [btn('Название', `e:w:${id}:n`), btn('Тип', `e:w:${id}:t`), btn('Описание', `e:w:${id}:d`)],
      [btn('Ссылка', `e:w:${id}:u`), btn('Скриншот', `e:w:${id}:i`)],
      [btn('↑ Выше', `mv:w:${id}:-1`), btn('↓ Ниже', `mv:w:${id}:1`), btn('Удалить', `del:w:${id}`)],
      [btn('← Назад', 'm:w')],
    ],
  };
}

const menuOf = (d, kind) => (kind === 'w' ? worksView(d) : menuView(d));
const itemView = (d, kind, id) => (kind === 'w' ? workView(d, id) : optionView(d, id));

const ADD_WORK = [
  'Пришлите скриншот проекта (фото или файл JPG, PNG, WebP) с подписью в 3–4 строки:',
  '<code>Название\nТип, например Сайт\nКороткое описание\nhttps://ссылка</code>',
  'Ссылка — необязательно.',
].join('\n');
const WORK_FIELDS = { n: ['name', 'Новое название', 40], t: ['tag', 'Новый тип (Сайт, Приложение, CRM…)', 40], d: ['desc', 'Новое описание', 120] };

function prompt(p, { act, kind, id, arg }) {
  if (act === 'add') return kind === 'w' ? ADD_WORK : 'Название опции и цена через тире, например:\n<code>SEO-оптимизация — 5000</code>';
  const x = find(p, kind, id);
  if (!x) return 'Позиция не найдена.';
  if (kind === 'w') {
    if (arg === 'i') return `Пришлите новый скриншот для «${esc(x.name)}» — фото или файл JPG, PNG, WebP.`;
    if (arg === 'u') return `Ссылка на «${esc(x.name)}» (сейчас ${esc(x.url || 'нет')}). Отправьте https://… или «-», чтобы убрать.`;
    return `${WORK_FIELDS[arg][1]} для «${esc(x.name)}».`;
  }
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

function parseWork(text) {
  const lines = text.split('\n').map((s) => s.trim()).filter(Boolean);
  const url = cleanUrl(lines.length > 3 ? lines.pop() : '');
  const [name, tag, ...desc] = lines;
  const w = { id: uid(), name: cleanName(name), tag: cleanName(tag), desc: cleanName(desc.join(' '), 120), url };
  if (!w.name || !w.tag || !w.desc || url == null) {
    return 'Подпись — 3–4 строки: название (до 40 символов), тип (до 40), описание (до 120), ссылка (необязательно).';
  }
  return w;
}

// returns an error text, or { id } of the work to show plus { drop }: a replaced screenshot to delete after saving
async function applyWork(d, { act, id, arg }, text, image) {
  if (act === 'add') {
    if (!image) return 'Нужен скриншот: фото или файл JPG, PNG, WebP с подписью.';
    const w = parseWork(text);
    if (typeof w === 'string') return w;
    w.img = await storeImage(image);
    d.works = await getWorks(); // re-read after the slow upload: a parallel update may have saved meanwhile
    d.works.push(w);
    return { id: w.id };
  }
  const w = find(d, 'w', id);
  if (!w) return 'Проект не найден — возможно, его удалили.';
  if (arg === 'i') {
    if (!image) return 'Пришлите картинку: фото или файл JPG, PNG, WebP.';
    const drop = w.img;
    w.img = await storeImage(image);
    return { id, drop };
  }
  if (arg === 'u') {
    const url = cleanUrl(text);
    if (url == null) return 'Ссылка вида https://example.com или «-».';
    w.url = url;
  } else {
    const [field, , max] = WORK_FIELDS[arg], v = cleanName(text, max);
    if (!v) return `От 1 до ${max} символов.`;
    w[field] = v;
  }
  return { id };
}

/* ---------- handlers ---------- */

const send = (chat, text, view) =>
  tg('sendMessage', { chat_id: chat, parse_mode: 'HTML', text: view ? `${text ? text + '\n\n' : ''}${view.text}` : text, reply_markup: view && { inline_keyboard: view.kb } });

async function onButton(chat, cb) {
  const [act, kind, id, arg] = cb.data.split(':');
  const p = await load(kind);
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
    const items = list(p, kind), i = items.findIndex((o) => o.id === id), j = i + Number(arg);
    if (i >= 0 && j >= 0 && j < items.length) {
      [items[i], items[j]] = [items[j], items[i]];
      await save(p, kind);
    }
    view = itemView(p, kind, id);
  } else if (act === 'del') {
    const what = kind === 'w' ? 'проект' : 'опцию';
    view = { text: `Удалить ${what} «${esc(find(p, kind, id)?.name)}»?`, kb: [[btn('Да, удалить', `DEL:${kind}:${id}`), btn('Отмена', `v:${kind}:${id}`)]] };
  } else if (act === 'DEL') {
    const items = list(p, kind), i = items.findIndex((o) => o.id === id);
    if (i >= 0) {
      const [x] = items.splice(i, 1);
      await save(p, kind);
      if (x.img) await kv.del(`img:${x.img}`);
      toast = 'Удалено';
    }
    view = menuOf(p, kind);
  } else {
    view = act === 'v' ? itemView(p, kind, id) : menuOf(p, kind);
  }

  await tg('answerCallbackQuery', { callback_query_id: cb.id, text: toast });
  await tg('editMessageText', { chat_id: chat, message_id: cb.message.message_id, parse_mode: 'HTML', text: view.text, reply_markup: { inline_keyboard: view.kb } });
}

async function onMessage(chat, msg) {
  const text = (msg.text || msg.caption || '').trim();
  if (text === '/id') return send(chat, `Ваш Telegram ID: <code>${msg.from.id}</code>`);
  if (text === '/start' || text === '/menu' || text === '/cancel') {
    await kv.del(`state:${chat}`);
    return send(chat, text === '/cancel' ? 'Отменено.' : '', menuView(await getPricing()));
  }
  const doc = msg.document;
  const image = msg.photo ? { ...msg.photo.at(-1), mime_type: 'image/jpeg' } : IMAGE.test(doc?.mime_type) ? doc : null;
  if (doc && !image) return importJson(chat, await (await download(doc, 200_000)).text());
  if (!image && text.startsWith('{')) return importJson(chat, text);

  // a screenshot starts a new work unless the prompt asked for one; it never fills a text prompt
  const saved = await kv.get(`state:${chat}`);
  const state = image && !(saved?.kind === 'w' && (saved.act === 'add' || saved.arg === 'i')) ? { act: 'add', kind: 'w' } : saved;
  const p = await load(state?.kind);
  if (!state) return send(chat, '', menuView(p));
  const result = state.kind === 'w' ? await applyWork(p, state, text, image) : apply(p, state, text);
  if (typeof result === 'string') return send(chat, `${result}\nПопробуйте ещё раз или /cancel.`);
  await save(p, state.kind);
  if (result.drop) await kv.del(`img:${result.drop}`);
  await kv.del(`state:${chat}`);
  return send(chat, 'Сохранено. На сайте обновится в течение минуты.', result.id ? itemView(p, state.kind, result.id) : menuOf(p, state.kind));
}

async function download(file, max) {
  if (file.file_size > max) throw new Error(`файл больше ${max / 1000} КБ`);
  const { result } = await tg('getFile', { file_id: file.file_id });
  const res = await fetch(`https://api.telegram.org/file/bot${TOKEN}/${result.file_path}`);
  if (!res.ok) throw new Error(`Telegram не отдал файл (${res.status})`);
  return res;
}

async function storeImage(file) {
  const id = uid(), buf = Buffer.from(await (await download(file, 2_000_000)).arrayBuffer());
  await kv.set(`img:${id}`, { type: file.mime_type, data: buf.toString('base64') });
  return id;
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
