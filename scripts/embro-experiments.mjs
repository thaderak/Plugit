import { mkdir, writeFile } from 'node:fs/promises';
import { calculateFigureMetrics } from '../src/utils/figureGeometry.js';

// Mantiene una figura pequeña y conocida como referencia para comparar cambios.
const header = [1, 17, 0, 0, 35.443407, 0, 35.086264, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 3];
const points = [{ code: 16, x: 15, y: 15 }, { code: 32, x: 25, y: 35 }, { code: 33, x: 35, y: 20 }];
const folder = new URL('../exports/embro-experiments/', import.meta.url);
await mkdir(folder, { recursive: true });
const results = [];

// Escribe diez líneas de cabecera y los triples, sin recalcular el campo en prueba.
async function save(name, tokens, figure, change) {
  const groups = [[0], [1, 2], [3, 4], [5, 6], [7, 8], [9, 10], [11], [12], [13, 14, 15, 16], [17]];
  const text = groups.map(group => group.map(i => tokens[i]).join(' '))
    .concat(figure.map(p => `${p.code}\t${p.x}\t${p.y}`)).join('\r\n') + '\r\n';
  await writeFile(new URL(name, folder), text);
  results.push({ file: name, change, observationInEmbro: null, expectedPlugit: calculateFigureMetrics(figure, 2.5) });
}
await save('00_BASE.ST', header, points, 'Referencia: figura del usuario');

// Cada archivo altera exactamente un campo; evita confundir causas independientes.
const alternatives = [2, 24, 70, -10, 60, -10, 60, 10, 10, 2, 2, 1, 150, 1, 1, 1, 1, 2];
for (let i = 0; i < header.length; i++) {
  const variant = [...header];
  variant[i] = alternatives[i];
  await save(`H${String(i + 1).padStart(2, '0')}.ST`, variant, points,
    `Campo ${i + 1}: ${header[i]} → ${variant[i]}${i === 17 ? ' (conteo deliberadamente discordante; prueba del lector, no exportación válida)' : ''}`);
}

// Separa el efecto de coordenadas y códigos del efecto de la cabecera.
for (const [name, index, field, value] of [
  ['P_CONTROL_X.ST', 1, 'x', 15], ['P_CONTROL_Y.ST', 1, 'y', 25],
  ['P_FINAL_X.ST', 2, 'x', 45], ['P_CODE32_TO16.ST', 1, 'code', 16],
]) {
  const figure = points.map(p => ({ ...p }));
  figure[index][field] = value;
  await save(name, header, figure, `Registro ${index + 1}, ${field}: ${points[index][field]} → ${value}; cabecera conservada para aislar el cambio`);
}

// Distingue resultados calculados de observaciones reales: null significa sin comprobar.
await writeFile(new URL('results.json', folder), JSON.stringify(results, null, 2));
const rows = results.map(r => `| ${r.file} | ${r.change} | ${r.expectedPlugit.widthMm} | ${r.expectedPlugit.lengthMm} | ${r.expectedPlugit.allStitch} | Pendiente |`);
await writeFile(new URL('README.md', folder), '# Experimentos ST\n\nArchivos independientes; no sustituyen los originales. Valores esperados calculados en PlugiT con StitchLen=2.5 mm. La columna Embro requiere observar el programa; no se rellena con predicciones.\n\n| Archivo | Cambio aislado | Ancho esperado mm | Largo esperado mm | Puntadas esperadas | Embro |\n| --- | --- | --- | --- | --- | --- |\n' + rows.join('\n') + '\n');
console.log(`Generados ${results.length} experimentos en ${folder.pathname}`);
