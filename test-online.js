process.env.NODE_ENV = "test";

const assert = require("assert/strict");
const api = require("./server");

const casos = [
  ["elite", 8, [2, 3, 4, 5, 7, 8]],
  ["bridgerton", 4, [3, 4, 5, 8]],
  ["tell me lies", 2, [1, 2, 3, 4, 7, 8]],
  ["yellowstone", 5, [4, 6, 8, 10, 13]],
  ["shameless", 11, [2, 4, 6, 7, 11, 12]]
];

(async () => {
  for (const [titulo, temporada, esperado] of casos) {
    const inicio = Date.now();
    const resultado = await api.buscarCensuraPorEpisodioAZNude(
      [titulo], temporada, null, null
    );
    assert.equal(resultado.status, "ok", `${titulo}: ${resultado.status}`);
    assert.deepEqual(resultado.episodios, esperado, titulo);
    console.log(`${titulo} T${temporada}: ${resultado.episodios.join(", ")} (${Date.now() - inicio} ms)`);
  }
  console.log("OK: testes online da censura passaram.");
})().catch(error => {
  console.error(error && error.stack || error);
  process.exit(1);
});
