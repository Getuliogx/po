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

## Aviso de possível censura

Quando o sistema encontra indícios de cenas sensíveis (principalmente no AZNude), a resposta inclui um aviso:

- Filmes / coletâneas: `Possível censura: verificar.`
- Séries / animes / desenhos: se conseguir identificar os episódios da temporada, mostra algo como  
  `Possível censura verificar: ep 2, 3, 4, 8`
