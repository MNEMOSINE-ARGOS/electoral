# Argos · Electoral — guía para desarrollar con Claude

@AGENTS.md

Aplicación web de análisis electoral de México **por sección electoral** (Next.js 16 + PostgreSQL). Idioma de trabajo, de la interfaz y del código: **español**. Fecha de este documento: 2026-11-05.

Este repositorio contiene **solo la aplicación**. Los datos los produce un proyecto aparte (pipeline en Python, «Data/»), que estandariza fuentes del INE y de investigadores y carga tablas agregadas a PostgreSQL. Aquí no se procesan fuentes crudas: la app **lee** esas tablas. Si una cifra de la base parece mal, el arreglo va en el pipeline, no en un parche de la app (ver §9).

---

## 1. Correr y comprobar

```bash
bun install
bun run dev                 # http://localhost:3000
bunx tsc --noEmit           # sin errores antes de dar algo por terminado
bun run build
```

| Variable | Archivo | Uso |
|---|---|---|
| `DATABASE_URL` | `.env` | PostgreSQL con las tablas de §3. **Nunca imprimirla ni copiarla a código, logs o documentos.** |
| `AUTH_SECRET` | `.env.local` | Firma HMAC de la cookie de sesión |

`.env*` está en `.gitignore`.

**Despliegue (Coolify u otro).**
- `bun run build` **debe compilar sin variables de entorno**: las plataformas las dan solo al ejecutar. Con `cacheComponents`, Next pre-renderiza al compilar todo GET que no lea la petición; una ruta que consulte la base sin leer `req` necesita `await connection()` (de `next/server`), como `app/api/catalogo`. Comprobación: compilar con `.env` y `.env.local` apartados.
- `DATABASE_URL` y `AUTH_SECRET` se definen como variables de **ejecución**.
- La cookie lleva `Secure` solo si la petición llegó por HTTPS (`x-forwarded-proto`): por `http` el login funciona igual.
- **Diagnóstico: `GET /api/salud`** (pública, sin secretos). Dice si están `DATABASE_URL` y `AUTH_SECRET`, si conecta a PostgreSQL (host, ms, código de error y pista) y si existen las tablas de la app. El login también dice qué variable falta, en lugar de un error genérico.
- Si `/api/salud` muestra un error de conexión (ETIMEDOUT, ECONNREFUSED, 28000…), el contenedor no llega a PostgreSQL: revisa el firewall o `pg_hba.conf` del servidor de la base, o usa el host interno si la base corre en el mismo Coolify. Para probar APIs desde la terminal hace falta iniciar sesión (`POST /api/auth/login`) y reenviar la cookie `electoral_sesion`. Usa un usuario de prueba creado desde `/usuarios` y bórralo al terminar; no pidas ni guardes contraseñas reales.

---

## 2. Mapa del código

