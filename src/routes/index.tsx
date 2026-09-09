import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  Download,
  Radar,
  Trash2,
  Upload,
  Loader2,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { ACCEPTED_IMAGE_TYPES, fileToDataUrl } from "@/lib/image";
import {
  analyzeImage,
  deletePrediction,
  listPredictions,
  type AnalysisResult,
  type PredictionRow,
} from "@/lib/cyclone.functions";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Cyclone Detection System | AI Satellite Image Analysis" },
      {
        name: "description",
        content:
          "Upload satellite imagery and instantly classify cyclone vs non-cyclone patterns with confidence scores, flagged regions and alert history.",
      },
      {
        property: "og:title",
        content: "Cyclone Detection System | AI Satellite Image Analysis",
      },
      {
        property: "og:description",
        content:
          "AI-powered cyclone classification for satellite imagery, with confidence scoring and alerts.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Console,
});

function cycloneProbability(label: string, confidence: number) {
  return label === "CYCLONE" ? confidence : 100 - confidence;
}

/** Silently establishes a device session so history can be saved without a login screen. */
function useSilentSession() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let active = true;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) await supabase.auth.signInAnonymously();
      if (active) setReady(true);
    })();
    return () => {
      active = false;
    };
  }, []);
  return ready;
}

function Console() {
  const queryClient = useQueryClient();
  const sessionReady = useSilentSession();
  const analyze = useServerFn(analyzeImage);
  const fetchHistory = useServerFn(listPredictions);
  const removePrediction = useServerFn(deletePrediction);

  const [threshold, setThreshold] = useState(70);
  const [preview, setPreview] = useState<string | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const history = useQuery({
    queryKey: ["predictions"],
    queryFn: () => fetchHistory(),
    enabled: sessionReady,
  });

  const runAnalysis = useMutation({
    mutationFn: async (file: File) => {
      const [full, thumb] = await Promise.all([
        fileToDataUrl(file, 768, 0.88),
        fileToDataUrl(file, 220, 0.7),
      ]);
      setPreview(full);
      setResult(null);
      return analyze({
        data: {
          imageName: file.name,
          imageDataUrl: full,
          thumbnail: thumb,
          threshold,
        },
      });
    },
    onSuccess: (data) => {
      setResult(data);
      queryClient.invalidateQueries({ queryKey: ["predictions"] });
      if (data.isAlert) toast.warning("Cyclone alert triggered");
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : "Analysis failed"),
  });

  const handleFiles = useCallback(
    (files: FileList | null) => {
      const file = files?.[0];
      if (!file) return;
      if (!file.type.startsWith("image/")) {
        toast.error("Please upload an image file (.jpg, .png, .tif, .webp).");
        return;
      }
      runAnalysis.mutate(file);
    },
    [runAnalysis],
  );

  const rows: PredictionRow[] = history.data ?? [];
  const stats = useMemo(() => {
    const total = rows.length;
    const cyclones = rows.filter((r) => r.label === "CYCLONE").length;
    const alerts = rows.filter((r) => r.is_alert).length;
    const avg =
      total === 0
        ? 0
        : rows.reduce((sum, r) => sum + Number(r.confidence), 0) / total;
    return { total, cyclones, alerts, avg };
  }, [rows]);

  function exportCsv() {
    const header = "date,image,result,confidence,alert\n";
    const body = rows
      .map((r) =>
        [
          new Date(r.created_at).toISOString(),
          `"${r.image_name.replace(/"/g, "'")}"`,
          r.label,
          Number(r.confidence).toFixed(1),
          r.is_alert ? "yes" : "no",
        ].join(","),
      )
      .join("\n");
    const url = URL.createObjectURL(new Blob([header + body], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "cyclone-predictions.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  const probability = result ? cycloneProbability(result.label, result.confidence) : 0;

  return (
    <div className="min-h-screen">
      <header className="border-b border-border/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-3">
            <Radar className="h-5 w-5 text-primary" />
            <div>
              <h1 className="text-sm font-semibold">Cyclone Detection System</h1>
              <p className="label-mono">Live analysis console</p>
            </div>
          </div>
          <span className="label-mono hidden sm:block">
            INSAT · HURSAT · IBTrACS style imagery
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-4 py-8">
        <section className="grid gap-6 lg:grid-cols-2">
          <div
            className={`panel flex flex-col justify-between p-6 transition ${
              dragging ? "glow-ring" : ""
            }`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              handleFiles(e.dataTransfer.files);
            }}
          >
            <div>
              <p className="label-mono">Image intake</p>
              <h2 className="mt-1 text-lg font-semibold">Upload satellite image</h2>
            </div>

            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="mt-5 flex min-h-56 w-full flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-secondary/30 p-6 text-center transition hover:border-primary/60 hover:bg-secondary/50"
            >
              {runAnalysis.isPending ? (
                <Loader2 className="h-7 w-7 animate-spin text-primary" />
              ) : (
                <Upload className="h-7 w-7 text-primary" />
              )}
              <span className="text-sm font-medium">
                {runAnalysis.isPending
                  ? "Analysing imagery…"
                  : "Drag & drop an image, or click to browse"}
              </span>
              <span className="text-xs text-muted-foreground">
                JPG, PNG, WEBP or TIF · infrared or visible channel
              </span>
            </button>
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPTED_IMAGE_TYPES}
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
            />

            <div className="mt-6">
              <div className="flex items-center justify-between">
                <span className="label-mono">Alert threshold</span>
                <span className="font-mono text-sm text-primary">{threshold}%</span>
              </div>
              <Slider
                className="mt-3"
                value={[threshold]}
                min={30}
                max={95}
                step={5}
                onValueChange={(v) => setThreshold(v[0] ?? 70)}
              />
              <p className="mt-2 text-xs text-muted-foreground">
                An alert is raised when cyclone probability reaches this level.
              </p>
            </div>
          </div>

          <div className="panel p-6">
            <p className="label-mono">Prediction result</p>
            {!result && !runAnalysis.isPending && (
              <div className="mt-4 flex min-h-72 items-center justify-center rounded-xl border border-border/60 bg-secondary/20 text-sm text-muted-foreground">
                Awaiting an image
              </div>
            )}

            {runAnalysis.isPending && (
              <div className="mt-4 flex min-h-72 items-center justify-center rounded-xl border border-border/60 bg-secondary/20 text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Scanning cloud
                structure…
              </div>
            )}

            {result && (
              <div className="mt-4 space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2
                      className={`text-2xl font-semibold ${
                        result.label === "CYCLONE" ? "text-accent" : "text-success"
                      }`}
                    >
                      {result.label === "CYCLONE"
                        ? "Cyclone detected"
                        : "No cyclone detected"}
                    </h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {result.imageName}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="label-mono">Confidence</p>
                    <p className="font-mono text-2xl text-primary">
                      {result.confidence.toFixed(1)}%
                    </p>
                  </div>
                </div>

                <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${probability}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Cyclone probability {probability.toFixed(1)}% · threshold {threshold}%
                </p>

                {result.isAlert && (
                  <div className="alert-surface flex items-center gap-3 rounded-xl p-4">
                    <AlertTriangle className="h-5 w-5 text-accent" />
                    <p className="text-sm">
                      Alert raised — cyclone probability is above your threshold.
                    </p>
                  </div>
                )}

                {preview && (
                  <div className="relative overflow-hidden rounded-xl border border-border">
                    <img
                      src={preview}
                      alt={`Satellite image analysed as ${result.label}`}
                      className="w-full"
                    />
                    {result.regions.map((r, i) => (
                      <div
                        key={i}
                        title={r.label}
                        className="pointer-events-none absolute rounded-full border-2 border-accent/80"
                        style={{
                          left: `${(r.x - r.r) * 100}%`,
                          top: `${(r.y - r.r) * 100}%`,
                          width: `${r.r * 200}%`,
                          height: `${r.r * 200}%`,
                          background:
                            "radial-gradient(circle, oklch(0.79 0.16 78 / 0.35), transparent 70%)",
                        }}
                      />
                    ))}
                  </div>
                )}

                {result.reasoning && (
                  <p className="text-sm text-muted-foreground">{result.reasoning}</p>
                )}

                {result.features.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {result.features.map((f) => (
                      <Badge key={f} variant="secondary">
                        {f}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: "Images analysed", value: String(stats.total) },
            { label: "Cyclones found", value: String(stats.cyclones) },
            { label: "Alerts raised", value: String(stats.alerts) },
            { label: "Avg confidence", value: `${stats.avg.toFixed(1)}%` },
          ].map((s) => (
            <div key={s.label} className="panel p-5">
              <p className="label-mono">{s.label}</p>
              <p className="mt-2 font-mono text-2xl text-primary">{s.value}</p>
            </div>
          ))}
        </section>

        <section className="panel p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="label-mono">History</p>
              <h2 className="mt-1 text-lg font-semibold">Recent predictions</h2>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={exportCsv}
              disabled={!rows.length}
            >
              <Download className="mr-2 h-4 w-4" /> Export CSV
            </Button>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left">
                  <th className="label-mono py-2">Image</th>
                  <th className="label-mono py-2">Result</th>
                  <th className="label-mono py-2">Confidence</th>
                  <th className="label-mono py-2">When</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-muted-foreground">
                      No predictions yet.
                    </td>
                  </tr>
                )}
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-border/60">
                    <td className="py-3">
                      <div className="flex items-center gap-3">
                        {r.thumbnail && (
                          <img
                            src={r.thumbnail}
                            alt={r.image_name}
                            className="h-10 w-10 rounded-md object-cover"
                          />
                        )}
                        <span className="max-w-40 truncate">{r.image_name}</span>
                      </div>
                    </td>
                    <td className="py-3">
                      <span
                        className={r.label === "CYCLONE" ? "text-accent" : "text-success"}
                      >
                        {r.label === "CYCLONE" ? "Cyclone" : "No cyclone"}
                      </span>
                      {r.is_alert && (
                        <Badge className="ml-2" variant="outline">
                          Alert
                        </Badge>
                      )}
                    </td>
                    <td className="py-3 font-mono">{Number(r.confidence).toFixed(1)}%</td>
                    <td className="py-3 text-muted-foreground">
                      {new Date(r.created_at).toLocaleString()}
                    </td>
                    <td className="py-3 text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Delete prediction for ${r.image_name}`}
                        onClick={async () => {
                          await removePrediction({ data: { id: r.id } });
                          queryClient.invalidateQueries({ queryKey: ["predictions"] });
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
