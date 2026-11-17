"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Cargando } from "@/components/Kpi";

// «Comparar territorios» ahora es la pestaña «Varios territorios y años» de Evolución (components/CompararTerritorios).
// Esta ruta queda para que los enlaces viejos sigan funcionando.
export default function Comparar() {
  const router = useRouter();
  useEffect(() => { router.replace("/historico#comparar"); }, [router]);
  return <Cargando />;
}
