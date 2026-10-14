import { getArcGeometry, getFigureSegments, sampleSegment } from './figureGeometry.js';

/**
 * dstFormat.js
 * Soporte para lectura y exportación binaria del formato Tajima DST (.dst)
 * Cumple con la especificación industrial Tajima:
 * - Cabecera fija de 512 bytes en texto ASCII / Latin-1 terminada con 0x1A y espacios 0x20
 * - Bloque de puntadas binario con codificación diferencial ternaria de 3 bytes por puntada
 * - Registro final de fin de patrón (0x00, 0x00, 0xF3) y byte 0x1A (EOF)
 * - Resolución estándar: 0.1 mm por unidad DST (1 mm = 10 unidades)
 */

// Lee un bit individual para recuperar los movimientos codificados en DST.
function getbit(b, pos) {
  return (b >> pos) & 1;
}

// Construye la máscara del bit que se activará al codificar un registro.
function bit(b) {
  return 1 << b;
}

/**
 * Decodifica el desplazamiento en X (en unidades de 0.1 mm) desde los 3 bytes del registro Tajima.
 */
export function decodeDx(b0, b1, b2) {
  return (
    getbit(b2, 2) * 81 - getbit(b2, 3) * 81 +
    getbit(b1, 2) * 27 - getbit(b1, 3) * 27 +
    getbit(b0, 2) * 9  - getbit(b0, 3) * 9 +
    getbit(b1, 0) * 3  - getbit(b1, 1) * 3 +
    getbit(b0, 0) * 1  - getbit(b0, 1) * 1
  );
}

/**
 * Decodifica el desplazamiento en Y (en unidades de 0.1 mm) desde los 3 bytes del registro Tajima.
 */
export function decodeDy(b0, b1, b2) {
  return (
    getbit(b2, 5) * 81 - getbit(b2, 4) * 81 +
    getbit(b1, 5) * 27 - getbit(b1, 4) * 27 +
    getbit(b0, 5) * 9  - getbit(b0, 4) * 9 +
    getbit(b1, 7) * 3  - getbit(b1, 6) * 3 +
    getbit(b0, 7) * 1  - getbit(b0, 6) * 1
  );
}

/**
 * Codifica un movimiento diferencial (dx, dy) y comando a un registro ternario Tajima de 3 bytes.
 * Límites de dx, dy: [-121, 121]
 */
export function encodeDstRecord(x, y, flags = 'stitch') {
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;

  if (flags === 'jump') {
    b2 += bit(7); // Bit 7 activo indica salto sin puntada
  }

  if (flags === 'stitch' || flags === 'jump') {
    b2 += bit(0);
    b2 += bit(1);

    let rx = x;
    if (rx > 40)  { b2 += bit(2); rx -= 81; }
    if (rx < -40) { b2 += bit(3); rx += 81; }
    if (rx > 13)  { b1 += bit(2); rx -= 27; }
    if (rx < -13) { b1 += bit(3); rx += 27; }
    if (rx > 4)   { b0 += bit(2); rx -= 9; }
    if (rx < -4)  { b0 += bit(3); rx += 9; }
    if (rx > 1)   { b1 += bit(0); rx -= 3; }
    if (rx < -1)  { b1 += bit(1); rx += 3; }
    if (rx > 0)   { b0 += bit(0); rx -= 1; }
    if (rx < 0)   { b0 += bit(1); rx += 1; }

    let ry = y;
    if (ry > 40)  { b2 += bit(5); ry -= 81; }
    if (ry < -40) { ry += 81; b2 += bit(4); }
    if (ry > 13)  { b1 += bit(5); ry -= 27; }
    if (ry < -13) { ry += 27; b1 += bit(4); }
    if (ry > 4)   { b0 += bit(5); ry -= 9; }
    if (ry < -4)  { ry += 9; b0 += bit(4); }
    if (ry > 1)   { b1 += bit(7); ry -= 3; }
    if (ry < -1)  { ry += 3; b1 += bit(6); }
    if (ry > 0)   { b0 += bit(7); ry -= 1; }
    if (ry < 0)   { ry += 1; b0 += bit(6); }
  } else if (flags === 'stop') {
    b2 = 0b11000011; // Cambio de color / parada
  } else if (flags === 'end') {
    b2 = 0b11110011; // 0xF3: Fin de diseño
  }

  return [b0, b1, b2];
}

