import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ======= CONFIG =======
// Set to your Supabase project. Use the PUBLIC anon key here (NOT the JWT secret).
const SUPABASE_URL = 'https://dblrnumdkptatkltvtta.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im14Ynd4cHZtZHFwaG1penhjbGdkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgzMDAyNTMsImV4cCI6MjA3Mzg3NjI1M30.TJadYWUYZooUeozS6m6TPIumC7yfHORJ7SWrhpoqbCU'   // Public; keep RLS strict.
const WORKSHOP_CODE_NAME = 'default'        // Label of the code to check against in DB

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// ======= DOM =======
const authSection = document.getElementById('auth-section')
const gateSection = document.getElementById('gate-section')
const quizSection = document.getElementById('quiz-section')
const resultSection = document.getElementById('result-section')

const emailEl = document.getElementById('email')
const pwdEl = document.getElementById('password')
const codeEl = document.getElementById('access-code')
const authBtn = document.getElementById('auth-btn')
const authMsg = document.getElementById('auth-msg')
const userInfo = document.getElementById('user-info')

const startBtn = document.getElementById('start-btn')

const progressEl = document.getElementById('progress')
const questionArea = document.getElementById('question-area')
const prevBtn = document.getElementById('prev-btn')
const nextBtn = document.getElementById('next-btn')

const scoreline = document.getElementById('scoreline')
const review = document.getElementById('review')
const logoutBtn = document.getElementById('logout-btn')

// ======= STATE =======
let session = null
let user = null
let questions = []
let idx = 0
let answers = {}      // qid -> option index
let responseId = null
let attempted = false

// ======= HELPERS =======
function show(el) { el.classList.remove('hidden') }
function hide(el) { el.classList.add('hidden') }

function setUserBadge() {
  if (session) {
    userInfo.innerHTML = `<div class="pill">Logged in: ${session.user.email}</div>`
  } else {
    userInfo.innerHTML = ''
  }
}

async function ensureProfile() {
  // Ensure a profiles row exists
  const { data: existing } = await supabase.from('profiles').select('id').eq('id', user.id).maybeSingle()
  if (!existing) {
    await supabase.from('profiles').insert({ id: user.id, email: user.email })
  }
}

async function checkAccessCode(code) {
  // Validate code from DB (table: access_codes)
  const { data, error } = await supabase.from('access_codes')
    .select('code, is_active, name')
    .eq('name', WORKSHOP_CODE_NAME)
    .maybeSingle()
  if (error) throw error
  if (!data || !data.is_active) return false
  return code.trim() === data.code
}

async function fetchQuestions() {
  const res = await fetch('questions.json')
  questions = await res.json()
}

function renderQuestion() {
  const q = questions[idx]
  progressEl.textContent = `Question ${idx+1} of ${questions.length}`
  let html = `<div class="qcard">
    <div class="qtext">${q.q}</div>
    <div class="options">`
  q.options.forEach((opt, i) => {
    const checked = answers[q.id] === i ? 'checked' : ''
    html += `<label class="opt">
      <input type="radio" name="opt" value="${i}" ${checked}/> ${opt}
    </label>`
  })
  html += `</div></div>`
  questionArea.innerHTML = html
}

function getScore() {
  let s = 0
  for (const q of questions) {
    if (answers[q.id] === q.answer) s += 1
  }
  return s
}

async function alreadyAttempted() {
  const { data, error } = await supabase
    .from('responses')
    .select('id')
    .eq('user_id', user.id)
    .eq('quiz', 'trial_ai_llm_v1')
    .maybeSingle()
  if (error) return false
  if (data) { responseId = data.id; return true }
  return false
}

async function saveStart() {
  const { data, error } = await supabase
    .from('responses')
    .insert({ user_id: user.id, quiz: 'trial_ai_llm_v1', started_at: new Date().toISOString() })
    .select('id')
    .single()
  if (error) throw error
  responseId = data.id
}

