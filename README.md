# SPT Market Web

Aplicação web local para consultar perfis, stash, moedas e comerciantes do SPT.
O painel não altera os arquivos do jogo ou do perfil: as informações de perfil,
stash e moedas são lidas localmente.

## Tutorial de instalação e execução

### Requisitos

- Windows com uma instalação funcional do SPT 4.1.6.
- Node.js 20.9 ou superior e npm.
- .NET SDK 10 somente se for necessário compilar ou reinstalar o conector.

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

### 4. Consulte o personagem e os saldos

Escolha um personagem no seletor do cabeçalho. O painel carrega o stash, os
comerciantes e os saldos agregados de **rublos, dólares, euros e GP Coins** a
partir do perfil local. Use o botão de atualizar do inventário para reler os
dados. Se você acabou de jogar, atualize após encerrar ou salvar a sessão para
consultar o perfil atualizado.

### 5. Conector do servidor (opcional)

A leitura de perfil, stash e moedas funciona diretamente pelos arquivos locais
do SPT. O conector é um mod separado, necessário para as operações que dependem
do servidor. Para compilar contra a instalação local do SPT:

```powershell
dotnet build .\connector\SptMarketConnector.csproj -p:SPTRoot="D:\SPT"
```

Substitua `D:\SPT` pela raiz real do SPT. Copie
`connector\bin\Debug\net10.0\SptMarketConnector.dll` para
`SPT_Runtime\user\mods\SptMarketConnector\SptMarketConnector.dll` (crie a pasta
se necessário) e reinicie o servidor SPT para carregar o mod. Confirme no
painel que o estado do conector está online. Operações que dependem do PMC
também exigem que o personagem esteja carregado no servidor.

> Não copie arquivos de build para o jogo enquanto o servidor estiver ativo.
> A instalação do conector não é necessária para executar as telas de leitura.

### Solução de problemas

- **Nenhum perfil aparece:** confirme que `SPT_ROOT` aponta para a instalação
  certa e que há perfis PMC em `SPT_Runtime\user\profiles`.
- **Não foi possível ler os arquivos:** confira se o usuário do painel tem
  permissão para ler a pasta de perfis e os dados do SPT.
- **Conector offline:** confira a instalação do mod, reinicie o servidor SPT e
  consulte `GET /api/health`.
- **PMC não carregado ou resposta vazia:** entre no jogo com o personagem para
  carregar a sessão no servidor e tente novamente.
- **Dependências ou build desatualizados:** execute `npm ci`; em seguida, use
  `npm run dev` ou `npm run build`.

## Estado e limitações da integração

- **Perfis, stash e moedas:** leitura local em modo somente leitura.
- **Comerciantes:** reputação e nível de lealdade lidos do perfil.
- **Conector SPT:** fonte disponível em `connector\`; ao carregar corretamente,
  o estado do conector é exposto por `GET /api/health`.
- **Busca, compras, anúncios e transações com comerciantes:** o conector
  encaminha operações para callbacks do SPT, mas a interface ainda não monta
  todos os DTOs nativos necessários para executá-las.
- **Ofertas próprias e catálogo de comerciantes:** ainda indisponíveis (`501`).
- O painel não exibe ofertas fictícias nem escreve diretamente nos arquivos de
  perfil.

## API local

- `GET /api/health` — estado e capacidades da integração.
- `GET /api/profiles` — lista perfis locais sem expor o JSON completo.
- `GET /api/profiles/{profileId}/stash` — itens diretamente no stash e seus
  metadados visuais.
- `GET /api/profiles/{profileId}/currencies` — saldos agregados de rublos,
  dólares, euros e GP Coins.
- `GET /api/profiles/{profileId}/traders` — reputação e nível de lealdade.
- `POST /api/market/{operation}` — proxy local para operações do conector.
- `POST /api/market/my-offers` e `POST /api/market/trader-catalog` — respondem
  `501 operation_not_available` enquanto essas leituras não forem implementadas.

O servidor SPT usa HTTPS e seu certificado local; o backend do painel confia
nesse certificado e usa o protocolo esperado pelo SPT. As respostas vazias do
servidor são reportadas como erro, não como sucesso. Os servidores web de
desenvolvimento e produção escutam somente em `127.0.0.1`.
