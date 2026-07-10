'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, CameraOff, Flashlight, FlashlightOff, Loader2 } from 'lucide-react';

const SCAN_TTL_MS = 3000;
const DEBOUNCE_MS = 1200;

// Formatos 1D (+ QR por si acaso). El barcode del rollo es Code128/Code39
// alfanumérico (ej. "1B10697899"); los demás se incluyen por robustez.
const FORMATOS = [
  'code_128',
  'code_39',
  'ean_13',
  'ean_8',
  'upc_a',
  'upc_e',
  'itf',
  'codabar',
  'qr_code',
];

// Instancia un BarcodeDetector: nativo (Android/Chrome) si soporta FORMATOS,
// o el ponyfill ZXing-WASM (iPhone/Safari). Devuelve un objeto con .detect() o null.
async function crearDetector({ warm = false } = {}) {
  // 1) Detector nativo.
  if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
    try {
      const soportados = window.BarcodeDetector.getSupportedFormats
        ? await window.BarcodeDetector.getSupportedFormats()
        : null;
      const formats = soportados
        ? FORMATOS.filter((f) => soportados.includes(f))
        : FORMATOS;
      if (formats.length) {
        return new window.BarcodeDetector({ formats });
      }
    } catch {
      /* siguiente método */
    }
  }
  // 2) Ponyfill ZXing (WASM).
  try {
    const mod = await import('barcode-detector/ponyfill');
    const det = new mod.BarcodeDetector({ formats: FORMATOS });
    if (warm) {
      // Pre-carga el WASM con un canvas 8×8 para que el primer escaneo ya sea rápido.
      try {
        const c = document.createElement('canvas');
        c.width = 8;
        c.height = 8;
        await det.detect(c);
      } catch {
        /* ignore */
      }
    }
    return det;
  } catch {
    return null;
  }
}

