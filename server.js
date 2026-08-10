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
// AZNude - episódios por temporada
//
// O AZNude passou a mostrar um guia "By Episode" com textos no formato
// "Season 8 Episode 8". Esta rotina NÃO depende de um único jeito de baixar a
// página: tenta o site diretamente, um proxy de HTML e, se necessário, um
// leitor que renderiza páginas dinâmicas. Isso evita perder os episódios quando
// o HTML entregue ao Render é diferente do HTML entregue a um navegador.
// -----------------------------------------------------------------------------

const CACHE_AZNUDE_URL = new Map();
const CACHE_AZNUDE_EPISODIOS = new Map();
const CACHE_AZNUDE_PROMESSAS = new Map();
const AZNUDE_URL_CACHE_MS = 12 * 60 * 60 * 1000;
const AZNUDE_EP_CACHE_MS = 6 * 60 * 60 * 1000;
const AZNUDE_MISS_CACHE_MS = 10 * 60 * 1000;

function debugCensura(...args) {
  if (String(process.env.DEBUG_CENSURA || "").toLowerCase() === "true") {
    console.log("[CENSURA]", ...args);
  }
}

function decodificarEntidadesBasicas(texto) {
  return String(texto || "")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function extrairLinksFlex(texto) {
  const saida = [];
  const vistos = new Set();

  // HTML normal.
  for (const link of extrairLinks(String(texto || ""))) {
    const chave = `${link.href}\n${link.texto}`;
    if (!vistos.has(chave)) {
      vistos.add(chave);
      saida.push(link);
    }
  }

  // Markdown (usado pelo fallback que renderiza a página).
  const reMd = /\[([^\]]{1,300})\]\((https?:\/\/[^\s)]+|\/[^\s)]+)\)/g;
  let m;
  while ((m = reMd.exec(String(texto || ""))) !== null) {
    const link = { href: decodificarEntidadesBasicas(m[2]), texto: decodificarEntidadesBasicas(m[1]) };
    const chave = `${link.href}\n${link.texto}`;
    if (!vistos.has(chave)) {
      vistos.add(chave);
      saida.push(link);
    }
  }

  return saida;
}

function urlAZNudeAbsoluta(href) {
  const valor = decodificarEntidadesBasicas(href).trim();
  if (!valor) return "";

  try {
    const u = new URL(valor, "https://www.aznude.com/");
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    if (host !== "aznude.com") return "";
    if (!/^\/view\/movie\//i.test(u.pathname)) return "";
    u.protocol = "https:";
    u.hostname = "www.aznude.com";
    u.hash = "";
    return u.toString();
  } catch (err) {
    return "";
  }
}

function tituloDoUrlAZNude(url) {
  try {
    const u = new URL(url, "https://www.aznude.com/");
    const base = decodeURIComponent(u.pathname.split("/").pop() || "")
      .replace(/\.html$/i, "")
      // O bloco numérico final é o id interno do AZNude.
      .replace(/-\d{4,}$/i, "")
      .replace(/[-_]+/g, " ");
    return normalizarTexto(base);
  } catch (err) {
    return "";
  }
}

function extrairCandidatosAZNude(texto) {
  const saida = [];
  const vistos = new Set();

  for (const link of extrairLinksFlex(texto)) {
    const url = urlAZNudeAbsoluta(link.href);
    if (!url || vistos.has(url)) continue;
    vistos.add(url);

    saida.push({
      url,
      texto: limparTitulo(link.texto || ""),
      tituloUrl: tituloDoUrlAZNude(url)
    });
  }

  return saida;
}

function acharCandidatoAZNudeExato(candidatos, titulos) {
  const alvos = removerTitulosDuplicados(titulos)
    .map(t => normalizarTexto(t))
    .filter(Boolean);

  // Primeiro usa o slug da própria URL. É a comparação mais segura e não se
  // confunde com contadores como "15.9M Elite 107 482".
  for (const alvo of alvos) {
    const exatoUrl = (candidatos || []).find(c => normalizarTexto(c.tituloUrl) === alvo);
    if (exatoUrl) return exatoUrl;
  }

  // Depois usa o texto visível, removendo números/contagens que o card possa ter.
  for (const alvo of alvos) {
    const exatoTexto = (candidatos || []).find(c => {
      const txt = normalizarTexto(c.texto);
      return txt === alvo || txt.startsWith(alvo + " ") || txt.endsWith(" " + alvo);
    });
    if (exatoTexto) return exatoTexto;
  }

  return null;
}

function paginaAZNudeBloqueada(texto) {
  const limpo = normalizarTexto(removerTagsHtml(String(texto || "")));
  if (!limpo || limpo.length < 80) return true;

  return [
    "just a moment",
    "attention required",
    "access denied",
    "verify you are human",
    "checking your browser",
    "cf challenge"
  ].some(frase => limpo.includes(frase));
}

async function fetchTextoComTimeout(url, timeoutMs, headers = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const resp = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers
    });

    if (!resp.ok) {
      debugCensura("HTTP", resp.status, url);
      return "";
    }

    return await resp.text();
  } catch (err) {
    debugCensura("falha", url, err && err.message ? err.message : String(err));
    return "";
  } finally {
    clearTimeout(timer);
  }
}

