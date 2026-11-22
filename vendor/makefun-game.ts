// makefun-game.ts — the dossier builder for make.fun browser-game entries.
//
// An entry is a folder holding game/ (static files a browser can run
// offline, index.html at the root) and screenshots/ (a few PNG/JPEG
// renders, the alphabetically first one acting as the cover). buildDossier
// packs such a folder into the platform's dossier format: canonical JSON
// carrying the screenshots (hashed and base64-encoded) plus a text section
// that quotes the game's source files, in the order the page loads them,
// up to a byte budget. The output depends only on the input bytes — same
// folder in, same dossier out, on any machine.
//
// Everything here is Node's standard library and erasable TypeScript, so
// `node main.ts` runs it directly on Node 22+ with no build step.
//
// Exported surface:
//   buildDossier(dir, caps)   the dossier bytes for an entry folder
//   readGameTree(dir, caps)   the classified file listing of a game/ folder
//   classifyGamePath(path)    'source' | 'vendored' | 'asset' for a game path
//   htmlFacts(html)           scripts/links/resources/import maps of a page
//   importMapOf(facts)        the page's import map, parsed and validated
//   isRelativeRef(ref)        URL-reference relativity (no scheme, no //, no /)
//   isRelativeSpecifier(name) JS-module relativity (./ or ../)
//   resolveGamePath(ref,from) where a relative reference lands inside game/
//   importMapMatch(map, name, from) / mappedSpecifier(...)  import-map lookup
//   sourceImports(text)       static import specifiers of a module, in order
//   importOrder(sources, facts)  source scripts in page load order
//   canonicalJson(value)      JSON with sorted keys and no whitespace

