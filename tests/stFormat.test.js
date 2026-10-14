import test from 'node:test';
import assert from 'node:assert/strict';
import { parseStText, generateStText } from '../src/utils/stFormat.js';

// Variante real de 002.ST: 18 valores distribuidos en diez líneas.
const original = '1  \r\n22   70\r\n0 300\r\n0 600\r\n0 0\r\n1.00 1.03\r\n0\r\n101\r\n0 0 0 0 \r\n4    \r\n 32   90.0  210.0\r\n 33  300.0  300.0\r\n 32  210.0  510.0\r\n 33    0.0  600.0\r\n';

test('002.ST conserva íntegramente cabecera, espacios y coordenadas sin editar', () => {
  const { points, header } = parseStText(original);
  assert.equal(points.length, 4);
  assert.equal(header.tokens.length, 18);
  assert.equal(header.tokens[10], '1.03');
  assert.equal(header.tokens[12], '101');
  assert.equal(generateStText(points, header), original);
});

test('las cabeceras de nueve y diez líneas tienen el mismo orden de campos', () => {
  const compact = original.replace('101\r\n0 0 0 0 ', '101 0 0 0 0 ');
  assert.deepEqual(parseStText(compact).points, parseStText(original).points);
  assert.deepEqual(parseStText(compact).header.tokens, parseStText(original).header.tokens);
  assert.equal(generateStText(parseStText(compact).points, parseStText(compact).header), compact);
});

test('al editar se actualizan límites y contador sin cambiar otros parámetros', () => {
  const { header } = parseStText(original);
  const points = [{ code: 16, x: '-20', y: '10' }, { code: 16, x: '80', y: '90' }];
  const parsed = parseStText(generateStText(points, header));
  assert.deepEqual(parsed.header.tokens.slice(3, 7), ['-20', '80', '0', '90']);
  assert.equal(parsed.header.tokens[17], '2');
  for (const i of [0, 1, 2, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]) assert.equal(parsed.header.tokens[i], header.tokens[i]);
  assert.deepEqual(parsed.points, points);
});

test('una figura nueva genera ST completo con parámetros base observados', () => {
  const parsed = parseStText(generateStText([{ code: 16, x: '12.345678', y: '25' }]));
  assert.deepEqual(parsed.header.tokens.slice(0, 3), ['1', '17', '0']);
  assert.equal(parsed.header.tokens[17], '1');
  assert.equal(parsed.points[0].x, '12.345678');
});

test('el contador 16 de la cabecera no se confunde con un punto de código 16', () => {
  const points = Array.from({ length: 16 }, (_, i) => ({ code: 16, x: String(i + 1), y: '0' }));
  const parsed = parseStText(generateStText(points));
  assert.equal(parsed.points.length, 16);
  assert.deepEqual(parsed.points, points);
});

test('acepta listas antiguas, comentarios, comas decimales y separadores', () => {
  assert.deepEqual(parseStText('# comentario\n16\t1.25\t2.75\n32 3,5 4,5\n33;5;6').points, [
    { code: 16, x: '1.25', y: '2.75' }, { code: 32, x: '3.5', y: '4.5' }, { code: 33, x: '5', y: '6' },
  ]);
  assert.equal(parseStText('16 0 0').header, null);
});

test('rechaza cabeceras incompletas, cuentas incorrectas y datos no finitos', () => {
  assert.throws(() => parseStText('1\n22 70\n0 300'));
  assert.throws(() => parseStText(original.replace('4    ', '3    ')));
  assert.throws(() => parseStText(original.replace('90.0', 'NaN')));
  assert.throws(() => parseStText(original.replace('22   70', '22.5 70')));
  assert.throws(() => generateStText([]));
});
