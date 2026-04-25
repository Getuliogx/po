const express = require("express");

const app = express();

const TMDB_KEY = process.env.TMDB_KEY;

// No Render:
// CANAIS_PERMITIDOS=seucanal,outrocanal
const CANAIS_PERMITIDOS = process.env.CANAIS_PERMITIDOS || "";

// No Render, opcional:
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
    `https://www.celebritymoviearchive.com/tour/search-full.php?searchstring=${q}`,
    `https://www.aznude.com/search/?q=${q}`,
    `https://www.mrskin.com/search?search=${q}`
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
    "sem resultados"
  ];

  return frasesSemResultado.some(frase => texto.includes(frase));
}

function tituloPareceNaPagina(html, titulo) {
  const textoPagina = normalizarTexto(html);
  const textoTitulo = normalizarTexto(titulo);

  const palavrasIgnoradas = new Set([
    "the", "a", "an", "of", "and", "or", "to", "in", "on", "for",
    "o", "a", "os", "as", "um", "uma", "de", "da", "do", "das", "dos", "e"
  ]);

  const palavras = textoTitulo
    .split(" ")
    .filter(p => p.length >= 3 && !palavrasIgnoradas.has(p));

  if (palavras.length === 0) {
    return false;
  }

  let encontradas = 0;

  for (const palavra of palavras) {
    if (textoPagina.includes(palavra)) {
      encontradas++;
    }
  }

  if (palavras.length === 1) {
    return encontradas >= 1;
  }

  return encontradas >= 2;
}

async function fetchComTimeout(url, timeoutMs = 4500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const resp = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0"
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

async function verificarPossivelCensura(titulo) {
  if (!CHECK_CENSURA) {
    return false;
  }

  const urls = montarUrlsCensura(titulo);

  for (const url of urls) {
    const html = await fetchComTimeout(url);

    if (!html) {
      continue;
    }

    if (paginaPareceSemResultado(html)) {
      continue;
    }

    if (tituloPareceNaPagina(html, titulo)) {
      return true;
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

    // Se tiver número no final, trata como série/anime/desenho
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

      const possivelCensura = await verificarPossivelCensura(serie.name || titulo);
      resposta = adicionarAvisoCensura(resposta, possivelCensura);

      return res.send(resposta);
    }

    // Sem número no final, trata como filme
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

    const possivelCensura = await verificarPossivelCensura(detalhesFilme.title || filme.title || titulo);
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
