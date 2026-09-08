import { createFileRoute, Link } from "@tanstack/react-router";
import { Radar, Gauge, Bell, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import heroImage from "@/assets/cyclone-hero.jpg";

export const Route = createFileRoute("/")({
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
  component: Landing,
});

const features = [
  {
    icon: Gauge,
    title: "Confidence scoring",
    body: "Every scan returns a cyclone probability from 0 to 100% with the reasoning behind it.",
  },
  {
    icon: Radar,
    title: "Region highlighting",
    body: "The areas of the image that drove the decision are marked directly on the picture.",
  },
  {
    icon: Bell,
    title: "Threshold alerts",
    body: "Set your own alert level; scans above it are flagged as an alert automatically.",
  },
  {
    icon: History,
    title: "Saved history",
    body: "Past scans, statistics and CSV export stay with your account across devices.",
  },
];

function Landing() {
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5">
        <div className="flex items-center gap-2">
          <Radar className="h-5 w-5 text-primary" />
          <span className="label-mono">Cyclone Detection System</span>
        </div>
        <Button asChild size="sm" variant="secondary">
          <Link to="/auth">Sign in</Link>
        </Button>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-20">
        <section className="grid items-center gap-10 py-10 lg:grid-cols-2 lg:py-16">
          <div>
            <p className="label-mono">Satellite imagery · INSAT · HURSAT · IBTrACS style</p>
            <h1 className="mt-4 text-4xl font-semibold leading-tight sm:text-5xl">
              Spot a cyclone in a satellite image in seconds
            </h1>
            <p className="mt-5 max-w-xl text-muted-foreground">
              Drop in an infrared or visible-channel image and the console classifies it
              as cyclone or non-cyclone, scores its confidence, highlights the cloud
              structure it reacted to, and raises an alert when the risk crosses your
              threshold.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link to="/auth">Open the console</Link>
              </Button>
            </div>
          </div>
          <div className="panel overflow-hidden p-2">
            <img
              src={heroImage}
              alt="Infrared satellite view of a tropical cyclone with spiral cloud bands and a clear eye"
              width={1600}
              height={1000}
              className="w-full rounded-lg"
            />
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((f) => (
            <div key={f.title} className="panel p-6">
              <f.icon className="h-5 w-5 text-primary" />
              <h2 className="mt-4 text-base font-semibold">{f.title}</h2>
              <p className="mt-2 text-sm text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}
