# po

API TMDB cálculo online para StreamElements.

## Exemplos do comando

Filme:

```text
!calculo filme gente grande
!calculo filme gente grande 2
!calculo filme premonição 2
!calculo filme a mumia 1999
```

Série, anime ou desenho:

```text
!calculo serie glee 1
!calculo serie perdidos no espaço 2018 T1
!calculo anime dragon ball z 1989 T1
!calculo desenho ben 10 2005 T1
```

Coletânea de filmes:

```text
!calculo coletanea rambo
!calculo coletanea rambo 2 ao 5
!calculo coletanea velozes e furiosos 1 ao 3
```

## Formatos aceitos para temporada

```text
1
T1
t1
S1
temporada 1
temp 1
```

Observação: número simples no final só vira temporada quando você usa `serie`, `anime` ou `desenho`. Assim filmes como `Premonição 2`, `Gente Grande 2` e `Distrito 9` não são confundidos com temporada.

## Censura por episódio (AZNude)

Quando o AZNude tiver guia `By Episode`, séries/animes/desenhos podem retornar, por exemplo:

```text
Possível censura verificar: ep 2, 3, 4, 5, 7, 8.
```

A busca não fica presa a uma lista pequena de séries: o pacote já inclui o catálogo completo e o índice validado de **Series with Episode Guides**. A atualização online apenas renova esse índice em segundo plano.

Para testar qualquer série diretamente no Render:

```text
https://SEU-SERVICO.onrender.com/api/debug-censura?titulo=bridgerton&temporada=4
https://SEU-SERVICO.onrender.com/api/debug-censura?titulo=yellowstone&temporada=5
```

Para conferir se o índice completo já foi carregado:

```text
https://SEU-SERVICO.onrender.com/api/debug-indice-censura
```

Exemplos do comando completo:

```text
!calculo serie bridgerton T4
!calculo serie yellowstone T5
!calculo serie tell me lies T2
!calculo serie elite EP1 ao 5 T8
!calculo serie elite T8 EP1 ao EP5
```

O episódio pode vir antes ou depois da temporada. Os dois últimos exemplos são equivalentes.

## Índice completo incluído

O arquivo `aznude-guide-index.json` faz parte obrigatória do projeto e deve ser enviado ao GitHub junto com `server.js`, `package.json` e `README.md`.

Ele já leva:

- 69.635 títulos do catálogo para localizar a página correta sem depender de uma busca demorada no cold start;
- 3.204 títulos (3.258 URLs) confirmados nas 136 páginas atuais de `Series with Episode Guides`;
- todas as URLs homônimas preservadas, com prioridade para a que realmente aparece no guia por episódio.

O servidor rejeita páginas de bloqueio como `Site Unavailable`, mesmo quando elas respondem HTTP 200. A atualização online roda lentamente em segundo plano para não consumir o limite usado pelo comando do chat.

Para páginas muito grandes, a leitura pede somente os blocos ocultos `By Episode`. Isso evita perder episódios que não aparecem na versão resumida da página.

## Resultado esperado nos testes

```text
Elite T8: ep 2, 3, 4, 5, 7, 8
Bridgerton T4: ep 3, 4, 5, 8
Tell Me Lies T2: ep 1, 2, 3, 4, 7, 8
Yellowstone T5: ep 4, 6, 8, 10, 13
Shameless T11: ep 2, 4, 6, 7, 11, 12
```

No endpoint `/api/debug-indice-censura`, o projeto inicia com `pronto: true`, `guiasConfirmados: 3204`, `paginas: 136` e `falhas: 0` porque o índice validado já está dentro do pacote.
