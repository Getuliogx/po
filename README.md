# po

API TMDB cálculo online para StreamElements.

## Exemplos do comando

Filme:

```text
!calculo filme gente grande
!calculo filme gente grande 2
!calculo filme premonição 2
!calculo filme a mumia 1999
!calculo filmes senhor dos anéis
!calculo filme senhor dos anéis as duas torres
```

Quando o nome digitado corresponde a uma franquia, a busca sem subtítulo escolhe o primeiro filme lançado da coleção. Se você informar um número, subtítulo ou ano, essa informação continua tendo prioridade.

Exemplo: `!calculo filmes senhor dos anéis` seleciona **O Senhor dos Anéis: A Sociedade do Anel**, e não uma continuação mais popular.

Quando um ano é informado, a busca respeita exatamente esse ano e não troca silenciosamente por outra versão.

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


## Busca de censura corrigida

A verificação de censura agora usa o título real encontrado no TMDB junto com o ano de lançamento.

Ela só mostra `Possível censura: verificar.` quando encontra um resultado exato com:

- o mesmo título, em português ou no título original;
- o mesmo ano do filme selecionado;
- um link real de resultado, e não o link da própria pesquisa.

Recomendações parecidas, continuações, remakes de outro ano e páginas que informam que não encontraram resultados são ignoradas.

Exemplo:

```text
!calculo filme chicken run 2000
```

`Chicken Run: Dawn of the Nugget (2023)` não é mais confundido com `Chicken Run (2000)`.

A busca principal do TMDB também ficou mais rígida quando um ano é informado: título e ano precisam corresponder, evitando selecionar outro filme homônimo ou uma recomendação apenas parecida.
