const assert = require("assert");
const {
  escolherMelhorFilme,
  escolherMelhorSerie,
  tituloPareceNosResultados,
  tituloBateExatamenteNoCampo,
  normalizarConsultasCensura,
  paginaPareceSemResultado
} = require("./server");

function teste(nome, fn) {
  try {
    fn();
    console.log(`OK - ${nome}`);
  } catch (err) {
    console.error(`FALHOU - ${nome}`);
    throw err;
  }
}

teste("Chicken Run exato com o ano correto gera correspondência", () => {
  const html = '<div class="result"><a href="/movie/chicken-run-2000">Chicken Run (2000) - Nude Scenes</a></div>';
  assert.strictEqual(tituloPareceNosResultados(html, "Chicken Run", 2000), true);
});

teste("continuação recomendada não é confundida com Chicken Run", () => {
  const html = '<div class="recommendation"><a href="/movie/chicken-run-dawn-of-the-nugget-2023">Chicken Run: Dawn of the Nugget (2023)</a></div>';
  assert.strictEqual(tituloPareceNosResultados(html, "Chicken Run", 2000), false);
});

teste("mesmo título com outro ano não gera aviso", () => {
  const html = '<div class="result"><a href="/movie/the-gift-2000">The Gift (2000)</a></div>';
  assert.strictEqual(tituloPareceNosResultados(html, "The Gift", 2015), false);
});

teste("resultado exato sem ano é aceito", () => {
  const html = '<div class="result"><a href="/movie/chicken-run">Chicken Run</a></div>';
  assert.strictEqual(tituloPareceNosResultados(html, "Chicken Run", 2000), true);
});

teste("link da própria pesquisa não é contado como resultado", () => {
  const html = '<a href="/search?q=chicken-run-2000">Chicken Run 2000</a>';
  assert.strictEqual(tituloPareceNosResultados(html, "Chicken Run", 2000), false);
});

teste("nome da atriz antes do título não impede correspondência", () => {
  const html = '<div class="result"><a href="/scene/kate-winslet-titanic-nude">Kate Winslet - Titanic Nude Scene</a></div>';
  assert.strictEqual(tituloPareceNosResultados(html, "Titanic", 1997), true);
});

teste("texto no-results dentro de script não invalida página", () => {
  const html = '<script>const empty = "no results";</script><a href="/movie/titanic">Titanic</a>';
  assert.strictEqual(paginaPareceSemResultado(html), false);
  assert.strictEqual(tituloPareceNosResultados(html, "Titanic", 1997), true);
});


teste("página sem resultado com recomendações é ignorada", () => {
  const html = '<p>No results found</p><a href="/movie/chicken-run-2000">Chicken Run (2000)</a>';
  assert.strictEqual(paginaPareceSemResultado(html), true);
});

teste("ano correto de outro link vizinho não corrige ano errado do resultado", () => {
  const html = '<a href="/movie/chicken-run-2023">Chicken Run (2023)</a><a href="/movie/other-2000">Outro filme (2000)</a>';
  assert.strictEqual(tituloPareceNosResultados(html, "Chicken Run", 2000), false);
});

teste("sufixos genéricos de censura são aceitos, subtítulos não", () => {
  assert.strictEqual(tituloBateExatamenteNoCampo("Chicken Run Nude Scenes 2000", "Chicken Run"), true);
  assert.strictEqual(tituloBateExatamenteNoCampo("Chicken Run Dawn of the Nugget 2023", "Chicken Run"), false);
});

teste("TMDB usa título e ano exatos entre filmes homônimos", () => {
  const resultados = [
    { id: 1, title: "The Gift", original_title: "The Gift", release_date: "2000-03-16", popularity: 99 },
    { id: 2, title: "O Presente", original_title: "The Gift", release_date: "2015-08-07", popularity: 10 }
  ];
  assert.strictEqual(escolherMelhorFilme(resultados, "The Gift", 2015).id, 2);
  assert.strictEqual(escolherMelhorFilme(resultados, "The Gift", 2000).id, 1);
});

teste("TMDB não aceita recomendação parecida quando há ano", () => {
  const resultados = [
    { id: 3, title: "Chicken Run: Dawn of the Nugget", original_title: "Chicken Run: Dawn of the Nugget", release_date: "2023-12-08", popularity: 100 }
  ];
  assert.strictEqual(escolherMelhorFilme(resultados, "Chicken Run", 2023), null);
});

teste("séries homônimas também respeitam nome e ano", () => {
  const resultados = [
    { id: 4, name: "Lost in Space", original_name: "Lost in Space", first_air_date: "1965-09-15", popularity: 90 },
    { id: 5, name: "Perdidos no Espaço", original_name: "Lost in Space", first_air_date: "2018-04-13", popularity: 20 }
  ];
  assert.strictEqual(escolherMelhorSerie(resultados, "Lost in Space", 2018).id, 5);
});

teste("consultas de censura são separadas por título e ano", () => {
  const lista = normalizarConsultasCensura([
    { titulo: "The Gift", ano: 2000 },
    { titulo: "The Gift", ano: 2015 },
    { titulo: "The Gift", ano: 2015 }
  ]);
  assert.deepStrictEqual(lista, [
    { titulo: "The Gift", ano: "2000" },
    { titulo: "The Gift", ano: "2015" }
  ]);
});

console.log("Todos os testes passaram.");
