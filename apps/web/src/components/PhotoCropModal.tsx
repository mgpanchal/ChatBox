'use client';

import { useEffect, useRef, useState } from 'react';
import { Camera, X, ZoomIn, ZoomOut, RotateCw } from 'lucide-react';

type Props = {
  file: File;
  onClose: () => void;
  onSave: (cropped: Blob) => Promise<void>;
};

const VIEWPORT = 280;
const OUTPUT = 512;
const MIN_ZOOM = 1;
const MAX_ZOOM = 3;

export function PhotoCropModal({ file, onClose, onSave }: Props) {
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setImgUrl(url);
    const img = new Image();
    img.onload = () => setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
    img.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const baseFit = naturalSize ? Math.max(VIEWPORT / naturalSize.w, VIEWPORT / naturalSize.h) : 1;
  const renderedW = naturalSize ? naturalSize.w * baseFit * zoom : VIEWPORT;
  const renderedH = naturalSize ? naturalSize.h * baseFit * zoom : VIEWPORT;

  const clampPos = (next: { x: number; y: number }) => {
    const maxX = Math.max(0, (renderedW - VIEWPORT) / 2);
    const maxY = Math.max(0, (renderedH - VIEWPORT) / 2);
    return {
      x: Math.max(-maxX, Math.min(maxX, next.x)),
      y: Math.max(-maxY, Math.min(maxY, next.y)),
    };
  };

  useEffect(() => {
    setPos((p) => clampPos(p));
  }, [zoom, naturalSize]);

  const onMouseDown = (e: React.MouseEvent) => {
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y };
  };
  const onMouseMove = (e: React.MouseEvent) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setPos(clampPos({ x: dragRef.current.origX + dx, y: dragRef.current.origY + dy }));
  };
  const onMouseUp = () => { dragRef.current = null; };

  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    if (!t) return;
    dragRef.current = { startX: t.clientX, startY: t.clientY, origX: pos.x, origY: pos.y };
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (!dragRef.current) return;
    const t = e.touches[0];
    if (!t) return;
    const dx = t.clientX - dragRef.current.startX;
    const dy = t.clientY - dragRef.current.startY;
    setPos(clampPos({ x: dragRef.current.origX + dx, y: dragRef.current.origY + dy }));
  };

  const save = async () => {
    if (!imgUrl || !naturalSize) return;
    setBusy(true);
    setError(null);
    try {
      const img = new Image();
      img.src = imgUrl;
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Image load failed'));
      });

      const canvas = document.createElement('canvas');
      canvas.width = OUTPUT;
      canvas.height = OUTPUT;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas not supported');

      // The viewport is VIEWPORT × VIEWPORT centered. Image is rendered at renderedW × renderedH translated by pos.
      // Map the centered viewport rect back to natural image coordinates.
      const scale = baseFit * zoom;
      const centerInImageX = naturalSize.w / 2 - pos.x / scale;
      const centerInImageY = naturalSize.h / 2 - pos.y / scale;
      const sourceSize = VIEWPORT / scale;
      const sx = centerInImageX - sourceSize / 2;
      const sy = centerInImageY - sourceSize / 2;

      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, OUTPUT, OUTPUT);
      ctx.translate(OUTPUT / 2, OUTPUT / 2);
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.translate(-OUTPUT / 2, -OUTPUT / 2);
      ctx.drawImage(img, sx, sy, sourceSize, sourceSize, 0, 0, OUTPUT, OUTPUT);

      const blob: Blob = await new Promise((resolve, reject) => {
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error('Canvas export failed'))),
          'image/jpeg',
          0.9,
        );
      });

      await onSave(blob);
    } catch (e: any) {
      setError(e.message ?? 'Failed to save');
      setBusy(false);
    }
  };

  return (
    <div style={styles.backdrop} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>Crop your photo</h2>
          <button style={styles.close} onClick={onClose}><X size={18} /></button>
        </div>

        <div style={styles.body}>
          <div
            style={styles.viewport}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onMouseUp}
          >
            {imgUrl && naturalSize && (
              <img
                src={imgUrl}
                draggable={false}
                style={{
                  position: 'absolute',
                  width: renderedW,
                  height: renderedH,
                  left: VIEWPORT / 2 - renderedW / 2 + pos.x,
                  top: VIEWPORT / 2 - renderedH / 2 + pos.y,
                  transform: `rotate(${rotation}deg)`,
                  transformOrigin: 'center center',
                  userSelect: 'none',
                  pointerEvents: 'none',
                }}
              />
            )}
            <div style={styles.cropOverlay} />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 16 }}>
            <ZoomOut size={14} color="var(--text-tertiary)" />
            <input
              type="range"
              min={MIN_ZOOM * 100}
              max={MAX_ZOOM * 100}
              step={1}
              value={zoom * 100}
              onChange={(e) => setZoom(Number(e.target.value) / 100)}
              style={{ flex: 1 }}
            />
            <ZoomIn size={14} color="var(--text-tertiary)" />
            <button
              onClick={() => setRotation((r) => (r + 90) % 360)}
              style={{ ...styles.iconBtn, marginLeft: 8 }}
              title="Rotate"
            >
              <RotateCw size={14} />
            </button>
          </div>

          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 8, textAlign: 'center' }}>
            Drag to position · zoom + rotate above · saved as a square 512×512 image
          </div>

          {error && (
            <div style={{ marginTop: 12, padding: 10, background: '#FEE4E2', color: 'var(--danger)', fontSize: 12, borderRadius: 8 }}>{error}</div>
          )}
        </div>

        <div style={styles.footer}>
          <button style={styles.btnGhost} onClick={onClose}>Cancel</button>
          <button
            style={{ ...styles.btnPrimary, opacity: busy ? 0.5 : 1, cursor: busy ? 'not-allowed' : 'pointer' }}
            disabled={busy}
            onClick={save}
          >
            <Camera size={14} />
            {busy ? 'Saving…' : 'Save photo'}
          </button>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  backdrop: { position: 'fixed', inset: 0, background: 'rgba(11,11,15,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 20 },
  modal: { background: 'var(--card)', borderRadius: 16, width: '100%', maxWidth: 380, overflow: 'hidden', display: 'flex', flexDirection: 'column' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 20px 12px' },
  close: { width: 32, height: 32, borderRadius: 8, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', background: 'transparent', cursor: 'pointer' },
  body: { padding: '0 20px 16px' },
  viewport: {
    width: VIEWPORT,
    height: VIEWPORT,
    margin: '0 auto',
    position: 'relative',
    overflow: 'hidden',
    background: 'var(--canvas)',
    cursor: 'grab',
    userSelect: 'none',
    borderRadius: 8,
    border: '1px solid var(--border)',
  },
  cropOverlay: {
    position: 'absolute',
    inset: 0,
    pointerEvents: 'none',
    boxShadow: `0 0 0 9999px rgba(11,11,15,0.45)`,
    borderRadius: '50%',
    border: '2px solid rgba(255,255,255,0.8)',
  },
  iconBtn: { width: 30, height: 30, borderRadius: 8, background: 'var(--canvas)', border: '1px solid var(--border)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' },
  footer: { padding: 16, borderTop: '1px solid var(--border)', display: 'flex', gap: 8, justifyContent: 'flex-end' },
  btnGhost: { padding: '10px 16px', borderRadius: 10, background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border)', fontSize: 14, fontWeight: 500, cursor: 'pointer' },
  btnPrimary: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 16px', borderRadius: 10, background: 'var(--inverse)', color: 'var(--text-on-inverse)', fontSize: 14, fontWeight: 600, border: 'none' },
};
