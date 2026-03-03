const http = require('http')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const PORT = process.env.PORT || 3000
const orders = new Map()
const EMAILS_FILE = path.join(__dirname, 'data', 'emails.json')
const LETTERS_FILE = path.join(__dirname, 'data', 'letters.json')

function loadEmails() {
  try {
    return JSON.parse(fs.readFileSync(EMAILS_FILE, 'utf-8'))
  } catch {
    return []
  }
}

function saveEmail(entry) {
  const dir = path.dirname(EMAILS_FILE)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  const emails = loadEmails()
  emails.push(entry)
  fs.writeFileSync(EMAILS_FILE, JSON.stringify(emails, null, 2))
}

function loadLetters() {
  try {
    return JSON.parse(fs.readFileSync(LETTERS_FILE, 'utf-8'))
  } catch {
    return []
  }
}

function saveLetter(letter) {
  const dir = path.dirname(LETTERS_FILE)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  const letters = loadLetters()
  letters.push(letter)
  fs.writeFileSync(LETTERS_FILE, JSON.stringify(letters, null, 2))
}

function updateLetter(letterId, updates) {
  const letters = loadLetters()
  const idx = letters.findIndex(l => l.id === letterId)
  if (idx === -1) return null
  const updated = { ...letters[idx], ...updates }
  letters[idx] = updated
  fs.writeFileSync(LETTERS_FILE, JSON.stringify(letters, null, 2))
  return updated
}

// LetMeUse checkout integration
const LETMEUSE_BASE_URL = process.env.LETMEUSE_BASE_URL || 'http://localhost:3001'
const LETMEUSE_APP_ID = process.env.LETMEUSE_APP_ID || 'app_canweback'
const LETMEUSE_APP_SECRET = process.env.LETMEUSE_APP_SECRET || 'dev_secret'
const CANWEBACK_BASE_URL = process.env.CANWEBACK_BASE_URL || `http://localhost:${PORT}`

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.xml': 'application/xml',
  '.txt': 'text/plain',
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

// Simple string hash for deterministic but well-distributed seed
function hashStr(str) {
  let h = 0
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}

