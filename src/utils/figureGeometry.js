// Geometría compartida por las métricas y la generación de puntadas.
// Todas las coordenadas y longitudes se expresan en milímetros.
const TAU = Math.PI * 2;
const normalizeAngle = (angle) => ((angle % TAU) + TAU) % TAU;

/** Recupera el arco circular que pasa por inicio, control 32 y final 33. */
export function getArcGeometry(start, control, end) {
  const d = 2 * (start.x * (control.y - end.y) + control.x * (end.y - start.y) + end.x * (start.y - control.y));
  // Tres puntos alineados no definen un círculo: se conservan como dos rectas.
  if (Math.abs(d) < 1e-4) return null;
  const squared = (point) => point.x ** 2 + point.y ** 2;
  const cx = (squared(start) * (control.y - end.y) + squared(control) * (end.y - start.y) + squared(end) * (start.y - control.y)) / d;
  const cy = (squared(start) * (end.x - control.x) + squared(control) * (start.x - end.x) + squared(end) * (control.x - start.x)) / d;
  const radius = Math.hypot(start.x - cx, start.y - cy);
  const startAngle = normalizeAngle(Math.atan2(start.y - cy, start.x - cx));
  const controlSweep = normalizeAngle(Math.atan2(control.y - cy, control.x - cx) - startAngle);
  const endSweep = normalizeAngle(Math.atan2(end.y - cy, end.x - cx) - startAngle);
  const direction = controlSweep <= endSweep ? 1 : -1;
  const sweep = direction === 1 ? endSweep : TAU - endSweep;
  return { cx, cy, radius, startAngle, direction, sweep, length: radius * sweep };
}

/** Convierte los códigos ST en segmentos; el primer trazo parte de (0, 0). */
export function getFigureSegments(points) {
  const segments = [];
  const numericPoint = (point) => ({ x: Number(point.x), y: Number(point.y) });
  const addLine = (start, end) => segments.push({ start, end, length: Math.hypot(end.x - start.x, end.y - start.y), arc: null });
  let start = { x: 0, y: 0 };
  for (let i = 0; i < points.length; i++) {
    const point = numericPoint(points[i]);
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) throw new Error('Las coordenadas deben ser números finitos.');
    if (points[i].code === 32 && points[i + 1]?.code === 33) {
      const end = numericPoint(points[++i]);
      if (!Number.isFinite(end.x) || !Number.isFinite(end.y)) throw new Error('Las coordenadas deben ser números finitos.');
      const arc = getArcGeometry(start, point, end);
      if (arc) segments.push({ start, end, control: point, arc, length: arc.length });
      else { addLine(start, point); addLine(point, end); }
      start = end;
    } else {
      addLine(start, point);
      start = point;
    }
  }
  return segments;
}

/** Reparte cada segmento por separado: nunca supera la longitud configurada.
 * La captura de 002.ST da 188 + 188 = 376, frente a 375 al redondear el total.
 * La tolerancia evita añadir una puntada por errores mínimos de coma flotante.
 */
export function countSegmentStitches(length, stitchLengthMm) {
  if (!Number.isFinite(stitchLengthMm) || stitchLengthMm <= 0) throw new Error('La longitud de puntada debe ser mayor que cero.');
  return Math.max(0, Math.ceil(length / stitchLengthMm - 1e-9));
}

/** Produce las posiciones de puntada; omite el origen y conserva cada final exacto. */
export function sampleSegment(segment, stitchLengthMm) {
  const count = countSegmentStitches(segment.length, stitchLengthMm);
  const stitches = [];
  for (let i = 1; i <= count; i++) {
    if (i === count) { stitches.push({ ...segment.end }); continue; }
    const t = i / count;
    if (segment.arc) {
      const { cx, cy, radius, startAngle, direction, sweep } = segment.arc;
      const angle = startAngle + direction * sweep * t;
      stitches.push({ x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) });
    } else {
      stitches.push({ x: segment.start.x + (segment.end.x - segment.start.x) * t, y: segment.start.y + (segment.end.y - segment.start.y) * t });
    }
  }
  return stitches;
}

/** Ancho/Length incluyen el origen y los extremos reales de las curvas.
 * Una pulgada equivale a 25.4 mm (o 250 unidades DST en maquinaria Tajima/Embro); la presentación coincide con Embro.
 */
export function calculateFigureMetrics(points, stitchLengthMm = 2.5, dstHeader = null) {
  let minX = 0, maxX = 0, minY = 0, maxY = 0;
  let totalDistance = 0, allStitch = 0, maxStitchLengthMm = 0;
  const include = ({ x, y }) => {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  };

  const hasArcs = points.some((p) => p.code === 32 || p.code === 33);
  const isDirectStitches = (dstHeader?.isDirectDst && !hasArcs) || (!hasArcs && points.length > 50);

  if (isDirectStitches) {
    // Modo directo DST: las coordenadas ya son las puntadas reales fijas de aguja.
    let lastX = 0, lastY = 0;
    for (let i = 0; i < points.length; i++) {
      const px = Number(points[i].x);
      const py = Number(points[i].y);
      include({ x: px, y: py });
      const step = Math.hypot(px - lastX, py - lastY);
      totalDistance += step;
      if (step > maxStitchLengthMm) maxStitchLengthMm = step;
      lastX = px;
      lastY = py;
    }
    // AllStitch en archivos DST coincide exactamente con la cabecera Tajima ST: de Embro
    allStitch = dstHeader?.st ? dstHeader.st : (points.length > 0 ? points.length + 1 : 0);
  } else {
    // Modo vectorial CAD / ST: subdividir segmentos según Set StitchLen
    countSegmentStitches(0, stitchLengthMm);
    for (const segment of getFigureSegments(points)) {
      include(segment.end);
      totalDistance += segment.length;
      const count = countSegmentStitches(segment.length, stitchLengthMm);
      allStitch += count;
      if (count) {
        const step = segment.arc ? 2 * segment.arc.radius * Math.sin(segment.arc.sweep / count / 2) : segment.length / count;
        maxStitchLengthMm = Math.max(maxStitchLengthMm, step);
      }
      if (segment.arc) {
        include(segment.control);
        const { cx, cy, radius, startAngle, direction, sweep } = segment.arc;
        for (const angle of [0, Math.PI / 2, Math.PI, 3 * Math.PI / 2]) {
          if (normalizeAngle(direction * (angle - startAngle)) <= sweep + 1e-9) {
            include({ x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) });
          }
        }
      }
    }
  }

  const width = maxX - minX, length = maxY - minY;
  let widthIn, lengthIn;
  if (dstHeader?.plusX != null && dstHeader?.minusX != null) {
    widthIn = ((dstHeader.plusX - dstHeader.minusX) / 250).toFixed(1);
  } else {
    widthIn = (width / 25.4).toFixed(1);
  }
  if (dstHeader?.plusY != null && dstHeader?.minusY != null) {
    lengthIn = ((dstHeader.plusY - dstHeader.minusY) / 250).toFixed(1);
  } else {
    lengthIn = (length / 25.4).toFixed(1);
  }

  return {
    total: points.length,
    allStitch,
    bounds: { minX, maxX, minY, maxY },
    totalDistanceMm: totalDistance.toFixed(1),
    widthMm: width.toFixed(1),
    lengthMm: length.toFixed(1),
    widthIn,
    lengthIn,
    maxStitchLengthMm: maxStitchLengthMm.toFixed(1),
    isDirectStitches,
  };
}