async function fetchAZNudeDireto(url, timeoutMs = 5500) {
  const urls = [String(url)];
  if (String(url).includes("://www.aznude.com/")) {
    urls.push(String(url).replace("://www.aznude.com/", "://aznude.com/"));
  }

  for (const tentativa of urls) {
    const html = await fetchTextoComTimeout(tentativa, timeoutMs, {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9,pt-BR;q=0.8,pt;q=0.7",
      "Cache-Control": "no-cache",
      "Pragma": "no-cache",
      "Referer": "https://www.aznude.com/"
    });

    if (html && !paginaAZNudeBloqueada(html)) return html;
  }

  return "";
}

async function fetchAZNudeAllOrigins(url, timeoutMs = 6500) {
  const proxy = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
  const html = await fetchTextoComTimeout(proxy, timeoutMs, {
    "User-Agent": "Mozilla/5.0",
    "Accept": "text/html,*/*;q=0.8"
  });

  if (!html || paginaAZNudeBloqueada(html)) return "";
  return html;
}

async function fetchAZNudeRenderizado(url, timeoutMs = 13000) {
  let alvo;
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    if (host !== "aznude.com") return "";
    alvo = u.toString();
  } catch (err) {
    return "";
  }

  // Jina Reader: ao prefixar uma URL pública, ele devolve o conteúdo renderizado
  // em texto/Markdown. Isso pega a área "By Episode" mesmo quando ela não vem
  // pronta no HTML recebido diretamente pelo servidor.
  const readerUrl = `https://r.jina.ai/${alvo}`;
  return fetchTextoComTimeout(readerUrl, timeoutMs, {
    "User-Agent": "Mozilla/5.0",
    "Accept": "text/plain,text/markdown;q=0.9,*/*;q=0.5"
  });
}

