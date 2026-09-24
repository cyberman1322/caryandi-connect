import { useEffect, useRef, useState } from 'react';
import { Camera, RefreshCw, ShieldAlert, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

type Stage = 'idle' | 'live' | 'captured' | 'blocked';

/** A selfie taken live from the camera, ready to upload. */
export type CapturedSelfie = { blob: Blob; capturedAt: Date };

/**
 * Camera-only selfie capture. Deliberately has NO file input and no drag/drop:
 * a live capture is the only accepted path, since stored images cannot be
 * distinguished from uploads later. Admin review is the second gate.
 */
export function SelfieCapture({ onChange, disabled = false }: { onChange?: (selfie: CapturedSelfie | null) => void; disabled?: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [stage, setStage] = useState<Stage>('idle');
  const [shot, setShot] = useState<string | null>(null);

  const stop = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  useEffect(() => stop, []);

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 960 } },
        audio: false,
      });
      streamRef.current = stream;
      setStage('live');
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play();
        }
      });
    } catch {
      setStage('blocked');
    }
  };

  const capture = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width = video.videoWidth || 960;
    canvas.height = video.videoHeight || 720;
    canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
    const capturedAt = new Date();
    setShot(canvas.toDataURL('image/jpeg', 0.9));
    // Drawing onto a canvas and re-encoding means no camera metadata leaves the device.
    canvas.toBlob((blob) => { if (blob) onChange?.({ blob, capturedAt }); }, 'image/jpeg', 0.88);
    stop();
    setStage('captured');
  };

  const retake = () => {
    setShot(null);
    onChange?.(null);
    void start();
  };

  return (
    <section className="rounded-lg border bg-card p-5">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
        <div className="min-w-0">
          <h2 className="font-semibold">Identity selfie</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Taken live in the app only. Uploading a saved photo is not possible here.
          </p>
        </div>
        <Badge variant="outline" className="shrink-0">
          <Camera className="size-3.5" />
          Live capture
        </Badge>
      </div>

      <div className="mt-4 overflow-hidden rounded-md border bg-muted/30">
        <div className="relative aspect-[4/3] w-full">
          {stage === 'captured' && shot ? (
            <img src={shot} alt="Selfie captured in the app" className="size-full object-cover" />
          ) : (
            <video
              ref={videoRef}
              playsInline
              muted
              className={`size-full object-cover ${stage === 'live' ? '' : 'hidden'}`}
            />
          )}
          {stage !== 'live' && stage !== 'captured' && (
            <div className="absolute inset-0 grid place-items-center p-6 text-center">
              <div>
                <Camera className="mx-auto size-8 text-muted-foreground" />
                <b className="mt-2 block text-sm">
                  {stage === 'blocked' ? 'Camera not available' : 'Camera preview'}
                </b>
                <p className="mt-1 text-xs text-muted-foreground">
                  {stage === 'blocked'
                    ? 'Allow camera access in your browser, then try again.'
                    : 'Start the camera and take your selfie in good light.'}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
      <canvas ref={canvasRef} className="hidden" />

      <div className="mt-4 flex flex-wrap gap-2">
        {stage === 'live' ? (
          <Button type="button" onClick={capture} disabled={disabled}>
            <Camera />
            Take selfie
          </Button>
        ) : stage === 'captured' ? (
          <>
            <Button type="button" variant="outline" onClick={retake} disabled={disabled}>
              <RefreshCw />
              Retake
            </Button>
          </>
        ) : (
          <Button type="button" onClick={start} disabled={disabled}>
            <Camera />
            {stage === 'blocked' ? 'Try camera again' : 'Start camera'}
          </Button>
        )}
      </div>

      <div className="mt-4 flex items-start gap-2 rounded-md bg-accent p-3 text-sm">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
        <span className="text-muted-foreground">
          Every selfie is checked by our review team before an account is marked verified.
        </span>
      </div>
      {stage === 'captured' && (
        <p role="status" className="mt-3 flex items-start gap-2 text-sm text-muted-foreground">
          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-warning" />
          Selfie ready. It is uploaded only when you submit the request below.
        </p>
      )}
    </section>
  );
}

export function SelfieReviewNote() {
  return (
    <div className="flex items-start gap-2 rounded-md border bg-card p-3 text-sm">
      <Camera className="mt-0.5 size-4 shrink-0 text-primary" />
      <span className="text-muted-foreground">
        Selfies are captured live in the app. Reviewers confirm the face matches the submitted
        documents before approving.
      </span>
    </div>
  );
}