```
app/(app)/            pantallas (cliente)
  inicio/             portada tras el login: cifras y gráficas de cobertura (API inicio, caché 1 h), cómo se recorre, el enfoque con su
                      selector, índice de pantallas (número, resumen, vista previa y cifra; preguntas plegadas), conceptos y datos.
                      Cifras de arriba con conteo animado (components/Contador.tsx)
  page.tsx            «Resultados por cargo»: cargo → año → territorio (entidad, distrito, municipio, sección), unidades ganadas,
                      competitividad, serie y piso/techo
  historico/          evolución de un cargo en un territorio y elección A vs B
  municipios/         comparar territorios del mismo tipo de elección
  estados/            mapa nacional por entidad (geometrías en public/geo/; solo estados)
  distritos/          distritos federales y locales, circunscripciones
  secciones/          lectura por sección, edad de la sección, tendencia frente al país, comparación y estrategia
  electorado/         lista nominal por edad y sexo
  judicial/           elección judicial 2025 (votos por persona)
  usuarios/           solo superusuarios
  layout.tsx          barra superior (selector de enfoque, tema, cuenta) y barra lateral
app/api/              rutas de datos (route handlers) y auth/
components/           Buscador (autocompletado), Territorio, Piramide, PisoTecho, TendenciaSeccion, EdadSeccion,
                      Enfoque (contexto + selector + CeldaClase), EstrategiaSecciones, PerfilParticipacion, Waffle, Kpi,
                      Plegable (detalle un nivel abajo), MiniGraficas (SVG; colores --serie-fed/--serie-loc validados para daltonismo)…
lib/
  analisis.ts         lecturas: porCandidatura, porBloque, familia, indicadores, pedersen, competitividad, ENFOQUES, claseEnfoque
  tendencia.ts        tendencia de una sección frente al país y su estado
  pisoTecho.ts        piso y techo histórico por partido
  consultas.ts        consultas reutilizables (resultados por territorio, GRUPOS_EDAD)
  db.ts               pool de pg (q<T>()) y tabla de usuarios
  auth.ts             cookie firmada (Web Crypto)        vigencia.ts  usuario activo + rol vigente (caché 30 s)
  password.ts         bcrypt                              superusuario.ts  guardia soloSuper()
  navegacion.ts       pantallas de la app (menú lateral y portada): resumen, preguntas que responde, qué contiene, si usa enfoque
  partidos.ts         colores y nombres                   cargos.ts    los 6 cargos y su unidad de elección
proxy.ts              sesión obligatoria; /usuarios solo super (Next 16: «proxy» reemplaza a middleware y corre en Node)
scripts/crear_superusuarios.ts
```

Patrón de las pantallas: `useEffect` → `api<T>(url)` (`lib/api.ts`) → `useMemo` para derivar. Los cálculos analíticos viven en `lib/` como **funciones puras** y se usan igual en servidor y cliente.

---

## 3. Base de datos (lo que la app lee)

Todas las tablas las genera el pipeline; aquí solo se crea `app_usuario`. Granos y columnas clave:

| Tabla | Una fila por | Notas |
|---|---|---|
| `sec_resumen` (~2.7 M) | elección × sección | `totales_id`, `eleccion`, `anio`, `extraordinaria`, `fuente`, `seccion_id`, `id_estado`, `clave_inegi`, `id_distrito_federal`, `id_distrito_local`, `votos_totales`, `lista_nominal`, `seccion_confiable`, `confianza`, ganador y segundo |
| `sec_votos` (~21.5 M) | `totales_id` × partido | `partido` es un **código smallint**: unir con `app_partido_codigo (codigo → partido)` |
| `agg_est_*`, `agg_mun_*` | elección × entidad / municipio (× partido) | **una sola fuente por estado-año** (la recomendada por la matriz de calidad) |
| `agg_dis_*` | elección × distrito (× partido) | `tipo = 'federal' \| 'local'`; `id_distrito` = `id_estado*100 + n` |
| `app_eleccion` | elección (cargo, año, extraordinaria, fuente) | catálogo de lo disponible, con `confianza` |
| `app_estado`, `app_municipio`, `app_circunscripcion` | | nombres y abreviaturas; circunscripciones por `era` |
| `ln_corte`, `ln_seccion`, `ln_serie_territorio` | corte DERFE (× sección / territorio) | lista nominal y padrón por sexo, 47 cortes 2017-2026 |
| `ln_edad_seccion`, `ln_edad_territorio` | corte × sección / territorio | arreglos `h[]`, `m[]` en el orden de `GRUPOS_EDAD` (18, 19, 20-24 … 60-64, 65+) y `nb`; **solo 8 cortes (2021-2026)** |
| `jud_*` | judicial 2025: candidatura, estado, municipio, sección | votos por **persona**; `lugar` y `pct_ambito` son cálculos, **no la lista oficial de ganadores** |
| `app_sec_tendencia`, `app_tendencia_ref` | sección; país / estado / municipio | precalculado (ver §5.4); se regenera en el pipeline tras recargar `sec_*` |
| `app_usuario` | usuario | ver §6 |

