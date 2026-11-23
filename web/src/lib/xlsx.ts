// Excel minimal sans dépendance : lire la 1re colonne de la 1re feuille d'un .xlsx, et écrire un .xlsx d'une feuille.
// Un .xlsx est un zip de fichiers XML : lecture via DecompressionStream("deflate-raw"), écriture en zip « stocké ».

async function inflate(data: Uint8Array): Promise<Uint8Array> {
  const s = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(s).arrayBuffer());
}

/** Fichiers d'un zip (nom → contenu), via le répertoire central. */
async function unzip(buf: ArrayBuffer, want: (name: string) => boolean): Promise<Record<string, string>> {
  const b = new Uint8Array(buf);
  const v = new DataView(buf);
  let e = b.length - 22;
  while (e >= 0 && v.getUint32(e, true) !== 0x06054b50) e--;
  if (e < 0) throw new Error("Ce fichier n’est pas un Excel (.xlsx)");
  const n = v.getUint16(e + 10, true);
  let p = v.getUint32(e + 16, true);
  const out: Record<string, string> = {};
  const dec = new TextDecoder();
  for (let i = 0; i < n; i++) {
    const method = v.getUint16(p + 10, true);
    const size = v.getUint32(p + 20, true);
    const nl = v.getUint16(p + 28, true), xl = v.getUint16(p + 30, true), cl = v.getUint16(p + 32, true);
    const local = v.getUint32(p + 42, true);
    const name = dec.decode(b.subarray(p + 46, p + 46 + nl));
    p += 46 + nl + xl + cl;
    if (!want(name)) continue;
    const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
    const raw = b.subarray(start, start + size);
    out[name] = dec.decode(method === 0 ? raw : await inflate(raw));
  }
  return out;
}

const unxml = (s: string) => s.replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d)).replace(/&amp;/g, "&");

/** Valeurs de la colonne A de la 1re feuille (texte partagé, texte en ligne ou nombre). */
export async function readColumnA(file: File): Promise<string[]> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".xls")) throw new Error("Enregistre le fichier en .xlsx puis réessaie");
  const f = await unzip(await file.arrayBuffer(), (n) => n === "xl/sharedStrings.xml" || /^xl\/worksheets\/sheet\d+\.xml$/.test(n));
  const sheet = f["xl/worksheets/sheet1.xml"] ?? Object.entries(f).find(([k]) => k.includes("worksheets"))?.[1];
  if (!sheet) throw new Error("Feuille introuvable dans ce fichier");
  const shared = [...(f["xl/sharedStrings.xml"] ?? "").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => unxml(m[1].replace(/<rPh[\s\S]*?<\/rPh>/g, "")));
  const out: string[] = [];
  for (const m of sheet.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
    const attrs = m[1], inner = m[2] ?? "";
    if (!/\br="A\d+"/.test(attrs)) continue;
    const t = /\bt="(\w+)"/.exec(attrs)?.[1];
    const val = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1];
    const text = t === "s" ? shared[Number(val)] ?? "" : t === "inlineStr" ? unxml(inner) : unxml(val ?? "");
    out.push(text);
  }
  return out;
}

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
const crc32 = (d: Uint8Array) => {
  let c = 0xffffffff;
  for (const x of d) c = CRC[(c ^ x) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

function zip(files: [string, string][]): Blob {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const dir: Uint8Array[] = [];
  let off = 0;
  for (const [name, text] of files) {
    const n = enc.encode(name), d = enc.encode(text), c = crc32(d);
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(8, 0, true);
    h.setUint32(14, c, true); h.setUint32(18, d.length, true); h.setUint32(22, d.length, true); h.setUint16(26, n.length, true);
    parts.push(new Uint8Array(h.buffer), n, d);
    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true); cd.setUint16(4, 20, true); cd.setUint16(6, 20, true);
    cd.setUint32(16, c, true); cd.setUint32(20, d.length, true); cd.setUint32(24, d.length, true); cd.setUint16(28, n.length, true); cd.setUint32(42, off, true);
    dir.push(new Uint8Array(cd.buffer), n);
    off += 30 + n.length + d.length;
  }
  const size = dir.reduce((a, x) => a + x.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, size, true); end.setUint32(16, off, true);
  return new Blob([...parts, ...dir, new Uint8Array(end.buffer)].map((x) => x as BlobPart), { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

const xml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const col = (i: number) => String.fromCharCode(65 + i);

/** Un .xlsx d'une feuille ; `rows[0]` = en-têtes. */
export function writeXlsx(rows: string[][], sheetName = "Sheet1"): Blob {
  const data = rows
    .map((r, y) => `<row r="${y + 1}">${r.map((v, x) => `<c r="${col(x)}${y + 1}" t="inlineStr"><is><t xml:space="preserve">${xml(v)}</t></is></c>`).join("")}</row>`)
    .join("");
  return zip([
    ["[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`],
    ["_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ["xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${xml(sheetName)}" sheetId="1" r:id="rId1"/></sheets></workbook>`],
    ["xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`],
    ["xl/worksheets/sheet1.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols><col min="1" max="2" width="32" customWidth="1"/></cols><sheetData>${data}</sheetData></worksheet>`],
  ]);
}

export function download(blob: Blob, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
