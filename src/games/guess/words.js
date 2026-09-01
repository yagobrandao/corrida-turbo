// Banco de palavras do Adivinhe.
//
// Formato compacto: cada categoria tem etiquetas-base (herdadas por todas as
// palavras dela) e cada palavra tem as suas próprias. A proximidade semântica
// nasce do CRUZAMENTO dessas etiquetas — duas palavras que compartilham muitas
// etiquetas são "quentes" uma para a outra (ver proximity.js).
//
// Regras dos dados: tudo minúsculo e SEM acento (o normalizador do jogo
// remove acentos do palpite antes de comparar).
const RAW = {
  animais: {
    base: ['animal', 'bicho', 'natureza'],
    words: {
      cachorro: 'pet,domestico,cao,latido,fiel', gato: 'pet,domestico,felino,miado',
      cavalo: 'fazenda,montaria,galope', vaca: 'fazenda,leite,pasto', boi: 'fazenda,pasto,chifre',
      porco: 'fazenda,lama', galinha: 'fazenda,ave,ovo', galo: 'fazenda,ave,canto',
      pato: 'ave,agua,lago', leao: 'selvagem,felino,juba,savana', tigre: 'selvagem,felino,listras',
      onca: 'selvagem,felino,pintas,floresta', elefante: 'selvagem,tromba,gigante,savana',
      girafa: 'selvagem,pescoco,savana', zebra: 'selvagem,listras,savana',
      macaco: 'selvagem,floresta,banana,arvore', gorila: 'selvagem,floresta,forte',
      urso: 'selvagem,floresta,mel', lobo: 'selvagem,floresta,uivo,matilha',
      raposa: 'selvagem,floresta,esperta', coelho: 'pet,orelhas,cenoura,pulo',
      rato: 'pequeno,queijo,esgoto', hamster: 'pet,pequeno,roda',
      passaro: 'ave,voo,canto,asa', papagaio: 'ave,fala,colorido', arara: 'ave,colorido,floresta',
      coruja: 'ave,noite,sabedoria', aguia: 'ave,voo,caça,visao', pinguim: 'ave,gelo,frio',
      avestruz: 'ave,corrida,grande', tucano: 'ave,bico,floresta',
      peixe: 'agua,mar,aquario,nadar', tubarao: 'agua,mar,dentes,perigo',
      baleia: 'agua,mar,gigante', golfinho: 'agua,mar,inteligente,salto',
      polvo: 'agua,mar,tentaculos', tartaruga: 'agua,casco,lenta',
      sapo: 'agua,lago,pulo,verde', jacare: 'agua,rio,dentes,perigo',
      cobra: 'perigo,veneno,rasteja', lagarto: 'reptil,sol,parede',
      aranha: 'inseto,teia,perigo', abelha: 'inseto,mel,flor,voo', formiga: 'inseto,trabalho,pequeno',
      borboleta: 'inseto,voo,colorido,flor', mosquito: 'inseto,voo,picada',
      camelo: 'deserto,corcova,sede', ovelha: 'fazenda,la,pasto', cabra: 'fazenda,pasto,leite',
      veado: 'selvagem,floresta,chifre', morcego: 'noite,voo,caverna',
      canguru: 'pulo,bolsa,australia', panda: 'urso,bambu,china',
    },
  },
  comidas: {
    base: ['comida', 'alimento', 'cozinha'],
    words: {
      pizza: 'italiana,queijo,massa,redonda,forno', hamburguer: 'lanche,carne,pao,fastfood',
      cachorroquente: 'lanche,salsicha,pao,fastfood', batatafrita: 'lanche,batata,frito,fastfood',
      arroz: 'graos,almoco,dia', feijao: 'graos,almoco,dia', macarrao: 'massa,italiana,molho',
      lasanha: 'massa,italiana,queijo,forno', salada: 'verdura,saudavel,folhas',
      sopa: 'quente,liquido,inverno', churrasco: 'carne,fogo,domingo,espeto',
      frango: 'carne,ave,assado', bife: 'carne,grelha,almoco', peixefrito: 'carne,mar,frito',
      ovo: 'cafe,frito,proteina', queijo: 'laticinio,leite,amarelo', presunto: 'frios,lanche',
      pao: 'padaria,cafe,trigo,forno', bolo: 'doce,festa,aniversario,forno',
      torta: 'doce,forno,fatia', pudim: 'doce,sobremesa,leite', brigadeiro: 'doce,chocolate,festa',
      chocolate: 'doce,cacau,barra', sorvete: 'doce,gelado,verao,casquinha',
      pipoca: 'cinema,milho,salgada', biscoito: 'doce,lanche,pacote', bolacha: 'doce,lanche,pacote',
      acai: 'gelado,fruta,tigela', tapioca: 'cafe,massa,nordeste', coxinha: 'salgado,frango,frito',
      pastel: 'salgado,frito,feira', esfiha: 'salgado,carne,arabe', sushi: 'japonesa,peixe,arroz',
      mel: 'doce,abelha,natural', acucar: 'doce,tempero,branco', sal: 'tempero,branco,mar',
      pimenta: 'tempero,ardido,vermelha', alho: 'tempero,cheiro,cozinha', cebola: 'tempero,choro,cozinha',
      manteiga: 'laticinio,pao,cafe', iogurte: 'laticinio,leite,saudavel',
      cereal: 'cafe,graos,leite', farinha: 'trigo,massa,padaria',
    },
  },
  frutas: {
    base: ['fruta', 'comida', 'natural', 'doce'],
    words: {
      banana: 'amarela,macaco,cacho', maca: 'vermelha,arvore,suco', laranja: 'citrica,suco,vitamina',
      limao: 'citrica,azedo,verde', uva: 'cacho,vinho,roxa', morango: 'vermelha,pequena,bolo',
      abacaxi: 'tropical,espinhosa,suco', manga: 'tropical,amarela,arvore',
      melancia: 'verde,vermelha,verao,grande', melao: 'amarelo,verao', mamao: 'tropical,cafe,laranja',
      coco: 'tropical,praia,agua', abacate: 'verde,vitamina,cremoso', goiaba: 'tropical,doce,vermelha',
      pera: 'verde,arvore,suave', pessego: 'macio,doce,rosado', ameixa: 'roxa,pequena',
      cereja: 'vermelha,pequena,bolo', kiwi: 'verde,azedo,peludo', maracuja: 'azedo,suco,calmante',
      caju: 'tropical,castanha,suco', acerola: 'vermelha,vitamina,pequena',
    },
  },
  objetos: {
    base: ['objeto', 'coisa'],
    words: {
      cadeira: 'movel,sentar,casa', mesa: 'movel,casa,comer', sofa: 'movel,sala,sentar,macio',
      cama: 'movel,quarto,dormir', armario: 'movel,roupa,guardar', estante: 'movel,livros,guardar',
      espelho: 'banheiro,reflexo,vidro', janela: 'casa,vidro,luz', porta: 'casa,entrada,chave',
      chave: 'porta,abrir,metal', cadeado: 'trancar,seguranca,metal',
      relogio: 'tempo,hora,pulso,parede', oculos: 'visao,olhos,lente', bolsa: 'carregar,roupa,mulher',
      mochila: 'carregar,escola,costas', carteira: 'dinheiro,bolso,documento',
      guardachuva: 'chuva,proteger,aberto', chapeu: 'cabeca,sol,roupa', bone: 'cabeca,sol,roupa',
      escova: 'dente,cabelo,banheiro', pente: 'cabelo,banheiro', sabonete: 'banho,limpeza,cheiro',
      toalha: 'banho,secar,pano', travesseiro: 'cama,dormir,macio', cobertor: 'cama,frio,quente',
      panela: 'cozinha,fogao,comida', prato: 'cozinha,comida,mesa', copo: 'cozinha,bebida,vidro',
      garrafa: 'bebida,agua,plastico', faca: 'cozinha,cortar,afiada', garfo: 'cozinha,comida,mesa',
      colher: 'cozinha,sopa,mesa', tesoura: 'cortar,papel,afiada', martelo: 'ferramenta,prego,bater',
      prego: 'ferramenta,parede,metal', parafuso: 'ferramenta,apertar,metal',
      chavedefenda: 'ferramenta,parafuso', serrote: 'ferramenta,madeira,cortar',
      escada: 'subir,degraus,altura', corda: 'amarrar,pular,forte', balde: 'agua,limpeza,carregar',
      vassoura: 'limpeza,varrer,chao', caneta: 'escrever,tinta,escola', lapis: 'escrever,escola,apontar',
      caderno: 'escrever,escola,folhas', livro: 'ler,paginas,historia,escola',
      papel: 'escrever,folha,branco', borracha: 'apagar,escola,lapis',
      regua: 'medir,escola,reta', mapa: 'lugar,viagem,caminho', bola: 'esporte,redonda,jogo',
      pipa: 'ceu,vento,brincadeira,linha', boneca: 'brinquedo,crianca', quebracabeca: 'brinquedo,pecas,montar',
      vela: 'fogo,luz,aniversario', lampada: 'luz,eletrica,ideia', lanterna: 'luz,escuro,pilha',
      fosforo: 'fogo,acender,caixa', isqueiro: 'fogo,acender,bolso',
    },
  },
  lugares: {
    base: ['lugar', 'local'],
    words: {
      praia: 'mar,areia,sol,verao,ferias,litoral', escola: 'estudo,professor,aluno,aula',
      hospital: 'medico,doente,saude,emergencia', aeroporto: 'aviao,viagem,mala,voo',
      rodoviaria: 'onibus,viagem,mala', estacao: 'trem,metro,viagem',
      shopping: 'compras,lojas,cinema,cidade', mercado: 'compras,comida,carrinho',
      padaria: 'pao,cafe,manha,cheiro', farmacia: 'remedio,saude,compras',
      restaurante: 'comida,garcom,jantar', lanchonete: 'lanche,comida,rapida',
      cinema: 'filme,pipoca,tela,escuro', teatro: 'palco,ator,peca,plateia',
      museu: 'arte,historia,quadros,visita', biblioteca: 'livros,silencio,estudo,ler',
      igreja: 'religiao,fe,missa,torre', estadio: 'futebol,torcida,jogo,gramado',
      parque: 'arvore,lazer,passeio,verde', praca: 'cidade,banco,arvore,encontro',
      zoologico: 'animal,jaula,visita,passeio', circo: 'palhaco,picadeiro,lona,espetaculo',
      fazenda: 'campo,animal,plantacao,interior', sitio: 'campo,lazer,interior,verde',
      cidade: 'urbano,predios,ruas,gente', campo: 'verde,natureza,interior,pasto',
      floresta: 'arvore,natureza,selvagem,verde', deserto: 'areia,seco,calor,camelo',
      montanha: 'altura,natureza,escalar,pico', caverna: 'escuro,pedra,morcego',
      ilha: 'mar,isolada,praia,coqueiro', cachoeira: 'agua,queda,natureza,banho',
      piscina: 'agua,nadar,verao,lazer', academia: 'exercicio,musculo,treino,saude',
      escritorio: 'trabalho,mesa,computador,reuniao', fabrica: 'trabalho,maquinas,producao',
      banco: 'dinheiro,conta,fila,cofre', correio: 'carta,encomenda,selo,entrega',
      hotel: 'viagem,quarto,ferias,hospedagem', pousada: 'viagem,quarto,ferias,praia',
      delegacia: 'policia,seguranca,crime', bombeiros: 'fogo,resgate,emergencia,sirene',
      cemiterio: 'morte,silencio,flores', hospital2: null,
      universidade: 'estudo,faculdade,diploma,aula', quadra: 'esporte,jogo,bola,escola',
    },
  },
  profissoes: {
    base: ['profissao', 'trabalho', 'pessoa'],
    words: {
      medico: 'saude,hospital,doente,cura', enfermeiro: 'saude,hospital,cuidado,injecao',
      dentista: 'saude,dente,consultorio,sorriso', professor: 'escola,aula,ensinar,aluno',
      policial: 'seguranca,farda,lei,delegacia', bombeiro: 'fogo,resgate,heroi,sirene',
      advogado: 'lei,justica,tribunal,terno', juiz: 'lei,justica,tribunal,sentenca',
      engenheiro: 'construcao,obra,calculo,projeto', arquiteto: 'construcao,projeto,desenho,casa',
      pedreiro: 'construcao,obra,tijolo,cimento', eletricista: 'energia,fio,luz,tomada',
      encanador: 'agua,cano,vazamento,banheiro', mecanico: 'carro,oficina,motor,graxa',
      motorista: 'carro,onibus,volante,transito', piloto: 'aviao,voo,ceu,cabine',
      cozinheiro: 'comida,cozinha,panela,restaurante', garcom: 'restaurante,bandeja,mesa,pedido',
      padeiro: 'pao,padaria,forno,manha', acougueiro: 'carne,faca,mercado',
      cabeleireiro: 'cabelo,tesoura,salao,corte', costureira: 'roupa,agulha,linha,maquina',
      jornalista: 'noticia,reportagem,jornal,entrevista', fotografo: 'foto,camera,imagem,evento',
      ator: 'filme,teatro,cena,fama', cantor: 'musica,voz,palco,show',
      dançarino: 'danca,palco,ritmo,corpo', pintor: 'arte,tinta,quadro,parede',
      escritor: 'livro,historia,palavras,paginas', cientista: 'pesquisa,laboratorio,experimento,descoberta',
      astronauta: 'espaco,foguete,lua,estrelas', veterinario: 'animal,saude,pet,clinica',
      agricultor: 'campo,plantacao,colheita,terra', pescador: 'peixe,mar,rede,barco',
      soldado: 'exercito,farda,guerra,quartel', jogador: 'futebol,bola,time,gol',
      arbitro: 'futebol,apito,cartao,regras', programador: 'computador,codigo,software,tecnologia',
      vendedor: 'loja,compras,cliente,preco', caixa: 'mercado,dinheiro,fila,pagamento',
      faxineiro: 'limpeza,vassoura,predio', carteiro: 'carta,correio,entrega,rua',
      lixeiro: 'lixo,limpeza,caminhao,rua', barbeiro: 'cabelo,barba,tesoura,salao',
    },
  },
  natureza: {
    base: ['natureza'],
    words: {
      arvore: 'planta,folhas,tronco,sombra,verde', flor: 'planta,colorida,cheiro,jardim',
      rosa: 'flor,vermelha,espinho,amor', girassol: 'flor,amarela,sol,semente',
      grama: 'planta,verde,chao,jardim', folha: 'planta,verde,arvore,cair',
      semente: 'planta,plantar,terra,crescer', raiz: 'planta,terra,fundo',
      cacto: 'planta,deserto,espinho,seco', bambu: 'planta,verde,panda,alto',
      rio: 'agua,corrente,peixe,margem', lago: 'agua,parado,pato,barco',
      mar: 'agua,oceano,onda,sal,praia', oceano: 'agua,mar,gigante,profundo',
      onda: 'mar,agua,surf,espuma', chuva: 'agua,ceu,nuvem,molhado,guardachuva',
      tempestade: 'chuva,vento,raio,forte', raio: 'tempestade,eletrico,ceu,trovao',
      trovao: 'tempestade,barulho,ceu', vento: 'ar,soprar,pipa,frio',
      neve: 'frio,branco,gelo,inverno', gelo: 'frio,agua,duro,congelado',
      sol: 'ceu,quente,luz,dia,verao', lua: 'ceu,noite,cheia,branca',
      estrela: 'ceu,noite,brilho,longe', nuvem: 'ceu,branca,chuva,algodao',
      ceu: 'azul,nuvem,passaro,alto', arcoiris: 'ceu,cores,chuva,sol',
      fogo: 'quente,chama,queimar,vermelho', fumaca: 'fogo,cinza,ar,queimar',
      terra: 'chao,planta,marrom,plantar', pedra: 'dura,chao,cinza,montanha',
      areia: 'praia,deserto,fina,castelo', lama: 'terra,agua,suja,porco',
      vulcao: 'fogo,lava,montanha,erupcao', terremoto: 'terra,tremor,destruicao',
      inverno: 'estacao,frio,casaco,neve', verao: 'estacao,calor,praia,ferias',
      primavera: 'estacao,flores,colorida', outono: 'estacao,folhas,vento',
      manha: 'dia,cedo,cafe,sol', tarde: 'dia,sol,almoco', noite: 'escuro,lua,dormir,estrelas',
      madrugada: 'noite,escuro,silencio,cedo',
    },
  },
  esportes: {
    base: ['esporte', 'jogo', 'exercicio'],
    words: {
      futebol: 'bola,gol,time,campo,torcida', basquete: 'bola,cesta,quadra,alto',
      volei: 'bola,rede,quadra,praia', tenis: 'bola,raquete,quadra,saque',
      pingpong: 'bola,raquete,mesa,rapido', natacao: 'agua,piscina,nadar,braçada',
      surf: 'mar,onda,prancha,praia', skate: 'rodas,manobra,rua,radical',
      ciclismo: 'bicicleta,pedalar,estrada,capacete', corrida: 'correr,velocidade,maratona,tenis',
      maratona: 'correr,longa,resistencia,42km', atletismo: 'correr,pista,salto,medalha',
      boxe: 'luta,soco,ringue,luvas', judo: 'luta,faixa,tatame,queda',
      karate: 'luta,faixa,golpe,disciplina', capoeira: 'luta,danca,roda,brasil',
      ginastica: 'corpo,flexivel,salto,medalha', escalada: 'montanha,subir,corda,forca',
      esqui: 'neve,montanha,inverno,velocidade', patinacao: 'gelo,patins,girar',
      golfe: 'bola,taco,campo,buraco', sinuca: 'bola,taco,mesa,bar',
      xadrez: 'tabuleiro,pecas,estrategia,rei', baralho: 'cartas,jogo,mesa,sorte',
      videogame: 'jogo,tela,controle,diversao', boliche: 'bola,pinos,pista,strike',
      pesca: 'peixe,vara,rio,paciencia', hipismo: 'cavalo,salto,montaria',
      remo: 'barco,agua,forca,rio', vela2: null,
      handebol: 'bola,gol,quadra,mao', futsal: 'bola,gol,quadra,salao',
    },
  },
  tecnologia: {
    base: ['tecnologia', 'eletronico'],
    words: {
      computador: 'tela,teclado,internet,trabalho', notebook: 'computador,portatil,tela,teclado',
      celular: 'telefone,tela,bolso,mensagem,app', tablet: 'tela,toque,portatil',
      televisao: 'tela,filme,sala,canal', radio: 'som,musica,noticia,antena',
      internet: 'rede,site,conexao,mundo', wifi: 'internet,rede,sinal,conexao',
      teclado: 'computador,letras,digitar', mouse: 'computador,clique,seta',
      impressora: 'papel,tinta,documento', camera: 'foto,lente,imagem,video',
      fone: 'ouvido,musica,som', caixadesom: 'som,musica,festa,volume',
      microfone: 'voz,som,cantar,gravar', drone: 'voo,camera,controle,ceu',
      robo: 'maquina,inteligente,futuro,metal', bateria: 'energia,carregar,pilha',
      carregador: 'energia,celular,tomada,cabo', tomada: 'energia,eletrica,parede,plug',
      aplicativo: 'celular,programa,baixar', jogo2: null,
      site: 'internet,pagina,link', email: 'mensagem,internet,enviar,caixa',
      senha: 'seguranca,secreta,conta,acesso', videochamada: 'internet,camera,conversa',
      satelite: 'espaco,orbita,sinal,antena', foguete: 'espaco,lancamento,astronauta,fogo',
      geladeira: 'cozinha,frio,comida,eletrodomestico', fogao: 'cozinha,fogo,panela,eletrodomestico',
      microondas: 'cozinha,esquentar,rapido,eletrodomestico', liquidificador: 'cozinha,suco,misturar,eletrodomestico',
      ventilador: 'vento,calor,girar,eletrodomestico', arcondicionado: 'frio,calor,quarto,eletrodomestico',
      maquinadelavar: 'roupa,limpeza,agua,eletrodomestico', ferrodepassar: 'roupa,quente,amassado,eletrodomestico',
      aspirador: 'limpeza,po,chao,eletrodomestico',
    },
  },
  transporte: {
    base: ['transporte', 'veiculo', 'viagem'],
    words: {
      carro: 'rodas,rua,motor,volante,automovel', onibus: 'rodas,rua,passageiros,coletivo',
      caminhao: 'rodas,estrada,carga,grande', moto: 'rodas,rua,capacete,rapida',
      bicicleta: 'rodas,pedalar,exercicio,magrela', patinete: 'rodas,rua,eletrico',
      taxi: 'carro,corrida,cidade,amarelo', ambulancia: 'carro,hospital,emergencia,sirene',
      aviao: 'voo,ceu,asas,aeroporto,rapido', helicoptero: 'voo,ceu,helice,resgate',
      barco: 'agua,mar,rio,navegar', navio: 'agua,mar,grande,cruzeiro',
      canoa: 'agua,rio,remo,pequena', jetski: 'agua,mar,rapido,verao',
      trem: 'trilhos,vagao,estacao,longo', metro: 'trilhos,cidade,subterraneo,estacao',
      trator: 'fazenda,campo,rodas,forte', ferrari: 'carro,rapido,luxo,vermelho',
      submarino: 'agua,fundo,mar,militar', balao: 'voo,ceu,ar,cesta',
    },
  },
  roupas: {
    base: ['roupa', 'vestir', 'moda'],
    words: {
      camisa: 'tronco,botao,manga', camiseta: 'tronco,algodao,estampa', blusa: 'tronco,frio,feminina',
      calca: 'pernas,jeans,bolso', bermuda: 'pernas,verao,praia', short: 'pernas,verao,curto',
      saia: 'pernas,feminina,rodada', vestido: 'corpo,feminina,festa', terno: 'formal,trabalho,gravata',
      gravata: 'formal,pescoco,trabalho', casaco: 'frio,inverno,quente', jaqueta: 'frio,couro,inverno',
      moletom: 'frio,capuz,confortavel', sueter: 'frio,la,inverno',
      meia: 'pes,par,sapato', sapato: 'pes,couro,formal', tenis2: null,
      sandalia: 'pes,verao,aberta', chinelo: 'pes,casa,praia,dedo', bota: 'pes,couro,chuva',
      luva: 'maos,frio,par', cachecol: 'pescoco,frio,inverno', cinto: 'cintura,calca,fivela',
      pijama: 'dormir,noite,confortavel', biquini: 'praia,piscina,verao,feminina',
      sunga: 'praia,piscina,verao,masculina', uniforme: 'escola,trabalho,igual',
    },
  },
  corpo: {
    base: ['corpo', 'humano'],
    words: {
      cabeca: 'topo,cerebro,cabelo', cabelo: 'cabeca,fios,corte,pente', olho: 'rosto,visao,ver,cor',
      nariz: 'rosto,cheiro,respirar', boca: 'rosto,falar,comer,labios', dente: 'boca,morder,branco,escova',
      lingua: 'boca,sabor,falar', orelha: 'lado,ouvir,som,brinco', pescoco: 'liga,cabeca,colar',
      ombro: 'braço,carregar,largo', braco: 'membro,forca,abraço', cotovelo: 'braco,dobra',
      mao: 'dedos,pegar,cumprimento', dedo: 'mao,anel,apontar', unha: 'dedo,cortar,esmalte',
      barriga: 'meio,fome,umbigo', costas: 'tras,coluna,deitar', perna: 'membro,andar,correr',
      joelho: 'perna,dobra,ralado', pe: 'chao,andar,sapato,dedos', coracao: 'peito,bater,amor,vida',
      pulmao: 'peito,respirar,ar', cerebro: 'cabeca,pensar,inteligencia,mente',
      osso: 'esqueleto,duro,calcio', sangue: 'vermelho,veia,vida', pele: 'cobre,toque,sol',
      musculo: 'forca,academia,corpo',
    },
  },
  bebidas: {
    base: ['bebida', 'liquido'],
    words: {
      agua: 'pura,sede,vida,garrafa,transparente', suco: 'fruta,doce,copo,natural',
      refrigerante: 'gas,doce,gelado,lata', cafe: 'quente,manha,xicara,preto,acordar',
      cha: 'quente,erva,xicara,calmante', leite: 'branco,vaca,cafe,copo',
      chocolatequente: 'doce,quente,inverno,xicara', milkshake: 'doce,gelado,leite,canudo',
      limonada: 'limao,gelada,verao,azeda', aguadecoco: 'coco,praia,gelada,natural',
      vitamina: 'fruta,leite,saudavel,liquidificador', cerveja: 'alcool,gelada,bar,festa',
      vinho: 'alcool,uva,taca,jantar', champanhe: 'alcool,festa,brinde,espumante',
      caipirinha: 'alcool,limao,brasil,festa',
    },
  },
  musica: {
    base: ['musica', 'som', 'arte'],
    words: {
      violao: 'instrumento,cordas,dedilhar,roda', guitarra: 'instrumento,cordas,rock,eletrica',
      piano: 'instrumento,teclas,classico,cauda', teclado2: null,
      bateria2: null, tambor: 'instrumento,batida,ritmo,pele',
      flauta: 'instrumento,sopro,doce', saxofone: 'instrumento,sopro,jazz,dourado',
      trompete: 'instrumento,sopro,banda,dourado', violino: 'instrumento,cordas,arco,classico',
      pandeiro: 'instrumento,samba,batida,roda', sanfona: 'instrumento,forro,fole,nordeste',
      microfone2: null, palco: 'show,artista,luzes,plateia',
      show: 'musica,palco,plateia,ingresso', banda: 'musica,grupo,instrumentos,show',
      cantiga: 'musica,infantil,roda', samba: 'ritmo,carnaval,brasil,pandeiro',
      forro: 'ritmo,nordeste,sanfona,danca', funk: 'ritmo,baile,batida',
      rock: 'ritmo,guitarra,banda,pesado', danca: 'corpo,ritmo,movimento,festa',
    },
  },
  festa: {
    base: ['festa', 'celebracao', 'diversao'],
    words: {
      aniversario: 'bolo,parabens,velas,presente', casamento: 'noivos,alianca,igreja,vestido',
      natal: 'dezembro,presente,arvore,familia,papainoel', anonovo: 'fogos,virada,champanhe,meianoite',
      pascoa: 'chocolate,ovo,coelho,abril', carnaval: 'fantasia,samba,desfile,fevereiro',
      festajunina: 'junho,fogueira,quadrilha,milho', halloween: 'fantasia,doces,abobora,susto',
      presente: 'caixa,laco,surpresa,dar', balao2: null,
      fantasia: 'roupa,carnaval,personagem,mascara', palhaco: 'circo,riso,nariz,colorido',
      magico: 'truque,cartola,coelho,varinha', fogosdeartificio: 'ceu,cores,barulho,anonovo',
      parabens: 'aniversario,cantar,palmas', convite: 'papel,chamar,festa,data',
      docinho: 'festa,brigadeiro,mesa,bandeja', pinata: 'doces,bater,pendurada',
    },
  },
  sentimentos: {
    base: ['sentimento', 'emocao'],
    words: {
      amor: 'coracao,carinho,paixao,casal', amizade: 'amigo,companhia,confianca,lealdade',
      alegria: 'feliz,sorriso,riso,animo', tristeza: 'choro,lagrima,saudade,pena',
      raiva: 'bravo,irritado,gritar,vermelho', medo: 'susto,escuro,tremor,coragem',
      saudade: 'longe,lembranca,tristeza,coracao', vergonha: 'timido,rosto,vermelho,esconder',
      coragem: 'medo,heroi,enfrentar,forte', esperanca: 'futuro,fe,sonho,luz',
      ciume: 'inveja,amor,possessivo', orgulho: 'conquista,peito,vaidade',
      surpresa: 'inesperado,susto,presente,boca', sonho: 'dormir,desejo,futuro,imaginacao',
      abraco: 'carinho,bracos,apertado,amigo', beijo: 'boca,amor,carinho,casal',
      sorriso: 'boca,feliz,dentes,simpatia', choro: 'lagrima,triste,olhos,bebe',
      risada: 'engracado,alegria,alto,piada',
    },
  },
  escola: {
    base: ['escola', 'estudo', 'aprender'],
    words: {
      aula: 'professor,sala,materia,horario', prova: 'nota,estudar,questoes,nervoso',
      licao: 'casa,tarefa,caderno,dever', ferias: 'descanso,viagem,lazer,praia,dezembro',
      recreio: 'intervalo,brincar,lanche,patio', matematica: 'numeros,conta,calculo,materia',
      portugues: 'letras,gramatica,texto,materia', historia: 'passado,datas,materia,livro',
      geografia: 'mapa,paises,materia,mundo', ciencias: 'experiencia,natureza,materia,corpo',
      ingles: 'lingua,estrangeira,materia,hello', educacaofisica: 'esporte,quadra,materia,exercicio',
      alfabeto: 'letras,abc,ordem', numero: 'matematica,contar,algarismo',
      quadro: 'lousa,giz,parede,escrever', giz: 'quadro,branco,po,escrever',
      diploma: 'formatura,conquista,papel,curso', formatura: 'diploma,festa,beca,conclusao',
      aluno: 'estudante,carteira,aprender,uniforme', diretor: 'escola,chefe,sala,autoridade',
      lousa: 'quadro,escrever,sala',
    },
  },
  casa: {
    base: ['casa', 'moradia', 'lar'],
    words: {
      sala: 'sofa,televisao,visita,estar', quarto: 'cama,dormir,armario,privado',
      cozinha: 'fogao,comida,geladeira,panela', banheiro: 'chuveiro,vaso,pia,espelho',
      garagem: 'carro,portao,guardar', quintal: 'fora,grama,varal,brincar',
      varanda: 'fora,vista,cadeira,rede', escada2: null,
      telhado: 'topo,telha,chuva,alto', parede: 'tijolo,tinta,quadro,divisao',
      chao: 'piso,baixo,pisar,limpar', teto: 'alto,lampada,forro',
      jardim: 'flores,plantas,verde,fora', portao: 'entrada,rua,ferro,campainha',
      campainha: 'porta,toque,visita,som', chuveiro: 'banho,agua,quente,banheiro',
      pia: 'agua,lavar,torneira,louça', torneira: 'agua,abrir,pia,pingar',
      vasosanitario: 'banheiro,descarga,privada', aluguel: 'pagar,morar,contrato,mes',
      mudanca: 'caixas,caminhao,nova,endereco', vizinho: 'lado,perto,muro,pessoa',
      apartamento: 'predio,andar,elevador,morar', predio: 'alto,andares,cidade,elevador',
      elevador: 'predio,subir,botao,andar', chamine: 'telhado,fumaca,lareira',
    },
  },
  cores: {
    base: ['cor', 'visual'],
    words: {
      vermelho: 'sangue,morango,paixao,fogo', azul: 'ceu,mar,calmo,frio',
      verde: 'grama,natureza,esperanca,folha', amarelo: 'sol,banana,ouro,alegria',
      laranja2: null, roxo: 'uva,violeta,misterio',
      rosa2: null, preto: 'escuro,noite,elegante,luto',
      branco: 'neve,paz,limpo,claro', cinza: 'nuvem,pedra,neutro,fumaca',
      marrom: 'terra,chocolate,madeira,cafe', dourado: 'ouro,brilho,riqueza,medalha',
      prateado: 'prata,brilho,metal,lua', colorido: 'arcoiris,festa,varias,alegre',
    },
  },
};

