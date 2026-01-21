// ==================================================
// BOT WHATSAPP COM BAILEYS (ESM) – BASE PRO COMPLETA
// Admin / Grupo / Mídia / Estrutura escalável
// ==================================================

import makeWASocket, {
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  downloadMediaMessage
} from '@whiskeysockets/baileys'

import qrcode from 'qrcode-terminal'
import P from 'pino'
import fs from 'fs'
import { Sticker, StickerTypes } from 'wa-sticker-formatter'
import ytdl from 'ytdl-core'
import ffmpeg from 'fluent-ffmpeg'
import ffmpegPath from 'ffmpeg-static'
import { exec } from 'child_process'
import path from 'path'
import os from 'os'


ffmpeg.setFfmpegPath(ffmpegPath)

// ==================================================
// CONFIG
// ==================================================
const config = {
  prefix: '$',
  botName: 'AnseryBOT',
  ownerName: "G'",
  owner: ['5518997553725'] // <<< SEU NÚMERO AQUI (DDD + número)
}

// ==================================================
// START BOT
// ==================================================
async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('auth')
  const { version } = await fetchLatestBaileysVersion()

  const sock = makeWASocket({
    version,
    auth: state,
    logger: P({ level: 'silent' })
  })

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', (update) => {
    const { connection, qr, lastDisconnect } = update

    if (qr) qrcode.generate(qr, { small: true })
    if (connection === 'open') console.log('✅ Bot conectado!')

    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode
      if (code !== 401) startBot()
      else console.log('⚠️ Sessão inválida, apague a pasta auth.')
    }
  })

  // ==================================================
  // MESSAGE HANDLER
  // ==================================================
  sock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0]
    if (!msg?.message) return

    const from = msg.key.remoteJid
    const isGroup = from.endsWith('@g.us')

    const sender = msg.key.fromMe
      ? sock.user.id.split(':')[0]
      : (msg.key.participant || from)

    const senderNumber = sender.replace(/\D/g, '')
    const isOwner = config.owner.includes(senderNumber)

    const message = msg.message
    const body =
      message.conversation ||
      message.extendedTextMessage?.text ||
      message.imageMessage?.caption ||
      ''

    // Evita loop (bot só responde a si mesmo se for owner)
    if (msg.key.fromMe && !isOwner) return
    if (!body.startsWith(config.prefix)) return

    const args = body.slice(config.prefix.length).trim().split(/\s+/)
    const command = args.shift().toLowerCase()

    const isAdmin = isGroup ? await checkAdmin(sock, from, sender) : false

    switch (command) {
      case 'menu': return reply(sock, from, msg, gerarMenu())
      case 'ping': return reply(sock, from, msg, 'pong 🏓')
      case 's':
      case 'sticker': return handleSticker(sock, msg, from, message, 'normal')
      case 'sa': return handleSticker(sock, msg, from, message, 'stretch')
      case 'toimg': return handleToImg(sock, msg, from, message)
      case 'attp': return handleATTP(sock, from, msg, args)
      case 'calc': return handleCalc(sock, from, msg, args)
      case 'play': return handlePlay(sock, from, msg, args)
      case 'chance': return handleChance(sock, from, msg, args)
      case 'roletarussa':
      case 'rr': return handleRoletaRussa(sock, from, msg)
      case 'xingar':
        if (!isGroup) return reply(sock, from, msg, '❌ Só funciona em grupo')
        return handleXingar(sock, from, msg)
      case 'paulo': return reply(sock, from, msg, 'Amaral')
      case 'tanak': return handleTanak(sock, from, msg)
      case 'top5':
        if (!isGroup) return reply(sock, from, msg, '❌ Só funciona em grupo')
        return handleTop5(sock, from, msg, args)

      // ===== ADMIN =====
      case 'ban':
        if (!isGroup || !isAdmin) return reply(sock, from, msg, '❌ Apenas admin')
        return handleBan(sock, from, msg)

      case 'add':
        if (!isGroup || !isAdmin) return reply(sock, from, msg, '❌ Apenas admin')
        return handleAdd(sock, from, msg, args)

      case 'antilink':
        if (!isGroup || !isAdmin) return reply(sock, from, msg, '❌ Apenas admin')
        return handleAntiLink(sock, from, msg, args)

      case 'tagall':
        if (!isGroup) return reply(sock, from, msg, '❌ Apenas grupo')
        return handleTagAll(sock, from, msg)

      case 'viadometro':
        if (!isGroup) return reply(sock, from, msg, '❌ Só funciona em grupo')
        return handleViadometro(sock, from, msg)
      case 'sc':
        return handleSticker(sock, msg, from, message, 'crop')

      default:
        return reply(sock, from, msg, '❓ Comando inválido')
    }
  })
}