Cada `(eleccion, anio, extraordinaria, fuente)` es **una elección distinta**: la app nunca suma años, cargos ni elecciones ordinarias con extraordinarias.

---

## 4. Lo que hay que saber de los datos (no negociable)

**Llaves.** `seccion_id = id_estado*10000 + sección` (la sección sola no es única entre estados). `id_distrito = id_estado*100 + n`. `clave_inegi = id_estado*1000 + municipio` (INEGI, **no** IFE: coinciden solo en 40-65% de los casos). Nunca cruzar por número de distrito o por código IFE crudos.

**La sección no es una unidad fija.** El INE resecciona cada año: cuando una sección pasa de 3,000 electores desaparece y nace con números nuevos; también hay fusiones y cambios de municipio. `seccion_id` identifica la sección **en ese año**. Al comparar años, una sección que no existe en ambos queda «sin comparación»: avísalo en la interfaz, no lo rellenes. Hubo 1,178 secciones de 2024 que ya no existen en 2026.

**El mapa distrital cambió en 1979, 1997, 2006, 2018 y 2024** (`eraDistrital()` en `lib/analisis.ts`). El mismo `id_distrito` en eras distintas no es la misma geografía: las series por distrito solo usan la era vigente. Los distritos locales son otra distritación: no se cruzan con los federales.

**Partidos y coaliciones.** Siglas en minúsculas; coaliciones unidas con `-` (`pan-pri-prd`, `pvem-pt-morena`); los votos de una coalición van **en su propia fila**, no se reparten. La sigla **`nan` es un partido real** (Nueva Alianza Nayarit): nunca la trates como vacío. `conve` = Convergencia (antecesor de MC). Independientes: `ind1`, `independiente`, o nombres propios.

**Cuatro lecturas de la misma elección.**
- **Candidatura** (`porCandidatura`): cada partido se suma a la coalición más amplia que lo contiene en esa boleta. Es una **inferencia**, no el registro oficial.
- **Boleta**: filas tal cual.
- **Alcance**: partido más las coaliciones que integra (no suma 100%).
- **Bloque** (`porBloque`): agrupación analítica por año. Desde 2021, Morena+PT+PVEM(+PES) | PAN+PRI+PRD | MC; en 2018, las tres coaliciones; hasta 2015, PRI+PVEM+PNA | PAN | izquierda. Los bloques cambian en 2018 y 2021: entre esos años solo se comparan bloques que existan en ambos.

**Votos de otras secciones.** Las casillas especiales (S) reciben votos de personas de otras secciones: la participación puede pasar de 100%. La **sección 0** son residentes en el extranjero o voto anticipado y no es territorio. `seccion_confiable = false` marca secciones no territoriales o fuera del catálogo.

**Cargos locales a nivel nacional.** Cada estado vota en su propio calendario: «nacional» para alcaldes, gubernaturas o diputaciones locales es la suma de los estados que votaron ese año y **no es comparable entre años**. Muéstralo con aviso o pide elegir una entidad.

**Confianza.** Cada elección (y cada `sec_resumen`) trae `confianza`: `alta` (oficial y confirmada por una fuente independiente), `media` (oficial sin segunda fuente), `baja`, `no_usar` o vacío (sin evaluar). **Por decisión del usuario no se exhibe en la interfaz** (`Confianza` en `components/Kpi.tsx` devuelve `null`): úsala para decidir qué mostrar o advertir, no la pintes como etiqueta sin que la pidan. En especial: alcaldes por sección **antes de 2015** vienen de una compilación académica (B. Calderón) con muchos estado-año `baja` o `no_usar`; las diputaciones locales y gubernaturas desde 2015 no se han contrastado con los institutos estatales; diputados federales 2003 tiene una diferencia de 4.4% sin explicar.

**Cortes oficiales.** Las cifras son los cómputos oficiales en su fecha de corte (p. ej. 08/06/2024), **antes** de resoluciones del Tribunal Electoral.