import { createHash } from 'node:crypto';
import { lstatSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Schema tag written into every dossier. */
export const DOSSIER_SCHEMA = 'makefun/dossier/v1';
/** Hard ceiling on a finished dossier: 4 MiB. */
export const DOSSIER_MAX_BYTES = 4 * 1024 * 1024;
/** A dossier never carries more than this many images. */
export const DOSSIER_MAX_IMAGES = 8;
/** The one file every game/ folder must contain. */
export const INDEX_HTML = 'index.html';
/** game/index.html may be at most 1 MiB. */
export const INDEX_HTML_MAX_BYTES = 1024 * 1024;
/** Longest allowed path inside game/, measured in UTF-8 bytes. */
export const GAME_PATH_MAX_BYTES = 1000;
/** The Game summary names at most this many vendored files before counting the rest. */
const VENDORED_NAMED = 24;

/** Extensions that mark a file as quotable source. */
export const SOURCE_EXTENSIONS = ['html', 'js', 'mjs', 'css', 'glsl', 'vert', 'frag', 'wgsl', 'json'] as const;
const MINIFIED_NAME = /\.min\.(?:js|mjs|css)$/i;
const SOURCE_NAME = new RegExp(`\\.(?:${SOURCE_EXTENSIONS.join('|')})$`, 'i');
const MODULE_NAME = /\.(?:js|mjs)$/i;

/** How the dossier treats one file of game/: quoted, listed, or merely counted. */
export type GameFileClass = 'source' | 'vendored' | 'asset';

/** Names of the caps a refusal can blame. */
export type DossierLimit =
  | 'text_max_bytes'
  | 'screenshots.max'
  | 'screenshots.max_bytes'
  | 'game_max_files'
  | 'game_max_bytes'
  | 'game_path_max_bytes';

/** A refusal to build: bad input, or input past one of the caller's caps. */
export class DossierError extends Error {
  readonly limit: DossierLimit | null;
  constructor(message: string, limit: DossierLimit | null = null) {
    super(message);
    this.name = 'DossierError';
    this.limit = limit;
  }
}

/** Caps for walking a game/ tree; an absent cap means unbounded. */
export interface GameCaps {
  game_max_files?: number;
  game_max_bytes?: number;
  game_path_max_bytes?: number;
}

/** One file found under game/. */
export interface GameFile {
  path: string;
  bytes: number;
  cls: GameFileClass;
}

/** The full listing of a game/ folder. */
export interface GameTree {
  files: GameFile[];
  directories: string[];
  count: number;
  totalBytes: number;
}

/** Caps for a whole dossier build. */
export interface DossierCaps {
  text_max_bytes: number;
  screenshots?: { max: number; max_bytes: number };
  game_max_files?: number;
  game_max_bytes?: number;
  game_path_max_bytes?: number;
}

// ------------------------------------------------------------ small helpers

const decoder = new TextDecoder('utf-8');

/** Plain code-unit comparison — locale-independent, so sorts agree everywhere. */
function cmpStr(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function utf8Len(s: string): number {
  return Buffer.byteLength(s, 'utf8');
}

/** Decode bytes for display; malformed UTF-8 becomes replacement characters. */
function asText(bytes: Uint8Array): string {
  return decoder.decode(bytes);
}

/** Logical lines in a byte string: newline count, plus one for a trailing partial line. */
function countLines(bytes: Uint8Array): number {
  if (bytes.length === 0) return 0;
  let n = 0;
  for (const b of bytes) if (b === 0x0a) n++;
  return bytes[bytes.length - 1] === 0x0a ? n : n + 1;
}

/** A Markdown fence guaranteed longer than any backtick run inside the body. */
function pickFence(body: string): string {
  let longest = 0;
  for (const run of body.match(/`+/g) ?? []) longest = Math.max(longest, run.length);
  return '`'.repeat(Math.max(3, longest + 1));
}

/** The fence language tag used for a source path. */
function fenceLang(path: string): string {
  const ext = /\.([A-Za-z0-9]+)$/.exec(path)?.[1]?.toLowerCase() ?? '';
  switch (ext) {
    case 'js':
    case 'mjs':
      return 'js';
    case 'glsl':
    case 'vert':
    case 'frag':
      return 'glsl';
    case 'wgsl':
      return 'wgsl';
    case 'html':
      return 'html';
    case 'css':
      return 'css';
    case 'json':
      return 'json';
    default:
      return 'text';
  }
}

// ------------------------------------------------------------ the game tree

function checkedGameCaps(caps: GameCaps, who: string): Record<keyof GameCaps, number> {
  const out: Record<keyof GameCaps, number> = {
    game_max_files: Infinity,
    game_max_bytes: Infinity,
    game_path_max_bytes: GAME_PATH_MAX_BYTES,
  };
  for (const k of ['game_max_files', 'game_max_bytes', 'game_path_max_bytes'] as const) {
    const v = caps[k] as unknown;
    if (v === undefined) continue;
    if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < 0) {
      throw new TypeError(`${who}: caps.${k} must be a whole number, not ${String(v)}`);
    }
    out[k] = v;
  }
  return out;
}

/**
 * Classify one game-relative path. Anything below a directory called
 * `vendor`, and anything named *.min.js / *.min.mjs / *.min.css, is
 * vendored; a source extension anywhere else is source; the rest is asset.
 */
export function classifyGamePath(path: string): GameFileClass {
  const segs = path.split('/');
  const base = segs[segs.length - 1] ?? '';
  const dirs = segs.slice(0, -1);
  if (dirs.includes('vendor') || MINIFIED_NAME.test(base)) return 'vendored';
  return SOURCE_NAME.test(base) ? 'source' : 'asset';
}

/** True when classifyGamePath calls the path source. */
export function isSourcePath(path: string): boolean {
  return classifyGamePath(path) === 'source';
}

/**
 * Walk game/ once and report every file (path, size, class) and directory,
 * sorted by path. Links and other special entries are refused, as is any
 * tree past the given caps. Only directory listings are read here.
 */
export function readGameTree(gameDir: string, caps: GameCaps = {}): GameTree {
  const limits = checkedGameCaps(caps, 'readGameTree');
  let rootStat;
  try {
    rootStat = lstatSync(gameDir);
  } catch {
    throw new DossierError('game/: no such directory: a game is a directory of static files, its index.html at its root');
  }
  if (!rootStat.isDirectory()) {
    throw new DossierError('game/: not a directory (a game is a directory of static files)');
  }
  const files: GameFile[] = [];
  const directories: string[] = [];
  let count = 0;
  let totalBytes = 0;
  const pending: string[] = [''];
  while (pending.length > 0) {
    const rel = pending.pop()!;
    let entries;
    try {
      entries = readdirSync(rel === '' ? gameDir : join(gameDir, rel), { withFileTypes: true });
    } catch (err) {
      throw new DossierError(`game/${rel === '' ? '' : `${rel}/`}: cannot be read (${(err as Error).message})`);
    }
    for (const entry of entries) {
      const path = rel === '' ? entry.name : `${rel}/${entry.name}`;
      const pathBytes = utf8Len(path);
      if (pathBytes > limits.game_path_max_bytes) {
        throw new DossierError(
          `game/${path}: a path of ${pathBytes} bytes, over the ${limits.game_path_max_bytes} allowed (game_path_max_bytes)`,
          'game_path_max_bytes',
        );
      }
      let st;
      try {
        st = lstatSync(join(gameDir, path));
      } catch {
        throw new DossierError(`game/${path}: cannot be read`);
      }
      count++;
      if (count > limits.game_max_files) {
        throw new DossierError(`game/: holds more than the ${limits.game_max_files} files and directories allowed (game_max_files)`, 'game_max_files');
      }
      if (st.isDirectory()) {
        directories.push(path);
        pending.push(path);
      } else if (st.isFile()) {
        totalBytes += st.size;
        if (totalBytes > limits.game_max_bytes) {
          throw new DossierError(`game/: its files come to more than the ${limits.game_max_bytes} bytes allowed (game_max_bytes)`, 'game_max_bytes');
        }
        files.push({ path, bytes: st.size, cls: classifyGamePath(path) });
      } else {
        throw new DossierError(`game/${path}: a symbolic link or special file (game/ holds plain files and directories only)`);
      }
    }
  }
  files.sort((a, b) => cmpStr(a.path, b.path));
  directories.sort(cmpStr);
  return { files, directories, count, totalBytes };
}

/** Read game/index.html out of a walked tree, refusing the usual failure modes. */
function loadIndexHtml(gameDir: string, tree: GameTree): Uint8Array {
  const file = tree.files.find((f) => f.path === INDEX_HTML);
  if (file === undefined) {
    if (tree.directories.includes(INDEX_HTML)) {
      throw new DossierError('buildDossier: game/index.html: a directory, not the page');
    }
    throw new DossierError('buildDossier: game/index.html: no such file: a game is a directory of static files, its index.html at its root');
  }
  if (file.bytes > INDEX_HTML_MAX_BYTES) {
    throw new DossierError(`buildDossier: game/index.html: ${file.bytes} bytes, over the ${INDEX_HTML_MAX_BYTES} a page may be`);
  }
  try {
    return new Uint8Array(readFileSync(join(gameDir, INDEX_HTML)));
  } catch (err) {
    throw new DossierError(`buildDossier: game/index.html: cannot be read (${(err as Error).message})`);
  }
}

// ------------------------------------------------------------ the page scan

/** One <script> tag of a page. */
export interface HtmlScript {
  src: string | null;
  type: string;
  text: string;
}

/** One <link> tag of a page. */
export interface HtmlLink {
  href: string;
  rel: string;
}

/** One src-bearing resource tag: img, source, video, audio or iframe. */
export interface HtmlResource {
  tag: string;
  src: string;
}

const RESOURCE_TAGS = ['img', 'source', 'video', 'audio', 'iframe'] as const;

/** One <script type="importmap"> block: parsed JSON, or why it did not parse. */
export interface HtmlImportMap {
  value: unknown;
  error: string | null;
}

/** Everything the dossier needs to know about a page's outgoing references. */
export interface HtmlFacts {
  scripts: HtmlScript[];
  links: HtmlLink[];
  resources: HtmlResource[];
  importMaps: HtmlImportMap[];
}

/** Offset of the `>` that closes a tag opened before `from`, skipping quoted attribute values. */
function findTagEnd(html: string, from: number): number {
  let quote = '';
  for (let i = from; i < html.length; i++) {
    const ch = html[i]!;
    if (quote !== '') {
      if (ch === quote) quote = '';
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === '>') {
      return i;
    }
  }
  return -1;
}

/** Parse a tag's attribute text into a lowercase-name map; valueless attributes map to ''. */
function parseAttrs(body: string): Map<string, string> {
  const out = new Map<string, string>();
  let i = 0;
  while (i < body.length) {
    while (i < body.length && /[\s/]/.test(body[i]!)) i++;
    if (i >= body.length) break;
    const nameStart = i;
    while (i < body.length && !/[\s=/>]/.test(body[i]!)) i++;
    const name = body.slice(nameStart, i).toLowerCase();
    while (i < body.length && /\s/.test(body[i]!)) i++;
    let value = '';
    if (body[i] === '=') {
      i++;
      while (i < body.length && /\s/.test(body[i]!)) i++;
      const quote = body[i];
      if (quote === '"' || quote === "'") {
        const close = body.indexOf(quote, i + 1);
        value = body.slice(i + 1, close < 0 ? body.length : close);
        i = close < 0 ? body.length : close + 1;
      } else {
        const valueStart = i;
        while (i < body.length && !/[\s>]/.test(body[i]!)) i++;
        value = body.slice(valueStart, i);
      }
    }
    if (name !== '') out.set(name, value);
  }
  return out;
}

/** Offset of the next `</name` at or after `from`, ASCII case-insensitive. */
function findCloseTag(html: string, from: number, name: string): number {
  const needle = `</${name}`;
  for (let i = from; i + needle.length <= html.length; i++) {
    if (html[i] !== '<') continue;
    let hit = true;
    for (let j = 1; j < needle.length; j++) {
      if (html[i + j]!.toLowerCase() !== needle[j]) {
        hit = false;
        break;
      }
    }
    if (hit) return i;
  }
  return -1;
}

/**
 * Scan a page for the tags that reference files: scripts, links, resource
 * tags and import-map blocks, each in document order. This is deliberately
 * a tag scanner, not a full HTML parser — comments and the doctype are
 * skipped and only the attributes of interest are read.
 */
export function htmlFacts(html: string): HtmlFacts {
  const facts: HtmlFacts = { scripts: [], links: [], resources: [], importMaps: [] };
  let i = 0;
  while (i < html.length) {
    const at = html.indexOf('<', i);
    if (at < 0) break;
    if (html.startsWith('<!--', at)) {
      const end = html.indexOf('-->', at + 4);
      i = end < 0 ? html.length : end + 3;
      continue;
    }
    if (html.startsWith('<!', at)) {
      const end = html.indexOf('>', at + 2);
      i = end < 0 ? html.length : end + 1;
      continue;
    }
    const ahead = html.slice(at + 1, at + 8).toLowerCase();
    if (ahead.startsWith('script') && !/[A-Za-z0-9]/.test(html[at + 7] ?? '')) {
      const end = findTagEnd(html, at + 7);
      if (end < 0) break;
      const attrs = parseAttrs(html.slice(at + 7, end));
      const type = (attrs.get('type') ?? '').trim().toLowerCase();
      const src = attrs.get('src') ?? null;
      const close = findCloseTag(html, end + 1, 'script');
      const body = src === null ? html.slice(end + 1, close < 0 ? html.length : close) : '';
      i = close < 0 ? html.length : close + 8;
      if (type === 'importmap') {
        let value: unknown = null;
        let error: string | null = null;
        try {
          value = JSON.parse(body);
        } catch (err) {
          error = (err as Error).message;
        }
        facts.importMaps.push({ value, error });
      } else {
        facts.scripts.push({ src, type, text: body });
      }
      continue;
    }
    if (ahead.startsWith('link') && !/[A-Za-z0-9]/.test(html[at + 5] ?? '')) {
      const end = findTagEnd(html, at + 5);
      if (end < 0) break;
      const attrs = parseAttrs(html.slice(at + 5, end));
      const href = attrs.get('href');
      if (href !== undefined) facts.links.push({ href, rel: (attrs.get('rel') ?? '').trim().toLowerCase() });
      i = end + 1;
      continue;
    }
    const tag = RESOURCE_TAGS.find((name) => ahead.startsWith(name) && !/[A-Za-z0-9]/.test(html[at + 1 + name.length] ?? ''));
    if (tag !== undefined) {
      const end = findTagEnd(html, at + 1 + tag.length);
      if (end < 0) break;
      const attrs = parseAttrs(html.slice(at + 1 + tag.length, end));
      const src = attrs.get('src');
      if (src !== undefined) facts.resources.push({ tag, src });
      i = end + 1;
      continue;
    }
    const end = findTagEnd(html, at + 1);
    i = end < 0 ? html.length : end + 1;
  }
  return facts;
}

// ------------------------------------------------------------ import maps

/** A parsed import map: top-level imports plus per-scope overrides; null blocks a specifier. */
export interface ImportMap {
  imports: Record<string, string | null>;
  scopes: Record<string, Record<string, string | null>>;
}

/** The outcome of reading a page's import map: a map, an explanation, or neither. */
export interface ImportMapRead {
  map: ImportMap | null;
  error: string | null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Define an own property even for keys like "__proto__" that assignment would swallow. */
function setOwn<T>(o: Record<string, T>, key: string, value: T): void {
  Object.defineProperty(o, key, { value, enumerable: true, writable: true, configurable: true });
}

function readSpecMap(raw: unknown, where: string): { map: Record<string, string | null> } | { error: string } {
  if (!isPlainObject(raw)) return { error: `${where} is not an object` };
  const out: Record<string, string | null> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (value !== null && typeof value !== 'string') {
      return { error: `${where} maps ${JSON.stringify(key)} to no string` };
    }
    setOwn(out, key, value);
  }
  return { map: out };
}

/**
 * Extract the page's single import map. No map at all is fine (map and
 * error both null); a second map, unparseable JSON, or a malformed shape
 * yields an error string instead.
 */
export function importMapOf(facts: HtmlFacts): ImportMapRead {
  if (facts.importMaps.length === 0) return { map: null, error: null };
  if (facts.importMaps.length > 1) {
    return { map: null, error: `index.html holds ${facts.importMaps.length} import maps: a page holds one at most` };
  }
  const only = facts.importMaps[0]!;
  if (only.error !== null) return { map: null, error: `index.html's import map is not JSON (${only.error})` };
  if (!isPlainObject(only.value)) return { map: null, error: "index.html's import map is not a JSON object" };
  const importsRead = readSpecMap(only.value.imports ?? {}, 'index.html\'s import map holds an "imports" that');
  if ('error' in importsRead) return { map: null, error: importsRead.error };
  const scopes: Record<string, Record<string, string | null>> = {};
  const scopesRaw = only.value.scopes;
  if (scopesRaw !== undefined) {
    if (!isPlainObject(scopesRaw)) return { map: null, error: 'index.html\'s import map holds a "scopes" that is not an object' };
    for (const [scope, entries] of Object.entries(scopesRaw)) {
      const inner = readSpecMap(entries, `index.html's import map scope ${JSON.stringify(scope)}`);
      if ('error' in inner) return { map: null, error: inner.error };
      setOwn(scopes, scope, inner.map);
    }
  }
  return { map: { imports: importsRead.map, scopes }, error: null };
}

const SCHEME = /^[A-Za-z][A-Za-z0-9+.-]*:/;

/** Relative URL reference: non-empty, schemeless, not protocol-relative, not root-absolute. */
export function isRelativeRef(ref: string): boolean {
  return ref.length > 0 && !SCHEME.test(ref) && !ref.startsWith('//') && !ref.startsWith('/');
}

/** Relative module specifier in the JS sense: `.`, `..`, or starting ./ or ../ — bare names are not. */
export function isRelativeSpecifier(specifier: string): boolean {
  return specifier === '.' || specifier === '..' || specifier.startsWith('./') || specifier.startsWith('../');
}

/**
 * Resolve a relative reference against the importing file's game-relative
 * path, dropping any query or fragment. Null when the reference is not
 * relative, resolves to nothing, or climbs above game/.
 */
export function resolveGamePath(ref: string, from: string): string | null {
  if (!isRelativeRef(ref)) return null;
  const cut = ref.search(/[?#]/);
  const raw = cut < 0 ? ref : ref.slice(0, cut);
  if (raw === '') return null;
  const parts = from.split('/').slice(0, -1);
  for (const seg of raw.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') {
      if (parts.length === 0) return null;
      parts.pop();
    } else {
      parts.push(seg);
    }
  }
  return parts.length === 0 ? null : parts.join('/');
}

/** An import-map lookup result: whether anything matched, and the value (null = blocked). */
export interface ImportMapMatch {
  found: boolean;
  value: string | null;
}

/** One map's answer for a specifier: exact key first, else the longest trailing-slash prefix key. */
function lookupIn(entries: Record<string, string | null>, specifier: string): ImportMapMatch {
  if (Object.hasOwn(entries, specifier)) return { found: true, value: entries[specifier]! };
  let bestKey: string | null = null;
  for (const key of Object.keys(entries)) {
    if (key.endsWith('/') && specifier.startsWith(key) && (bestKey === null || key.length > bestKey.length)) {
      bestKey = key;
    }
  }
  if (bestKey === null) return { found: false, value: null };
  const base = entries[bestKey]!;
  return base === null ? { found: true, value: null } : { found: true, value: base + specifier.slice(bestKey.length) };
}

/** The game-relative prefix a scope key names, or null when it cannot name one. */
function scopePrefix(scope: string): string | null {
  const cut = scope.search(/[?#]/);
  const raw = cut < 0 ? scope : scope.slice(0, cut);
  if (raw === '.' || raw === './') return '';
  return resolveGamePath(scope, INDEX_HTML);
}

/**
 * Ask an import map about a specifier imported from `from`: the longest
 * matching scope wins over the top-level imports; inside a map, an exact
 * key wins over prefix keys; a null entry blocks the specifier outright.
 */
export function importMapMatch(map: ImportMap | null, specifier: string, from: string = INDEX_HTML): ImportMapMatch {
  if (map === null) return { found: false, value: null };
  let chosen: { prefix: string; entries: Record<string, string | null> } | null = null;
  for (const [scope, entries] of Object.entries(map.scopes)) {
    const prefix = scopePrefix(scope);
    if (prefix === null || !from.startsWith(prefix)) continue;
    if (chosen === null || prefix.length > chosen.prefix.length) chosen = { prefix, entries };
  }
  if (chosen !== null) {
    const scoped = lookupIn(chosen.entries, specifier);
    if (scoped.found) return scoped;
  }
  return lookupIn(map.imports, specifier);
}

/** The mapped value for a bare specifier, or null when unmapped or blocked. */
export function mappedSpecifier(map: ImportMap | null, specifier: string, from: string = INDEX_HTML): string | null {
  const match = importMapMatch(map, specifier, from);
  return match.found ? match.value : null;
}

/** Resolve any specifier to a game path: relative ones directly, bare ones through the map. */
function resolveSpecifier(specifier: string, from: string, map: ImportMap | null): string | null {
  if (isRelativeSpecifier(specifier)) return resolveGamePath(specifier, from);
  const match = importMapMatch(map, specifier, from);
  if (!match.found || match.value === null || !isRelativeRef(match.value)) return null;
  return resolveGamePath(match.value, INDEX_HTML);
}

// ------------------------------------------------------------ import scanning

const ID_START = /[A-Za-z_$]/;
const ID_CHAR = /[A-Za-z0-9_$]/;

/**
 * Collect a module's static import and export-from specifiers in source
 * order with a character-level scan. Comments, string literals, template
 * literals and regex literals are stepped over, so lookalike text inside
 * them is never mistaken for an import. This is a lexer, not a parser:
 * anything it cannot recognise is simply left out.
 */
export function sourceImports(source: string): string[] {
  const found: string[] = [];
  const n = source.length;
  let i = 0;
  // The previous significant character drives the regex-vs-division call:
  // a slash can only open a regex where a value cannot precede it.
  let prev = '';
  const regexAllowedHere = (): boolean => prev === '' || '([{,;:=!&|?+-*%^~<>'.includes(prev);

  function skipSpaceAndComments(): void {
    for (;;) {
      while (i < n && /\s/.test(source[i]!)) i++;
      if (source.startsWith('//', i)) {
        while (i < n && source[i] !== '\n') i++;
      } else if (source.startsWith('/*', i)) {
        const end = source.indexOf('*/', i + 2);
        i = end < 0 ? n : end + 2;
      } else {
        return;
      }
    }
  }

  function readString(quote: string): string | null {
    i++;
    let out = '';
    while (i < n) {
      const ch = source[i]!;
      if (ch === quote) {
        i++;
        return out;
      }
      if (ch === '\\') {
        const next = source[i + 1];
        if (next === undefined) return null;
        out += next === 'n' ? '\n' : next === 't' ? '\t' : next === 'r' ? '\r' : next;
        i += 2;
        continue;
      }
      if (ch === '\n') return null;
      out += ch;
      i++;
    }
    return null;
  }

  function skipTemplate(): void {
    i++;
    while (i < n) {
      const ch = source[i]!;
      if (ch === '\\') i += 2;
      else if (ch === '`') {
        i++;
        return;
      } else i++;
    }
  }

  function skipRegex(): void {
    i++;
    let inClass = false;
    while (i < n) {
      const ch = source[i]!;
      if (ch === '\\') {
        i += 2;
      } else if (ch === '[') {
        inClass = true;
        i++;
      } else if (ch === ']') {
        inClass = false;
        i++;
      } else if (ch === '/' && !inClass) {
        i++;
        return;
      } else if (ch === '\n') {
        return;
      } else i++;
    }
  }

  function readIdentifier(): string {
    const start = i;
    while (i < n && ID_CHAR.test(source[i]!)) i++;
    return source.slice(start, i);
  }

  function stringAhead(): string | null {
    skipSpaceAndComments();
    const ch = source[i];
    return ch === '"' || ch === "'" ? readString(ch) : null;
  }

  // After `import` or `export`, walk the clause until its `from 'x'`
  // (or a bare 'x' right after import) turns up; bail on `=` or `;`.
  function readClause(): string | null {
    for (;;) {
      skipSpaceAndComments();
      if (i >= n) return null;
      const ch = source[i]!;
      if (ch === '=' || ch === ';') return null;
      if (ch === '"' || ch === "'") return readString(ch);
      if (ch === '{' || ch === '}' || ch === ',' || ch === '*') {
        i++;
        continue;
      }
      if (ID_START.test(ch)) {
        if (readIdentifier() === 'from') return stringAhead();
        continue;
      }
      return null;
    }
  }

  while (i < n) {
    skipSpaceAndComments();
    if (i >= n) break;
    const ch = source[i]!;
    if (ch === '"' || ch === "'") {
      readString(ch);
      prev = ch;
      continue;
    }
    if (ch === '`') {
      skipTemplate();
      prev = '`';
      continue;
    }
    if (ch === '/') {
      if (regexAllowedHere()) skipRegex();
      else i++;
      prev = '/';
      continue;
    }
    if (ID_START.test(ch)) {
      const word = readIdentifier();
      prev = 'a';
      if (word === 'import') {
        skipSpaceAndComments();
        if (source[i] === '(' || source[i] === '.') continue; // dynamic import / import.meta
        const spec = readClause();
        if (spec !== null) found.push(spec);
      } else if (word === 'export') {
        skipSpaceAndComments();
        if (source[i] !== '*' && source[i] !== '{') continue;
        const spec = readClause();
        if (spec !== null) found.push(spec);
      }
      continue;
    }
    prev = ch;
    i++;
  }
  return found;
}

// ------------------------------------------------------------ load order

/** A source file handed to importOrder: its game-relative path and its bytes. */
export interface GameSource {
  path: string;
  bytes: Uint8Array;
}

/** The script type values (essences) that make a script a classic script. */
const CLASSIC_TYPES = new Set([
  'application/ecmascript', 'application/javascript', 'application/x-ecmascript',
  'application/x-javascript', 'text/ecmascript', 'text/javascript',
  'text/javascript1.0', 'text/javascript1.1', 'text/javascript1.2',
  'text/javascript1.3', 'text/javascript1.4', 'text/javascript1.5',
  'text/jscript', 'text/livescript', 'text/x-ecmascript', 'text/x-javascript',
]);

function isClassicType(type: string): boolean {
  return type === '' || CLASSIC_TYPES.has(type.split(';')[0]!.trim());
}

/**
 * Order the game's JS sources the way the page loads them: scripts in
 * document order; a classic script contributes its src where it stands; a
 * module script contributes itself followed by a depth-first walk of its
 * static imports (relative to the importer, or through the import map).
 * Anything unresolvable is skipped, and each file appears at most once.
 * index.html itself is never part of the result.
 */
export function importOrder(sources: readonly GameSource[], facts: HtmlFacts): string[] {
  const byPath = new Map(sources.map((s) => [s.path, s]));
  const map = importMapOf(facts).map;
  const order: string[] = [];
  const seen = new Set<string>();

  function visit(path: string, walkImports: boolean): void {
    if (seen.has(path) || !MODULE_NAME.test(path) || !byPath.has(path)) return;
    seen.add(path);
    order.push(path);
    if (!walkImports) return;
    const text = asText(byPath.get(path)!.bytes);
    for (const spec of sourceImports(text)) {
      const target = resolveSpecifier(spec, path, map);
      if (target !== null) visit(target, true);
    }
  }

  for (const script of facts.scripts) {
    if (script.type !== 'module') {
      if (isClassicType(script.type) && script.src !== null && isRelativeRef(script.src)) {
        const target = resolveGamePath(script.src, INDEX_HTML);
        if (target !== null) visit(target, false);
      }
      continue;
    }
    if (script.src !== null) {
      const target = isRelativeRef(script.src)
        ? resolveGamePath(script.src, INDEX_HTML)
        : resolveSpecifier(script.src, INDEX_HTML, map);
      if (target !== null) visit(target, true);
    } else {
      for (const spec of sourceImports(script.text)) {
        const target = resolveSpecifier(spec, INDEX_HTML, map);
        if (target !== null) visit(target, true);
      }
    }
  }
  return order;
}

// ------------------------------------------------------------ canonical JSON

/**
 * Serialise a JSON-shaped value deterministically: object keys in
 * code-unit order, no whitespace. Only null, booleans, finite numbers,
 * strings, arrays and plain objects are accepted; anything else throws.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError(`canonicalJson: ${value} is not a finite number`);
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map((v) => canonicalJson(v)).join(',')}]`;
  if (typeof value === 'object') {
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) {
      throw new TypeError('canonicalJson: only plain objects and arrays');
    }
    const obj = value as Record<string, unknown>;
    const parts = Object.keys(obj)
      .sort(cmpStr)
      .map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`);
    return `{${parts.join(',')}}`;
  }
  throw new TypeError(`canonicalJson: a ${typeof value} has no JSON form`);
}

// ------------------------------------------------------------ the dossier

const PNG_HEAD = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_HEAD = [0xff, 0xd8, 0xff];
const IMAGE_NAME_OK = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

function startsWithBytes(bytes: Uint8Array, magic: readonly number[]): boolean {
  return bytes.length >= magic.length && magic.every((b, idx) => bytes[idx] === b);
}

/** The extension a Game-block asset line groups by: text after the last dot, or '(none)'. */
function groupExtension(path: string): string {
  const base = path.split('/').pop() ?? '';
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : '(none)';
}

/** The summary block that opens every dossier text: counts by class, then totals. */
function gameSummaryLines(tree: GameTree): string[] {
  const sources = tree.files.filter((f) => f.cls === 'source');
  const vendored = tree.files.filter((f) => f.cls === 'vendored');
  const assets = tree.files.filter((f) => f.cls === 'asset');
  const sumBytes = (list: readonly GameFile[]): number => list.reduce((acc, f) => acc + f.bytes, 0);
  const lines = [
    '## Game',
    '',
    `Source files: ${sources.length} (${sumBytes(sources)} bytes)`,
    `Vendored files: ${vendored.length} (${sumBytes(vendored)} bytes)`,
  ];
  if (vendored.length > 0) {
    const named = vendored.slice(0, VENDORED_NAMED).map((f) => `game/${f.path} (${f.bytes} bytes)`);
    const rest = vendored.length > VENDORED_NAMED ? `, and ${vendored.length - VENDORED_NAMED} more` : '';
    lines.push(`  ${named.join(', ')}${rest}`);
  }
  const byExt = new Map<string, { n: number; bytes: number }>();
  for (const f of assets) {
    const ext = groupExtension(f.path);
    const slot = byExt.get(ext) ?? { n: 0, bytes: 0 };
    slot.n++;
    slot.bytes += f.bytes;
    byExt.set(ext, slot);
  }
  const assetText = [...byExt]
    .sort((a, b) => cmpStr(a[0], b[0]))
    .map(([ext, slot]) => `${ext} ${slot.n} (${slot.bytes} bytes)`)
    .join(', ');
  lines.push(`Assets: ${assetText === '' ? 'none' : assetText}`);
  lines.push(`Totals: ${tree.count} files and directories (${tree.totalBytes} bytes)`);
  return lines;
}

/** One source prepared for quoting: raw bytes, decoded text, fence, whole fenced block. */
interface PreparedSource {
  raw: Uint8Array;
  text: string;
  fence: string;
  block: string;
  blockBytes: number;
  lines: number;
}

/**
 * Render as much of an over-long source as fits in `room`: heading, then
 * whole lines inside the fence, then a note about the hidden lines, then
 * the caller's cut line (whose byte count depends on how much of this file
 * stayed hidden). Null when not even one line fits.
 */
function partialSection(
  heading: string,
  src: { raw: Uint8Array; text: string; fence: string },
  language: string,
  room: number,
  cutLineFor: (hiddenBytes: number) => string,
): string | null {
  const total = countLines(src.raw);
  const lines = src.text.split('\n');
  const open = `${src.fence}${language}\n`;
  const close = `${src.fence}\n\n`;
  const noteFor = (k: number): string => `[${total - k} of this file's ${total} lines not shown.]\n`;
  const overhead = utf8Len(heading) + utf8Len(open) + utf8Len(close);
  let best = 0;
  let shownBytes = 0;
  let rawCursor = 0;
  for (let k = 1; k < total; k++) {
    shownBytes += utf8Len(lines[k - 1]!) + 1;
    rawCursor = src.raw.indexOf(0x0a, rawCursor) + 1;
    const hidden = src.raw.length - rawCursor;
    if (overhead + shownBytes + utf8Len(noteFor(k)) + utf8Len(cutLineFor(hidden)) <= room) best = k;
  }
  if (best === 0) return null;
  let rawEnd = 0;
  for (let k = 0; k < best; k++) rawEnd = src.raw.indexOf(0x0a, rawEnd) + 1;
  const shownText = lines.slice(0, best).map((l) => `${l}\n`).join('');
  return `${heading}${open}${shownText}${close}${noteFor(best)}${cutLineFor(src.raw.length - rawEnd)}`;
}

/**
 * Build the dossier for the entry folder `dir`. The screenshots are
 * validated (count, size, PNG/JPEG magic, name shape), hashed and inlined;
 * the text quotes game/ sources — index.html first, then JS in load order,
 * then the rest by path — trimming at the byte cap on a line boundary and
 * noting what was left out. Refusals raise DossierError.
 */
export function buildDossier(dir: string, caps: DossierCaps): Uint8Array {
  const textCap = caps.text_max_bytes;
  if (!Number.isSafeInteger(textCap) || textCap <= 0) {
    throw new DossierError(`buildDossier: caps.text_max_bytes must be a positive integer, not ${String(textCap)}`, 'text_max_bytes');
  }
  // Screenshot ceilings: the caller's, when tighter than the format's own.
  let imageCountCap = { n: DOSSIER_MAX_IMAGES, whose: 'a dossier holds' };
  let imageBytesCap = { n: DOSSIER_MAX_BYTES, whose: 'a dossier holds' };
  if (caps.screenshots !== undefined) {
    const s = caps.screenshots as { max?: unknown; max_bytes?: unknown } | null;
    if (typeof s !== 'object' || s === null) {
      throw new DossierError('buildDossier: caps.screenshots must be an object {max, max_bytes}');
    }
    for (const k of ['max', 'max_bytes'] as const) {
      const v = s[k];
      if (typeof v !== 'number' || !Number.isSafeInteger(v) || v <= 0) {
        throw new DossierError(`buildDossier: caps.screenshots.${k} must be a positive integer, not ${String(v)}`, `screenshots.${k}`);
      }
    }
    if ((s.max as number) < imageCountCap.n) imageCountCap = { n: s.max as number, whose: 'caps.screenshots.max allows' };
    if ((s.max_bytes as number) < imageBytesCap.n) imageBytesCap = { n: s.max_bytes as number, whose: 'caps.screenshots.max_bytes allows' };
  }
  const gameCaps: GameCaps = {};
  for (const k of ['game_max_files', 'game_max_bytes', 'game_path_max_bytes'] as const) {
    const v = caps[k] as unknown;
    if (v === undefined) continue;
    if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < 0) {
      throw new DossierError(`buildDossier: caps.${k} must be a whole number, not ${String(v)}`, k);
    }
    gameCaps[k] = v;
  }

  const gameDir = join(dir, 'game');
  const tree = readGameTree(gameDir, gameCaps);
  const pageBytes = loadIndexHtml(gameDir, tree);
  const facts = htmlFacts(asText(pageBytes));

  const sourceFiles = tree.files
    .filter((f) => f.cls === 'source')
    .map((f) => ({ path: f.path, bytes: new Uint8Array(readFileSync(join(gameDir, f.path))) }));
  const loadOrder = importOrder(sourceFiles, facts).filter((p) => p !== INDEX_HTML);
  const placed = new Set<string>([INDEX_HTML, ...loadOrder]);
  const remainder = sourceFiles.map((s) => s.path).filter((p) => !placed.has(p)).sort(cmpStr);
  const sectionOrder = [INDEX_HTML, ...loadOrder, ...remainder];

  const prepared = new Map<string, PreparedSource>();
  function prepare(path: string): PreparedSource | null {
    const hit = prepared.get(path);
    if (hit !== undefined) return hit;
    const file = sourceFiles.find((s) => s.path === path);
    if (file === undefined) return null;
    const body = asText(file.bytes);
    const fence = pickFence(body);
    const block = `${fence}${fenceLang(path)}\n${body}${body.endsWith('\n') ? '' : '\n'}${fence}\n\n`;
    const made: PreparedSource = {
      raw: file.bytes,
      text: body,
      fence,
      block,
      blockBytes: utf8Len(block),
      lines: countLines(file.bytes),
    };
    prepared.set(path, made);
    return made;
  }

  // Screenshots: visible files only, name order, first one is the cover.
  const shotsDir = join(dir, 'screenshots');
  let shotsStat;
  try {
    shotsStat = lstatSync(shotsDir);
  } catch {
    throw new DossierError('buildDossier: no screenshots/ directory: an entry hands in 3 or 4 renders of its game, the first by name the cover');
  }
  if (!shotsStat.isDirectory()) {
    throw new DossierError('buildDossier: screenshots is not a directory: an entry hands in 3 or 4 renders of its game, the first by name the cover');
  }
  let shotNames: string[];
  try {
    shotNames = readdirSync(shotsDir, { withFileTypes: true })
      .filter((e) => e.isFile() && !e.name.startsWith('.'))
      .map((e) => e.name)
      .sort(cmpStr);
  } catch (err) {
    throw new DossierError(`buildDossier: screenshots/ cannot be read (${(err as Error).message})`);
  }
  if (shotNames.length === 0) {
    throw new DossierError('buildDossier: screenshots/ holds no image: the first is the cover');
  }
  if (shotNames.length > imageCountCap.n) {
    throw new DossierError(`buildDossier: screenshots/ holds ${shotNames.length} files, over the ${imageCountCap.n} ${imageCountCap.whose}`, 'screenshots.max');
  }
  const images = shotNames.map((name) => {
    if (!IMAGE_NAME_OK.test(name)) {
      throw new DossierError(`buildDossier: screenshots/${name}: a name is letters, digits and . _ -, 1 to 128 characters, not starting with . or -`);
    }
    const size = lstatSync(join(shotsDir, name)).size;
    if (size > imageBytesCap.n) {
      throw new DossierError(`buildDossier: screenshots/${name} is ${size} bytes, over the ${imageBytesCap.n} ${imageBytesCap.whose}`, 'screenshots.max_bytes');
    }
    const bytes = new Uint8Array(readFileSync(join(shotsDir, name)));
    if (bytes.length > imageBytesCap.n) {
      throw new DossierError(`buildDossier: screenshots/${name} is ${bytes.length} bytes, over the ${imageBytesCap.n} ${imageBytesCap.whose}`, 'screenshots.max_bytes');
    }
    const media_type = startsWithBytes(bytes, PNG_HEAD) ? 'image/png' : startsWithBytes(bytes, JPEG_HEAD) ? 'image/jpeg' : null;
    if (media_type === null) {
      throw new DossierError(`buildDossier: screenshots/${name} is neither a PNG nor a JPEG`);
    }
    return { name, media_type, sha256: sha256Hex(bytes), base64: Buffer.from(bytes).toString('base64') };
  });

  // Sections in dossier order, each a heading plus (usually) its fenced text.
  const sections = sectionOrder.map((path) => {
    const src = prepare(path);
    const lines = src === null ? 0 : src.lines;
    const bytes = src === null ? 0 : src.raw.length;
    const heading = `### game/${path} (${lines} ${lines === 1 ? 'line' : 'lines'}, ${bytes} bytes)\n\n`;
    const shown = lines === 0 ? null : src;
    return { heading, src: shown, size: utf8Len(heading) + (shown === null ? 0 : shown.blockBytes), bytes };
  });
  // bytesAfter[k]: total source bytes of the sections following section k.
  const bytesAfter = new Array<number>(sections.length).fill(0);
  for (let k = sections.length - 2; k >= 0; k--) {
    bytesAfter[k] = bytesAfter[k + 1]! + sections[k + 1]!.bytes;
  }

  const cutLine = (files: number, bytes: number): string =>
    `[Cut at ${textCap} bytes: ${files} file${files === 1 ? '' : 's'} and ${bytes} bytes of source left out.]\n`;

  const headerText = [...gameSummaryLines(tree), '', '## Sources', '', ''].join('\n');
  let text = headerText;
  let used = utf8Len(headerText);
  let kept = 0;
  while (kept < sections.length) {
    const section = sections[kept]!;
    const restCount = sections.length - kept - 1;
    // Reserve room for the cut line in case nothing after this section fits.
    const reserve = restCount === 0 ? 0 : utf8Len(cutLine(restCount, bytesAfter[kept]!));
    if (used + section.size + reserve > textCap) break;
    text += section.src === null ? section.heading : `${section.heading}${section.src.block}`;
    used += section.size;
    kept++;
  }
  if (kept < sections.length) {
    const first = sections[kept]!;
    const restCount = sections.length - kept - 1;
    const afterBytes = bytesAfter[kept]!;
    const partial = first.src === null
      ? null
      : partialSection(first.heading, first.src, fenceLang(sectionOrder[kept]!), textCap - used, (hidden) => cutLine(restCount, afterBytes + hidden));
    text += partial ?? cutLine(restCount + 1, afterBytes + first.bytes);
  }
  if (utf8Len(text) > textCap) {
    throw new DossierError(`buildDossier: caps.text_max_bytes ${textCap} cannot hold even the Game block and the cut line`, 'text_max_bytes');
  }

  const doc = { schema: DOSSIER_SCHEMA, cover: 0, text: text.replace(/\n+$/, '\n'), images };
  const out = Buffer.from(canonicalJson(doc), 'utf8');
  if (out.length > DOSSIER_MAX_BYTES) {
    throw new DossierError(`buildDossier: the dossier is ${out.length} bytes, over the ${DOSSIER_MAX_BYTES} one holds`);
  }
  return new Uint8Array(out.buffer, out.byteOffset, out.length);
}
