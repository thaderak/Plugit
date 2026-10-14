# PlugiT

Editor de trayectorias de puntada hecho con React y canvas, distribuible como HTML y aplicación Electron.

## Ejecutar

- `npm install`: instalar dependencias.
- `npm run dev`: abrir el editor con Vite.
- `npm run lint`: analizar el código.
- `npm test`: verificar medidas, curvas, subdivisión y exportación DST.
- `npm run build`: crear `dist/index.html` y actualizar `release/PlugiT.html`.
- `npm run electron:build`: generar los instaladores de escritorio.

## Usar el editor

1. Selecciona Recta (16), Control de curva (32) o Final de curva (33).
2. Haz clic en el plano para capturar X e Y, o introduce sus valores manualmente.
3. Pulsa Agregar punto. Una curva utiliza el punto anterior, un control 32 y un final 33.
4. Modifica coordenadas en la tabla. Enter aplica los cambios; Escape los cancela.
5. Elige DST o ST, indica un nombre y descarga el diseño.

La rueda controla el zoom; el botón derecho o central desplaza el plano. Ctrl+Z deshace y Ctrl+Y o Ctrl+Shift+Z rehace. El historial mantiene hasta 50 versiones.

## Mapa del código

| Archivo | Responsabilidad |
| --- | --- |
| `src/main.jsx` | Montaje de React y comprobaciones de StrictMode. |
| `src/App.jsx` | Estado del documento, historial, interacciones, dibujo, métricas e interfaz. Los comentarios delimitan cada sección y función principal. |
| `src/App.css` | Temas, componentes, sistema visual del estudio y adaptación a pantallas pequeñas. |
| `src/components/Icons.jsx` | Iconos SVG locales y su propósito. |
| `src/utils/figureGeometry.js` | Geometría, medidas y reparto de puntadas compartido. |
| `src/utils/stFormat.js` | Importación y exportación de ST nativo con cabecera y listas anteriores. |
| `src/utils/dstFormat.js` | Lectura y escritura DST, codificación de movimientos y discretización de arcos. |
| `electron/main.cjs` | Ventana y ciclo de vida de la aplicación de escritorio. |
| `vite.config.js` | Compilación de React y empaquetado del HTML. |

## Cambios de esta revisión

- Jerarquía visual más clara, superficies sobrias con rojo, grafito y plata inspirados en `src/assets/plugit.png`.
- Paneles redondeados, títulos de sección, plano despejado y barra de estado.
- Exportación diferenciada, etiquetas en español y adaptación a pantallas pequeñas.
- Foco de teclado visible, nombres accesibles y avisos anunciados a lectores de pantalla.
- Historial con actualizadores puros, captura de coordenadas desde el clic y gestión de errores del portapapeles.
- Comentarios explicativos por sección y función, sin repetir cada instrucción trivial.

## Mejoras recomendadas, por prioridad

1. **Proteger el trabajo:** guardar y restaurar proyectos con sus curvas, ajustes y nombre. Actualmente el documento vive en memoria y se pierde al recargar. DST convierte curvas en puntadas y no sirve como formato editable completo.
2. **Validar la trayectoria:** advertir controles 32 sin final 33, finales aislados y valores inválidos. Las ediciones vacías todavía se omiten al aplicar y la exportación permite curvas incompletas.
3. **Verificar el formato DST:** añadir pruebas con archivos de referencia, saltos, cambios de color, límites y arcos. El lector actual convierte todos los comandos a puntos de código 16; no conserva la semántica de saltos/paradas. El conteo y la exportación DST comparten ahora la subdivisión. Falta contrastar más diseños y comandos de Embro.
4. **Separar responsabilidades:** extraer la barra superior, los paneles y el canvas en componentes; mover historial y geometría a módulos propios. Métricas y exportación comparten geometría; queda unificar también el dibujo del canvas. Consolidar también los estilos base y los ajustes visuales posteriores.
5. **Editar directamente en el plano:** seleccionar y arrastrar nodos, mostrar el punto activo y previsualizar curvas antes de confirmarlas.
6. **Mejorar rendimiento:** limitar redibujados durante el movimiento y virtualizar la tabla en diseños grandes. Actualmente mover el cursor actualiza estado y vuelve a renderizar el editor.
7. **Afinar navegación y escritorio:** encuadrar arcos con sus extremos reales, mantener el centro al usar botones de zoom y corregir el modo de desarrollo de Electron: su script no establece la variable NODE_ENV que consulta main.cjs.

## Verificación

Compilar el HTML no regenera los instaladores `.exe` existentes. Para distribuir el nuevo diseño como aplicación de escritorio ejecuta el comando de empaquetado correspondiente.

El logo `plugit.png` se utiliza únicamente como favicon de la pestaña; Vite lo incorpora al HTML distribuible.

## Medidas comparadas con Embro

La referencia es `C:\stitchdata\002.ST`, junto con la captura proporcionada por el usuario: dos arcos, ancho de 300.0 mm (11.8 pulgadas), largo de 600.0 mm (23.6 pulgadas), AllStitch de 376 y Set StitchLen de 2.5 mm.

El cálculo anterior redondeaba la longitud total y mostraba 375. Ahora cada arco o recta se subdivide por separado: los dos arcos generan 188 + 188 = 376. Las dimensiones incluyen el origen y los extremos reales de los arcos. No se añade una puntada artificial para corregir el resultado.

El panel permite cambiar la longitud de puntada entre 0.1 y 12.1 mm. Utiliza el mismo Set StitchLen en Embro para comparar. MaxLen muestra la mayor distancia geométrica entre puntadas antes de la cuantización binaria DST a 0.1 mm. La exportación DST aplica el mismo reparto también a las rectas cortas, y su cabecera no cuenta el comando END como puntada.

Las nueve pruebas automáticas verifican la referencia 002.ST, otras longitudes, arcos en ambos sentidos, límites geométricos, casos alineados y la concordancia con el DST generado. La igualdad con Embro se ha contrastado con la captura de 002.ST; otros formatos, extensiones de ejes, inversión, escalado y ajustes de máquina necesitan referencias adicionales. No se modificaron los archivos ni la configuración de Embro.

## Cabecera ST de Embro

La descarga ST ahora incluye los 18 parámetros de cabecera además de las coordenadas. Al importar un archivo de Embro se conservan sus parámetros originales; al editar, solo se actualizan los límites de la figura y la cantidad de registros. Sin ediciones, la salida es idéntica al original. El historial conserva la cabecera junto con las coordenadas.

Se comprobaron los 121 archivos ST de `C:\stitchdata` y pasaron 16 pruebas. Para figuras nuevas se utiliza el perfil base observado en `003.ST`. La función de algunos parámetros sigue sin identificar; consulta [el informe de análisis](docs/embro-st-analysis.md) para distinguir evidencia confirmada e inferencias. Hay un ejemplo completo en `exports/002-plugit.ST`.
