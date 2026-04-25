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

function separarTituloETemporada(texto) {
  const tituloLimpo = limparTitulo(texto);
  const match = tituloLimpo.match(/^(.*?)\s+(\d+)$/);

  if (!match) {
    return {
      titulo: tituloLimpo,
      temporada: null
    };
  }

  return {
    titulo: limparTitulo(match[1]),
    temporada: Number(match[2])
  };
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

app.get("/api/calculo", async (req, res) => {
  try {
    const canalRecebido = req.query.channel;
    const permissao = canalEstaPermitido(canalRecebido);

    if (!permissao.ok) {
      return res.send(permissao.erro);
    }

    const entrada = limparTitulo(req.query.titulo);

    if (!entrada) {
      return res.send("Use assim: !calculo nome do filme ou !calculo nome da serie 1");
    }

    if (!TMDB_KEY) {
      return res.send("Erro: TMDB_KEY não configurada no Render.");
    }

    const { titulo, temporada } = separarTituloETemporada(entrada);

    if (!titulo) {
      return res.send("Digite o nome do filme, série, anime ou desenho.");
    }

    if (temporada !== null) {
      const buscaSerieUrl =
        "https://api.themoviedb.org/3/search/tv" +
        `?api_key=${encodeURIComponent(TMDB_KEY)}` +
        `&language=pt-BR` +
        `&query=${encodeURIComponent(titulo)}` +
        `&include_adult=false`;

      const buscaSerie = await tmdbGet(buscaSerieUrl);

      if (!buscaSerie.results || buscaSerie.results.length === 0) {
        return res.send(`Não achei a série/anime/desenho "${titulo}" no TMDB.`);
      }

      const serie = buscaSerie.results[0];

      const temporadaUrl =
        `https://api.themoviedb.org/3/tv/${serie.id}/season/${temporada}` +
        `?api_key=${encodeURIComponent(TMDB_KEY)}` +
        `&language=pt-BR`;

      const dadosTemporada = await tmdbGet(temporadaUrl);

      if (!dadosTemporada.episodes || dadosTemporada.episodes.length === 0) {
        return res.send(`Achei "${serie.name}", mas não achei a temporada ${temporada}.`);
      }

      let totalMinutos = 0;
      let episodiosComDuracao = 0;
      let episodiosSemDuracao = 0;

      for (const ep of dadosTemporada.episodes) {
        if (ep.runtime && ep.runtime > 0) {
          totalMinutos += ep.runtime;
          episodiosComDuracao++;
        } else {
          episodiosSemDuracao++;
        }
      }

      if (totalMinutos <= 0) {
        return res.send(
          `Achei "${serie.name}" T${temporada}, mas o TMDB não tem minutagem dos episódios cadastrada.`
        );
      }

      const valor = totalMinutos * PRECO_SERIE_POR_MINUTO;
      const valorBR = formatarReal(valor);

      let resposta =
        `📺 ${serie.name} - Temporada ${temporada}: ` +
        `${episodiosComDuracao} episódio(s), ` +
        `${totalMinutos} minutos no total. ` +
        `Valor: ${valorBR} (R$0,40/min)`;

      if (episodiosSemDuracao > 0) {
        resposta += ` Obs: ${episodiosSemDuracao} episódio(s) sem minutagem no TMDB.`;
      }

      const titulosParaCensura = [
        serie.original_name,
        serie.name,
        titulo
      ];

      const possivelCensura = await verificarPossivelCensuraPorTitulos(titulosParaCensura);
      resposta = adicionarAvisoCensura(resposta, possivelCensura);

      return res.send(resposta);
    }

    const buscaFilmeUrl =
      "https://api.themoviedb.org/3/search/movie" +
      `?api_key=${encodeURIComponent(TMDB_KEY)}` +
      `&language=pt-BR` +
      `&query=${encodeURIComponent(titulo)}` +
      `&include_adult=false`;

    const buscaFilme = await tmdbGet(buscaFilmeUrl);

    if (!buscaFilme.results || buscaFilme.results.length === 0) {
      return res.send(`Não achei o filme "${titulo}" no TMDB.`);
    }

    const filme = buscaFilme.results[0];

    const detalhesFilmeUrl =
      `https://api.themoviedb.org/3/movie/${filme.id}` +
      `?api_key=${encodeURIComponent(TMDB_KEY)}` +
      `&language=pt-BR`;

    const detalhesFilme = await tmdbGet(detalhesFilmeUrl);

    const minutos = detalhesFilme.runtime;

    if (!minutos || minutos <= 0) {
      return res.send(`Achei "${filme.title}", mas o TMDB não tem a minutagem cadastrada.`);
    }

    const valor = minutos * PRECO_FILME_POR_MINUTO;
    const valorBR = formatarReal(valor);
    const ano = filme.release_date ? filme.release_date.slice(0, 4) : "sem ano";

    let resposta =
      `🎬 ${detalhesFilme.title || filme.title} (${ano}) tem ` +
      `${minutos} minutos. Valor: ${valorBR} (R$0,45/min)`;

    const titulosParaCensura = [
      detalhesFilme.original_title,
      filme.original_title,
      detalhesFilme.title,
      filme.title,
      titulo
    ];

    const possivelCensura = await verificarPossivelCensuraPorTitulos(titulosParaCensura);
    resposta = adicionarAvisoCensura(resposta, possivelCensura);

    return res.send(resposta);
  } catch (err) {
    console.error(err);
    return res.send("Erro ao consultar o TMDB ou calcular o valor.");
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
