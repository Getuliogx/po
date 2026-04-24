const express = require("express");

const app = express();

const TMDB_KEY = process.env.TMDB_KEY;
const PRECO_POR_MINUTO = 0.45;

app.get("/", (req, res) => {
  res.send("API TMDB cálculo online.");
});

app.get("/api/calculo", async (req, res) => {
  try {
    const titulo = (req.query.titulo || "").trim();

    if (!titulo) {
      return res.send("Use assim: !calculo nome do filme");
    }

    if (!TMDB_KEY) {
      return res.send("Erro: TMDB_KEY não configurada no servidor.");
    }

    const buscaUrl =
      "https://api.themoviedb.org/3/search/movie" +
      `?api_key=${encodeURIComponent(TMDB_KEY)}` +
      `&language=pt-BR` +
      `&query=${encodeURIComponent(titulo)}` +
      `&include_adult=false`;

    const buscaResp = await fetch(buscaUrl);
    const buscaData = await buscaResp.json();

    if (!buscaData.results || buscaData.results.length === 0) {
      return res.send(`Não achei o filme "${titulo}" no TMDB.`);
    }

    const filme = buscaData.results[0];

    const detalhesUrl =
      `https://api.themoviedb.org/3/movie/${filme.id}` +
      `?api_key=${encodeURIComponent(TMDB_KEY)}` +
      `&language=pt-BR`;

    const detalhesResp = await fetch(detalhesUrl);
    const detalhes = await detalhesResp.json();

    const minutos = detalhes.runtime;

    if (!minutos || minutos <= 0) {
      return res.send(`Achei "${filme.title}", mas o TMDB não tem a minutagem cadastrada.`);
    }

    const valor = minutos * PRECO_POR_MINUTO;

    const valorBR = valor.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL"
    });

    const ano = filme.release_date ? filme.release_date.slice(0, 4) : "sem ano";

    return res.send(
      `🎬 ${detalhes.title || filme.title} (${ano}) tem ${minutos} minutos. Valor: ${valorBR}`
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