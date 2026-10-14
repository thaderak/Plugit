# Análisis local de ST de Embro

## Evidencia examinada

- Ejecutable instalado: `C:\Program Files\optec\embro\embro.exe` (434176 bytes).
- SHA-256: `92921dc3995e4d3817fde1ecfd845e94bfe17efe828f99c261ddb659ac01b7b8`.
- 121 archivos `.ST` de `C:\stitchdata`, incluyendo `002.ST` y `003.ST`.
- Capturas del usuario: Width 300.0 mm, Length 600.0 mm, AllStitch 376 y Set StitchLen 2.5 para `002.ST`.
- Inspección estática del ejecutable con pefile y Capstone; no se modificó el programa ni sus datos.

## Estructura confirmada

La cadena de formato en la dirección virtual `0x47494c` es:

```
%d %d %d %f %f %f %f %f %f %f %f %d %d %d %d %d %d %d
```

La rutina de lectura ST llama a `fscanf` en `0x44f0a4` con ese formato. Después llama a `fscanf` en `0x44f0d7` con `%d %f %f` para leer código/X/Y. El ejecutable importa `fscanf` mediante `0x7a16a4`.

Los 18 valores de cabecera se consumen antes del primer punto. En esa rutina los destinos de los campos enteros se reutilizan y los de los reales también: la cabecera sirve para avanzar el lector; no se aplica ahí el factor 1.03 de `002.ST` a las coordenadas. Esto explica por qué perder la cabecera puede hacer que Embro consuma coordenadas como si fueran parámetros. No basta con que los puntos sean iguales.

Los saltos de línea no delimitan los campos para `fscanf`: existen archivos de nueve y diez líneas de cabecera, y todos los 121 examinados cumplen el mismo orden. El último entero coincide con la cantidad de triples de coordenadas en todos los archivos. Los códigos observados son 16, 32 y 33.

| Posiciones (1-based) | En 002.ST | Estado de identificación |
| --- | --- | --- |
| 1 | 1 | Entero inicial; se observan 1 y 2. Significado funcional no confirmado. |
| 2–3 | 22 70 | Enteros de parámetros; significado no confirmado. |
| 4–5 | 0 300 | Límites X declarados, según correlación con las figuras del corpus. |
| 6–7 | 0 600 | Límites Y declarados, según correlación con las figuras del corpus. |
| 8–9 | 0 0 | Reales; todos cero en el corpus. Significado no confirmado. |
| 10–11 | 1.00 1.03 | Reales; parecen factores, pero su función no está confirmada. Se conservan. |
| 12 | 0 | Entero; todos cero en el corpus. Significado no confirmado. |
| 13 | 101 | Entero variable; no se ha confirmado si es un identificador u otro parámetro. |
| 14–17 | 0 0 0 0 | Enteros; todos cero en el corpus. Significado no confirmado. |
| 18 | 4 | Cantidad de registros de coordenadas, verificada en los 121 archivos. |

No se inventan nombres como escala, reversa, extensión o velocidad para campos no demostrados. Tampoco se escribe StitchLen en un campo elegido arbitrariamente: se debe usar el mismo ajuste en ambos programas para comparar puntadas.

## Corrección en PlugiT

- `parseStText` distingue cabeceras nativas y listas antiguas de coordenadas.
- Conserva todos los parámetros y su texto original, sin redondear las coordenadas al importar.
- Si los puntos no cambiaron, `generateStText` devuelve el archivo original íntegro, incluidos espacios y saltos de línea.
- Si cambiaron, actualiza únicamente los cuatro límites geométricos y la cantidad de registros. Los límites se calculan incluyendo el origen y extremos de los arcos.
- Una figura sin cabecera usa los parámetros base observados en `003.ST`: 1 / 17 0, pares de límites, 0 0, 1.00 1.00 y ceros en los demás parámetros. Es un perfil estructural de referencia, no una identificación de todos los ajustes de máquina.
- Deshacer y Rehacer conservan juntos los puntos y su cabecera; importar DST o limpiar descarta la cabecera ST del documento nuevo.
- Copiar coordenadas sigue generando solo la lista de puntos. Descargar ST genera el archivo completo.

