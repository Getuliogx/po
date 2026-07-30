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
    .replace(/&/g, " e ")
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

function montarUrlsCensura(titulo, ano) {
  // O ano vai junto na pesquisa para evitar misturar filmes homônimos.
  const termo = [limparTitulo(titulo), ano ? String(ano) : ""]
    .filter(Boolean)
    .join(" ");
  const q = encodeURIComponent(termo);

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
      texto,
      inicio: match.index,
      fim: regex.lastIndex
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
    "advertise",
    "/search",
    "search?",
    "searchstring=",
    "?q="
  ];

  if (bloqueados.some(item => href.includes(item))) {
    return false;
  }

  if (!texto || texto.length < 2) {
    return false;
  }

  return true;
}

const PALAVRAS_GENERICAS_CENSURA = new Set([
  "nude", "nudes", "nudity", "scene", "scenes", "sex", "sexy",
  "clip", "clips", "video", "videos", "photo", "photos", "picture", "pictures",
  "gallery", "galleries", "movie", "movies", "film", "films", "cinema",
  "watch", "online", "archive", "tour", "page", "pages", "title", "titles",
  "cast", "review", "reviews", "celebrity", "celebrities", "actress", "actresses",
  "actor", "actors", "mrskin", "aznude", "celebritymoviearchive", "cma",
  "www", "com", "https", "http", "html", "htm", "view", "content"
]);

function textoContemAnoExato(texto, ano) {
  if (!ano) {
    return true;
  }

  const anoTexto = String(ano);
  const normal = normalizarTexto(texto);
  return normal.split(" ").includes(anoTexto);
}

function limparCandidatoCensura(texto) {
  return normalizarTexto(texto)
    .split(" ")
    .filter(Boolean)
    .filter(palavra => !/^(?:18|19|20|21)\d{2}$/.test(palavra))
    .filter(palavra => !PALAVRAS_GENERICAS_CENSURA.has(palavra))
    .join(" ");
}

function tituloBateExatamenteNoCampo(campo, titulo) {
  const alvoNormal = normalizarTexto(titulo);
  const alvoLimpo = limparCandidatoCensura(titulo);
  const campoNormal = normalizarTexto(campo);
  const campoLimpo = limparCandidatoCensura(campo);

  if (!alvoNormal || alvoNormal.length < 2 || !campoNormal) {
    return false;
  }

  // Aceita diferenças de artigos e pontuação, mas não aceita subtítulos,
  // continuações ou recomendações que apenas contenham algumas palavras.
  return campoNormal === alvoNormal ||
    campoLimpo === alvoLimpo ||
    chaveComparavel(campoLimpo) === chaveComparavel(alvoLimpo);
}

function contextoDoLink(html, link, margem = 180) {
  const pagina = String(html || "");
  let inicio = Math.max(0, Number(link.inicio || 0) - margem);
  let fim = Math.min(pagina.length, Number(link.fim || 0) + margem);

  // Não deixa o ano de outro cartão/link vizinho validar o filme atual.
  const fechamentoAnterior = pagina.lastIndexOf("</a>", Number(link.inicio || 0) - 1);
  const proximaAncora = pagina.indexOf("<a", Number(link.fim || 0));

  if (fechamentoAnterior >= inicio) {
    inicio = fechamentoAnterior + 4;
  }

  if (proximaAncora >= 0 && proximaAncora < fim) {
    fim = proximaAncora;
  }

  return removerTagsHtml(pagina.slice(inicio, fim));
}

function linkEhResultadoExato(html, link, titulo, ano) {
  const tituloExato =
    tituloBateExatamenteNoCampo(link.texto, titulo) ||
    tituloBateExatamenteNoCampo(link.href, titulo);

  if (!tituloExato) {
    return false;
  }

  if (!ano) {
    return true;
  }

  // O ano deve estar no próprio resultado ou imediatamente ao redor dele.
  // Se o site só sugerir um título parecido ou outra versão, não gera aviso.
  return textoContemAnoExato(link.texto, ano) ||
    textoContemAnoExato(link.href, ano) ||
    textoContemAnoExato(contextoDoLink(html, link), ano);
}

