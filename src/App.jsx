import { useState, useRef, useEffect, useCallback, useMemo, memo } from 'react';
import './App.css';
import {
  UndoIcon,
  RedoIcon,
  CenterIcon,
  TrashIcon,
  CopyIcon,
  DownloadIcon,
  UploadIcon,
  CloseIcon,
  LineIcon,
  CurveMidIcon,
  CurveEndIcon,
  SunIcon,
  MoonIcon,
  PanelRightIcon,
  PlusIcon,
  GridIcon,
  RulerIcon,
  CompassIcon,
  SaveIcon,
} from './components/Icons';
import { parseDst, generateDstUint8 } from './utils/dstFormat';
import { calculateFigureMetrics } from './utils/figureGeometry';
import { parseStText, generateStText } from './utils/stFormat';

// Componente para celda de coordenada editable
const EditableCell = memo(function EditableCell({ value, isModified, code, label, onChange, onEnter, onEscape }) {
  const modifiedClass = isModified ? `is-modified is-modified-${code}` : '';
  return (
    <input
      type="number"
      step="0.5"
      aria-label={label}
      className={`table-coord-input ${modifiedClass}`}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          onEnter();
          e.target.blur();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          onEscape();
        }
      }}
      title="Edite el valor y presione Enter o 'Guardar cambios' para aplicar"
    />
  );
});

