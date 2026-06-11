/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  FileText,
  UploadCloud,
  Check,
  Copy,
  Download,
  ArrowRight,
  RefreshCw,
  AlertCircle,
  Eye,
  Code,
  Sparkles,
  Settings2,
  FileDown,
  X,
  Languages
} from "lucide-react";
import ReactMarkdown from "react-markdown";

export default function App() {
  // File and input states
  const [file, setFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [fileSize, setFileSize] = useState<string>("");
  const [fileBase64, setFileBase64] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);

  // Conversion and options states
  const [isConverting, setIsConverting] = useState<boolean>(false);
  const [markdownResult, setMarkdownResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // Engine Provider State
  const [provider, setProvider] = useState<"openrouter" | "gemini">(() => {
    const saved = localStorage.getItem("conversor_provider");
    return (saved === "gemini" ? "gemini" : "openrouter") as "openrouter" | "gemini";
  });

  const handleProviderChange = (newProvider: "openrouter" | "gemini") => {
    setProvider(newProvider);
    localStorage.setItem("conversor_provider", newProvider);
  };

  // Custom advanced conversion options
  const [showOptions, setShowOptions] = useState<boolean>(false);
  const [customInstructions, setCustomInstructions] = useState<string>("");
  const [preserveTables, setPreserveTables] = useState<boolean>(true);
  const [mathLatex, setMathLatex] = useState<boolean>(false);
  const [translateEnglish, setTranslateEnglish] = useState<boolean>(false);

  // Clipboard & UI State
  const [activeTab, setActiveTab] = useState<"preview" | "raw">("preview");
  const [copied, setCopied] = useState<boolean>(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Manage file drop & changes
  const handleFileChange = (selectedFile: File) => {
    if (selectedFile.type !== "application/pdf" && !selectedFile.name.endsWith(".pdf")) {
      setError("Por favor, selecciona un archivo PDF válido.");
      return;
    }

    // Validate file size client-side (max 10 MB)
    const maxSizeBytes = 10 * 1024 * 1024;
    if (selectedFile.size > maxSizeBytes) {
      setError(`El archivo supera el límite de 10 MB (tamaño: ${(selectedFile.size / 1024 / 1024).toFixed(1)} MB). Por favor, selecciona un archivo más pequeño.`);
      return;
    }
    
    setError(null);
    setMarkdownResult(null);
    setFile(selectedFile);
    setFileName(selectedFile.name);
    
    const sizeInMb = (selectedFile.size / (1024 * 1024)).toFixed(2);
    setFileSize(`${sizeInMb} MB`);

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64Data = result.split(",")[1];
      setFileBase64(base64Data);
    };
    reader.onerror = () => {
      setError("Error al leer el archivo. Inténtalo de nuevo.");
    };
    reader.readAsDataURL(selectedFile);
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = () => {
    setIsDragging(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileChange(e.dataTransfer.files[0]);
    }
  };

  const triggerFileSelect = () => {
    fileInputRef.current?.click();
  };

  // Convert PDF to markdown using our server-side API proxy
  const handleConvert = async () => {
    if (!fileBase64) return;
    setIsConverting(true);
    setError(null);
    setMarkdownResult(null);

    // Build specific user prompt instructions sequence
    let instructions = customInstructions;
    if (preserveTables) {
      instructions += "\n- Formatea rigurosamente cualquier tabla detectada utilizando sintaxis markdown estructurada estándar.";
    }
    if (mathLatex) {
      instructions += "\n- Detecta y formatea con cuidado expresiones y fórmulas matemáticas utilizando LaTeX estándar (ej. $$ para ecuaciones en bloque, $ para texto en línea).";
    }
    if (translateEnglish) {
      instructions += "\n- Traduce todo el contenido extraído al idioma inglés manteniendo el formato original.";
    }

    try {
      const response = await fetch("/api/convert-pdf", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          pdfBase64: fileBase64,
          fileName,
          provider,
          options: {
            instructions: instructions.trim(),
          },
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || data.details || "Error desconocido al procesar el PDF.");
      }

      setMarkdownResult(data.markdown);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "No se pudo realizar la conversión. Verifica tu conexión.");
    } finally {
      setIsConverting(false);
    }
  };

  // Actions for the generated output
  const downloadMarkdown = () => {
    if (!markdownResult) return;
    const element = document.createElement("a");
    const fileBlob = new Blob([markdownResult], { type: "text/plain;charset=utf-8" });
    element.href = URL.createObjectURL(fileBlob);
    
    // Replace .pdf extension with .md
    let outputName = fileName.replace(/\.[^/.]+$/, "") + ".md";
    if (outputName === fileName) outputName += ".md";
    
    element.download = outputName;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  const copyToClipboard = () => {
    if (!markdownResult) return;
    navigator.clipboard.writeText(markdownResult);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const resetAll = () => {
    setFile(null);
    setFileName("");
    setFileSize("");
    setFileBase64(null);
    setMarkdownResult(null);
    setError(null);
    setCustomInstructions("");
  };

  return (
    <div className="min-h-screen bg-[#FBFBFB] text-[#1E1E1E] flex flex-col antialiased">
      {/* Upper Elegant Decor Line */}
      <div className="h-1 bg-gradient-to-r from-neutral-800 via-neutral-400 to-neutral-200" />
      
      {/* Header Container */}
      <header className="border-b border-neutral-100 bg-white">
        <div className="max-w-7xl mx-auto px-6 py-5 flex items-center justify-between">
          <div className="flex items-center space-x-3" id="brand-header">
            <div className="p-2.5 bg-neutral-900 text-white rounded-lg flex items-center justify-center">
              <FileDown className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-sans font-bold text-lg tracking-tight text-neutral-950">
                PDF a Markdown
              </h1>
              <p className="text-xs text-neutral-400 tracking-wide font-mono">
                CONVERTER ENGINE V3.5
              </p>
            </div>
          </div>
          
          <div className="flex items-center space-x-2 text-xs text-neutral-500 font-mono">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>
              {provider === "gemini" ? "Gemini 2.0 Flash (AI Studio)" : "OpenRouter (Gemini/Gemma)"}
            </span>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-grow max-w-7xl w-full mx-auto px-6 py-10 flex flex-col justify-start">
        
        {/* Intro description */}
        <div className="max-w-3xl mb-10 text-left">
          <h2 className="text-3xl font-bold font-sans text-neutral-900 tracking-tight sm:text-4xl mb-3">
            Formatos listos para tu editor de Markdown.
          </h2>
          <p className="text-base text-neutral-500 leading-relaxed">
            Sube un manual, artículo científico o informe empresarial en formato PDF. Nuestra inteligencia artificial procesará el archivo preservando títulos, listas, citas, código y estructuras de datos complejas como tablas sin desordenar el texto.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* Left Column: Actions / Upload */}
          <div className="lg:col-span-5 flex flex-col space-y-6">
            
            {/* Engine Selector Card */}
            <div className="bg-white rounded-xl border border-neutral-200 p-5 shadow-xs">
              <label className="text-xs font-semibold text-neutral-500 uppercase tracking-wider block mb-3 font-mono">
                Motor de Inteligencia Artificial
              </label>
              <div className="grid grid-cols-2 gap-2 bg-neutral-50 p-1 rounded-lg border border-neutral-100">
                <button
                  type="button"
                  onClick={() => handleProviderChange("openrouter")}
                  className={`py-2 px-3 rounded-md text-xs font-semibold tracking-tight transition-all cursor-pointer ${
                    provider === "openrouter"
                      ? "bg-white text-neutral-950 shadow-xs border border-neutral-200/50"
                      : "text-neutral-500 hover:text-neutral-800 border border-transparent"
                  }`}
                >
                  OpenRouter
                </button>
                <button
                  type="button"
                  onClick={() => handleProviderChange("gemini")}
                  className={`py-2 px-3 rounded-md text-xs font-semibold tracking-tight transition-all cursor-pointer ${
                    provider === "gemini"
                      ? "bg-white text-neutral-950 shadow-xs border border-neutral-200/50"
                      : "text-neutral-500 hover:text-neutral-800 border border-transparent"
                  }`}
                >
                  Google AI Studio
                </button>
              </div>
              <p className="text-[11px] text-neutral-400 mt-2.5 leading-relaxed font-sans">
                {provider === "openrouter"
                  ? "Utiliza una cadena de fallbacks (Gemini 2.0 → Gemma 31B → Gemma 26B). Requiere mínimo $1 USD de saldo en tu cuenta de OpenRouter."
                  : "Conexión directa y 100% gratuita utilizando la API Key oficial de Google AI Studio (modelo Gemini 2.0 Flash). Sin mínimos de saldo."}
              </p>
            </div>

            {/* Upload Zone */}
            <motion.div
              layout
              className={`bg-white rounded-xl border-2 border-dashed ${
                isDragging ? "border-neutral-800 bg-neutral-50" : "border-neutral-200 hover:border-neutral-400"
              } p-8 flex flex-col items-center justify-center text-center transition-all cursor-pointer relative`}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              onClick={file ? undefined : triggerFileSelect}
              id="pdf-drop-zone"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,application/pdf"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleFileChange(e.target.files[0]);
                  }
                }}
              />

              {!file ? (
                <div className="flex flex-col items-center py-6">
                  <div className="w-14 h-14 bg-neutral-50 text-neutral-600 rounded-full flex items-center justify-center mb-4 border border-neutral-100">
                    <UploadCloud className="w-6 h-6 animate-pulse" />
                  </div>
                  <h3 className="font-semibold text-neutral-800 mb-1 font-sans">
                    Arrastra tu archivo PDF aquí
                  </h3>
                  <p className="text-sm text-neutral-400 mb-4 px-4 font-sans">
                    o haz clic para explorar en el explorador de archivos
                  </p>
                  <span className="text-xs bg-neutral-100 text-neutral-600 font-mono px-2.5 py-1 rounded-md">
                    Límite máximo de 10 MB
                  </span>
                </div>
              ) : (
                <div className="w-full py-2">
                  <div className="flex items-start justify-between bg-neutral-50 border border-neutral-100 rounded-lg p-4">
                    <div className="flex items-center space-x-3 text-left min-w-0">
                      <div className="p-2.5 bg-neutral-900 text-white rounded-md shrink-0">
                        <FileText className="w-6 h-6" />
                      </div>
                      <div className="truncate">
                        <p className="font-medium text-sm text-neutral-900 truncate" title={fileName}>
                          {fileName}
                        </p>
                        <p className="text-xs text-neutral-400 mt-0.5 font-mono">
                          {fileSize}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        resetAll();
                      }}
                      className="text-neutral-400 hover:text-neutral-700 p-1 rounded-full hover:bg-neutral-100 transition-colors"
                      title="Remover documento"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </motion.div>

            {/* Custom Extra Options */}
            {file && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-xl border border-neutral-200 p-5 shadow-sm"
              >
                <button
                  type="button"
                  onClick={() => setShowOptions(!showOptions)}
                  className="flex items-center justify-between w-full text-left font-sans font-medium text-sm text-neutral-800"
                >
                  <span className="flex items-center space-x-2">
                    <Settings2 className="w-4 h-4 text-neutral-500" />
                    <span>Configuración de Extracción</span>
                  </span>
                  <span className="text-xs text-neutral-400">
                    {showOptions ? "Ocultar" : "Mostrar"}
                  </span>
                </button>

                <AnimatePresence>
                  {showOptions && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden mt-4 pt-4 border-t border-neutral-100 space-y-4"
                    >
                      {/* Checkboxes for presets */}
                      <div className="space-y-3">
                        <label className="flex items-start space-x-3 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={preserveTables}
                            onChange={(e) => setPreserveTables(e.target.checked)}
                            className="w-4 h-4 mt-0.5 rounded border-neutral-300 text-neutral-900 focus:ring-neutral-800"
                          />
                          <div>
                            <span className="text-xs font-medium text-neutral-700 block">Esquema de Tablas Estricto</span>
                            <span className="text-[11px] text-neutral-400 block leading-tight">Previene la ruptura estructural de grillas de datos dentro del PDF.</span>
                          </div>
                        </label>

                        <label className="flex items-start space-x-3 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={mathLatex}
                            onChange={(e) => setMathLatex(e.target.checked)}
                            className="w-4 h-4 mt-0.5 rounded border-neutral-300 text-neutral-900 focus:ring-neutral-800"
                          />
                          <div>
                            <span className="text-xs font-medium text-neutral-700 block">Soporte LaTeX Matemático</span>
                            <span className="text-[11px] text-neutral-400 block leading-tight">Encierra símbolos matemáticos complejas entre bloques $$ formateados.</span>
                          </div>
                        </label>

                        <label className="flex items-start space-x-3 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={translateEnglish}
                            onChange={(e) => setTranslateEnglish(e.target.checked)}
                            className="w-4 h-4 mt-0.5 rounded border-neutral-300 text-neutral-900 focus:ring-neutral-800"
                          />
                          <div>
                            <span className="text-xs font-medium text-neutral-700 block flex items-center space-x-1">
                              <Languages className="w-3 h-3 text-neutral-400" />
                              <span>Traducir al Inglés</span>
                            </span>
                            <span className="text-[11px] text-neutral-400 block leading-tight">Traduce automáticamente todo el texto extraído del PDF final.</span>
                          </div>
                        </label>
                      </div>

                      {/* Prompt area */}
                      <div>
                        <label className="text-xs font-medium text-neutral-700 block mb-1.5 font-sans">
                          Instrucciones personalizadas para la IA (opcional):
                        </label>
                        <textarea
                          value={customInstructions}
                          onChange={(e) => setCustomInstructions(e.target.value)}
                          placeholder="Ej: 'Solo extrae el capítulo 4', 'Elimina las descripciones de las imágenes', 'No incluyas la bibliografía'."
                          rows={3}
                          className="w-full text-xs p-2.5 border border-neutral-200 rounded-lg focus:outline-none focus:border-neutral-500 bg-neutral-50 resize-y font-sans"
                        />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )}

            {/* Main triggers */}
            {file && !markdownResult && (
              <motion.button
                initial={{ scale: 0.98, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                onClick={handleConvert}
                disabled={isConverting}
                className="w-full py-4 bg-neutral-900 text-white rounded-xl font-medium text-sm flex items-center justify-center space-x-2.5 hover:bg-neutral-800 active:scale-98 transition-all disabled:bg-neutral-300"
              >
                {isConverting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Espere un momento, procesando PDF...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 text-amber-300" />
                    <span>Convertir a Markdown (.md)</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </motion.button>
            )}

            {/* Error messaging bar */}
            {error && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-rose-50 border border-rose-100 rounded-xl p-4 text-rose-800 flex items-start space-x-3 text-sm"
              >
                <AlertCircle className="w-5 h-5 mt-0.5 shrink-0 text-rose-500" />
                <div className="flex-grow">
                  <p className="font-semibold text-rose-950">Se produjo un error</p>
                  <p className="text-xs mt-1 text-rose-700 leading-relaxed">{error}</p>
                </div>
              </motion.div>
            )}
          </div>

          {/* Right Column: Previews and Resulting Output */}
          <div className="lg:col-span-7">
            <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden flex flex-col min-h-[500px] h-full" id="output-pane">
              
              {/* Output Top Control Header */}
              <div className="border-b border-neutral-100 bg-neutral-50 px-5 py-3 flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <span className="w-3 h-3 rounded-full bg-neutral-200" />
                  <span className="w-3 h-3 rounded-full bg-neutral-200" />
                  <span className="w-3 h-3 rounded-full bg-neutral-[#ECECEC]" />
                </div>
                
                {/* Visual state switch triggers */}
                {markdownResult ? (
                  <div className="flex items-center space-x-2 bg-neutral-100 p-1 rounded-lg">
                    <button
                      onClick={() => setActiveTab("preview")}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center space-x-1.5 transition-all ${
                        activeTab === "preview" ? "bg-white shadow-xs text-neutral-900" : "text-neutral-500 hover:text-neutral-800"
                      }`}
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Vista Previa</span>
                    </button>
                    <button
                      onClick={() => setActiveTab("raw")}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center space-x-1.5 transition-all ${
                        activeTab === "raw" ? "bg-white shadow-xs text-neutral-900" : "text-neutral-500 hover:text-neutral-800"
                      }`}
                    >
                      <Code className="w-3.5 h-3.5" />
                      <span>Código Fuente (.md)</span>
                    </button>
                  </div>
                ) : (
                  <span className="text-xs font-mono text-neutral-400 bg-neutral-100 px-2.5 py-1 rounded">
                    Esperando conversión
                  </span>
                )}
              </div>

              {/* Central Panel Body Content */}
              <div className="flex-grow p-6 flex flex-col relative max-h-[600px] overflow-y-auto">
                <AnimatePresence mode="wait">
                  {isConverting ? (
                    <motion.div
                      key="loading"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="absolute inset-0 bg-white flex flex-col items-center justify-center p-8 text-center"
                    >
                      <div className="p-4 bg-neutral-50 rounded-full border border-neutral-100 mb-4 animate-spin text-neutral-900">
                        <RefreshCw className="w-7 h-7" />
                      </div>
                      <h3 className="font-semibold text-neutral-800 font-sans text-md mb-2">
                        Extrayendo y estructurando...
                      </h3>
                      <div className="max-w-xs space-y-1.5">
                        <p className="text-xs text-neutral-400 font-sans tracking-wide">
                          {provider === "gemini" ? "Gemini 2.0 Flash" : "El motor de OpenRouter"} está procesando el archivo PDF para preservar el formato sin perder detalles.
                        </p>
                        <div className="w-36 h-1.5 bg-neutral-100 rounded-full mx-auto overflow-hidden mt-4">
                          <div className="h-full bg-neutral-900 rounded-full animate-[loading_1.5s_infinite_ease-in-out]" style={{ width: "60%" }} />
                        </div>
                      </div>
                    </motion.div>
                  ) : markdownResult ? (
                    <motion.div
                      key="result"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="w-full text-left"
                    >
                      {activeTab === "preview" ? (
                        <div className="markdown-body prose prose-neutral max-w-none">
                          <ReactMarkdown>{markdownResult}</ReactMarkdown>
                        </div>
                      ) : (
                        <pre className="p-4 bg-neutral-900 text-neutral-100 rounded-lg font-mono text-xs overflow-x-auto whitespace-pre-wrap leading-relaxed select-all">
                          {markdownResult}
                        </pre>
                      )}
                    </motion.div>
                  ) : (
                    <motion.div
                      key="empty"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="flex-grow flex flex-col items-center justify-center text-center p-8"
                    >
                      <div className="w-12 h-12 rounded-full border border-neutral-100 flex items-center justify-center text-neutral-300 mb-3 bg-neutral-50">
                        <FileText className="w-5 h-5" />
                      </div>
                      <h3 className="font-medium text-neutral-700 text-sm mb-1 font-sans">
                        Sin salida disponible
                      </h3>
                      <p className="text-xs text-neutral-400 max-w-xs leading-relaxed font-sans">
                        Sube un documento en formato PDF a la izquierda y presiona el botón para dar inicio a la conversión instantánea.
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Bottom control panel bar when result is ready */}
              {markdownResult && !isConverting && (
                <div className="border-t border-neutral-100 bg-neutral-50 p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
                  <div className="flex items-center space-x-2 text-xs text-neutral-500 font-semibold truncate max-w-xs">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                    <span className="truncate">Conversión completada con éxito</span>
                  </div>

                  <div className="flex items-center space-x-2 w-full sm:w-auto shrink-0 justify-end">
                    <button
                      onClick={copyToClipboard}
                      className="flex-1 sm:flex-initial px-4 py-2 bg-white border border-neutral-200 text-[#1E1E1E] text-xs font-semibold rounded-lg flex items-center justify-center space-x-2 hover:bg-neutral-50 hover:border-neutral-300 transition-all active:scale-95 shadow-xs"
                      title="Copiar texto markdown al portapapeles"
                    >
                      {copied ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-600 animate-bounce" />
                          <span className="text-emerald-700">¡Copiado!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5 text-neutral-500" />
                          <span>Copiar (.md)</span>
                        </>
                      )}
                    </button>
                    
                    <button
                      onClick={downloadMarkdown}
                      className="flex-1 sm:flex-initial px-4 py-2 bg-neutral-905 text-neutral-900 border border-neutral-300 text-xs font-semibold rounded-lg flex items-center justify-center space-x-2 hover:bg-neutral-100 transition-all active:scale-95 shadow-xs"
                      title="Descargar archivo .md"
                    >
                      <Download className="w-3.5 h-3.5 text-neutral-600" />
                      <span>Descargar</span>
                    </button>

                    <button
                      onClick={resetAll}
                      className="p-2 bg-white border border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50 text-neutral-500 hover:text-neutral-700 rounded-lg transition-all active:scale-95 shadow-xs"
                      title="Convertir otro archivo"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

        </div>

        {/* Feature section showcase */}
        <section className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-6 pt-10 border-t border-neutral-100 text-left">
          <div className="p-5 rounded-xl hover:bg-white hover:shadow-xs transition-all duration-300">
            <div className="w-8 h-8 rounded-lg bg-neutral-100 text-neutral-800 flex items-center justify-center mb-3">
              <Sparkles className="w-4 h-4" />
            </div>
            <h4 className="font-semibold text-neutral-800 font-sans text-sm mb-1.5">Inteligencia Multimodal</h4>
            <p className="text-xs text-neutral-400 leading-relaxed">
              Capaz de comprender imágenes complejos, figuras, tablas y pies de página integrados nativamente dentro del PDF original.
            </p>
          </div>
          <div className="p-5 rounded-xl hover:bg-white hover:shadow-xs transition-all duration-300">
            <div className="w-8 h-8 rounded-lg bg-neutral-100 text-neutral-800 flex items-center justify-center mb-3">
              <Code className="w-4 h-4" />
            </div>
            <h4 className="font-semibold text-neutral-800 font-sans text-sm mb-1.5">Formato LaTeX y Tablas</h4>
            <p className="text-xs text-neutral-400 leading-relaxed">
              Conserva expresiones científicas avanzadas y traduce tablas estructuradas a código estricto para una perfecta importación.
            </p>
          </div>
          <div className="p-5 rounded-xl hover:bg-white hover:shadow-xs transition-all duration-300">
            <div className="w-8 h-8 rounded-lg bg-neutral-100 text-neutral-800 flex items-center justify-center mb-3">
              <FileText className="w-4 h-4" />
            </div>
            <h4 className="font-semibold text-neutral-800 font-sans text-sm mb-1.5">Sin Límite de Estructurado</h4>
            <p className="text-xs text-neutral-400 leading-relaxed">
               Diseñado para procesar con alta velocidad gracias al motor Gemini 2.0 Flash proporcionando respuestas robustas en segundos.
            </p>
          </div>
        </section>

      </main>

      {/* Footer page element */}
      <footer className="border-t border-neutral-100 bg-white py-6 mt-12">
        <div className="max-w-7xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between text-xs text-neutral-400 font-mono">
          <div>
            &copy; 2026 Conversor PDF de Alta Precisión. Todos los derechos reservados.
          </div>
          <div className="flex items-center space-x-4 mt-2 sm:mt-0">
            <span className="hover:text-neutral-600 cursor-pointer">Seguridad de Datos Local</span>
            <span>&middot;</span>
            <span className="hover:text-neutral-600 cursor-pointer">Aceleración por Hardware</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