// Sinônimos e apelidos: acertos "quase exatos" que valem 95-99.
export const SYNONYMS = {
  cachorro: ['cao', 'dog', 'au au', 'catioro'], gato: ['felino', 'miau', 'bichano'],
  carro: ['automovel', 'auto'], bicicleta: ['bike', 'magrela'],
  televisao: ['tv', 'televisor'], celular: ['telefone', 'smartphone', 'fone'],
  computador: ['pc', 'micro'], futebol: ['bola', 'fut'],
  refrigerante: ['refri', 'soda'], cafe: ['cafezinho'],
  medico: ['doutor', 'dr'], professor: ['mestre', 'prof'],
  policial: ['policia', 'guarda'], praia: ['litoral', 'beiramar'],
  banheiro: ['toalete', 'lavabo', 'wc'], vasosanitario: ['privada', 'latrina'],
  aviao: ['aeronave', 'jato'], onibus: ['busao', 'coletivo'],
  dinheiro: ['grana', 'bufunfa'], amigo: ['parceiro', 'camarada'],
  crianca: ['menino', 'guri', 'moleque'], sorvete: ['gelato'],
  chinelo: ['sandalia de dedo', 'havaiana'], oculos: ['lentes'],
  guardachuva: ['sombrinha'], geladeira: ['refrigerador', 'frigobar'],
  hamburguer: ['burger', 'xburger'], batatafrita: ['fritas'],
  cachorroquente: ['hotdog', 'dogao'], pingpong: ['tenis de mesa'],
  videogame: ['game', 'console'], microondas: ['micro-ondas'],
};

