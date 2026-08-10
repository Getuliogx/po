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

## Aviso de censura por episódio (AZNude)

Quando o AZNude tiver o guia **By Episode** para a série e temporada, a resposta informa os episódios encontrados.

Exemplos:

```text
!calculo serie elite T8
# ... Possível censura verificar: ep 2, 3, 4, 5, 7, 8.

!calculo serie elite EP1 ao 5 T8
# ... Possível censura verificar: ep 2, 3, 4, 5.
```

Se o guia por episódio não estiver disponível, continua usando o aviso genérico antigo das fontes de censura.

`DEBUG_CENSURA=true` é opcional e só serve para mostrar no log qual caminho de consulta foi usado.

## Diagnóstico da censura por episódio

Depois do deploy, para testar diretamente no próprio Render sem depender do StreamElements, abra:

```text
https://SEU-RENDER.onrender.com/api/debug-censura?titulo=elite&temporada=8
```

Quando o acesso estiver funcionando, deve retornar `episodios` com:

```text
[2,3,4,5,7,8]
```

Esse diagnóstico não muda o comando. Ele existe para mostrar claramente se o Render conseguiu localizar a página da série e ler o guia `By Episode`.
