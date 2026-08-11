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

A busca não usa uma lista fixa de séries. O servidor monta em segundo plano o índice completo de **Series with Episode Guides** do AZNude e, se o índice ainda não estiver pronto, procura o título no catálogo A-Z do próprio site.

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
```

## Correção do índice completo

Todas as páginas de `/browse/movies/guide/1.html` até a última página detectada usam o mesmo fallback. Isso evita o defeito em que apenas os títulos da página 1 funcionavam quando o Render recebia bloqueio no acesso direto ao AZNude.

`/api/debug-indice-censura` também mostra `falhas`; o ideal é `falhas: 0` depois da varredura.