/**
 * Discretiza un arco circular definido por 3 puntos (p0 inicial, p1 paso [32], p2 fin [33])
 * en una serie de puntos a lo largo de la curvatura.
 */
export function discretizeArc(p0, p1, p2, stepMm = 2.5) {
  const arc = getArcGeometry(p0, p1, p2);
  if (arc) return sampleSegment({ start: p0, end: p2, arc, length: arc.length }, stepMm);
  // Un control alineado conserva el recorrido por sus dos segmentos rectos.
  return [
    ...sampleSegment({ start: p0, end: p1, length: Math.hypot(p1.x - p0.x, p1.y - p0.y), arc: null }, stepMm),
    ...sampleSegment({ start: p1, end: p2, length: Math.hypot(p2.x - p1.x, p2.y - p1.y), arc: null }, stepMm),
  ];
}

/**
 * Analiza un Uint8Array de archivo binario DST y extrae las coordenadas en milímetros.
 */
export function parseDst(uint8) {
  if (uint8.byteLength < 512) {
    throw new Error('El archivo es demasiado pequeño para ser un formato DST válido (mínimo 512 bytes).');
  }

  // Extraer el texto completo de la cabecera (512 bytes)
  const headerBytes = uint8.subarray(0, 512);
  const headerText = new TextDecoder('latin1').decode(headerBytes);

  // Extraer el nombre de la figura (LA:) de la cabecera
  let label = '';
  let rawLabel = '';
  const matchLA = headerText.match(/LA:([^\r\n]*)/);
  if (matchLA) {
    rawLabel = matchLA[1];
    label = matchLA[1].trim();
  } else {
    for (let i = 3; i < 20; i++) {
      if (uint8[i] === 0x0d || uint8[i] === 0x0a) break;
      label += String.fromCharCode(uint8[i]);
    }
    rawLabel = label;
    label = label.trim();
  }

  const matchST = headerText.match(/ST:\s*(\d+)/);
  const matchCO = headerText.match(/CO:\s*(\d+)/);
  const matchPlusX = headerText.match(/\+X:\s*([+-]?\d+)/);
  const matchMinusX = headerText.match(/-X:\s*([+-]?\d+)/);
  const matchPlusY = headerText.match(/\+Y:\s*([+-]?\d+)/);
  const matchMinusY = headerText.match(/-Y:\s*([+-]?\d+)/);
  const matchAX = headerText.match(/AX:\s*([+-]?\d+)/);
  const matchAY = headerText.match(/AY:\s*([+-]?\d+)/);
  const matchMX = headerText.match(/MX:\s*([+-]?\d+)/);
  const matchMY = headerText.match(/MY:\s*([+-]?\d+)/);

  const isEmbroStyle = headerText.includes('ST:000') || headerText.includes('AX:+00000') || headerText.includes('CO:001');
  const hasHeaderSub = headerBytes.includes(0x1a);
  const hasTrailingSub = (uint8[uint8.length - 1] === 0x1a);

  let curX = 0;
  let curY = 0;
  const parsedPoints = [];

  for (let offset = 512; offset + 2 < uint8.length; offset += 3) {
    const b0 = uint8[offset];
    const b1 = uint8[offset + 1];
    const b2 = uint8[offset + 2];

    // Fin de archivo de puntadas (0b11110011 o 0xF3)
    if ((b2 & 0b11110011) === 0b11110011) {
      break;
    }

    const dx = decodeDx(b0, b1, b2);
    const dy = decodeDy(b0, b1, b2);

    curX += dx;
    curY += dy;

    // Convertir de unidades DST (0.1 mm) a milímetros (mm)
    parsedPoints.push({
      code: 16,
      x: (curX / 10).toFixed(1),
      y: (curY / 10).toFixed(1),
    });
  }

  const header = {
    label,
    rawLabel,
    rawText: headerText,
    rawHeaderBytes: new Uint8Array(headerBytes),
    isDirectDst: true,
    isEmbroStyle,
    hasHeaderSub,
    hasTrailingSub,
    st: matchST ? parseInt(matchST[1], 10) : null,
    co: matchCO ? parseInt(matchCO[1], 10) : 1,
    plusX: matchPlusX ? parseInt(matchPlusX[1], 10) : null,
    minusX: matchMinusX ? parseInt(matchMinusX[1], 10) : null,
    plusY: matchPlusY ? parseInt(matchPlusY[1], 10) : null,
    minusY: matchMinusY ? parseInt(matchMinusY[1], 10) : null,
    ax: matchAX ? parseInt(matchAX[1], 10) : null,
    ay: matchAY ? parseInt(matchAY[1], 10) : null,
    mx: matchMX ? parseInt(matchMX[1], 10) : null,
    my: matchMY ? parseInt(matchMY[1], 10) : null,
    originalPointsCount: parsedPoints.length,
    originalPointsSnapshot: parsedPoints.map((p) => `${p.x},${p.y}`).join(';'),
  };

  return { label, header, points: parsedPoints };
}