// Seeded pseudo-random: returns a function that generates deterministic values 0~1
function seededRandom(seed) {
  let s = seed
  return function() {
    s = (s * 1664525 + 1013904223) & 0x7fffffff
    return s / 0x7fffffff
  }
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
  // Mix in names + both birthdays for much better distribution
  const combinedSeed = hashStr(myName + myBirthday + partnerName + partnerBirthday)
  const rng = seededRandom(combinedSeed)

  const elements = ['金', '木', '水', '火', '土']
  const myElement = elements[mySeed % 5]
  const partnerElement = elements[partnerSeed % 5]

  const zodiacAnimals = ['鼠', '牛', '虎', '兔', '龍', '蛇', '馬', '羊', '猴', '雞', '狗', '豬']
  // 農曆新年約在 1/21~2/20，1月出生大概率算前一年生肖
  // 用近似值：2月5日前算前一年（農曆新年平均落在此附近）
  const lunarNewYearCutoff = { month: 2, day: 5 }
  function getZodiacYear(date) {
    const y = date.getFullYear()
    const m = date.getMonth() + 1
    const d = date.getDate()
    if (m < lunarNewYearCutoff.month || (m === lunarNewYearCutoff.month && d < lunarNewYearCutoff.day)) {
      return y - 1
    }
    return y
  }
  // 基準：2020 = 鼠年，(year-4) % 12 → 0=鼠 1=牛 2=虎 ...
  const myZodiac = zodiacAnimals[(getZodiacYear(myDate) - 4) % 12]
  const partnerZodiac = zodiacAnimals[(getZodiacYear(partnerDate) - 4) % 12]

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
    reconciliation: Math.min(95, Math.max(30, baseCompat + Math.floor(rng() * 20) - 8)),
    chemistry: Math.min(95, Math.max(25, 35 + Math.floor(rng() * 55))),
    communication: Math.min(95, Math.max(25, 30 + Math.floor(rng() * 60))),
    timing: Math.min(95, Math.max(30, 40 + Math.floor(rng() * 50))),
    longTerm: Math.min(95, Math.max(25, 35 + Math.floor(rng() * 55))),
  }

  const myTraitsPool = [
    ['重感情', '念舊', '直覺敏銳', '適應力強'],
    ['踏實穩重', '意志堅定', '值得信賴', '耐心十足'],
    ['熱情洋溢', '充滿活力', '行動力強', '勇於表達'],
    ['溫柔體貼', '富有同情心', '感受力強', '善解人意'],
    ['理性務實', '有責任感', '注重細節', '規劃力強'],
    ['獨立自主', '思考深沉', '洞察力強', '不畏困難'],
    ['樂觀開朗', '幽默感強', '社交力佳', '感染力強'],
    ['浪漫多情', '藝術感強', '想像力豐富', '情感細膩'],
    ['忠誠可靠', '守護意識強', '言出必行', '默默付出'],
    ['好奇心強', '學習力佳', '反應靈敏', '創意十足'],
    ['沉穩內斂', '大局觀強', '抗壓力高', '深藏不露'],
    ['真誠坦率', '正義感強', '保護慾強', '說到做到'],
  ]
  const myTraits = myTraitsPool[Math.floor(rng() * myTraitsPool.length)]

  const reconciliationAdvice = [
    `從五行來看，${myName}屬${myElement}而${partnerName}屬${partnerElement}，你們之間存在互補的能量。挽回的關鍵在於先穩定自己的情緒，用行動而非言語來表達誠意。建議在對方冷靜後，以真誠但不帶壓力的方式重新建立聯繫。`,
    `${myName}的${myConstellation}與${partnerName}的${partnerConstellation}在星象上有著特殊的連結。這段關係並非無法修復，但需要時間。建議先給彼此空間，再透過共同朋友或自然的場合重新接觸。`,
    `根據你們的命盤分析，${myName}與${partnerName}之間的緣分尚未走完。目前的分離可能是命運給你們的考驗。建議${myName}先專注提升自己，當你變得更好時，對方自然會注意到你的改變。`,
    `${myName}屬${myZodiac}、${partnerName}屬${partnerZodiac}，你們的生肖配對顯示這段感情有深厚的基礎。挽回的最佳策略是展現成長，而非糾纏。建議寫一封真誠的信，表達自己的反思與改變。`,
    `五行分析顯示${myElement}與${partnerElement}的組合需要一個調和的契機。建議${myName}在接下來的一個月內專注自我成長，等待雙方能量重新對齊的時刻再行動。`,
    `星座配對顯示${myConstellation}與${partnerConstellation}之間存在強烈的吸引力，即使暫時分開，這股引力仍在。建議用溫和而堅定的態度，讓對方感受到你的改變與成長。`,
    `從命理角度來看，你們的分離時機恰好落在星象轉換期。下一個有利的復合時間點即將到來，但前提是${myName}必須先完成內在的自我修復。`,
    `${myElement}屬性的${myName}天生具有吸引${partnerElement}的磁場。這股吸引力並不會因為分手而消失。你需要做的是重新喚醒這份連結——從對方在意的小事開始，不用刻意，自然就好。`,
    `${myConstellation}與${partnerConstellation}的配對在星象學上被稱為「命運之輪」組合。你們的故事還沒結束，但下一章需要${myName}先學會放手，才能重新握住。這不是矛盾，是宇宙的智慧。`,
    `根據五行相生的原理，${myElement}生${partnerElement}代表你天生是滋養對方的角色。問題不在於你不夠好，而是用力過猛。建議改用「若即若離」的策略，讓${partnerName}感受到失去你的真實重量。`,
    `${myZodiac}年出生的${myName}與${partnerZodiac}年出生的${partnerName}在生肖配對上屬於「磨合型」。分手只是磨合過程中的一個節點，而非終點。反思你們最常爭吵的議題，那裡藏著復合的鑰匙。`,
    `命盤顯示${myName}的情感能量正處於蓄勢待發的階段。你目前最大的武器不是追回對方，而是讓自己散發出「我已經不一樣了」的氣場。${partnerName}的${partnerConstellation}特質會讓對方不自覺地被這種改變吸引。`,
    `${myConstellation}的守護星與${partnerConstellation}的守護星目前形成六合相位，這是一個有利於和解的天象。但你需要的不是表白或道歉——而是一個「恰到好處的巧遇」，讓重逢看起來像命運安排。`,
  ]

  const communicationAdvice = [
    `${myConstellation}的溝通方式偏向直接，而${partnerConstellation}需要更多的情感安全感。建議調整溝通節奏，多用「我感覺」而非「你應該」的表達方式。`,
    `你們之間的溝通障礙主要來自五行${myElement}與${partnerElement}的節奏差異。建議以文字溝通為主，給對方消化的時間。`,
    `根據星座分析，${partnerName}最在意的是被理解和被尊重。在重新建立溝通時，先傾聽、後表達，展現你真正理解問題所在。`,
    `命盤顯示你們的溝通需要一個中性的橋樑。建議透過共同的興趣或話題重新開啟對話，避免直接討論感情問題。`,
    `${myZodiac}與${partnerZodiac}在溝通上需要更多耐心。建議先用輕鬆的方式打招呼，循序漸進地恢復日常互動。`,
    `${partnerConstellation}最反感的溝通方式是情緒勒索和反覆追問「你到底怎麼想」。建議改用分享式溝通：分享你近況的改變，讓對方自然產生好奇，而不是追著對方要答案。`,
    `分析顯示${myName}的表達方式偏向${myElement}型——${{ '金': '直接犀利', '木': '溫和含蓄', '水': '善於傾聽', '火': '熱情直白', '土': '穩重務實' }[myElement]}。而${partnerName}需要的是${{ '金': '溫柔的肯定', '木': '明確的承諾', '水': '具體的行動', '火': '冷靜的理解', '土': '浪漫的驚喜' }[partnerElement]}。找到這個平衡點，溝通就不再是障礙。`,
    `你們之間最大的溝通盲區是：${myName}以為問題在於說了什麼，但${partnerName}在意的其實是「什麼時候說」和「用什麼語氣說」。時機比內容更重要。`,
    `${partnerConstellation}在分手後最渴望聽到的不是「我錯了」，而是「我終於理解你為什麼那樣感受了」。前者是認錯，後者是共情——${partnerName}要的是後者。`,
    `根據五行流通的規律，${myElement}與${partnerElement}之間的能量傳遞需要一個中介。在溝通上，建議先從輕鬆的「第三方話題」切入——比如推薦一部你覺得對方會喜歡的劇、分享一個有趣的發現——而不是直接談感情。`,
    `命盤提示：${myName}容易犯的錯誤是「解釋太多」。你越是解釋，${partnerName}越覺得你在找藉口。改成「少說多做」模式——用三個月的行動改變，抵過三小時的長篇訊息。`,
    `${myConstellation}與${partnerConstellation}最有效的復合溝通模式是「書信體」。不是真的寫信，而是用訊息模擬書信的節奏：一天一封，簡短但真誠，分享你的日常成長，不問對方近況，不施加壓力。第七天停下來，等對方回應。`,
  ]

  const timingAdvice = [
    '根據星象運行，未來三個月內會出現一個有利的復合窗口期。在此之前，專注於自我提升。',
    '目前雙方都需要冷靜期，建議至少等待兩到四週再嘗試聯繫。急於求成反而會適得其反。',
    '命盤顯示下一個月的中旬是重新聯繫的好時機，屆時雙方的能量場會趨於和諧。',
    '從五行流年來看，今年下半年是感情修復的黃金期，把握這個階段的每一次互動機會。',
    '星象顯示近期不宜過於積極，建議以退為進，讓對方主動靠近你。',
    `以${partnerConstellation}的性格週期來看，對方在分手後第 3-4 週會進入「反芻期」——開始反覆回想你們的好。那個時間點是你輕輕出現的最佳時機。`,
    '金星目前正過境你們的關係宮位，這股能量會持續到下個月底。在此期間任何正面接觸都會被放大效果。',
    `${myElement}的能量在每個月的上弦月階段最旺盛。建議在月亮漸圓的時候採取行動，你的魅力和說服力會比平時強 30%。`,
    '命盤顯示目前並非最佳行動期，但也不是完全不利。建議用這段時間做好準備——當窗口來臨時，你要能在 72 小時內把握住。',
    '分析顯示最有利的聯繫時間是平日傍晚 6-8 點，對方在這個時段最容易感性、最容易想起你們的日常。週末反而不好——太多社交干擾。',
    `根據你們的五行互動模式，最理想的復合節奏是「21天法則」：7天完全靜默、7天間接出現在對方視野、7天自然互動。每個階段都不能急。`,
    `${partnerZodiac}年生人在感情上有「三個月迴圈」的特性。從分手算起的第三個月，對方的防備心會降到最低點。如果你在那之前已經做好改變，勝率最高。`,
  ]

  const actionPlan = [
    `第一步：冷靜期（1-2週）— 完全不主動聯繫，專注自我\n第二步：輕度接觸 — 透過社群互動或朋友圈展現正面改變\n第三步：自然互動 — 找到自然的理由重新聯繫\n第四步：深度溝通 — 真誠表達感受，但不施加壓力`,
    `第一步：自我反思 — 誠實面對分手的原因\n第二步：自我成長 — 針對問題做出實際改變\n第三步：間接展現 — 讓對方看到你的蛻變\n第四步：重新出發 — 以全新的姿態邀約`,
    `第一步：斷聯修復（2-3週）— 給彼此喘息空間\n第二步：朋友圈經營 — 展現積極正向的生活\n第三步：輕鬆破冰 — 以朋友的身份重新互動\n第四步：循序漸進 — 慢慢恢復信任與親密感`,
    `第一步：情緒排毒（1週）— 把所有想說的話寫下來但不要傳出去\n第二步：形象升級 — 從外在到內在，讓朋友圈看到你的蛻變\n第三步：製造巧遇 — 出現在對方會出現的場合，但保持從容\n第四步：以退為進 — 讓對方主動靠近你`,
    `第一步：寫下覆盤（3天）— 列出你做錯了什麼、對方需要什麼\n第二步：精準改變 — 針對問題做出看得見的具體行動\n第三步：低壓回歸 — 用不帶期待的口吻重新聯繫\n第四步：重建信任 — 用一致性證明你的改變不是演的`,
    `第一步：社群靜默（2週）— 不發任何與感情有關的動態\n第二步：高價值展現 — 發布你在學新技能、去新地方的照片\n第三步：觸發好奇 — 在共同朋友圈留下「你最近變了很多」的印象\n第四步：等待邀請 — 當對方主動聯繫時，用平常心回應`,
    `第一步：物品歸還（1週內）— 用歸還物品作為最後一次自然見面的理由\n第二步：留下好印象 — 見面時表現從容、不提復合\n第三步：種下種子 — 臨走說一句「以後如果需要，我都在」\n第四步：完全放手 — 不再主動聯繫，讓種子自己發芽`,
    `第一步：找回自己（2-3週）— 回到分手前你最有魅力的狀態\n第二步：共同記憶觸發 — 去你們常去的地方打卡，不標記對方\n第三步：輕觸底線 — 傳一張你們都會笑的舊照片，配一句「整理照片翻到的」\n第四步：順水推舟 — 如果對方有回應，慢慢把節奏拉起來`,
    `第一步：心態歸零（1週）— 接受分手是事實，不再幻想對方會主動回來\n第二步：人生重啟 — 報名一個課程、開始一個新嗜好、認識新朋友\n第三步：不經意展現 — 讓改變自然地被對方的社交圈發現\n第四步：最後一搏 — 在最好的狀態下約對方喝一杯咖啡，只聊近況不談過去`,
    `第一步：深度反省（3-5天）— 不只是道歉，是真正理解「為什麼你的道歉對方不接受」\n第二步：行為證明（2-4週）— 在對方不知道的情況下改變，讓朋友作為見證\n第三步：橋樑建立 — 透過共同朋友傳遞「你最近真的不一樣了」的訊息\n第四步：水到渠成 — 等對方好奇到主動探聽你的近況時，自然地重新連結`,
    `第一步：數位斷捨離（立即）— 取消追蹤但不封鎖，展現成熟而非報復\n第二步：現實世界升級（1個月）— 健身、閱讀、旅行，三管齊下\n第三步：策略性回歸 — 在某個重要日子（非紀念日）發一則有質感的動態\n第四步：軟著陸 — 如果對方有互動，以朋友的方式重新開始`,
    `第一步：寫一封不寄出的信（今天）— 把所有情緒傾倒在紙上，然後封存\n第二步：21天挑戰 — 每天做一件讓自己變更好的事，記錄下來\n第三步：重新定義 — 想清楚你要的是「對方回來」還是「一段更好的關係」\n第四步：帶著答案出發 — 如果答案是後者，你已經準備好了`,
  ]

  // 對方心理深度分析（根據星座）
  const partnerPsychology = {
    '牡羊座': `${partnerName}（牡羊座）內心其實比外表更脆弱。看似灑脫的離開，其實是因為累積的委屈到了臨界點。牡羊座最怕的不是吵架，而是感覺自己不被重視。如果你能讓${partnerName}感受到「你真的懂了」，復合的可能性極高。`,
    '金牛座': `${partnerName}（金牛座）是十二星座中最念舊的。即使分手了，金牛座會反覆回想你們在一起的每個細節。${partnerName}現在的沉默不是不在乎，而是在內心掙扎。金牛座需要安全感，你必須用穩定的行動而非甜言蜜語來打動對方。`,
    '雙子座': `${partnerName}（雙子座）表面看起來已經放下，甚至可能馬上出現新的社交動態。但這只是雙子座的防禦機制。${partnerName}內心其實非常矛盾，一部分想聯繫你，另一部分在害怕受傷。給一個有趣的理由讓對方回覆你，是突破口。`,
    '巨蟹座': `${partnerName}（巨蟹座）分手後會把自己縮回殼裡。巨蟹座是最重感情的星座，${partnerName}此刻的冷漠只是保護自己的方式。巨蟹座最軟的地方是「家」的感覺——提起你們共同的美好回憶，會觸動對方最深的情感。`,
    '獅子座': `${partnerName}（獅子座）即使心裡很想你，自尊心也不允許主動聯繫。獅子座分手後最在意的是面子，${partnerName}需要一個「台階」才能回頭。你需要做的是讓對方覺得復合是雙方的選擇，而不是對方在「低頭」。`,
    '處女座': `${partnerName}（處女座）分手後會不斷分析這段關係的每個問題。處女座是完美主義者，${partnerName}可能正在列一張「你的缺點清單」。但反過來說，如果你能展現出針對性的改變，處女座會是最容易被說服的星座。`,
    '天秤座': `${partnerName}（天秤座）是最猶豫不決的星座。分手的決定可能讓${partnerName}反覆煎熬。天秤座害怕衝突，更害怕後悔。如果你能以優雅而不施壓的方式出現，天秤座很容易重新被吸引。`,
    '天蠍座': `${partnerName}（天蠍座）表面冷漠，內心翻江倒海。天蠍座是最深情的星座，一旦愛過就很難真正放下。但天蠍座也是最記仇的——你必須真正理解問題出在哪裡，並展現徹底的改變。半吊子的道歉只會讓情況更糟。`,
    '射手座': `${partnerName}（射手座）分手後可能立刻去旅行或嘗試新事物，看起來毫不在乎。但射手座只是在用「忙碌」來麻痺自己。${partnerName}最怕束縛，你需要展現出「我變得更有趣了」而不是「我離不開你」。`,
    '摩羯座': `${partnerName}（摩羯座）做決定前會深思熟慮，分手通常不是衝動之舉。這意味著你需要付出更多努力。但摩羯座也最看重一個人的上進心和實際行動——如果你能展現出事業或生活上的具體進步，${partnerName}會重新評估你的價值。`,
    '水瓶座': `${partnerName}（水瓶座）是最理性的星座，分手後會試圖用邏輯說服自己這是對的。但水瓶座也最重視靈魂上的連結——如果你能在思想層面給${partnerName}帶來新的刺激和共鳴，這會比任何浪漫舉動都有效。`,
    '雙魚座': `${partnerName}（雙魚座）是最容易心軟的星座。分手後${partnerName}一定會偷偷看你的社群動態，甚至可能在深夜偷偷哭泣。雙魚座渴望浪漫的愛情故事，你需要營造一個「命中注定」的重逢氛圍，讓對方相信這段感情值得再給一次機會。`,
  }

  // 緣分等級判定
  const reconciliationScore = luckScores.reconciliation
  let destinyLevel, destinyDesc
  if (reconciliationScore >= 85) {
    destinyLevel = '命中註定'
    destinyDesc = `${myName}與${partnerName}的命盤顯示極高的緣分指數。你們之間的連結遠超一般情侶，這段感情的能量場非常強烈。分離只是暫時的考驗，宇宙正在為你們的重逢做準備。`
  } else if (reconciliationScore >= 70) {
    destinyLevel = '緣分深厚'
    destinyDesc = `${myName}與${partnerName}之間有著深厚的緣分基礎。五行${myElement}與${partnerElement}的組合具備修復的潛力，只要方法正確，這段感情是可以重新點燃的。`
  } else if (reconciliationScore >= 55) {
    destinyLevel = '需要經營'
    destinyDesc = `${myName}與${partnerName}的命盤配對屬於需要用心經營的類型。挑戰存在，但並非不可克服。關鍵在於雙方都需要做出改變，尤其是溝通方式的調整。`
  } else {
    destinyLevel = '逆勢挽回'
    destinyDesc = `${myName}與${partnerName}的組合需要更大的努力。但命理學告訴我們，越是困難的配對，一旦克服障礙，反而能建立最堅固的關係。不要放棄，但策略必須正確。`
  }

  const luckyColors = ['粉紅色', '薰衣草紫', '天空藍', '珊瑚橘', '翡翠綠', '暖白色', '玫瑰金', '霧灰藍', '焦糖棕', '蜜桃粉']
  const luckyDirections = ['東方', '南方', '西方', '北方', '東南', '西北', '東北', '西南']
  const luckyFlowers = ['玫瑰', '百合', '滿天星', '繡球花', '鬱金香', '桃花', '薰衣草', '向日葵', '茉莉', '牡丹']
  const luckyDays = ['星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日']
  const luckyItems = {
    color: luckyColors[Math.floor(rng() * luckyColors.length)],
    number: Math.floor(rng() * 9) + 1,
    direction: luckyDirections[Math.floor(rng() * luckyDirections.length)],
    flower: luckyFlowers[Math.floor(rng() * luckyFlowers.length)],
    day: luckyDays[Math.floor(rng() * luckyDays.length)],
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
    destinyLevel,
    destinyDesc,
    partnerPsychology: partnerPsychology[partnerConstellation] || `${partnerName}的星座配置顯示對方內心仍有牽掛，但需要看到你真正的改變。`,
    reconciliationAdvice: reconciliationAdvice[Math.floor(rng() * reconciliationAdvice.length)],
    communicationAdvice: communicationAdvice[Math.floor(rng() * communicationAdvice.length)],
    timingAdvice: timingAdvice[Math.floor(rng() * timingAdvice.length)],
    actionPlan: actionPlan[Math.floor(rng() * actionPlan.length)],
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

    try {
      const checkoutRes = await fetch(`${LETMEUSE_BASE_URL}/api/billing/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appId: LETMEUSE_APP_ID,
          appSecret: LETMEUSE_APP_SECRET,
          mode: 'one_time',
          productId: 'report_unlock',
          productName: '挽回指數完整報告',
          amount: 1500,
          currency: 'TWD',
          metadata: { orderId: body.orderId, type: 'report' },
          successUrl: `${CANWEBACK_BASE_URL}/checkout-success.html?orderId=${body.orderId}&type=report`,
          cancelUrl: `${CANWEBACK_BASE_URL}/`,
        }),
      })
      const result = await checkoutRes.json()

      if (result.success) {
        return sendJson(res, {
          success: true,
          checkoutUrl: `${LETMEUSE_BASE_URL}${result.data.checkoutUrl}`,
        })
      }
      return sendJson(res, { error: result.error || '建立結帳失敗' }, 500)
    } catch (err) {
      return sendJson(res, { error: '無法連線付款服務' }, 502)
    }
  }

  if (pathname === '/api/buy-plan' && req.method === 'POST') {
    const body = await parseBody(req)
    const order = orders.get(body.orderId)
    if (!order) return sendJson(res, { error: '找不到此訂單' }, 404)

    try {
      const checkoutRes = await fetch(`${LETMEUSE_BASE_URL}/api/billing/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appId: LETMEUSE_APP_ID,
          appSecret: LETMEUSE_APP_SECRET,
          mode: 'one_time',
          productId: 'recovery_plan',
          productName: '挽回改造計畫',
          amount: 2680,
          currency: 'TWD',
          metadata: { orderId: body.orderId, type: 'plan' },
          successUrl: `${CANWEBACK_BASE_URL}/checkout-success.html?orderId=${body.orderId}&type=plan`,
          cancelUrl: `${CANWEBACK_BASE_URL}/`,
        }),
      })
      const result = await checkoutRes.json()

      if (result.success) {
        return sendJson(res, {
          success: true,
          checkoutUrl: `${LETMEUSE_BASE_URL}${result.data.checkoutUrl}`,
        })
      }
      return sendJson(res, { error: result.error || '建立結帳失敗' }, 500)
    } catch (err) {
      return sendJson(res, { error: '無法連線付款服務' }, 502)
    }
  }

  if (pathname === '/api/plan' && req.method === 'GET') {
    const orderId = url.searchParams.get('id')
    const order = orders.get(orderId)
    if (!order) return sendJson(res, { error: '找不到此訂單' }, 404)
    if (!order.planPurchased) return sendJson(res, { error: '請先購買改造計畫' }, 402)
    return sendJson(res, { fortune: order.fortune })
  }

  // Called by LetMeUse webhook or by checkout-success page to confirm payment
  if (pathname === '/api/webhook/payment' && req.method === 'POST') {
    const body = await parseBody(req)
    const orderId = body.orderId || (body.metadata && body.metadata.orderId)
    const type = body.type || (body.metadata && body.metadata.type)
    const order = orders.get(orderId)
    if (order) {
      if (type === 'plan') {
        order.planPurchased = true
      } else {
        order.paid = true
      }
    }
    return sendJson(res, { received: true })
  }

  // Email collection — gate before paywall
  if (pathname === '/api/collect-email' && req.method === 'POST') {
    const body = await parseBody(req)
    const email = (body.email || '').trim().toLowerCase()
    if (!email || !email.includes('@')) {
      return sendJson(res, { error: '請輸入有效的 email' }, 400)
    }

    const order = orders.get(body.orderId)
    if (order) {
      order.email = email
    }

    saveEmail({
      email,
      orderId: body.orderId || null,
      source: body.source || 'paywall_gate',
      myName: body.myName || null,
      partnerName: body.partnerName || null,
      createdAt: new Date().toISOString(),
    })

    // Also forward to LetMeUse if available
    try {
      fetch(`${LETMEUSE_BASE_URL}/api/collect/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appId: LETMEUSE_APP_ID,
          appSecret: LETMEUSE_APP_SECRET,
          email,
          metadata: { source: 'canweback', orderId: body.orderId },
        }),
      }).catch(() => {})
    } catch {}

    return sendJson(res, { success: true })
  }

  // Pay to unlock all cards (宇宙的一句話)
  if (pathname === '/api/pay-cards' && req.method === 'POST') {
    try {
      const checkoutRes = await fetch(`${LETMEUSE_BASE_URL}/api/billing/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appId: LETMEUSE_APP_ID,
          appSecret: LETMEUSE_APP_SECRET,
          mode: 'one_time',
          productId: 'cards_unlock',
          productName: '宇宙的一句話 — 全部解鎖',
          amount: 200,
          currency: 'TWD',
          metadata: { type: 'cards' },
          successUrl: `${CANWEBACK_BASE_URL}/cards.html?unlocked=1`,
          cancelUrl: `${CANWEBACK_BASE_URL}/cards.html`,
        }),
      })
      const result = await checkoutRes.json()
      if (result.success) {
        return sendJson(res, { success: true, checkoutUrl: `${LETMEUSE_BASE_URL}${result.data.checkoutUrl}` })
      }
      return sendJson(res, { success: true })
    } catch {
      return sendJson(res, { success: true })
    }
  }

  // ── Letter API（沒說出口的那封信）──────────────────

  // Create a letter
  if (pathname === '/api/letter' && req.method === 'POST') {
    const body = await parseBody(req)
    const senderName = (body.senderName || '').trim()
    const receiverName = (body.receiverName || '').trim()
    const receiverBirthday = (body.receiverBirthday || '').replace(/\D/g, '')
    const content = (body.content || '').trim()

    if (!senderName || !receiverName || !receiverBirthday || !content) {
      return sendJson(res, { error: '請填寫完整' }, 400)
    }
    if (content.length > 500) {
      return sendJson(res, { error: '內容超過 500 字' }, 400)
    }

    const letter = {
      id: crypto.randomUUID(),
      senderName,
      receiverName,
      receiverBirthday,
      content,
      unlocked: false,
      createdAt: new Date().toISOString(),
    }
    saveLetter(letter)
    return sendJson(res, { letterId: letter.id })
  }

  // Search letters by receiver name + birthday
  if (pathname === '/api/letter/search' && req.method === 'GET') {
    const name = (url.searchParams.get('name') || '').trim()
    const birthday = (url.searchParams.get('birthday') || '').replace(/\D/g, '')
    if (!name || !birthday) return sendJson(res, { error: '請輸入姓名和生日' }, 400)

    const letters = loadLetters()
    const found = letters
      .filter(l => l.receiverName === name && l.receiverBirthday === birthday)
      .map(l => ({
        id: l.id,
        senderName: l.senderName,
        unlocked: l.unlocked,
        content: l.unlocked ? l.content : undefined,
        createdAt: l.createdAt,
      }))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))

    return sendJson(res, { letters: found })
  }

  // Pay to unlock a letter (NT$99)
  if (pathname.match(/^\/api\/letter\/[^/]+\/pay$/) && req.method === 'POST') {
    const letterId = pathname.split('/')[3]
    const letters = loadLetters()
    const letter = letters.find(l => l.id === letterId)
    if (!letter) return sendJson(res, { error: '找不到這封信' }, 404)
    if (letter.unlocked) return sendJson(res, { success: true })

    try {
      const checkoutRes = await fetch(`${LETMEUSE_BASE_URL}/api/billing/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appId: LETMEUSE_APP_ID,
          appSecret: LETMEUSE_APP_SECRET,
          mode: 'one_time',
          productId: 'letter_unlock',
          productName: '沒說出口的那封信 — 解鎖',
          amount: 500,
          currency: 'TWD',
          metadata: { letterId, type: 'letter' },
          successUrl: `${CANWEBACK_BASE_URL}/letter.html?paid=1`,
          cancelUrl: `${CANWEBACK_BASE_URL}/letter.html`,
        }),
      })
      const result = await checkoutRes.json()

      if (result.success) {
        return sendJson(res, {
          success: true,
          checkoutUrl: `${LETMEUSE_BASE_URL}${result.data.checkoutUrl}`,
        })
      }
      // Fallback: unlock directly in dev
      updateLetter(letterId, { unlocked: true })
      return sendJson(res, { success: true })
    } catch {
      // Dev mode: unlock directly
      updateLetter(letterId, { unlocked: true })
      return sendJson(res, { success: true })
    }
  }

  // Webhook callback for letter unlock payment
  if (pathname === '/api/webhook/letter' && req.method === 'POST') {
    const body = await parseBody(req)
    const letterId = body.letterId || (body.metadata && body.metadata.letterId)
    if (letterId) {
      updateLetter(letterId, { unlocked: true })
    }
    return sendJson(res, { received: true })
  }

  // Called by checkout-success page to mark order as paid
  if (pathname === '/api/confirm-payment' && req.method === 'POST') {
    const body = await parseBody(req)
    const order = orders.get(body.orderId)
    if (!order) return sendJson(res, { error: '找不到此訂單' }, 404)

    if (body.type === 'plan') {
      order.planPurchased = true
    } else {
      order.paid = true
    }
    return sendJson(res, { success: true })
  }

  // Static files
  serveStatic(res, pathname)
})

server.listen(PORT, () => {
  console.log(`canweback running on port ${PORT}`)
})
