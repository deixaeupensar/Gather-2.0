# Voxel Hub

Mundo 3D de blocos para o time: todo mundo constrói junto, com **chat de voz por proximidade**, **compartilhamento de tela** (aparece flutuando em cima do avatar, e dá para abrir em tela cheia) e **chat de texto**. O mundo fica salvo no servidor.

Não precisa de `npm install`: o servidor é Node.js puro, e a biblioteca 3D (three.js) é carregada no navegador pela CDN jsDelivr.

## Rodar

Requisito: [Node.js](https://nodejs.org) 18 ou mais novo, só no PC que vai ser o servidor.

```bash
node server.js
```

No Windows dá para só dar dois cliques em `iniciar.bat`.

O terminal mostra os endereços, por exemplo:

```
Neste PC:   https://localhost:3000
Na rede:    https://192.168.0.15:3000
```

- **Quem está na mesma rede** abre o endereço "Na rede" no Chrome ou no Edge.
- O certificado HTTPS é autoassinado, então o navegador avisa: clique em **Avançado → Continuar**. O HTTPS é obrigatório porque o navegador só libera microfone e tela em sites seguros.
- Na primeira vez o Firewall do Windows pede permissão para o Node: libere para **redes privadas/de domínio**.
- `Ctrl+C` no terminal salva o mundo e encerra. O mundo também é salvo sozinho a cada 15 segundos.

## Controles

| Tecla | Ação |
|---|---|
| W A S D | andar (Shift corre) |
| Espaço | pular · duas vezes rápido = voar |
| F | ligar/desligar voo (no voo: Espaço sobe, Shift desce) |
| Botão esquerdo | quebrar bloco |
| Botão direito | colocar bloco |
| Botão do meio | copiar o bloco que está olhando |
| 1–9 / rodinha | escolher item na barra |
| E | inventário (blocos, modelos 3D, ferramentas) |
| R | girar o modelo 3D antes de colocar |
| Enter ou T | chat |
| M | microfone |
| N | redução de ruído: normal / forte / sem filtro |
| G | compartilhar tela flutuando sobre você |
| V | voz: proximidade ↔ todos ouvem todos |
| Esc | menu: continuar, configurações (sensibilidade, campo de visão, distância, volume, voz, ruído, microfone), controles, telas compartilhadas, inventário, sair |

Os indicadores no canto da tela só mostram o estado de cada coisa e a tecla que liga/desliga.

Na voz por proximidade você ouve as pessoas mais alto quando está perto, com o som vindo da direção delas, e para de ouvir a partir de uns 30 blocos de distância.

### Tela (TV) de parede
No inventário, aba de decoração, pegue a **Tela (TV) para compartilhar** e coloque numa parede com o **botão direito**. Ela é fina, como o quadro Kanban, e não ocupa um bloco. Clique nela com o **botão direito**: o navegador pergunta qual tela/janela transmitir, e ela aparece na TV para todo mundo. A resolução enviada fica limitada a 1920×1080 a 15 fps, então uma TV gigante não pesa mais que uma pequena.
- Botão direito de novo na sua TV: para de transmitir.
- Botão direito na TV de outra pessoa: abre a tela dela em tela cheia.
- **Shift + botão direito** na TV: muda o tamanho (1 a 16 de largura, 1 a 5 de altura). Uma TV 16:9 fica bem em 5×3 ou 7×4.
- O antigo bloco Tela saiu do inventário. `node tools/trocar-telas.js` (com o servidor parado) troca painéis de blocos Tela por TVs do mesmo tamanho.

### Modelos 3D
No inventário (**E**), aba **Modelos 3D**, escolha o arquivo (.obj com .mtl e texturas, .fbx, .glb/.gltf ou .stl, todos juntos), dê um nome e diga o tamanho em blocos. Ex.: uma mesa de **2 de largura × 1 de profundidade**. Deixe a altura em branco para manter a proporção. O modelo é convertido e fica na biblioteca para todo mundo.
- **Botão direito** coloca (aparece uma prévia azul; vermelha se não couber), **R** gira, **botão esquerdo** remove.
- Os modelos não têm colisão: dá para atravessar.

### Decoração e Natal
No inventário, abas **Decoração** e **Natal**: mesas, cadeiras, cadeira de escritório, sofá, pufe, monitor (simples e duplo), teclado, notebook, caneca, planta, luminária, tapete, lixeira, bebedouro, quadro, árvore de Natal, presentes, boneco de neve, guirlanda, meia, pisca-pisca, bengala e estrela.
- Mirando no tampo de um móvel com outro item na mão, ele vai **em cima** (ex.: monitor na mesa).
- Itens de parede (quadro, guirlanda, meia, pisca-pisca, estrela) encostam na parede mirada.
- **Botão direito numa cadeira, sofá ou pufe: senta.** Espaço ou WASD levanta.

### Quadro com imagem
Coloque o **Quadro** numa parede: abre uma janela para colar o **link da imagem** (ou enviar um arquivo) e escolher o tamanho em blocos. Todo mundo vê. Botão direito no quadro troca a imagem. Se o site da imagem bloquear o navegador, o servidor tenta buscá-la (só endereços públicos da internet); se não conseguir, envie o arquivo.

### Som bloqueado por paredes
No modo de voz por proximidade, o som se espalha pelo ar: numa sala fechada ninguém de fora ouve. Se tiver uma porta ou buraco, a voz chega dando a volta, mais baixa e abafada. Paredes, teto, chão e vidro bloqueiam; folhas deixam passar. No modo "todos ouvem todos" isso não se aplica.

### Mapa
Minimapa no canto superior esquerdo, com todo mundo. Segure **Tab** para ver o mapa do mundo inteiro com os nomes.

### Escritório pronto
`gerar-escritorio.bat` (ou `node tools/gerar-escritorio.js`), **com o servidor parado**, constrói no centro do mundo um prédio com: 20 salas em volta (Salas 01–14, Copa, Recepção com entrada, Sala de Descanso), corredor em anel, e 4 salas de reunião de vidro no meio (Reunião A–D) com mesa grande, cadeiras e painel de Tela para transmitir. Tudo decorado (mesas com monitores, cadeiras, plantas, tapetes, luminárias, árvores de Natal, presentes, bonecos de neve, guirlandas, pisca-pisca) e com as **salas já demarcadas**. Faz backup de `data/` antes (`data/backup-…`); pode rodar de novo que ele refaz a área sem duplicar.

### Kanban do time
Uma parede inteira da **Reunião B** é o Kanban do time (12×3 blocos). **Botão direito** abre o quadro como um site por cima do jogo (Esc ou ✕ volta).
- **Por estado** (colunas = estados) ou **Por pessoa** (colunas = pessoas, só tarefas não finalizadas). Clicar no nome de uma pessoa abre o kanban por estado dela.
- Tarefas com título, descrição, estado, responsável, prioridade (crítica/alta/média/baixa), tipo (tarefa/bug/melhoria/estudo/reunião), prazo, estimativa, tags, ID e link do Azure e comentários. Arraste os cartões para mudar de estado ou de responsável.
- **Pessoas** e **Colunas** são editáveis no próprio quadro. Use o mesmo nome do jogo para o "Minhas tarefas" funcionar.
- Itens no inventário (aba Decoração): **Quadro Kanban do time** e **Minhas tarefas** (cada pessoa vê as próprias tarefas). Dados em `data/kanban.json`; a página também abre direto em `/kanban.html`.

### ServiceNow (chamados dos grupos)
Os quadros da **Reunião D** mostram as **tarefas de catálogo (sc_task)** de cada grupo, em duas vias: arrastar muda o estado, trocar o atribuído muda no ServiceNow (inclusive "Sem atribuição"), e cada mudança vira uma *work note* com o nome e o e-mail de quem mexeu. As colunas são os estados (Aberto, Em andamento, Pendente, Fechado — fechados dos últimos 7 dias). A lista atualiza a cada minuto.

Configuração: copie `data/servicenow.example.json` para `data/servicenow.json` e preencha `instance`, `user`, `password` e o `name` exato de cada grupo. A senha também pode ficar fora do arquivo, na variável de ambiente `SN_PASSWORD`. O servidor recarrega o arquivo sozinho ao salvar. Em qualquer quadro Kanban, **Shift + botão direito** escolhe o que ele mostra (Kanban do time ou um grupo do ServiceNow).

O jogo não tem login com senha: quem abre o site pode mover chamados pelo usuário de integração. As *work notes* registram quem foi, mas use só na rede interna.

### Login com e-mail
Na entrada pedimos o e-mail corporativo. Quem entra é cadastrado automaticamente em **Pessoas** do Kanban pelo e-mail (o nome é atualizado se mudar), e é pelo e-mail que a pessoa é ligada ao usuário do ServiceNow.

### Prédio protegido e Marreta de obra
A estrutura do prédio (paredes, chão, teto, vidros, telas) não quebra. Para obras, use a **Marreta de obra** (inventário → Ferramentas). Decorações continuam livres. `node tools/atualizar-predio.js` (servidor parado) reaplica concreto, proteção, portas e o Kanban da Reunião B.

### Portas e cadeado
As passagens do prédio têm **portas automáticas** que abrem quando alguém chega perto. Com a sala trancada a porta fica fechada com um **cadeado vermelho** para quem está fora. Dentro de uma sala aparece o botão **Trancar/Destrancar** na lateral (ou **L**).

### Natal
`node tools/natal.js` (servidor parado) espalha a decoração de Natal extra: festão com luzes em todos os corredores, bolas penduradas, sinos e presentes nas salas, velas nas reuniões, árvore gigante e Papai Noel na recepção, trenó com renas, pinheiros com neve e neve no chão do lado de fora. `node tools/natal.js --remover` tira tudo de novo (bom para depois das festas). Todas as decorações também estão no inventário, aba **Natal**.

### Quadros com o logo
`node tools/colocar-quadros.js [imagem.png]` (servidor parado) espalha quadros com a imagem pelo escritório: um em cada sala, dois em cada sala de reunião, um grande na recepção, dois na fachada e vários nos corredores. Padrão: `assets/logo-hapvida.png`. Rodar de novo troca os quadros antigos (os outros objetos não mudam).

### Salas e cadeado
Quem está dentro de uma sala **só ouve quem está dentro**, e quem está fora não ouve quem está dentro, nos dois modos de voz. O nome da sala aparece embaixo do minimapa e as salas aparecem no mapa.
- **Criar sala:** inventário → Ferramentas → **Demarcador de sala**. Botão direito num canto e no canto oposto (se clicar no chão, a sala sobe 6 blocos), depois dê um nome. Botão esquerdo dentro de uma sala apaga a sala.
- **Cadeado:** dentro da sala, aperte **L** para trancar: ninguém de fora consegue entrar (a sala fica com um brilho vermelho para quem está fora). **L** de novo destranca. Ela destranca sozinha quando todo mundo sai.

### Status de presença
**P** troca entre 🟢 Disponível, 🔴 Não disponível, 🟡 Ausente e 🟣 Em reunião (também no menu do Esc). Em *Disponível* ele é automático: vira *Em reunião* numa sala com "Reunião" no nome e *Ausente* depois de 5 minutos sem mexer. Aparece como bolinha colorida no nome do avatar e na lista.

### Skins
Menu (Esc) → Configurações → **Escolher skin…**:
- **Galeria:** 18 skins originais geradas na hora (🎲 gera mais). Clique para usar; botão direito leva para o editor.
- **Criar:** escolha pele, cabelo (estilo e cor), olhos, roupa (camiseta, manga longa, moletom, camisa e gravata, terno), cores, calça, sapato e acessório (óculos, barba, bigode, boné, fone). Dá para baixar o PNG.
- **Por nome:** usa a skin de uma conta do Minecraft pelo nome (via mc-heads.net/minotar.net). **A rede da empresa bloqueia esses sites**, então só funciona com o servidor numa rede sem esse filtro.
- **Arquivo:** PNG 64×64 ou 64×32 no layout padrão (inclusive camadas de chapéu/jaqueta/mangas).
- **Robô:** volta para o avatar padrão.

### Laser
No inventário, aba **Ferramentas**, arraste o **Laser** para a barra. Segure o **botão esquerdo** mirando numa Tela (TV): aparece um pontinho vermelho que todo mundo vê. Fora da tela o laser não faz nada.

### Inventário
**E** abre. Arraste itens da lista para a barra, arraste entre espaços para trocar de lugar, e arraste um espaço de volta para a lista (ou botão direito nele) para esvaziar.

### Redução de ruído
O microfone passa por supressão de ruído do navegador, filtros (corta zumbido grave e chiado agudo), compressor e um portão que deixa o microfone mudo enquanto você não fala. O botão **🎚️ Ruído** alterna entre *normal*, *forte* (para lugares barulhentos) e *sem filtro*. O botão do mic fica com borda verde quando sua voz está passando.

## Configurações (variáveis de ambiente)

| Variável | Padrão | Para quê |
|---|---|---|
| `PORT` | `3000` | porta |
| `HTTP=1` | desligado | serve HTTP puro, para usar atrás de um proxy/túnel que já entrega HTTPS |
| `CERT_FILE` / `KEY_FILE` | — | usar um certificado de verdade (PEM) em vez do autoassinado |
| `ICE_SERVERS` | STUN do Google | JSON com STUN/TURN para o WebRTC, ex.: `[{"urls":"turn:meu-servidor:3478","username":"u","credential":"s"}]` |

Exemplo no PowerShell: `$env:PORT=8443; node server.js`

## Arquivos

- `data/world.bin`: o mundo salvo (256×64×256 blocos). Faça backup copiando a pasta `data/` inteira. Apague `world.bin` para gerar um mundo novo.
- `data/models/` e `data/models.json`: a biblioteca de modelos 3D. `data/objects.json`: os modelos colocados no mundo.
- `data/certs/`: o certificado HTTPS gerado. **Apague essa pasta se o IP do PC servidor mudar**, para gerar um novo certificado.
- `server.js`: servidor (arquivos, WebSocket, mundo, sinalização WebRTC)
- `lib/ws-lite.js`: WebSocket sem dependências
- `public/js/`: o jogo (`main.js` controles/interface, `world.js` malha 3D, `blocks.js` blocos e texturas, `avatars.js`, `rtc.js` voz e tela)

## Limites e observações

- Voz e tela são P2P em malha: cada pessoa conecta direto com cada outra. Funciona bem até umas 10–12 pessoas. Mais do que isso pede um servidor de mídia (SFU).
- **Pessoas** (Esc → 👥 Pessoas online): mostra a sala de cada um; 📍 mostra no mapa (com destaque piscando), **➜ Ir até** leva você para o lado da pessoa (não entra em sala trancada), **🔔 Chamar** toca um aviso para ela (e aviso do navegador se o jogo estiver em outra aba). Quem está "Em reunião" ou "Não disponível" não recebe chamadas. Quem é chamado aperta **Y** para ir até quem chamou.
- **Agenda das salas** (tecla **B** dentro da sala): reservas só do Voxel Hub, salvas em `data/reservas.json`. Não deixa reservar horário que já está ocupado; quem reservou (ou o dono da sala) cancela. A placa em cima das portas das salas de reunião (ou com reserva no dia) mostra "Livre" / "Ocupada até 15:00", e o nome da sala no canto da tela também.
- **Quadro branco interativo** (inventário → Móveis e parede): botão direito abre para desenhar com o mouse (cores, espessuras, borracha, desfazer, limpar); o 🔦 laser também desenha nele. Todo mundo vê ao vivo; fica salvo em `data/lousas.json`.
- **Painel de alertas** (inventário → Móveis e parede): mostra chamados/tarefas **atrasados** e **sem responsável** de um grupo do ServiceNow (ou do Kanban do time) e pisca em vermelho enquanto houver algum. Shift + botão direito escolhe o grupo e o tamanho.
- **Compartilhar tela com som**: ao escolher o que compartilhar, marque "Compartilhar áudio" (aba: som da aba; tela inteira: som do computador, sem o som do próprio jogo). O som sai mais alto perto da tela e só para quem está na mesma sala ou assistindo em tela cheia. Várias pessoas podem compartilhar ao mesmo tempo, cada uma numa TV.
- **F1** esconde toda a interface (tela limpa); F1 de novo mostra. Abrir o chat também mostra a interface.
- Quadro Kanban na parede: **Shift + botão direito** → "Colunas que aparecem no quadro" escolhe quais colunas aparecem (cada quadro tem a sua escolha). A página do Kanban (botão direito) continua mostrando todas.
- Desempenho: as decorações são desenhadas em lotes por região; objetos pequenos (caneca, teclado, lata…) somem a partir de 40 blocos (LOD); as cópias usadas só para a mira ficam fora da cena; objetos parados não recalculam a posição a cada quadro.
- Dono de sala (tecla **K** dentro de uma sala sem dono): só o dono coloca/quebra blocos e objetos dentro dela, incluindo paredes, chão e teto. O dono pode liberar a sala (K de novo) e renomeá-la (no chat da sala). O dono é identificado pelo e-mail do login, sem senha: é proteção contra acidente, não contra quem quer burlar. Se o dono sair da empresa, rode o servidor com `ADMIN_EMAILS=seu@email` para poder liberar qualquer sala.
- Chat da sala (tecla **J**): fica salvo em `data/room-chat.json` (últimas 300 mensagens por sala). Só quem está dentro da sala (ou o dono) lê e escreve. Links ficam clicáveis.
- O login (nome/e-mail) fica salvo no navegador e a pessoa entra direto. **Esc → Sair da conta** esquece o login; **Sair do mundo** volta para a tela de entrada uma vez.
- Compartilhamento de tela: o vídeo só vai para quem está a até ~45 blocos da tela (ou com ela aberta em tela cheia). Quem está longe não recebe nada, e a banda fica para quem assiste: cerca de 8 Mbps de envio no total, entre 1,2 e 4 Mbps por pessoa. O codec preferido é o VP9, depois o H.264. Em **Configurações → Compartilhar tela** dá para escolher **Texto** (nítido, até 15 quadros/s, bom para planilha e código) ou **Vídeo** (fluido, até 30 quadros/s).
- Na mesma rede funciona direto. Para quem está em casa ou em outra rede, o servidor precisa estar acessível pela internet (VPS, túnel tipo Cloudflare Tunnel com `HTTP=1`) e, em redes corporativas, provavelmente um servidor TURN (o [coturn](https://github.com/coturn/coturn) é gratuito).
- Se a CDN jsDelivr for bloqueada na rede, rode `npm install` uma vez (com acesso ao registro npm) e o servidor passa a servir o three.js localmente.
- Para adicionar blocos novos, edite a lista `BLOCKS` em `public/js/blocks.js`, **sempre no final** (os ids ficam salvos no mundo).
