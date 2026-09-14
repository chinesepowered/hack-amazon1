"use client";
import { useEffect, useState } from "react";
import { finishLinking } from "@/components/auth-client";

export default function Callback() {
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    finishLinking(new URLSearchParams(window.location.search))
      .then((slug) => window.location.replace(`/device?merchant=${slug}&linked=1`))
      .catch((e) => setError((e as Error).message));
  }, []);
  return (
    <main className="min-h-screen grid place-items-center bg-[#1c1411] text-[#fbf5ec]">
      <p className="font-serif text-2xl">{error ?? "Linking your account…"}</p>
    </main>
  );
}
