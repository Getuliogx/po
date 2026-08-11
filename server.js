const express = require("express");

const app = express();

const TMDB_KEY = process.env.TMDB_KEY;

// No Render:
// CANAIS_PERMITIDOS=seucanal,outrocanal,maisumcanal
const CANAIS_PERMITIDOS = process.env.CANAIS_PERMITIDOS || "";

// No Render:
// CHECK_CENSURA=true
const CHECK_CENSURA = String(process.env.CHECK_CENSURA || "true").toLowerCase() === "true";

const PRECO_FILME_POR_MINUTO = 0.45;
const PRECO_SERIE_POR_MINUTO = 0.40;

app.get("/", (req, res) => {
  res.send("API TMDB cálculo online.");
});

function formatarReal(valor) {
  return valor.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

function limparTitulo(texto) {
  return String(texto || "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizarTexto(texto) {
  return String(texto || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&amp;/g, "and")
    .replace(/&quot;/g, "")
    .replace(/&#39;/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizarCanal(texto) {
  return String(texto || "")
    .toLowerCase()
    .replace(/^@/, "")
    .trim();
}

function pegarCanaisPermitidos() {
  return CANAIS_PERMITIDOS
    .split(",")
    .map(canal => normalizarCanal(canal))
    .filter(Boolean);
}

function canalEstaPermitido(canalRecebido) {
  const canal = normalizarCanal(canalRecebido);
  const permitidos = pegarCanaisPermitidos();

  if (permitidos.length === 0) {
    return {
      ok: false,
      erro: "Erro: CANAIS_PERMITIDOS não configurado no Render."
    };
  }

  if (!canal) {
    return {
      ok: false,
      erro: "Erro: canal não informado."
    };
  }

  if (!permitidos.includes(canal)) {
    return {
      ok: false,
      erro: "Este comando não está liberado para este canal."
    };
  }

  return {
    ok: true,
    erro: ""
  };
}

function detectarTipoEntrada(texto) {
  const entrada = limparTitulo(texto);

  const regras = [
    { tipo: "coletanea", regex: /^(?:colet[aâ]nea|cole[cç][aã]o|saga|franquia)\s+(.+)$/i },
    { tipo: "filme", regex: /^filmes?\s+(.+)$/i },
    { tipo: "serie", regex: /^(?:s[eé]ries?|seriados?)\s+(.+)$/i },
    { tipo: "anime", regex: /^animes?\s+(.+)$/i },
    { tipo: "desenho", regex: /^desenhos?\s+(.+)$/i }
  ];

  for (const regra of regras) {
    const match = entrada.match(regra.regex);

    if (match) {
      return {
        tipo: regra.tipo,
        titulo: limparTitulo(match[1])
      };
    }
  }

  return {
    tipo: "auto",
    titulo: entrada
  };
}

function tipoEhSerie(tipo) {
  return ["serie", "anime", "desenho"].includes(tipo);
}

function tirarTemporadaExplicitaDoFim(titulo) {
  const match = titulo.match(/^(.*?)\s+(?:t|s|temp|temporada)\s*\.?\s*(\d{1,3})$/i);

  if (!match) {
    return { titulo, temporada: null };
  }

  return {
    titulo: limparTitulo(match[1]),
    temporada: Number(match[2])
  };
}

function tirarAnoDoFim(titulo) {
  const match = titulo.match(/^(.*?)\s+\(?((?:18|19|20|21)\d{2})\)?$/);

  if (!match) {
    return { titulo, ano: null };
  }

  return {
    titulo: limparTitulo(match[1]),
    ano: Number(match[2])
  };
}

function separarTituloAnoETemporada(texto, tipo = "auto") {
  let titulo = limparTitulo(texto);
  let ano = null;
  let temporada = null;

  // Aceita os dois formatos:
  // "perdidos no espaço 2018 T1" e "perdidos no espaço T1 2018".
  for (let i = 0; i < 2; i++) {
    if (temporada === null) {
      const tirouTemporada = tirarTemporadaExplicitaDoFim(titulo);

      if (tirouTemporada.temporada !== null) {
        titulo = tirouTemporada.titulo;
        temporada = tirouTemporada.temporada;
        continue;
      }
    }

    if (ano === null) {
      const tirouAno = tirarAnoDoFim(titulo);

      if (tirouAno.ano !== null) {
        titulo = tirouAno.titulo;
        ano = tirouAno.ano;
        continue;
      }
    }

    break;
  }

  // Só trata número final como temporada quando o usuário deixou claro que é série/anime/desenho.
  // Isso corrige filmes com número no nome, tipo "Premonição 2" e "Gente Grande 2".
  if (temporada === null && tipoEhSerie(tipo)) {
    const matchTemporadaAntiga = titulo.match(/^(.*?)\s+(\d{1,3})$/);

    if (matchTemporadaAntiga) {
      titulo = limparTitulo(matchTemporadaAntiga[1]);
      temporada = Number(matchTemporadaAntiga[2]);
    }
  }

  return {
    titulo,
    ano,
    temporada
  };
}


function separarTituloAnoTemporadaEEpisodios(texto, tipo = "auto") {
  let { titulo, ano, temporada } = separarTituloAnoETemporada(texto, tipo);
  let epInicio = null, epFim = null;
  const m = titulo.match(/^(.*?)\s+ep\s*(\d+)(?:\s*(?:ao|a|ate|até|-)\s*(\d+))?$/i);
  if (m){titulo=limparTitulo(m[1]); epInicio=Number(m[2]); epFim=m[3]?Number(m[3]):epInicio;}
  return {titulo,ano,temporada,epInicio,epFim};
}

function separarColetaneaEFaixa(texto) {
  let titulo = limparTitulo(texto);
  let inicio = 1;
  let fim = null;
  let descricaoFaixa = "completa";

  const matchFaixa = titulo.match(/^(.*?)\s+(\d{1,2})\s*(?:ao|a|ate|até|-)\s*(\d{1,2})$/i);

  if (matchFaixa) {
    titulo = limparTitulo(matchFaixa[1]);
    inicio = Number(matchFaixa[2]);
    fim = Number(matchFaixa[3]);
    descricaoFaixa = `${inicio} ao ${fim}`;
  } else {
    const matchPrimeiros = titulo.match(/^(.*?)\s+(?:primeiros?\s+)?(\d{1,2})\s+filmes?$/i);

    if (matchPrimeiros) {
      titulo = limparTitulo(matchPrimeiros[1]);
      fim = Number(matchPrimeiros[2]);
      descricaoFaixa = `1 ao ${fim}`;
    }
  }

  if (fim !== null && fim < inicio) {
    const temp = inicio;
    inicio = fim;
    fim = temp;
    descricaoFaixa = `${inicio} ao ${fim}`;
  }

  return { titulo, inicio, fim, descricaoFaixa };
}

function anoDoFilme(item) {
  return item && item.release_date ? String(item.release_date).slice(0, 4) : "";
}

function anoDaSerie(item) {
  return item && item.first_air_date ? String(item.first_air_date).slice(0, 4) : "";
}

function escolherResultadoPorAno(resultados, ano, pegarAno) {
  if (!Array.isArray(resultados) || resultados.length === 0) {
    return null;
  }

  if (!ano) {
    return resultados[0];
  }

  const anoTexto = String(ano);
  return resultados.find(item => pegarAno(item) === anoTexto) || null;
}

async function tmdbGet(url) {
  const resp = await fetch(url);

  if (!resp.ok) {
    throw new Error(`Erro TMDB HTTP ${resp.status}`);
  }

  return resp.json();
}

function montarUrlsCensura(titulo) {
  const q = encodeURIComponent(titulo);

  return [
    {
      nome: "cma",
      url: `https://www.celebritymoviearchive.com/tour/search-full.php?searchstring=${q}`
    },
    {
      nome: "aznude",
      url: `https://www.aznude.com/search/?q=${q}`
    },
    {
      nome: "mrskin",
      url: `https://www.mrskin.com/search?search=${q}`
    }
  ];
}

function paginaPareceSemResultado(html) {
  const texto = normalizarTexto(html);

  const frasesSemResultado = [
    "no results",
    "no result",
    "nothing found",
    "no matches",
    "your search did not match",
    "0 results",
    "zero results",
    "nenhum resultado",
    "sem resultados",
    "sorry no",
    "search returned no",
    "we could not find",
    "did not return any results"
  ];

  return frasesSemResultado.some(frase => texto.includes(frase));
}

function removerTagsHtml(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function criarSlug(texto) {
  return normalizarTexto(texto)
    .replace(/\s+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function extrairLinks(html) {
  const links = [];
  const regex = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;

  let match;

  while ((match = regex.exec(html)) !== null) {
    const href = String(match[1] || "");
    const texto = removerTagsHtml(match[2] || "");

    links.push({
      href,
      texto
    });
  }

  return links;
}

function linkPareceResultadoReal(link) {
  const href = String(link.href || "").toLowerCase();
  const texto = normalizarTexto(link.texto || "");

  if (!href) return false;

  const bloqueados = [
    "login",
    "signup",
    "join",
    "privacy",
    "terms",
    "contact",
    "password",
    "account",
    "javascript:",
    "#",
    "billing",
    "support",
    "help",
    "faq",
    "members",
    "subscribe",
    "register",
    "forgot",
    "logout",
    "about",
    "advertise"
  ];

  if (bloqueados.some(item => href.includes(item))) {
    return false;
  }

  if (!texto || texto.length < 2) {
    return false;
  }

  return true;
}

function tituloBateNoTexto(texto, titulo) {
  const textoNormal = normalizarTexto(texto);
  const tituloNormal = normalizarTexto(titulo);
  const slugTitulo = criarSlug(titulo);

  if (!textoNormal || !tituloNormal || tituloNormal.length < 3) {
    return false;
  }

  if (textoNormal.includes(tituloNormal)) {
    return true;
  }

  const textoComoSlug = textoNormal.replace(/\s+/g, "-");

  if (slugTitulo && textoComoSlug.includes(slugTitulo)) {
    return true;
  }

  return false;
}

function tituloPareceNosResultados(html, titulo) {
  const tituloNormal = normalizarTexto(titulo);

  if (!tituloNormal || tituloNormal.length < 3) {
    return false;
  }

  const links = extrairLinks(html).filter(linkPareceResultadoReal);

  for (const link of links) {
    const href = String(link.href || "");
    const texto = String(link.texto || "");

    if (tituloBateNoTexto(texto, titulo)) {
      return true;
    }

    if (tituloBateNoTexto(href, titulo)) {
      return true;
    }
  }

  return false;
}

async function fetchComTimeout(url, timeoutMs = 6500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const resp = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9,pt-BR;q=0.8,pt;q=0.7"
      }
    });

    if (!resp.ok) {
      return "";
    }

    return await resp.text();
  } catch (err) {
    return "";
  } finally {
    clearTimeout(timer);
  }
}


// -----------------------------------------------------------------------------
// AZNUDE - GUIA POR EPISÓDIO
//
// O StreamElements encerra $(customapi)/$(urlfetch) após 15 segundos. Por isso
// esta rotina foi feita para não transformar o comando em uma sequência longa
// de proxies/páginas. A busca do AZNude começa em paralelo com o TMDB, usa cache
// e tem um limite total próprio. O HTML atual da página da série já contém os
// títulos "Season X Episode Y" mesmo sem clicar no botão "By Episode".
// -----------------------------------------------------------------------------
const CACHE_AZNUDE_PAGINA = new Map();
const CACHE_AZNUDE_EPS = new Map();
const AZNUDE_CACHE_OK_MS = 12 * 60 * 60 * 1000;
const AZNUDE_CACHE_MISS_MS = 3 * 60 * 1000;

// Atalhos confirmados no guia atual do AZNude. Eles eliminam uma consulta de
// descoberta para séries muito usadas. Se a URL mudar, a descoberta normal
// continua existindo para os demais títulos.
const AZNUDE_SERIES_SEEDS = new Map([
  ["elite", "https://www.aznude.com/view/movie/e/elite-4021272.html"],
  ["euphoria", "https://www.aznude.com/view/movie/e/euphoria-4020873.html"],
  ["shameless", "https://www.aznude.com/view/movie/s/shameless-36966.html"],
  ["fake profile", "https://www.aznude.com/view/movie/f/fakeprofile-4021012.html"],
  ["high school on sex", "https://www.aznude.com/view/movie/h/highschoolonsex-4029238.html"],
  ["the boys", "https://www.aznude.com/view/movie/t/theboys-4021131.html"],
  ["game of thrones", "https://www.aznude.com/view/movie/g/gameofthrones-4021111.html"],
  ["squid game", "https://www.aznude.com/view/movie/s/squidgame-4021092.html"],
  ["the white lotus", "https://www.aznude.com/view/movie/t/thewhitelotus-4022602.html"],
  ["la casa de papel", "https://www.aznude.com/view/movie/l/lacasadepapel.html"],
  ["spartacus", "https://www.aznude.com/view/movie/s/spartacus-4021779.html"],
  ["sex education", "https://www.aznude.com/view/movie/s/sexeducation-4021205.html"]
]);

function promessaComLimite(promessa, ms, valorPadrao) {
  return Promise.race([
    promessa.catch(() => valorPadrao),
    new Promise(resolve => setTimeout(() => resolve(valorPadrao), ms))
  ]);
}

async function fetchTextoCensura(url, timeoutMs = 4300) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9,pt-BR;q=0.8,pt;q=0.7",
        "Cache-Control": "no-cache"
      }
    });
    if (!resp.ok) return "";
    return await resp.text();
  } catch (_) {
    return "";
  } finally {
    clearTimeout(timer);
  }
}