export default function App() {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const inputXRef = useRef(null);
  const inputYRef = useRef(null);
  const fileInputRef = useRef(null);

  // Estados de datos e historial (Deshacer / Rehacer)
  const [points, setPoints] = useState([]);
  // La cabecera original acompaña al documento y a su historial.
  const [stHeader, setStHeader] = useState(null);
  const [dstHeader, setDstHeader] = useState(null);
  const [historyPast, setHistoryPast] = useState([]);
  const [historyFuture, setHistoryFuture] = useState([]);
  const [pendingEdits, setPendingEdits] = useState({});
  const [exportFormat, setExportFormat] = useState('DST');
  const [fileName, setFileName] = useState('Mi_diseno.DST');
  const [inputX, setInputX] = useState('');
  const [inputY, setInputY] = useState('');
  // Misma unidad que Set StitchLen de Embro; también se aplica al generar DST.
  const [stitchLengthMm, setStitchLengthMm] = useState(2.5);
  const [stitchLengthInput, setStitchLengthInput] = useState('2.5');

  // Modo de Trazado: 16 (Recta), 32 (Curva Paso 1), 33 (Curva Paso 2)
  const [mode, setMode] = useState(16);

  // Tema: 'light' es el predeterminado
  const [theme, setTheme] = useState('light');

  // Visibilidad del Panel Derecho (Tabla de Coordenadas)
  const [showRightSidebar, setShowRightSidebar] = useState(true);

  // Dimensiones del contenedor del canvas para redibujo reactivo
  const [canvasDimensions, setCanvasDimensions] = useState({ width: 0, height: 0 });

  // Configuración del plano
  const [gridStep, setGridStep] = useState(5); // en mm
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [showDirections, setShowDirections] = useState(true);
  const [showCoords, setShowCoords] = useState(true);

  // Zoom y Desplazamiento
  const [scale, setScale] = useState(5); // píxeles por mm
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [mouseCoord, setMouseCoord] = useState({ x: 0, y: 0 });
  const [toastMessage, setToastMessage] = useState(null);

  // Rendimiento y Virtualización: Punto bajo el cursor y scroll de la tabla
  const [hoveredPointIndex, setHoveredPointIndex] = useState(-1);
  const hoveredPointRef = useRef(-1);
  const [tableScrollTop, setTableScrollTop] = useState(0);

  // Alternar tema claro / oscuro
  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  // Mostrar mensaje toast temporal
  const showToast = useCallback((msg) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 2400);
  }, []);

  // Conversión de plano a pantalla y viceversa
  const toScreen = useCallback((x, y) => ({
    x: pan.x + Number(x) * scale,
    y: pan.y - Number(y) * scale,
  }), [pan.x, pan.y, scale]);

  const toWorld = useCallback((screenX, screenY) => ({
    x: (screenX - pan.x) / scale,
    y: (pan.y - screenY) / scale,
  }), [pan.x, pan.y, scale]);

  // Centrar en el origen (0,0)
  const handleCenterView = useCallback(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    setPan({ x: rect.width / 2, y: rect.height / 2 });
    setScale(5);
  }, []);

  // Observador de cambio de tamaño del contenedor para evitar que el canvas desaparezca
  useEffect(() => {
    if (!containerRef.current) return;
    const initialRect = containerRef.current.getBoundingClientRect();
    if (initialRect.width > 0 && initialRect.height > 0) {
      setCanvasDimensions({
        width: Math.floor(initialRect.width),
        height: Math.floor(initialRect.height),
      });
      setPan({ x: initialRect.width / 2, y: initialRect.height / 2 });
    }

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          setCanvasDimensions({
            width: Math.floor(width),
            height: Math.floor(height),
          });
        }
      }
    });

    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, []);

  // Dibujar cabeza de flecha con ángulo y color
  const drawArrowHead = (ctx, x, y, angle, color) => {
    const arrowLength = 7;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(
      x - arrowLength * Math.cos(angle - Math.PI / 6),
      y - arrowLength * Math.sin(angle - Math.PI / 6)
    );
    ctx.lineTo(
      x - arrowLength * Math.cos(angle + Math.PI / 6),
      y - arrowLength * Math.sin(angle + Math.PI / 6)
    );
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  };

  // Dibujar flecha indicadora de dirección en línea recta
  const drawDirectionArrow = (ctx, from, to, color = '#b91c2c') => {
    const midX = (from.x + to.x) / 2;
    const midY = (from.y + to.y) / 2;
    const angle = Math.atan2(to.y - from.y, to.x - from.x);
    drawArrowHead(ctx, midX, midY, angle, color);
  };

  // Función para dibujar arcos que pasan por 3 puntos y sus flechas de sentido a lo largo de la curva
  const drawArcThrough3Points = (
    ctx,
    p0,
    p1,
    p2,
    withDirections = false,
    color1 = '#242424',
    color2 = '#F59E0B'
  ) => {
    const d = 2 * (p0.x * (p1.y - p2.y) + p1.x * (p2.y - p0.y) + p2.x * (p0.y - p1.y));

    // Si los puntos son colineales, trazar segmentos rectos
    if (Math.abs(d) < 1e-4) {
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();

      if (withDirections) {
        drawDirectionArrow(ctx, p0, p1, color1);
        drawDirectionArrow(ctx, p1, p2, color2);
      }
      return;
    }

    const p0Sq = p0.x * p0.x + p0.y * p0.y;
    const p1Sq = p1.x * p1.x + p1.y * p1.y;
    const p2Sq = p2.x * p2.x + p2.y * p2.y;

    const cx = (p0Sq * (p1.y - p2.y) + p1Sq * (p2.y - p0.y) + p2Sq * (p0.y - p1.y)) / d;
    const cy = (p0Sq * (p2.x - p1.x) + p1Sq * (p0.x - p2.x) + p2Sq * (p1.x - p0.x)) / d;
    const radius = Math.hypot(p0.x - cx, p0.y - cy);

    let a0 = Math.atan2(p0.y - cy, p0.x - cx);
    let a1 = Math.atan2(p1.y - cy, p1.x - cx);
    let a2 = Math.atan2(p2.y - cy, p2.x - cx);

    const pi2 = 2 * Math.PI;
    const norm = (a) => ((a % pi2) + pi2) % pi2;
    a0 = norm(a0);
    a1 = norm(a1);
    a2 = norm(a2);

    let anticlockwise = false;
    if (a0 < a2) {
      anticlockwise = !(a0 < a1 && a1 < a2);
    } else {
      anticlockwise = a2 < a1 && a1 < a0;
    }

    // Dibujar el arco de curvatura exacta
    ctx.beginPath();
    ctx.arc(cx, cy, radius, a0, a2, anticlockwise);
    ctx.stroke();

    // Dibujar flechas de dirección que sigan la curvatura exacta
    if (withDirections) {
      const getArcMidAngle = (startAngle, endAngle) => {
        let diff;
        if (!anticlockwise) {
          diff = endAngle - startAngle;
          if (diff < 0) diff += pi2;
          return norm(startAngle + diff * 0.5);
        } else {
          diff = startAngle - endAngle;
          if (diff < 0) diff += pi2;
          return norm(startAngle - diff * 0.5);
        }
      };

      // Flecha sobre la primera mitad del arco (p0 -> p1)
      const midAngle1 = getArcMidAngle(a0, a1);
      const x1 = cx + radius * Math.cos(midAngle1);
      const y1 = cy + radius * Math.sin(midAngle1);
      const tangent1 = !anticlockwise ? midAngle1 + Math.PI / 2 : midAngle1 - Math.PI / 2;
      drawArrowHead(ctx, x1, y1, tangent1, color1);

      // Flecha sobre la segunda mitad del arco (p1 -> p2)
      const midAngle2 = getArcMidAngle(a1, a2);
      const x2 = cx + radius * Math.cos(midAngle2);
      const y2 = cy + radius * Math.sin(midAngle2);
      const tangent2 = !anticlockwise ? midAngle2 + Math.PI / 2 : midAngle2 - Math.PI / 2;
      drawArrowHead(ctx, x2, y2, tangent2, color2);
    }
  };

  // Dibujado del Canvas Profesional (Redibujo reactivo en cambio de tamaño o estado)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !containerRef.current) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;

    const width = canvasDimensions.width || containerRef.current.clientWidth;
    const height = canvasDimensions.height || containerRef.current.clientHeight;

    if (width <= 0 || height <= 0) return;

    // Asignar dimensiones físicas y lógicas del canvas
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    const isDark = theme === 'dark';
    // El fondo sigue el tema; ambos ejes usan negro mate en lugar de rojo.
    const canvasBg = isDark ? '#111214' : '#f4f5f6';
    const gridMinorColor = isDark ? '#202228' : '#e7e8eb';
    const gridMajorColor = isDark ? '#34373e' : '#d0d3d9';
    const axisXColor = '#242424';
    const axisYColor = '#242424';
    const textColor = isDark ? '#b3b7c0' : '#555b65';
    const originColor = isDark ? '#f4f5f6' : '#292b30';

    // 1. Fondo del plano
    ctx.fillStyle = canvasBg;
    ctx.fillRect(0, 0, width, height);

    // Cálculos para cuadrículas menor y mayor
    const minorStepMm = gridStep;
    const majorStepMm = gridStep * 5;
    const minorStepPx = minorStepMm * scale;
    const majorStepPx = majorStepMm * scale;

    // 2. Sub-cuadrícula Menor
    if (minorStepPx >= 6) {
      ctx.strokeStyle = gridMinorColor;
      ctx.lineWidth = 1;

      const startMinorX = pan.x % minorStepPx;
      for (let x = startMinorX; x < width; x += minorStepPx) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }

      const startMinorY = pan.y % minorStepPx;
      for (let y = startMinorY; y < height; y += minorStepPx) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }
    }

    // 3. Cuadrícula Mayor
    if (majorStepPx >= 15) {
      ctx.strokeStyle = gridMajorColor;
      ctx.lineWidth = 1;

      const startMajorX = pan.x % majorStepPx;
      for (let x = startMajorX; x < width; x += majorStepPx) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }

      const startMajorY = pan.y % majorStepPx;
      for (let y = startMajorY; y < height; y += majorStepPx) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }
    }

    // 4. Ejes Principales X e Y
    ctx.lineWidth = 2;
    ctx.strokeStyle = axisXColor;
    ctx.beginPath();
    ctx.moveTo(0, pan.y);
    ctx.lineTo(width, pan.y);
    ctx.stroke();

    ctx.strokeStyle = axisYColor;
    ctx.beginPath();
    ctx.moveTo(pan.x, 0);
    ctx.lineTo(pan.x, height);
    ctx.stroke();

    // 5. Marcas y Etiquetas Numéricas de los Ejes
    if (showLabels && majorStepPx >= 25) {
      ctx.font = '10px monospace';
      ctx.fillStyle = textColor;

      // Etiquetas eje X
      const minWorldX = Math.floor((0 - pan.x) / (majorStepMm * scale)) * majorStepMm;
      const maxWorldX = Math.ceil((width - pan.x) / (majorStepMm * scale)) * majorStepMm;

      for (let wx = minWorldX; wx <= maxWorldX; wx += majorStepMm) {
        if (wx === 0) continue;
        const screenX = pan.x + wx * scale;
        ctx.strokeStyle = textColor;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(screenX, pan.y - 4);
        ctx.lineTo(screenX, pan.y + 4);
        ctx.stroke();

        ctx.fillText(`${wx}`, screenX - 10, Math.min(Math.max(pan.y + 16, 20), height - 10));
      }

      // Etiquetas eje Y
      const minWorldY = Math.floor((pan.y - height) / (majorStepMm * scale)) * majorStepMm;
      const maxWorldY = Math.ceil(pan.y / (majorStepMm * scale)) * majorStepMm;

      for (let wy = minWorldY; wy <= maxWorldY; wy += majorStepMm) {
        if (wy === 0) continue;
        const screenY = pan.y - wy * scale;
        ctx.strokeStyle = textColor;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(pan.x - 4, screenY);
        ctx.lineTo(pan.x + 4, screenY);
        ctx.stroke();

        ctx.fillText(`${wy}`, Math.min(Math.max(pan.x + 8, 8), width - 35), screenY + 3);
      }
    }

    // 6. Marcador de Origen (0,0) estilo Embro 'X'
    const originScreen = toScreen(0, 0);
    const xSize = 7;
    ctx.strokeStyle = originColor;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(originScreen.x - xSize, originScreen.y - xSize);
    ctx.lineTo(originScreen.x + xSize, originScreen.y + xSize);
    ctx.moveTo(originScreen.x + xSize, originScreen.y - xSize);
    ctx.lineTo(originScreen.x - xSize, originScreen.y + xSize);
    ctx.stroke();

    ctx.fillStyle = originColor;
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText('X (0,0)', originScreen.x + 9, originScreen.y + 14);

    // 7. Trazado de Trayectorias de Puntadas (Optimizado por Lotes)
    let i = 0;
    while (i < points.length) {
      const cur = points[i];
      const prevPos = i === 0 ? toScreen(0, 0) : toScreen(points[i - 1].x, points[i - 1].y);

      if (cur.code === 16) {
        // Optimización por lotes (Batching): Encadenar líneas contiguas de código 16 en un solo trazo
        ctx.strokeStyle = isDark ? '#ff5964' : '#b91c2c';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(prevPos.x, prevPos.y);

        let batchEnd = i;
        while (batchEnd < points.length && points[batchEnd].code === 16) {
          const ptScreen = toScreen(points[batchEnd].x, points[batchEnd].y);
          ctx.lineTo(ptScreen.x, ptScreen.y);
          batchEnd++;
        }
        ctx.stroke();

        if (showDirections) {
          // Muestreo adaptativo de flechas direccionales para evitar saturación visual y sobrecarga de CPU
          const arrowStride = points.length > 500 ? Math.max(12, Math.floor(points.length / 75)) : 1;
          for (let arrowIdx = i; arrowIdx < batchEnd; arrowIdx += arrowStride) {
            const aPrev = arrowIdx === 0 ? toScreen(0, 0) : toScreen(points[arrowIdx - 1].x, points[arrowIdx - 1].y);
            const aCur = toScreen(points[arrowIdx].x, points[arrowIdx].y);
            drawDirectionArrow(ctx, aPrev, aCur, isDark ? '#ff8b93' : '#b91c2c');
          }
        }

        i = batchEnd;
      } else if (cur.code === 32) {
        const next = points[i + 1];
        if (next && next.code === 33) {
          const curPos = toScreen(cur.x, cur.y);
          const nextPos = toScreen(next.x, next.y);
          ctx.strokeStyle = '#F59E0B';
          ctx.lineWidth = 2.5;

          drawArcThrough3Points(
            ctx,
            prevPos,
            curPos,
            nextPos,
            showDirections,
            isDark ? '#b8b8b8' : '#242424',
            '#F59E0B'
          );
          i += 2;
        } else {
          const curPos = toScreen(cur.x, cur.y);
          ctx.strokeStyle = isDark ? '#b8b8b8' : '#242424';
          ctx.lineWidth = 1.5;
          ctx.setLineDash([5, 5]);
          ctx.beginPath();
          ctx.moveTo(prevPos.x, prevPos.y);
          ctx.lineTo(curPos.x, curPos.y);
          ctx.stroke();
          ctx.setLineDash([]);
          if (showDirections) {
            drawDirectionArrow(ctx, prevPos, curPos, isDark ? '#b8b8b8' : '#242424');
          }
          i++;
        }
      } else {
        i++;
      }
    }

    // 8. Dibujo de Nodos/Puntos Registrados y Etiquetas Inteligentes
    if (showCoords && points.length > 0) {
      // Radio adaptativo de nodo: en archivos densos (>500 puntos) reduce el tamaño para no empastar el diseño
      const isDense = points.length > 500;
      const baseRadius = isDense
        ? Math.max(1.5, Math.min(scale * 0.35, 3.5))
        : Math.max(3.5, Math.min(scale * 0.8, 8));

      // 8a. Dibujo de los puntos / penetraciones de aguja (con culling de viewport)
      for (let idx = 0; idx < points.length; idx++) {
        const pt = points[idx];
        const pos = toScreen(pt.x, pt.y);

        // Omitir puntos completamente fuera del área visible del canvas para optimizar FPS
        if (pos.x < -20 || pos.x > width + 20 || pos.y < -20 || pos.y > height + 20) {
          continue;
        }

        const isHovered = hoveredPointIndex === idx;
        const currentRadius = isHovered ? baseRadius + 3 : baseRadius;

        ctx.beginPath();
        ctx.arc(pos.x, pos.y, currentRadius, 0, Math.PI * 2);

        if (pt.code === 16) {
          ctx.fillStyle = isDark ? '#ff5964' : '#b91c2c';
        } else if (pt.code === 32) {
          ctx.fillStyle = isDark ? '#b8b8b8' : '#242424';
        } else {
          ctx.fillStyle = '#F59E0B';
        }

        ctx.fill();
        ctx.strokeStyle = isHovered ? '#38bdf8' : (isDark ? '#f4f5f6' : '#292b30');
        ctx.lineWidth = isHovered ? 2.5 : (isDense ? 0.8 : 1.8);
        ctx.stroke();
      }

      // 8b. Etiquetas Inteligentes sin Solapamiento (Spatial Hash Collision Detection)
      // Evita que miles de etiquetas se superpongan entre sí formando manchas ilegibles
      const CELL_SIZE = 55;
      const labelGrid = new Map();

      const canPlaceLabel = (box) => {
        // Asegurar que quede dentro del viewport del canvas
        if (box.x1 < 6 || box.x2 > width - 6 || box.y1 < 6 || box.y2 > height - 6) {
          return false;
        }
        const sCx = Math.floor(box.x1 / CELL_SIZE);
        const eCx = Math.floor(box.x2 / CELL_SIZE);
        const sCy = Math.floor(box.y1 / CELL_SIZE);
        const eCy = Math.floor(box.y2 / CELL_SIZE);

        for (let cx = sCx; cx <= eCx; cx++) {
          for (let cy = sCy; cy <= eCy; cy++) {
            const cell = labelGrid.get(`${cx},${cy}`);
            if (cell) {
              for (const placed of cell) {
                // Verificación de intersección AABB con margen de seguridad de 5px
                if (
                  box.x1 < placed.x2 + 5 &&
                  box.x2 > placed.x1 - 5 &&
                  box.y1 < placed.y2 + 5 &&
                  box.y2 > placed.y1 - 5
                ) {
                  return false;
                }
              }
            }
          }
        }
        return true;
      };

      const placeLabel = (box) => {
        const sCx = Math.floor(box.x1 / CELL_SIZE);
        const eCx = Math.floor(box.x2 / CELL_SIZE);
        const sCy = Math.floor(box.y1 / CELL_SIZE);
        const eCy = Math.floor(box.y2 / CELL_SIZE);
        for (let cx = sCx; cx <= eCx; cx++) {
          for (let cy = sCy; cy <= eCy; cy++) {
            const key = `${cx},${cy}`;
            let cell = labelGrid.get(key);
            if (!cell) {
              cell = [];
              labelGrid.set(key, cell);
            }
            cell.push(box);
          }
        }
      };

      // Muestrear candidatos para colocar etiquetas sin saturar la CPU
      // Priorizar: primer punto, último punto, puntos de curva (32, 33) y puntos uniformemente distribuidos
      const candidateIndices = [];
      const visitedSet = new Set();

      // Prioridad 1: Primer y último punto
      candidateIndices.push(0);
      visitedSet.add(0);
      if (points.length > 1) {
        candidateIndices.push(points.length - 1);
        visitedSet.add(points.length - 1);
      }

      // Prioridad 2: Puntos de curva o cambio de herramienta
      for (let idx = 0; idx < points.length; idx++) {
        if (points[idx].code === 32 || points[idx].code === 33) {
          if (!visitedSet.has(idx)) {
            candidateIndices.push(idx);
            visitedSet.add(idx);
          }
        }
      }

      // Prioridad 3: Coordenadas de 10 en 10 (#10, #20, #30...) para fácil identificación
      // En archivos pequeños (<= 25 puntos) muestra todos los puntos de 1 en 1 si hay espacio
      if (points.length <= 25) {
        for (let idx = 0; idx < points.length; idx++) {
          if (!visitedSet.has(idx)) {
            candidateIndices.push(idx);
            visitedSet.add(idx);
          }
        }
      } else {
        // En archivos con muchas coordenadas, mostrar estrictamente de 10 en 10 (#10, #20, #30...)
        for (let pNum = 10; pNum <= points.length; pNum += 10) {
          const idx = pNum - 1;
          if (!visitedSet.has(idx)) {
            candidateIndices.push(idx);
            visitedSet.add(idx);
          }
        }
      }

      ctx.font = '10px monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';

      const placedLabels = [];

      for (const idx of candidateIndices) {
        const pt = points[idx];
        const pos = toScreen(pt.x, pt.y);

        // Si está fuera del canvas, ignorar
        if (pos.x < 0 || pos.x > width || pos.y < 0 || pos.y > height) {
          continue;
        }

        const labelText = `${idx + 1}:[${pt.code}] (${pt.x},${pt.y})`;
        const textWidth = ctx.measureText(labelText).width;
        const pillWidth = textWidth + 8;
        const pillHeight = 16;

        // Intentar 4 ubicaciones relativas al punto (derecha-arriba, derecha-abajo, izquierda-arriba, izquierda-abajo)
        const candidates = [
          { x1: pos.x + 8, y1: pos.y - pillHeight - 2, x2: pos.x + 8 + pillWidth, y2: pos.y - 2 },
          { x1: pos.x + 8, y1: pos.y + 4, x2: pos.x + 8 + pillWidth, y2: pos.y + 4 + pillHeight },
          { x1: pos.x - pillWidth - 8, y1: pos.y - pillHeight - 2, x2: pos.x - 8, y2: pos.y - 2 },
          { x1: pos.x - pillWidth - 8, y1: pos.y + 4, x2: pos.x - 8, y2: pos.y + 4 + pillHeight },
        ];

        let placedBox = null;
        for (const candidate of candidates) {
          if (canPlaceLabel(candidate)) {
            placedBox = candidate;
            break;
          }
        }

        if (placedBox) {
          placeLabel(placedBox);
          placedLabels.push({ box: placedBox, text: labelText, code: pt.code });
        }
      }

      // Dibujar las etiquetas colocadas con fondo tipo píldora de alto contraste
      for (const lbl of placedLabels) {
        const { box, text, code } = lbl;
        const bW = box.x2 - box.x1;
        const bH = box.y2 - box.y1;

        // Fondo semi-transparente
        ctx.fillStyle = isDark ? 'rgba(24, 27, 33, 0.88)' : 'rgba(255, 255, 255, 0.92)';
        ctx.strokeStyle = code === 16
          ? (isDark ? 'rgba(255, 89, 100, 0.45)' : 'rgba(185, 28, 44, 0.35)')
          : code === 32
          ? (isDark ? 'rgba(184, 184, 184, 0.45)' : 'rgba(36, 36, 36, 0.35)')
          : 'rgba(245, 158, 11, 0.45)';
        ctx.lineWidth = 1;

        if (ctx.roundRect) {
          ctx.beginPath();
          ctx.roundRect(box.x1, box.y1, bW, bH, 3);
          ctx.fill();
          ctx.stroke();
        } else {
          ctx.fillRect(box.x1, box.y1, bW, bH);
          ctx.strokeRect(box.x1, box.y1, bW, bH);
        }

        // Texto de la coordenada
        ctx.fillStyle = isDark ? '#f4f5f6' : '#1e293b';
        ctx.fillText(text, box.x1 + 4, box.y1 + bH / 2);
      }

      // 8c. Inspección Interactiva del Punto Bajo el Cursor (Hover Highlight & Tooltip)
      if (hoveredPointIndex >= 0 && hoveredPointIndex < points.length) {
        const hPt = points[hoveredPointIndex];
        const hPos = toScreen(hPt.x, hPt.y);

        // Anillo de brillo cian
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(hPos.x, hPos.y, baseRadius + 4, 0, Math.PI * 2);
        ctx.stroke();

        // Tarjeta flotante detallada
        const hText = `#${hoveredPointIndex + 1} [${hPt.code}] X: ${hPt.x} mm, Y: ${hPt.y} mm`;
        ctx.font = 'bold 11px monospace';
        const hMetrics = ctx.measureText(hText);
        const cardW = hMetrics.width + 16;
        const cardH = 24;

        let cardX = hPos.x + 12;
        let cardY = hPos.y - cardH - 8;
        if (cardX + cardW > width - 10) cardX = hPos.x - cardW - 12;
        if (cardY < 10) cardY = hPos.y + 12;

        ctx.fillStyle = isDark ? '#0f172a' : '#ffffff';
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 1.8;
        if (ctx.roundRect) {
          ctx.beginPath();
          ctx.roundRect(cardX, cardY, cardW, cardH, 5);
          ctx.fill();
          ctx.stroke();
        } else {
          ctx.fillRect(cardX, cardY, cardW, cardH);
          ctx.strokeRect(cardX, cardY, cardW, cardH);
        }

        ctx.fillStyle = isDark ? '#38bdf8' : '#0284c7';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(hText, cardX + 8, cardY + cardH / 2);
      }
    }

  }, [points, scale, pan, gridStep, showLabels, showDirections, showCoords, theme, toScreen, canvasDimensions, hoveredPointIndex]);

  // Manejo de Zoom con rueda del ratón
  const handleWheel = (e) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.85;
    const newScale = Math.min(Math.max(scale * zoomFactor, 0.4), 60);

    const newPanX = mouseX - (mouseX - pan.x) * (newScale / scale);
    const newPanY = mouseY - (mouseY - pan.y) * (newScale / scale);

    setScale(newScale);
    setPan({ x: newPanX, y: newPanY });
  };

  // Manejo de Desplazamiento (Pan)
  const handleMouseDown = (e) => {
    if (e.button === 1 || e.button === 2) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  };

  // Traduce la posición del ratón a milímetros y aplica el ajuste a la cuadrícula.
  const handleMouseMove = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    let rawPos = toWorld(mouseX, mouseY);
    let xVal = parseFloat(rawPos.x.toFixed(1));
    let yVal = parseFloat(rawPos.y.toFixed(1));

    if (snapToGrid) {
      xVal = Math.round(xVal / gridStep) * gridStep;
      yVal = Math.round(yVal / gridStep) * gridStep;
    }

    const nextXStr = xVal.toFixed(1);
    const nextYStr = yVal.toFixed(1);

    // Evitar re-renderizados innecesarios del componente si las coordenadas redondeadas no cambiaron
    setMouseCoord((prev) => {
      if (prev.x === nextXStr && prev.y === nextYStr) return prev;
      return { x: nextXStr, y: nextYStr };
    });

    if (isDragging) {
      setPan({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
      return;
    }

    // Detección de punto más cercano al cursor (inspección interactiva de alta velocidad)
    if (points.length > 0) {
      const maxScreenDistSq = 144; // radio de detección de 12px
      const worldTol = 14 / scale; // filtro rápido en coordenadas del mundo
      let closestIdx = -1;
      let minSq = maxScreenDistSq;

      for (let idx = 0; idx < points.length; idx++) {
        const pt = points[idx];
        if (Math.abs(pt.x - rawPos.x) > worldTol || Math.abs(pt.y - rawPos.y) > worldTol) {
          continue;
        }
        const s = toScreen(pt.x, pt.y);
        const distSq = (s.x - mouseX) ** 2 + (s.y - mouseY) ** 2;
        if (distSq < minSq) {
          minSq = distSq;
          closestIdx = idx;
        }
      }

      if (hoveredPointRef.current !== closestIdx) {
        hoveredPointRef.current = closestIdx;
        setHoveredPointIndex(closestIdx);
      }
    } else if (hoveredPointRef.current !== -1) {
      hoveredPointRef.current = -1;
      setHoveredPointIndex(-1);
    }
  };

  // Detiene el desplazamiento al soltar el botón o abandonar el plano.
  const handleMouseUp = () => setIsDragging(false);

  const handleMouseLeave = () => {
    setIsDragging(false);
    if (hoveredPointRef.current !== -1) {
      hoveredPointRef.current = -1;
      setHoveredPointIndex(-1);
    }
  };

  // Capturar coordenadas al hacer clic izquierdo
  const handleCanvasClick = (e) => {
    if (e.button !== 0) return;
    // Calcular desde el clic evita usar coordenadas antiguas si el ratón no se movió.
    const rect = canvasRef.current.getBoundingClientRect();
    const pos = toWorld(e.clientX - rect.left, e.clientY - rect.top);
    const snap = (value) => (snapToGrid ? Math.round(value / gridStep) * gridStep : value).toFixed(1);
    setInputX(snap(pos.x));
    setInputY(snap(pos.y));
    inputXRef.current?.focus();
  };

  // Cada acción conserva hasta 50 versiones. Los actualizadores son puros para
  // que StrictMode pueda evaluarlos dos veces sin duplicar entradas del historial.
  const commitPointsChange = useCallback((newPointsOrFn, nextHeader = stHeader, nextDstHeader = dstHeader) => {
    const nextPoints = typeof newPointsOrFn === 'function' ? newPointsOrFn(points) : newPointsOrFn;
    setHistoryPast((past) => [...past.slice(-49), { points, stHeader, dstHeader }]);
    setHistoryFuture([]);
    setPoints(nextPoints);
    setStHeader(nextHeader);
    setDstHeader(nextDstHeader);
  }, [points, stHeader, dstHeader]);

  // Agregar coordenada manual o capturada
  const handleAddPoint = () => {
    const x = parseFloat(inputX);
    const y = parseFloat(inputY);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      showToast('Ingrese valores válidos para X e Y');
      return;
    }

    const codeToAdd = mode;

    commitPointsChange((prev) => [...prev, { code: codeToAdd, x: x.toFixed(1), y: y.toFixed(1) }]);
    setInputX('');
    setInputY('');
    setPendingEdits({});

    // Si añadió un punto de paso 32, sugerir el siguiente como 33
    if (codeToAdd === 32) {
      setMode(33);
    } else if (codeToAdd === 33) {
      setMode(32);
    }

    // Refocar automáticamente el eje X para seguir agregando fluidamente con Enter
    inputXRef.current?.focus();

    showToast(`Punto [${codeToAdd}] (${x.toFixed(1)}, ${y.toFixed(1)}) agregado`);
  };

  // Deshacer última acción (agregar, editar coordenadas o eliminar punto)
  const handleUndo = useCallback(() => {
    if (historyPast.length === 0) return;
    setPendingEdits({});
    const previousPoints = historyPast[historyPast.length - 1];
    setHistoryPast((past) => past.slice(0, -1));
    setHistoryFuture((future) => [{ points, stHeader, dstHeader }, ...future]);
    setPoints(previousPoints.points);
    setStHeader(previousPoints.stHeader);
    setDstHeader(previousPoints.dstHeader);
    showToast('Acción deshecha');
  }, [historyPast, points, stHeader, dstHeader, showToast]);

  // Rehacer acción previamente deshecha
  const handleRedo = useCallback(() => {
    if (historyFuture.length === 0) return;
    setPendingEdits({});
    const nextPoints = historyFuture[0];
    setHistoryFuture((future) => future.slice(1));
    setHistoryPast((past) => [...past.slice(-49), { points, stHeader, dstHeader }]);
    setPoints(nextPoints.points);
    setStHeader(nextPoints.stHeader);
    setDstHeader(nextPoints.dstHeader);
    showToast('Acción rehecha');
  }, [historyFuture, points, stHeader, dstHeader, showToast]);

  // Atajos de teclado globales para Deshacer (Ctrl+Z) y Rehacer (Ctrl+Y / Ctrl+Shift+Z)
  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) {
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [handleUndo, handleRedo]);

  // Eliminar un punto individual de la lista
  const handleDeletePoint = (index) => {
    setPendingEdits({});
    commitPointsChange((prev) => prev.filter((_, i) => i !== index));
    showToast(`Punto #${index + 1} eliminado`);
  };

  // Manejo de edición diferida y guardado de coordenadas en la tabla
  const handleCellChange = (index, field, value) => {
    setPendingEdits((prev) => ({
      ...prev,
      [`${index}_${field}`]: value,
    }));
  };

  // Aplica las celdas editadas juntas, de modo que Deshacer restaure la edición completa.
  const handleSaveAllPending = () => {
    const keys = Object.keys(pendingEdits);
    if (keys.length === 0) return;

    commitPointsChange((prev) => {
      const updated = [...prev];
      keys.forEach((key) => {
        const [idxStr, field] = key.split('_');
        const idx = parseInt(idxStr, 10);
        const val = parseFloat(pendingEdits[key]);
        if (!isNaN(val) && updated[idx]) {
          updated[idx] = {
            ...updated[idx],
            [field]: val.toFixed(1),
          };
        }
      });
      return updated;
    });

    setPendingEdits({});
    showToast('Coordenadas actualizadas correctamente');
  };

  // Descarta los valores temporales sin modificar las coordenadas confirmadas.
  const handleCancelPending = () => {
    setPendingEdits({});
    showToast('Edición cancelada');
  };

  // Reiniciar todo
  const handleReset = () => {
    if (points.length > 0 && !window.confirm('¿Seguro que desea borrar todos los puntos?')) {
      return;
    }
    setPendingEdits({});
    commitPointsChange([], null, null);
    handleCenterView();
    showToast('Plano y coordenadas reiniciados');
  };

  // Copiar coordenadas al portapapeles
  const handleCopy = async () => {
    if (points.length === 0) {
      showToast('No hay coordenadas para copiar');
      return;
    }
    const textOutput = points.map((p) => `${p.code}\t${p.x}\t${p.y}`).join('\r\n');
    // Confirmar el éxito sólo después de que el navegador acepte la copia.
    try {
      await navigator.clipboard.writeText(textOutput);
      showToast('Coordenadas copiadas al portapapeles');
    } catch {
      showToast('No se pudo acceder al portapapeles. Descarga el archivo .ST.');
    }
  };

  // Centrar y enfoncar las coordenadas cargadas en el plano cartesiano
  const fitViewToPoints = useCallback((pts) => {
    if (!containerRef.current || pts.length === 0) return;
    const rect = containerRef.current.getBoundingClientRect();
    let pMinX = 0, pMaxX = 0, pMinY = 0, pMaxY = 0;
    pts.forEach((p) => {
      const px = parseFloat(p.x);
      const py = parseFloat(p.y);
      if (px < pMinX) pMinX = px;
      if (px > pMaxX) pMaxX = px;
      if (py < pMinY) pMinY = py;
      if (py > pMaxY) pMaxY = py;
    });

    const spanX = Math.max(pMaxX - pMinX, 20);
    const spanY = Math.max(pMaxY - pMinY, 20);
    const margin = 100;
    const availW = Math.max(rect.width - margin, 120);
    const availH = Math.max(rect.height - margin, 120);
    const autoScale = Math.max(0.4, Math.min(5, Math.min(availW / spanX, availH / spanY)));

    const midX = (pMinX + pMaxX) / 2;
    const midY = (pMinY + pMaxY) / 2;

    setScale(autoScale);
    setPan({
      x: rect.width / 2 - midX * autoScale,
      y: rect.height / 2 + midY * autoScale,
    });
  }, []);

  // Cambiar formato activo de exportación (.DST binario o .ST texto)
  const handleFormatChange = (fmt) => {
    setExportFormat(fmt);
    setFileName((prev) => {
      const clean = prev.trim().replace(/\.(dst|st|txt)$/i, '');
      if (!clean) return fmt === 'DST' ? 'figura.DST' : '999.ST';
      return `${clean}.${fmt}`;
    });
  };

  // Manejar cambio en el nombre de archivo (detecta extensión escrita por el usuario)
  const handleFileNameChange = (e) => {
    const val = e.target.value;
    setFileName(val);
    if (val.toUpperCase().endsWith('.DST')) {
      setExportFormat('DST');
    } else if (val.toUpperCase().endsWith('.ST')) {
      setExportFormat('ST');
    }
  };

  // Descargar / Guardar archivo .ST (texto)
  const handleDownloadST = async () => {
    if (points.length === 0) {
      showToast('No hay coordenadas para generar el archivo .ST');
      return;
    }

    let validFileName = fileName.trim();
    if (!validFileName) validFileName = '999.ST';
    if (!validFileName.toUpperCase().endsWith('.ST')) {
      validFileName = validFileName.replace(/\.[^/.]+$/, '') + '.ST';
    }

    // ST nativo: cabecera completa más coordenadas; evita perder parámetros al guardar.
    const fileContent = generateStText(points, stHeader);

    // 1. Abrir explorador de archivos con File System Access API
    if (typeof window !== 'undefined' && 'showSaveFilePicker' in window) {
      try {
        const fileHandle = await window.showSaveFilePicker({
          suggestedName: validFileName,
          types: [
            {
              description: 'Archivo de Trazado de Bordado/Acolchado (.ST)',
              accept: {
                'text/plain': ['.ST', '.st'],
              },
            },
          ],
        });

        const writableStream = await fileHandle.createWritable();
        await writableStream.write(fileContent);
        await writableStream.close();

        if (fileHandle.name) {
          setFileName(fileHandle.name);
        }
        showToast(`Archivo "${fileHandle.name || validFileName}" guardado`);
        return;
      } catch (err) {
        if (err.name === 'AbortError') return;
        console.warn('showSaveFilePicker falló, usando método de descarga estándar:', err);
      }
    }

    // 2. Método de respaldo (Fallback)
    const blob = new Blob([fileContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = validFileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showToast(`Archivo "${validFileName}" descargado`);
  };

  // Descargar / Guardar archivo binario Tajima .DST
  const handleDownloadDST = async () => {
    if (points.length === 0) {
      showToast('No hay coordenadas para generar el archivo .DST');
      return;
    }

    let validFileName = fileName.trim();
    if (!validFileName) validFileName = 'figura.DST';
    if (!validFileName.toUpperCase().endsWith('.DST')) {
      validFileName = validFileName.replace(/\.[^/.]+$/, '') + '.DST';
    }

    const dstBuffer = generateDstUint8(points, validFileName, stitchLengthMm, dstHeader);

    // 1. Abrir explorador de archivos con File System Access API (Guardar como...)
    if (typeof window !== 'undefined' && 'showSaveFilePicker' in window) {
      try {
        const fileHandle = await window.showSaveFilePicker({
          suggestedName: validFileName,
          types: [
            {
              description: 'Archivo de Bordado Tajima Binario (.DST)',
              accept: {
                'application/octet-stream': ['.DST', '.dst'],
              },
            },
          ],
        });

        const writableStream = await fileHandle.createWritable();
        await writableStream.write(dstBuffer);
        await writableStream.close();

        if (fileHandle.name) {
          setFileName(fileHandle.name);
        }
        showToast(`Archivo binario "${fileHandle.name || validFileName}" guardado`);
        return;
      } catch (err) {
        if (err.name === 'AbortError') return;
        console.warn('showSaveFilePicker falló, usando método de descarga estándar:', err);
      }
    }

    // 2. Método de respaldo (Fallback)
    const blob = new Blob([dstBuffer], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = validFileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showToast(`Archivo binario "${validFileName}" descargado`);
  };

  // Descargar según formato activo
  const handleDownload = () => {
    if (exportFormat === 'DST' || fileName.toUpperCase().endsWith('.DST')) {
      handleDownloadDST();
    } else {
      handleDownloadST();
    }
  };

  // Cargar / Subir archivo de coordenadas (.DST binario, .ST o bloc de notas .txt)
  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const buffer = event.target?.result;
      if (!buffer || !(buffer instanceof ArrayBuffer)) return;

      const uint8 = new Uint8Array(buffer);
      const isDst =
        file.name.toLowerCase().endsWith('.dst') ||
        (uint8.byteLength >= 512 && uint8[0] === 0x4c && uint8[1] === 0x41 && uint8[2] === 0x3a);

      let parsedPoints = [];
      let importedHeader = null;
      let importedDstHeader = null;

      if (isDst) {
        try {
          const dstData = parseDst(uint8);
          parsedPoints = dstData.points;
          importedDstHeader = dstData.header;
          setExportFormat('DST');
          setStitchLengthMm(0.0);
          setStitchLengthInput('0.0');
          if (file.name) {
            setFileName(file.name);
          } else if (dstData.label) {
            setFileName(`${dstData.label}.DST`);
          }
        } catch (err) {
          console.error('Error al analizar archivo DST:', err);
          showToast('Error al leer el archivo DST');
          return;
        }
      } else {
        // Distinguir ST nativo de listas TXT; validar y conservar la cabecera.
        try {
          const imported = parseStText(new TextDecoder('utf-8').decode(uint8));
          parsedPoints = imported.points;
          importedHeader = imported.header;
        } catch (err) {
          showToast(err.message);
          return;
        }

        setExportFormat('ST');
        setStitchLengthMm(2.5);
        setStitchLengthInput('2.5');
        if (file.name) {
          setFileName(file.name);
        }
      }

      if (parsedPoints.length === 0) {
        showToast('No se encontraron coordenadas válidas en el archivo');
        return;
      }

      setPendingEdits({});
      // Importar y deshacer/restaurar conserva también los parámetros ST y DST.
      commitPointsChange(parsedPoints, importedHeader, importedDstHeader);

      // Sincronizar el modo de trazado según el último punto
      const lastPt = parsedPoints[parsedPoints.length - 1];
      if (lastPt?.code === 32) {
        setMode(33);
      } else {
        setMode(16);
      }

      setTimeout(() => {
        fitViewToPoints(parsedPoints);
      }, 50);

      showToast(`Archivo "${file.name}" cargado (${parsedPoints.length} puntos)`);
    };

    reader.readAsArrayBuffer(file);
    e.target.value = ''; // Resetear para permitir recargar el mismo archivo si se desea
  };

  // Cada recta/arco redondea su propio conteo; Width y Length usan sus
  // límites geométricos reales. En archivos DST se conservan AllStitch y MaxLen nativos de Embro.
  const metrics = useMemo(
    () => calculateFigureMetrics(points, stitchLengthMm, dstHeader),
    [points, stitchLengthMm, dstHeader]
  );

  // Código del trazado activo en edición (16, 32 o 33) para sincronizar el color del botón Guardar
  const activePendingCode = useMemo(() => {
    const keys = Object.keys(pendingEdits);
    if (keys.length === 0) return 16;
    const codes = keys
      .map((key) => {
        const idx = parseInt(key.split('_')[0], 10);
        return points[idx]?.code;
      })
      .filter(Boolean);
    return codes.length > 0 ? codes[codes.length - 1] : 16;
  }, [pendingEdits, points]);

  return (
    <div className="app-container" data-theme={theme}>
      {/* Input oculto para subir archivos de coordenadas (.DST binario, .ST o bloc de notas .txt) */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".dst,.DST,.st,.ST,.txt,.TXT"
        style={{ display: 'none' }}
        onChange={handleFileUpload}
      />

      {/* Toast Notificación */}
      {toastMessage && (
        <div className="toast-notice" role="status" aria-live="polite">
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Barra Superior / Header */}
      <header className="app-header">
        <div className="brand-section">
          <div className="brand-title-group">
            <div>
              <h1>PlugiT</h1>
            </div>
            <div className="brand-sub">Diseño de trayectorias de puntada</div>
          </div>
        </div>

        <div className="header-actions">
          {/* Alternar Tema Claro / Oscuro */}
          <button
            className="btn-glass-secondary btn-glass-icon"
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
            title={theme === 'dark' ? 'Cambiar a Modo Claro' : 'Cambiar a Modo Oscuro'}
          >
            {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
          </button>

          {/* Botón Deshacer */}
          <button
            className="btn-glass-secondary"
            onClick={handleUndo}
            disabled={historyPast.length === 0}
            title="Deshacer última acción (Ctrl+Z)"
          >
            <UndoIcon />
            <span>Deshacer</span>
          </button>

          {/* Botón Rehacer */}
          <button
            className="btn-glass-secondary"
            onClick={handleRedo}
            disabled={historyFuture.length === 0}
            title="Rehacer acción deshecha (Ctrl+Y)"
          >
            <RedoIcon />
            <span>Rehacer</span>
          </button>

          {/* Centrar Plano */}
          <button
            className="btn-glass-secondary"
            onClick={handleCenterView}
            title="Centrar plano cartesiano en (0,0)"
          >
            <CenterIcon />
            <span>Centrar</span>
          </button>

          {/* Limpiar Plano */}
          <button
            className="btn-glass-secondary"
            onClick={handleReset}
            title="Borrar todo y reiniciar"
          >
            <TrashIcon />
            <span>Limpiar</span>
          </button>

          {/* Subir archivo */}
          <button
            className="btn-glass-primary"
            onClick={() => fileInputRef.current?.click()}
            title="Subir archivo de coordenadas (.DST, .ST o bloc de notas .txt)"
          >
            <UploadIcon />
            <span>Importar archivo</span>
          </button>

          
        </div>
      </header>

      {/* Cuerpo de la Aplicación */}
      <div className="app-body">
        {/* PANEL LATERAL IZQUIERDO (Fijo y siempre visible) */}
        <aside className="sidebar-left" aria-label="Herramientas de diseño">
          {/* Encabezado del flujo: seleccionar un trazo, colocar sus puntos y exportar. */}
          <div className="workspace-heading"><span className="eyebrow">ESPACIO DE DISEÑO</span><h2>Construye tu trayectoria</h2><p>Define cada punto con precisión.</p></div>
          {/* Sección: Tipo de Trazado (Vertical) */}
          <div className="panel-card">
            <div className="panel-card-title">
              <CompassIcon />
              <span>Tipo de Trazado</span>
            </div>

            <div className="trazado-vertical-group">
              {/* 1. Recta [16] */}
              <button
                className={`trazado-item-btn ${mode === 16 ? 'active-16' : ''}`}
                aria-pressed={mode === 16}
                onClick={() => setMode(16)}
              >
                <div className="trazado-icon-wrapper" style={{ color: theme === 'dark' ? '#ff5964' : '#b91c2c' }}>
                  <LineIcon />
                </div>
                <div className="trazado-info">
                  <div className="trazado-name">
                    <span>Recta</span>
                    <span className="badge-code badge-rect">16</span>
                  </div>
                  <div className="trazado-desc">Línea recta continua</div>
                </div>
              </button>

              {/* 2. Curva [32] */}
              <button
                className={`trazado-item-btn ${mode === 32 ? 'active-32' : ''}`}
                aria-pressed={mode === 32}
                onClick={() => setMode(32)}
              >
                <div className="trazado-icon-wrapper" style={{ color: '#242424' }}>
                  <CurveMidIcon />
                </div>
                <div className="trazado-info">
                  <div className="trazado-name">
                    <span>Control de curva</span>
                    <span className="badge-code badge-curve-mid">32</span>
                  </div>
                  <div className="trazado-desc">Punto de paso / control de arco</div>
                </div>
              </button>

              {/* 3. Curva [33] */}
              <button
                className={`trazado-item-btn ${mode === 33 ? 'active-33' : ''}`}
                aria-pressed={mode === 33}
                onClick={() => setMode(33)}
              >
                <div className="trazado-icon-wrapper" style={{ color: '#F59E0B' }}>
                  <CurveEndIcon />
                </div>
                <div className="trazado-info">
                  <div className="trazado-name">
                    <span>Final de curva</span>
                    <span className="badge-code badge-curve-end">33</span>
                  </div>
                  <div className="trazado-desc">Punto final de arco</div>
                </div>
              </button>
            </div>
          </div>

          {/* Sección: Coordenadas Manuales */}
          <div className="panel-card">
            <div className="panel-card-title">
              <PlusIcon />
              <span>Coordenadas (mm)</span>
            </div>

            <div className="input-row">
              <div className="input-field-group">
                <label className="input-label" htmlFor="point-x">Eje X</label>
                <input
                  id="point-x"
                  ref={inputXRef}
                  type="number"
                  step={gridStep}
                  className="input-styled"
                  value={inputX}
                  onChange={(e) => setInputX(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      if (inputY.trim() !== '') {
                        handleAddPoint();
                      } else {
                        inputYRef.current?.focus();
                      }
                    }
                  }}
                  placeholder="0.0"
                />
              </div>

              <div className="input-field-group">
                <label className="input-label" htmlFor="point-y">Eje Y</label>
                <input
                  id="point-y"
                  ref={inputYRef}
                  type="number"
                  step={gridStep}
                  className="input-styled"
                  value={inputY}
                  onChange={(e) => setInputY(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      if (inputX.trim() !== '') {
                        handleAddPoint();
                      } else {
                        inputXRef.current?.focus();
                      }
                    }
                  }}
                  placeholder="0.0"
                />
              </div>
            </div>

            <button className="btn-glass-primary" onClick={handleAddPoint}>
              <PlusIcon />
              <span>Agregar punto</span>
            </button>
          </div>

          {/* Sección: Configuración del Plano */}
          <div className="panel-card">
            <div className="panel-card-title">
              <GridIcon />
              <span>Ajustes del Plano</span>
            </div>

            <div className="setting-row">
              <span>Paso de Cuadrícula</span>
              <select
                className="select-styled"
                value={gridStep}
                aria-label="Paso de cuadrícula"
                onChange={(e) => setGridStep(Number(e.target.value))}
              >
                <option value={1}>1.0 mm</option>
                <option value={2}>2.0 mm</option>
                <option value={5}>5.0 mm (Estándar)</option>
                <option value={10}>10.0 mm</option>
                <option value={20}>20.0 mm</option>
              </select>
            </div>

            <div className="setting-row">
              <span>Ajuste a Cuadrícula (Snap)</span>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  aria-label="Ajustar a cuadrícula"
                  checked={snapToGrid}
                  onChange={(e) => setSnapToGrid(e.target.checked)}
                />
                <span className="toggle-slider"></span>
              </label>
            </div>

            <div className="setting-row">
              <span>Etiquetas Numéricas (mm)</span>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  aria-label="Mostrar etiquetas numéricas"
                  checked={showLabels}
                  onChange={(e) => setShowLabels(e.target.checked)}
                />
                <span className="toggle-slider"></span>
              </label>
            </div>

            <div className="setting-row">
              <span>Flechas de Sentido</span>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  aria-label="Mostrar flechas de sentido"
                  checked={showDirections}
                  onChange={(e) => setShowDirections(e.target.checked)}
                />
                <span className="toggle-slider"></span>
              </label>
            </div>

            <div className="setting-row">
              <span>Coordenadas de Puntos</span>
              <label className="toggle-switch" title={showCoords ? 'Ocultar coordenadas en el plano cartesiano' : 'Mostrar coordenadas en el plano cartesiano'}>
                <input
                  type="checkbox"
                  aria-label="Mostrar coordenadas de puntos"
                  checked={showCoords}
                  onChange={(e) => setShowCoords(e.target.checked)}
                />
                <span className="toggle-slider"></span>
              </label>
            </div>
          </div>

          {/* Sección: Métricas de la Pieza */}
          <div className="panel-card">
            <div className="panel-card-title">
              <RulerIcon />
              <span>Medidas de la figura</span>
            </div>

            {/* El ajuste coincide con Set StitchLen en Embro */}
            <div className="stitch-length-setting">
              <label className="input-label" htmlFor="stitch-length">
                Set StitchLen (mm)
                {metrics.isDirectStitches && (
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: '6px' }}>
                    (Fijo en DST)
                  </span>
                )}
              </label>
              <input
                id="stitch-length"
                type="number"
                min="0.5"
                max="12.1"
                step="0.1"
                className="input-styled"
                disabled={metrics.isDirectStitches}
                value={metrics.isDirectStitches ? '0.0' : stitchLengthInput}
                onChange={(e) => {
                  setStitchLengthInput(e.target.value);
                  const value = Number(e.target.value);
                  if (Number.isFinite(value) && value >= 0.1 && value <= 12.1) setStitchLengthMm(value);
                }}
                onBlur={() => {
                  const value = Number(stitchLengthInput);
                  if (!Number.isFinite(value) || value < 0.1 || value > 12.1) {
                    showToast('Set StitchLen debe estar entre 0.1 y 12.1 mm');
                  }
                  setStitchLengthInput(stitchLengthMm.toFixed(1));
                }}
              />
            </div>
            <div className="metrics-grid">
              <div className="metric-item">
                <span className="metric-label">AllStitch:</span>
                <span className="metric-value">
                  {metrics.allStitch} <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>({metrics.total} pts)</span>
                </span>
              </div>
              <div className="metric-item">
                <span className="metric-label">MaxLen (mm):</span>
                <span className="metric-value">{metrics.maxStitchLengthMm} mm</span>
              </div>
              <div className="metric-item">
                <span className="metric-label">Recorrido Total:</span>
                <span className="metric-value">{metrics.totalDistanceMm} mm</span>
              </div>
              <div className="metric-item">
                <span className="metric-label">Ancho (Width):</span>
                <span className="metric-value">{metrics.widthIn} in ({metrics.widthMm} mm)</span>
              </div>
              <div className="metric-item">
                <span className="metric-label">Largo (Length):</span>
                <span className="metric-value">{metrics.lengthIn} in ({metrics.lengthMm} mm)</span>
              </div>
            </div>
          </div>
        </aside>

        {/* ÁREA CENTRAL: PLANO CARTESIANO */}
        <main className="canvas-container" ref={containerRef}>
          {/* HUD Superior Flotante */}
          <div className="canvas-hud-top">
            <div className="hud-pill">
              <span>Cursor:</span>
              <strong>X: {mouseCoord.x} mm</strong>
              <strong>Y: {mouseCoord.y} mm</strong>
            </div>

            <div className="hud-pill">
              <span>Zoom:</span>
              <strong>{Math.round((scale / 5) * 100)}%</strong>
            </div>

            {snapToGrid && (
              <div className="hud-pill">
                <span>SNAP:</span>
                <strong>{gridStep} mm</strong>
              </div>
            )}
          </div>

          {/* Canvas de Alta Precisión: el plano queda libre desde el inicio. */}
          <canvas
            ref={canvasRef}
            className="main-canvas"
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseLeave}
            aria-label="Plano de diseño de trayectorias en milímetros"
            onClick={handleCanvasClick}
            onContextMenu={(e) => e.preventDefault()}
            style={{ cursor: isDragging ? 'grabbing' : 'crosshair' }}
          />

          {/* Botón flotante azul para reabrir panel si está cerrado */}
          {!showRightSidebar && (
            <button
              className="floating-sidebar-toggle-blue"
              onClick={() => setShowRightSidebar(true)}
              aria-label="Abrir panel" title="Abrir panel"
            >
              <PanelRightIcon size={18} />
            </button>
          )}

          {/* Controles Flotantes de Zoom y Navegación */}
          <div className="canvas-controls-floating">
            <button
              className="floating-btn"
              onClick={() => setScale((s) => Math.min(s * 1.25, 60))}
              aria-label="Acercar (Zoom In)" title="Acercar (Zoom In)"
            >
              +
            </button>
            <button
              className="floating-btn"
              onClick={() => setScale((s) => Math.max(s * 0.8, 0.4))}
              aria-label="Alejar (Zoom Out)" title="Alejar (Zoom Out)"
            >
              −
            </button>
            <button
              className="floating-btn"
              onClick={handleCenterView}
              aria-label="Centrar en el origen (0,0)" title="Centrar en el origen (0,0)"
            >
              <CenterIcon size={14} />
            </button>
          </div>
        </main>

        {/* PANEL LATERAL DERECHO: LISTA DE PUNTOS */}
        {showRightSidebar && (
          <aside className="sidebar-right" aria-label="Coordenadas y exportación">
            <div className="table-header-bar">
              <div className="table-header-title">
                <span>Coordenadas</span><span className="point-count">{points.length}</span>
              </div>
              <button
                className="btn-close-panel-red"
                onClick={() => setShowRightSidebar(false)}
                aria-label="Cerrar panel" title="Cerrar panel"
              >
                <CloseIcon size={14} />
              </button>
            </div>

            <div
              className="points-table-container"
              onScroll={(e) => setTableScrollTop(e.currentTarget.scrollTop)}
            >
              <table className="points-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Cód</th>
                    <th>X (mm)</th>
                    <th>Y (mm)</th>
                    <th style={{ width: '28px' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {points.length === 0 ? (
                    <tr>
                      <td colSpan="5" style={{ textAlign: 'center', padding: '2.5rem 1rem', color: 'var(--text-muted)' }}>
                        <div className="table-empty-icon"><PlusIcon size={24} /></div><strong>Aún no hay puntos</strong><br />
                        Tus coordenadas aparecerán aquí al agregar el primer punto.
                      </td>
                    </tr>
                  ) : (() => {
                    const ROW_HEIGHT = 38;
                    const visibleWindowHeight = 650;
                    const totalRows = points.length;
                    const startRowIdx = Math.max(0, Math.floor(tableScrollTop / ROW_HEIGHT) - 6);
                    const endRowIdx = Math.min(totalRows, Math.ceil((tableScrollTop + visibleWindowHeight) / ROW_HEIGHT) + 6);
                    const topSpacerHeight = startRowIdx * ROW_HEIGHT;
                    const bottomSpacerHeight = (totalRows - endRowIdx) * ROW_HEIGHT;

                    return (
                      <>
                        {topSpacerHeight > 0 && (
                          <tr style={{ height: `${topSpacerHeight}px` }}>
                            <td colSpan="5" style={{ padding: 0, border: 'none', background: 'transparent' }} />
                          </tr>
                        )}
                        {points.slice(startRowIdx, endRowIdx).map((pt, sliceIdx) => {
                          const i = startRowIdx + sliceIdx;
                          const valX = pendingEdits[`${i}_x`] !== undefined ? pendingEdits[`${i}_x`] : pt.x;
                          const valY = pendingEdits[`${i}_y`] !== undefined ? pendingEdits[`${i}_y`] : pt.y;
                          const isModifiedX = pendingEdits[`${i}_x`] !== undefined && pendingEdits[`${i}_x`] !== pt.x;
                          const isModifiedY = pendingEdits[`${i}_y`] !== undefined && pendingEdits[`${i}_y`] !== pt.y;
                          const isHovered = hoveredPointIndex === i;

                          return (
                            <tr key={i} className={isHovered ? 'row-hovered' : ''}>
                              <td style={{ fontWeight: 600, color: 'var(--text-muted)' }}>{i + 1}</td>
                              <td>
                                <span
                                  className={`badge-code ${
                                    pt.code === 16
                                      ? 'badge-rect'
                                      : pt.code === 32
                                      ? 'badge-curve-mid'
                                      : 'badge-curve-end'
                                  }`}
                                >
                                  {pt.code}
                                </span>
                              </td>
                              <td style={{ padding: '2px 4px' }}>
                                <EditableCell
                                  label={`Coordenada X del punto ${i + 1}`}
                                  value={valX}
                                  isModified={isModifiedX}
                                  code={pt.code}
                                  onChange={(newVal) => handleCellChange(i, 'x', newVal)}
                                  onEnter={handleSaveAllPending}
                                  onEscape={handleCancelPending}
                                />
                              </td>
                              <td style={{ padding: '2px 4px' }}>
                                <EditableCell
                                  label={`Coordenada Y del punto ${i + 1}`}
                                  value={valY}
                                  isModified={isModifiedY}
                                  code={pt.code}
                                  onChange={(newVal) => handleCellChange(i, 'y', newVal)}
                                  onEnter={handleSaveAllPending}
                                  onEscape={handleCancelPending}
                                />
                              </td>
                              <td style={{ textAlign: 'center' }}>
                                <button
                                  className="btn-delete-row"
                                  onClick={() => handleDeletePoint(i)}
                                  aria-label="Eliminar este punto" title="Eliminar este punto"
                                >
                                  <CloseIcon size={12} />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                        {bottomSpacerHeight > 0 && (
                          <tr style={{ height: `${bottomSpacerHeight}px` }}>
                            <td colSpan="5" style={{ padding: 0, border: 'none', background: 'transparent' }} />
                          </tr>
                        )}
                      </>
                    );
                  })()}
                </tbody>
              </table>
            </div>

            {/* Barra de Guardar Cambios debajo de las coordenadas */}
            {Object.keys(pendingEdits).length > 0 && (
              <div className="save-changes-bar">
                <button
                  className={`btn-save-changes code-${activePendingCode}`}
                  onClick={handleSaveAllPending}
                  title="Guardar todos los cambios de coordenadas"
                >
                  <SaveIcon size={14} />
                  <span>Guardar cambios</span>
                </button>
                <button
                  className="btn-glass-secondary btn-cancel-changes"
                  onClick={handleCancelPending}
                  title="Descartar cambios no guardados"
                >
                  <CloseIcon size={12} />
                  <span>Cancelar</span>
                </button>
              </div>
            )}

            {/* Exportación: elige el formato y el nombre antes de descargar la trayectoria. */}
            <div className="table-footer">
              <div className="export-heading"><span className="eyebrow">ARCHIVO DE SALIDA</span><h3>Exporta tu diseño</h3></div>
              {/* Selector de formato: DST (Binario) o ST (Texto) */}
              <div className="format-selector-wrapper">
                <span className="format-selector-label">Formato:</span>
                <div className="format-pill-group">
                  <button
                    type="button"
                    className={`format-pill-btn ${exportFormat === 'ST' ? 'active' : ''}`}
                    onClick={() => handleFormatChange('ST')}
                    title="Formato de Trazado (.ST)"
                  >
                    .ST
                  </button>
                  <button
                    type="button"
                    className={`format-pill-btn ${exportFormat === 'DST' ? 'active' : ''}`}
                    onClick={() => handleFormatChange('DST')}
                    title="Formato Tajima (.DST) para bordado industrial y acolchado"
                  >
                    .DST
                  </button>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.4rem' }}>
                <input
                  type="text"
                  className="input-styled"
                  value={fileName}
                  onChange={handleFileNameChange}
                  aria-label="Nombre del archivo de salida"
                  placeholder={exportFormat === 'DST' ? 'Mi_diseno.DST' : 'Mi_diseno.ST'}
                  style={{ fontSize: '0.78rem', padding: '0.4rem 0.5rem' }}
                />
              </div>

              <button
                className="btn-glass-primary"
                onClick={handleDownload}
                disabled={points.length === 0}
                title={
                  exportFormat === 'DST'
                    ? 'Descargar archivo binario Tajima (.DST)'
                    : 'Descargar archivo de texto (.ST)'
                }
              >
                <DownloadIcon />
                <span>Descargar .{exportFormat}</span>
              </button>

              <button
                className="btn-glass-secondary"
                onClick={handleCopy}
                disabled={points.length === 0}
              >
                <CopyIcon />
                <span>Copiar Coordenadas</span>
              </button>
            </div>
          </aside>
        )}
      </div>
      {/* Estado del documento: resume los puntos confirmados y la herramienta activa. */}
      <footer className="app-statusbar"><span><i className="status-dot" />{Object.keys(pendingEdits).length ? 'Cambios por aplicar' : 'Listo para diseñar'}</span><span>{points.length} puntos <span className="status-separator">/</span> {mode === 16 ? 'Recta' : mode === 32 ? 'Control de curva' : 'Final de curva'} <span className="status-separator">/</span> Unidades: mm</span></footer>
    </div>
  );
}