async function saveAnswer(qid, valueIndex) {
  if (!responseId) return
  await supabase.from('answers').upsert({
    response_id: responseId,
    question_id: qid,
    value: { option: valueIndex }
  }, { onConflict: 'response_id,question_id' })
}

async function saveFinish() {
  const score = getScore()
  await supabase.from('responses').update({
    finished_at: new Date().toISOString(),
    score: score
  }).eq('id', responseId)
  return score
}

function renderReview() {
  let html = ''
  questions.forEach((q, i) => {
    const sel = answers[q.id]
    const correct = q.answer
    const ok = sel === correct
    html += `<div class="rev ${ok ? 'ok' : 'bad'}">
      <div><strong>Q${i+1}.</strong> ${q.q}</div>
      <div>Your answer: ${sel != null ? q.options[sel] : '<em>no answer</em>'}</div>
      <div>Correct: ${q.options[correct]}</div>
    </div>`
  })
  review.innerHTML = html
}

// ======= AUTH FLOW =======
async function init() {
  const sres = await supabase.auth.getSession()
  session = sres.data.session
  user = session?.user || null
  setUserBadge()

  if (user) {
    await ensureProfile()
    const attempt = await alreadyAttempted()
    if (attempt) {
      hide(authSection); hide(gateSection); hide(quizSection); show(resultSection)
      scoreline.textContent = 'You already attempted this test. Your results are below.'
      // fetch answers summary for user
      const { data: rows } = await supabase
        .from('answers')
        .select('question_id, value')
        .eq('response_id', responseId)
      if (rows) {
        rows.forEach(r => answers[r.question_id] = r.value?.option)
      }
      await fetchQuestions()
      renderReview()
      return
    } else {
      hide(authSection); show(gateSection)
    }
  }
}
init()

authBtn.addEventListener('click', async () => {
  authMsg.textContent = ''
  const email = emailEl.value.trim()
  const password = pwdEl.value
  const code = codeEl.value.trim()
  if (!email || !password || !code) {
    authMsg.textContent = 'Email, password, and access code are required.'
    return
  }
  try {
    const ok = await checkAccessCode(code)
    if (!ok) {
      authMsg.textContent = 'Invalid or inactive access code.'
      return
    }
    // try sign-in
    let { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      // try sign-up (no email confirmation if disabled in Supabase Auth settings)
      const reg = await supabase.auth.signUp({ email, password })
      if (reg.error) throw reg.error
      data = reg.data
    }
    session = (await supabase.auth.getSession()).data.session
    user = session.user
    setUserBadge()
    await ensureProfile()
    hide(authSection); show(gateSection)
  } catch (e) {
    authMsg.textContent = e.message || 'Login failed.'
  }
})

startBtn.addEventListener('click', async () => {
  await fetchQuestions()
  await saveStart()
  idx = 0
  answers = {}
  renderQuestion()
  hide(gateSection); show(quizSection)
})

prevBtn.addEventListener('click', () => {
  const sel = document.querySelector('input[name="opt"]:checked')
  if (sel) {
    answers[questions[idx].id] = Number(sel.value)
    saveAnswer(questions[idx].id, Number(sel.value))
  }
  if (idx > 0) { idx -= 1; renderQuestion() }
})

nextBtn.addEventListener('click', async () => {
  const sel = document.querySelector('input[name="opt"]:checked')
  if (sel) {
    answers[questions[idx].id] = Number(sel.value)
    await saveAnswer(questions[idx].id, Number(sel.value))
  }
  if (idx < questions.length - 1) {
    idx += 1; renderQuestion()
  } else {
    const score = await saveFinish()
    scoreline.textContent = `You scored ${score} / ${questions.length}.`
    renderReview()
    hide(quizSection); show(resultSection)
  }
})

logoutBtn.addEventListener('click', async () => {
  await supabase.auth.signOut()
  location.reload()
})