async function fetchTextoJina(url, timeoutMs = 8000) {
  // É fallback, não é a rota principal. Começa junto com o acesso direto à
  // página final para não somar 8s depois de outra espera.
  return fetchTextoCensura(`https://r.jina.ai/${url}`, timeoutMs);
}

function decodificarHtmlBasico(texto) {
  return String(texto || "")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function slugTituloAZNude(url) {
  try {
    return normalizarTexto(
      decodeURIComponent(new URL(url).pathname.split("/").pop() || "")
        .replace(/\.html$/i, "")
        .replace(/-\d{4,}$/i, "")
        .replace(/[-_]+/g, " ")
    );
  } catch (_) {
    return "";
  }
}

function candidatosAZNudeDoHtml(html) {
  const candidatos = [];
  const vistos = new Set();
  const re = /<a\b[^>]*href=["']([^"']*\/view\/movie\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(String(html || ""))) !== null) {
    let url;
    try {
      url = new URL(decodificarHtmlBasico(m[1]), "https://www.aznude.com/").toString();
      const host = new URL(url).hostname.replace(/^www\./i, "").toLowerCase();
      if (host !== "aznude.com") continue;
    } catch (_) {
      continue;
    }
    if (vistos.has(url)) continue;
    vistos.add(url);
    candidatos.push({
      url,
      slug: slugTituloAZNude(url),
      texto: normalizarTexto(removerTagsHtml(decodificarHtmlBasico(m[2])))
    });
  }

  // O Reader devolve Markdown: [texto](https://.../view/movie/...html)
  const md = /\[([^\]]{1,250})\]\((https?:\/\/[^\s)]+\/view\/movie\/[^\s)]+)\)/gi;
  while ((m = md.exec(String(html || ""))) !== null) {
    const url = decodificarHtmlBasico(m[2]);
    if (vistos.has(url)) continue;
    vistos.add(url);
    candidatos.push({ url, slug: slugTituloAZNude(url), texto: normalizarTexto(m[1]) });
  }
  return candidatos;
}