**Elección judicial 2025.** No hay partidos: se vota por personas y cada elector marca varias candidaturas, así que `votos_totales` ≈ personas que votaron × marcas permitidas. Nunca comparar con votos de partidos ni sumar entre cargos. `candidatura_id` identifica a la persona; `no_candidato` se repite entre ámbitos.

**Lista nominal.** Unir siempre al corte **más cercano anterior** a la jornada; para elecciones anteriores a 2021 no hay edad (se usa el primer corte disponible y se avisa que es posterior). Antes de 2017 no hay lista por sección en la base, salvo la de las actas.

**Circunscripciones.** La composición 2024 está verificada; la de 2021 y anteriores no. El Senado se elige por entidad, no por circunscripción.

---

## 5. Lecturas analíticas (definiciones exactas)

Todas se presentan en la interfaz como **lecturas analíticas, no oficiales**, con su método en una nota.

1. **Competitividad general** (`competitividad`): margen entre las dos primeras candidaturas. Bastión ≥ 20, ventaja 10-20, competitiva 5-10, reñida < 5.
2. **Partido de enfoque** (`components/Enfoque.tsx`, `claseEnfoque`): selector global (General · Morena · PAN · PRI · MC), guardado en `localStorage`.
   - Mide la candidatura del partido (sola o en la coalición que lo contiene; MC incluye `conve`) contra la mejor rival.
   - Si gana: bastión, ventaja, competitiva o reñida. Si pierde: reñida (< 5), al alcance (5-10), desventaja (10-20) o adversa (≥ 20). Si no está en la boleta: sin candidatura.
   - Las APIs `unidades`, `distritos` y `secciones` aceptan `&enfoque=` y devuelven `clase`, `margen_enfoque` (+ gana / − pierde) y `p_enfoque`.
   - Todo componente nuevo que muestre competitividad debe respetar el enfoque: usa `clasesDe()`, `ETIQ_CLASE`, `CeldaClase` y `ResumenClases`.
3. **Número efectivo de partidos** = 1 / Σ pᵢ². **Volatilidad de Pedersen** = ½ Σ |Δpᵢ| (por familia partidista).
4. **Tendencia de una sección** (`lib/tendencia.ts`, API `seccion-tendencia`).
   - Se calcula por bloque, comparando la sección con el país (suma de las entidades con esa elección ese año) y con su estado.
   - **Distancia** = ½ Σ |a−b|.
   - **Cambios**: elecciones consecutivas del mismo cargo; solo bloques presentes en ambos años, sin «otros» ni «mixto», y con al menos 3% en alguno de los dos años.
   - **Veredicto**: «sigue» si la correlación con el cambio nacional es ≥ 0.7 y la dirección coincide en ≥ 75% de los casos en que el país se movió 2 puntos o más; «parcial» si es ≥ 0.4; «independiente» en otro caso; «sin datos» con menos de 6 cambios.
   - **Intensidad**: «amplifica» si la pendiente es > 1.2; «amortigua» si es < 0.8.
   - **Concurrentes**: el cargo de referencia del año (presidente > gobernador > diputados federales > senado > diputados locales > alcaldes) contra los demás. «En bloque» si la sección diferencia al menos 2 puntos menos que su estado; «diferenciado» si 2 puntos más.
   - Empates exactos de primera fuerza: gana el nombre de bloque menor.
   - **Invariante**: `lib/tendencia.ts` debe dar exactamente lo mismo que el script del pipeline que llena `app_sec_tendencia` (comprobado: 154 secciones al azar, 16 indicadores idénticos). Si cambias la lógica en uno, cámbiala en el otro y vuelve a comparar.
