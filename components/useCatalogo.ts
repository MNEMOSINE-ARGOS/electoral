"use client";
import { useEffect, useState } from "react";
import { api, type Catalogo } from "@/lib/api";

let cache: Catalogo | null = null;
export function useCatalogo() {
  const [cat, setCat] = useState<Catalogo | null>(cache);
  useEffect(() => {
    if (cache) return;
    api<Catalogo>("/api/catalogo").then((c) => { cache = c; setCat(c); });
  }, []);
  return cat;
}
