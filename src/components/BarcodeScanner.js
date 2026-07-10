'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, CameraOff, Flashlight, FlashlightOff, Loader2 } from 'lucide-react';

const SCAN_TTL_MS = 3000;
const DEBOUNCE_MS = 1200;
const READER_ID = 'ic-barcode-reader';
const READER_ID_FILE = 'ic-barcode-reader-file';

const FORMATS_TO_SUPPORT = (Html5QrcodeSupportedFormats) => [
  Html5QrcodeSupportedFormats.QR_CODE,
  Html5QrcodeSupportedFormats.CODE_128,
  Html5QrcodeSupportedFormats.CODE_39,
  Html5QrcodeSupportedFormats.EAN_13,
  Html5QrcodeSupportedFormats.EAN_8,
  Html5QrcodeSupportedFormats.UPC_A,
  Html5QrcodeSupportedFormats.UPC_E,
  Html5QrcodeSupportedFormats.ITF,
  Html5QrcodeSupportedFormats.CODABAR,
];

/**
 * Escáner de códigos (1D + QR). Método PRINCIPAL: por foto (input file con
 * `capture="environment"` + `Html5Qrcode.scanFile`), más confiable para
 * códigos 1D en celular. Método secundario: stream de cámara en vivo vía
 * html5-qrcode (import dinámico, solo cliente), con retículo, torch y
 * cleanup. Anti-doble-escaneo compartido: caché Map código->timestamp
 * (3000ms) + debounce global (1200ms) + prop `disabled` mientras se procesa
 * una respuesta.
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

  const scannerRef = useRef(null);
  const fileScannerRef = useRef(null);
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
    const instance = scannerRef.current;
    scannerRef.current = null;
    setTorchOn(false);
    setTorchSupported(false);
    if (!instance) {
      setActive(false);
      return;
    }
    try {
      await instance.stop();
      await instance.clear();
    } catch {
      // ya estaba detenido
    }
    setActive(false);
  }, []);

  const iniciar = useCallback(async () => {
    if (active || starting) return;
    setStarting(true);
    setError('');
    try {
      const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import('html5-qrcode');
      const instance = new Html5Qrcode(READER_ID, {
        formatsToSupport: FORMATS_TO_SUPPORT(Html5QrcodeSupportedFormats),
        verbose: false,
      });
      scannerRef.current = instance;

      await instance.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: (viewfinderWidth, viewfinderHeight) => {
            const size = Math.floor(Math.min(viewfinderWidth, viewfinderHeight) * 0.7);
            return { width: size, height: size };
          },
        },
        (decodedText) => handleDecoded(decodedText),
        () => {
          /* frame sin lectura: silencioso */
        }
      );

      setActive(true);

      try {
        const caps = instance.getRunningTrackCapabilities?.();
        setTorchSupported(!!caps?.torch);
      } catch {
        setTorchSupported(false);
      }
    } catch (err) {
      setError('No se pudo iniciar la cámara. Verifica los permisos del navegador.');
      scannerRef.current = null;
      setActive(false);
    } finally {
      setStarting(false);
    }
  }, [active, starting, handleDecoded]);

  const toggleTorch = useCallback(async () => {
    const instance = scannerRef.current;
    if (!instance) return;
    const next = !torchOn;
    try {
      await instance.applyVideoConstraints({ advanced: [{ torch: next }] });
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

      // scanFile requiere que la instancia no esté escaneando en vivo.
      if (scannerRef.current) {
        await detener();
      }

      let instance = null;
      try {
        const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import('html5-qrcode');
        instance = new Html5Qrcode(READER_ID_FILE, {
          formatsToSupport: FORMATS_TO_SUPPORT(Html5QrcodeSupportedFormats),
          verbose: false,
        });
        fileScannerRef.current = instance;

        const decodedText = await instance.scanFile(file, false);
        const aceptado = handleDecoded(decodedText);
        if (!aceptado) {
          // Duplicado, debounce o `disabled`: no es un error de lectura.
          setPhotoError('');
        }
      } catch (err) {
        setPhotoError('No se pudo leer el código. Acércate, enfoca bien y toma la foto de nuevo.');
      } finally {
        if (instance) {
          try {
            await instance.clear();
          } catch {
            // sin efecto si nunca renderizó
          }
        }
        fileScannerRef.current = null;
        setProcessingPhoto(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    },
    [detener, handleDecoded]
  );

  useEffect(
    () => () => {
      const instance = scannerRef.current;
      if (instance) {
        instance
          .stop()
          .then(() => instance.clear())
          .catch(() => {});
      }
      const fileInstance = fileScannerRef.current;
      if (fileInstance) {
        fileInstance.clear().catch(() => {});
      }
    },
    []
  );

  return (
    <div className={`space-y-3 ${className}`}>
      {/* Div oculto usado solo por scanFile (modo foto) */}
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
            Tomar foto del código
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
            <div id={READER_ID} className="w-full h-full [&_video]:w-full [&_video]:h-full [&_video]:object-cover" />

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