// ==================================================
// FUNÇÕES GERAIS
// ==================================================
const antilinkGroups = new Set()

function reply(sock, to, msg, text) {
  return sock.sendMessage(to, { text }, { quoted: msg })
}

async function checkAdmin(sock, group, user) {
  const metadata = await sock.groupMetadata(group)
  return metadata.participants.find(p => p.id === user)?.admin
}

// ================= STICKERS =================
async function handleSticker(sock, msg, from, message, mode = 'normal') {
  try {
    // ===== IMAGEM DIRETA =====
    if (message.imageMessage) {
      const buffer = await downloadMediaMessage(msg, 'buffer')
      return enviarSticker(sock, buffer, from, msg, mode, false)
    }

    // ===== VÍDEO / GIF DIRETO =====
    if (message.videoMessage) {
      if (message.videoMessage.seconds > 10) {
        return reply(sock, from, msg, '❌ Vídeo muito longo (máx 10s)')
      }

      const buffer = await downloadMediaMessage(msg, 'buffer')
      return enviarSticker(sock, buffer, from, msg, mode, true)
    }


    // ===== MÍDIA RESPONDIDA =====
    const quoted = message.extendedTextMessage?.contextInfo?.quotedMessage

    if (quoted?.imageMessage) {
      const buffer = await downloadMediaMessage(
        { message: quoted, key: msg.key },
        'buffer'
      )
      return enviarSticker(sock, buffer, from, msg, mode, false)
    }

    if (quoted?.videoMessage) {
      if (quoted.videoMessage.seconds > 10) {
        return reply(sock, from, msg, '❌ Vídeo muito longo (máx 10s)')
      }

      const buffer = await downloadMediaMessage(
        { message: quoted, key: msg.key },
        'buffer'
      )
      return enviarSticker(sock, buffer, from, msg, mode, true)
    }

    return reply(sock, from, msg, '❌ Envie ou responda imagem/vídeo/gif')

  } catch (e) {
    console.error(e)
    return reply(sock, from, msg, '❌ Erro ao criar figurinha')
  }
}

async function normalizeVideoSticker(buffer) {
  const tmpIn = path.join(os.tmpdir(), `vid_${Date.now()}.mp4`)
  const tmpOut = path.join(os.tmpdir(), `out_${Date.now()}.webp`)

  fs.writeFileSync(tmpIn, buffer)

  return new Promise((resolve, reject) => {
    ffmpeg(tmpIn)
      .outputOptions([
        '-vcodec libwebp',
        '-vf fps=15,scale=512:512:force_original_aspect_ratio=decrease',
        '-loop 0',
        '-preset default',
        '-an',
        '-vsync 0'
      ])
      .save(tmpOut)
      .on('end', () => {
        const out = fs.readFileSync(tmpOut)
        fs.unlinkSync(tmpIn)
        fs.unlinkSync(tmpOut)
        resolve(out)
      })
      .on('error', reject)
  })
}

async function normalizeVideoStickerCrop(buffer) {
  const tmpIn = path.join(os.tmpdir(), `vid_${Date.now()}.mp4`)
  const tmpOut = path.join(os.tmpdir(), `out_${Date.now()}.webp`)

  fs.writeFileSync(tmpIn, buffer)

  return new Promise((resolve, reject) => {
    ffmpeg(tmpIn)
      .outputOptions([
        '-vcodec libwebp',
        // 1️⃣ corta as bordas pretas (topo e base)
        // 2️⃣ mantém proporção
        // 3️⃣ ajusta pra 512 sem distorcer
        '-vf crop=in_w*0.7:in_h*0.5:in_w*0.15:in_h*0.25,fps=15,scale=512:512:force_original_aspect_ratio=decrease',
        '-loop 0',
        '-preset default',
        '-an',
        '-vsync 0'
      ])
      .save(tmpOut)
      .on('end', () => {
        const out = fs.readFileSync(tmpOut)
        fs.unlinkSync(tmpIn)
        fs.unlinkSync(tmpOut)
        resolve(out)
      })
      .on('error', reject)
  })
}


