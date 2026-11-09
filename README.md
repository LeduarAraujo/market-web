# SPT Market Web

Aplicação web local para consultar perfis, stash, moedas e comerciantes do SPT.
Perfil, stash e moedas são lidos localmente. Movimentações no stash são enviadas
ao conector e processadas pelo sistema nativo de inventário do SPT, que salva a
alteração no perfil; o painel não edita diretamente o arquivo JSON. Compras são
enviadas ao servidor SPT somente após confirmação explícita.

## Tutorial de instalação e execução

### Requisitos

- Windows com uma instalação funcional do SPT 4.1.6.
- Node.js 20.9 ou superior e npm.
- O conector pré-compilado incluído neste projeto é opcional para as telas de
  leitura; instale-o para mover itens no stash e habilitar operações do Flea.
- .NET SDK 10 somente se quiser recompilar o conector em vez de usar a DLL
  incluída.

### 1. Baixe o projeto e instale as dependências

No PowerShell:

```powershell
git clone https://github.com/LeduarAraujo/market-web.git
cd market-web
npm ci
```

Se você já recebeu esta pasta do projeto, abra o PowerShell nela e execute
`npm ci`.

### 2. Configure o caminho do SPT, se necessário

Por padrão, o projeto procura a instalação do SPT na pasta pai de `market-web`.
Por exemplo, com o projeto em `D:\SPT\market-web`, a raiz do SPT será `D:\SPT`.
Se a instalação estiver em outro local, crie o arquivo `.env.local` na pasta do
projeto com o caminho correto:

```dotenv
SPT_ROOT=D:\Caminho\Para\SPT
```

O caminho informado deve conter `SPT_Runtime` e os dados da instalação. Reinicie
o servidor web depois de alterar essa configuração. `.env.local` é uma
configuração local e não deve ser enviada ao Git.

### 3. Inicie o painel

```powershell
npm run dev
```

