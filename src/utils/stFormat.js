import { calculateFigureMetrics } from './figureGeometry.js';

// Embro consume 18 valores de cabecera mediante fscanf antes de leer %d %f %f.
// Son 3 enteros, 8 reales y 7 enteros. Los saltos de línea no delimitan campos.
const HEADER_SIZE = 18;
const INTEGER_FIELDS = [0, 1, 2, 11, 12, 13, 14, 15, 16, 17];
const CODES = new Set([16, 32, 33]);
const numeric = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;
const signature = (points) => JSON.stringify(points.map(p => [Number(p.code), Number(p.x), Number(p.y)]));

/** Valida un registro sin redondear ni perder la precisión del archivo original. */
function readPoint(code, x, y) {
  if (!CODES.has(Number(code)) || ![x, y].every(v => numeric.test(v) && Number.isFinite(Number(v)))) {
    throw new Error('El archivo contiene una coordenada o código ST inválido.');
  }
  return { code: Number(code), x, y };
}

/** Importa ST nativo de Embro o listas de coordenadas anteriores de PlugiT. */
export function parseStText(text) {
  const matches = [...text.matchAll(/\S+/g)];
  const values = matches.map(match => match[0]);
  // Las listas sin cabecera empiezan con un código de trazo; el ST nativo, con 1/2.
  if (values[0] === '1' || values[0] === '2') {
    if (values.length < HEADER_SIZE || !values.slice(0, HEADER_SIZE).every(v => numeric.test(v) && Number.isFinite(Number(v)))) {
      throw new Error('La cabecera ST de Embro está incompleta o contiene valores inválidos.');
    }
    if (!INTEGER_FIELDS.every(i => Number.isSafeInteger(Number(values[i])))) {
      throw new Error('Los campos enteros de la cabecera ST no son válidos.');
    }
    const count = Number(values[17]);
    if (count < 0 || values.length !== HEADER_SIZE + count * 3) {
      throw new Error('La cantidad de coordenadas no coincide con la cabecera ST.');
    }
    const points = [];
    for (let i = HEADER_SIZE; i < values.length; i += 3) points.push(readPoint(values[i], values[i + 1], values[i + 2]));
    const prefixEnd = matches[17].index + matches[17][0].length;
    return {
      points,
      header: {
        tokens: values.slice(0, HEADER_SIZE),
        rawPrefix: text.slice(0, prefixEnd),
        originalText: text,
        originalSignature: signature(points),
      },
    };
  }

  // Compatibilidad con TXT, tabulaciones, comas decimales y comentarios.
  const points = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || /^(#|;|\/\/)/.test(line)) continue;
    let parts = line.split(/\s+/).map(p => p.replace(/[,;]$/, ''));
    if (parts.length < 3 && /[,;]/.test(line)) parts = line.split(/[,;]+/).map(p => p.trim());
    if (parts.length === 1 && parts[0] === '16') { points.push({ code: 16, x: '0', y: '0' }); continue; }
    if (!CODES.has(Number(parts[0]))) continue;
    if (parts.length !== 3) throw new Error('Cada coordenada debe contener código, X e Y.');
    points.push(readPoint(parts[0], parts[1].replace(',', '.'), parts[2].replace(',', '.')));
  }
  return { points, header: null };
}

/** Serializa números en la notación decimal que usa fscanf de Embro. */
function formatNumber(number) {
  const rounded = Math.round(number * 1e6) / 1e6;
  return Object.is(rounded, -0) ? '0' : String(rounded);
}

/** Exporta siempre una cabecera completa. Conserva sin reinterpretar los campos
 * no identificados de Embro, como 22/70, 1.00/1.03 y 101 en 002.ST.
 * Si no hubo ediciones, devuelve el texto original íntegro.
 */
export function generateStText(points, header = null) {
  if (!points.length) throw new Error('No hay coordenadas para generar el archivo ST.');
  for (const point of points) readPoint(String(point.code), String(point.x), String(point.y));
  if (header?.originalSignature === signature(points)) return header.originalText;
  const { bounds } = calculateFigureMetrics(points);
  // Perfil base observado en 003.ST: no se inventa el significado de sus parámetros.
  const tokens = header ? [...header.tokens] : ['1', '17', '0', '0', '0', '0', '0', '0', '0', '1.00', '1.00', '0', '0', '0', '0', '0', '0', '0'];
  if (tokens.length !== HEADER_SIZE) throw new Error('La cabecera ST debe contener 18 valores.');
  const replacements = new Map([
    [3, formatNumber(bounds.minX)], [4, formatNumber(bounds.maxX)],
    [5, formatNumber(bounds.minY)], [6, formatNumber(bounds.maxY)],
    [17, String(points.length)],
  ]);
  let prefix;
  if (header?.rawPrefix) {
    let index = 0;
    // Mantener los espacios y saltos de línea de las variantes de 9 y 10 líneas.
    prefix = header.rawPrefix.replace(/\S+/g, token => replacements.get(index++) ?? token);
  } else {
    for (const [i, value] of replacements) tokens[i] = value;
    prefix = [tokens[0], tokens.slice(1, 3).join(' '), tokens.slice(3, 5).join(' '), tokens.slice(5, 7).join(' '), tokens.slice(7, 9).join(' '), tokens.slice(9, 11).join(' '), tokens[11], tokens[12], tokens.slice(13, 17).join(' '), tokens[17]].join('\r\n');
  }
  const rows = points.map(p => `${p.code}\t${formatNumber(Number(p.x))}\t${formatNumber(Number(p.y))}`).join('\r\n');
  return `${prefix}\r\n${rows}\r\n`;
}
