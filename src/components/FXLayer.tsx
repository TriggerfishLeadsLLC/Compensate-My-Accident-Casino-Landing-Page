"use client";

import { useEffect, useRef } from "react";
import { registerCanvas, resize } from "@/lib/fx";

// Full-screen, non-interactive canvas that the FX engine draws on.
export default function FXLayer() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (ref.current) registerCanvas(ref.current);
    const onR = () => resize();
    window.addEventListener("resize", onR);
    window.addEventListener("orientationchange", onR);
    return () => {
      window.removeEventListener("resize", onR);
      window.removeEventListener("orientationchange", onR);
    };
  }, []);
  return <canvas ref={ref} className="fx-canvas" aria-hidden="true" />;
}