## Validación y límites

### Ejecución aislada del bloque original del lector

`scripts/inspect-embro-reader.py` ejecuta con Unicorn x86 las instrucciones originales del ejecutable desde `0x44f018` hasta `0x44f2ca`. Sustituye las llamadas CRT `fscanf`/`fclose` y la comprobación Debug de pila. No ejecuta puertos, hardware ni la aplicación completa. Los valores de prueba son numéricos válidos; la sustitución CRT no demuestra comportamiento con texto mal formado.

Se ejecutaron las 23 variantes. **Las 18 variantes de cabecera cargan exactamente los mismos tres registros que la referencia.** Las cuatro variantes de código/coordenadas cambian los registros. Evidencia reproducible en `exports/embro-experiments/reader-results.json`.

La lectura repite `fscanf("%d %f %f")` mientras la conversión devuelve un valor positivo (`0x44f2a4` → `0x44f0b4`); el entero final de cabecera no limita ese bucle. H18 declara dos puntos y carga tres. Si la conversión no devuelve tres valores, el código se sustituye por 99 y no se incorpora a la figura. El código 16 se guarda como tipo interno 2; 32 y 33 como tipo interno 3. Sus coordenadas se copian como floats sin aplicar factores de cabecera.

Después de cargar, el entero temporal de cabecera se sobrescribe con cero en `0x44f32b` antes de usarse como índice de geometría. El temporal float no tiene referencias posteriores en el tramo inspeccionado hasta `0x451217`. Cambiar los parámetros de cabecera ensayados no cambia la figura cargada en este lector. Esto identifica su efecto en este bloque; no recupera los nombres históricos de los campos ni verifica la pantalla completa o todas las versiones.

### Experimentos de un campo por archivo

`scripts/embro-experiments.mjs` genera 23 archivos en `exports/embro-experiments`: una referencia, 18 cambios individuales de cabecera y cuatro de coordenadas/código. Se verificó que cada variante cambia exactamente un valor numérico. Los originales de `C:\stitchdata` no se modificaron. La tabla de ese directorio distingue cálculos de PlugiT y observaciones pendientes en Embro. H18 tiene un conteo deliberadamente discordante y no representa una exportación válida. Estos experimentos preparan la comparación, pero no demuestran por sí solos el efecto de cada campo en Embro.

### Inspección de la aplicación abierta (7 de octubre de 2026)

La ventana `QUILTING - embro` fue consultada mediante accesibilidad y teclado. `Help(H) > embro Info. (A)...` muestra **embro Version 2.1.0**, Copyright (C) 2006-2009. El menú `File(F)` expone únicamente `Quit (X)`, sin opción de abrir un ST de prueba. Las capturas de ventana fallaron con `FrameArrived timed out: timed out waiting on channel`; el panel de figuras y métricas no expone sus valores mediante accesibilidad. Por ello no se atribuyen a Embro resultados calculados exclusivamente en PlugiT.

Para el ejemplo nuevo `16 15 15 / 32 25 35 / 33 35 20`, PlugiT calcula límites máximos X=35.443407 y Y=35.086264: son extremos del arco circular, que puede superar sus puntos de control. Con StitchLen=2.5 calcula ancho 35.4 mm, largo 35.1 mm y 29 puntadas. Estos son valores esperados para comparar, **no una lectura verificada del panel de Embro**.

Importación/exportación sin cambios: 121 de 121 archivos idénticos al original. Pruebas: 16 aprobadas, incluyendo cabeceras de nueve/diez líneas, parámetros conservados tras editar, conteos que podrían confundirse con códigos, archivos antiguos e inválidos.

`exports/002-plugit.ST` es una salida completa idéntica a `002.ST`. La lectura por interfaz de un archivo modificado en Embro y el significado de los parámetros no identificados todavía requieren comprobación. No se declara compatibilidad universal con otras versiones de Embro ni con todos los ajustes de máquina.
