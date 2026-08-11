# po - censura por episódio

Versão refeita sobre o `po-main(3).zip`.

- Não possui lista fixa de séries.
- Não percorre as 136 páginas do guia.
- Localiza a série pela busca do AZNude e, em paralelo, pelo catálogo A-Z.
- Lê `Season X Episode Y` diretamente na página da série.
- Mantém o aviso genérico antigo como fallback.
- Mantém intervalos como `EP1 ao 5 T8`.

Teste de diagnóstico depois do deploy:

`/api/debug-censura?titulo=bridgerton&temporada=4`

O JSON deve trazer a URL encontrada e a lista de episódios.