// backup pra enviar figurinha normal
// async function enviarSticker (sock, buffer, from, msg) {
//   const sticker = new Sticker(buffer, {
//     pack: config.botName,
//     author: config.ownerName,
//     type: StickerTypes.FULL,
//     quality: 70
//   })
//   const stickerBuffer = await sticker.toBuffer()
//   await sock.sendMessage(from, { sticker: stickerBuffer }, { quoted: msg })
// }


// ACHATAR A FIGURINHA
async function resizeImageFFmpeg(buffer) {
  const tmpIn = path.join(os.tmpdir(), `in_${Date.now()}.png`)
  const tmpOut = path.join(os.tmpdir(), `out_${Date.now()}.png`)

  fs.writeFileSync(tmpIn, buffer)

  return new Promise((resolve, reject) => {
    ffmpeg(tmpIn)
      .outputOptions([
        '-vf scale=512:512:force_original_aspect_ratio=disable'
      ])
      .save(tmpOut)
      .on('end', () => {
        const out = fs.readFileSync(tmpOut)
        fs.unlinkSync(tmpIn)
        fs.unlinkSync(tmpOut)
        resolve(out)
      })
      .on('error', reject)
  })
}

async function enviarSticker(
  sock,
  buffer,
  from,
  msg,
  mode = 'normal',
  animated = false
) {
  let finalBuffer = buffer

  if (animated) {
  if (mode === 'crop') {
    finalBuffer = await normalizeVideoStickerCrop(buffer)
  } else {
    finalBuffer = await normalizeVideoSticker(buffer)
  }
}

  // só imagem pode ser "stretch"
  if (mode === 'stretch' && !animated) {
    finalBuffer = await resizeImageFFmpeg(buffer)
  }

  const sticker = new Sticker(finalBuffer, {
    pack: config.botName,
    author: config.ownerName,
    type: StickerTypes.FULL,
    quality: 70,
    animated
  })

  const stickerBuffer = await sticker.toBuffer()

  await sock.sendMessage(
    from,
    { sticker: stickerBuffer },
    { quoted: msg }
  )
}

// FIM DO ACHAR A FIGURINHA


async function handleToImg(sock, msg, from, message) {
  const quoted = message.extendedTextMessage?.contextInfo?.quotedMessage
  if (!quoted?.stickerMessage) return reply(sock, from, msg, '❌ Responda uma figurinha')
  const buffer = await downloadMediaMessage({ message: quoted, key: msg.key }, 'buffer')
  await sock.sendMessage(from, { image: buffer }, { quoted: msg })
}

// ================= UTIL =================
function handleCalc(sock, from, msg, args) {
  try {
    return reply(sock, from, msg, `🧮 ${eval(args.join(' '))}`)
  } catch {
    return reply(sock, from, msg, '❌ Erro no cálculo')
  }
}

// ================= ENTRETENIMENTO =================
function handleChance(sock, from, msg, args) {
  const pergunta = args.join(' ') || 'isso'
  const chance = Math.floor(Math.random() * 101)

  return reply(
    sock,
    from,
    msg,
    `🎲 Chance de *${pergunta}*: *${chance}%*`
  )
}

function handleRoletaRussa(sock, from, msg) {
  const tambor = Math.floor(Math.random() * 6) + 1

  if (tambor === 1) {
    return reply(
      sock,
      from,
      msg,
      '🔫 *BANG!* 💀 Você morreu na roleta russa.'
    )
  } else {
    return reply(
      sock,
      from,
      msg,
      '🔫 *click* 😮‍💨 Sobreviveu dessa vez...'
    )
  }
}

