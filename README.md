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

## Aviso de censura por episódio

Para séries, animes e desenhos, quando o AZNude informar a temporada e o episódio na página da obra, o comando lista somente os episódios marcados da temporada consultada.

Exemplo de saída:

```text
Possível censura verificar: ep 2, 3, 4.
```

Se você calcular apenas uma faixa, por exemplo:

```text
!calculo serie elite EP1 ao 5 T8
```

o aviso considera somente os episódios dentro de EP1 a EP5. Se o site indicar episódios fora dessa faixa, eles não aparecem no aviso.

Se o site não fornecer a informação por episódio, continua valendo o aviso antigo genérico:

```text
Possível censura: verificar.
```
