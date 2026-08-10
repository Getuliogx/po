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

## Episódios específicos

```text
!calculo serie elite EP1 ao 5 T8
!calculo anime nome do anime EP2 ao 6 T1
```

Quando o AZNude tiver o guia por episódio para a série/temporada, a resposta inclui os episódios encontrados, por exemplo:

```text
Possível censura verificar: ep 2, 3, 4, 5.
```

A busca tenta primeiro a pesquisa normal do AZNude e, se ela não localizar a página, usa também o índice "Series with Episode Guides" do próprio AZNude.
