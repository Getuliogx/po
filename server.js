const express = require("express");

const app = express();

const TMDB_KEY = process.env.TMDB_KEY;

const PRECO_FILME_POR_MINUTO = 0.45;
const PRECO_SERIE_POR_MINUTO = 0.40;

app.get("/", (req, res) => {
  res.send("API TMDB cálculo online. Use /api/calculo?titulo=nome");
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

function separarTituloETemporada(texto) {
  const tituloLimpo = limparTitulo(texto);

  // Exemplo:
  // "the 100 1" => série "the 100", temporada 1
  // "dragon ball z 2" => série/anime "dragon ball z", temporada 2
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

app.get("/api/calculo", async (req, res) => {
  try {
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
        `Valor: ${valorBR}`;

      if (episodiosSemDuracao > 0) {
        resposta += ` Obs: ${episodiosSemDuracao} episódio(s) sem minutagem no TMDB.`;
      }

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

    return res.send(
      `🎬 ${detalhesFilme.title || filme.title} (${ano}) tem ${minutos} minutos. Valor: ${valorBR}`
    );
  } catch (err) {
    console.error(err);
    return res.send("Erro ao consultar o TMDB ou calcular o valor.");
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