async function handleXingar(sock, from, msg) {
  const metadata = await sock.groupMetadata(from)
  const participants = metadata.participants.map(p => p.id)

  const context = msg.message.extendedTextMessage?.contextInfo

  // 1️⃣ prioridade: usuário marcado
  let target = context?.mentionedJid?.[0]

  // 2️⃣ se não marcou, mas respondeu uma mensagem
  if (!target && context?.participant) {
    target = context.participant
  }

  // 3️⃣ se não marcou nem respondeu, aleatório
  if (!target) {
    target = participants[Math.floor(Math.random() * participants.length)]
  }

  const xingamentos = [
    "{user}, teu pai te fez de boca no colchão",
    "vai morrer com AIDS de tanto chupar rola suja, {user}",
    "{user} sua mãe é puta de beira de estrada",
    "teu cu fede mais que necrotério, {user}",
    "{user}, tu é o aborto que deu errado e sobreviveu",
    "vai lamber cu de aidético, seu lixo",
    "{user} sua piranha que dá até pra cachorro vira-lata",
    "teu pai devia ter gozado na parede, {user}",
    "{user}, tu é tão corno que o chifre já virou coluna",
    "vai tomar no cu até o útero sair pela boca, {user}",
    "{user} sua vadia que mama até defunto",
    "teu cu já tá mais aberto que boca de político",
    "{user}, vai comer o próprio cu com garfo",
    "tu é o motivo do controle parental existir, {user}",
    "{user} sua puta que o diabo cuspiu de volta",
    "vai morrer sozinho com o cu sangrando, {user}",
    "{user}, teu pai te trocaria por um litro de pinga",
    "teu cu é rodoviária interestadual, {user}",
    "{user} sua cadela que lambe até cu de mendigo",
    "vai enfiar a cabeça no cu e gritar surpresa, {user}",
    "{user}, tu é tão feio que tua mãe te amamentou com máscara",
    "teu pau é tão pequeno que pra mijar precisa de pinça",
    "{user} vai levar estupro de realidade até chorar",
    "tu é o sêmen que devia ter escorrido pela coxa, {user}",
    "{user} sua piranha que até o capeta tem nojo",
    "vai apodrecer com gonorreia no cu, {user}",
    "{user}, tua família inteira se envergonha de ti",
    "teu cu já tem CPF próprio de tanto ser usado",
    "{user} vai mamar o diabo e ainda engolir",
    "tu é o erro que Deus tentou apagar e falhou, {user}"
];

  const numero = target.split('@')[0]

  const fraseBase =
    xingamentos[Math.floor(Math.random() * xingamentos.length)]

  const fraseFinal = fraseBase.replace('{user}', `@${numero}`)

  await sock.sendMessage(
    from,
    {
      text: fraseFinal,
      mentions: [target]
    },
    { quoted: msg }
  )
}

async function handleTop5(sock, from, msg, args) {
  const tema = args.join(' ') || 'aleatório'

  const metadata = await sock.groupMetadata(from)

  // filtra só membros válidos (sem bot)
  const participantes = metadata.participants
    .map(p => p.id)
    .filter(id => id !== sock.user.id)

  if (participantes.length < 5) {
    return reply(sock, from, msg, '❌ O grupo precisa de pelo menos 5 membros')
  }

  // embaralha e pega 5
  const sorteados = participantes
    .sort(() => Math.random() - 0.5)
    .slice(0, 5)

  const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣']

  let texto = `🏆 *TOP 5 — ${tema}*\n\n`

  sorteados.forEach((id, i) => {
    texto += `${i + 1}° ${medals[i]} @${id.split('@')[0]}\n`
  })

  await sock.sendMessage(
    from,
    {
      text: texto.trim(),
      mentions: sorteados
    },
    { quoted: msg }
  )
}

function handleTanak(sock, from, msg) {
  const target = '558585247259@s.whatsapp.net' // número que você quer

  sock.sendMessage(
    from,
    {
      text: `AMAMOS O @${target.split('@')[0]}!!! ❤️`,
      mentions: [target]
    },
    { quoted: msg }
  )
}

