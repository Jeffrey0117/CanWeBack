const http = require('http')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const PORT = process.env.PORT || 3000
const orders = new Map()

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', chunk => { body += chunk })
    req.on('end', () => {
      try { resolve(JSON.parse(body)) }
      catch { resolve({}) }
    })
    req.on('error', reject)
  })
}

function sendJson(res, data, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(data))
}

function serveStatic(res, filePath) {
  const fullPath = path.join(__dirname, 'public', filePath === '/' ? 'index.html' : filePath)
  const ext = path.extname(fullPath)
  const mime = MIME_TYPES[ext] || 'application/octet-stream'

  fs.readFile(fullPath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' })
      res.end('Not Found')
      return
    }
    res.writeHead(200, { 'Content-Type': mime })
    res.end(data)
  })
}

// 民國生日 (如 "880118") 轉為西元 Date
function parseRocBirthday(input) {
  const cleaned = input.replace(/\D/g, '')
  if (cleaned.length < 5 || cleaned.length > 7) return null
  let year, month, day
  if (cleaned.length === 7) {
    year = parseInt(cleaned.slice(0, 3), 10) + 1911
    month = parseInt(cleaned.slice(3, 5), 10)
    day = parseInt(cleaned.slice(5, 7), 10)
  } else if (cleaned.length === 6) {
    year = parseInt(cleaned.slice(0, 2), 10) + 1911
    month = parseInt(cleaned.slice(2, 4), 10)
    day = parseInt(cleaned.slice(4, 6), 10)
  } else {
    return null
  }
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  return new Date(year, month - 1, day)
}

