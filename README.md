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

Para testar o guia diretamente no Render:

```text
https://SEU-SERVICO.onrender.com/api/debug-censura?titulo=elite&temporada=8
```

Exemplo do comando completo:

```text
!calculo serie elite T8
!calculo serie elite EP1 ao 5 T8
```
