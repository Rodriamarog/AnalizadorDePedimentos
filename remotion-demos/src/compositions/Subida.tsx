import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { FileText, Upload, Loader2, CheckCircle2 } from "lucide-react";

const FILENAME = "PEDIMENTO_25473891.pdf";

export function Subida() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const windowIn = spring({ frame, fps, config: { damping: 18 } });

  // Beats (at 30fps): 0-25 zone intro, 25-50 file appears + button press,
  // 50-130 "uploading" spinner + smooth progress fill, 130-170 success.
  const fileAppear = spring({ frame: frame - 25, fps, config: { damping: 16 } });
  const buttonPress = interpolate(frame, [46, 54, 62], [1, 0.94, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const uploading = frame >= 54 && frame < 130;
  const progressSpring = spring({ frame: frame - 54, fps, durationInFrames: 76, config: { damping: 22, stiffness: 40 } });
  const progress = interpolate(progressSpring, [0, 1], [0, 100], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const done = frame >= 130;
  const doneIn = spring({ frame: frame - 130, fps, config: { damping: 12 } });

  return (
    <AbsoluteFill
      style={{
        background: "oklch(0.114 0.024 264)",
        backgroundImage:
          "repeating-linear-gradient(135deg, rgba(255,255,255,0.05) 0px, rgba(255,255,255,0.05) 1px, transparent 1px, transparent 44px)",
      }}
    >
      <AbsoluteFill
        style={{
          opacity: windowIn,
          transform: `scale(${0.94 + windowIn * 0.06})`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 56,
          padding: 72,
        }}
      >
        <div
          className="w-full rounded-[40px] border-2 border-dashed flex flex-col items-center justify-center gap-8"
          style={{
            borderColor: "color-mix(in oklch, white 22%, transparent)",
            background: "color-mix(in oklch, white 6%, transparent)",
            padding: "80px 48px",
            boxShadow: "0 40px 120px -20px rgba(0,0,0,0.6)",
          }}
        >
          {!done ? (
            <>
              <div
                style={{
                  opacity: fileAppear,
                  transform: `translateY(${(1 - fileAppear) * 14}px)`,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 40,
                  width: "100%",
                }}
              >
                <div
                  className="rounded-full flex items-center justify-center"
                  style={{
                    width: 176,
                    height: 176,
                    background: uploading
                      ? "color-mix(in oklch, var(--primary) 22%, transparent)"
                      : "color-mix(in oklch, var(--primary) 16%, transparent)",
                    boxShadow: "0 0 0 14px color-mix(in oklch, var(--primary) 8%, transparent)",
                  }}
                >
                  {uploading ? (
                    <Loader2
                      style={{
                        width: 92,
                        height: 92,
                        color: "var(--primary)",
                        transform: `rotate(${(frame * 12) % 360}deg)`,
                      }}
                    />
                  ) : (
                    <FileText style={{ width: 92, height: 92, color: "var(--primary)" }} />
                  )}
                </div>

                <p
                  className="font-mono"
                  style={{ fontSize: 30, color: "white", fontWeight: 600, letterSpacing: -0.5, textAlign: "center" }}
                >
                  {FILENAME}
                </p>

                <div style={{ transform: `scale(${buttonPress})` }}>
                  <div
                    className="rounded-2xl flex items-center gap-3 font-semibold"
                    style={{
                      background: "var(--primary)",
                      color: "oklch(0.114 0.024 264)",
                      padding: "24px 48px",
                      fontSize: 32,
                      boxShadow: "0 20px 50px -12px color-mix(in oklch, var(--primary) 60%, transparent)",
                    }}
                  >
                    {uploading ? (
                      <Loader2 style={{ width: 34, height: 34, transform: `rotate(${(frame * 12) % 360}deg)` }} />
                    ) : (
                      <Upload style={{ width: 34, height: 34 }} />
                    )}
                    {uploading ? "Subiendo y analizando..." : "Subir pedimento"}
                  </div>
                </div>
              </div>

              {uploading && (
                <div
                  style={{
                    width: "100%",
                    maxWidth: 640,
                    height: 20,
                    borderRadius: 999,
                    background: "rgba(255,255,255,0.12)",
                    overflow: "hidden",
                    boxShadow: "inset 0 2px 6px rgba(0,0,0,0.3)",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: `${progress}%`,
                      borderRadius: 999,
                      background: "linear-gradient(90deg, color-mix(in oklch, var(--primary) 70%, white), var(--primary))",
                      boxShadow: "0 0 24px 2px color-mix(in oklch, var(--primary) 70%, transparent)",
                    }}
                  />
                </div>
              )}
            </>
          ) : (
            <div
              style={{
                opacity: doneIn,
                transform: `scale(${0.6 + doneIn * 0.4})`,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 24,
              }}
            >
              <div
                className="rounded-full flex items-center justify-center"
                style={{
                  width: 176,
                  height: 176,
                  background: "color-mix(in oklch, oklch(0.6 0.15 155) 20%, transparent)",
                  boxShadow: "0 0 0 14px color-mix(in oklch, oklch(0.6 0.15 155) 10%, transparent)",
                }}
              >
                <CheckCircle2 style={{ width: 100, height: 100, color: "oklch(0.7 0.17 155)" }} />
              </div>
              <p className="font-mono" style={{ fontSize: 28, color: "white", fontWeight: 600 }}>
                {FILENAME}
              </p>
              <div
                className="rounded-full font-semibold"
                style={{
                  background: "color-mix(in oklch, oklch(0.6 0.15 155) 22%, transparent)",
                  color: "oklch(0.85 0.13 155)",
                  padding: "14px 32px",
                  fontSize: 26,
                }}
              >
                Pedimento subido y analizado
              </div>
            </div>
          )}
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 28,
          }}
        >
          <span
            style={{
              fontSize: 108,
              fontWeight: 900,
              color: "var(--primary)",
              lineHeight: 1,
              letterSpacing: -2,
              textShadow: "0 0 40px color-mix(in oklch, var(--primary) 55%, transparent)",
            }}
          >
            1
          </span>
          <span
            style={{
              fontSize: 68,
              fontWeight: 800,
              color: "white",
              letterSpacing: -1.5,
              lineHeight: 1.05,
            }}
          >
            Sube tu
            <br />
            pedimento
          </span>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}