function generateFortune(myBirthday, partnerBirthday, myName, partnerName) {
  const myDate = parseRocBirthday(myBirthday)
  const partnerDate = parseRocBirthday(partnerBirthday)
  if (!myDate || !partnerDate) return null

  const myMonth = myDate.getMonth() + 1
  const myDay = myDate.getDate()
  const pMonth = partnerDate.getMonth() + 1
  const pDay = partnerDate.getDate()

  const mySeed = myMonth * 31 + myDay
  const partnerSeed = pMonth * 31 + pDay
  const combinedSeed = mySeed * 100 + partnerSeed

  const elements = ['金', '木', '水', '火', '土']
  const myElement = elements[mySeed % 5]
  const partnerElement = elements[partnerSeed % 5]

  const zodiacAnimals = ['鼠', '牛', '虎', '兔', '龍', '蛇', '馬', '羊', '猴', '雞', '狗', '豬']
  const myZodiac = zodiacAnimals[myDate.getFullYear() % 12]
  const partnerZodiac = zodiacAnimals[partnerDate.getFullYear() % 12]

  const constellations = [
    '摩羯座', '水瓶座', '雙魚座', '牡羊座', '金牛座', '雙子座',
    '巨蟹座', '獅子座', '處女座', '天秤座', '天蠍座', '射手座'
  ]
  const constellationDays = [20, 19, 21, 20, 21, 21, 23, 23, 23, 23, 22, 22]
  const myConstIdx = myDay < constellationDays[myMonth - 1] ? myMonth - 1 : myMonth % 12
  const pConstIdx = pDay < constellationDays[pMonth - 1] ? pMonth - 1 : pMonth % 12
  const myConstellation = constellations[myConstIdx]
  const partnerConstellation = constellations[pConstIdx]

  // 五行相生相剋計算合盤分數
  const elementCompat = {
    '金金': 60, '金木': 35, '金水': 85, '金火': 30, '金土': 80,
    '木金': 35, '木木': 60, '木水': 80, '木火': 85, '木土': 30,
    '水金': 85, '水木': 80, '水水': 60, '水火': 30, '水土': 35,
    '火金': 30, '火木': 85, '火水': 30, '火火': 60, '火土': 80,
    '土金': 80, '土木': 30, '土水': 35, '土火': 80, '土土': 60,
  }

  const baseCompat = elementCompat[myElement + partnerElement] || 50
  const luckScores = {
    reconciliation: Math.min(95, Math.max(30, baseCompat + (combinedSeed % 15) - 5)),
    chemistry: Math.min(95, Math.max(25, 40 + ((combinedSeed * 7) % 50))),
    communication: Math.min(95, Math.max(25, 35 + ((combinedSeed * 13) % 55))),
    timing: Math.min(95, Math.max(30, 45 + ((combinedSeed * 3) % 45))),
    longTerm: Math.min(95, Math.max(25, 40 + ((combinedSeed * 11) % 50))),
  }

  const myTraitsPool = [
    ['重感情', '念舊', '直覺敏銳', '適應力強'],
    ['踏實穩重', '意志堅定', '值得信賴', '耐心十足'],
    ['熱情洋溢', '充滿活力', '行動力強', '勇於表達'],
    ['溫柔體貼', '富有同情心', '感受力強', '善解人意'],
    ['理性務實', '有責任感', '注重細節', '規劃力強'],
  ]
  const myTraits = myTraitsPool[mySeed % 5]

  const reconciliationAdvice = [
    `從五行來看，${myName}屬${myElement}而${partnerName}屬${partnerElement}，你們之間存在互補的能量。挽回的關鍵在於先穩定自己的情緒，用行動而非言語來表達誠意。建議在對方冷靜後，以真誠但不帶壓力的方式重新建立聯繫。`,
    `${myName}的${myConstellation}與${partnerName}的${partnerConstellation}在星象上有著特殊的連結。這段關係並非無法修復，但需要時間。建議先給彼此空間，再透過共同朋友或自然的場合重新接觸。`,
    `根據你們的命盤分析，${myName}與${partnerName}之間的緣分尚未走完。目前的分離可能是命運給你們的考驗。建議${myName}先專注提升自己，當你變得更好時，對方自然會注意到你的改變。`,
    `${myName}屬${myZodiac}、${partnerName}屬${partnerZodiac}，你們的生肖配對顯示這段感情有深厚的基礎。挽回的最佳策略是展現成長，而非糾纏。建議寫一封真誠的信，表達自己的反思與改變。`,
    `五行分析顯示${myElement}與${partnerElement}的組合需要一個調和的契機。建議${myName}在接下來的一個月內專注自我成長，等待雙方能量重新對齊的時刻再行動。`,
    `星座配對顯示${myConstellation}與${partnerConstellation}之間存在強烈的吸引力，即使暫時分開，這股引力仍在。建議用溫和而堅定的態度，讓對方感受到你的改變與成長。`,
    `從命理角度來看，你們的分離時機恰好落在星象轉換期。下一個有利的復合時間點即將到來，但前提是${myName}必須先完成內在的自我修復。`,
  ]

  const communicationAdvice = [
    `${myConstellation}的溝通方式偏向直接，而${partnerConstellation}需要更多的情感安全感。建議調整溝通節奏，多用「我感覺」而非「你應該」的表達方式。`,
    `你們之間的溝通障礙主要來自五行${myElement}與${partnerElement}的節奏差異。建議以文字溝通為主，給對方消化的時間。`,
    `根據星座分析，${partnerName}最在意的是被理解和被尊重。在重新建立溝通時，先傾聽、後表達，展現你真正理解問題所在。`,
    `命盤顯示你們的溝通需要一個中性的橋樑。建議透過共同的興趣或話題重新開啟對話，避免直接討論感情問題。`,
    `${myZodiac}與${partnerZodiac}在溝通上需要更多耐心。建議先用輕鬆的方式打招呼，循序漸進地恢復日常互動。`,
  ]

  const timingAdvice = [
    '根據星象運行，未來三個月內會出現一個有利的復合窗口期。在此之前，專注於自我提升。',
    '目前雙方都需要冷靜期，建議至少等待兩到四週再嘗試聯繫。急於求成反而會適得其反。',
    '命盤顯示下一個月的中旬是重新聯繫的好時機，屆時雙方的能量場會趨於和諧。',
    '從五行流年來看，今年下半年是感情修復的黃金期，把握這個階段的每一次互動機會。',
    '星象顯示近期不宜過於積極，建議以退為進，讓對方主動靠近你。',
  ]

  const actionPlan = [
    `第一步：冷靜期（1-2週）— 完全不主動聯繫，專注自我\n第二步：輕度接觸 — 透過社群互動或朋友圈展現正面改變\n第三步：自然互動 — 找到自然的理由重新聯繫\n第四步：深度溝通 — 真誠表達感受，但不施加壓力`,
    `第一步：自我反思 — 誠實面對分手的原因\n第二步：自我成長 — 針對問題做出實際改變\n第三步：間接展現 — 讓對方看到你的蛻變\n第四步：重新出發 — 以全新的姿態邀約`,
    `第一步：斷聯修復（2-3週）— 給彼此喘息空間\n第二步：朋友圈經營 — 展現積極正向的生活\n第三步：輕鬆破冰 — 以朋友的身份重新互動\n第四步：循序漸進 — 慢慢恢復信任與親密感`,
  ]

  const luckyItems = {
    color: ['粉紅色', '薰衣草紫', '天空藍', '珊瑚橘', '翡翠綠', '暖白色', '玫瑰金'][combinedSeed % 7],
    number: ((combinedSeed * 7) % 9) + 1,
    direction: ['東方', '南方', '西方', '北方', '東南', '西北'][combinedSeed % 6],
    flower: ['玫瑰', '百合', '滿天星', '繡球花', '鬱金香', '桃花'][combinedSeed % 6],
    day: ['星期一', '星期三', '星期五', '星期六', '星期日'][combinedSeed % 5],
  }

  return {
    myName, partnerName,
    myBirthday, partnerBirthday,
    myZodiac, partnerZodiac,
    myConstellation, partnerConstellation,
    myElement, partnerElement,
    myTraits,
    luckScores,
    luckyItems,
    reconciliationAdvice: reconciliationAdvice[combinedSeed % reconciliationAdvice.length],
    communicationAdvice: communicationAdvice[combinedSeed % communicationAdvice.length],
    timingAdvice: timingAdvice[combinedSeed % timingAdvice.length],
    actionPlan: actionPlan[combinedSeed % actionPlan.length],
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`)
  const pathname = url.pathname

  // API routes
  if (pathname === '/api/health' && req.method === 'GET') {
    return sendJson(res, { status: 'ok', service: 'canweback' })
  }

  if (pathname === '/api/fortune' && req.method === 'POST') {
    const body = await parseBody(req)
    if (!body.myBirthday || !body.partnerBirthday) {
      return sendJson(res, { error: '請提供雙方生日' }, 400)
    }

    const fortune = generateFortune(body.myBirthday, body.partnerBirthday, body.myName || '', body.partnerName || '')
    if (!fortune) {
      return sendJson(res, { error: '生日格式錯誤，請輸入民國生日如 880118' }, 400)
    }

    const orderId = crypto.randomUUID()
    orders.set(orderId, { fortune, paid: false, createdAt: new Date().toISOString() })

    return sendJson(res, {
      orderId,
      preview: {
        myZodiac: fortune.myZodiac,
        partnerZodiac: fortune.partnerZodiac,
        myConstellation: fortune.myConstellation,
        partnerConstellation: fortune.partnerConstellation,
        myElement: fortune.myElement,
        partnerElement: fortune.partnerElement,
        myTraits: fortune.myTraits.slice(0, 2),
        reconciliation: fortune.luckScores.reconciliation,
      },
      fortune,
    })
  }

  if (pathname.startsWith('/api/fortune/') && req.method === 'GET') {
    const orderId = pathname.split('/')[3]
    const order = orders.get(orderId)
    if (!order) return sendJson(res, { error: '找不到此報告' }, 404)
    if (!order.paid) return sendJson(res, { error: '請先完成付款', orderId }, 402)
    return sendJson(res, { fortune: order.fortune })
  }

  if (pathname === '/api/pay' && req.method === 'POST') {
    const body = await parseBody(req)
    const order = orders.get(body.orderId)
    if (!order) return sendJson(res, { error: '找不到此訂單' }, 404)

    // For now, auto-approve (test mode)
    // When LetMeUse billing is ready, integrate here
    order.paid = true
    return sendJson(res, {
      success: true,
      message: '付款成功（測試模式）',
      redirectUrl: `/report.html?id=${body.orderId}`,
    })
  }

  if (pathname === '/api/webhook/payment' && req.method === 'POST') {
    const body = await parseBody(req)
    const order = orders.get(body.orderId)
    if (order && body.status === 'paid') {
      order.paid = true
    }
    return sendJson(res, { received: true })
  }

  // Static files
  serveStatic(res, pathname)
})

server.listen(PORT, () => {
  console.log(`canweback running on port ${PORT}`)
})