// ------------------------------------------------------------------
// Compilação: RAW -> lista plana { w, cat, tags:Set }
// ------------------------------------------------------------------
function normalizeKey(k) {
  // entradas terminadas em dígito são duplicatas descartadas (ex.: 'vela2')
  return /\d$/.test(k) ? null : k;
}

export const WORDS = [];
export const BY_WORD = new Map();

for (const [cat, def] of Object.entries(RAW)) {
  for (const [key, tagStr] of Object.entries(def.words)) {
    const w = normalizeKey(key);
    if (!w || tagStr === null) continue;
    const tags = new Set(def.base);
    tags.add(cat);
    for (const t of tagStr.split(',')) tags.add(t.trim());
    const entry = { w, cat, tags };
    WORDS.push(entry);
    BY_WORD.set(w, entry);
  }
}

// Índice reverso: etiqueta -> palavras. Usado para palpites que são a própria
// etiqueta (ex.: palpite "fazenda" quando o segredo é "vaca").
export const BY_TAG = new Map();
for (const e of WORDS) {
  for (const t of e.tags) {
    if (!BY_TAG.has(t)) BY_TAG.set(t, new Set());
    BY_TAG.get(t).add(e.w);
  }
}

// Palavras boas para serem SEGREDO (concretas e conhecidas) — todas, exceto
// as muito curtas.
export const SECRETS = WORDS.filter(e => e.w.length >= 3).map(e => e.w);