/**
 * Genera el buffer binario Uint8Array correspondiente a un archivo DST estándar Tajima / Embro.
 */
export function generateDstUint8(points, fileName = 'figura.DST', stepLengthMm = 2.5, dstHeader = null) {
  let lastX = 0;
  let lastY = 0;
  let minX = 0;
  let maxX = 0;
  let minY = 0;
  let maxY = 0;
  const records = [];

  const addStitch = (targetXmm, targetYmm) => {
    const targetX = Math.round(Number(targetXmm) * 10);
    const targetY = Math.round(Number(targetYmm) * 10);
    let dx = targetX - lastX;
    let dy = targetY - lastY;

    // Si el desplazamiento excede el límite máximo de 121 unidades DST (12.1 mm), subdividir
    while (Math.abs(dx) > 121 || Math.abs(dy) > 121) {
      const stepX = Math.max(-121, Math.min(121, dx));
      const stepY = Math.max(-121, Math.min(121, dy));
      records.push(encodeDstRecord(stepX, stepY, 'stitch'));
      lastX += stepX;
      lastY += stepY;
      dx = targetX - lastX;
      dy = targetY - lastY;
      if (lastX < minX) minX = lastX;
      if (lastX > maxX) maxX = lastX;
      if (lastY < minY) minY = lastY;
      if (lastY > maxY) maxY = lastY;
    }

    records.push(encodeDstRecord(dx, dy, 'stitch'));
    lastX = targetX;
    lastY = targetY;
    if (lastX < minX) minX = lastX;
    if (lastX > maxX) maxX = lastX;
    if (lastY < minY) minY = lastY;
    if (lastY > maxY) maxY = lastY;
  };

  // ¿Deben emitirse las puntadas de forma directa o subdividirse desde vectores CAD?
  // Si el archivo proviene de un DST (dstHeader?.isDirectDst) o es un archivo con muchas coordenadas
  // continuas de código 16 sin arcos (32/33), cada punto ya representa una puntada de aguja física.
  const hasArcs = points.some((p) => p.code === 32 || p.code === 33);
  const isDirectStitches = (dstHeader?.isDirectDst && !hasArcs) || (!hasArcs && points.length > 50);

  if (isDirectStitches) {
    for (const pt of points) {
      addStitch(pt.x, pt.y);
    }
  } else {
    // Modo CAD / ST: subdividir rectas largas y arcos circulares según stitchLengthMm
    for (const segment of getFigureSegments(points)) {
      for (const stitch of sampleSegment(segment, stepLengthMm)) {
        addStitch(stitch.x, stitch.y);
      }
    }
  }

  // Registro de fin de patrón (0x00, 0x00, 0xF3)
  records.push(encodeDstRecord(0, 0, 'end'));

  // En la especificación Tajima y en Embro, el campo ST: de la cabecera representa
  // el número total de registros de 3 bytes (incluyendo el registro END).
  const stitchCount = (dstHeader?.isDirectDst || isDirectStitches)
    ? records.length
    : records.length - 1;

  // Extraer nombre base de etiqueta (máximo 16 caracteres alfanuméricos)
  let cleanName = dstHeader?.label;
  if (!cleanName) {
    cleanName = (fileName || 'UNTITLED')
      .replace(/\.[^/.]+$/, '')
      .replace(/[^a-zA-Z0-9._-]/g, '')
      .slice(0, 16);
  }
  if (!cleanName) cleanName = 'UNTITLED';

  // Determinar si los puntos no han cambiado respecto al DST importado
  const currentSnapshot = points.map((p) => `${p.x},${p.y}`).join(';');
  const isUnmodified = Boolean(
    dstHeader?.rawHeaderBytes &&
    dstHeader?.originalPointsSnapshot === currentSnapshot
  );

  // ¿Incluir byte 0x1A final (EOF)?
  // Si el archivo original no tenía 0x1A final (archivos nativos de Embro), no añadirlo.
  const includeTrailingEof = dstHeader?.hasTrailingSub !== false;

  const totalLength = 512 + records.length * 3 + (includeTrailingEof ? 1 : 0);
  const out = new Uint8Array(totalLength);
  out.fill(0x20, 0, 512); // Rellenar cabecera con espacios ASCII (0x20)

  if (isUnmodified && dstHeader.rawHeaderBytes) {
    // Conservar cabecera exacta original bit a bit
    out.set(dstHeader.rawHeaderBytes, 0);
  } else if (dstHeader?.isEmbroStyle) {
    // Estilo nativo Embro con padding de ceros y coordenadas centradas para acolchado
    const spanX = maxX - minX;
    const spanY = maxY - minY;
    const plusX = (minX < 0 && maxX > 0) ? maxX : Math.round(spanX / 2);
    const minusX = (minX < 0 && maxX > 0) ? minX : -(spanX - plusX);
    const plusY = (minY < 0 && maxY > 0) ? maxY : Math.round(spanY / 2);
    const minusY = (minY < 0 && maxY > 0) ? minY : -(spanY - plusY);

    const fmt5 = (num) => {
      if (num < 0) return '-' + String(Math.abs(num)).padStart(4, '0');
      return String(num).padStart(5, '0');
    };

    const paddedName = (dstHeader?.rawLabel || cleanName).padEnd(16, ' ').slice(0, 16);

    let hStr = '';
    hStr += 'LA:' + paddedName + '\r';
    hStr += 'ST:' + String(stitchCount).padStart(7, '0') + '\r';
    hStr += 'CO:' + String(dstHeader?.co ?? 1).padStart(3, '0') + '\r';
    hStr += '+X:' + fmt5(plusX) + '\r';
    hStr += '-X:' + fmt5(minusX) + '\r';
    hStr += '+Y:' + fmt5(plusY) + '\r';
    hStr += '-Y:' + fmt5(minusY) + '\r';
    hStr += 'AX:+00000\r';
    hStr += 'AY:+00000\r';
    hStr += 'MX:+00000\r';
    hStr += 'MY:+00000\r';
    hStr += 'PD:******\r';

    for (let idx = 0; idx < hStr.length; idx++) {
      out[idx] = hStr.charCodeAt(idx);
    }
  } else {
    // Tajima genérico compatible con pruebas existentes y visores estándar
    let hStr = '';
    hStr += 'LA:' + cleanName + '\r';
    hStr += 'ST:' + String(stitchCount).padStart(6, ' ') + '\r';
    hStr += 'CO:   0\r';
    hStr += '+X:' + String(Math.max(0, maxX)).padStart(5, ' ') + '\r';
    hStr += '-X:' + String(Math.abs(Math.min(0, minX))).padStart(5, ' ') + '\r';
    hStr += '+Y:' + String(Math.max(0, maxY)).padStart(5, ' ') + '\r';
    hStr += '-Y:' + (minY === 0 ? '   00' : String(Math.abs(Math.min(0, minY))).padStart(5, ' ')) + '\r';

    const axSign = lastX >= 0 ? '+' : '-';
    const aySign = lastY >= 0 ? '+' : '-';
    hStr += 'AX:' + axSign + String(Math.abs(lastX)).padStart(4, ' ') + '\r';
    hStr += 'AY:' + aySign + String(Math.abs(lastY)).padStart(4, ' ') + '\r';
    hStr += 'MX:+   0\r';
    hStr += 'MY:+   0\r';
    hStr += 'PD:******\r';
    if (dstHeader?.hasHeaderSub !== false) {
      hStr += '\x1a';
    }

    for (let idx = 0; idx < hStr.length; idx++) {
      out[idx] = hStr.charCodeAt(idx);
    }
  }

  let offset = 512;
  for (const rec of records) {
    out[offset++] = rec[0];
    out[offset++] = rec[1];
    out[offset++] = rec[2];
  }
  if (includeTrailingEof) {
    out[offset++] = 0x1a; // EOF
  }

  return out;
}