Abra [http://127.0.0.1:3000](http://127.0.0.1:3000) no navegador. Mantenha o
terminal aberto enquanto estiver usando o painel. O servidor Next fica
vinculado ao loopback e não deve ser exposto à rede.

Para executar a versão de produção localmente:

```powershell
npm run build
npm run start
```

### 4. Selecione um perfil e consulte os dados

Ao abrir o painel, somente a lista de perfis é carregada. Clique em **ABRIR
PERFIL** para iniciar a sessão; então o painel carrega stash, comerciantes,
catálogo do flea e saldos agregados de **rublos, dólares, euros e GP Coins**.
A sessão selecionada é mantida em um cookie local `HttpOnly` por até 30 dias.
Use **SAIR** para encerrar a sessão neste navegador. O painel lê os dados do
perfil local. No stash, arraste um item para uma posição livre. O conector envia
a movimentação ao sistema de inventário do SPT, que valida a posição e salva a
alteração no perfil. A grade do stash mantém 10 colunas; itens já salvos fora
dessa área são destacados abaixo da grade para que possam ser reposicionados.
As dimensões e a orientação dos itens seguem os dados do perfil.

Use o botão de atualizar do inventário para reler os dados. Se você acabou de
jogar, atualize após encerrar ou salvar a sessão para consultar o perfil
atualizado.

### 5. Instale o conector do servidor (opcional)

A leitura de perfil, stash e moedas funciona sem instalar mods. Para a
integração com o servidor, este projeto inclui o mod pré-compilado em
`connector\release\SptMarketConnector\SptMarketConnector.dll`. Ele foi
compilado para SPT 4.1.6. Siga os passos:

1. Pare o servidor SPT antes de instalar ou substituir o mod. Não é necessário
   alterar os arquivos do cliente/jogo.
2. No PowerShell aberto na pasta `market-web`, informe a raiz da instalação do
   SPT e copie a DLL:

```powershell
$sptRoot = 'D:\SPT'
$modsPath = Join-Path $sptRoot 'SPT_Runtime\user\mods\SptMarketConnector'
New-Item -ItemType Directory -Path $modsPath -Force | Out-Null
Copy-Item -LiteralPath '.\connector\release\SptMarketConnector\SptMarketConnector.dll' `
  -Destination (Join-Path $modsPath 'SptMarketConnector.dll') -Force
```

Se o SPT estiver em outro local, substitua `D:\SPT` pelo caminho que contém a
pasta `SPT_Runtime`. Inicie o servidor SPT novamente: ele detecta o mod ao
iniciar. Confira no log do servidor a mensagem de carregamento do **SPT Market
Connector** e, com o painel aberto, confirme que o estado aparece como
**CONECTOR ONLINE**. Operações que dependem do PMC também exigem que o
personagem esteja carregado no servidor.

> A única alteração necessária na instalação do SPT é adicionar essa DLL à
> pasta de mods do servidor. Não copie o conector para pastas do cliente/jogo.

#### Recompilar o conector (opcional)

A DLL incluída já está pronta para instalar no SPT 4.1.6; não é necessário
instalar o .NET SDK para seguir o tutorial acima. Se quiser compilar a partir
do código-fonte em `connector\`, instale o .NET SDK 10 e execute na raiz do
projeto:

```powershell
dotnet build .\connector\SptMarketConnector.csproj -p:SPTRoot="D:\SPT"
```

Substitua `D:\SPT` pela raiz do seu SPT. A DLL recompilada será gerada em
`connector\bin\Debug\net10.0\SptMarketConnector.dll`; instale-a na pasta de
mods usando o mesmo procedimento acima.

### Solução de problemas

- **Nenhum perfil aparece:** confirme que `SPT_ROOT` aponta para a instalação
  certa e que há perfis PMC em `SPT_Runtime\user\profiles`.
- **Não foi possível ler os arquivos:** confira se o usuário do painel tem
  permissão para ler a pasta de perfis e os dados do SPT.
- **Conector offline:** confira a instalação do mod, reinicie o servidor SPT e
  consulte `GET /api/health`.
- **Erro ao copiar a DLL:** confirme que o servidor foi encerrado e que `$sptRoot`
  aponta para a pasta correta, aquela que contém `SPT_Runtime`.
- **PMC não carregado ou resposta vazia:** entre no jogo com o personagem para
  carregar a sessão no servidor e tente novamente.
- **Dependências ou build desatualizados:** execute `npm ci`; em seguida, use
  `npm run dev` ou `npm run build`.

## Estado e limitações da integração

- **Perfis, stash e moedas:** leitura local em modo somente leitura.
- **Comerciantes:** reputação e nível de lealdade lidos do perfil.
- **Conector SPT:** fonte disponível em `connector\`; ao carregar corretamente,
  o estado do conector é exposto por `GET /api/health`.
- **Busca no flea e compra de ofertas em moeda:** enviadas ao servidor pelo
  conector. Cada compra exige confirmação explícita, usa os stacks da moeda do
  perfil para compor o pagamento e é validada pelo próprio SPT.
- A busca permite limitar a condição entre 0% e 100%. Itens médicos mostram o
  recurso restante e o total, por exemplo `140/400 (35%)`.
- A quantidade anunciada por oferta usa o total retornado pelo servidor SPT,
  incluindo múltiplas unidades do mesmo item em um anúncio.
- Ofertas de comerciantes ainda indisponíveis são lidas dos assorts locais e
  exibidas como bloqueadas, com o requisito de nível ou missão; elas não podem
  ser compradas pelo painel.
- **Anúncios, ofertas próprias, trocas por itens e transações com comerciantes:**
  ainda não estão disponíveis na interface.
- O painel não exibe ofertas fictícias nem escreve diretamente nos arquivos de
  perfil.
- As imagens dos itens vêm de `assets.tarkov.dev` e requerem acesso à internet;
  o restante do catálogo e da integração é lido localmente.

## API local

- `GET /api/health` — estado e capacidades da integração.
- `GET /api/profiles` — lista perfis locais sem expor o JSON completo.
- `GET /api/session` — informa o perfil selecionado no cookie local.
- `POST /api/session` — seleciona um perfil e grava sua sessão no cookie
  `HttpOnly`.
- `DELETE /api/session` — encerra a sessão e remove o cookie.
- `GET /api/profiles/{profileId}/stash` — itens diretamente no stash e seus
  metadados visuais.
- `GET /api/profiles/{profileId}/currencies` — saldos agregados de rublos,
  dólares, euros e GP Coins.
- `GET /api/profiles/{profileId}/traders` — reputação e nível de lealdade.
- `GET /api/market/catalog` — categorias, subcategorias e itens do handbook SPT.
- `POST /api/market/search` — busca real de ofertas de um item no servidor SPT.
- `GET /api/market/locked-offers?templateId={id}` — ofertas de comerciantes
  bloqueadas para o perfil selecionado, derivadas dos assorts locais.
- `POST /api/market/buy` — compra confirmada de uma oferta paga em rublos,
  dólares ou euros.
- `POST /api/market/{operation}` — proxy local para operações do conector.
- `POST /api/market/my-offers` e `POST /api/market/trader-catalog` — respondem
  `501 operation_not_available` enquanto essas leituras não forem implementadas.

O servidor SPT usa HTTPS e seu certificado local; o backend do painel confia
nesse certificado e usa o protocolo esperado pelo SPT. As respostas vazias do
servidor são reportadas como erro, não como sucesso. Os servidores web de
desenvolvimento e produção escutam somente em `127.0.0.1`. As rotas de dados
do perfil e do mercado exigem que o perfil esteja selecionado no cookie da
sessão atual.
