/* Filtr „żartobliwych” zapisów (np. „Adolf H.”, wulgaryzmy).
   Taki zapis NIE trafia do bazy – zostaje tylko w localStorage tego telefonu,
   więc widzi go wyłącznie osoba, która go wpisała. */

// porównujemy bez polskich znaków, wielkości liter i „leetspeaku”
const flat = (s: string) => s
  .toLocaleLowerCase('pl')
  .replace(/ł/g, 'l')
  .normalize('NFD').replace(/\p{M}/gu, '')
  .replace(/[0@4]/g, (c) => (c === '0' ? 'o' : 'a'))
  .replace(/[1!|]/g, 'i').replace(/3/g, 'e').replace(/[5$]/g, 's').replace(/7/g, 't')
  .replace(/[^a-z]/g, '');

// całe imię (pierwsze słowo) równe jednemu z tych
const EXACT = ['adolf', 'adolfo', 'hitler', 'stalin', 'mussolini', 'himmler', 'goebbels', 'goering', 'mengele',
  'eichmann', 'heydrich', 'pinochet', 'putin', 'binladen', 'osama', 'kimdzongun', 'pol', 'polpot', 'lenin',
  'ss', 'nsdap', 'nazi', 'heil', 'sieg', 'zyd', 'zydek', 'murzyn', 'cygan',
  'dupa', 'cipa', 'cipka', 'siusiak', 'penis', 'jaja', 'jajo', 'cycki', 'cyc', 'sex', 'seks', 'porno',
  'debil', 'idiota', 'kretyn', 'cwok', 'glupek', 'frajer', 'leszcz', 'szmata', 'menel', 'zul', 'pedal', 'ciota'];
// fragmenty, które dyskwalifikują w dowolnym miejscu imienia
const PART = ['hitler', 'adolf', 'stalin', 'himmler', 'goebbels', 'nazi', 'heilh', 'siegheil', 'fuhrer', 'fuehrer',
  'chuj', 'huj', 'kurw', 'pizd', 'jeba', 'jebi', 'jebn', 'jebc', 'pierdol', 'pierdal', 'kutas', 'cwel', 'pedal',
  'pedzio', 'pedof', 'ciot', 'szmat', 'dziwk', 'sperm', 'cipsk', 'zjeb', 'wyjeb', 'dojeb', 'spierd', 'kurew',
  'czarnuch', 'nigg', 'nigga', 'fuck', 'shit', 'bitch', 'dick', 'cock', 'pussy', 'whore', 'faggot', 'retard',
  'kkk', 'jp2gmd', 'gmd', 'jp100'];

export function isBlockedName(first: string, initial = ''): boolean {
  const f = flat(first);
  const all = flat(first + initial);
  if (!f) return false;
  if (EXACT.includes(f) || EXACT.includes(all)) return true;
  return PART.some((p) => all.includes(p));
}

/* Lokalny „cień” zapisu – imię + status w poszczególnych meczach, tylko na tym telefonie */
type Status = 'in' | 'maybe' | 'out';
type Shadow = { name: string; games: Record<string, { status: Status; at: number }> };
const KEY = 'hala.local';
export const LOCAL_ID = 'local:me';

export function getShadow(): Shadow | null {
  try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); return s && typeof s.name === 'string' ? s : null; }
  catch { return null; }
}
export function setShadow(s: Shadow | null) {
  if (s) localStorage.setItem(KEY, JSON.stringify(s)); else localStorage.removeItem(KEY);
}
export function shadowSignup(name: string, gameId: string, status: Status): Shadow {
  const cur = getShadow();
  const s: Shadow = { name, games: { ...(cur?.name === name ? cur.games : {}) } };
  const prev = s.games[gameId];
  s.games[gameId] = { status, at: prev && prev.status === status ? prev.at : Date.now() };
  setShadow(s);
  return s;
}
