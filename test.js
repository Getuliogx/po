process.env.NODE_ENV = "test";
process.env.TMDB_KEY = "teste";

const assert = require("assert/strict");
const api = require("./server");

const parse = api.separarTituloAnoTemporadaEEpisodios;

assert.deepEqual(parse("elite EP1 ao 5 T8", "serie"), {
  titulo: "elite", ano: null, temporada: 8, epInicio: 1, epFim: 5
});
assert.deepEqual(parse("elite T8 EP1 ao EP5", "serie"), {
  titulo: "elite", ano: null, temporada: 8, epInicio: 1, epFim: 5
});
assert.deepEqual(parse("premonição 2", "filme"), {
  titulo: "premonição 2", ano: null, temporada: null, epInicio: null, epFim: null
});

const episodios = api.extrairMapaEpisodiosAZNude(`
  Season 8 Episode 2
  Season 8 Episode 3
  S08E05
  Season 7 Episode 1
`);
assert.deepEqual(api.filtrarEpisodiosCensura(episodios, 8, null, null), [2, 3, 5]);
assert.deepEqual(api.filtrarEpisodiosCensura(episodios, 8, 3, 5), [3, 5]);

const bloqueio = `<html><head><title>Site Unavailable</title></head><body>${"x".repeat(240)} Unable to access this site.</body></html>`;
assert.equal(api.paginaCatalogoAZNudeValida(bloqueio), false);

const markdown = `${"x".repeat(220)}
# Browse Series with Episode Guides at AZNude
[![Image 1: ELITE](https://cdn.example/capa.jpg) Elite 107 482](https://www.aznude.com/view/movie/e/elite-4021272.html)
AZNude has a global mission`;
assert.equal(api.paginaCatalogoAZNudeValida(markdown), true);
assert.equal(
  api.acharPaginaAZNudeNosResultados(markdown, ["Elite"]),
  "https://www.aznude.com/view/movie/e/elite-4021272.html"
);

const casosIndice = {
  elite: "https://www.aznude.com/view/movie/e/elite-4021272.html",
  bridgerton: "https://www.aznude.com/view/movie/b/bridgerton-4020343.html",
  "tell me lies": "https://www.aznude.com/view/movie/t/tellmelies-4020345.html",
  yellowstone: "https://www.aznude.com/view/movie/y/yellowstone-4024799.html"
};
for (const [titulo, url] of Object.entries(casosIndice)) {
  assert.equal(api.paginasDoIndiceParaTitulos([titulo], 1)[0], url);
}

assert.equal(api._statusIndiceAZNude.pronto, true);
assert.equal(api._statusIndiceAZNude.paginas, 136);
assert.equal(api._guiasConfirmadosAZNude.size, 3204);

(async () => {
  const fetchReal = global.fetch;
  let headersGuia = null;
  global.fetch = async (urlRecebida, opcoes = {}) => {
    const url = String(urlRecebida);
    if (url.includes("api.themoviedb.org/3/search/tv")) {
      return new Response(JSON.stringify({ results: [{
        id: 1,
        name: "Bridgerton",
        original_name: "Bridgerton",
        first_air_date: "2020-12-25",
        popularity: 100
      }] }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url.includes("api.themoviedb.org/3/tv/1/season/4")) {
      return new Response(JSON.stringify({ episodes: Array.from({ length: 8 }, (_, i) => ({
        episode_number: i + 1,
        name: `Episódio ${i + 1}`,
        runtime: 60
      })) }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url.startsWith("https://r.jina.ai/https://www.aznude.com/view/movie/b/bridgerton")) {
      headersGuia = opcoes.headers;
      return new Response(`
        <section class="single-page__movie-wrapper" data-guide="1">
          <h2>Season 4 Episode 3</h2>
          <h2>Season 4 Episode 4</h2>
          <h2>Season 4 Episode 5</h2>
          <h2>Season 4 Episode 8</h2>
        </section>
      `, { status: 200 });
    }
    if (url.startsWith("https://www.aznude.com/view/movie/b/bridgerton")) {
      return new Response("<html><title>Site Unavailable</title>Unable to access this site.</html>", { status: 200 });
    }
    throw new Error(`URL inesperada no teste: ${url}`);
  };

  try {
    const resposta = await api.responderSerie("bridgerton", null, 4, null, null, "serie");
    assert.match(resposta, /Bridgerton \(2020\) - Temporada 4/);
    assert.match(resposta, /8 episódio\(s\), 480 minutos no total/);
    assert.match(resposta, /Possível censura verificar: ep 3, 4, 5, 8\./);
    assert.equal(headersGuia["X-Respond-With"], "html");
    assert.equal(headersGuia["X-Target-Selector"], ".single-page__movie-wrapper[data-guide]");
  } finally {
    global.fetch = fetchReal;
  }

  console.log("OK: testes locais da censura passaram.");
})().catch(error => {
  console.error(error && error.stack || error);
  process.exit(1);
});
