# Conversor de PDF a Markdown 📄➡️✍️

Aplicación web premium para convertir documentos PDF a formato Markdown (.md) estructurado. Diseñada con un frontend interactivo moderno y soporte para múltiples motores de conversión (tanto basados en Inteligencia Artificial en la nube como motores 100% locales offline).

---

## 🛠️ Stack Tecnológico

*   **Frontend**: React 19, Vite 6, Tailwind CSS 4, Framer Motion (para animaciones fluidas) y Lucide React (íconos).
*   **Backend**: Node.js, Express 4 y `@vercel/node` para soporte nativo serverless en Vercel.
*   **Procesamiento Local**: `pdfjs-dist` (para análisis de texto digital y extracción de tipografías), `@napi-rs/canvas` (Rust/Skia para renderizado de páginas) y `Tesseract.js` (OCR en local).

---

## 🚀 Características y Proveedores

La aplicación incluye tres modos de conversión seleccionables:

1.  **OpenRouter (Por Defecto)**: Utiliza modelos de IA en la nube con un pipeline de fallback automático (reintenta con modelos alternativos si hay rate limits o fallas).
2.  **Google AI Studio (BYOK)**: Permite ingresar tu propia clave API de Gemini en la interfaz. La clave se almacena de forma segura en el navegador (`localStorage`).
3.  **Extracción Local (Gratuito e Ilimitado)**:
    *   **100% Privado y Offline**: Procesa tus PDFs en tu propia máquina. Sin API keys y sin llamadas externas a la nube.
    *   **Extracción Digital con Heurísticas**: Reconstruye la estructura del PDF (títulos H1-H4, listas y negritas) agrupando líneas en bloques semánticos y analizando fuentes tipográficas.
    *   **Fallback OCR**: Renderiza y ejecuta OCR localmente mediante WebAssembly con `Tesseract.js` si la página es escaneada o es una imagen.

---

## 💻 Ejecución en Local

### Requisitos Previos
*   **Node.js** (versión 18 o superior).

### Paso 1: Clonación e instalación de dependencias
Instala los paquetes necesarios (incluyendo el motor de canvas nativo `@napi-rs/canvas`):
```bash
npm install
```

### Paso 2: Configurar las variables de entorno
Crea un archivo `.env` en la raíz del proyecto (puedes tomar como base `.env.example`) y configura tus claves API:
```env
PORT=3000
OPENROUTER_API_KEY=tu_api_key_aqui
GEMINI_API_KEY=tu_api_key_aqui
```

### Paso 3: Arrancar el servidor de desarrollo
Inicia la aplicación en modo desarrollo:
```bash
npm run dev
```
Abre tu navegador en [http://localhost:3000](http://localhost:3000).

---

## 📂 Estructura de Documentación

Para conocer más detalles sobre el funcionamiento interno y las reglas del repositorio, consulta la carpeta `docs/`:

*   [docs/architecture.md](docs/architecture.md): Detalles del flujo de datos, API endpoints, estructura del reconstructor de markdown y pipeline local de OCR.
*   [docs/git-workflow.md](docs/git-workflow.md): Flujo de trabajo de Git (`feature/*` -> `develop` -> `main`), PRs y políticas de protección de ramas.
*   [docs/work/12-06-26-Init/spec_feature_ocr_local.md](docs/work/12-06-26-Init/spec_feature_ocr_local.md): Especificación original de requerimientos para el motor local de OCR.

---

## 📄 Licencia

Este proyecto está bajo la Licencia MIT. Consulta el archivo [LICENSE](LICENSE) para más detalles.
