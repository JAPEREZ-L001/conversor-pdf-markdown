# Changelog - Conversor de PDF a Markdown

Todas las modificaciones, mejoras y correcciones realizadas recientemente en el proyecto se detallan a continuación.

---

## [1.2.0] - 2026-06-12

### Nuevas Características (Features)
* **Motor de Extracción Local (OCR sin IA) 100% Offline:**
  * Se implementó un tercer proveedor de conversión que procesa PDFs de forma totalmente local en la máquina del usuario, garantizando total privacidad y coste cero sin requerir claves API ni llamadas a servidores externos.
  * **Extracción digital inteligente**: Utiliza `pdfjs-dist` para leer texto digital directo y conserva la estructura del documento (títulos, viñetas, negritas) a través de un procesador de heurísticas avanzadas.
  * **Fallback OCR automático**: Integración de `@napi-rs/canvas` y `Tesseract.js` para renderizar y digitalizar mediante OCR en local (vía WebAssembly) aquellas páginas que sean imágenes o escaneadas.
* **Algoritmo de Reconstrucción de Bloques Semánticos:**
  * Se implementó un motor de agrupación que asocia líneas de texto contiguas que pertenecen a un mismo párrafo o elemento de lista, evitando que el texto se rompa o apiñe.
  * **Detección de tipografía dominante**: Realiza un conteo estadístico de caracteres para asociar la línea a su estilo tipográfico real, resolviendo problemas de separación de listas por el formato del bullet.
  * **Cambios de estilo**: Genera saltos de párrafo dobles (`\n\n`) de manera limpia únicamente cuando se detecta un cambio semántico en el nombre o estilo de la fuente (como de título en negrita a descripción normal).

### Correcciones de Errores (Bug Fixes)
* **Resolución del error de red `Failed to fetch` en OCR:**
  * Se solucionó la excepción `TypeError: Image or Canvas expected` generada por incompatibilidades de clases nativas de canvas en entornos de Node.js al renderizar páginas complejas o con imágenes incrustadas.
  * **Solución**: Se sustituyó la librería tradicional `canvas` por `@napi-rs/canvas` para la renderización nativa del PDF en el backend, unificando la implementación del motor gráfico del servidor con la esperada por `pdfjs-dist v6`.
  * **Evitado de blockquotes accidentales**: Se incrementó el umbral y flexibilizó el reconocimiento de sangrías para evitar que la segunda línea de los bullets de lista fuera marcada con el símbolo `>`.

---

## [1.1.0] - 2026-06-11

### Correcciones de Errores (Bug Fixes)
* **Instrucciones personalizadas de la IA:** 
  * Se corrigió el problema por el cual las directivas personalizadas ingresadas por el usuario y las configuraciones avanzadas (preservación de tablas, traducción al inglés, fórmulas en LaTeX) no eran obedecidas por la IA.
  * **Solución:** Las instrucciones de extracción y formato ahora se incrustan de forma explícita directamente en el mensaje de usuario (`user`) de la petición junto al archivo base64 (en [lib/openrouter-client.ts](file:///c:/Users/japer/Desktop/conversor-de-pdf-a-markdown/lib/openrouter-client.ts) y [lib/gemini-client.ts](file:///c:/Users/japer/Desktop/conversor-de-pdf-a-markdown/lib/gemini-client.ts)). Esto garantiza que los modelos de Gemini y OpenRouter las procesen con alta prioridad.
* **Depreciación de modelos en OpenRouter (Fallo 404 y 429 con PDFs grandes):**
  * Se resolvió el fallo en OpenRouter al procesar PDFs grandes, ocasionado por la depreciación del modelo `google/gemini-2.0-flash-exp:free` (que daba HTTP 404) y el desbordamiento de límites de tasa (HTTP 429) de los modelos Gemma (los cuales no soportan PDF nativo y transformaban el documento en múltiples imágenes pesadas).
  * **Solución:** Se actualizó la cadena de fallbacks en [lib/openrouter-client.ts](file:///c:/Users/japer/Desktop/conversor-de-pdf-a-markdown/lib/openrouter-client.ts) para apuntar a los modelos activos y estables de producción **`google/gemini-2.5-flash`** y **`google/gemini-2.5-flash-lite`**. Estos procesan el PDF de forma nativa y eficiente.

### Nuevas Características (Features)
* **Configuración de API Keys Propias (BYOK - Bring Your Own Key):**
  * Se implementó la posibilidad de que los usuarios utilicen su propia **Google AI Studio API Key** de manera local.
  * La API Key del cliente se almacena de forma persistente y segura en el navegador (`localStorage`) y se transmite en el cuerpo de la petición de conversión como `customApiKey`.
  * El backend en [server.ts](file:///c:/Users/japer/Desktop/conversor-de-pdf-a-markdown/server.ts) y [api/convert-pdf.ts](file:///c:/Users/japer/Desktop/conversor-de-pdf-a-markdown/api/convert-pdf.ts) fue adaptado para priorizar la clave personalizada provista por el cliente antes de recurrir a la clave global de las variables de entorno del servidor.
* **Próximamente en OpenRouter:**
  * Se añadió visualmente el campo para configurar la clave de API personalizada de OpenRouter, presentándolo de forma atenuada y deshabilitada con la etiqueta **"Próximamente"** para futuras actualizaciones de BYOK en dicho proveedor.

### Diseño y UX (User Experience)
* **Menú Desplegable de Configuración BYOK:**
  * Para evitar ruido en la pantalla principal y optimizar la jerarquía visual, la sección "Mis API Keys (BYOK)" se transformó en un menú desplegable/acordeón colapsable.
  * El menú permanece cerrado de manera predeterminada y utiliza animaciones fluidas mediante `framer-motion` (`motion.div` y `AnimatePresence`) para mostrarse u ocultarse al hacer clic en **"Configurar"**.