async function handleViadometro(sock, from, msg) {
  const metadata = await sock.groupMetadata(from)
  const NUMERO_IMUNE = '5518997553725@s.whatsapp.net'

  const context = msg.message.extendedTextMessage?.contextInfo

  let target = context?.mentionedJid?.[0] || context?.participant

  if (!target) {
    return reply(sock, from, msg, '❌ Marque alguém ou responda a mensagem da pessoa que deseja medir o nível.')
  }

  target = target.replace(/\s/g, '')

  const numero = target.split('@')[0]
  let porcentagem
  let classificacoes

  if (target === NUMERO_IMUNE) {
    porcentagem = 0
    classificacoes = ['🚫 Não há resquícios de viadagem']
  } else {
    porcentagem = Math.floor(Math.random() * 101)

    if (porcentagem <= 5) {
      classificacoes = ['🧱 Hétero de concreto armado', '🗿 Mais seco que deserto', '🚫 Nenhum indício detectado']
    } else if (porcentagem <= 15) {
      classificacoes = ['🟢 Hétero flex', '😐 Suspeita mínima', '🧍‍♂️ Nada comprovado']
    } else if (porcentagem <= 30) {
      classificacoes = ['🟡 Olhar curioso', '👀 Já reparou sem querer', '🤔 Questionável']
    } else if (porcentagem <= 45) {
      classificacoes = ['🟠 Piadas suspeitas', '😏 Brincadeira demais', '📸 Ângulo duvidoso']
    } else if (porcentagem <= 60) {
      classificacoes = ['🔥 Meio viado', '💅 Já perdeu o controle', '🎭 Vive no personagem']
    } else if (porcentagem <= 75) {
      classificacoes = ['🔴 Viadagem avançada', '🌈 Já aceitou o destino', '💃 Rebola mas nega']
    } else if (porcentagem <= 90) {
      classificacoes = ['🏳️‍🌈 Viado assumido', '💄 Brilha sem vergonha', '🕺 Nasceu pra isso']
    } else {
      classificacoes = ['👑 Viado lendário', '🌈🏳️‍🌈 Entidade suprema', '🔥 Nunca teve salvação']
    }
  }

  const nivel = classificacoes[Math.floor(Math.random() * classificacoes.length)]

  const texto = `
🌈 *VIADÔMETRO*

👤 Pessoa: @${numero}
📊 Nível: *${porcentagem}%*
📌 Classificação: *${nivel}*
`.trim()

  await sock.sendMessage(from, { text: texto, mentions: [target] }, { quoted: msg })
}



// ================= ADMIN =================
async function handleBan(sock, from, msg) {
  const mentioned = msg.message.extendedTextMessage?.contextInfo?.mentionedJid
  if (!mentioned?.length) return reply(sock, from, msg, 'Marque alguém')
  await sock.groupParticipantsUpdate(from, mentioned, 'remove')
}

async function handleAdd(sock, from, msg, args) {
  const number = args[0]?.replace(/\D/g, '')
  if (!number) return reply(sock, from, msg, 'Use: !add 5511999999999')
  await sock.groupParticipantsUpdate(from, [`${number}@s.whatsapp.net`], 'add')
}

function handleAntiLink(sock, from, msg, args) {
  if (args[0] === 'on') antilinkGroups.add(from)
  else if (args[0] === 'off') antilinkGroups.delete(from)
  reply(sock, from, msg, `🔗 AntiLink ${args[0]}`)
}

async function handleTagAll(sock, from, msg) {
  const metadata = await sock.groupMetadata(from)
  const mentions = metadata.participants.map(p => p.id)
  await sock.sendMessage(from, { text: '📣 Tag geral', mentions }, { quoted: msg })
}

function gerarMenu() {
  return `
🌐 *${config.botName}*

*[ 🛠️ UTILITÁRIOS & SISTEMA ]*
- *${config.prefix}ping* ➔ Verifica a conexão do bot.
- *${config.prefix}menu* ➔ Exibe esta lista de comandos.
- *${config.prefix}calc* ➔ Resolve cálculos (Ex: ${config.prefix}calc 10+5).

*[ 🎨 MÍDIA & EDIÇÃO ]*
- *${config.prefix}s* / *${config.prefix}sticker* ➔ Cria figurinha de imagem/vídeo.
- *${config.prefix}toimg* ➔ Converte figurinha em imagem comum.

*[ 🔮 ENTRETERIMENTO]*
- *${config.prefix}chance* ➔ Calcula a chance de algo acontecer.
- *${config.prefix}roletarussa* ➔ Brinca de roleta russa.
- *${config.prefix}xingar @...* ➔ Xinga alguém aleatório ou marcado.
- *${config.prefix}viadometro @...* ➔ Mede o nível de viadagem do marcado.

*[ 🛡️ ADMINISTRAÇÃO (GRUPO) ]*
- *${config.prefix}ban* ➔ Bane um membro mencionando-o.
- *${config.prefix}add* ➔ Adiciona um número ao grupo.
- *${config.prefix}antilink* ➔ Liga/Desliga o bloqueio de links.
- *${config.prefix}tagall* ➔ Marca todos os membros do grupo.
`
}

startBot()
