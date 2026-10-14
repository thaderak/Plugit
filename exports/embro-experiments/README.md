# Experimentos ST

Archivos independientes; no sustituyen los originales. Valores esperados calculados en PlugiT con StitchLen=2.5 mm. La columna Embro requiere observar el programa; no se rellena con predicciones.

| Archivo | Cambio aislado | Ancho esperado mm | Largo esperado mm | Puntadas esperadas | Embro |
| --- | --- | --- | --- | --- | --- |
| 00_BASE.ST | Referencia: figura del usuario | 35.4 | 35.1 | 29 | Pendiente |
| H01.ST | Campo 1: 1 → 2 | 35.4 | 35.1 | 29 | Pendiente |
| H02.ST | Campo 2: 17 → 24 | 35.4 | 35.1 | 29 | Pendiente |
| H03.ST | Campo 3: 0 → 70 | 35.4 | 35.1 | 29 | Pendiente |
| H04.ST | Campo 4: 0 → -10 | 35.4 | 35.1 | 29 | Pendiente |
| H05.ST | Campo 5: 35.443407 → 60 | 35.4 | 35.1 | 29 | Pendiente |
| H06.ST | Campo 6: 0 → -10 | 35.4 | 35.1 | 29 | Pendiente |
| H07.ST | Campo 7: 35.086264 → 60 | 35.4 | 35.1 | 29 | Pendiente |
| H08.ST | Campo 8: 0 → 10 | 35.4 | 35.1 | 29 | Pendiente |
| H09.ST | Campo 9: 0 → 10 | 35.4 | 35.1 | 29 | Pendiente |
| H10.ST | Campo 10: 1 → 2 | 35.4 | 35.1 | 29 | Pendiente |
| H11.ST | Campo 11: 1 → 2 | 35.4 | 35.1 | 29 | Pendiente |
| H12.ST | Campo 12: 0 → 1 | 35.4 | 35.1 | 29 | Pendiente |
| H13.ST | Campo 13: 0 → 150 | 35.4 | 35.1 | 29 | Pendiente |
| H14.ST | Campo 14: 0 → 1 | 35.4 | 35.1 | 29 | Pendiente |
| H15.ST | Campo 15: 0 → 1 | 35.4 | 35.1 | 29 | Pendiente |
| H16.ST | Campo 16: 0 → 1 | 35.4 | 35.1 | 29 | Pendiente |
| H17.ST | Campo 17: 0 → 1 | 35.4 | 35.1 | 29 | Pendiente |
| H18.ST | Campo 18: 3 → 2 (conteo deliberadamente discordante; prueba del lector, no exportación válida) | 35.4 | 35.1 | 29 | Pendiente |
| P_CONTROL_X.ST | Registro 2, x: 25 → 15; cabecera conservada para aislar el cambio | 36.0 | 37.9 | 32 | Pendiente |
| P_CONTROL_Y.ST | Registro 2, y: 35 → 25; cabecera conservada para aislar el cambio | 35.0 | 25.0 | 20 | Pendiente |
| P_FINAL_X.ST | Registro 3, x: 35 → 45; cabecera conservada para aislar el cambio | 45.0 | 35.7 | 31 | Pendiente |
| P_CODE32_TO16.ST | Registro 2, code: 32 → 16; cabecera conservada para aislar el cambio | 35.0 | 35.0 | 26 | Pendiente |

## Resultado del lector original aislado

Ejecutadas las instrucciones x86 del bloque lector de Embro 2.1.0, con llamadas CRT sustituidas: las 18 variantes de cabecera cargan los mismos registros; las cuatro de códigos/coordenadas cambian los registros. Incluso H18 (conteo 2) carga 3. Evidencia: `reader-results.json`. La columna Embro de arriba sigue pendiente porque corresponde a observar la aplicación completa, no a esta emulación.