function extrairMapaEpisodiosAZNude(texto) {
  const mapa = new Map();
  const base = decodificarEntidadesBasicas(removerTagsHtml(String(texto || "")))
    .replace(/[*_#`]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const padroes = [
    /\bSeason\s*0*(\d{1,3})\s*Episode\s*0*(\d{1,4})\b/gi,
    /\bS(?:eason)?\s*0*(\d{1,3})\s*E(?:pisode)?\s*0*(\d{1,4})\b/gi,
    /\bS0*(\d{1,3})E0*(\d{1,4})\b/gi
  ];

  for (const regex of padroes) {
    let m;
    while ((m = regex.exec(base)) !== null) {
      const temp = Number(m[1]);
      const ep = Number(m[2]);
      if (!Number.isInteger(temp) || !Number.isInteger(ep) || temp < 0 || ep < 0) continue;
      if (!mapa.has(temp)) mapa.set(temp, new Set());
      mapa.get(temp).add(ep);
    }
  }

  return mapa;
}

function mapaTemEpisodios(mapa) {
  if (!(mapa instanceof Map)) return false;
  for (const eps of mapa.values()) {
    if (eps && eps.size > 0) return true;
  }
  return false;
}

function episodiosDaTemporadaNoMapa(mapa, temporada) {
  const set = mapa instanceof Map ? mapa.get(Number(temporada)) : null;
  return set ? [...set].sort((a, b) => a - b) : [];
}

function filtrarEpisodiosDaFaixa(lista, epInicio, epFim) {
  const eps = [...new Set((lista || []).map(Number).filter(Number.isFinite))].sort((a, b) => a - b);
  if (epInicio === null || epInicio === undefined) return eps;

  const inicio = Number(epInicio);
  const fim = epFim === null || epFim === undefined ? inicio : Number(epFim);
  const min = Math.min(inicio, fim);
  const max = Math.max(inicio, fim);
  return eps.filter(ep => ep >= min && ep <= max);
}

function extrairMaiorPaginaAZNude(texto, pasta) {
  const seguro = String(pasta || "").replace(/[^a-z0-9-]/gi, "");
  if (!seguro) return 1;

  let maior = 1;
  const regex = new RegExp(`/browse/movies/${seguro}/(\\d+)\\.html`, "gi");
  let m;
  while ((m = regex.exec(String(texto || ""))) !== null) {
    const n = Number(m[1]);
    if (Number.isInteger(n) && n > maior) maior = n;
  }
  return Math.min(Math.max(maior, 1), 500);
}

function pastaAZNudePorTitulo(titulo) {
  const original = limparTitulo(titulo);
  if (!original) return "";

  const semAcento = original
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  const primeiro = semAcento.charAt(0);
  if (/[a-z]/.test(primeiro)) return primeiro;
  return "0-9";
}

async function fetchIndiceAZNude(url, timeoutMs = 6000) {
  // Direto + proxy em paralelo. O Reader renderizado fica reservado para a
  // página FINAL da série; usá-lo em cada página do índice deixaria o comando
  // lento demais.
  const [direto, proxy] = await Promise.all([
    fetchAZNudeDireto(url, timeoutMs),
    fetchAZNudeAllOrigins(url, timeoutMs + 1000)
  ]);

  const candidatosDireto = extrairCandidatosAZNude(direto);
  if (candidatosDireto.length) return direto;

  const candidatosProxy = extrairCandidatosAZNude(proxy);
  if (candidatosProxy.length) return proxy;

  return "";
}

async function tentarPaginaAZNudePelaBusca(titulos) {
  for (const titulo of removerTitulosDuplicados(titulos)) {
    const q = encodeURIComponent(titulo);
    for (const url of [
      `https://www.aznude.com/search/?q=${q}`,
      `https://www.aznude.com/search?q=${q}`
    ]) {
      // Não usa o renderizador aqui para não deixar a busca lenta; os outros
      // caminhos abaixo não dependem da busca interna do site.
      const [direto, proxy] = await Promise.all([
        fetchAZNudeDireto(url, 4500),
        fetchAZNudeAllOrigins(url, 5500)
      ]);

      for (const texto of [direto, proxy]) {
        const candidato = acharCandidatoAZNudeExato(extrairCandidatosAZNude(texto), titulos);
        if (candidato) return candidato.url;
      }
    }
  }
  return "";
}

async function tentarPaginaAZNudeGuiaPopular(titulos) {
  const url = "https://www.aznude.com/browse/movies/guide/1.html";
  const texto = await fetchIndiceAZNude(url, 5000);
  const candidato = acharCandidatoAZNudeExato(extrairCandidatosAZNude(texto), titulos);
  return candidato ? candidato.url : "";
}

async function tentarPaginaAZNudeAZ(titulos) {
  for (const titulo of removerTitulosDuplicados(titulos)) {
    const alvo = normalizarTexto(titulo);
    if (!alvo) continue;

    const pasta = pastaAZNudePorTitulo(titulo);
    if (!pasta) continue;

    const pagina1Url = `https://www.aznude.com/browse/movies/${pasta}/1.html`;
    const pagina1 = await fetchIndiceAZNude(pagina1Url, 5200);
    if (!pagina1) continue;

    let candidatos = extrairCandidatosAZNude(pagina1);
    let candidato = acharCandidatoAZNudeExato(candidatos, [titulo]);
    if (candidato) return candidato.url;

    const maxPagina = extrairMaiorPaginaAZNude(pagina1, pasta);
    let baixo = 2;
    let alto = maxPagina;
    let tentativas = 0;

    while (baixo <= alto && tentativas < 10) {
      tentativas++;
      const meio = Math.floor((baixo + alto) / 2);
      const texto = await fetchIndiceAZNude(`https://www.aznude.com/browse/movies/${pasta}/${meio}.html`, 5200);
      if (!texto) break;

      candidatos = extrairCandidatosAZNude(texto);
      candidato = acharCandidatoAZNudeExato(candidatos, [titulo]);
      if (candidato) return candidato.url;

      const nomes = candidatos.map(c => normalizarTexto(c.tituloUrl)).filter(Boolean);
      if (!nomes.length) break;

      const primeiro = nomes[0];
      const ultimo = nomes[nomes.length - 1];

      if (alvo < primeiro) {
        alto = meio - 1;
      } else if (alvo > ultimo) {
        baixo = meio + 1;
      } else {
        // A ordenação pode tratar pontuação de forma diferente. Verifica as
        // páginas vizinhas antes de desistir.
        for (const vizinha of [meio - 1, meio + 1]) {
          if (vizinha < 1 || vizinha > maxPagina) continue;
          const textoVizinho = await fetchIndiceAZNude(`https://www.aznude.com/browse/movies/${pasta}/${vizinha}.html`, 5200);
          const cVizinho = acharCandidatoAZNudeExato(extrairCandidatosAZNude(textoVizinho), [titulo]);
          if (cVizinho) return cVizinho.url;
        }
        break;
      }
    }
  }

  return "";
}

async function resolverPaginaAZNudeSerie(titulos) {
  const lista = removerTitulosDuplicados(titulos);
  const chaves = lista.map(normalizarTexto).filter(Boolean);
  const agora = Date.now();

  for (const chave of chaves) {
    const cache = CACHE_AZNUDE_URL.get(chave);
    if (cache && cache.expiraEm > agora) return cache.url;
  }

  // Busca normal e guia popular ao mesmo tempo. Assim séries como Elite não
  // esperam uma tentativa falhar para só depois consultar o guia.
  let url = "";
  try {
    url = await Promise.any([
      tentarPaginaAZNudePelaBusca(lista).then(v => v || Promise.reject(new Error("sem busca"))),
      tentarPaginaAZNudeGuiaPopular(lista).then(v => v || Promise.reject(new Error("sem guia")))
    ]);
  } catch (err) {
    url = "";
  }

  // Último caminho: índice A-Z com busca binária. Não varre as 100+ páginas
  // uma por uma e não depende da busca interna do AZNude.
  if (!url) url = await tentarPaginaAZNudeAZ(lista);

  const expiraEm = agora + (url ? AZNUDE_URL_CACHE_MS : AZNUDE_MISS_CACHE_MS);
  for (const chave of chaves) CACHE_AZNUDE_URL.set(chave, { url, expiraEm });
  return url;
}

async function carregarMapaEpisodiosAZNude(urlPagina) {
  const chave = String(urlPagina || "");
  if (!chave) return new Map();

  const agora = Date.now();
  const cache = CACHE_AZNUDE_EPISODIOS.get(chave);
  if (cache && cache.expiraEm > agora) return cache.mapa;

  // Evita 2 comandos simultâneos baixarem a mesma página duas vezes.
  if (CACHE_AZNUDE_PROMESSAS.has(chave)) return CACHE_AZNUDE_PROMESSAS.get(chave);

  const promessa = (async () => {
    // Tenta HTML direto e proxy em paralelo. Se a área By Episode for montada
    // por JavaScript e não aparecer nesses HTMLs, o Reader já começa logo em
    // seguida e renderiza a página como um navegador.
    let timerReader;
    let resolverInicioReader;
    const inicioReader = new Promise(resolve => { resolverInicioReader = resolve; });
    timerReader = setTimeout(() => resolverInicioReader(fetchAZNudeRenderizado(chave, 13000)), 700);

    const [direto, proxy] = await Promise.all([
      fetchAZNudeDireto(chave, 6000),
      fetchAZNudeAllOrigins(chave, 7000)
    ]);

    for (const [fonte, texto] of [["direto", direto], ["proxy", proxy]]) {
      const mapa = extrairMapaEpisodiosAZNude(texto);
      if (mapaTemEpisodios(mapa)) {
        clearTimeout(timerReader);
        debugCensura("episódios AZNude via", fonte, chave);
        CACHE_AZNUDE_EPISODIOS.set(chave, { mapa, expiraEm: Date.now() + AZNUDE_EP_CACHE_MS });
        return mapa;
      }
    }

    let readerPromise;
    try {
      readerPromise = await inicioReader;
    } catch (err) {
      readerPromise = "";
    }
    const renderizado = await Promise.resolve(readerPromise);
    const mapaRenderizado = extrairMapaEpisodiosAZNude(renderizado);
    if (mapaTemEpisodios(mapaRenderizado)) {
      debugCensura("episódios AZNude via renderizador", chave);
      CACHE_AZNUDE_EPISODIOS.set(chave, { mapa: mapaRenderizado, expiraEm: Date.now() + AZNUDE_EP_CACHE_MS });
      return mapaRenderizado;
    }

    const vazio = new Map();
    CACHE_AZNUDE_EPISODIOS.set(chave, { mapa: vazio, expiraEm: Date.now() + AZNUDE_MISS_CACHE_MS });
    return vazio;
  })();

  CACHE_AZNUDE_PROMESSAS.set(chave, promessa);
  try {
    return await promessa;
  } finally {
    CACHE_AZNUDE_PROMESSAS.delete(chave);
  }
}

async function buscarEpisodiosCensuraAZNude(titulosSerie, temporada, epInicio, epFim) {
  if (!CHECK_CENSURA) return [];

  const lista = removerTitulosDuplicados(titulosSerie);
  if (!lista.length || temporada === null || temporada === undefined) return [];

  const url = await resolverPaginaAZNudeSerie(lista);
  if (!url) {
    debugCensura("página AZNude não encontrada para", lista.join(" | "));
    return [];
  }

  const mapa = await carregarMapaEpisodiosAZNude(url);
  const todos = episodiosDaTemporadaNoMapa(mapa, temporada);
  return filtrarEpisodiosDaFaixa(todos, epInicio, epFim);
}

function adicionarAvisoCensuraComEpisodios(resposta, episodios) {
  const lista = [...new Set((episodios || []).map(Number).filter(Number.isFinite))].sort((a, b) => a - b);
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

  const resultados = [];

  for (const url of urls) {
    const busca = await tmdbGet(url);
    resultados.push(...(busca.results || []));
  }

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

  const resultados = [];

  for (const url of urls) {
    const busca = await tmdbGet(url);
    resultados.push(...(busca.results || []));
  }

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
  if (epInicio !== null){
    if(epFim===null) epFim=epInicio;
    episodios=episodios.filter(ep=>ep.episode_number>=epInicio && ep.episode_number<=epFim);
    if(!episodios.length) return `Não encontrei os episódios solicitados na temporada ${temporada}.`;
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

  const descricao = epInicio===null?`Temporada ${temporada}`:(epInicio===epFim?`T${temporada} EP${epInicio}`:`T${temporada} EP${epInicio} ao EP${epFim}`);
  let resposta =
    `📺 ${serie.name} (${anoSerie}) - ${descricao}: ` +
    `${episodiosComDuracao} episódio(s), ` +
    `${totalMinutos} minutos no total. ` +
    `Valor: ${valorBR} / `;

  if (episodiosSemDuracao > 0) {
    resposta += ` Obs: ${episodiosSemDuracao} episódio(s) sem minutagem no TMDB.`;
  }

  const nomesSerie = removerTitulosDuplicados([
    serie.original_name,
    serie.name,
    titulo
  ]);

  const nomesEpisodios = episodios
    .map(ep => ep.name)
    .filter(Boolean);

  const titulosParaCensura = [];

  for (const nomeSerie of nomesSerie) {
    titulosParaCensura.push(nomeSerie);
    titulosParaCensura.push(`${nomeSerie} season ${temporada}`);
    titulosParaCensura.push(`${nomeSerie} temporada ${temporada}`);
  }

  for (const nomeSerie of nomesSerie) {
    for (const nomeEp of nomesEpisodios) {
      titulosParaCensura.push(`${nomeSerie} ${nomeEp}`);
      titulosParaCensura.push(`${nomeSerie} - ${nomeEp}`);
    }
  }

  for (const nomeEp of nomesEpisodios) {
    if (normalizarTexto(nomeEp).length >= 5) {
      titulosParaCensura.push(nomeEp);
    }
  }

  // Primeiro tenta o guia por episódio do AZNude. Se encontrar, informa os
  // episódios exatos da temporada/faixa pedida.
  const episodiosCensura = await buscarEpisodiosCensuraAZNude(
    nomesSerie,
    temporada,
    epInicio,
    epFim
  );

  if (episodiosCensura.length > 0) {
    return adicionarAvisoCensuraComEpisodios(resposta, episodiosCensura);
  }

  // Se o AZNude não tiver guia por episódio, mantém exatamente o sistema
  // antigo de aviso genérico usando as três fontes.
  const possivelCensura = await verificarPossivelCensuraPorTitulos(titulosParaCensura);
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
    episodiosDaTemporadaNoMapa,
    filtrarEpisodiosDaFaixa,
    extrairCandidatosAZNude,
    acharCandidatoAZNudeExato,
    extrairMaiorPaginaAZNude,
    pastaAZNudePorTitulo,
    adicionarAvisoCensuraComEpisodios,
    responderSerie,
    resolverPaginaAZNudeSerie,
    buscarEpisodiosCensuraAZNude
  };
}