5. **Piso y techo** (`lib/pisoTecho.ts`).
   - **Piso y techo = menor y mayor número ABSOLUTO de votos** en las elecciones ordinarias del periodo, del cargo en ese territorio. Para comparar partidos y unidades se muestran el **% de los votantes** (votos emitidos) y el **% de la lista nominal** de esas elecciones.
   - **Periodo**: 10 años (opción 20 o todo) contados hacia atrás **desde la última elección con datos de ese cargo en ese territorio**, no desde hoy (inclusive: diputaciones federales = 2015, 2018, 2021, 2024; diputaciones locales de Coahuila = 2017, 2020, 2023). En el cruce por cargos cada cargo usa su propia última elección.
   - **Partidos: solo sus votos propios** (su recuadro). **Nunca** se les suman los de su coalición; si fueron en coalición se marca el año (`coalicion_anios`).
   - **Coaliciones: filas aparte**, una por combinación exacta de partidos (clave con componentes ordenados), con los votos de toda la alianza, solo en las elecciones en que compitió esa combinación. Por eso casi siempre tienen una sola elección.
   - Ausente o con 0 votos no cuenta como piso 0.
   - **Votos posibles hoy**: votantes esperados = lista nominal más reciente × participación histórica del cargo en el territorio (mínima, media, máxima); bajo = menor % de los votantes × votantes mínimos, central = medio × medios, alto = mayor × máximos. Igual para cada coalición. El bloque «Votos posibles» responde en texto para el partido de enfoque (o el primero) y sus coaliciones.
6. **Estrategia por sección** (`EstrategiaSecciones`): bastión, ganada reñida, conquista nueva, perdida, objetivo al alcance o adversa (umbral de 10 puntos), con los votos que faltan para ganar y el potencial por participación. Sigue al partido de enfoque.

---

### Ayudas «?» (comprensión general)

`components/Ayuda.tsx` + `lib/glosario.ts`: icono «?» que explica qué es una medida, cómo se calcula y qué cuidar. Aparece al pasar el cursor, al enfocar con Tab o al tocar en el celular; se dibuja en un portal para que no lo recorten las tablas.
- **Uso:** `<Ayuda clave="participacion" />`, o `<Ayuda titulo="…">contenido con los números de esa fila</Ayuda>` (así se explica «Votos posibles hoy» con la cuenta real de cada partido).
- `Kpi` y las tarjetas `Dato` aceptan `ayuda="clave"`.
- **Toda medida nueva lleva su entrada en el glosario y su «?».** Si cambia un cálculo, cambia su explicación.
- Ya lo tienen: participación, votos emitidos, primera fuerza, margen, número efectivo de partidos, volatilidad, competitividad (general y con enfoque), lecturas (candidatura, boleta, alcance, bloque), piso, techo, rango, votos posibles hoy, con aliados y propios, cambio de ganador, continuidad, frente al país, relación, distancia, concurrentes, edad y sexo, votos para ganar, potencial y el selector de enfoque.

## 6. Usuarios y seguridad

- `app_usuario(usuario, nombre, rol 'super'|'usuario', password_hash, activo, creado_en, creado_por, ultimo_acceso)`. El usuario es el correo, en minúsculas.
- **No hay usuarios fijos en el código.** Los superusuarios viven solo en la base; para saber quiénes son, consulta `/usuarios` o la tabla. No escribas correos ni datos de usuarios en el repositorio (es público).
- Alta o restablecimiento desde la terminal: `bun scripts/crear_superusuarios.ts "correo=Nombre" [--restablecer]`. Imprime una contraseña temporal una vez.
- Contraseñas: **bcryptjs, costo 12** (`lib/password.ts`); mínimo 10 caracteres con letras y números, máximo 72 (límite de bcrypt). No hay otro algoritmo aceptado.
- Sesión: cookie `electoral_sesion` firmada con HMAC-SHA256, 12 h. `proxy.ts` y `sesionVigente()` confirman en la base que el usuario exista y esté **activo**, y toman su **rol actual** (caché 30 s, por instancia): desactivar corta el acceso en menos de un minuto.
- Toda API que administre usuarios usa `soloSuper()`. No se puede desactivar, degradar ni borrar a uno mismo, y siempre queda al menos un superusuario activo.
- El login responde igual (y tarda lo mismo) con usuario inexistente o contraseña errónea.
- Rutas públicas: solo `/login` y `/api/auth/login`. Cualquier ruta nueva queda protegida por `proxy.ts`; si expone datos de usuarios, debe verificar el rol en el handler.

