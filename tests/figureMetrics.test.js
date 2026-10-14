import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { calculateFigureMetrics, getFigureSegments, sampleSegment, countSegmentStitches } from '../src/utils/figureGeometry.js';
import { generateDstUint8, parseDst, discretizeArc } from '../src/utils/dstFormat.js';

// Coordenadas de C:\stitchdata\002.ST. Referencia aportada por el usuario:
// Embro muestra Width 300.0, Length 600.0, AllStitch 376 y Set StitchLen 2.5.
const embro002 = [
  { code: 32, x: 90, y: 210 },
  { code: 33, x: 300, y: 300 },
  { code: 32, x: 210, y: 510 },
  { code: 33, x: 0, y: 600 },
];

test('002.ST coincide con las dimensiones y el conteo de la captura de Embro', () => {
  const metrics = calculateFigureMetrics(embro002, 2.5);
  assert.equal(metrics.widthMm, '300.0');
  assert.equal(metrics.lengthMm, '600.0');
  assert.equal(metrics.widthIn, '11.8');
  assert.equal(metrics.lengthIn, '23.6');
  assert.equal(metrics.totalDistanceMm, '936.3');
  assert.equal(metrics.allStitch, 376);
  assert.equal(metrics.maxStitchLengthMm, '2.5');
});

test('cuenta cada segmento por separado y recalcula al cambiar StitchLen', () => {
  const points = [{ code: 16, x: 3, y: 0 }, { code: 16, x: 6, y: 0 }];
  assert.equal(calculateFigureMetrics(points, 2.5).allStitch, 4);
  assert.equal(calculateFigureMetrics(points, 1).allStitch, 6);
  assert.equal(calculateFigureMetrics(embro002, 5).allStitch, 188);
});

test('no añade puntadas por error flotante ni por puntos duplicados', () => {
  assert.equal(countSegmentStitches(10 + 1e-12, 2.5), 4);
  assert.equal(calculateFigureMetrics([{ code: 16, x: 0, y: 0 }]).allStitch, 0);
  assert.equal(calculateFigureMetrics([]).allStitch, 0);
});

test('las dimensiones incluyen el origen y los extremos de arcos mayores', () => {
  const points = [{ code: 32, x: 20, y: 0 }, { code: 33, x: 10, y: -10 }];
  const metrics = calculateFigureMetrics(points);
  assert.equal(metrics.widthMm, '20.0');
  assert.equal(metrics.lengthMm, '20.0');
  const negative = calculateFigureMetrics([{ code: 16, x: -25.4, y: -50.8 }]);
  assert.equal(negative.widthIn, '1.0');
  assert.equal(negative.lengthIn, '2.0');
});

test('las curvas alineadas se subdividen sin saltarse el control intermedio', () => {
  const sampled = discretizeArc({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }, 2.5);
  assert.equal(sampled.length, 8);
  assert.deepEqual(sampled[3], { x: 10, y: 0 });
  assert.deepEqual(sampled.at(-1), { x: 20, y: 0 });
});

test('la subdivisión respeta la longitud en ambos sentidos y conserva los finales', () => {
  for (const points of [embro002, embro002.map(p => ({ ...p, x: -p.x }))]) {
    for (const segment of getFigureSegments(points)) {
      let previous = segment.start;
      const samples = sampleSegment(segment, 2.5);
      for (const next of samples) {
        assert.ok(Math.hypot(next.x - previous.x, next.y - previous.y) <= 2.5 + 1e-9);
        previous = next;
      }
      assert.deepEqual(samples.at(-1), segment.end);
    }
  }
});

test('DST contiene las mismas 376 puntadas y excluye END del campo ST de cabecera', () => {
  const bytes = generateDstUint8(embro002, '002.DST', 2.5);
  const parsed = parseDst(bytes);
  assert.equal(parsed.points.length, 376);
  assert.deepEqual(parsed.points.at(-1), { code: 16, x: '0.0', y: '600.0' });
  assert.equal(Number(new TextDecoder().decode(bytes.slice(0, 512)).match(/ST:\s*(\d+)/)[1]), 376);
  assert.deepEqual([...bytes.slice(-4)], [0, 0, 0xf3, 0x1a]);
});

test('también subdivide rectas menores de 12 mm al exportar DST', () => {
  const points = [{ code: 16, x: 10, y: 0 }];
  assert.equal(parseDst(generateDstUint8(points, 'recta.DST', 2.5)).points.length, 4);
  assert.equal(parseDst(generateDstUint8(points, 'recta.DST', 1)).points.length, 10);
});

test('rechaza longitudes inválidas y coordenadas no finitas', () => {
  for (const length of [0, -1, NaN, Infinity]) assert.throws(() => calculateFigureMetrics(embro002, length));
  assert.throws(() => calculateFigureMetrics([{ code: 16, x: Infinity, y: 0 }]));
});

test('DST importado conserva cabecera Embro (LA, ST, -Y: 00) y puntadas directas sin resubdividir', () => {
  const points = [];
  let curX = 0, curY = 0;
  for (let i = 0; i < 6682; i++) {
    curX += 0.2;
    curY += 0.3;
    points.push({ code: 16, x: curX.toFixed(1), y: curY.toFixed(1) });
  }

  const dstHeader = { label: 'X061603', isDirectDst: true };
  const bytes = generateDstUint8(points, '2.5연결디자인.DST', 2.5, dstHeader);
  assert.equal(bytes.length, 20562);

  const headerStr = new TextDecoder('latin1').decode(bytes.slice(0, 512));
  assert.match(headerStr, /^LA:X061603\r/);
  assert.match(headerStr, /\rST:\s*6683\r/);
  assert.match(headerStr, /\rCO:\s*0\r/);
  assert.match(headerStr, /\r-Y:\s*00\r/);

  const parsed = parseDst(bytes);
  assert.equal(parsed.label, 'X061603');
  assert.equal(parsed.points.length, 6682);
});

test('4INCHDIA.DST importado y exportado conserva el 100% de la cabecera Embro y tamaño exacto sin distorsión', () => {
  const filePath = 'C:/stitchdata/4INCHDIA.DST';
  if (fs.existsSync(filePath)) {
    const originalBuf = fs.readFileSync(filePath);
    const parsed = parseDst(originalBuf);
    assert.equal(parsed.points.length, 274);
    assert.equal(parsed.header.isEmbroStyle, true);
    assert.equal(parsed.header.hasTrailingSub, false);

    const generated = generateDstUint8(parsed.points, '4INCHDIA.DST', 2.5, parsed.header);
    assert.equal(generated.length, originalBuf.length);
    assert.deepEqual(Array.from(generated), Array.from(originalBuf));

    const metrics = calculateFigureMetrics(parsed.points, 0.0, parsed.header);
    assert.equal(metrics.allStitch, 275);
    assert.equal(metrics.widthMm, '102.8');
    assert.equal(metrics.lengthMm, '95.4');
    assert.equal(metrics.widthIn, '4.1');
    assert.equal(metrics.lengthIn, '3.8');
    assert.equal(metrics.maxStitchLengthMm, '2.9');
  }
});