function tituloPareceNosResultados(html, titulo, ano) {
  const tituloNormal = normalizarTexto(titulo);

  if (!tituloNormal || tituloNormal.length < 2) {
    return false;
  }

  const links = extrairLinks(html).filter(linkPareceResultadoReal);

  return links.some(link => linkEhResultadoExato(html, link, titulo, ano));
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

function normalizarConsultasCensura(consultas) {
  const vistos = new Set();
  const lista = [];

  for (const item of consultas || []) {
    const titulo = limparTitulo(typeof item === "string" ? item : item && item.titulo);
    const ano = typeof item === "object" && item && item.ano ? String(item.ano) : "";
    const chave = `${normalizarTexto(titulo)}|${ano}`;

    if (!titulo || !normalizarTexto(titulo) || vistos.has(chave)) {
      continue;
    }

    vistos.add(chave);
    lista.push({ titulo, ano });
  }

  return lista;
}

async function verificarPossivelCensuraPorTitulos(consultas) {
  if (!CHECK_CENSURA) {
    return false;
  }

  const lista = normalizarConsultasCensura(consultas);

  for (const consulta of lista) {
    const buscas = montarUrlsCensura(consulta.titulo, consulta.ano);

    for (const busca of buscas) {
      const html = await fetchComTimeout(busca.url);

      if (!html) {
        continue;
      }

      if (paginaPareceSemResultado(html)) {
        continue;
      }

      if (tituloPareceNosResultados(html, consulta.titulo, consulta.ano)) {
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

const PALAVRAS_DE_LIGACAO = new Set([
  "a", "as", "o", "os", "um", "uma", "uns", "umas",
  "de", "da", "das", "do", "dos", "e", "and", "of",
  "the", "an", "el", "la", "las", "los"
]);

const PALAVRAS_DE_COLECAO = new Set([
  "colecao", "colecoes", "collection", "collections",
  "saga", "franquia", "franchise", "trilogia", "trilogy",
  "quadrilogia", "filme", "filmes", "movie", "movies"
]);

function palavrasComparaveis(texto, removerPalavrasDeColecao = false) {
  return normalizarTexto(texto)
    .split(" ")
    .filter(Boolean)
    .filter(palavra => !PALAVRAS_DE_LIGACAO.has(palavra))
    .filter(palavra => !removerPalavrasDeColecao || !PALAVRAS_DE_COLECAO.has(palavra));
}

function chaveComparavel(texto, removerPalavrasDeColecao = false) {
  return palavrasComparaveis(texto, removerPalavrasDeColecao).join(" ");
}

function quantidadePalavrasEmComum(a, b) {
  const conjuntoB = new Set(b);
  return a.filter(palavra => conjuntoB.has(palavra)).length;
}

function contemSequenciaCompleta(frase, trecho) {
  if (!frase || !trecho) {
    return false;
  }

  return ` ${frase} `.includes(` ${trecho} `);
}

function pontuarCorrespondenciaDeTitulo(nome, titulo) {
  const nomeNormal = normalizarTexto(nome);
  const alvoNormal = normalizarTexto(titulo);
  const nomePalavras = palavrasComparaveis(nome);
  const alvoPalavras = palavrasComparaveis(titulo);
  const nomeChave = nomePalavras.join(" ");
  const alvoChave = alvoPalavras.join(" ");

  if (!nomeNormal || !alvoNormal || alvoPalavras.length === 0) {
    return -100000;
  }

  let pontos = 0;

  if (nomeNormal === alvoNormal) pontos += 100000;
  if (nomeChave === alvoChave) pontos += 90000;
  if (nomeNormal.startsWith(`${alvoNormal} `)) pontos += 50000;
  if (nomeChave.startsWith(`${alvoChave} `)) pontos += 45000;
  if (contemSequenciaCompleta(nomeNormal, alvoNormal)) pontos += 25000;
  if (contemSequenciaCompleta(nomeChave, alvoChave)) pontos += 22000;

  const comuns = quantidadePalavrasEmComum(alvoPalavras, nomePalavras);
  const coberturaDoAlvo = comuns / alvoPalavras.length;
  const precisaoDoNome = comuns / Math.max(1, nomePalavras.length);

  pontos += coberturaDoAlvo * 12000;
  pontos += precisaoDoNome * 4000;
  pontos -= Math.max(0, nomePalavras.length - alvoPalavras.length) * 250;

  return pontos;
}

function maiorPontuacaoDeNomes(nomes, titulo) {
  return nomes
    .map(nome => pontuarCorrespondenciaDeTitulo(nome, titulo))
    .reduce((maior, atual) => Math.max(maior, atual), -100000);
}

function pontuarResultadoFilme(item, titulo) {
  const nomes = [item.title, item.original_title].filter(Boolean);
  const correspondencia = maiorPontuacaoDeNomes(nomes, titulo);
  const popularidade = Math.log10(1 + Math.max(0, Number(item.popularity || 0))) * 10;
  const votos = Math.log10(1 + Math.max(0, Number(item.vote_count || 0))) * 5;

  return correspondencia + popularidade + votos;
}

function resultadoTemTituloExato(nomes, titulo) {
  const alvoNormal = normalizarTexto(titulo);
  const alvoChave = chaveComparavel(titulo);

  return (nomes || []).filter(Boolean).some(nome => {
    return normalizarTexto(nome) === alvoNormal || chaveComparavel(nome) === alvoChave;
  });
}

function escolherMelhorFilme(resultados, titulo, ano) {
  const porAno = ano ? resultados.filter(item => anoDoFilme(item) === String(ano)) : resultados;
  let base = ano ? porAno : resultados;

  if (ano) {
    // Com ano informado, uma recomendação apenas parecida não é aceita.
    base = base.filter(item => resultadoTemTituloExato([item.title, item.original_title], titulo));
  }

  if (base.length === 0) {
    return null;
  }

  return [...base].sort((a, b) => pontuarResultadoFilme(b, titulo) - pontuarResultadoFilme(a, titulo))[0] || null;
}

function colecaoCorrespondeExatamenteAoTitulo(colecao, titulo) {
  const nomeColecao = chaveComparavel(colecao && colecao.name, true);
  const tituloBuscado = chaveComparavel(titulo, true);

  return Boolean(nomeColecao && tituloBuscado && nomeColecao === tituloBuscado);
}

async function pesquisarColecoesPorTitulo(titulo) {
  const urls = [
    "https://api.themoviedb.org/3/search/collection" +
      `?api_key=${encodeURIComponent(TMDB_KEY)}` +
      `&language=pt-BR` +
      `&query=${encodeURIComponent(titulo)}`,
    "https://api.themoviedb.org/3/search/collection" +
      `?api_key=${encodeURIComponent(TMDB_KEY)}` +
      `&language=en-US` +
      `&query=${encodeURIComponent(titulo)}`
  ];

  const buscas = await Promise.all([...new Set(urls)].map(url => tmdbGet(url)));
  const resultados = buscas.flatMap(busca => busca.results || []);

  return deduplicarPorId(resultados);
}

async function buscarPrimeiroFilmeDeColecaoExata(titulo) {
  const colecoes = await pesquisarColecoesPorTitulo(titulo);
  const colecoesExatas = colecoes.filter(colecao => colecaoCorrespondeExatamenteAoTitulo(colecao, titulo));

  if (colecoesExatas.length === 0) {
    return null;
  }

  const colecao = escolherMelhorColecao(colecoesExatas, titulo);

  if (!colecao || !colecao.id) {
    return null;
  }

  const detalhesColecaoUrl =
    `https://api.themoviedb.org/3/collection/${colecao.id}` +
    `?api_key=${encodeURIComponent(TMDB_KEY)}` +
    `&language=pt-BR`;
  const detalhesColecao = await tmdbGet(detalhesColecaoUrl);
  const partesOrdenadas = ordenarPartesDaColecao(detalhesColecao.parts || []);

  return partesOrdenadas[0] || null;
}

async function buscarFilmePorTitulo(titulo, ano, opcoes = {}) {
  const preferirPrimeiroDaColecao = opcoes.preferirPrimeiroDaColecao !== false;
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

  const buscas = await Promise.all([...new Set(urls)].map(url => tmdbGet(url)));
  const resultados = buscas.flatMap(busca => busca.results || []);

  if (!ano && preferirPrimeiroDaColecao) {
    const primeiroDaColecao = await buscarPrimeiroFilmeDeColecaoExata(titulo);

    if (primeiroDaColecao) {
      return primeiroDaColecao;
    }
  }

  return escolherMelhorFilme(deduplicarPorId(resultados), titulo, ano);
}

function pontuarResultadoSerie(item, titulo) {
  const nomes = [item.name, item.original_name].filter(Boolean);
  const correspondencia = maiorPontuacaoDeNomes(nomes, titulo);
  const popularidade = Math.log10(1 + Math.max(0, Number(item.popularity || 0))) * 10;
  const votos = Math.log10(1 + Math.max(0, Number(item.vote_count || 0))) * 5;

  return correspondencia + popularidade + votos;
}

function escolherMelhorSerie(resultados, titulo, ano) {
  const porAno = ano ? resultados.filter(item => anoDaSerie(item) === String(ano)) : resultados;
  let base = ano ? porAno : resultados;

  if (ano) {
    base = base.filter(item => resultadoTemTituloExato([item.name, item.original_name], titulo));
  }

  if (base.length === 0) {
    return null;
  }

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

  const buscas = await Promise.all([...new Set(urls)].map(url => tmdbGet(url)));
  const resultados = buscas.flatMap(busca => busca.results || []);

  return escolherMelhorSerie(deduplicarPorId(resultados), titulo, ano);
}

function pontuarColecao(item, titulo) {
  const nome = item && item.name;
  const correspondenciaNormal = pontuarCorrespondenciaDeTitulo(nome, titulo);
  const correspondenciaSemColecao = pontuarCorrespondenciaDeTitulo(
    chaveComparavel(nome, true),
    chaveComparavel(titulo, true)
  );

  return Math.max(correspondenciaNormal, correspondenciaSemColecao + 5000);
}

function escolherMelhorColecao(resultados, titulo) {
  return [...(resultados || [])]
    .sort((a, b) => pontuarColecao(b, titulo) - pontuarColecao(a, titulo))[0] || null;
}

async function buscarColecaoPorTitulo(titulo) {
  const colecoes = await pesquisarColecoesPorTitulo(titulo);
  let colecao = escolherMelhorColecao(colecoes, titulo);

  if (!colecao) {
    const filme = await buscarFilmePorTitulo(titulo, null, { preferirPrimeiroDaColecao: false });

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
  const titulosParaCensura = [];

  for (const parte of partesSelecionadas) {
    const detalhesUrl =
      `https://api.themoviedb.org/3/movie/${parte.id}` +
      `?api_key=${encodeURIComponent(TMDB_KEY)}` +
      `&language=pt-BR`;
    const detalhes = await tmdbGet(detalhesUrl);
    const nome = detalhes.title || parte.title || parte.original_title;

    nomesFilmes.push(nome);
    const anoParte = anoDoFilme(detalhes) || anoDoFilme(parte);
    titulosParaCensura.push(
      { titulo: detalhes.original_title, ano: anoParte },
      { titulo: parte.original_title, ano: anoParte },
      { titulo: detalhes.title, ano: anoParte },
      { titulo: parte.title, ano: anoParte }
    );

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

  const nomesSerie = [
    serie.original_name,
    serie.name,
    titulo
  ].filter(Boolean);

  const nomesEpisodios = episodios
    .map(ep => ep.name)
    .filter(Boolean);

  const titulosParaCensura = [];
  const anoCensuraSerie = anoDaSerie(serie) || ano || "";

  for (const nomeSerie of nomesSerie) {
    titulosParaCensura.push({ titulo: nomeSerie, ano: anoCensuraSerie });
    titulosParaCensura.push({ titulo: `${nomeSerie} season ${temporada}`, ano: anoCensuraSerie });
    titulosParaCensura.push({ titulo: `${nomeSerie} temporada ${temporada}`, ano: anoCensuraSerie });
  }

  for (const nomeSerie of nomesSerie) {
    for (const nomeEp of nomesEpisodios) {
      titulosParaCensura.push({ titulo: `${nomeSerie} ${nomeEp}`, ano: anoCensuraSerie });
      titulosParaCensura.push({ titulo: `${nomeSerie} - ${nomeEp}`, ano: anoCensuraSerie });
    }
  }

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
    { titulo: detalhesFilme.original_title, ano: anoFilme },
    { titulo: filme.original_title, ano: anoFilme },
    { titulo: detalhesFilme.title, ano: anoFilme },
    { titulo: filme.title, ano: anoFilme },
    { titulo, ano: anoFilme }
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

module.exports = {
  app,
  detectarTipoEntrada,
  escolherMelhorFilme,
  escolherMelhorSerie,
  buscarFilmePorTitulo,
  buscarPrimeiroFilmeDeColecaoExata,
  colecaoCorrespondeExatamenteAoTitulo,
  pontuarResultadoFilme,
  pontuarResultadoSerie,
  separarTituloAnoTemporadaEEpisodios,
  tituloPareceNosResultados,
  tituloBateExatamenteNoCampo,
  linkEhResultadoExato,
  normalizarConsultasCensura,
  resultadoTemTituloExato,
  paginaPareceSemResultado
};