---

## 7. Diseño

- Marca **Arg.Os · Electoral** (`components/ArgosLogo.tsx`). Neutros pizarra + rosa `#D81B60` y azul `#0E71AF`. **Sin verdes fuera del logotipo**.
- Colores de partido en `lib/partidos.ts`; de bloque en `BLOQUES`.
- Modo claro y oscuro: usa las variables CSS (`--fg`, `--fg-mute`, `--line`, `--card-solid`, `--azul`, `--rose`…), no colores fijos de texto.
- Clases utilitarias propias: `material`, `chip`, `seg`, `btn`, `field`, `t` (tablas), `label`.
- Tipografías: Plus Jakarta Sans y Outfit.
- Debe funcionar desde 500 px de ancho. Cada gráfico o lectura nueva lleva su nota de método y sus límites en texto pequeño (`text-xs`, `--fg-mute`).

---

## 8. Cifras de verificación (para probar que nada se rompió)

| Comprobación | Valor esperado |
|---|---|
| Presidencia 2024, nacional | 60,115,184 votos totales; participación 61.0% |
| Diputaciones federales 2024, distritos ganados | 256 Morena y aliados · 42 PAN-PRI-PRD (o PAN solo) · 1 MC (Jalisco 2) · 1 independiente (Michoacán 9) |
| Mismo caso con enfoque | Morena 256 ganados, PAN 42, MC 1 (bastión + ventaja + competitiva + reñida gana) |
| Distritos federales | suman exactamente el total del estado en 2018 y 2024 |
| Tendencia nacional | 72,895 secciones: 15,506 sigue · 40,836 parcial · 13,623 independiente · 2,930 sin datos; correlación mediana 0.57 con el país y 0.72 con el estado |
| Sección 50338 (Coahuila) | tendencia «parcial»; piso y techo de presidencia (votos propios): Morena 358 (2018) a 500 (2024), votos posibles 466-500; diputaciones federales 2015-2024: PRI 236 a 456 |
| Judicial 2025 | votos por candidatura en `jud_candidatura` = 486,063,196 |

---

## 9. Reglas de trabajo

1. **Verifica antes de afirmar.** Una cifra nueva se contrasta con una fuente independiente o con las de §8. Dos fuentes que coinciden al 100% suelen ser la misma fuente.
2. **Reporta lo que no verificaste** (p. ej. «no lo revisé en el navegador»).
3. **No inventes datos para rellenar huecos**: lo desconocido es vacío, nunca 0. Si falta un año, una sección o una edad, la interfaz lo dice.
4. Distingue siempre resultado oficial de lectura analítica.
5. Antes de cambiar una consulta, revisa el grano de la tabla (§3). Antes de sumar, verifica que no mezclas fuentes, años, cargos ni extraordinarias.
6. Al leer CSV del pipeline con pandas: `keep_default_na=False, na_values=[""]` (la sigla `nan`).
7. Al terminar un cambio: `bunx tsc --noEmit`, prueba la API con datos reales y actualiza este documento si cambian rutas, tablas, definiciones o cifras.
8. Sin secretos en código, commits ni documentos.

## 10. Limitaciones y pendientes

- No hay polígonos de municipios, distritos ni secciones (solo estados): no hay mapas por sección.
- Lista nominal con edad solo en 8 cortes (2021-2026); sin edad antes de 2021; sin lista por sección antes de 2017.
- Sin resultados posteriores al Tribunal Electoral (2018, 2021, 2024).
- Locales por sección solo desde 2015 (alcaldes desde 1994, con salvedades de calidad).
- Composición de circunscripciones ≤ 2021 sin verificar.
- Tipos de casilla `P`, `M`, `V` del INE sin descripción oficial (sus secciones ficticias van como no territoriales).
- La caché de vigencia de usuarios es por proceso: con varias instancias, el corte de una sesión puede tardar hasta 30 s por instancia.