function acharPaginaAZNudeNosResultados(html, titulos) {
  const alvos = removerTitulosDuplicados(titulos).map(normalizarTexto).filter(Boolean);
  const candidatos = candidatosAZNudeDoHtml(html);

  for (const alvo of alvos) {
    const exato = candidatos.find(c => c.slug === alvo);
    if (exato) return exato.url;
  }
  for (const alvo of alvos) {
    const porTexto = candidatos.find(c => c.texto === alvo || c.texto.includes(` ${alvo} `) || c.texto.startsWith(alvo + " "));
    if (porTexto) return porTexto.url;
  }
  return "";
}

async function descobrirPaginaAZNude(titulos) {
  const lista = removerTitulosDuplicados(titulos);
  const chaves = lista.map(normalizarTexto).filter(Boolean);
  const agora = Date.now();

  for (const chave of chaves) {
    const seed = AZNUDE_SERIES_SEEDS.get(chave);
    if (seed) return seed;
    const c = CACHE_AZNUDE_PAGINA.get(chave);
    if (c && c.expira > agora) return c.url;
  }

  const urls = ["https://www.aznude.com/browse/movies/guide/1.html"];
  for (const titulo of lista.slice(0, 3)) {
    const q = encodeURIComponent(titulo);
    urls.push(`https://www.aznude.com/search/?q=${q}`);
    urls.push(`https://www.aznude.com/search?q=${q}`);
  }

  const tarefas = urls.map(url => (async () => {
    const html = await fetchTextoCensura(url, 3600);
    const achou = acharPaginaAZNudeNosResultados(html, lista);
    if (!achou) throw new Error("sem resultado");
    return achou;
  })());

  let pagina = "";
  try {
    pagina = await promessaComLimite(Promise.any(tarefas), 3900, "");
  } catch (_) {
    pagina = "";
  }

  // Um único fallback Reader na busca principal, limitado. Não fazemos varredura
  // A-Z nem dezenas de páginas dentro do comando da Twitch.
  if (!pagina && lista[0]) {
    const q = encodeURIComponent(lista[0]);
    const busca = `https://www.aznude.com/search/?q=${q}`;
    const html = await promessaComLimite(fetchTextoJina(busca, 6500), 6700, "");
    pagina = acharPaginaAZNudeNosResultados(html, lista);
  }

  const expira = Date.now() + (pagina ? AZNUDE_CACHE_OK_MS : AZNUDE_CACHE_MISS_MS);
  for (const chave of chaves) CACHE_AZNUDE_PAGINA.set(chave, { url: pagina, expira });
  return pagina;
}