// Decodifica un código 1D/QR desde una FOTO fija (método PRINCIPAL, más robusto
// para 1D tipo Code128 que el escaneo en vivo). Pipeline: BarcodeDetector nativo
// → ponyfill ZXing → reintento sobre un canvas reducido (≤1600px por lado).
// NO usa jsQR (es solo QR). Devuelve el texto o null.
async function decodeImageFile(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const im = new window.Image();
      im.onload = () => resolve(im);
      im.onerror = reject;
      im.src = url;
    });

    async function intentar(target) {
      // (a) Detector nativo.
      if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
        try {
          const soportados = window.BarcodeDetector.getSupportedFormats
            ? await window.BarcodeDetector.getSupportedFormats()
            : null;
          const formats = soportados
            ? FORMATOS.filter((f) => soportados.includes(f))
            : FORMATOS;
          if (formats.length) {
            const det = new window.BarcodeDetector({ formats });
            const codes = await det.detect(target);
            if (codes && codes.length) return codes[0].rawValue;
          }
        } catch {
          /* siguiente método */
        }
      }
      // (b) Ponyfill ZXing.
      try {
        const mod = await import('barcode-detector/ponyfill');
        const det = new mod.BarcodeDetector({ formats: FORMATOS });
        const codes = await det.detect(target);
        if (codes && codes.length) return codes[0].rawValue;
      } catch {
        /* sin resultado */
      }
      return null;
    }

    // 1) Sobre la imagen a resolución completa (caso normal, rápido).
    let val = await intentar(img);
    if (val) return val;

    // 2) Reintentos ROTANDO la imagen (las fotos de etiquetas suelen salir de
    //    lado y los códigos 1D se decodifican mucho peor girados) y reduciendo
    //    a ≤1600px por lado. Se prueba 0/90/270/180°.
    const iw = img.naturalWidth || img.width;
    const ih = img.naturalHeight || img.height;
    const MAX_LADO = 1600;

    async function intentarAngulo(deg) {
      try {
        const swap = deg === 90 || deg === 270;
        const srcW = swap ? ih : iw;
        const srcH = swap ? iw : ih;
        const scale = Math.min(1, MAX_LADO / Math.max(srcW, srcH, 1));
        const w = Math.max(1, Math.round(srcW * scale));
        const h = Math.max(1, Math.round(srcH * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.translate(w / 2, h / 2);
        ctx.rotate((deg * Math.PI) / 180);
        ctx.drawImage(img, (-iw * scale) / 2, (-ih * scale) / 2, iw * scale, ih * scale);
        return await intentar(canvas);
      } catch {
        return null;
      }
    }

    for (const deg of [90, 270, 180, 0]) {
      val = await intentarAngulo(deg);
      if (val) return val;
    }

    // 3) Último recurso opcional: html5-qrcode scanFile.
    try {
      const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import('html5-qrcode');
      const instance = new Html5Qrcode(READER_ID_FILE, {
        formatsToSupport: [
          Html5QrcodeSupportedFormats.QR_CODE,
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E,
          Html5QrcodeSupportedFormats.ITF,
          Html5QrcodeSupportedFormats.CODABAR,
        ],
        verbose: false,
      });
      try {
        const decodedText = await instance.scanFile(file, false);
        if (decodedText) return decodedText;
      } finally {
        try {
          await instance.clear();
        } catch {
          /* nunca renderizó */
        }
      }
    } catch {
      /* sin resultado */
    }

    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

const READER_ID_FILE = 'ic-barcode-reader-file';

/**
 * Escáner de códigos (1D + QR). Método PRINCIPAL: por foto (input file con
 * `capture="environment"` + `decodeImageFile`, pipeline BarcodeDetector nativo →
 * ponyfill ZXing-WASM), mucho más robusto para 1D tipo Code128 desde foto que
 * el ZXing de html5-qrcode. Método secundario: stream de cámara en vivo vía
 * `getUserMedia` + loop con BarcodeDetector, con retículo, torch y cleanup.
 * Anti-doble-escaneo compartido: caché Map código->timestamp (3000ms) +
 * debounce global (1200ms) + prop `disabled` mientras se procesa una respuesta.
 */
export default function BarcodeScanner({ onDetected, disabled = false, className = '' }) {
  const [showLive, setShowLive] = useState(false);
  const [active, setActive] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);

  const [processingPhoto, setProcessingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState('');

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const detectorRef = useRef(null);
  const loopTimerRef = useRef(null);
  const stoppedRef = useRef(false);
  const fileInputRef = useRef(null);
  const cacheRef = useRef(new Map());
  const lastGlobalRef = useRef(0);
  const disabledRef = useRef(disabled);

  useEffect(() => {
    disabledRef.current = disabled;
  }, [disabled]);

  const handleDecoded = useCallback(
    (decodedText) => {
      if (disabledRef.current) return false;

      const now = Date.now();
      if (now - lastGlobalRef.current < DEBOUNCE_MS) return false;

      const codigo = String(decodedText || '').trim();
      if (!codigo) return false;

      const last = cacheRef.current.get(codigo);
      if (last && now - last < SCAN_TTL_MS) return false;

      cacheRef.current.set(codigo, now);
      lastGlobalRef.current = now;

      if (cacheRef.current.size > 200) {
        for (const [key, ts] of cacheRef.current) {
          if (now - ts > SCAN_TTL_MS) cacheRef.current.delete(key);
        }
      }

      onDetected?.(codigo);
      return true;
    },
    [onDetected]
  );

  const detener = useCallback(async () => {
    stoppedRef.current = true;
    if (loopTimerRef.current) {
      clearTimeout(loopTimerRef.current);
      loopTimerRef.current = null;
    }
    detectorRef.current = null;
    setTorchOn(false);
    setTorchSupported(false);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    const video = videoRef.current;
    if (video) {
      try {
        video.pause();
      } catch {
        /* ignore */
      }
      video.srcObject = null;
    }
    setActive(false);
  }, []);

  const iniciar = useCallback(async () => {
    if (active || starting) return;
    setStarting(true);
    setError('');
    stoppedRef.current = false;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 2560 },
          height: { ideal: 1440 },
          frameRate: { ideal: 30 },
        },
        audio: false,
      });
      if (stoppedRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;

      const video = videoRef.current;
      if (!video) {
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        return;
      }
      video.srcObject = stream;
      await video.play();
      setActive(true);

      // Capacidades: linterna y autofocus continuo (crítico para 1D).
      const track = stream.getVideoTracks()[0];
      const caps = track && track.getCapabilities ? track.getCapabilities() : {};
      if (caps && 'torch' in caps) setTorchSupported(true);
      try {
        if (caps && Array.isArray(caps.focusMode) && caps.focusMode.includes('continuous')) {
          await track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] });
        }
      } catch {
        /* opcional */
      }

      detectorRef.current = await crearDetector({ warm: true });
      if (!detectorRef.current) {
        setError('Este dispositivo no puede decodificar en vivo. Usa "Tomar foto del código".');
        await detener();
        return;
      }

      loop();
    } catch (err) {
      setError('No se pudo iniciar la cámara. Verifica los permisos del navegador.');
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      setActive(false);
    } finally {
      setStarting(false);
    }

    async function loop() {
      if (stoppedRef.current) return;
      const video = videoRef.current;
      const detector = detectorRef.current;
      if (detector && video && video.readyState >= 2) {
        try {
          const codes = await detector.detect(video);
          if (codes && codes.length) {
            handleDecoded(codes[0].rawValue);
          }
        } catch {
          /* seguir intentando */
        }
      }
      if (!stoppedRef.current) {
        loopTimerRef.current = setTimeout(loop, 100);
      }
    }
  }, [active, starting, handleDecoded, detener]);

  const toggleTorch = useCallback(async () => {
    const stream = streamRef.current;
    if (!stream) return;
    const track = stream.getVideoTracks()[0];
    const next = !torchOn;
    try {
      await track.applyConstraints({ advanced: [{ torch: next }] });
      setTorchOn(next);
    } catch {
      setError('La linterna no está disponible en este dispositivo.');
    }
  }, [torchOn]);

  const toggleLive = useCallback(async () => {
    if (showLive) {
      await detener();
      setShowLive(false);
    } else {
      setPhotoError('');
      setShowLive(true);
    }
  }, [showLive, detener]);

  const abrirCamaraFoto = useCallback(() => {
    if (disabled || processingPhoto) return;
    setPhotoError('');
    fileInputRef.current?.click();
  }, [disabled, processingPhoto]);

  const handlePhotoChange = useCallback(
    async (event) => {
      const file = event.target.files?.[0];
      if (!file) return;

      setPhotoError('');
      setProcessingPhoto(true);

      try {
        const decodedText = await decodeImageFile(file);
        if (decodedText) {
          handleDecoded(decodedText);
        } else {
          setPhotoError(
            'No se pudo leer el código. Acércate, enfoca bien y toma la foto de nuevo. Consejo: usa la cámara en vivo si falla.'
          );
        }
      } catch (err) {
        setPhotoError(
          'No se pudo leer el código. Acércate, enfoca bien y toma la foto de nuevo. Consejo: usa la cámara en vivo si falla.'
        );
      } finally {
        setProcessingPhoto(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    },
    [handleDecoded]
  );

  useEffect(
    () => () => {
      stoppedRef.current = true;
      if (loopTimerRef.current) clearTimeout(loopTimerRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    },
    []
  );

  return (
    <div className={`space-y-3 ${className}`}>
      {/* Div oculto requerido por el fallback html5-qrcode scanFile */}
      <div id={READER_ID_FILE} className="hidden" />

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handlePhotoChange}
      />

      <button
        type="button"
        onClick={abrirCamaraFoto}
        disabled={disabled || processingPhoto}
        className="w-full flex items-center justify-center gap-2 min-h-[52px] bg-blue-800 hover:bg-blue-900 text-white text-base font-semibold px-4 py-3 rounded-lg transition-colors disabled:opacity-60"
      >
        {processingPhoto ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
            Leyendo código…
          </>
        ) : (
          <>
            <Camera className="w-5 h-5" aria-hidden="true" />
            📷 Tomar foto del código
          </>
        )}
      </button>

      {photoError && <p className="text-sm text-red-600">{photoError}</p>}

      <div className="pt-1">
        <button
          type="button"
          onClick={toggleLive}
          disabled={disabled || processingPhoto}
          className="w-full flex items-center justify-center gap-2 min-h-[44px] bg-white border border-slate-200 text-blue-800 hover:bg-slate-50 text-sm font-medium px-4 py-2.5 rounded-lg transition-colors disabled:opacity-60"
        >
          {showLive ? 'Ocultar cámara en vivo' : 'Usar cámara en vivo'}
        </button>
      </div>

      {showLive && (
        <div className="space-y-3">
          <div
            className={`relative w-full rounded-xl overflow-hidden bg-slate-900 aspect-[4/3] min-h-[280px] ${
              active ? 'block' : 'hidden'
            }`}
          >
            <video
              ref={videoRef}
              playsInline
              muted
              autoPlay
              className="w-full h-full object-cover"
            />

            <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center gap-3">
              <div className="w-[70%] aspect-[3/1] relative">
                <span className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-white/90 rounded-tl-lg" />
                <span className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-white/90 rounded-tr-lg" />
                <span className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-white/90 rounded-bl-lg" />
                <span className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-white/90 rounded-br-lg" />
                <span className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-0.5 bg-red-500/80" />
              </div>
              <p className="text-xs font-semibold text-white/90 bg-black/40 px-2.5 py-1 rounded-full">
                Apunta al código de barras
              </p>
            </div>
          </div>

          <div className="flex gap-2">
            {!active ? (
              <button
                type="button"
                onClick={iniciar}
                disabled={starting}
                className="flex-1 flex items-center justify-center gap-2 min-h-[48px] bg-blue-800 hover:bg-blue-900 text-white text-sm font-semibold px-4 py-3 rounded-lg transition-colors disabled:opacity-60"
              >
                <Camera className="w-5 h-5" aria-hidden="true" />
                {starting ? 'Iniciando cámara…' : 'Iniciar cámara'}
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={detener}
                  className="flex-1 flex items-center justify-center gap-2 min-h-[48px] bg-slate-700 hover:bg-slate-800 text-white text-sm font-semibold px-4 py-3 rounded-lg transition-colors"
                >
                  <CameraOff className="w-5 h-5" aria-hidden="true" />
                  Detener cámara
                </button>
                {torchSupported && (
                  <button
                    type="button"
                    onClick={toggleTorch}
                    aria-label="Alternar linterna"
                    className="shrink-0 flex items-center justify-center min-h-[48px] min-w-[48px] bg-white border border-slate-200 text-blue-800 hover:bg-slate-50 rounded-lg transition-colors"
                  >
                    {torchOn ? (
                      <FlashlightOff className="w-5 h-5" aria-hidden="true" />
                    ) : (
                      <Flashlight className="w-5 h-5" aria-hidden="true" />
                    )}
                  </button>
                )}
              </>
            )}
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      )}
    </div>
  );
}