function extrairMapaEpisodiosAZNude(texto) {
  const mapa = new Map();
  const base = decodificarHtmlBasico(removerTagsHtml(String(texto || "")))
    .replace(/[*_#`]+/g, " ")
    .replace(/\s+/g, " ");

  const padroes = [
    /\bSeason\s*0*(\d{1,3})\s*Episode\s*0*(\d{1,4})\b/gi,
    /\bS0*(\d{1,3})\s*E0*(\d{1,4})\b/gi
  ];
  for (const re of padroes) {
    let m;
    while ((m = re.exec(base)) !== null) {
      const t = Number(m[1]);
      const e = Number(m[2]);
      if (!Number.isInteger(t) || !Number.isInteger(e)) continue;
      if (!mapa.has(t)) mapa.set(t, new Set());
      mapa.get(t).add(e);
    }
  }
  return mapa;
}

function mapaAZNudeTemDados(mapa) {
  return mapa instanceof Map && [...mapa.values()].some(set => set && set.size);
}

async function carregarEpisodiosPaginaAZNude(url) {
  const agora = Date.now();
  const cache = CACHE_AZNUDE_EPS.get(url);
  if (cache && cache.expira > agora) return cache.mapa;

  // Direto e Reader em paralelo. O primeiro que realmente contiver "Season X
  // Episode Y" vence; não esperamos um e só depois iniciamos o outro.
  const fontes = [
    fetchTextoCensura(url, 4500),
    fetchTextoJina(url, 8200)
  ].map(p => p.then(texto => {
    const mapa = extrairMapaEpisodiosAZNude(texto);
    if (!mapaAZNudeTemDados(mapa)) throw new Error("sem episódios");
    return mapa;
  }));

  let mapa = new Map();
  try {
    mapa = await promessaComLimite(Promise.any(fontes), 8500, new Map());
  } catch (_) {
    mapa = new Map();
  }

  CACHE_AZNUDE_EPS.set(url, {
    mapa,
    expira: Date.now() + (mapaAZNudeTemDados(mapa) ? AZNUDE_CACHE_OK_MS : AZNUDE_CACHE_MISS_MS)
  });
  return mapa;
}

function filtrarEpisodiosCensura(mapa, temporada, epInicio, epFim) {
  const set = mapa instanceof Map ? mapa.get(Number(temporada)) : null;
  let lista = set ? [...set].sort((a,b) => a-b) : [];
  if (epInicio === null || epInicio === undefined) return lista;
  const a = Number(epInicio);
  const b = epFim === null || epFim === undefined ? a : Number(epFim);
  const min = Math.min(a,b), max = Math.max(a,b);
  return lista.filter(ep => ep >= min && ep <= max);
}

async function buscarCensuraPorEpisodioAZNude(titulos, temporada, epInicio, epFim) {
  if (!CHECK_CENSURA) return { episodios: [], pagina: "", status: "desativado" };
  const pagina = await descobrirPaginaAZNude(titulos);
  if (!pagina) return { episodios: [], pagina: "", status: "pagina-nao-encontrada" };
  const mapa = await carregarEpisodiosPaginaAZNude(pagina);
  const episodios = filtrarEpisodiosCensura(mapa, temporada, epInicio, epFim);
  return { episodios, pagina, status: mapaAZNudeTemDados(mapa) ? "ok" : "guia-nao-lido" };
}

function adicionarAvisoCensuraEpisodios(resposta, episodios) {
  const lista = [...new Set((episodios || []).map(Number).filter(Number.isFinite))].sort((a,b) => a-b);
  if (!lista.length) return resposta;
  return resposta + ` Possível censura verificar: ep ${lista.join(", ")}.`;
}

function removerTitulosDuplicados(titulos) {
  const vistos = new Set();
  const lista = [];

  for (const titulo of titulos) {
    const limpo = limparTitulo(titulo);
    const chave = normalizarTexto(limpo);

    if (!limpo || !chave || vistos.has(chave)) {
      continue;
    }

    vistos.add(chave);
    lista.push(limpo);
  }

  return lista;
}

async function verificarPossivelCensuraPorTitulos(titulos) {
  if (!CHECK_CENSURA) {
    return false;
  }

  const listaTitulos = removerTitulosDuplicados(titulos);

  for (const titulo of listaTitulos) {
    const buscas = montarUrlsCensura(titulo);

    for (const busca of buscas) {
      const html = await fetchComTimeout(busca.url);

      if (!html) {
        continue;
      }

      if (paginaPareceSemResultado(html)) {
        continue;
      }

      if (tituloPareceNosResultados(html, titulo)) {
        return true;
      }
    }
  }

  return false;
}

function adicionarAvisoCensura(resposta, possivelCensura) {
  if (possivelCensura) {
    return resposta + " Possível censura: verificar.";
  }

  return resposta;
}

function deduplicarPorId(lista) {
  const vistos = new Set();
  const saida = [];

  for (const item of lista || []) {
    if (!item || !item.id || vistos.has(item.id)) {
      continue;
    }

    vistos.add(item.id);
    saida.push(item);
  }

  return saida;
}

function pontuarResultadoFilme(item, titulo) {
  const alvo = normalizarTexto(titulo);
  const nomes = [item.title, item.original_title]
    .map(normalizarTexto)
    .filter(Boolean);

  let pontos = Number(item.popularity || 0);

  for (const nome of nomes) {
    if (nome === alvo) pontos += 1000;
    if (nome.includes(alvo) || alvo.includes(nome)) pontos += 250;
  }

  return pontos;
}

function escolherMelhorFilme(resultados, titulo, ano) {
  const porAno = ano ? resultados.filter(item => anoDoFilme(item) === String(ano)) : resultados;
  const base = porAno.length > 0 ? porAno : resultados;

  return [...base].sort((a, b) => pontuarResultadoFilme(b, titulo) - pontuarResultadoFilme(a, titulo))[0] || null;
}

async function buscarFilmePorTitulo(titulo, ano) {
  const urls = [
    "https://api.themoviedb.org/3/search/movie" +
      `?api_key=${encodeURIComponent(TMDB_KEY)}` +
      `&language=pt-BR` +
      `&query=${encodeURIComponent(titulo)}` +
      `&include_adult=false` +
      (ano ? `&primary_release_year=${encodeURIComponent(ano)}` : ""),
    "https://api.themoviedb.org/3/search/movie" +
      `?api_key=${encodeURIComponent(TMDB_KEY)}` +
      `&language=pt-BR` +
      `&query=${encodeURIComponent(titulo)}` +
      `&include_adult=false`,
    "https://api.themoviedb.org/3/search/movie" +
      `?api_key=${encodeURIComponent(TMDB_KEY)}` +
      `&language=en-US` +
      `&query=${encodeURIComponent(titulo)}` +
      `&include_adult=false` +
      (ano ? `&primary_release_year=${encodeURIComponent(ano)}` : "")
  ];

  const buscas = await Promise.all(urls.map(url => tmdbGet(url)));
  const resultados = buscas.flatMap(busca => busca.results || []);

  return escolherMelhorFilme(deduplicarPorId(resultados), titulo, ano);
}

function pontuarResultadoSerie(item, titulo) {
  const alvo = normalizarTexto(titulo);
  const nomes = [item.name, item.original_name]
    .map(normalizarTexto)
    .filter(Boolean);

  let pontos = Number(item.popularity || 0);

  for (const nome of nomes) {
    if (nome === alvo) pontos += 1000;
    if (nome.includes(alvo) || alvo.includes(nome)) pontos += 250;
  }

  return pontos;
}

function escolherMelhorSerie(resultados, titulo, ano) {
  const porAno = ano ? resultados.filter(item => anoDaSerie(item) === String(ano)) : resultados;
  const base = porAno.length > 0 ? porAno : resultados;

  return [...base].sort((a, b) => pontuarResultadoSerie(b, titulo) - pontuarResultadoSerie(a, titulo))[0] || null;
}

async function buscarSeriePorTitulo(titulo, ano) {
  const urls = [
    "https://api.themoviedb.org/3/search/tv" +
      `?api_key=${encodeURIComponent(TMDB_KEY)}` +
      `&language=pt-BR` +
      `&query=${encodeURIComponent(titulo)}` +
      `&include_adult=false` +
      (ano ? `&first_air_date_year=${encodeURIComponent(ano)}` : ""),
    "https://api.themoviedb.org/3/search/tv" +
      `?api_key=${encodeURIComponent(TMDB_KEY)}` +
      `&language=pt-BR` +
      `&query=${encodeURIComponent(titulo)}` +
      `&include_adult=false`,
    "https://api.themoviedb.org/3/search/tv" +
      `?api_key=${encodeURIComponent(TMDB_KEY)}` +
      `&language=en-US` +
      `&query=${encodeURIComponent(titulo)}` +
      `&include_adult=false` +
      (ano ? `&first_air_date_year=${encodeURIComponent(ano)}` : "")
  ];

  const buscas = await Promise.all(urls.map(url => tmdbGet(url)));
  const resultados = buscas.flatMap(busca => busca.results || []);

  return escolherMelhorSerie(deduplicarPorId(resultados), titulo, ano);
}

function pontuarColecao(item, titulo) {
  const alvo = normalizarTexto(titulo);
  const nome = normalizarTexto(item.name);

  let pontos = 0;

  if (nome === alvo) pontos += 1000;
  if (nome === `${alvo} collection`) pontos += 1000;
  if (nome.includes(alvo)) pontos += 500;
  if (alvo.includes(nome)) pontos += 200;

  return pontos;
}

function escolherMelhorColecao(resultados, titulo) {
  return [...(resultados || [])]
    .sort((a, b) => pontuarColecao(b, titulo) - pontuarColecao(a, titulo))[0] || null;
}

async function buscarColecaoPorTitulo(titulo) {
  const buscaColecaoUrl =
    "https://api.themoviedb.org/3/search/collection" +
    `?api_key=${encodeURIComponent(TMDB_KEY)}` +
    `&language=pt-BR` +
    `&query=${encodeURIComponent(titulo)}`;

  const buscaColecao = await tmdbGet(buscaColecaoUrl);
  let colecao = escolherMelhorColecao(buscaColecao.results || [], titulo);

  if (!colecao) {
    const filme = await buscarFilmePorTitulo(titulo, null);

    if (filme) {
      const detalhesFilmeUrl =
        `https://api.themoviedb.org/3/movie/${filme.id}` +
        `?api_key=${encodeURIComponent(TMDB_KEY)}` +
        `&language=pt-BR`;
      const detalhesFilme = await tmdbGet(detalhesFilmeUrl);
      colecao = detalhesFilme.belongs_to_collection || null;
    }
  }

  if (!colecao || !colecao.id) {
    return null;
  }

  const detalhesColecaoUrl =
    `https://api.themoviedb.org/3/collection/${colecao.id}` +
    `?api_key=${encodeURIComponent(TMDB_KEY)}` +
    `&language=pt-BR`;

  return tmdbGet(detalhesColecaoUrl);
}

function ordenarPartesDaColecao(partes) {
  return [...(partes || [])]
    .filter(item => item && item.id)
    .sort((a, b) => {
      const dataA = a.release_date || "9999-99-99";
      const dataB = b.release_date || "9999-99-99";

      if (dataA === dataB) {
        return String(a.title || a.original_title || "").localeCompare(String(b.title || b.original_title || ""));
      }

      return dataA.localeCompare(dataB);
    });
}

function selecionarPartesPorFaixa(partes, inicio, fim) {
  const começo = Math.max(1, Number(inicio || 1));
  const final = fim === null ? partes.length : Math.min(partes.length, Number(fim));

  return partes.slice(começo - 1, final);
}

function formatarListaCurta(lista, limite = 5) {
  const limpa = lista.map(limparTitulo).filter(Boolean);

  if (limpa.length <= limite) {
    return limpa.join(", ");
  }

  return limpa.slice(0, limite).join(", ") + ` +${limpa.length - limite}`;
}

async function responderColetanea(entradaColetanea) {
  const { titulo, inicio, fim, descricaoFaixa } = separarColetaneaEFaixa(entradaColetanea);

  if (!titulo) {
    return "Use assim: !calculo coletanea nome da saga ou !calculo coletanea nome da saga 2 ao 5";
  }

  const colecao = await buscarColecaoPorTitulo(titulo);

  if (!colecao || !Array.isArray(colecao.parts) || colecao.parts.length === 0) {
    return `Não achei a coletânea "${titulo}" no TMDB.`;
  }

  const partesOrdenadas = ordenarPartesDaColecao(colecao.parts);
  const partesSelecionadas = selecionarPartesPorFaixa(partesOrdenadas, inicio, fim);

  if (partesSelecionadas.length === 0) {
    return `Achei "${colecao.name}", mas não achei filmes nessa faixa.`;
  }

  let totalMinutos = 0;
  let filmesComDuracao = 0;
  let filmesSemDuracao = 0;
  const nomesFilmes = [];
  const titulosParaCensura = [colecao.name, titulo];

  for (const parte of partesSelecionadas) {
    const detalhesUrl =
      `https://api.themoviedb.org/3/movie/${parte.id}` +
      `?api_key=${encodeURIComponent(TMDB_KEY)}` +
      `&language=pt-BR`;
    const detalhes = await tmdbGet(detalhesUrl);
    const nome = detalhes.title || parte.title || parte.original_title;

    nomesFilmes.push(nome);
    titulosParaCensura.push(detalhes.original_title, parte.original_title, detalhes.title, parte.title);

    if (detalhes.runtime && detalhes.runtime > 0) {
      totalMinutos += detalhes.runtime;
      filmesComDuracao++;
    } else {
      filmesSemDuracao++;
    }
  }

  if (totalMinutos <= 0) {
    return `Achei "${colecao.name}", mas o TMDB não tem minutagem cadastrada para os filmes selecionados.`;
  }

  const valor = totalMinutos * PRECO_FILME_POR_MINUTO;
  const valorBR = formatarReal(valor);
  const faixaTexto = descricaoFaixa === "completa" ? "completa" : descricaoFaixa;

  let resposta =
    `🎬 Coletânea ${colecao.name} (${faixaTexto}): ` +
    `${filmesComDuracao} filme(s), ${totalMinutos} minutos no total. ` +
    `Valor: ${valorBR} / ` +
    `Filmes: ${formatarListaCurta(nomesFilmes)}.`;

  if (filmesSemDuracao > 0) {
    resposta += ` Obs: ${filmesSemDuracao} filme(s) sem minutagem no TMDB.`;
  }

  const possivelCensura = await verificarPossivelCensuraPorTitulos(titulosParaCensura);
  return adicionarAvisoCensura(resposta, possivelCensura);
}

async function responderSerie(titulo, ano, temporada, epInicio, epFim, tipo) {
  if (temporada === null) {
    return `Informe a temporada. Exemplo: !calculo ${tipo === "auto" ? "serie " : tipo + " "}${titulo} 1`;
  }

  // Começa o AZNude ANTES de esperar as consultas do TMDB. Isso é importante
  // para ficar dentro dos 15s do StreamElements.
  const inicioCensura = Date.now();
  const censuraEmParalelo = buscarCensuraPorEpisodioAZNude([titulo], temporada, epInicio, epFim);

  const serie = await buscarSeriePorTitulo(titulo, ano);
  if (!serie) {
    return `Não achei a série/anime/desenho "${titulo}"${ano ? ` de ${ano}` : ""} no TMDB.`;
  }

  const temporadaUrl =
    `https://api.themoviedb.org/3/tv/${serie.id}/season/${temporada}` +
    `?api_key=${encodeURIComponent(TMDB_KEY)}` +
    `&language=pt-BR`;
  const dadosTemporada = await tmdbGet(temporadaUrl);

  if (!dadosTemporada.episodes || dadosTemporada.episodes.length === 0) {
    return `Achei "${serie.name}", mas não achei a temporada ${temporada}.`;
  }

  let episodios = dadosTemporada.episodes;
  if (epInicio !== null) {
    if (epFim === null) epFim = epInicio;
    episodios = episodios.filter(ep => ep.episode_number >= epInicio && ep.episode_number <= epFim);
    if (!episodios.length) return `Não encontrei os episódios solicitados na temporada ${temporada}.`;
  }

  let totalMinutos = 0;
  let episodiosComDuracao = 0;
  let episodiosSemDuracao = 0;
  for (const ep of episodios) {
    if (ep.runtime && ep.runtime > 0) {
      totalMinutos += ep.runtime;
      episodiosComDuracao++;
    } else {
      episodiosSemDuracao++;
    }
  }

  if (totalMinutos <= 0) {
    return `Achei "${serie.name}" T${temporada}, mas o TMDB não tem minutagem dos episódios cadastrada.`;
  }

  const valor = totalMinutos * PRECO_SERIE_POR_MINUTO;
  const valorBR = formatarReal(valor);
  const anoSerie = anoDaSerie(serie) || "sem ano";
  const descricao = epInicio === null
    ? `Temporada ${temporada}`
    : (epInicio === epFim ? `T${temporada} EP${epInicio}` : `T${temporada} EP${epInicio} ao EP${epFim}`);

  let resposta =
    `📺 ${serie.name} (${anoSerie}) - ${descricao}: ` +
    `${episodiosComDuracao} episódio(s), ${totalMinutos} minutos no total. ` +
    `Valor: ${valorBR} / `;
  if (episodiosSemDuracao > 0) {
    resposta += ` Obs: ${episodiosSemDuracao} episódio(s) sem minutagem no TMDB.`;
  }

  const nomesSerie = removerTitulosDuplicados([serie.original_name, serie.name, titulo]);

  // A primeira consulta já está rodando com o título digitado. Se ela ainda não
  // terminou, esperamos só o orçamento restante. Nunca deixamos essa etapa
  // sozinha empurrar o comando além do limite do bot.
  const gasto = Date.now() - inicioCensura;
  const restante = Math.max(500, 9500 - gasto);
  let guia = await promessaComLimite(censuraEmParalelo, restante, { episodios: [], pagina: "", status: "tempo" });

  // Se o título digitado era localizado e não encontrou, uma segunda tentativa
  // com o nome original do TMDB usa o cache e tem limite curto.
  if ((!guia || !guia.episodios || !guia.episodios.length) && nomesSerie.length > 1) {
    guia = await promessaComLimite(
      buscarCensuraPorEpisodioAZNude(nomesSerie, temporada, epInicio, epFim),
      2200,
      guia || { episodios: [], pagina: "", status: "tempo" }
    );
  }

  if (guia && guia.episodios && guia.episodios.length) {
    return adicionarAvisoCensuraEpisodios(resposta, guia.episodios);
  }

  // Fallback antigo. Também recebe limite: o comando antigo testava muitas
  // combinações em sequência e, somado ao guia novo, poderia ultrapassar 15s.
  const nomesEpisodios = episodios.map(ep => ep.name).filter(Boolean);
  const titulosParaCensura = [];
  for (const nomeSerie of nomesSerie) {
    titulosParaCensura.push(nomeSerie, `${nomeSerie} season ${temporada}`, `${nomeSerie} temporada ${temporada}`);
  }
  for (const nomeSerie of nomesSerie) {
    for (const nomeEp of nomesEpisodios) {
      titulosParaCensura.push(`${nomeSerie} ${nomeEp}`, `${nomeSerie} - ${nomeEp}`);
    }
  }
  for (const nomeEp of nomesEpisodios) {
    if (normalizarTexto(nomeEp).length >= 5) titulosParaCensura.push(nomeEp);
  }

  const possivelCensura = await promessaComLimite(
    verificarPossivelCensuraPorTitulos(titulosParaCensura),
    2500,
    false
  );
  return adicionarAvisoCensura(resposta, possivelCensura);
}

async function responderFilme(titulo, ano) {
  const filme = await buscarFilmePorTitulo(titulo, ano);

  if (!filme) {
    return `Não achei o filme "${titulo}"${ano ? ` de ${ano}` : ""} no TMDB.`;
  }

  const detalhesFilmeUrl =
    `https://api.themoviedb.org/3/movie/${filme.id}` +
    `?api_key=${encodeURIComponent(TMDB_KEY)}` +
    `&language=pt-BR`;

  const detalhesFilme = await tmdbGet(detalhesFilmeUrl);
  const minutos = detalhesFilme.runtime;

  if (!minutos || minutos <= 0) {
    return `Achei "${filme.title}", mas o TMDB não tem a minutagem cadastrada.`;
  }

  const valor = minutos * PRECO_FILME_POR_MINUTO;
  const valorBR = formatarReal(valor);
  const anoFilme = anoDoFilme(filme) || anoDoFilme(detalhesFilme) || "sem ano";

  let resposta =
    `🎬 ${detalhesFilme.title || filme.title} (${anoFilme}) tem ` +
    `${minutos} minutos. Valor: ${valorBR} / `;

  const titulosParaCensura = [
    detalhesFilme.original_title,
    filme.original_title,
    detalhesFilme.title,
    filme.title,
    titulo
  ];

  const possivelCensura = await verificarPossivelCensuraPorTitulos(titulosParaCensura);
  return adicionarAvisoCensura(resposta, possivelCensura);
}


// Diagnóstico direto. Não precisa de channel porque não executa o cálculo.
// Ex.: /api/debug-censura?titulo=elite&temporada=8
app.get("/api/debug-censura", async (req, res) => {
  const titulo = limparTitulo(req.query.titulo);
  const temporada = Number(req.query.temporada);
  if (!titulo || !Number.isInteger(temporada) || temporada < 0) {
    return res.status(400).json({ ok:false, erro:"Use ?titulo=elite&temporada=8" });
  }
  const t0 = Date.now();
  try {
    CACHE_AZNUDE_PAGINA.delete(normalizarTexto(titulo));
    const seed = AZNUDE_SERIES_SEEDS.get(normalizarTexto(titulo)) || "";
    if (seed) CACHE_AZNUDE_EPS.delete(seed);
    const r = await promessaComLimite(
      buscarCensuraPorEpisodioAZNude([titulo], temporada, null, null),
      11000,
      { episodios:[], pagina:seed, status:"timeout" }
    );
    return res.json({
      ok: Array.isArray(r.episodios) && r.episodios.length > 0,
      titulo,
      temporada,
      status:r.status,
      pagina:r.pagina,
      episodios:r.episodios || [],
      ms:Date.now()-t0
    });
  } catch (err) {
    return res.status(500).json({ ok:false, erro:String(err && err.message || err), ms:Date.now()-t0 });
  }
});

app.get("/api/calculo", async (req, res) => {
  try {
    const canalRecebido = req.query.channel;
    const permissao = canalEstaPermitido(canalRecebido);

    if (!permissao.ok) {
      return res.send(permissao.erro);
    }

    const entrada = limparTitulo(req.query.titulo);

    if (!entrada) {
      return res.send("Use assim: !calculo filme nome 1999, !calculo serie nome 1 ou !calculo coletanea nome da saga 2 ao 5");
    }

    if (!TMDB_KEY) {
      return res.send("Erro: TMDB_KEY não configurada no Render.");
    }

    const entradaDetectada = detectarTipoEntrada(entrada);

    if (entradaDetectada.tipo === "coletanea") {
      return res.send(await responderColetanea(entradaDetectada.titulo));
    }

    const { titulo, ano, temporada, epInicio, epFim } = separarTituloAnoTemporadaEEpisodios(entradaDetectada.titulo, entradaDetectada.tipo);

    if (!titulo) {
      return res.send("Digite o nome do filme, série, anime ou desenho.");
    }

    if (tipoEhSerie(entradaDetectada.tipo) || (entradaDetectada.tipo === "auto" && temporada !== null)) {
      return res.send(await responderSerie(titulo, ano, temporada, epInicio, epFim, entradaDetectada.tipo));
    }

    return res.send(await responderFilme(titulo, ano));
  } catch (err) {
    console.error(err);
    return res.send("Erro ao consultar o TMDB ou calcular o valor.");
  }
});

const PORT = process.env.PORT || 3000;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
  });
}

if (process.env.NODE_ENV === "test") {
  module.exports = {
    separarTituloAnoTemporadaEEpisodios,
    extrairMapaEpisodiosAZNude,
    filtrarEpisodiosCensura,
    acharPaginaAZNudeNosResultados,
    buscarCensuraPorEpisodioAZNude,
    responderSerie
  };
}
